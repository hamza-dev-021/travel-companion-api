import { ErrorResponse } from '../utils/errorResponse.js';
import asyncHandler from '../middleware/async.js';
import mongoose from 'mongoose';
import Booking from '../models/Booking.js';
import Room from '../models/Room.js';
import User from '../models/User.js';
import HotelVerification from '../models/HotelVerification.js';
import { sendNotificationToUser } from './notificationController.js';
import { syncBookingStatuses } from '../utils/bookingAutomation.js';

// @desc    Get all bookings
// @route   GET /api/v1/bookings
// @route   GET /api/v1/rooms/:roomId/bookings
// @access  Private
export const getBookings = asyncHandler(async (req, res, next) => {
  if (req.params.roomId) {
    const bookings = await Booking.find({ room: req.params.roomId })
      .populate({
        path: 'room',
        select: 'roomNumber roomType'
      })
      .populate({
        path: 'user',
        select: 'name email'
      })
      .populate({
        path: 'hotel',
        select: 'name address.city address.province'
      });

    return res.status(200).json({
      success: true,
      count: bookings.length,
      data: bookings
    });
  } else if (req.user.role === 'admin') {
    res.status(200).json(res.advancedResults);
  } else {
    // Regular users can only see their own bookings
    // Lazy Sync: Update statuses for this user before returning
    await syncBookingStatuses({ user: req.user.id });

    const bookings = await Booking.find({ user: req.user.id })
      .populate({
        path: 'room',
        select: 'roomNumber roomType pricePerNight'
      })
      .populate({
        path: 'hotel',
        select: 'name address.city address.province'
      });

    res.status(200).json({
      success: true,
      count: bookings.length,
      data: bookings
    });
  }
});

// @desc    Get single booking
// @route   GET /api/v1/bookings/:id
// @access  Private
export const getBooking = asyncHandler(async (req, res, next) => {
  const booking = await Booking.findById(req.params.id)
    .populate({
      path: 'room',
      select: 'roomNumber roomType pricePerNight'
    })
    .populate({
      path: 'user',
      select: 'name email phone'
    })
    .populate({
      path: 'hotel',
      select: 'name address.city address.province'
    });

  if (!booking) {
    return next(
      new ErrorResponse(`No booking found with the id of ${req.params.id}`, 404)
    );
  }

  // Make sure user is booking owner or admin
  if (booking.user._id.toString() !== req.user.id && req.user.role !== 'admin') {
    return next(
      new ErrorResponse(
        `User ${req.user.id} is not authorized to view this booking`,
        401
      )
    );
  }

  res.status(200).json({
    success: true,
    data: booking
  });
});

// @desc    Update booking
// @route   PUT /api/v1/bookings/:id
// @access  Private
export const updateBooking = asyncHandler(async (req, res, next) => {
  let booking = await Booking.findById(req.params.id);

  if (!booking) {
    return next(
      new ErrorResponse(`No booking with the id of ${req.params.id}`, 404)
    );
  }

  // Make sure user is booking owner or admin
  if (booking.user.toString() !== req.user.id && req.user.role !== 'admin') {
    return next(
      new ErrorResponse(
        `User ${req.user.id} is not authorized to update this booking`,
        401
      )
    );
  }

  // Load room once for capacity checks, overlap checks, and price recalculation
  const room = await Room.findById(booking.room);
  if (!room) {
    return next(new ErrorResponse(`No room with the id of ${booking.room}`, 404));
  }

  // Determine the effective dates after update (use body if provided, otherwise existing booking values)
  const hasDateUpdate = req.body.checkInDate || req.body.checkOutDate;
  const effectiveCheckIn = hasDateUpdate
    ? new Date(req.body.checkInDate || booking.checkInDate)
    : new Date(booking.checkInDate);
  const effectiveCheckOut = hasDateUpdate
    ? new Date(req.body.checkOutDate || booking.checkOutDate)
    : new Date(booking.checkOutDate);

  // If dates are being changed, validate them similar to createBooking
  if (hasDateUpdate) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (effectiveCheckIn < today) {
      return next(new ErrorResponse('Check-in date cannot be in the past', 400));
    }

    if (effectiveCheckOut <= effectiveCheckIn) {
      return next(new ErrorResponse('Check-out date must be after check-in date', 400));
    }

    // Check for booking conflicts (date overlap) with other active bookings on the same room
    const existingBookings = await Booking.find({
      room: booking.room,
      _id: { $ne: booking._id },
      status: { $in: ['confirmed', 'checked-in'] },
      $or: [
        {
          checkInDate: { $lt: effectiveCheckOut },
          checkOutDate: { $gt: effectiveCheckIn }
        }
      ]
    });

    if (existingBookings.length > 0) {
      return next(
        new ErrorResponse(
          `Room ${room.roomNumber} is already booked for the selected dates`,
          400
        )
      );
    }
  }

  // If numberOfGuests is being changed, enforce room capacity
  if (req.body.numberOfGuests !== undefined) {
    if (req.body.numberOfGuests > room.maxGuests) {
      return next(
        new ErrorResponse(`Room can only accommodate ${room.maxGuests} guests`, 400)
      );
    }
  }

  // If dates or guest count change, recalculate totalPrice based on room.pricePerNight
  const hasGuestUpdate = req.body.numberOfGuests !== undefined;
  if (hasDateUpdate || hasGuestUpdate) {
    const finalCheckIn = effectiveCheckIn;
    const finalCheckOut = effectiveCheckOut;
    const finalGuests = hasGuestUpdate ? req.body.numberOfGuests : booking.numberOfGuests;

    const nights = Math.ceil(
      (finalCheckOut - finalCheckIn) / (1000 * 60 * 60 * 24)
    );

    req.body.totalPrice = room.pricePerNight * nights;
    req.body.numberOfGuests = finalGuests;
  }

  // Update booking
  await Booking.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true
  });

  // Re-fetch with populated relations for frontend convenience
  booking = await Booking.findById(req.params.id)
    .populate({
      path: 'room',
      select: 'roomNumber roomType pricePerNight maxGuests'
    })
    .populate({
      path: 'hotel',
      select: 'name address.city address.province'
    });

  res.status(200).json({
    success: true,
    data: booking
  });
});

// @desc    Create new booking
// @route   POST /api/v1/rooms/:roomId/bookings
// @access  Private
export const createBooking = asyncHandler(async (req, res, next) => {
  const { checkInDate, checkOutDate, numberOfGuests, specialRequests, guestDetails } = req.body;

  // Validate required fields
  if (!checkInDate || !checkOutDate || !numberOfGuests) {
    return next(new ErrorResponse('Please provide check-in date, check-out date, and number of guests', 400));
  }

  // Validate numberOfGuests is a positive integer
  const guestCount = parseInt(numberOfGuests, 10);
  if (!Number.isInteger(guestCount) || guestCount < 1 || guestCount > 20) {
    return next(new ErrorResponse('Number of guests must be between 1 and 20', 400));
  }

  if (!guestDetails || !guestDetails.firstName || !guestDetails.lastName || !guestDetails.email) {
    return next(new ErrorResponse('Please provide complete guest details (firstName, lastName, email)', 400));
  }

  // Validate dates
  const checkIn = new Date(checkInDate);
  const checkOut = new Date(checkOutDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0); // Reset time to start of day

  if (checkIn < today) {
    return next(new ErrorResponse('Check-in date cannot be in the past', 400));
  }

  if (checkOut <= checkIn) {
    return next(new ErrorResponse('Check-out date must be after check-in date', 400));
  }

  // Find room in database - use req.params.roomId instead of req.params.id
  const roomId = req.params.roomId || req.params.id;
  const room = await Room.findById(roomId);

  if (!room) {
    return next(new ErrorResponse(`No room with the id of ${roomId}`, 404));
  }

  const pendingBookingExists = await Booking.exists({
    room: roomId,
    user: req.user.id,
    status: 'pending',
  });

  if (pendingBookingExists) {
    return next(new ErrorResponse('You already have a pending booking request for this room. Please wait for a response.', 400));
  }

  // Check for booking conflicts (date overlap)
  const existingBookings = await Booking.find({
    room: roomId,
    status: { $in: ['confirmed', 'checked-in'] },
    $or: [
      {
        checkInDate: { $lt: checkOut },
        checkOutDate: { $gt: checkIn }
      }
    ]
  });

  if (existingBookings.length > 0) {
    return next(new ErrorResponse(`Room ${room.roomNumber} is already booked for the selected dates`, 400));
  }

  // Check guest capacity
  if (numberOfGuests > room.maxGuests) {
    return next(new ErrorResponse(`Room can only accommodate ${room.maxGuests} guests`, 400));
  }

  // Calculate total price
  const nights = Math.ceil((checkOut - checkIn) / (1000 * 60 * 60 * 24));
  if (nights < 1) {
    return next(new ErrorResponse('Booking must be for at least 1 night', 400));
  }
  const totalPrice = room.pricePerNight * nights;
  if (totalPrice <= 0) {
    return next(new ErrorResponse('Invalid price calculation', 400));
  }

  // Generate booking reference
  const timestamp = Date.now().toString().slice(-6);
  const random = Math.random().toString(36).substring(2, 5).toUpperCase();
  const bookingReference = `BK${timestamp}${random}`;

  // Create booking data
  const bookingData = {
    room: roomId,
    hotel: room.hotel,
    user: req.user.id,
    checkInDate,
    checkOutDate,
    numberOfGuests,
    totalPrice,
    specialRequests,
    guestDetails,
    bookingReference,
    status: 'pending',
    paymentStatus: 'pending',
    isPaid: false
  };

  try {
    // Try to create booking in database
    const booking = await Booking.create(bookingData);

    // Notify the provider of the new booking request
    const hotelVerification = await HotelVerification.findById(roomId ? room.hotel : null);
    if (hotelVerification && hotelVerification.userId) {
      await sendNotificationToUser(hotelVerification.userId, {
        sender: req.user.id,
        type: 'BOOKING_REQUEST',
        relatedType: 'BOOKING',
        relatedId: booking._id,
        message: 'requested a new booking'
      });
    } else {
      console.error('Provider Notification Warning: hotelVerification or hotelVerification.userId missing', { roomHotel: room.hotel });
    }

    // Notify all admins of the new booking request
    const admins = await User.find({ role: 'admin' });
    for (const admin of admins) {
      await sendNotificationToUser(admin._id, {
        sender: req.user.id,
        type: 'BOOKING_REQUEST',
        relatedType: 'BOOKING',
        relatedId: booking._id,
        message: `requested a booking for ${hotelVerification?.name || 'a hotel'}`
      });
    }

    res.status(201).json({
      success: true,
      data: booking,
      message: 'Booking created and is pending confirmation from provider'
    });
  } catch (error) {
    console.error('Booking creation error:', error);
    return next(new ErrorResponse(`Failed to create booking: ${error.message}`, 500));
  }
});

// @desc    Get bookings for a specific user
// @route   GET /api/v1/bookings/my-bookings
// @access  Private
export const getBookingsByUser = asyncHandler(async (req, res, next) => {
  // Lazy Sync: Update statuses for this user before returning
  await syncBookingStatuses({ user: req.user.id });

  const bookings = await Booking.find({ user: req.user.id })
    .populate({
      path: 'room',
      select: 'roomNumber roomType pricePerNight'
    })
    .populate({
      path: 'hotel',
      select: 'name address.city address.province'
    });

  res.status(200).json({
    success: true,
    count: bookings.length,
    data: bookings
  });
});

// @desc    Get bookings by room
// @route   GET /api/v1/rooms/:roomId/bookings
// @access  Private/Admin
export const getBookingsByRoom = asyncHandler(async (req, res, next) => {
  const bookings = await Booking.find({ room: req.params.roomId })
    .populate({
      path: 'room',
      select: 'roomNumber roomType'
    })
    .populate({
      path: 'user',
      select: 'name email phone'
    });

  res.status(200).json({
    success: true,
    count: bookings.length,
    data: bookings
  });
});

// @desc    Get current bookings (checked-in)
// @route   GET /api/v1/bookings/current
// @access  Private/Admin
export const getCurrentBookings = asyncHandler(async (req, res, next) => {
  const bookings = await Booking.find({
    status: { $in: ['confirmed', 'checked-in'] },
    checkInDate: { $lte: new Date() },
    checkOutDate: { $gte: new Date() }
  })
    .populate({
      path: 'room',
      select: 'roomNumber roomType'
    })
    .populate({
      path: 'user',
      select: 'name email phone'
    });

  res.status(200).json({
    success: true,
    count: bookings.length,
    data: bookings
  });
});

// @desc    Get upcoming bookings
// @route   GET /api/v1/bookings/upcoming
// @access  Private/Admin
export const getUpcomingBookings = asyncHandler(async (req, res, next) => {
  const bookings = await Booking.find({
    status: 'confirmed',
    checkInDate: { $gt: new Date() }
  })
    .populate({
      path: 'room',
      select: 'roomNumber roomType'
    })
    .populate({
      path: 'user',
      select: 'name email phone'
    });

  res.status(200).json({
    success: true,
    count: bookings.length,
    data: bookings
  });
});

// @desc    Delete booking
// @route   DELETE /api/v1/bookings/:id
// @access  Private/Admin
export const deleteBooking = asyncHandler(async (req, res, next) => {
  const booking = await Booking.findById(req.params.id);

  if (!booking) {
    return next(
      new ErrorResponse(`No booking found with the id of ${req.params.id}`, 404)
    );
  }

  // Make sure user is booking owner or admin
  if (booking.user.toString() !== req.user.id && req.user.role !== 'admin') {
    return next(
      new ErrorResponse(
        `User ${req.user.id} is not authorized to delete this booking`,
        401
      )
    );
  }

  // Update room status back to available when booking is deleted
  await Room.findByIdAndUpdate(booking.room, {
    isAvailable: true,
    status: 'available',
    lastCleaned: new Date()
  });

  await booking.deleteOne();

  res.status(200).json({
    success: true,
    data: {}
  });
});

// @desc    Update booking status
// @route   PUT /api/v1/bookings/:id/status
// @access  Private/Admin
export const updateBookingStatus = asyncHandler(async (req, res, next) => {
  const { status } = req.body;

  if (!status) {
    return next(new ErrorResponse('Please provide status', 400));
  }

  const validStatuses = ['pending', 'confirmed', 'checked-in', 'checked-out', 'cancelled', 'no-show'];
  if (!validStatuses.includes(status)) {
    return next(new ErrorResponse('Invalid status. Must be: pending, confirmed, checked-in, checked-out, cancelled, or no-show', 400));
  }

  const booking = await Booking.findById(req.params.id);
  if (!booking) {
    return next(
      new ErrorResponse(`Booking not found with id of ${req.params.id}`, 404)
    );
  }

  const oldStatus = booking.status;

  // Use a session/transaction to keep booking + room status in sync
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      booking.status = status;

      // Update room status based on booking status
      if (status === 'confirmed' || status === 'checked-in') {
        await Room.findByIdAndUpdate(booking.room, {
          isAvailable: false,
          status: 'occupied'
        }, { session });
      } else if (status === 'checked-out' || status === 'cancelled' || status === 'no-show') {
        await Room.findByIdAndUpdate(booking.room, {
          isAvailable: true,
          status: 'available',
          lastCleaned: new Date()
        }, { session });
      }

      await booking.save({ session });
    });
  } finally {
    await session.endSession();
  }

  // Notify the traveller about the booking status change
  await sendNotificationToUser(booking.user, {
    sender: req.user.id,
    type: 'BOOKING_RESPONSE',
    relatedType: 'BOOKING',
    relatedId: booking._id,
    message: `${status} your booking request`
  });

  // Notify all admins about the booking status change
  const admins = await User.find({ role: 'admin' });
  for (const admin of admins) {
    await sendNotificationToUser(admin._id, {
      sender: req.user.id,
      type: 'BOOKING_RESPONSE',
      relatedType: 'BOOKING',
      relatedId: booking._id,
      message: `${status} a booking request`
    });
  }

  res.status(200).json({
    success: true,
    data: booking,
    message: `Booking status updated from ${oldStatus} to ${status}`
  });
});

// @desc    Get booking statistics
// @route   GET /api/v1/bookings/stats
// @access  Private/Admin
export const getBookingStats = asyncHandler(async (req, res, next) => {
  const stats = await Booking.aggregate([
    {
      $match: {
        checkInDate: {
          $gte: new Date(new Date().setFullYear(new Date().getFullYear() - 1))
        }
      }
    },
    {
      $group: {
        _id: { $month: '$checkInDate' },
        count: { $sum: 1 },
        totalRevenue: { $sum: '$totalPrice' },
        avgPrice: { $avg: '$totalPrice' }
      }
    },
    {
      $addFields: {
        month: '$_id'
      }
    },
    {
      $project: {
        _id: 0
      }
    },
    {
      $sort: { month: 1 }
    }
  ]);

  res.status(200).json({
    success: true,
    data: stats
  });
});

// @desc    Cancel booking (for travellers)
// @route   PATCH /api/v1/bookings/:id/cancel
// @access  Private (Traveller/Admin)
export const cancelBooking = asyncHandler(async (req, res, next) => {
  const booking = await Booking.findById(req.params.id);

  if (!booking) {
    return next(new ErrorResponse(`Booking not found with id of ${req.params.id}`, 404));
  }

  // Make sure user is booking owner or admin
  if (booking.user.toString() !== req.user.id && req.user.role !== 'admin') {
    return next(new ErrorResponse(`User ${req.user.id} is not authorized to cancel this booking`, 401));
  }

  if (booking.status !== 'pending') {
    return next(new ErrorResponse(`You can only cancel pending booking requests`, 400));
  }

  const oldStatus = booking.status;
  booking.status = 'cancelled';
  await booking.save();

  // Notify the provider
  const room = await Room.findById(booking.room);
  if (room && room.hotel) {
    const hotelVerification = await HotelVerification.findById(room.hotel);
    if (hotelVerification && hotelVerification.userId) {
      await sendNotificationToUser(hotelVerification.userId, {
        sender: req.user.id,
        type: 'BOOKING_CANCELLED',
        relatedType: 'BOOKING',
        relatedId: booking._id,
        message: 'cancelled their booking request'
      });
    }
  }

  res.status(200).json({
    success: true,
    data: booking,
    message: `Booking request cancelled successfully`
  });
});

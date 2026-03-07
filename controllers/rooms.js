import Room from '../models/Room.js';
import Hotel from '../models/Hotel.js';
import Booking from '../models/Booking.js';
import { ErrorResponse } from '../utils/errorResponse.js';
import asyncHandler from '../middleware/async.js';

// @desc    Get all rooms
// @route   GET /api/v1/rooms
// @access  Public
export const getRooms = asyncHandler(async (req, res, next) => {
  const { hotel, isAvailable, roomType, minPrice, maxPrice, maxGuests, page = 1, limit = 10, sort } = req.query;

  // Build filters
  const filters = {};
  if (hotel) filters.hotel = hotel;
  if (isAvailable !== undefined) filters.isAvailable = isAvailable === 'true';
  if (roomType) filters.roomType = new RegExp(roomType, 'i');
  if (minPrice) filters.pricePerNight = { $gte: parseInt(minPrice) };
  if (maxPrice) {
    filters.pricePerNight = {
      ...filters.pricePerNight,
      $lte: parseInt(maxPrice)
    };
  }
  if (maxGuests) {
    filters.maxGuests = { $gte: parseInt(maxGuests, 10) };
  }

  // Pagination
  const startIndex = (page - 1) * parseInt(limit);

  // Get total count
  const total = await Room.countDocuments(filters);

  // Determine sort order based on query param (e.g. 'pricePerNight', '-pricePerNight')
  let sortOptions = { createdAt: -1 };
  if (sort && typeof sort === 'string') {
    const sortField = sort.startsWith('-') ? sort.substring(1) : sort;
    const sortDirection = sort.startsWith('-') ? -1 : 1;
    if (sortField) {
      sortOptions = { [sortField]: sortDirection };
    }
  }

  // Get rooms with pagination and sorting
  const rooms = await Room.find(filters)
    .populate('hotel', 'name address.city')
    .skip(startIndex)
    .limit(parseInt(limit))
    .sort(sortOptions);

  res.status(200).json({
    success: true,
    count: total,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total: total,
      pages: Math.ceil(total / limit)
    },
    data: rooms
  });
});

// @desc    Get single room
// @route   GET /api/v1/rooms/:id
// @access  Public
export const getRoom = asyncHandler(async (req, res, next) => {
  const room = await Room.findById(req.params.id).populate('hotel', 'name address.city');

  if (!room) {
    return next(
      new ErrorResponse(`Room not found with id of ${req.params.id}`, 404)
    );
  }

  res.status(200).json({
    success: true,
    data: room
  });
});

// @desc    Get rooms by hotel
// @route   GET /api/v1/hotels/:hotelId/rooms
// @access  Public
export const getRoomsByHotel = asyncHandler(async (req, res, next) => {
  const { hotelId } = req.params;
  const { isAvailable, roomType, minPrice, maxPrice, page = 1, limit = 10 } = req.query;

  // Build filters
  const filters = { hotel: hotelId };
  if (isAvailable !== undefined) filters.isAvailable = isAvailable === 'true';
  if (roomType) filters.roomType = new RegExp(roomType, 'i');
  if (minPrice) filters.pricePerNight = { $gte: parseInt(minPrice) };
  if (maxPrice) {
    filters.pricePerNight = {
      ...filters.pricePerNight,
      $lte: parseInt(maxPrice)
    };
  }

  // Pagination
  const startIndex = (page - 1) * parseInt(limit);

  // Get total count
  const total = await Room.countDocuments(filters);

  // Determine sort order
  let sortOptions = { createdAt: -1 };
  if (req.query.sort && typeof req.query.sort === 'string') {
    const sortField = req.query.sort.startsWith('-') ? req.query.sort.substring(1) : req.query.sort;
    const sortDirection = req.query.sort.startsWith('-') ? -1 : 1;
    sortOptions = { [sortField]: sortDirection };
  }

  // Get rooms with pagination and sorting
  const rooms = await Room.find(filters)
    .populate('hotel', 'name address.city')
    .skip(startIndex)
    .limit(parseInt(limit))
    .sort(sortOptions);

  res.status(200).json({
    success: true,
    count: total,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total: total,
      pages: Math.ceil(total / limit)
    },
    data: rooms
  });
});

// @desc    Check room availability
// @route   GET /api/v1/rooms/:id/availability
// @access  Public
export const checkRoomAvailability = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const { checkInDate, checkOutDate, guests } = req.query;

  const room = await Room.findById(id);

  if (!room) {
    return next(
      new ErrorResponse(`Room not found with id of ${id}`, 404)
    );
  }

  // Check if dates are provided
  if (!checkInDate || !checkOutDate) {
    return next(
      new ErrorResponse('Please provide check-in and check-out dates', 400)
    );
  }

  // Parse dates
  const checkIn = new Date(checkInDate);
  const checkOut = new Date(checkOutDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (checkIn < today) {
    return next(new ErrorResponse('Check-in date cannot be in the past', 400));
  }

  if (checkOut <= checkIn) {
    return next(new ErrorResponse('Check-out date must be after check-in date', 400));
  }

  // Check guest capacity
  const guestCount = guests ? parseInt(guests) : 1;
  const canAccommodate = guestCount <= room.maxGuests;

  // Calculate number of nights
  const nights = Math.ceil((checkOut - checkIn) / (1000 * 60 * 60 * 24));

  // Check for booking conflicts in the requested range
  const conflictingBookings = await Booking.find({
    room: id,
    status: { $in: ['confirmed', 'checked-in'] },
    checkInDate: { $lt: checkOut },
    checkOutDate: { $gt: checkIn }
  });

  const availableForDates = conflictingBookings.length === 0;

  // Calculate total price
  const totalPrice = room.pricePerNight * nights;

  res.status(200).json({
    success: true,
    data: {
      room: {
        _id: room._id,
        roomNumber: room.roomNumber,
        roomType: room.roomType,
        pricePerNight: room.pricePerNight,
        maxGuests: room.maxGuests,
        amenities: room.amenities
      },
      availability: {
        isAvailable: availableForDates && canAccommodate,
        canAccommodate,
        availableForDates
      },
      pricing: {
        pricePerNight: room.pricePerNight,
        nights,
        totalPrice
      },
      dates: {
        checkInDate,
        checkOutDate,
        nights
      }
    }
  });
});

// @desc    Get available rooms for dates
// @route   GET /api/v1/rooms/availability
// @access  Public
export const getAvailableRooms = asyncHandler(async (req, res, next) => {
  const { hotel, checkInDate, checkOutDate, guests, roomType, minPrice, maxPrice, page = 1, limit = 10 } = req.query;

  if (!checkInDate || !checkOutDate) {
    return next(
      new ErrorResponse('Please provide check-in and check-out dates', 400)
    );
  }

  // Build filters
  const filters = {};
  if (hotel) filters.hotel = hotel;
  filters.isAvailable = true;
  filters.status = 'available';
  if (guests) filters.maxGuests = { $gte: parseInt(guests) };
  if (roomType) filters.roomType = new RegExp(roomType, 'i');
  if (minPrice) filters.pricePerNight = { $gte: parseInt(minPrice) };
  if (maxPrice) {
    filters.pricePerNight = {
      ...filters.pricePerNight,
      $lte: parseInt(maxPrice)
    };
  }

  // Get rooms from database
  const rooms = await Room.find(filters).populate('hotel', 'name address.city');

  // Calculate pricing and filter by booking conflicts for each room
  const checkIn = new Date(checkInDate);
  const checkOut = new Date(checkOutDate);
  const nights = Math.ceil((checkOut - checkIn) / (1000 * 60 * 60 * 24));

  const availableRooms = [];
  for (const room of rooms) {
    const conflicting = await Booking.exists({
      room: room._id,
      status: { $in: ['confirmed', 'checked-in'] },
      checkInDate: { $lt: checkOut },
      checkOutDate: { $gt: checkIn }
    });

    if (!conflicting) {
      availableRooms.push(room);
    }
  }

  const roomsWithPricing = availableRooms.map(room => ({
    ...room.toObject(),
    totalPrice: room.pricePerNight * nights,
    nights
  }));

  // Pagination
  const startIndex = (page - 1) * limit;
  const endIndex = page * limit;
  const paginatedRooms = roomsWithPricing.slice(startIndex, endIndex);

  res.status(200).json({
    success: true,
    count: roomsWithPricing.length,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total: roomsWithPricing.length,
      pages: Math.ceil(roomsWithPricing.length / limit)
    },
    data: paginatedRooms,
    searchCriteria: {
      checkInDate,
      checkOutDate,
      guests: guests ? parseInt(guests) : null,
      nights
    }
  });
});

// @desc    Create new room
// @route   POST /api/v1/rooms
// @access  Private/Admin
export const createRoom = asyncHandler(async (req, res, next) => {
  const {
    hotel,
    roomNumber,
    roomType,
    description,
    pricePerNight,
    maxGuests,
    amenities,
    images
  } = req.body;

  // Validate required fields
  if (!hotel || !roomNumber || !roomType || !description || !pricePerNight || !maxGuests) {
    return next(new ErrorResponse('Please provide all required fields', 400));
  }

  // Check if hotel exists
  const hotelExists = await Hotel.findById(hotel);
  if (!hotelExists) {
    return next(new ErrorResponse(`Hotel not found with id of ${hotel}`, 404));
  }

  // Check if room number already exists in the hotel
  const existingRoom = await Room.findOne({ hotel, roomNumber });
  if (existingRoom) {
    return next(new ErrorResponse(`Room number ${roomNumber} already exists in this hotel`, 400));
  }

  const room = await Room.create({
    hotel,
    roomNumber,
    roomType,
    description,
    pricePerNight,
    maxGuests,
    amenities: amenities || [],
    images: images || [],
    isAvailable: true,
    status: 'available'
  });

  res.status(201).json({
    success: true,
    data: room
  });
});

// @desc    Update room
// @route   PUT /api/v1/rooms/:id
// @access  Private/Admin
export const updateRoom = asyncHandler(async (req, res, next) => {
  let room = await Room.findById(req.params.id);

  if (!room) {
    return next(
      new ErrorResponse(`Room not found with id of ${req.params.id}`, 404)
    );
  }

  // If updating room number, check for duplicates
  if (req.body.roomNumber && req.body.roomNumber !== room.roomNumber) {
    const existingRoom = await Room.findOne({
      hotel: room.hotel,
      roomNumber: req.body.roomNumber,
      _id: { $ne: req.params.id }
    });
    if (existingRoom) {
      return next(new ErrorResponse(`Room number ${req.body.roomNumber} already exists in this hotel`, 400));
    }
  }

  // Update room
  room = await Room.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true
  });

  res.status(200).json({
    success: true,
    data: room
  });
});

// @desc    Delete room
// @route   DELETE /api/v1/rooms/:id
// @access  Private/Admin
export const deleteRoom = asyncHandler(async (req, res, next) => {
  const room = await Room.findById(req.params.id);

  if (!room) {
    return next(
      new ErrorResponse(`Room not found with id of ${req.params.id}`, 404)
    );
  }

  // Check if room has active bookings
  const activeBookings = await Booking.countDocuments({
    room: req.params.id,
    status: { $in: ['confirmed', 'checked-in'] }
  });

  if (activeBookings > 0) {
    return next(
      new ErrorResponse(`Cannot delete room with ${activeBookings} active bookings`, 400)
    );
  }

  await room.deleteOne();

  res.status(200).json({
    success: true,
    data: {}
  });
});

// @desc    Update room status
// @route   PUT /api/v1/rooms/:id/status
// @access  Private/Admin
export const updateRoomStatus = asyncHandler(async (req, res, next) => {
  const { status } = req.body;

  if (!status) {
    return next(new ErrorResponse('Please provide status', 400));
  }

  const validStatuses = ['available', 'occupied', 'maintenance', 'cleaning'];
  if (!validStatuses.includes(status)) {
    return next(new ErrorResponse('Invalid status. Must be: available, occupied, maintenance, or cleaning', 400));
  }

  const room = await Room.findById(req.params.id);
  if (!room) {
    return next(
      new ErrorResponse(`Room not found with id of ${req.params.id}`, 404)
    );
  }

  room.status = status;
  room.isAvailable = status === 'available';

  if (status === 'available') {
    room.lastCleaned = new Date();
  }

  await room.save();

  res.status(200).json({
    success: true,
    data: room
  });
});

// @desc    Upload room images
// @route   PUT /api/v1/rooms/:id/images
// @access  Private/Admin
export const uploadRoomImages = asyncHandler(async (req, res, next) => {
  const room = await Room.findById(req.params.id);

  if (!room) {
    return next(
      new ErrorResponse(`Room not found with id of ${req.params.id}`, 404)
    );
  }

  if (!req.files) {
    return next(new ErrorResponse(`Please upload files`, 400));
  }

  const files = Array.isArray(req.files.files) ? req.files.files : [req.files.files];
  const uploadedImages = [];

  for (let file of files) {
    // Make sure the image is a photo
    if (!file.mimetype.startsWith('image')) {
      return next(new ErrorResponse(`Please upload image files only`, 400));
    }

    // Check filesize
    if (file.size > 15 * 1024 * 1024) {
      return next(
        new ErrorResponse(
          `Please upload images less than 15MB`,
          400
        )
      );
    }

    // Create custom filename
    const fileExt = file.name.split('.').pop();
    file.name = `room_${room._id}_${Date.now()}.${fileExt}`;

    file.mv(`./uploads/${file.name}`, async err => {
      if (err) {
        console.error(err);
        return next(new ErrorResponse(`Problem with file upload`, 500));
      }
    });

    uploadedImages.push(`/uploads/${file.name}`);
  }

  // Update room with new images
  room.images = [...room.images, ...uploadedImages];
  await room.save();

  res.status(200).json({
    success: true,
    data: room
  });
});
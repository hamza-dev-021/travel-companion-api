import asyncHandler from '../middleware/async.js';
import HotelVerification from '../models/HotelVerification.js';
import Room from '../models/Room.js';

export const getVerifiedHotels = asyncHandler(async (req, res) => {
  const { city, checkIn, checkOut, guests, page = 1, limit = 24 } = req.query;

  const filters = { status: 'approved' };
  if (city) {
    filters['address.city'] = new RegExp(city, 'i');
  }

  // If checkIn/checkOut/guests are provided, we need to filter by availability
  if (checkIn && checkOut && guests) {
    const startDate = new Date(checkIn);
    const endDate = new Date(checkOut);
    const guestCount = parseInt(guests);

    // 1. Find all bookings that overlap with requested dates
    const Booking = (await import('../models/Booking.js')).default;
    const overlappingBookings = await Booking.find({
      status: { $in: ['confirmed', 'checked-in'] },
      $or: [
        { checkInDate: { $lt: endDate }, checkOutDate: { $gt: startDate } }
      ]
    }).select('room').lean();

    const bookedRoomIds = overlappingBookings.map(b => b.room.toString());

    // 2. Find hotels that have at least one room that is:
    // - Not in bookedRoomIds
    // - Can accommodate guestCount
    const availableRooms = await Room.find({
      _id: { $nin: bookedRoomIds },
      maxGuests: { $gte: guestCount }
    }).select('hotel').lean();

    const availableHotelIds = [...new Set(availableRooms.map(r => r.hotel.toString()))];

    // Add to filters
    filters._id = { $in: availableHotelIds };
  } else if (guests) {
    // If only guests provided, filter hotels having rooms with such capacity
    const guestCount = parseInt(guests);
    const capableRooms = await Room.find({
      maxGuests: { $gte: guestCount }
    }).select('hotel').lean();

    const capableHotelIds = [...new Set(capableRooms.map(r => r.hotel.toString()))];
    filters._id = { $in: capableHotelIds };
  }

  const startIndex = (Number(page) - 1) * Number(limit);

  const [total, hotels] = await Promise.all([
    HotelVerification.countDocuments(filters),
    HotelVerification.find(filters)
      .sort({ createdAt: -1 })
      .skip(startIndex)
      .limit(Number(limit))
      .lean(),
  ]);

  const hotelIds = hotels.map((h) => h._id);

  const minPriceAgg = await Room.aggregate([
    { $match: { hotel: { $in: hotelIds } } },
    { $group: { _id: '$hotel', minPrice: { $min: '$pricePerNight' } } },
  ]);

  const minPriceByHotel = new Map(minPriceAgg.map((r) => [String(r._id), r.minPrice]));

  const data = hotels.map((h) => ({
    ...h,
    priceRange: {
      minPrice: minPriceByHotel.get(String(h._id)) ?? 0,
    },
  }));

  res.status(200).json({
    success: true,
    count: total,
    pagination: {
      page: Number(page),
      limit: Number(limit),
      total,
      pages: Math.ceil(total / Number(limit)),
    },
    data,
  });
});

export const getVerifiedHotel = asyncHandler(async (req, res) => {
  const hotel = await HotelVerification.findOne({ _id: req.params.id, status: 'approved' }).lean();

  if (!hotel) {
    return res.status(404).json({ message: 'Hotel not found' });
  }

  const minPriceAgg = await Room.aggregate([
    { $match: { hotel: hotel._id } },
    { $group: { _id: '$hotel', minPrice: { $min: '$pricePerNight' } } },
  ]);

  const minPrice = minPriceAgg?.[0]?.minPrice ?? 0;

  res.status(200).json({
    success: true,
    data: {
      ...hotel,
      priceRange: { minPrice },
    },
  });
});

import HotelVerification from '../models/HotelVerification.js';
import Room from '../models/Room.js';
import { ErrorResponse } from '../utils/errorResponse.js';
import asyncHandler from '../middleware/async.js';
import crypto from 'crypto';
import path from 'path';

// Allowed sort fields to prevent information disclosure
const ALLOWED_SORT_FIELDS = ['name', 'createdAt', 'starRating', 'averageRating', 'totalReviews', 'priceRange.minPrice', 'priceRange.maxPrice'];

// @desc    Get all hotels
// @route   GET /api/v1/hotels
// @access  Public
export const getHotels = asyncHandler(async (req, res, next) => {
  const { city, minPrice, maxPrice, starRating, amenities, page = 1, limit = 10, sort } = req.query;

  // Build filters
  const filters = {};
  if (city) filters['address.city'] = new RegExp(city, 'i');
  if (minPrice) filters['priceRange.minPrice'] = { $gte: parseInt(minPrice) };
  if (maxPrice) filters['priceRange.maxPrice'] = { $lte: parseInt(maxPrice) };
  if (starRating) filters.starRating = parseInt(starRating);
  if (amenities) filters.amenities = { $in: amenities.split(',') };

  // Pagination
  const startIndex = (page - 1) * parseInt(limit);
  const endIndex = page * parseInt(limit);

  // Get total count
  const total = await HotelVerification.countDocuments(filters);

  // Determine sort order based on query param (e.g. 'name', '-name')
  let sortOptions = { createdAt: -1 };
  if (sort && typeof sort === 'string') {
    const sortField = sort.startsWith('-') ? sort.substring(1) : sort;
    const sortDirection = sort.startsWith('-') ? -1 : 1;
    if (sortField && ALLOWED_SORT_FIELDS.includes(sortField)) {
      sortOptions = { [sortField]: sortDirection };
    }
  }

  // Get hotels with pagination and sorting
  const hotels = await HotelVerification.find(filters)
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
    data: hotels
  });
});

// @desc    Get single hotel
// @route   GET /api/v1/hotels/:id
// @access  Public
export const getHotel = asyncHandler(async (req, res, next) => {
  const hotel = await HotelVerification.findById(req.params.id);

  if (!hotel) {
    return next(
      new ErrorResponse(`Hotel not found with id of ${req.params.id}`, 404)
    );
  }

  res.status(200).json({
    success: true,
    data: hotel
  });
});

// @desc    Search hotels
// @route   GET /api/v1/hotels/search
// @access  Public
export const searchHotelsEndpoint = asyncHandler(async (req, res, next) => {
  const { city, minPrice, maxPrice, starRating, amenities, page = 1, limit = 10 } = req.query;

  // Build filters
  const filters = {};
  if (city) filters.city = city;
  if (minPrice) filters.minPrice = parseInt(minPrice);
  if (maxPrice) filters.maxPrice = parseInt(maxPrice);
  if (starRating) filters.starRating = parseInt(starRating);
  if (amenities) filters.amenities = amenities.split(',');

  // Build database filters
  const dbFilters = {};
  if (city) dbFilters['address.city'] = new RegExp(city, 'i');
  if (minPrice) dbFilters['priceRange.minPrice'] = { $gte: parseInt(minPrice) };
  if (maxPrice) dbFilters['priceRange.maxPrice'] = { $lte: parseInt(maxPrice) };
  if (starRating) dbFilters.starRating = parseInt(starRating);
  if (amenities) dbFilters.amenities = { $in: amenities.split(',') };

  // Pagination
  const startIndex = (page - 1) * parseInt(limit);
  const endIndex = page * parseInt(limit);

  // Get total count
  const total = await HotelVerification.countDocuments(dbFilters);

  // Get hotels with pagination
  const hotels = await HotelVerification.find(dbFilters)
    .skip(startIndex)
    .limit(parseInt(limit))
    .sort({ createdAt: -1 });

  res.status(200).json({
    success: true,
    count: total,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total: total,
      pages: Math.ceil(total / limit)
    },
    data: hotels
  });
});

// @desc    Get cities
// @route   GET /api/v1/hotels/cities
// @access  Public
export const getCitiesEndpoint = asyncHandler(async (req, res, next) => {
  const cities = await HotelVerification.distinct('address.city');

  res.status(200).json({
    success: true,
    count: cities.length,
    data: cities
  });
});

// @desc    Get hotel statistics
// @route   GET /api/v1/hotels/stats
// @access  Public
export const getHotelStatsEndpoint = asyncHandler(async (req, res, next) => {
  const totalHotels = await HotelVerification.countDocuments();
  const totalRooms = await Room.countDocuments();
  const availableRooms = await Room.countDocuments({ isAvailable: true });
  const cities = await HotelVerification.distinct('address.city');

  const stats = {
    totalHotels,
    totalRooms,
    availableRooms,
    totalCities: cities.length,
    averageRating: await HotelVerification.aggregate([
      { $group: { _id: null, avgRating: { $avg: '$averageRating' } } }
    ]).then(result => result[0]?.avgRating || 0)
  };

  res.status(200).json({
    success: true,
    data: stats
  });
});

// @desc    Get hotels by city
// @route   GET /api/v1/hotels/city/:city
// @access  Public
export const getHotelsByCity = asyncHandler(async (req, res, next) => {
  const { city } = req.params;
  const { page = 1, limit = 10 } = req.query;

  // Pagination
  const startIndex = (page - 1) * parseInt(limit);
  const endIndex = page * parseInt(limit);

  // Get total count
  const total = await HotelVerification.countDocuments({ 'address.city': new RegExp(city, 'i') });

  // Get hotels with pagination
  const hotels = await HotelVerification.find({ 'address.city': new RegExp(city, 'i') })
    .skip(startIndex)
    .limit(parseInt(limit))
    .sort({ createdAt: -1 });

  res.status(200).json({
    success: true,
    count: total,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total: total,
      pages: Math.ceil(total / limit)
    },
    data: hotels
  });
});

// @desc    Get featured hotels
// @route   GET /api/v1/hotels/featured
// @access  Public
export const getFeaturedHotels = asyncHandler(async (req, res, next) => {
  const { limit = 6 } = req.query;

  // Get hotels with highest ratings
  const featuredHotels = await HotelVerification.find({
    isActive: true
  })
    .sort({ averageRating: -1 })
    .limit(parseInt(limit));

  res.status(200).json({
    success: true,
    count: featuredHotels.length,
    data: featuredHotels
  });
});

// @desc    Create new hotel
// @route   POST /api/v1/hotels
// @access  Private/Admin
export const createHotel = asyncHandler(async (req, res, next) => {
  const {
    name,
    description,
    address,
    contact,
    starRating,
    priceRange,
    amenities,
    images,
    facilities,
    policies
  } = req.body;

  // Validate required fields
  if (!name || !description || !address || !contact || !starRating || !priceRange || !facilities) {
    return next(new ErrorResponse('Please provide all required fields', 400));
  }

  // Validate address structure
  if (!address.hotelAddress || !address.city || !address.province || !address.coordinates) {
    return next(new ErrorResponse('Please provide complete address information', 400));
  }

  // Validate contact information
  if (!contact.phone || !contact.email) {
    return next(new ErrorResponse('Please provide phone and email contact information', 400));
  }

  // Validate price range
  if (!priceRange.minPrice || !priceRange.maxPrice) {
    return next(new ErrorResponse('Please provide minimum and maximum price', 400));
  }

  if (priceRange.maxPrice <= priceRange.minPrice) {
    return next(new ErrorResponse('Maximum price must be greater than minimum price', 400));
  }

  // Validate facilities
  if (!facilities.totalRooms) {
    return next(new ErrorResponse('Please provide total number of rooms', 400));
  }

  const hotel = await HotelVerification.create({
    name,
    description,
    address,
    contact,
    starRating,
    priceRange,
    amenities: amenities || [],
    images: images || [],
    facilities,
    policies: policies || {},
    isActive: true,
    isVerified: false
  });

  res.status(201).json({
    success: true,
    data: hotel
  });
});

// @desc    Update hotel
// @route   PUT /api/v1/hotels/:id
// @access  Private/Admin
export const updateHotel = asyncHandler(async (req, res, next) => {
  let hotel = await HotelVerification.findById(req.params.id);

  if (!hotel) {
    return next(
      new ErrorResponse(`Hotel not found with id of ${req.params.id}`, 404)
    );
  }

  // Update hotel
  hotel = await HotelVerification.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true
  });

  res.status(200).json({
    success: true,
    data: hotel
  });
});

// @desc    Delete hotel
// @route   DELETE /api/v1/hotels/:id
// @access  Private/Admin
export const deleteHotel = asyncHandler(async (req, res, next) => {
  const hotel = await HotelVerification.findById(req.params.id);

  if (!hotel) {
    return next(
      new ErrorResponse(`Hotel not found with id of ${req.params.id}`, 404)
    );
  }

  // Ownership check: only the hotel owner or an admin can delete
  if (hotel.userId && hotel.userId.toString() !== req.user.id && req.user.role !== 'admin') {
    return next(
      new ErrorResponse('Not authorized to delete this hotel', 403)
    );
  }

  // Check if hotel has rooms
  const roomsCount = await Room.countDocuments({ hotel: req.params.id });
  if (roomsCount > 0) {
    return next(
      new ErrorResponse(`Cannot delete hotel with ${roomsCount} rooms. Please delete rooms first.`, 400)
    );
  }

  await hotel.deleteOne();

  res.status(200).json({
    success: true,
    data: {}
  });
});

// @desc    Upload hotel images
// @route   PUT /api/v1/hotels/:id/images
// @access  Private/Admin
export const uploadHotelImages = asyncHandler(async (req, res, next) => {
  const hotel = await HotelVerification.findById(req.params.id);

  if (!hotel) {
    return next(
      new ErrorResponse(`Hotel not found with id of ${req.params.id}`, 404)
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

    // Create custom filename using crypto to prevent path traversal
    const safeFileName = `hotel_${hotel._id}_${crypto.randomBytes(8).toString('hex')}${path.extname(file.name).toLowerCase()}`;

    file.mv(`./uploads/${safeFileName}`, async err => {
      if (err) {
        console.error(err);
        return next(new ErrorResponse(`Problem with file upload`, 500));
      }
    });

    uploadedImages.push({
      url: `/uploads/${safeFileName}`,
      caption: file.name,
      isPrimary: uploadedImages.length === 0
    });
  }

  // Update hotel with new images
  hotel.images = [...hotel.images, ...uploadedImages];
  await hotel.save();

  res.status(200).json({
    success: true,
    data: hotel
  });
});
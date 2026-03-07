import Review from '../models/Review.js';
import Booking from '../models/Booking.js';
import { ErrorResponse } from '../utils/errorResponse.js';
import asyncHandler from '../middleware/async.js';

// @desc    Add a review
// @route   POST /api/reviews
// @access  Private (Traveller only)
export const createReview = asyncHandler(async (req, res, next) => {
    const { bookingId, rating, comment } = req.body;

    if (!bookingId || !rating) {
        return next(new ErrorResponse('Please provide a booking ID and a rating', 400));
    }

    // Find booking
    const booking = await Booking.findById(bookingId);
    if (!booking) {
        return next(new ErrorResponse(`No booking found with the id of ${bookingId}`, 404));
    }

    // Make sure user is booking owner
    if (booking.user.toString() !== req.user.id) {
        return next(new ErrorResponse('You are not authorized to review this booking', 401));
    }

    // Make sure booking status is checked-out
    if (booking.status !== 'checked-out') {
        return next(new ErrorResponse(`You can only review a booking after checking out. Current status: ${booking.status}`, 400));
    }

    // Check if review already exists
    const existingReview = await Review.findOne({ booking: bookingId });
    if (existingReview) {
        return next(new ErrorResponse('You have already reviewed this booking', 400));
    }

    const review = await Review.create({
        service: booking.hotel, // Currently hotels are the only service
        serviceType: 'hotel',
        booking: bookingId,
        user: req.user.id,
        rating,
        comment
    });

    // Mark booking as reviewed
    booking.isReviewed = true;
    await booking.save();

    res.status(201).json({
        success: true,
        data: review
    });
});

// @desc    Get reviews for a service
// @route   GET /api/reviews/service/:serviceId
// @access  Public
export const getServiceReviews = asyncHandler(async (req, res, next) => {
    const { page = 1, limit = 10 } = req.query;
    const startIndex = (page - 1) * parseInt(limit);

    const reviews = await Review.find({ service: req.params.serviceId })
        .populate({
            path: 'user',
            select: 'firstName lastName photoUrl' // Assuming these are the user fields
        })
        .skip(startIndex)
        .limit(parseInt(limit))
        .sort({ createdAt: -1 });

    const total = await Review.countDocuments({ service: req.params.serviceId });

    res.status(200).json({
        success: true,
        count: total,
        pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total: total,
            pages: Math.ceil(total / limit)
        },
        data: reviews
    });
});
// @desc    Get all reviews (global)
// @route   GET /api/reviews
// @access  Public
export const getReviews = asyncHandler(async (req, res, next) => {
    const { page = 1, limit = 10, rating, q, sort } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 10));
    const startIndex = (pageNum - 1) * limitNum;

    const filter = {};
    if (rating) {
        const r = parseInt(rating, 10);
        if (r >= 1 && r <= 5) filter.rating = r;
    }

    let sortOption;
    switch (sort) {
        case 'oldest':  sortOption = { createdAt: 1 }; break;
        case 'highest': sortOption = { rating: -1, createdAt: -1 }; break;
        case 'lowest':  sortOption = { rating: 1, createdAt: -1 }; break;
        default:        sortOption = { createdAt: -1 };
    }

    let query = Review.find(filter)
        .populate({ path: 'user', select: 'firstName lastName photoUrl' })
        .populate({ path: 'service', model: 'HotelVerification', select: 'name address.city images' })
        .sort(sortOption)
        .skip(startIndex)
        .limit(limitNum);

    let reviews = await query;
    let total = await Review.countDocuments(filter);

    // Client-side text search (lightweight — no text index required)
    if (q && typeof q === 'string') {
        const term = q.toLowerCase();
        reviews = reviews.filter(r =>
            (r.service?.name || '').toLowerCase().includes(term) ||
            (r.service?.address?.city || '').toLowerCase().includes(term) ||
            (r.user?.firstName || '').toLowerCase().includes(term) ||
            (r.comment || '').toLowerCase().includes(term)
        );
        total = reviews.length;
    }

    res.status(200).json({
        success: true,
        count: total,
        pagination: {
            page: pageNum,
            limit: limitNum,
            total,
            pages: Math.ceil(total / limitNum)
        },
        data: reviews
    });
});

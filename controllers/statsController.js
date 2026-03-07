import asyncHandler from '../middleware/async.js';
import User from '../models/User.js';
import HotelVerification from '../models/HotelVerification.js';
import Booking from '../models/Booking.js';

// @desc    Get public platform statistics
// @route   GET /api/stats
// @access  Public
export const getPublicStats = asyncHandler(async (req, res, next) => {
    const [travelers, activeHotels, successfulTrips] = await Promise.all([
        User.countDocuments({ role: 'traveller' }),
        HotelVerification.countDocuments({}),
        Booking.countDocuments({ status: { $in: ['confirmed', 'checked-in', 'checked-out'] } })
    ]);

    res.status(200).json({
        success: true,
        data: {
            travelers,
            activeHotels,
            successfulTrips,
            // Mock growth for visual appeal
            growth: 12
        }
    });
});

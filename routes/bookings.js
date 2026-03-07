import express from 'express';
import {
  getBookings,
  getBooking,
  createBooking,
  updateBooking,
  deleteBooking,
  getBookingsByUser,
  getBookingsByRoom,
  getCurrentBookings,
  getUpcomingBookings,
  getBookingStats,
  updateBookingStatus,
  cancelBooking
} from '../controllers/bookings.js';

import { protect, authorize } from '../middleware/auth.js';
import advancedResults from '../middleware/advancedResults.js';
import Booking from '../models/Booking.js';
import { validateBooking, validateObjectId, validatePagination, checkValidation } from '../middleware/validation.js';

const router = express.Router({ mergeParams: true });

// All routes below require authentication
router.use(protect);

// User-specific routes (any authenticated user)
router.get('/my-bookings', validatePagination, checkValidation, getBookingsByUser);

// Admin/Staff routes
router
  .route('/')
  .get(authorize('admin', 'service-provider'), validatePagination, checkValidation, advancedResults(Booking, 'room user hotel', ['status', 'user', 'hotel', 'room', 'checkInDate', 'checkOutDate', 'createdAt']), getBookings);

router.get('/current', authorize('admin', 'service-provider'), validatePagination, checkValidation, getCurrentBookings);
router.get('/upcoming', authorize('admin', 'service-provider'), validatePagination, checkValidation, getUpcomingBookings);
router.get('/room/:roomId', authorize('admin', 'service-provider'), validateObjectId('roomId'), validatePagination, checkValidation, getBookingsByRoom);
router.get('/stats', authorize('admin', 'service-provider'), getBookingStats);

router
  .route('/:id')
  .get(validateObjectId(), checkValidation, getBooking)
  .put(validateObjectId(), checkValidation, updateBooking)
  .delete(validateObjectId(), checkValidation, deleteBooking);

router.route('/:id/status')
  .put(authorize('admin', 'service-provider'), validateObjectId(), checkValidation, updateBookingStatus);

router.route('/:id/cancel')
  .patch(authorize('traveller', 'admin'), validateObjectId(), checkValidation, cancelBooking);

export default router;

import express from 'express';
import {
  getRooms,
  getRoom,
  getRoomsByHotel,
  checkRoomAvailability,
  getAvailableRooms,
  createRoom,
  updateRoom,
  deleteRoom,
  updateRoomStatus
} from '../controllers/rooms.js';
import { createBooking } from '../controllers/bookings.js';
import { protect, authorize } from '../middleware/auth.js';
import { validateRoom, validateObjectId, validatePagination, validateSearch, checkValidation } from '../middleware/validation.js';

const router = express.Router();

// Public routes
router.route('/')
  .get(validatePagination, validateSearch, checkValidation, getRooms)
  .post(protect, authorize('admin'), validateRoom, checkValidation, createRoom);

router.route('/availability')
  .get(validatePagination, validateSearch, checkValidation, getAvailableRooms);

router.route('/:id')
  .get(validateObjectId(), checkValidation, getRoom)
  .put(protect, authorize('admin'), validateObjectId(), validateRoom, checkValidation, updateRoom)
  .delete(protect, authorize('admin'), validateObjectId(), checkValidation, deleteRoom);

router.route('/:id/availability')
  .get(validateObjectId(), checkValidation, checkRoomAvailability);

router.route('/:id/status')
  .put(protect, authorize('admin'), validateObjectId(), checkValidation, updateRoomStatus);



// Booking route
router.route('/:id/bookings')
  .post(protect, validateObjectId(), checkValidation, createBooking);

// Hotel-specific routes
router.route('/hotel/:hotelId')
  .get(validateObjectId('hotelId'), validatePagination, checkValidation, getRoomsByHotel);

export default router;
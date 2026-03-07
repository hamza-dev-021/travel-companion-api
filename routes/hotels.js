import express from 'express';
import {
  getHotels,
  getHotel,
  searchHotelsEndpoint,
  getCitiesEndpoint,
  getHotelStatsEndpoint,
  getHotelsByCity,
  getFeaturedHotels,
  createHotel,
  updateHotel,
  deleteHotel,
  uploadHotelImages
} from '../controllers/hotels.js';
import { protect, authorize } from '../middleware/auth.js';
import { validateHotel, validateObjectId, validatePagination, validateSearch, checkValidation } from '../middleware/validation.js';
import { uploadMultiple } from '../middleware/upload.js';

const router = express.Router();

// Public routes
router.route('/')
  .get(validatePagination, validateSearch, checkValidation, getHotels)
  .post(protect, authorize('admin'), validateHotel, checkValidation, createHotel);

router.route('/search')
  .get(validatePagination, validateSearch, checkValidation, searchHotelsEndpoint);

router.route('/cities')
  .get(getCitiesEndpoint);

router.route('/stats')
  .get(getHotelStatsEndpoint);

router.route('/featured')
  .get(validatePagination, checkValidation, getFeaturedHotels);

router.route('/city/:city')
  .get(validatePagination, checkValidation, getHotelsByCity);

router.route('/:id')
  .get(validateObjectId(), checkValidation, getHotel)
  .put(protect, authorize('admin'), validateObjectId(), validateHotel, checkValidation, updateHotel)
  .delete(protect, authorize('admin'), validateObjectId(), checkValidation, deleteHotel);

router.route('/:id/images')
  .put(protect, authorize('admin'), validateObjectId(), uploadMultiple('files', 5), checkValidation, uploadHotelImages);

export default router;

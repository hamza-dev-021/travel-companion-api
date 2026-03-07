import express from 'express';
import { validateObjectId, validatePagination, validateSearch, checkValidation } from '../middleware/validation.js';
import { getVerifiedHotel, getVerifiedHotels } from '../controllers/verifiedHotels.js';

const router = express.Router();

// Public routes for traveller browsing of approved provider-verified hotels
router.route('/')
  .get(validatePagination, validateSearch, checkValidation, getVerifiedHotels);

router.route('/:id')
  .get(validateObjectId(), checkValidation, getVerifiedHotel);

export default router;

import express from 'express';
import { createReview, getServiceReviews, getReviews } from '../controllers/reviewController.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();

router.route('/')
    .get(getReviews)
    .post(protect, authorize('traveller'), createReview);

router.route('/service/:serviceId')
    .get(getServiceReviews);

export default router;

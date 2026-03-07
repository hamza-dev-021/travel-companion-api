import express from 'express';
import { 
  getUsers,
  getUser,
  createUser,
  updateUser,
  deleteUser,
  userPhotoUpload
} from '../controllers/users.js';

import User from '../models/User.js';
import { protect, authorize } from '../middleware/auth.js';
import advancedResults from '../middleware/advancedResults.js';
import { validateUser, validateObjectId, validatePagination, checkValidation } from '../middleware/validation.js';
import { uploadSingle } from '../middleware/upload.js';

const router = express.Router();

// All routes below will use these middlewares
router.use(protect);
router.use(authorize('admin'));

router
  .route('/')
  .get(validatePagination, checkValidation, advancedResults(User), getUsers)
  .post(validateUser, checkValidation, createUser);

router
  .route('/:id')
  .get(validateObjectId(), checkValidation, getUser)
  .put(validateObjectId(), validateUser, checkValidation, updateUser)
  .delete(validateObjectId(), checkValidation, deleteUser);

router
  .route('/:id/photo')
  .put(validateObjectId(), uploadSingle('file'), checkValidation, userPhotoUpload);

export default router;

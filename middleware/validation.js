import { body, param, query, validationResult } from 'express-validator';
import { ErrorResponse } from '../utils/errorResponse.js';

// Generic validation checker
export const checkValidation = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    console.log('Validation errors:', errors.array());
    console.log('Request params:', req.params);
    console.log('Request query:', req.query);
    console.log('Request body:', req.body);
    return next(new ErrorResponse(errors.array()[0].msg, 400));
  }
  next();
};

// User validation
export const validateUser = [
  body('name')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Name must be between 2 and 50 characters'),
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email'),
  body('phone')
    .optional()
    .isMobilePhone()
    .withMessage('Please provide a valid phone number'),
  body('role')
    .optional()
    .isIn(['traveller', 'service-provider', 'admin'])
    .withMessage('Role must be traveller, service-provider, or admin')
];

// Hotel validation
export const validateHotel = [
  body('name')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Hotel name must be between 2 and 100 characters'),
  body('description')
    .trim()
    .isLength({ min: 10, max: 1000 })
    .withMessage('Description must be between 10 and 1000 characters'),
  body('address.street')
    .notEmpty()
    .withMessage('Street address is required'),
  body('address.city')
    .notEmpty()
    .withMessage('City is required'),
  body('address.province')
    .notEmpty()
    .withMessage('Province is required'),
  body('address.coordinates.latitude')
    .isFloat({ min: -90, max: 90 })
    .withMessage('Valid latitude is required'),
  body('address.coordinates.longitude')
    .isFloat({ min: -180, max: 180 })
    .withMessage('Valid longitude is required'),
  body('contact.phone')
    .trim()
    .isLength({ min: 5, max: 30 })
    .withMessage('Valid phone number is required'),
  body('contact.email')
    .isEmail()
    .withMessage('Valid email is required'),
  body('starRating')
    .isInt({ min: 1, max: 5 })
    .withMessage('Star rating must be between 1 and 5'),
  body('priceRange.minPrice')
    .isFloat({ min: 0 })
    .withMessage('Minimum price must be a positive number'),
  body('priceRange.maxPrice')
    .isFloat({ min: 0 })
    .withMessage('Maximum price must be a positive number'),
  body('facilities.totalRooms')
    .isInt({ min: 1 })
    .withMessage('Total rooms must be at least 1')
];

// Room validation
export const validateRoom = [
  body('hotel')
    .isMongoId()
    .withMessage('Valid hotel ID is required'),
  body('roomNumber')
    .trim()
    .isLength({ min: 1, max: 10 })
    .withMessage('Room number must be between 1 and 10 characters'),
  body('roomType')
    .notEmpty()
    .withMessage('Room type is required'),
  body('description')
    .trim()
    .isLength({ min: 10, max: 500 })
    .withMessage('Description must be between 10 and 500 characters'),
  body('pricePerNight')
    .isFloat({ min: 0 })
    .withMessage('Price per night must be a positive number'),
  body('maxGuests')
    .isInt({ min: 1, max: 20 })
    .withMessage('Max guests must be between 1 and 20')
];

// Booking validation
export const validateBooking = [
  body('checkInDate')
    .isISO8601()
    .withMessage('Valid check-in date is required'),
  body('checkOutDate')
    .isISO8601()
    .withMessage('Valid check-out date is required'),
  body('numberOfGuests')
    .isInt({ min: 1, max: 20 })
    .withMessage('Number of guests must be between 1 and 20'),
  body('guestDetails.firstName')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Guest first name must be between 2 and 50 characters'),
  body('guestDetails.lastName')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Guest last name must be between 2 and 50 characters'),
  body('guestDetails.email')
    .isEmail()
    .withMessage('Valid guest email is required'),
  body('guestDetails.phone')
    .isMobilePhone()
    .withMessage('Valid guest phone number is required'),
  body('specialRequests')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Special requests cannot exceed 500 characters')
];

// ID parameter validation
export const validateObjectId = (paramName = 'id') => [
  param(paramName)
    .isMongoId()
    .withMessage(`Valid ${paramName} is required`)
];

// Pagination validation
export const validatePagination = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100')
];

// Search validation
export const validateSearch = [
  query('city')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('City must be between 2 and 50 characters'),
  query('minPrice')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Minimum price must be a positive number'),
  query('maxPrice')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Maximum price must be a positive number'),
  query('starRating')
    .optional()
    .isInt({ min: 1, max: 5 })
    .withMessage('Star rating must be between 1 and 5')
];

export default {
  checkValidation,
  validateUser,
  validateHotel,
  validateRoom,
  validateBooking,
  validateObjectId,
  validatePagination,
  validateSearch
};

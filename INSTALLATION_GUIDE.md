# Hotel Management API - Installation & Setup Guide

## Prerequisites

Before setting up the API, ensure you have the following installed:

- **Node.js** (v16 or higher)
- **MongoDB** (v4.4 or higher)
- **npm** or **yarn** package manager

## Installation Steps

### 1. Clone the Repository
```bash
git clone <repository-url>
cd hotel-management-api
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Environment Configuration

Create a `.env` file in the root directory with the following variables:

```env
# Server Configuration
NODE_ENV=development
PORT=5000
FRONTEND_URL=http://localhost:3000

# Database Configuration
MONGODB_URI=mongodb://localhost:27017/hotel-management

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-here-make-it-long-and-random
JWT_EXPIRE=30d
JWT_COOKIE_EXPIRE=30

# File Upload Configuration
MAX_FILE_UPLOAD=5242880

# Security Configuration
BCRYPT_ROUNDS=12
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
AUTH_RATE_LIMIT_MAX_REQUESTS=5
```

### 4. Database Setup

#### Start MongoDB
```bash
# On Windows
net start MongoDB

# On macOS/Linux
sudo systemctl start mongod
# or
brew services start mongodb-community
```

#### Seed Initial Data
```bash
# Import sample data
npm run seed

# Or manually run
node scripts/seedMockData.js -i
```

### 5. Start the Server

#### Development Mode
```bash
npm run dev
```

#### Production Mode
```bash
npm start
```

The API will be available at `http://localhost:5000`

## API Testing

### 1. Test Basic Functionality
```bash
npm run test:api
```

### 2. Test Complete CRUD Operations
```bash
npm run test:full
```

### 3. Manual Testing with Postman/Insomnia

Import the following endpoints for testing:

#### Authentication
- `POST /api/v1/auth/register` - Register new user
- `POST /api/v1/auth/login` - Login user
- `GET /api/v1/auth/me` - Get current user
- `PUT /api/v1/auth/updatepassword` - Update password

#### Hotels
- `GET /api/v1/hotels` - Get all hotels
- `GET /api/v1/hotels/:id` - Get single hotel
- `POST /api/v1/hotels` - Create hotel (Admin only)
- `PUT /api/v1/hotels/:id` - Update hotel (Admin only)
- `DELETE /api/v1/hotels/:id` - Delete hotel (Admin only)

#### Rooms
- `GET /api/v1/rooms` - Get all rooms
- `GET /api/v1/rooms/:id` - Get single room
- `POST /api/v1/rooms` - Create room (Admin only)
- `PUT /api/v1/rooms/:id` - Update room (Admin only)
- `DELETE /api/v1/rooms/:id` - Delete room (Admin only)

#### Bookings
- `GET /api/v1/bookings/my-bookings` - Get user bookings
- `POST /api/v1/rooms/:id/bookings` - Create booking
- `PUT /api/v1/bookings/:id` - Update booking
- `DELETE /api/v1/bookings/:id` - Delete booking

## Security Features

### 1. Authentication & Authorization
- JWT-based authentication
- Role-based access control (Guest, Staff, Admin)
- Password strength requirements
- Rate limiting on auth endpoints

### 2. Input Validation
- Comprehensive input validation using express-validator
- Data sanitization and XSS protection
- NoSQL injection prevention
- File upload security

### 3. Security Headers
- Helmet.js for security headers
- CORS configuration
- Rate limiting
- Parameter pollution prevention

## File Upload

### Supported File Types
- JPEG (.jpg, .jpeg)
- PNG (.png)
- GIF (.gif)
- WebP (.webp)

### File Size Limits
- Maximum file size: 5MB
- Maximum files per request: 5

### Upload Endpoints
- `PUT /api/v1/users/:id/photo` - Upload user photo
- `PUT /api/v1/hotels/:id/images` - Upload hotel images
- `PUT /api/v1/rooms/:id/images` - Upload room images

## Error Handling

The API provides comprehensive error handling:

### Error Response Format
```json
{
  "success": false,
  "error": "Error message",
  "stack": "Stack trace (development only)"
}
```

### Common Error Codes
- `400` - Bad Request (Validation errors)
- `401` - Unauthorized (Authentication required)
- `403` - Forbidden (Insufficient permissions)
- `404` - Not Found (Resource not found)
- `429` - Too Many Requests (Rate limit exceeded)
- `500` - Internal Server Error

## Database Schema

### Users Collection
```javascript
{
  name: String,
  email: String (unique),
  password: String (hashed),
  role: String (enum: ['guest', 'staff', 'admin']),
  phone: String,
  address: Object,
  isActive: Boolean,
  createdAt: Date
}
```

### Hotels Collection
```javascript
{
  name: String,
  description: String,
  address: {
    street: String,
    city: String,
    province: String,
    coordinates: {
      latitude: Number,
      longitude: Number
    }
  },
  contact: {
    phone: String,
    email: String,
    website: String
  },
  starRating: Number (1-5),
  priceRange: {
    minPrice: Number,
    maxPrice: Number,
    currency: String
  },
  amenities: [String],
  images: [Object],
  facilities: Object,
  policies: Object,
  isActive: Boolean,
  isVerified: Boolean
}
```

### Rooms Collection
```javascript
{
  hotel: ObjectId (ref: 'Hotel'),
  roomNumber: String,
  roomType: String,
  description: String,
  pricePerNight: Number,
  maxGuests: Number,
  amenities: [String],
  images: [String],
  isAvailable: Boolean,
  status: String (enum: ['available', 'occupied', 'maintenance', 'cleaning']),
  lastCleaned: Date
}
```

### Bookings Collection
```javascript
{
  room: ObjectId (ref: 'Room'),
  hotel: ObjectId (ref: 'Hotel'),
  user: ObjectId (ref: 'User'),
  checkInDate: Date,
  checkOutDate: Date,
  numberOfGuests: Number,
  totalPrice: Number,
  status: String (enum: ['pending', 'confirmed', 'checked-in', 'checked-out', 'cancelled', 'no-show']),
  specialRequests: String,
  guestDetails: Object,
  bookingReference: String (unique),
  paymentStatus: String,
  isPaid: Boolean,
  createdAt: Date
}
```

## Performance Optimization

### Database Indexes
- User email (unique)
- Hotel city, star rating, price range
- Room hotel, availability, room number
- Booking user, dates, reference

### Caching Strategy
- Response caching for static data
- Database query optimization
- Pagination for large datasets

### Rate Limiting
- General API: 100 requests per 15 minutes
- Auth endpoints: 5 requests per 15 minutes
- File uploads: Separate limits

## Monitoring & Logging

### Log Levels
- `error` - Error messages
- `warn` - Warning messages
- `info` - General information
- `debug` - Debug information

### Log Files
- Application logs: `logs/app.log`
- Error logs: `logs/error.log`
- Access logs: `logs/access.log`

## Deployment

### Production Environment
1. Set `NODE_ENV=production`
2. Use strong JWT secrets
3. Configure proper CORS origins
4. Set up SSL/TLS certificates
5. Configure reverse proxy (nginx)
6. Set up monitoring and logging

### Docker Deployment
```dockerfile
FROM node:16-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 5000
CMD ["npm", "start"]
```

### Environment Variables for Production
```env
NODE_ENV=production
PORT=5000
MONGODB_URI=mongodb://your-production-db
JWT_SECRET=your-production-jwt-secret
FRONTEND_URL=https://your-frontend-domain.com
```

## Troubleshooting

### Common Issues

#### 1. Database Connection Issues
- Check MongoDB is running
- Verify connection string
- Check network connectivity

#### 2. Authentication Issues
- Verify JWT secret is set
- Check token expiration
- Ensure proper headers

#### 3. File Upload Issues
- Check file size limits
- Verify file type restrictions
- Ensure uploads directory exists

#### 4. Rate Limiting Issues
- Check rate limit configuration
- Verify IP-based limiting
- Review request patterns

### Debug Mode
Set `NODE_ENV=development` to enable:
- Detailed error messages
- Stack traces
- Debug logging
- Hot reloading

## Support

For issues and questions:
1. Check the error logs
2. Review the API documentation
3. Test with the provided test scripts
4. Check the security improvements document

## License

This project is licensed under the ISC License.

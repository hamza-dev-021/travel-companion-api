<<<<<<< HEAD
# Hotel Booking API

A comprehensive hotel booking system API built with Node.js, Express, and MongoDB. This API provides a complete solution for hotel management, room booking, and user authentication with mock data for development and testing.

## Features

- **🔐 Authentication & Authorization**: JWT-based authentication with role-based access control
- **🏨 Hotel Management**: Browse and search hotels with advanced filtering
- **🛏️ Room Management**: Check room availability and pricing
- **📅 Booking System**: Complete booking workflow with guest details
- **📊 Mock Data**: Comprehensive mock data for development and testing
- **🍪 Session Management**: Enhanced authentication with cookies and sessions
- **👥 Role-based Access**: Different access levels for guests, staff, and admins
- **🧹 Clean Architecture**: Focused on core hotel booking functionality

## Tech Stack

- **Backend**: Node.js, Express.js
- **Database**: MongoDB with Mongoose
- **Authentication**: JWT (JSON Web Tokens)
- **Security**: bcrypt for password hashing
- **Validation**: Express-validator
- **Documentation**: Comprehensive API documentation

## Quick Start

### 1. Installation

```bash
# Clone the repository
git clone <repository-url>
cd api

# Install dependencies
npm install
```

### 2. Environment Setup

```bash
# Copy environment variables
cp .env.example .env

# Edit .env file with your configuration
```

Required environment variables:
```env
NODE_ENV=development
PORT=5000
MONGO_URI=mongodb://localhost:27017/hotel-booking
JWT_SECRET=your_jwt_secret_here
JWT_EXPIRE=30d
JWT_COOKIE_EXPIRE=30
```

### 3. Database Setup

```bash
# Start MongoDB (if not running)
mongod

# Seed mock data
npm run seed
```

### 4. Start the Server

```bash
# Development mode
npm run dev

# Production mode
npm start
```

The API will be available at `http://localhost:5000`

## API Endpoints

### Authentication
- `POST /api/v1/auth/register` - Register a new user
- `POST /api/v1/auth/login` - Login user
- `GET /api/v1/auth/me` - Get current user
- `GET /api/v1/auth/logout` - Logout user

### Hotels
- `GET /api/v1/hotels` - Get all hotels
- `GET /api/v1/hotels/:id` - Get single hotel
- `POST /api/v1/hotels` - Create hotel (Admin)
- `PUT /api/v1/hotels/:id` - Update hotel (Admin)
- `DELETE /api/v1/hotels/:id` - Delete hotel (Admin)
- `GET /api/v1/hotels/search` - Search hotels
- `GET /api/v1/hotels/cities` - Get available cities
- `GET /api/v1/hotels/stats` - Get hotel statistics
- `GET /api/v1/hotels/featured` - Get featured hotels
- `PUT /api/v1/hotels/:id/images` - Upload hotel images (Admin)

### Rooms
- `GET /api/v1/rooms` - Get all rooms
- `GET /api/v1/rooms/:id` - Get single room
- `POST /api/v1/rooms` - Create room (Admin)
- `PUT /api/v1/rooms/:id` - Update room (Admin)
- `DELETE /api/v1/rooms/:id` - Delete room (Admin)
- `PUT /api/v1/rooms/:id/status` - Update room status (Admin)
- `PUT /api/v1/rooms/:id/images` - Upload room images (Admin)
- `GET /api/v1/rooms/availability` - Get available rooms
- `GET /api/v1/rooms/:id/availability` - Check room availability

### Bookings
- `GET /api/v1/bookings` - Get all bookings (Admin/Staff)
- `GET /api/v1/bookings/:id` - Get single booking
- `POST /api/v1/rooms/:roomId/bookings` - Create booking
- `PUT /api/v1/bookings/:id` - Update booking
- `DELETE /api/v1/bookings/:id` - Delete booking
- `GET /api/v1/bookings/my-bookings` - Get user's bookings

## Mock Data

The API includes comprehensive mock data:

- **5 Luxury Hotels** across major Pakistani cities
- **11 Different Room Types** with varying prices and amenities
- **Realistic Hotel Information** with ratings, amenities, and policies
- **Room Availability** and pricing information

### Sample Hotels
- Serena Hotel Islamabad (5-star)
- Pearl Continental Hotel Karachi (5-star)
- Lahore Marriott Hotel (5-star)
- Avari Hotel Lahore (4-star)
- Ramada by Wyndham Karachi (4-star)

## User Roles

### Guest
- Browse hotels and rooms
- Create and manage bookings
- View booking history

### Staff
- All guest permissions
- View all bookings
- Manage booking status

### Admin
- All staff permissions
- Manage hotels and rooms
- View analytics and reports

## Testing

```bash
# Test basic API endpoints
npm run test:api

# Test complete API with all CRUD operations
npm run test:full

# Run unit tests
npm test
```

## Scripts

```bash
# Development
npm run dev          # Start development server
npm start           # Start production server

# Database
npm run seed        # Seed mock data
npm run seed:delete # Delete mock data

# Testing
npm run test:api    # Test basic API endpoints
npm run test:full  # Test complete API with all CRUD operations
npm test           # Run unit tests
```

## API Documentation

Complete API documentation is available in `API_DOCS.md` with detailed endpoint descriptions, request/response examples, and error codes.

## Authentication

All protected routes require a JWT token in the Authorization header:

```
Authorization: Bearer your_jwt_token_here
```

## Error Handling

The API uses consistent error responses:

```json
{
  "success": false,
  "error": "Error Type",
  "message": "Detailed error message"
}
```

## Response Format

All successful responses follow this format:

```json
{
  "success": true,
  "count": 1,
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 1,
    "pages": 1
  },
  "data": {}
}
```

## Development

### Project Structure

```
api/
├── config/          # Database configuration
├── controllers/     # Route controllers (auth, users, hotels, rooms, bookings)
├── middleware/      # Custom middleware (auth, async, error handling)
├── models/          # Database models (User, Hotel, Room, Booking)
├── routes/          # API routes (auth, users, hotels, rooms, bookings)
├── scripts/         # Utility scripts (seeding, testing)
├── services/        # Business logic services (mock data)
├── utils/           # Utility functions (error responses)
└── server.js        # Application entry point
```

### Adding New Features

1. Create model in `models/`
2. Create controller in `controllers/`
3. Create routes in `routes/`
4. Add middleware if needed
5. Update documentation

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## License

This project is licensed under the ISC License.

## Support

For support and questions, please open an issue in the repository.
=======
# travel-companion-api
This is the backend of travel-companion web app
>>>>>>> a64824128789119d01abda8a963c69dedae92040

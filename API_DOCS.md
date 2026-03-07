# Hotel Management API Documentation

## Table of Contents
- [Base URL](#base-url)
- [Authentication](#authentication)
- [Hotels](#hotels)
- [Rooms](#rooms)
- [Bookings](#bookings)
- [Users](#users)
- [Error Responses](#error-responses)
- [Response Format](#response-format)
- [Security Features](#security-features)
- [Rate Limiting](#rate-limiting)
- [Testing](#testing)
- [Getting Started](#getting-started)

## Base URL
```
http://localhost:5000/api/v1
```

## Authentication

All authentication endpoints are rate-limited to 5 requests per 15 minutes for security.

### Register a User
```http
POST /auth/register
```

**Request Body**
```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "password123",
  "phone": "1234567890",
  "role": "guest"
}
```

**Response**
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "data": {
    "name": "John Doe",
    "email": "john@example.com",
    "role": "guest",
    "phone": "1234567890"
  }
}
```

### Login
```http
POST /auth/login
```

**Request Body**
```json
{
  "email": "john@example.com",
  "password": "password123"
}
```

**Response**
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "data": {
    "name": "John Doe",
    "email": "john@example.com",
  "role": "guest"
  }
}
```

### Get Current User
```http
GET /auth/me
Authorization: Bearer <token>
```

**Response**
```json
{
  "success": true,
  "data": {
    "_id": "507f1f77bcf86cd799439011",
    "name": "John Doe",
    "email": "john@example.com",
    "role": "guest",
    "phone": "1234567890",
    "createdAt": "2025-01-01T00:00:00.000Z"
  }
}
```

### Update User Details
```http
PUT /auth/updatedetails
Authorization: Bearer <token>
```

**Request Body**
```json
{
  "name": "John Smith",
  "phone": "9876543210"
}
```

### Update Password
```http
PUT /auth/updatepassword
Authorization: Bearer <token>
```

**Request Body**
```json
{
  "currentPassword": "password123",
  "newPassword": "newpassword123"
}
```

### Logout
```http
GET /auth/logout
Authorization: Bearer <token>
```

**Response**
```json
{
  "success": true,
  "message": "User logged out successfully"
}
```

## Hotels

### Get All Hotels
```http
GET /hotels?page=1&limit=10&sort=name
```

**Query Parameters**
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 10, max: 100)
- `sort` (optional): Sort field (name, starRating, createdAt)
- `select` (optional): Fields to select
- `populate` (optional): Fields to populate

**Response**
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
  "data": [
    {
      "_id": "507f1f77bcf86cd799439011",
      "name": "Grand Hotel",
      "description": "Luxury hotel in city center",
  "address": {
    "street": "123 Main Street",
    "city": "Karachi",
    "province": "Sindh",
    "postalCode": "75000",
    "coordinates": {
      "latitude": 24.8607,
      "longitude": 67.0011
    }
  },
  "contact": {
    "phone": "+92-21-1234567",
        "email": "info@grandhotel.com",
        "website": "https://grandhotel.com"
  },
  "starRating": 5,
  "priceRange": {
        "minPrice": 15000,
        "maxPrice": 50000,
    "currency": "PKR"
  },
      "amenities": ["WiFi", "Pool", "Gym", "Restaurant"],
  "facilities": {
    "totalRooms": 100,
    "checkInTime": "14:00",
    "checkOutTime": "12:00",
    "languages": ["English", "Urdu"]
  },
  "policies": {
        "cancellationPolicy": "Free cancellation up to 24 hours",
    "petPolicy": "Pets allowed",
    "smokingPolicy": "Non-smoking"
      },
      "images": ["/uploads/hotel1.jpg"],
      "isActive": true,
      "createdAt": "2025-01-01T00:00:00.000Z"
  }
  ]
}
```

### Search Hotels
```http
GET /hotels/search?city=Karachi&minPrice=10000&maxPrice=50000&starRating=4&amenities=WiFi,Pool
```

**Query Parameters**
- `city` (optional): Filter by city
- `minPrice` (optional): Minimum price per night
- `maxPrice` (optional): Maximum price per night
- `starRating` (optional): Minimum star rating
- `amenities` (optional): Comma-separated amenities
- `page` (optional): Page number
- `limit` (optional): Items per page

### Get Cities
```http
GET /hotels/cities
```

**Response**
```json
{
  "success": true,
  "count": 1,
  "data": [
    {
      "_id": "Karachi",
      "count": 1
    }
  ]
}
```

### Get Hotel Statistics
```http
GET /hotels/stats
```

**Response**
```json
{
  "success": true,
  "data": {
    "totalHotels": 1,
    "averageRating": 5,
    "totalRooms": 100,
    "citiesCount": 1
  }
}
```

### Get Featured Hotels
```http
GET /hotels/featured?page=1&limit=5
```

### Get Hotels by City
```http
GET /hotels/city/Karachi?page=1&limit=10
```

### Get Single Hotel
```http
GET /hotels/:id
```

### Create Hotel (Admin Only)
```http
POST /hotels
Authorization: Bearer <admin_token>
```

**Request Body**
```json
{
  "name": "New Hotel",
  "description": "A beautiful new hotel",
  "address": {
    "street": "456 New Street",
    "city": "Lahore",
    "province": "Punjab",
    "postalCode": "54000",
    "coordinates": {
      "latitude": 31.5204,
      "longitude": 74.3587
    }
  },
  "contact": {
    "phone": "+92-42-9876543",
    "email": "info@newhotel.com",
    "website": "https://newhotel.com"
  },
  "starRating": 4,
  "priceRange": {
    "minPrice": 12000,
    "maxPrice": 40000,
    "currency": "PKR"
  },
  "amenities": ["WiFi", "Pool", "Spa"],
  "facilities": {
    "totalRooms": 50,
    "checkInTime": "15:00",
    "checkOutTime": "11:00",
    "languages": ["English", "Urdu"]
  },
  "policies": {
    "cancellationPolicy": "Free cancellation",
    "petPolicy": "Pets not allowed",
    "smokingPolicy": "Non-smoking"
  }
}
```

### Update Hotel (Admin Only)
```http
PUT /hotels/:id
Authorization: Bearer <admin_token>
```

### Delete Hotel (Admin Only)
```http
DELETE /hotels/:id
Authorization: Bearer <admin_token>
```

### Upload Hotel Images (Admin Only)
```http
PUT /hotels/:id/images
Authorization: Bearer <admin_token>
Content-Type: multipart/form-data
```

**Request Body**
- `files`: Multiple image files (max 5, 5MB each)

## Rooms

### Get All Rooms
```http
GET /rooms?page=1&limit=10&sort=pricePerNight
```

**Query Parameters**
- `page` (optional): Page number
- `limit` (optional): Items per page
- `sort` (optional): Sort field
- `hotel` (optional): Filter by hotel ID
- `roomType` (optional): Filter by room type
- `minPrice` (optional): Minimum price
- `maxPrice` (optional): Maximum price

**Response**
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
  "data": [
    {
      "_id": "507f1f77bcf86cd799439012",
      "hotel": "507f1f77bcf86cd799439011",
  "roomNumber": "101",
  "roomType": "Deluxe Suite",
      "description": "Spacious deluxe suite with city view",
  "pricePerNight": 25000,
  "maxGuests": 4,
  "amenities": ["WiFi", "TV", "Mini Bar", "Balcony"],
      "images": ["/uploads/room101.jpg"],
      "isAvailable": true,
      "status": "available",
      "createdAt": "2025-01-01T00:00:00.000Z"
    }
  ]
}
```

### Check Room Availability
```http
GET /rooms/availability?checkInDate=2025-02-01&checkOutDate=2025-02-05&guests=2&hotel=507f1f77bcf86cd799439011
```

**Query Parameters**
- `checkInDate` (required): Check-in date (YYYY-MM-DD)
- `checkOutDate` (required): Check-out date (YYYY-MM-DD)
- `guests` (optional): Number of guests
- `hotel` (optional): Hotel ID filter
- `roomType` (optional): Room type filter
- `minPrice` (optional): Minimum price
- `maxPrice` (optional): Maximum price

### Get Single Room
```http
GET /rooms/:id
```

### Get Rooms by Hotel
```http
GET /rooms/hotel/:hotelId?page=1&limit=10
```

### Check Specific Room Availability
```http
GET /rooms/:id/availability?checkInDate=2025-02-01&checkOutDate=2025-02-05&guests=2
```

**Response**
```json
{
  "success": true,
  "data": {
    "roomId": "507f1f77bcf86cd799439012",
    "roomNumber": "101",
    "availability": {
      "isAvailable": true,
      "conflicts": []
    },
    "price": {
      "perNight": 25000,
      "totalNights": 4,
      "totalPrice": 100000
    }
  }
}
```

### Create Room (Admin Only)
```http
POST /rooms
Authorization: Bearer <admin_token>
```

**Request Body**
```json
{
  "hotel": "507f1f77bcf86cd799439011",
  "roomNumber": "102",
  "roomType": "Standard Room",
  "description": "Comfortable standard room",
  "pricePerNight": 15000,
  "maxGuests": 2,
  "amenities": ["WiFi", "TV", "Air Conditioning"],
  "images": ["/uploads/room102.jpg"]
}
```

### Update Room (Admin Only)
```http
PUT /rooms/:id
Authorization: Bearer <admin_token>
```

### Update Room Status (Admin Only)
```http
PUT /rooms/:id/status
Authorization: Bearer <admin_token>
```

**Request Body**
```json
{
  "status": "maintenance"
}
```

### Delete Room (Admin Only)
```http
DELETE /rooms/:id
Authorization: Bearer <admin_token>
```

### Upload Room Images (Admin Only)
```http
PUT /rooms/:id/images
Authorization: Bearer <admin_token>
Content-Type: multipart/form-data
```

## Bookings

### Get User's Bookings
```http
GET /bookings/my-bookings?page=1&limit=10
Authorization: Bearer <token>
```

**Response**
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
  "data": [
    {
      "_id": "507f1f77bcf86cd799439013",
      "room": {
        "_id": "507f1f77bcf86cd799439012",
        "roomNumber": "101",
        "roomType": "Deluxe Suite"
      },
      "hotel": {
        "_id": "507f1f77bcf86cd799439011",
        "name": "Grand Hotel"
      },
      "user": "507f1f77bcf86cd799439010",
      "checkInDate": "2025-02-01T00:00:00.000Z",
      "checkOutDate": "2025-02-05T00:00:00.000Z",
      "numberOfGuests": 2,
      "totalPrice": 100000,
      "specialRequests": "Early check-in requested",
      "guestDetails": {
        "firstName": "John",
        "lastName": "Doe",
        "email": "john@example.com",
        "phone": "1234567890"
      },
      "bookingReference": "BK123456ABC",
      "status": "confirmed",
      "paymentStatus": "pending",
      "isPaid": false,
      "createdAt": "2025-01-01T00:00:00.000Z"
    }
  ]
}
```

### Create Booking
```http
POST /rooms/:roomId/bookings
Authorization: Bearer <token>
```

**Request Body**
```json
{
  "checkInDate": "2025-02-01",
  "checkOutDate": "2025-02-05",
  "numberOfGuests": 2,
  "specialRequests": "Early check-in requested",
  "guestDetails": {
    "firstName": "John",
    "lastName": "Doe",
    "email": "john@example.com",
    "phone": "1234567890"
  }
}
```

**Response**
```json
{
  "success": true,
  "data": {
    "_id": "507f1f77bcf86cd799439013",
    "room": "507f1f77bcf86cd799439012",
    "hotel": "507f1f77bcf86cd799439011",
    "user": "507f1f77bcf86cd799439010",
    "checkInDate": "2025-02-01T00:00:00.000Z",
    "checkOutDate": "2025-02-05T00:00:00.000Z",
    "numberOfGuests": 2,
    "totalPrice": 100000,
    "specialRequests": "Early check-in requested",
    "guestDetails": {
      "firstName": "John",
      "lastName": "Doe",
      "email": "john@example.com",
      "phone": "1234567890"
    },
    "bookingReference": "BK123456ABC",
    "status": "confirmed",
    "paymentStatus": "pending",
    "isPaid": false,
    "createdAt": "2025-01-01T00:00:00.000Z"
  },
  "message": "Booking confirmed and room status updated"
}
```

### Get Single Booking
```http
GET /bookings/:id
Authorization: Bearer <token>
```

### Update Booking
```http
PUT /bookings/:id
Authorization: Bearer <token>
```

**Request Body**
```json
{
  "specialRequests": "Updated special requests",
  "numberOfGuests": 3
}
```

### Update Booking Status (Admin/Staff Only)
```http
PUT /bookings/:id/status
Authorization: Bearer <admin_token>
```

**Request Body**
```json
{
  "status": "checked-in"
}
```

### Delete Booking
```http
DELETE /bookings/:id
Authorization: Bearer <token>
```

### Get All Bookings (Admin/Staff Only)
```http
GET /bookings?page=1&limit=10&sort=createdAt
Authorization: Bearer <admin_token>
```

### Get Current Bookings (Admin/Staff Only)
```http
GET /bookings/current?page=1&limit=10
Authorization: Bearer <admin_token>
```

### Get Upcoming Bookings (Admin/Staff Only)
```http
GET /bookings/upcoming?page=1&limit=10
Authorization: Bearer <admin_token>
```

### Get Bookings by Room (Admin/Staff Only)
```http
GET /bookings/room/:roomId?page=1&limit=10
Authorization: Bearer <admin_token>
```

### Get Booking Statistics (Admin/Staff Only)
```http
GET /bookings/stats
Authorization: Bearer <admin_token>
```

**Response**
```json
{
  "success": true,
  "data": [
    {
      "month": "2025-01",
      "totalBookings": 5,
      "totalRevenue": 500000,
      "averageBookingValue": 100000
    }
  ]
}
```

## Users

### Get All Users (Admin Only)
```http
GET /users?page=1&limit=10&sort=createdAt
Authorization: Bearer <admin_token>
```

### Create User (Admin Only)
```http
POST /users
Authorization: Bearer <admin_token>
```

**Request Body**
```json
{
  "name": "Jane Smith",
  "email": "jane@example.com",
  "password": "password123",
  "phone": "9876543210",
  "role": "staff"
}
```

### Get Single User (Admin Only)
```http
GET /users/:id
Authorization: Bearer <admin_token>
```

### Update User (Admin Only)
```http
PUT /users/:id
Authorization: Bearer <admin_token>
```

### Delete User (Admin Only)
```http
DELETE /users/:id
Authorization: Bearer <admin_token>
```

### Upload User Photo (Admin Only)
```http
PUT /users/:id/photo
Authorization: Bearer <admin_token>
Content-Type: multipart/form-data
```

**Request Body**
- `file`: Image file (max 5MB, formats: jpg, jpeg, png, gif, webp)

## Error Responses

### Validation Error (400)
```json
{
  "success": false,
  "error": "Please provide a valid email"
}
```

### Authentication Error (401)
```json
{
  "success": false,
  "error": "Not authorized to access this route"
}
```

### Not Found Error (404)
```json
{
  "success": false,
  "error": "Resource not found"
}
```

### Rate Limit Error (429)
```json
{
  "success": false,
  "error": "Too many authentication attempts, please try again later."
}
```

### Server Error (500)
```json
{
  "success": false,
  "error": "Server Error"
}
```

## Response Format

All API responses follow this format:

### Success Response
```json
{
  "success": true,
  "data": { ... },
  "count": 10,
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 100,
    "pages": 10
  }
}
```

### Error Response
```json
{
  "success": false,
  "error": "Error message"
}
```

## Security Features

### Rate Limiting
- **Authentication routes**: 5 requests per 15 minutes
- **General routes**: 100 requests per 15 minutes
- **Headers**: `ratelimit-limit`, `ratelimit-remaining`, `retry-after`

### Security Headers
- **Helmet**: Security headers for XSS, CSRF, and other attacks
- **CORS**: Configured for specific origins
- **XSS Protection**: Input sanitization
- **NoSQL Injection Protection**: Query sanitization

### Authentication
- **JWT Tokens**: Secure token-based authentication
- **Password Hashing**: Bcrypt with salt rounds
- **Role-based Access**: Guest, Staff, Admin roles

### Input Validation
- **Express Validator**: Comprehensive input validation
- **File Upload Security**: Type and size restrictions
- **Data Sanitization**: XSS and injection prevention

## Rate Limiting

The API implements rate limiting to prevent abuse:

### Auth Endpoints (`/auth/*`)
- **Limit**: 5 requests per 15 minutes
- **Headers**: 
  - `ratelimit-limit: 5`
  - `ratelimit-remaining: X`
  - `retry-after: X` (when limit exceeded)

### General Endpoints
- **Limit**: 100 requests per 15 minutes
- **Headers**: 
  - `ratelimit-limit: 100`
  - `ratelimit-remaining: X`

## Testing

### Test Scripts Available
- `npm run test:full` - Comprehensive API testing
- `npm run seed` - Seed mock data

### Manual Testing
Use tools like Postman, Insomnia, or curl to test endpoints.

### Example cURL Commands

**Register User**
```bash
curl -X POST http://localhost:5000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Test User","email":"test@example.com","password":"password123","phone":"1234567890","role":"guest"}'
```

**Get Hotels**
```bash
curl -X GET http://localhost:5000/api/v1/hotels
```

**Create Booking**
```bash
curl -X POST http://localhost:5000/api/v1/rooms/ROOM_ID/bookings \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"checkInDate":"2025-02-01","checkOutDate":"2025-02-05","numberOfGuests":2,"guestDetails":{"firstName":"John","lastName":"Doe","email":"john@example.com","phone":"1234567890"}}'
```

## Getting Started

### Prerequisites
- Node.js (v14 or higher)
- MongoDB
- npm or yarn

### Installation
1. Clone the repository
2. Install dependencies: `npm install`
3. Create `.env` file with required variables
4. Start MongoDB
5. Run the server: `npm run dev`
6. Seed mock data: `npm run seed`

### Environment Variables
```env
PORT=5000
NODE_ENV=development
MONGODB_URI=mongodb://localhost:27017/hotel_management
JWT_SECRET=your-super-secret-jwt-key-here-make-it-long-and-random-at-least-32-characters
JWT_EXPIRE=30d
JWT_COOKIE_EXPIRE=30
```

### Available Scripts
- `npm run dev` - Start development server
- `npm run start` - Start production server
- `npm run seed` - Seed mock data
- `npm run test:full` - Run comprehensive tests

---

## API Status: ✅ FULLY FUNCTIONAL

All endpoints are tested and working correctly with comprehensive security features active.
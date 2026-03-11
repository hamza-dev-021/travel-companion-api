import express from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

import User from '../models/User.js';
import ServiceProvider from '../models/ServiceProvider.js';
import HotelVerification from '../models/HotelVerification.js';
import TravelVerification from '../models/TravelVerification.js';
import Room from '../models/Room.js';
import Booking from '../models/Booking.js';
import RememberToken from '../models/RememberToken.js';
import { syncBookingStatuses } from '../utils/bookingAutomation.js';
import { generateSignedUploadUrl, getPrivateDocSignedUrl } from '../utils/storage.js';
import { sendBookingStatusEmail } from '../utils/email.js';


const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-key-change-in-prod';
const COOKIE_NAME = 'tc_token';
const REMEMBER_COOKIE_NAME = 'remember_me';

// Session cookie options (no maxAge => expires on browser close)
const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: false, // set true when using HTTPS in production
  sameSite: 'lax',
};

// Max file sizes handled entirely by frontend now
// Generic uploader no longer needs memory storage buffers

// Auth middleware for service providers with remember-me support
async function requireServiceProvider(req, res, next) {
  try {
    const jwtCookie = req.cookies[COOKIE_NAME];
    const rememberCookie = req.cookies[REMEMBER_COOKIE_NAME];

    let user = null;

    // 1) Try JWT session cookie first
    if (jwtCookie) {
      try {
        const payload = jwt.verify(jwtCookie, JWT_SECRET);
        user = await User.findById(payload.id);
      } catch {
        // ignore and fall back to remember-me
      }
    }

    // 2) If no valid session user, try remember-me cookie
    if (!user && rememberCookie) {
      const tokenHash = crypto.createHash('sha256').update(rememberCookie).digest('hex');
      const stored = await RememberToken.findOne({ tokenHash }).lean();

      if (stored && stored.expiresAt > new Date()) {
        user = await User.findById(stored.userId);

        if (user) {
          // Re-issue a fresh JWT session cookie for subsequent requests
          const newJwt = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
          res.cookie(COOKIE_NAME, newJwt, SESSION_COOKIE_OPTIONS);
        }
      }
    }

    if (!user) {
      return res.status(401).json({ message: 'Not authenticated.' });
    }

    if (user.role !== 'service-provider') {
      return res.status(403).json({ message: 'Only service providers can access this resource.' });
    }

    req.user = user;
    next();
  } catch (err) {
    console.error('requireServiceProvider error:', err);
    return res.status(500).json({ message: 'Internal server error.' });
  }
}

// Generate signed URLs for direct client uploads
router.post('/upload-urls', requireServiceProvider, async (req, res) => {
  try {
    const { files, folderName } = req.body;

    if (!Array.isArray(files) || files.length === 0) {
      return res.status(400).json({ message: 'No files specified for upload.' });
    }

    const urls = [];
    for (const file of files) {
      // isPublic=true for images (rooms/hotels), isPublic=false for documents (PDFs)
      const isPublic = file.type !== 'document';
      
      // Use the folderName provided by the frontend directly, allowing slashes for subfolders
      let prefix = file.type === 'document' ? 'hotel-verification' : 'hotel-rooms'; // fallback
      if (folderName) {
        prefix = folderName; // Allow the frontend to define the exact folder structure (e.g. "Hotel/Room")
      }

      const uploadData = await generateSignedUploadUrl(file.filename, isPublic, prefix);
      urls.push({
        filename: file.filename,
        originalId: file.id, // to map back on frontend
        signedUrl: uploadData.signedUrl,
        path: uploadData.path,
        // compute final public URL immediately for images (since bucket is public)
        publicUrl: isPublic ? `${process.env.SUPABASE_URL}/storage/v1/object/public/${process.env.SUPABASE_PUBLIC_BUCKET}/${uploadData.path}` : null
      });
    }

    return res.json({ urls });
  } catch (err) {
    console.error('POST /upload-urls error:', err);
    return res.status(500).json({ message: 'Failed to generate upload URLs.' });
  }
});

// Get current provider verification + services
router.get('/verification', requireServiceProvider, async (req, res) => {
  try {
    const user = req.user;

    const provider = await ServiceProvider.findOne({ userId: user._id });
    const hotels = await HotelVerification.find({ userId: user._id }).lean();
    const travel = await TravelVerification.findOne({ userId: user._id }).lean();

    if (travel && travel.documentKey) {
      try {
        travel.documentUrl = await getPrivateDocSignedUrl(travel.documentKey, 300);
      } catch (e) {
        console.error('Failed to generate signed URL for travel document', e);
      }
    }

    // Attach signed URLs for hotels too
    if (hotels && hotels.length > 0) {
      for (let h of hotels) {
        if (h.documentKey) {
          try {
            h.documentUrl = await getPrivateDocSignedUrl(h.documentKey, 300);
          } catch (e) {
            console.error('Failed to generate signed URL for hotel document', e);
          }
        }
      }
    }

    return res.json({
      services: provider && Array.isArray(provider.services) ? provider.services : [],
      verification: {
        hotels: Array.isArray(hotels) ? hotels : [],
        travel: travel || { status: 'not-submitted' },
      },
    });
  } catch (err) {
    console.error('GET /provider/verification error:', err);
    return res.status(500).json({ message: 'Internal server error.' });
  }
});

router.get('/bookings', requireServiceProvider, async (req, res) => {
  try {
    const user = req.user;
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;

    const hotels = await HotelVerification.find({ userId: user._id }).select('_id').lean();
    const hotelIds = hotels.map((h) => h._id);

    if (hotelIds.length === 0) {
      return res.json([]);
    }

    const query = { hotel: { $in: hotelIds } };
    if (status) query.status = status;

    // Lazy Sync: Update statuses for these hotels before returning
    await syncBookingStatuses(query);

    const bookings = await Booking.find(query)
      .populate({
        path: 'room',
        select: 'roomNumber roomType pricePerNight maxGuests',
      })
      .populate({
        path: 'user',
        select: 'firstName lastName email',
      })
      .populate({
        path: 'hotel',
        select: 'name address.city address.province',
      })
      .sort({ createdAt: -1 })
      .lean();

    return res.json(Array.isArray(bookings) ? bookings : []);
  } catch (err) {
    console.error('GET /provider/bookings error:', err);
    return res.status(500).json({ message: 'Internal server error.' });
  }
});

router.patch('/bookings/:bookingId/status', requireServiceProvider, async (req, res) => {
  try {
    const user = req.user;
    const { status, cancellationReason } = req.body || {};

    const validStatuses = ['confirmed', 'cancelled', 'rejected', 'checked-in', 'checked-out'];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({ message: 'Invalid status. Use confirmed, cancelled, rejected, checked-in, or checked-out.' });
    }

    const booking = await Booking.findById(req.params.bookingId);
    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    const ownsHotel = await HotelVerification.exists({ _id: booking.hotel, userId: user._id });
    if (!ownsHotel) {
      return res.status(403).json({ message: 'Not authorized.' });
    }

    // Validation logic for transitions
    if (status === 'confirmed' || status === 'cancelled' || status === 'rejected') {
      if (booking.status !== 'pending') {
        return res.status(400).json({ message: 'Only pending bookings can be accepted/rejected/cancelled.' });
      }
    }

    if (status === 'checked-in') {
      if (booking.status !== 'confirmed') {
        return res.status(400).json({ message: 'Only confirmed bookings can be checked-in.' });
      }
    }

    if (status === 'checked-out') {
      if (booking.status !== 'checked-in') {
        return res.status(400).json({ message: 'Only checked-in bookings can be checked-out.' });
      }
    }

    if (status === 'confirmed') {
      const room = await Room.findById(booking.room).lean();
      if (!room) {
        return res.status(404).json({ message: 'Room not found' });
      }

      const overlapping = await Booking.exists({
        room: booking.room,
        _id: { $ne: booking._id },
        status: { $in: ['confirmed', 'checked-in'] },
        checkInDate: { $lt: booking.checkOutDate },
        checkOutDate: { $gt: booking.checkInDate },
      });

      if (overlapping) {
        return res.status(400).json({ message: `Room ${room.roomNumber} is already booked for the selected dates.` });
      }
    }

    booking.status = status;
    if ((status === 'cancelled' || status === 'rejected') && cancellationReason) {
      booking.cancellationReason = cancellationReason;
      booking.cancellationDate = new Date();
    }

    await booking.save();

    const updated = await Booking.findById(booking._id)
      .populate({
        path: 'room',
        select: 'roomNumber roomType pricePerNight maxGuests',
      })
      .populate({
        path: 'user',
        select: 'firstName lastName email',
      })
      .populate({
        path: 'hotel',
        select: 'name address.city address.province',
      });

    try {
      const { sendNotificationToUser } = await import('../controllers/notificationController.js');

      // Notify Traveller
      await sendNotificationToUser(
        updated.user._id,
        {
          sender: user._id,
          type: 'BOOKING_RESPONSE',
          relatedType: 'BOOKING',
          relatedId: updated._id,
          message: `${status} your booking request`
        }
      );

      // Notify Admins
      const admins = await User.find({ role: 'admin' }).select('_id');
      for (const admin of admins) {
        await sendNotificationToUser(
          admin._id,
          {
            sender: user._id,
            type: 'BOOKING_RESPONSE',
            relatedType: 'BOOKING',
            relatedId: updated._id,
            message: `${status} a booking request`
          }
        );
      }

      // Send Email Notification to Traveler
      await sendBookingStatusEmail(updated, status, cancellationReason);

    } catch (e) {
      console.error('Failed to notify about booking status update', e);
    }

    return res.json(updated);
  } catch (err) {
    console.error('PATCH /provider/bookings/:bookingId/status error:', err);
    return res.status(500).json({ message: 'Internal server error.' });
  }
});

// Get a specific hotel owned by the current provider
router.get('/hotels/:hotelId', requireServiceProvider, async (req, res) => {
  try {
    const user = req.user;
    const hotel = await HotelVerification.findOne({ _id: req.params.hotelId, userId: user._id }).lean();

    if (!hotel) {
      return res.status(404).json({ message: 'Hotel not found' });
    }

    return res.json(hotel);
  } catch (err) {
    console.error('GET /provider/hotels/:hotelId error:', err);
    return res.status(500).json({ message: 'Internal server error.' });
  }
});

// Get all rooms for a specific hotel owned by the current provider
router.get('/hotels/:hotelId/rooms', requireServiceProvider, async (req, res) => {
  try {
    const user = req.user;
    const hotel = await HotelVerification.findOne({ _id: req.params.hotelId, userId: user._id });

    if (!hotel) {
      return res.status(404).json({ message: 'Hotel not found' });
    }

    const rooms = await Room.find({ hotel: hotel._id }).lean();
    return res.json(rooms);
  } catch (err) {
    console.error('GET /provider/hotels/:hotelId/rooms error:', err);
    return res.status(500).json({ message: 'Internal server error.' });
  }
});

// Create a room for a specific approved hotel, enforcing the totalRooms limit
// Expects images array to be passed in JSON body containing uploaded image URLs
router.post('/hotels/:hotelId/rooms', requireServiceProvider, async (req, res) => {
  try {
    const user = req.user;
    const hotel = await HotelVerification.findOne({ _id: req.params.hotelId, userId: user._id });

    if (!hotel) {
      return res.status(404).json({ message: 'Hotel not found' });
    }

    if (hotel.status !== 'approved') {
      return res.status(400).json({ message: 'You can only add rooms to approved hotels.' });
    }

    const existingCount = await Room.countDocuments({ hotel: hotel._id });
    if (typeof hotel.totalRooms === 'number' && existingCount >= hotel.totalRooms) {
      return res.status(400).json({ message: 'You have reached the maximum number of rooms for this hotel.' });
    }

    const {
      roomNumber,
      roomType,
      description,
      pricePerNight,
      maxGuests,
      images = [],
    } = req.body;

    let amenities = [];
    if (Array.isArray(req.body.amenities)) {
      amenities = req.body.amenities;
    } else if (typeof req.body.amenities === 'string' && req.body.amenities.trim()) {
      amenities = [req.body.amenities.trim()];
    }

    if (!Array.isArray(images) || images.length < 1) {
      return res.status(400).json({ message: 'At least 1 image is required for the room.' });
    }

    if (images.length > 2) {
      return res.status(400).json({ message: 'Maximum 2 images are allowed for the room.' });
    }

    const room = await Room.create({
      hotel: hotel._id,
      roomNumber,
      roomType,
      description,
      pricePerNight,
      maxGuests,
      amenities,
      images: images,
      status: 'available', // Immediately available
    });

    res.status(201).json({ room });

  } catch (err) {
    console.error('POST /provider/hotels/:hotelId/rooms error:', err);
    if (!res.headersSent) {
      if (err.code === 11000) {
        return res.status(400).json({ message: 'A room with this number already exists in this hotel.' });
      }
      return res.status(500).json({ message: err.message || 'Internal server error.' });
    }
  }
});

// Bulk create rooms for a specific approved hotel
router.post('/hotels/:hotelId/rooms/bulk', requireServiceProvider, async (req, res) => {
  try {
    const user = req.user;
    const hotel = await HotelVerification.findOne({ _id: req.params.hotelId, userId: user._id });

    if (!hotel) {
      return res.status(404).json({ message: 'Hotel not found' });
    }

    if (hotel.status !== 'approved') {
      return res.status(400).json({ message: 'You can only add rooms to approved hotels.' });
    }

    const {
      roomNumbers: rawRoomNumbers,
      roomType,
      description,
      pricePerNight,
      maxGuests,
      images = [],
    } = req.body;

    // Parse room numbers (supports "101, 102, 110-115")
    const roomNumbers = [];
    if (typeof rawRoomNumbers === 'string') {
      const parts = rawRoomNumbers.split(',').map(p => p.trim()).filter(Boolean);
      for (const part of parts) {
        if (part.includes('-')) {
          const [start, end] = part.split('-').map(n => parseInt(n.trim()));
          if (!isNaN(start) && !isNaN(end) && start <= end) {
            for (let i = start; i <= end; i++) roomNumbers.push(i.toString());
          }
        } else {
          roomNumbers.push(part);
        }
      }
    }

    if (roomNumbers.length === 0) {
      return res.status(400).json({ message: 'Please provide at least one valid room number.' });
    }

    // Limit batch size to prevent abuse (e.g., max 50 at a time)
    if (roomNumbers.length > 50) {
      return res.status(400).json({ message: 'Maximum 50 rooms can be added at once.' });
    }

    const existingCount = await Room.countDocuments({ hotel: hotel._id });
    if (typeof hotel.totalRooms === 'number' && (existingCount + roomNumbers.length) > hotel.totalRooms) {
      return res.status(400).json({ message: `Adding ${roomNumbers.length} rooms would exceed the hotel's limit of ${hotel.totalRooms} rooms.` });
    }

    // Check for duplicates in the current hotel
    const duplicates = await Room.find({ hotel: hotel._id, roomNumber: { $in: roomNumbers } }).select('roomNumber');
    if (duplicates.length > 0) {
      return res.status(400).json({
        message: `The following room numbers already exist: ${duplicates.map(d => d.roomNumber).join(', ')}`
      });
    }

    let amenities = [];
    if (Array.isArray(req.body.amenities)) {
      amenities = req.body.amenities;
    } else if (typeof req.body.amenities === 'string' && req.body.amenities.trim()) {
      amenities = [req.body.amenities.trim()];
    }

    if (!Array.isArray(images) || images.length < 1) {
      return res.status(400).json({ message: 'At least 1 image is required for the rooms.' });
    }

    const createdRooms = [];
    for (const num of roomNumbers) {
      const room = await Room.create({
        hotel: hotel._id,
        roomNumber: num,
        roomType,
        description,
        pricePerNight,
        maxGuests,
        amenities,
        images: images,
        status: 'available',
      });
      createdRooms.push(room);
    }

    res.status(201).json({ message: `Successfully created ${createdRooms.length} rooms.`, rooms: createdRooms });

  } catch (err) {
    console.error('POST /provider/hotels/:hotelId/rooms/bulk error:', err);
    if (!res.headersSent) {
      if (err.code === 11000) {
        return res.status(400).json({ message: 'One or more of these room numbers already exist in this hotel.' });
      }
      return res.status(500).json({ message: err.message || 'Internal server error.' });
    }
  }
});

// Polling endpoint to check if background room upload finished
router.get('/hotels/:hotelId/rooms/:roomId/status', requireServiceProvider, async (req, res) => {
  try {
    const hotel = await HotelVerification.findOne({ _id: req.params.hotelId, userId: req.user._id }).lean();
    if (!hotel) return res.status(404).json({ status: 'error', message: 'Not authorized' });

    const room = await Room.findOne({ _id: req.params.roomId, hotel: hotel._id }).lean();
    if (!room) {
      // Deleted due to failure
      return res.json({ status: 'failed', message: 'Failed to upload room images. Please check your connection and try again.' });
    }

    if (room.images && room.images.length >= 1) {
      return res.json({ status: 'success', room });
    }
    return res.json({ status: 'uploading' });
  } catch (err) {
    console.error('Room polling error:', err);
    return res.status(500).json({ status: 'error' });
  }
});

// Update a room for a specific approved hotel owned by the current provider
router.patch('/hotels/:hotelId/rooms/:roomId', requireServiceProvider, async (req, res) => {
  try {
    const user = req.user;
    const hotel = await HotelVerification.findOne({ _id: req.params.hotelId, userId: user._id });

    if (!hotel) {
      return res.status(404).json({ message: 'Hotel not found' });
    }

    if (hotel.status !== 'approved') {
      return res.status(400).json({ message: 'You can only manage rooms for approved hotels.' });
    }

    const room = await Room.findOne({ _id: req.params.roomId, hotel: hotel._id });
    if (!room) {
      return res.status(404).json({ message: 'Room not found' });
    }

    const allowedFields = [
      'roomNumber',
      'roomType',
      'description',
      'pricePerNight',
      'maxGuests',
      'amenities',
      'isAvailable',
      'status',
      'lastCleaned',
      'images', // Allow frontend to update images directly
    ];

    // Check for active bookings before allowing status/availability changes
    const hasStatusOrAvailabilityChange = Object.prototype.hasOwnProperty.call(req.body, 'status') || Object.prototype.hasOwnProperty.call(req.body, 'isAvailable');

    if (hasStatusOrAvailabilityChange) {
      const mongoose = await import('mongoose'); // For booking model access if not imported
      const Booking = mongoose.default.model('Booking');
      const activeBookingsCount = await Booking.countDocuments({
        room: room._id,
        status: { $in: ['pending', 'confirmed', 'checked-in'] }
      });

      if (activeBookingsCount > 0) {
        if (Object.prototype.hasOwnProperty.call(req.body, 'isAvailable') && req.body.isAvailable === false) {
          return res.status(400).json({ message: 'Cannot set room to unavailable while there are active bookings.' });
        }
        if (req.body.status === 'occupied' || req.body.status === 'unavailable') {
          return res.status(400).json({ message: 'Cannot set status to unavailable or occupied while the room has active bookings.' });
        }
      }

      // Prevent manual assignment of 'occupied' ever, since that's handled by bookings checking in
      if (req.body.status === 'occupied') {
        return res.status(400).json({ message: 'Cannot manually set status to occupied. This is done automatically when guests check in.' });
      }
    }

    for (const field of allowedFields) {
      if (Object.prototype.hasOwnProperty.call(req.body, field)) {
        if (field === 'pricePerNight' || field === 'maxGuests') {
          room[field] = Number(req.body[field]);
        } else if (field === 'amenities' || field === 'images') {
          room[field] = Array.isArray(req.body[field]) ? req.body[field] : [req.body[field]];
        } else {
          room[field] = req.body[field];
        }
      }
    }

    await room.save();
    return res.json({ message: 'Room updated successfully.', room });
  } catch (err) {
    console.error('PATCH /provider/hotels/:hotelId/rooms/:roomId error:', err);
    return res.status(500).json({ message: 'Internal server error.' });
  }
});

/**
 * Bulk Delete rooms for a specific hotel owned by the current provider
 * Accepts { roomIds: string[] }
 */
router.delete('/hotels/:hotelId/rooms/bulk', requireServiceProvider, async (req, res) => {
  try {
    const { hotelId } = req.params;
    const { roomIds } = req.body;

    if (!Array.isArray(roomIds) || roomIds.length === 0) {
      return res.status(400).json({ message: 'No room IDs provided.' });
    }

    const hotel = await HotelVerification.findOne({ _id: hotelId, userId: req.user._id });
    if (!hotel) {
      return res.status(404).json({ message: 'Hotel not found' });
    }

    const rooms = await Room.find({ _id: { $in: roomIds }, hotel: hotel._id });
    if (rooms.length === 0) {
      return res.status(404).json({ message: 'No matching rooms found.' });
    }

    const deletedRoomIds = [];
    const blockedRooms = [];

    for (const room of rooms) {
      // Check for active bookings
      const activeBookings = await Booking.countDocuments({
        room: room._id,
        status: { $in: ['confirmed', 'checked-in', 'pending'] }
      });

      if (activeBookings > 0) {
        blockedRooms.push({
          id: room._id,
          roomNumber: room.roomNumber,
          reason: `Has ${activeBookings} active/pending bookings.`
        });
      } else {
        await Room.findByIdAndDelete(room._id);
        deletedRoomIds.push(room._id);
      }
    }

    return res.json({
      message: 'Bulk deletion process completed.',
      deletedCount: deletedRoomIds.length,
      blockedCount: blockedRooms.length,
      blockedRooms
    });
  } catch (err) {
    console.error('DELETE /provider/hotels/:hotelId/rooms/bulk error:', err);
    return res.status(500).json({ message: 'Internal server error.' });
  }
});

// Delete a room for a specific hotel owned by the current provider
router.delete('/hotels/:hotelId/rooms/:roomId', requireServiceProvider, async (req, res) => {
  try {
    const user = req.user;
    const hotel = await HotelVerification.findOne({ _id: req.params.hotelId, userId: user._id });

    if (!hotel) {
      return res.status(404).json({ message: 'Hotel not found' });
    }

    const room = await Room.findOne({ _id: req.params.roomId, hotel: hotel._id });
    if (!room) {
      return res.status(404).json({ message: 'Room not found' });
    }

    // Check if room has active bookings
    const activeBookings = await Booking.countDocuments({
      room: req.params.roomId,
      status: { $in: ['confirmed', 'checked-in', 'pending'] }
    });

    if (activeBookings > 0) {
      return res.status(400).json({ message: `Cannot delete room with ${activeBookings} active or pending bookings.` });
    }

    await Room.findByIdAndDelete(req.params.roomId);
    return res.json({ message: 'Room deleted successfully.' });
  } catch (err) {
    console.error('DELETE /provider/hotels/:hotelId/rooms/:roomId error:', err);
    return res.status(500).json({ message: 'Internal server error.' });
  }
});

// Submit or update hotel verification details
// Accepts a required PDF document (field: document) and optional hotel image (field: image)
router.post(
  '/verify/hotel',
  requireServiceProvider,
  async (req, res) => {
    try {
      const user = req.user;

      const {
        name,
        description,
        starRating,
        totalRooms,
        amenities = [],
        checkInTime,
        checkOutTime,
        cancellationPolicy,
      } = req.body;

      const address = {
        hotelAddress: (req.body.address?.hotelAddress || req.body['address[hotelAddress]'] || req.body.hotelAddress || '').trim(),
        city: (req.body.address?.city || req.body['address[city]'] || req.body.city || '').trim(),
        province: (req.body.address?.province || req.body['address[province]'] || req.body.province || '').trim(),
      };

      const contact = {
        phone: (req.body.contact?.phone || req.body['contact[phone]'] || req.body.phone || '').trim(),
        email: (req.body.contact?.email || req.body['contact[email]'] || req.body.email || '').trim(),
      };

      if (!contact.phone) {
        return res.status(400).json({ message: 'Phone number is required for the hotel.' });
      }

      const documentKey = req.body.documentKey || '';
      const images = Array.isArray(req.body.images) ? req.body.images : [];

      if (!documentKey) {
          return res.status(400).json({ message: 'Business document PDF is required.' });
      }

      if (images.length < 1) {
        return res.status(400).json({ message: 'At least 1 image is required for the hotel.' });
      }

      if (images.length > 2) {
        return res.status(400).json({ message: 'Maximum 2 images are allowed for the hotel.' });
      }

      const hotel = new HotelVerification({
        userId: user._id,
        status: 'pending',
        name,
        description,
        address,
        contact,
        starRating,
        totalRooms,
        amenities: Array.isArray(amenities) ? amenities : [],
        checkInTime,
        checkOutTime,
        cancellationPolicy,
        documentKey,
        images,
      });

      await hotel.save();

      try {
        const { sendNotificationToUser } = await import('../controllers/notificationController.js');
        const admins = await User.find({ role: 'admin' }).select('_id');
        for (const admin of admins) {
          await sendNotificationToUser(
            admin._id,
            {
              sender: user._id,
              type: 'VERIFICATION_REQUEST',
              relatedType: 'HOTEL',
              relatedId: hotel._id,
              message: 'submitted a hotel verification request'
            }
          );
        }
      } catch (e) { console.error('Failed to notify admins of hotel verification', e); }

      return res.json({
        message: 'Hotel verification submitted successfully.',
        verification: hotel,
      });


    } catch (error) {
      console.error('Hotel verification error:', error);
      const message =
        error && error.message === 'Only PDF files are allowed.'
          ? 'Only PDF files are allowed for hotel verification documents.'
          : 'Internal server error.';
      if (!res.headersSent) {
        return res.status(500).json({ message });
      }
    }
  });

// Polling endpoint to check if background upload finished (or if it was deleted due to failure)
router.get('/verify/hotel/:hotelId/status', requireServiceProvider, async (req, res) => {
  try {
    const hotel = await HotelVerification.findOne({ _id: req.params.hotelId, userId: req.user._id }).lean();
    if (!hotel) {
      // It was deleted due to background upload failure
      return res.json({ status: 'failed', message: 'Failed to upload images or documents. Please check your connection and try again.' });
    }
    // If it exists and has images, it's done
    if (hotel.images && hotel.images.length >= 1) {
      return res.json({ status: 'success', hotel });
    }
    // Otherwise still uploading
    return res.json({ status: 'uploading' });
  } catch (err) {
    console.error('Polling error:', err);
    return res.status(500).json({ status: 'error' });
  }
});

// Submit or update travel verification details
router.post('/verify/travel', requireServiceProvider, async (req, res) => {
  try {
    const user = req.user;
    const {
      companyName,
      licenseNumber,
      offersCar,
      offersBus,
      documentKey,
    } = req.body;

    let travel = await TravelVerification.findOne({ userId: user._id });
    if (!travel) {
      travel = new TravelVerification({ userId: user._id });
    }

    travel.status = 'pending';
    travel.companyName = companyName;
    travel.licenseNumber = licenseNumber;
    travel.offersCar = offersCar === true || offersCar === 'true';
    travel.offersBus = offersBus === true || offersBus === 'true';
    travel.documentUrl = '';
    travel.documentKey = documentKey || travel.documentKey;
    travel.rejectionReason = undefined; // clear previous reason on resubmit
    await travel.save();

    try {
      const { sendNotificationToUser } = await import('../controllers/notificationController.js');
      const admins = await User.find({ role: 'admin' }).select('_id');
      for (const admin of admins) {
        await sendNotificationToUser(
          admin._id,
          {
            sender: user._id,
            type: 'VERIFICATION_REQUEST',
            relatedType: 'VERIFICATION',
            relatedId: travel._id,
            message: 'submitted a travel verification request'
          }
        );
      }
    } catch (e) { console.error('Failed to notify admins of travel verification', e); }

    const travelResponse = travel.toJSON();
    if (travelResponse.documentKey) {
      try {
        travelResponse.documentUrl = await getPrivateDocSignedUrl(travelResponse.documentKey, 300);
      } catch (e) {
        console.error('Failed to generate signed URL for travel document', e);
      }
    }

    return res.json({
      message: 'Travel verification submitted successfully.',
      verification: travelResponse,
    });
  } catch (error) {
    console.error('Travel verification error:', error);
    return res.status(500).json({ message: 'Internal server error.' });
  }
});

// Get all reviews for services owned by the current provider
router.get('/reviews', requireServiceProvider, async (req, res) => {
  try {
    const user = req.user;

    // Get all hotels owned by this provider
    const hotels = await HotelVerification.find({ userId: user._id }).select('_id').lean();
    const hotelIds = hotels.map((h) => h._id);

    if (hotelIds.length === 0) {
      return res.json([]);
    }

    const { page = 1, limit = 10, sort = 'newest' } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    let sortOption = { createdAt: -1 };
    if (sort === 'highest-rating') sortOption = { rating: -1, createdAt: -1 };
    if (sort === 'lowest-rating') sortOption = { rating: 1, createdAt: -1 };

    // Fetch reviews for these hotels
    const Review = (await import('../models/Review.js')).default;

    const total = await Review.countDocuments({ service: { $in: hotelIds } });

    const rawReviews = await Review.find({ service: { $in: hotelIds } })
      .populate({
        path: 'user',
        select: 'firstName lastName photoUrl email',
      })
      .populate({
        path: 'service',
        model: 'HotelVerification',
        select: 'name',
      })
      .populate({
        path: 'booking',
        select: 'checkInDate checkOutDate room',
        populate: {
          path: 'room',
          select: 'roomNumber roomType'
        }
      })
      .sort(sortOption)
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    // Map service to hotel for frontend compatibility + add photoUrl for lean results
    const reviews = rawReviews.map((r) => ({
      ...r,
      hotel: r.service,
      user: r.user ? { ...r.user, photoUrl: `/api/profile/${r.user._id}/photo` } : r.user,
    }));

    return res.json({
      reviews,
      total,
      page: parseInt(page),
      hasMore: skip + reviews.length < total
    });
  } catch (error) {
    console.error('Provider reviews error:', error);
    return res.status(500).json({ message: 'Internal server error.' });
  }
});

// ─── Settings ─────────────────────────────────────────────
router.get('/settings', requireServiceProvider, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('preferences').lean();
    res.json({
      success: true,
      data: {
        notifications: user?.preferences?.notifications ?? true,
        emails: user?.preferences?.emails ?? true,
      },
    });
  } catch (error) {
    console.error('Provider settings fetch error:', error);
    res.status(500).json({ message: 'Internal server error.' });
  }
});

router.patch('/settings', requireServiceProvider, async (req, res) => {
  try {
    const allowed = ['notifications', 'emails'];
    const update = {};
    for (const key of allowed) {
      if (typeof req.body[key] === 'boolean') {
        update[`preferences.${key}`] = req.body[key];
      }
    }
    if (Object.keys(update).length === 0) {
      return res.status(400).json({ message: 'No valid settings provided.' });
    }
    await User.findByIdAndUpdate(req.user._id, { $set: update });
    res.json({ success: true, message: 'Settings updated.' });
  } catch (error) {
    console.error('Provider settings update error:', error);
    res.status(500).json({ message: 'Internal server error.' });
  }
});

// ─── Reports / Earnings ──────────────────────────────────
router.get('/reports', requireServiceProvider, async (req, res) => {
  try {
    const hotels = await HotelVerification.find({ userId: req.user._id }).lean();
    const hotelIds = hotels.map((h) => h._id);

    const bookings = await Booking.find({ hotel: { $in: hotelIds } })
      .populate('room', 'roomType roomNumber pricePerNight')
      .populate('hotel', 'name')
      .populate('user', 'firstName lastName email')
      .sort({ createdAt: -1 })
      .lean();

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    // Overall stats
    const confirmedStatuses = ['confirmed', 'checked-in', 'checked-out'];
    const confirmedBookings = bookings.filter((b) => confirmedStatuses.includes(b.status));
    const totalRevenue = confirmedBookings.reduce((s, b) => s + (Number(b.totalPrice) || 0), 0);
    const totalBookings = bookings.length;
    const cancelledBookings = bookings.filter((b) => b.status === 'cancelled' || b.status === 'rejected').length;
    const avgBookingValue = confirmedBookings.length ? Math.round(totalRevenue / confirmedBookings.length) : 0;

    // Monthly revenue breakdown (current year)
    const monthlyRevenue = Array(12).fill(0);
    const monthlyBookingCounts = Array(12).fill(0);
    confirmedBookings.forEach((b) => {
      const d = new Date(b.checkInDate || b.createdAt);
      if (d.getFullYear() === currentYear) {
        monthlyRevenue[d.getMonth()] += Number(b.totalPrice) || 0;
        monthlyBookingCounts[d.getMonth()] += 1;
      }
    });

    // Daily revenue (current month)
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const dailyRevenue = Array(daysInMonth).fill(0);
    confirmedBookings.forEach((b) => {
      const d = new Date(b.checkInDate || b.createdAt);
      if (d.getFullYear() === currentYear && d.getMonth() === currentMonth) {
        dailyRevenue[d.getDate() - 1] += Number(b.totalPrice) || 0;
      }
    });

    // Revenue per hotel
    const revenueByHotel = {};
    confirmedBookings.forEach((b) => {
      const name = b.hotel?.name || 'Unknown';
      if (!revenueByHotel[name]) revenueByHotel[name] = { revenue: 0, bookings: 0 };
      revenueByHotel[name].revenue += Number(b.totalPrice) || 0;
      revenueByHotel[name].bookings += 1;
    });

    // Revenue per room type
    const revenueByRoomType = {};
    confirmedBookings.forEach((b) => {
      const type = b.room?.roomType || 'unknown';
      if (!revenueByRoomType[type]) revenueByRoomType[type] = { revenue: 0, bookings: 0 };
      revenueByRoomType[type].revenue += Number(b.totalPrice) || 0;
      revenueByRoomType[type].bookings += 1;
    });

    // Booking status distribution
    const statusDistribution = {};
    bookings.forEach((b) => {
      statusDistribution[b.status] = (statusDistribution[b.status] || 0) + 1;
    });

    // Occupancy rate (current month): occupied room-nights / total available room-nights
    const totalRooms = hotels.reduce((s, h) => s + (h.totalRooms || 0), 0);
    const occupiedNights = confirmedBookings
      .filter((b) => {
        const d = new Date(b.checkInDate || b.createdAt);
        return d.getFullYear() === currentYear && d.getMonth() === currentMonth;
      })
      .reduce((s, b) => {
        const checkIn = new Date(b.checkInDate);
        const checkOut = new Date(b.checkOutDate);
        return s + Math.max(1, Math.ceil((checkOut - checkIn) / (1000 * 60 * 60 * 24)));
      }, 0);
    const totalAvailableNights = totalRooms * daysInMonth;
    const occupancyRate = totalAvailableNights > 0 ? Math.round((occupiedNights / totalAvailableNights) * 100) : 0;

    // Recent transactions (last 10 confirmed)
    const recentTransactions = confirmedBookings.slice(0, 10).map((b) => ({
      _id: b._id,
      reference: b.bookingReference,
      guest: b.user ? `${b.user.firstName} ${b.user.lastName}` : b.guestDetails?.firstName || 'Guest',
      hotel: b.hotel?.name || 'N/A',
      room: b.room?.roomType || 'N/A',
      checkIn: b.checkInDate,
      checkOut: b.checkOutDate,
      amount: b.totalPrice,
      status: b.status,
      paymentStatus: b.paymentStatus,
      date: b.createdAt,
    }));

    res.json({
      success: true,
      data: {
        totalRevenue,
        totalBookings,
        confirmedBookings: confirmedBookings.length,
        cancelledBookings,
        avgBookingValue,
        occupancyRate,
        monthlyRevenue,
        monthlyBookingCounts,
        dailyRevenue,
        revenueByHotel,
        revenueByRoomType,
        statusDistribution,
        recentTransactions,
      },
    });
  } catch (error) {
    console.error('Provider reports error:', error);
    res.status(500).json({ message: 'Internal server error.' });
  }
});

export default router;

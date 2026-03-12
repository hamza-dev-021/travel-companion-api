import express from 'express';
import User from '../models/User.js';
import ServiceProvider from '../models/ServiceProvider.js';
import HotelVerification from '../models/HotelVerification.js';
import TravelVerification from '../models/TravelVerification.js';
import Room from '../models/Room.js';
import Booking from '../models/Booking.js';
import { getPrivateDocSignedUrl } from '../utils/storage.js';
import { sendVerificationStatusEmail } from '../utils/email.js';

const router = express.Router();

// Basic admin statistics derived from the User collection
router.get('/stats', async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const serviceProviders = await User.countDocuments({ role: 'service-provider' });
    const travellers = await User.countDocuments({ role: 'traveller' });
    const admins = await User.countDocuments({ role: 'admin' });

    return res.json({
      totalUsers,
      serviceProviders,
      travellers,
      admins,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to load admin stats', err);
    return res.status(500).json({ message: 'Failed to load admin stats' });
  }
});

// Update verification status for a specific hotel document (per-hotel approval)
router.patch('/hotels/:hotelId/verification', async (req, res) => {
  try {
    const { hotelStatus, hotelReason } = req.body;
    const allowedStatuses = ['not-submitted', 'pending', 'approved', 'rejected'];

    if (!hotelStatus || !allowedStatuses.includes(hotelStatus)) {
      return res.status(400).json({ message: 'Invalid or missing hotelStatus.' });
    }

    let hotel = await HotelVerification.findById(req.params.hotelId);
    if (!hotel) {
      return res.status(404).json({ message: 'Hotel verification not found' });
    }

    // Trigger Lazy Migration for HotelVerification
    if (typeof hotel.ensureConsistency === 'function') {
      if (hotel.ensureConsistency()) {
        await hotel.save();
      }
    }

    const currentHotelStatus = hotel.status || 'not-submitted';

    if (
      (currentHotelStatus === 'approved' || currentHotelStatus === 'rejected') &&
      hotelStatus !== currentHotelStatus
    ) {
      return res.status(400).json({
        message:
          'This hotel verification has already been decided. Provider must resubmit to change status.',
      });
    }

    if (hotelStatus === 'rejected' && (!hotelReason || !hotelReason.trim())) {
      return res.status(400).json({ message: 'Rejection reason is required for hotel.' });
    }

    hotel.status = hotelStatus;
    hotel.rejectionReason = hotelStatus === 'rejected' ? hotelReason?.trim() : undefined;
    await hotel.save();

    try {
      const { sendNotificationToUser } = await import('../controllers/notificationController.js');
      await sendNotificationToUser(
        hotel.userId,
        {
          sender: req.user ? req.user._id : null,
          type: 'VERIFICATION_RESPONSE',
          relatedType: 'HOTEL',
          relatedId: hotel._id,
          message: `${hotelStatus} your hotel verification request`
        }
      );

      // Send Email Notification to Provider
      const providerUser = await User.findById(hotel.userId).select('email firstName lastName');
      if (providerUser) {
        const providerName = providerUser.firstName ? `${providerUser.firstName} ${providerUser.lastName}`.trim() : 'Service Provider';
        await sendVerificationStatusEmail(providerUser.email, providerName, hotel.name, 'Hotel', hotelStatus, hotel.rejectionReason);
      }

    } catch (e) {
      console.error('Failed to send verification response notification / email', e);
    }

    return res.json({
      id: hotel._id,
      status: hotel.status,
      rejectionReason: hotel.rejectionReason,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to update hotel verification', err);
    return res.status(500).json({ message: 'Failed to update hotel verification' });
  }
});

// List all users for admin user management
router.get('/users', async (req, res) => {
  try {
    const users = await User.find({}, 'firstName lastName email role isActive createdAt').sort({ createdAt: -1 });

    const userIds = users.map((u) => u._id);
    const providers = await ServiceProvider.find({ userId: { $in: userIds } });
    const providerMap = new Map(providers.map((p) => [String(p.userId), p]));

    const formatted = users.map((u) => {
      const provider = providerMap.get(String(u._id));
      const services = provider && Array.isArray(provider.services) ? provider.services : [];

      return {
        id: u._id,
        name: `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email,
        email: u.email,
        role: u.role,
        services,
        isActive: u.isActive !== false,
        joinDate: u.createdAt,
      };
    });

    return res.json(formatted);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to load admin users', err);
    return res.status(500).json({ message: 'Failed to load users' });
  }
});

// Get a single user with verification details
router.get('/users/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select(
      'firstName lastName email role createdAt'
    );
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Trigger Lazy Migration for User
    if (typeof user.ensureConsistency === 'function') {
      if (user.ensureConsistency()) {
        await user.save();
      }
    }

    const provider = await ServiceProvider.findOne({ userId: user._id });
    // Load all hotel verifications for this provider (most recent first)
    const hotelVerifications = await HotelVerification.find({ userId: user._id }).sort({ createdAt: -1 });
    
    // Trigger Lazy Migration for each HotelVerification
    for (const hv of hotelVerifications) {
      if (typeof hv.ensureConsistency === 'function') {
        if (hv.ensureConsistency()) {
          await hv.save();
        }
      }
    }

    let latestHotelVerification = hotelVerifications && hotelVerifications.length > 0 ? hotelVerifications[0] : null;
    let travelVerification = await TravelVerification.findOne({ userId: user._id });

    // Trigger Lazy Migration for TravelVerification
    if (travelVerification && typeof travelVerification.ensureConsistency === 'function') {
      if (travelVerification.ensureConsistency()) {
        await travelVerification.save();
      }
    }

    // Attach signed URLs for private documents (hotel + travel) so admin can view them
    for (let i = 0; i < hotelVerifications.length; i += 1) {
      const hv = hotelVerifications[i];
      if (hv.documentKey) {
        try {
          const signedUrl = await getPrivateDocSignedUrl(hv.documentKey, 300);
          hv.documentUrl = signedUrl;
        } catch (e) {
          // eslint-disable-next-line no-console
          console.error('Failed to generate signed URL for hotel document', e);
        }
      }
    }

    if (latestHotelVerification && latestHotelVerification.documentKey && !latestHotelVerification.documentUrl) {
      try {
        const signedUrl = await getPrivateDocSignedUrl(latestHotelVerification.documentKey, 300);
        latestHotelVerification.documentUrl = signedUrl;
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('Failed to generate signed URL for latest hotel document', e);
      }
    }

    if (travelVerification && travelVerification.documentKey) {
      try {
        const signedUrl = await getPrivateDocSignedUrl(travelVerification.documentKey, 300);
        travelVerification.documentUrl = signedUrl;
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('Failed to generate signed URL for travel document', e);
      }
    }

    return res.json({
      id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      role: user.role,
      services: provider && Array.isArray(provider.services) ? provider.services : [],
      verification: {
        hotel: latestHotelVerification || { status: 'not-submitted' },
        hotels: Array.isArray(hotelVerifications) ? hotelVerifications : [],
        travel: travelVerification || { status: 'not-submitted' },
      },
      createdAt: user.createdAt,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to load user', err);
    return res.status(500).json({ message: 'Failed to load user' });
  }
});

// Update basic user details (name, email, role, services)
router.patch('/users/:id', async (req, res) => {
  try {
    const { firstName, lastName, email, role, services } = req.body;

    const allowedRoles = ['traveller', 'service-provider', 'admin'];
    const update = {};

    if (typeof firstName === 'string') update.firstName = firstName.trim();
    if (typeof lastName === 'string') update.lastName = lastName.trim();
    if (typeof email === 'string') update.email = email.trim().toLowerCase();
    if (typeof role === 'string' && allowedRoles.includes(role)) {
      update.role = role;
    }
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { $set: update },
      { new: true, runValidators: true }
    ).select('firstName lastName email role createdAt');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // If services array is provided, sync it to the ServiceProvider document
    if (Array.isArray(services)) {
      let provider = await ServiceProvider.findOne({ userId: user._id });
      if (!provider) {
        provider = new ServiceProvider({ userId: user._id, services: [] });
      }
      provider.services = services;
      await provider.save();
    }

    return res.json({
      id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      role: user.role,
      // Reflect services from the ServiceProvider model
      services: Array.isArray(services) ? services : [],
      verification: user.verification || {},
      createdAt: user.createdAt,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to update user', err);
    return res.status(500).json({ message: 'Failed to update user' });
  }
});

// Delete a user
router.delete('/users/:id', async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    // Clean up associated provider and verification docs
    await ServiceProvider.deleteOne({ userId: user._id });
    await HotelVerification.deleteMany({ userId: user._id });
    await TravelVerification.deleteOne({ userId: user._id });
    return res.json({ message: 'User deleted successfully' });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to delete user', err);
    return res.status(500).json({ message: 'Failed to delete user' });
  }
});

// Toggle user active status
router.patch('/users/:id/toggle-active', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    if (user.role === 'admin') {
      return res.status(400).json({ message: 'Cannot deactivate an admin user.' });
    }
    user.isActive = !user.isActive;
    await user.save();
    return res.json({ message: `User ${user.isActive ? 'activated' : 'deactivated'} successfully.`, isActive: user.isActive });
  } catch (err) {
    console.error('Failed to toggle user active status', err);
    return res.status(500).json({ message: 'Failed to toggle user status' });
  }
});

// List service providers with verification summary for management
router.get('/providers', async (req, res) => {
  try {
    const users = await User.find({ role: 'service-provider' }, 'firstName lastName email createdAt').sort({ createdAt: -1 });

    const userIds = users.map((u) => u._id);
    const providers = await ServiceProvider.find({ userId: { $in: userIds } });
    const hotels = await HotelVerification.find({ userId: { $in: userIds } }).sort({ createdAt: -1 });
    const travels = await TravelVerification.find({ userId: { $in: userIds } });

    const providerMap = new Map(providers.map((p) => [String(p.userId), p]));
    // For hotels, keep only the most recent per userId
    const hotelMap = new Map();
    hotels.forEach((h) => {
      const key = String(h.userId);
      if (!hotelMap.has(key)) hotelMap.set(key, h);
    });
    const travelMap = new Map(travels.map((t) => [String(t.userId), t]));

    const formatted = users.map((u) => {
      const provider = providerMap.get(String(u._id));
      const hotel = hotelMap.get(String(u._id));
      const travel = travelMap.get(String(u._id));

      return {
        id: u._id,
        name: `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email,
        email: u.email,
        services: provider && Array.isArray(provider.services) ? provider.services : [],
        hotelStatus: hotel ? hotel.status : 'not-submitted',
        hotelName: hotel ? hotel.name || null : null,
        travelStatus: travel ? travel.status : 'not-submitted',
        travelCompanyName: travel ? travel.companyName || null : null,
        createdAt: u.createdAt,
      };
    });

    return res.json(formatted);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to load service providers', err);
    return res.status(500).json({ message: 'Failed to load service providers' });
  }
});

// Update verification status for a specific service provider
router.patch('/providers/:id/verification', async (req, res) => {
  try {
    const { hotelStatus, travelStatus, hotelReason, travelReason } = req.body;
    const allowedStatuses = ['not-submitted', 'pending', 'approved', 'rejected'];

    const user = await User.findOne({ _id: req.params.id, role: 'service-provider' }).select(
      'firstName lastName email createdAt'
    );

    if (!user) {
      return res.status(404).json({ message: 'Service provider not found' });
    }
    // When multiple hotel verifications exist, operate on the most recent one
    let hotel = await HotelVerification.findOne({ userId: user._id }).sort({ createdAt: -1 });
    let travel = await TravelVerification.findOne({ userId: user._id });

    // Trigger Lazy Migration for Hotel
    if (hotel && typeof hotel.ensureConsistency === 'function') {
      if (hotel.ensureConsistency()) {
        await hotel.save();
      }
    }

    // Trigger Lazy Migration for Travel
    if (travel && typeof travel.ensureConsistency === 'function') {
      if (travel.ensureConsistency()) {
        await travel.save();
      }
    }

    const currentHotelStatus = hotel ? hotel.status : 'not-submitted';
    const currentTravelStatus = travel ? travel.status : 'not-submitted';

    if (hotelStatus && allowedStatuses.includes(hotelStatus)) {
      if (!hotel) {
        hotel = new HotelVerification({ userId: user._id, status: 'not-submitted' });
      }

      if (
        (currentHotelStatus === 'approved' || currentHotelStatus === 'rejected') &&
        hotelStatus !== currentHotelStatus
      ) {
        return res.status(400).json({
          message:
            'Hotel verification has already been decided. Provider must resubmit to change status.',
        });
      }

      if (hotelStatus === 'rejected' && (!hotelReason || !hotelReason.trim())) {
        return res.status(400).json({ message: 'Rejection reason is required for hotel.' });
      }

      hotel.status = hotelStatus;
      hotel.rejectionReason = hotelStatus === 'rejected' ? hotelReason?.trim() : undefined;
      await hotel.save();

      try {
        const { sendNotificationToUser } = await import('../controllers/notificationController.js');
        await sendNotificationToUser(
          hotel.userId,
          {
            sender: req.user ? req.user._id : null,
            type: 'VERIFICATION_RESPONSE',
            relatedType: 'HOTEL',
            relatedId: hotel._id,
            message: `${hotelStatus} your hotel verification request`
          }
        );

        // Send Email Notification to Provider
        const providerUser = await User.findById(hotel.userId).select('email firstName lastName');
        if (providerUser) {
          const providerName = providerUser.firstName ? `${providerUser.firstName} ${providerUser.lastName}`.trim() : 'Service Provider';
          await sendVerificationStatusEmail(providerUser.email, providerName, hotel.name, 'Hotel', hotelStatus, hotel.rejectionReason);
        }
      } catch (e) { console.error('Failed to send verification response notification / email', e); }
    }

    if (travelStatus && allowedStatuses.includes(travelStatus)) {
      if (!travel) {
        travel = new TravelVerification({ userId: user._id, status: 'not-submitted' });
      }

      if (
        (currentTravelStatus === 'approved' || currentTravelStatus === 'rejected') &&
        travelStatus !== currentTravelStatus
      ) {
        return res.status(400).json({
          message:
            'Travel verification has already been decided. Provider must resubmit to change status.',
        });
      }

      if (travelStatus === 'rejected' && (!travelReason || !travelReason.trim())) {
        return res.status(400).json({ message: 'Rejection reason is required for travel.' });
      }

      travel.status = travelStatus;
      travel.rejectionReason = travelStatus === 'rejected' ? travelReason?.trim() : undefined;
      await travel.save();

      try {
        const { sendNotificationToUser } = await import('../controllers/notificationController.js');
        await sendNotificationToUser(
          travel.userId,
          {
            sender: req.user ? req.user._id : null,
            type: 'VERIFICATION_RESPONSE',
            relatedType: 'VERIFICATION',
            relatedId: travel._id,
            message: `${travelStatus} your travel verification request`
          }
        );

        // Send Email Notification to Provider
        const providerUser = await User.findById(travel.userId).select('email firstName lastName');
        if (providerUser) {
          const providerName = providerUser.firstName ? `${providerUser.firstName} ${providerUser.lastName}`.trim() : 'Service Provider';
          await sendVerificationStatusEmail(providerUser.email, providerName, travel.companyName, 'Travel', travelStatus, travel.rejectionReason);
        }
      } catch (e) { console.error('Failed to send verification response notification / email', e); }
    }

    const provider = await ServiceProvider.findOne({ userId: user._id });

    return res.json({
      id: user._id,
      name: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email,
      email: user.email,
      services: provider && Array.isArray(provider.services) ? provider.services : [],
      hotelStatus: hotel ? hotel.status : 'not-submitted',
      hotelName: hotel ? hotel.name || null : null,
      travelStatus: travel ? travel.status : 'not-submitted',
      travelCompanyName: travel ? travel.companyName || null : null,
      createdAt: user.createdAt,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to update provider verification', err);
    return res.status(500).json({ message: 'Failed to update provider verification' });
  }
});

// Admin route to fetch full hotel details + rooms bypassing the 'approved' status requirement
router.get('/hotels/:hotelId', async (req, res) => {
  try {
    const hotel = await HotelVerification.findById(req.params.hotelId);
    if (!hotel) {
      return res.status(404).json({ message: 'Hotel not found' });
    }

    // Attach document URL if one exists so admin can review it easily
    if (hotel.documentKey) {
      try {
        const signedUrl = await getPrivateDocSignedUrl(hotel.documentKey, 300);
        hotel.documentUrl = signedUrl;
      } catch (e) {
        console.error('Failed to generate signed URL for hotel document inside admin browse', e);
      }
    }

    const rooms = await Room.find({ hotel: hotel._id });

    // Format the response just like the public traveler endpoint
    return res.json({
      hotel: {
        _id: hotel._id,
        name: hotel.name,
        description: hotel.description,
        address: hotel.address,
        contact: hotel.contact,
        starRating: hotel.starRating,
        amenities: hotel.amenities,
        images: hotel.images || [], // using the new images array
        status: hotel.status, // Admins should know its status
        documentUrl: hotel.documentUrl,
        owner: hotel.userId,
        checkInTime: hotel.checkInTime,
        checkOutTime: hotel.checkOutTime,
        cancellationPolicy: hotel.cancellationPolicy,
      },
      rooms: rooms.map(room => ({
        _id: room._id,
        roomNumber: room.roomNumber,
        roomType: room.roomType,
        pricePerNight: room.pricePerNight,
        maxGuests: room.maxGuests,
        amenities: room.amenities,
        images: room.images || [],
        isAvailable: room.isAvailable,
      })),
    });
  } catch (err) {
    console.error('Failed to fetch admin hotel details', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// Fetch all bookings for the Admin panel
router.get('/bookings', async (req, res) => {
  try {
    const bookings = await Booking.find()
      .populate('user', 'firstName lastName email photoUrl')
      .populate('hotel', 'name address userId')
      .populate('room', 'roomNumber roomType pricePerNight')
      .sort({ createdAt: -1 });

    return res.json(bookings);
  } catch (err) {
    console.error('Failed to load admin bookings', err);
    return res.status(500).json({ message: 'Failed to load bookings' });
  }
});

export default router;

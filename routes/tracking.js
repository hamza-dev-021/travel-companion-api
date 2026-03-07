import express from 'express';
import TrackingHistory from '../models/TrackingHistory.js';
import EmergencyContact from '../models/EmergencyContact.js';
import { protect } from '../middleware/auth.js';
import { sendEmergencyAlertEmail } from '../utils/email.js';

const router = express.Router();

// Record a new location ping
router.post('/location', protect, async (req, res) => {
  try {
    const { latitude, longitude, address } = req.body;
    if (!latitude || !longitude) {
      return res.status(400).json({ message: 'Latitude and longitude are required.' });
    }

    const entry = new TrackingHistory({
      user: req.user._id,
      latitude,
      longitude,
      address
    });

    await entry.save();
    return res.status(201).json({ message: 'Location recorded.', entry });
  } catch (error) {
    console.error('Error recording location:', error);
    res.status(500).json({ message: 'Server error recording location.' });
  }
});

// Get recent location history for the logged-in user
router.get('/history', protect, async (req, res) => {
  try {
    // Get latest 50 entries, sorted descending by time (newest first)
    const history = await TrackingHistory.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .limit(50);

    // Return chronologically (oldest first)
    return res.json(history.reverse());
  } catch (error) {
    console.error('Error fetching tracking history:', error);
    res.status(500).json({ message: 'Server error fetching history.' });
  }
});

// Get emergency contacts
router.get('/emergency-contacts', protect, async (req, res) => {
  try {
    const contacts = await EmergencyContact.find({ user: req.user._id });
    return res.json(contacts);
  } catch (error) {
    console.error('Error fetching contacts:', error);
    res.status(500).json({ message: 'Server error fetching contacts.' });
  }
});

// Add emergency contact
router.post('/emergency-contacts', protect, async (req, res) => {
  try {
    const { name, phone, email, relation } = req.body;

    if (!name || !phone || !email) {
      return res.status(400).json({ message: 'Name, email, and phone are required.' });
    }

    const contact = new EmergencyContact({
      user: req.user._id,
      name,
      phone,
      email,
      relation: relation || 'Contact'
    });

    await contact.save();
    return res.status(201).json({ message: 'Contact added.', contact });
  } catch (error) {
    console.error('Error adding contact:', error);
    res.status(500).json({ message: 'Server error adding contact.' });
  }
});

// Delete emergency contact
router.delete('/emergency-contacts/:id', protect, async (req, res) => {
  try {
    const contact = await EmergencyContact.findOneAndDelete({ _id: req.params.id, user: req.user._id });
    if (!contact) {
      return res.status(404).json({ message: 'Contact not found or not authorized.' });
    }
    res.json({ message: 'Contact deleted successfully' });
  } catch (error) {
    console.error('Error deleting contact:', error);
    res.status(500).json({ message: 'Server error deleting contact.' });
  }
});

// Blast emergency alerts to all trusted contacts
router.post('/emergency-alert', protect, async (req, res) => {
  try {
    const location = req.body.location;
    if (!location) {
      return res.status(400).json({ message: 'Location payload required to send alerts.' });
    }

    const contacts = await EmergencyContact.find({ user: req.user._id });
    if (!contacts || contacts.length === 0) {
      return res.status(400).json({ message: 'No emergency contacts found on your profile.' });
    }

    const travelerName = req.user.firstName ? `${req.user.firstName} ${req.user.lastName}`.trim() : 'A Traveler';

    let successCount = 0;
    // Blast emails in parallel
    await Promise.all(
      contacts.map(async (contact) => {
        if (contact.email) {
          await sendEmergencyAlertEmail(contact.email, contact.name, travelerName, location);
          successCount++;
        }
      })
    );

    res.status(200).json({ message: `Successfully blasted emergency alert to ${successCount} contact(s).` });
  } catch (error) {
    console.error('Error sending emergency alerts:', error);
    res.status(500).json({ message: 'Server error processing emergency alerts.' });
  }
});

export default router;

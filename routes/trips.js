import express from 'express';
import { v4 as uuid } from 'uuid';

const router = express.Router();

// In-memory trips store
const trips = [];

router.post('/', (req, res) => {
  const {
    userId,
    destination,
    startDate,
    endDate,
    budget,
    travelers,
    travelStyle,
    interests,
    accommodation
  } = req.body;

  if (!destination || !startDate || !endDate) {
    return res.status(400).json({ message: 'Destination and dates are required.' });
  }

  const trip = {
    id: uuid(),
    userId: userId || null,
    destination,
    startDate,
    endDate,
    budget: budget || null,
    travelers: travelers || 1,
    travelStyle: travelStyle || '',
    interests: Array.isArray(interests) ? interests : [],
    accommodation: accommodation || '',
    createdAt: new Date().toISOString()
  };

  trips.push(trip);
  return res.status(201).json({ message: 'Trip created.', trip });
});

router.get('/', (req, res) => {
  const { userId } = req.query;
  if (userId) {
    return res.json(trips.filter((t) => t.userId === userId));
  }
  return res.json(trips);
});

router.get('/:id', (req, res) => {
  const trip = trips.find((t) => t.id === req.params.id);
  if (!trip) {
    return res.status(404).json({ message: 'Trip not found.' });
  }
  return res.json(trip);
});

router.put('/:id', (req, res) => {
  const index = trips.findIndex((t) => t.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ message: 'Trip not found.' });
  }
  trips[index] = { ...trips[index], ...req.body };
  return res.json({ message: 'Trip updated.', trip: trips[index] });
});

router.delete('/:id', (req, res) => {
  const index = trips.findIndex((t) => t.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ message: 'Trip not found.' });
  }
  const [removed] = trips.splice(index, 1);
  return res.json({ message: 'Trip deleted.', trip: removed });
});

export default router;

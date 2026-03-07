import express from 'express';

const router = express.Router();

// Simple mocked weather data similar to the frontend default
router.get('/', (req, res) => {
  const { city = 'Paris', country = 'France' } = req.query;

  const data = {
    city,
    country,
    current: {
      temp: 22,
      condition: 'Partly Cloudy',
      humidity: 65,
      windSpeed: 12,
      icon: '⛅'
    },
    forecast: [
      { day: 'Today', high: 24, low: 18, condition: 'Partly Cloudy', icon: '⛅' },
      { day: 'Tomorrow', high: 26, low: 20, condition: 'Sunny', icon: '☀️' },
      { day: 'Wednesday', high: 23, low: 17, condition: 'Rainy', icon: '🌧️' },
      { day: 'Thursday', high: 25, low: 19, condition: 'Sunny', icon: '☀️' },
      { day: 'Friday', high: 21, low: 15, condition: 'Cloudy', icon: '☁️' },
      { day: 'Saturday', high: 28, low: 22, condition: 'Sunny', icon: '☀️' },
      { day: 'Sunday', high: 24, low: 18, condition: 'Partly Cloudy', icon: '⛅' }
    ]
  };

  return res.json(data);
});

export default router;

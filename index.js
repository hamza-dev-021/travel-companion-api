import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import morgan from 'morgan';
import chalk from 'chalk';

// ─── Security middleware ────────────────────────────────
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import mongoSanitize from 'express-mongo-sanitize';
import xss from 'xss-clean';

import errorHandler from './middleware/error.js';
import authRoutes from './routes/auth.js';
import tripRoutes from './routes/trips.js';
import budgetRoutes from './routes/budget.js';
import weatherRoutes from './routes/weather.js';
import trackingRoutes from './routes/tracking.js';
import adminRoutes from './routes/admin.js';
import providerRoutes from './routes/provider.js';
import hotelsRoutes from './routes/hotels.js';
import roomsRoutes from './routes/rooms.js';
import bookingsRoutes from './routes/bookings.js';
import verifiedHotelsRoutes from './routes/verifiedHotels.js';
import profileRoutes from './routes/profile.js';
import reviewRoutes from './routes/reviewRoutes.js';
import notificationRoutes from './routes/notifications.js';
import statsRoutes from './routes/statsRoutes.js';


dotenv.config();

// ─── Fail-fast checks ──────────────────────────────────
if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable must be set');
}

const app = express();
const PORT = process.env.PORT || 5000;

// ─── CORS (whitelist from env) ──────────────────────────
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : [process.env.FRONTEND_ORIGIN || 'http://localhost:5173'];

app.use(cors({
  origin: allowedOrigins,
  credentials: true,
}));

// ─── Body parsing (with size limit) ─────────────────────
app.use(cookieParser());
app.use(express.json({ limit: '3mb' }));
app.use(express.urlencoded({ extended: true, limit: '3mb' }));

// ─── Security middleware ────────────────────────────────
app.use(helmet());                             // HTTP security headers
app.use(mongoSanitize());                      // Prevent NoSQL injection
app.use(xss());                                // Sanitize user input against XSS

// ─── Rate limiting ──────────────────────────────────────
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 1000,                  // 1000 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests, please try again later' },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 5,                     // 5 auth attempts per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many authentication attempts, please try again later' },
});

app.use(globalLimiter);

// Body parsing moved up before sanitization

// ─── HTTP logger (dev only: colored, prod: combined) ────
if (process.env.NODE_ENV === 'production') {
  app.use(morgan('combined'));
} else {
  app.use(
    morgan((tokens, req, res) => {
      const status = Number(tokens.status(req, res));

      let statusColor = chalk.green;
      if (status >= 500) statusColor = chalk.red;
      else if (status >= 400) statusColor = chalk.yellow;
      else if (status >= 300) statusColor = chalk.cyan;

      const method = chalk.magenta(tokens.method(req, res));
      const url = chalk.blue(tokens.url(req, res));
      const coloredStatus = statusColor(status.toString());
      const responseTime = chalk.gray(tokens['response-time'](req, res) + ' ms');

      return [method, url, '->', coloredStatus, '-', responseTime].join(' ');
    })
  );
}

// ─── Routes ─────────────────────────────────────────────
app.get('/', (req, res) => {
  res.send('Travel Companion API is running');
});

app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Apply stricter rate limit on auth routes
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/auth/forgot-password', authLimiter);
app.use('/api/auth/reset-password', authLimiter);
app.use('/api/auth/send-register-otp', authLimiter);
app.use('/api/auth/verify-register-otp', authLimiter);

app.use('/api/auth', authRoutes);
app.use('/api/trips', tripRoutes);
app.use('/api/budget', budgetRoutes);
app.use('/api/weather', weatherRoutes);
app.use('/api/tracking', trackingRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/provider', providerRoutes);
app.use('/api/hotels', hotelsRoutes);
app.use('/api/verified-hotels', verifiedHotelsRoutes);
app.use('/api/rooms', roomsRoutes);
app.use('/api/bookings', bookingsRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/stats', statsRoutes);

// ─── 404 handler (unknown routes) ───────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, error: 'Route not found' });
});

// ─── Global error handler ───────────────────────────────
app.use(errorHandler);

export default app;

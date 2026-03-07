import express from 'express';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
// Models imports
import User from '../models/User.js';
import ServiceProvider from '../models/ServiceProvider.js';
import HotelVerification from '../models/HotelVerification.js';
import TravelVerification from '../models/TravelVerification.js';
import EmailVerificationToken from '../models/EmailVerificationToken.js';
import PasswordResetToken from '../models/PasswordResetToken.js';
import { sendPasswordResetEmail, sendOtpEmail, OTP_TIMER_SECONDS } from '../utils/email.js';

import RememberToken from '../models/RememberToken.js';

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('FATAL: JWT_SECRET environment variable is not set. Server cannot start.');
}
const SALT_ROUNDS = 10;

const COOKIE_NAME = 'tc_token';
const REMEMBER_COOKIE_NAME = 'remember_me';

// Session cookie options (no maxAge => expires on browser close)
const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
};

// Remember-me cookie options (persistent for 30 days)
const REMEMBER_COOKIE_OPTIONS = {
  ...SESSION_COOKIE_OPTIONS,
  maxAge: 30 * 24 * 60 * 60 * 1000,
};

const createJwtForUser = (user) => (
  jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '7d' })
);

const MAX_REMEMBER_TOKENS_PER_USER = 5;

const createRememberToken = async (userId) => {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHmac('sha256', JWT_SECRET).update(rawToken).digest('hex');

  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  // Enforce a limit on concurrent remember-me tokens per user (max 5 devices).
  // Keep the most recent tokens and remove the oldest ones beyond the limit.
  const existingTokens = await RememberToken.find({ userId })
    .sort({ createdAt: 1 }) // oldest first
    .lean();

  if (existingTokens.length >= MAX_REMEMBER_TOKENS_PER_USER) {
    // Number of oldest tokens to remove so that after inserting the new one
    // we will have at most MAX_REMEMBER_TOKENS_PER_USER tokens total.
    const tokensToDeleteCount = existingTokens.length - (MAX_REMEMBER_TOKENS_PER_USER - 1);
    const idsToDelete = existingTokens
      .slice(0, Math.max(0, tokensToDeleteCount))
      .map((t) => t._id);

    if (idsToDelete.length > 0) {
      await RememberToken.deleteMany({ _id: { $in: idsToDelete } });
    }
  }

  await RememberToken.create({ userId, tokenHash, expiresAt });

  return rawToken;
};

const PK_PHONE_RE = /^\+92[0-9]{10}$/;
const CNIC_RE = /^\d{5}-\d{7}-\d{1}$/;

const buildProfileImageUrl = (user, req) => {
  if (!user.profileImage) return null;
  return `${req.protocol}://${req.get('host')}/api/profile/${user._id}/photo`;
};

// ─── Email Verification ────────────────────────────────────────

router.post('/send-register-otp', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Email is required.' });

    const existingUser = await User.findOne({ email });
    if (existingUser) return res.status(409).json({ message: 'Email is already registered.' });

    const existingToken = await EmailVerificationToken.findOne({ email });
    if (existingToken && existingToken.expiresAt > Date.now()) {
      const remainingSeconds = Math.ceil((existingToken.expiresAt.getTime() - Date.now()) / 1000);
      return res.status(429).json({
        message: `An OTP was already sent. Please wait before requesting another.`,
        remainingSeconds,
      });
    }

    await EmailVerificationToken.deleteMany({ email });

    const otp = String(crypto.randomInt(100000, 1000000));
    const tokenHash = crypto.createHash('sha256').update(otp).digest('hex');
    const expiresAt = new Date(Date.now() + OTP_TIMER_SECONDS * 1000);

    await EmailVerificationToken.create({ email, tokenHash, expiresAt });

    try {
      await sendOtpEmail(email, otp, 'registration');
    } catch (err) {
      console.error('SMTP Error:', err);
      await EmailVerificationToken.deleteMany({ email });
      return res.status(500).json({ message: 'Failed to send verification code due to email server error. Please try again.' });
    }

    return res.json({ message: 'Verification code sent to email.', expiresIn: OTP_TIMER_SECONDS });
  } catch (error) {
    console.error('Send register OTP error:', error);
    return res.status(500).json({ message: 'Failed to send verification code.' });
  }
});

router.post('/verify-register-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;
    console.log(`[Verify OTP] Attempting to verify email: "${email}" with OTP: "${otp}"`);

    if (!email || !otp) return res.status(400).json({ message: 'Email and OTP are required.' });

    const tokenHash = crypto.createHash('sha256').update(otp).digest('hex');
    const stored = await EmailVerificationToken.findOne({ email, tokenHash });

    console.log(`[Verify OTP] DB Token Found:`, stored ? 'YES' : 'NO');
    if (stored) {
      console.log(`[Verify OTP] Expires At:`, stored.expiresAt, `Current Time:`, new Date());
    }

    if (!stored || stored.expiresAt < new Date()) {
      return res.status(400).json({ message: 'Invalid or expired verification code.' });
    }

    stored.verified = true;
    stored.tokenHash = 'VERIFIED';
    stored.expiresAt = new Date(Date.now() + 15 * 60 * 1000); // Give 15 mins to complete the registration form
    await stored.save();

    return res.json({ message: 'Email verified successfully.' });
  } catch (error) {
    console.error('Verify register OTP error:', error);
    return res.status(500).json({ message: 'Internal server error.' });
  }
});

router.post('/register', async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      email,
      password,
      phone,
      cnic,
      isServiceProvider = false,
      services = [],
    } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required.' });
    }

    if (phone && !PK_PHONE_RE.test(phone)) {
      return res.status(400).json({ message: 'Phone must be in Pakistan format: +92XXXXXXXXXX' });
    }

    if (isServiceProvider && cnic && !CNIC_RE.test(cnic)) {
      return res.status(400).json({ message: 'CNIC must be in format: XXXXX-XXXXXXX-X' });
    }

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(409).json({ message: 'User already exists.' });
    }

    const verificationRecord = await EmailVerificationToken.findOne({ email, verified: true });
    if (!verificationRecord) {
      return res.status(400).json({ message: 'Email address has not been verified.' });
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    const user = await User.create({
      firstName,
      lastName,
      email,
      passwordHash,
      phone: phone || undefined,
      cnic: (isServiceProvider && cnic) ? cnic : undefined,
      role: isServiceProvider ? 'service-provider' : 'traveller',
    });

    try {
      const { sendNotificationToUser } = await import('../controllers/notificationController.js');
      const admins = await User.find({ role: 'admin' }).select('_id');
      for (const admin of admins) {
        await sendNotificationToUser(
          admin._id,
          {
            sender: user._id,
            type: 'SYSTEM_ALERT',
            relatedType: 'USER',
            relatedId: user._id,
            message: `new ${user.role} registered`
          }
        );
      }
    } catch (e) {
      console.error('Failed to notify admins of new user registration', e);
    }

    let providerServices = [];
    if (isServiceProvider) {
      providerServices = Array.isArray(services) ? services : [];
      await ServiceProvider.create({
        userId: user._id,
        services: providerServices,
      });
    }

    const token = createJwtForUser(user);

    // For registration we default to a session cookie; the user can opt-in
    // to remember-me on the next login from the client.
    res.cookie(COOKIE_NAME, token, SESSION_COOKIE_OPTIONS);

    let hotelVerification = null;
    let travelVerification = null;
    if (isServiceProvider) {
      hotelVerification = await HotelVerification.findOne({ userId: user._id });
      travelVerification = await TravelVerification.findOne({ userId: user._id });
    }

    await EmailVerificationToken.deleteMany({ email });

    return res.status(201).json({
      message: 'User registered successfully.',
      token,
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: user.phone || null,
        cnic: user.cnic || null,
        profileImage: buildProfileImageUrl(user, req),
        role: user.role,
        services: providerServices,
        verification: {
          hotel: hotelVerification || { status: 'not-submitted' },
          travel: travelVerification || { status: 'not-submitted' },
        },
      },
    });
  } catch (error) {
    console.error('Register error:', error);
    return res.status(500).json({ message: 'Internal server error.' });
  }
});

router.get('/me', async (req, res) => {
  try {
    const token = req.cookies[COOKIE_NAME];
    const rememberCookie = req.cookies[REMEMBER_COOKIE_NAME];

    let user = null;

    if (token) {
      try {
        const payload = jwt.verify(token, JWT_SECRET);
        user = await User.findById(payload.id);
      } catch {
        // ignore invalid/expired JWT; we'll fall back to remember-me below
      }
    }

    // If no valid session but we have a remember-me cookie, try to restore
    if (!user && rememberCookie) {
      const tokenHash = crypto.createHmac('sha256', JWT_SECRET).update(rememberCookie).digest('hex');
      const stored = await RememberToken.findOne({ tokenHash }).lean();

      if (stored && stored.expiresAt > new Date()) {
        user = await User.findById(stored.userId);
        if (user) {
          // Re-issue a fresh JWT session cookie
          const newJwt = createJwtForUser(user);
          res.cookie(COOKIE_NAME, newJwt, SESSION_COOKIE_OPTIONS);
        }
      }
    }

    if (!user) {
      return res.status(401).json({ message: 'Not authenticated.' });
    }

    if (user.isActive === false) {
      res.clearCookie(COOKIE_NAME, { ...SESSION_COOKIE_OPTIONS, maxAge: 0 });
      return res.status(403).json({ message: 'Your account has been deactivated. Please contact admin for activation.' });
    }

    let services = [];
    let hotelVerification = null;
    let travelVerification = null;

    if (user.role === 'service-provider') {
      const provider = await ServiceProvider.findOne({ userId: user._id });
      if (provider) services = Array.isArray(provider.services) ? provider.services : [];
      hotelVerification = await HotelVerification.findOne({ userId: user._id });
      travelVerification = await TravelVerification.findOne({ userId: user._id });
    }

    return res.json({
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: user.phone || null,
        cnic: user.cnic || null,
        profileImage: buildProfileImageUrl(user, req),
        role: user.role,
        services,
        verification: {
          hotel: hotelVerification || { status: 'not-submitted' },
          travel: travelVerification || { status: 'not-submitted' },
        },
      },
    });
  } catch (error) {
    console.error('/me error:', error);
    return res.status(500).json({ message: 'Internal server error.' });
  }
});

router.post('/logout', async (req, res) => {
  try {
    const rememberCookie = req.cookies[REMEMBER_COOKIE_NAME];

    // Clear JWT session cookie
    res.clearCookie(COOKIE_NAME, { ...SESSION_COOKIE_OPTIONS, maxAge: 0 });

    if (rememberCookie) {
      const tokenHash = crypto.createHmac('sha256', JWT_SECRET).update(rememberCookie).digest('hex');
      await RememberToken.deleteOne({ tokenHash });
      res.clearCookie(REMEMBER_COOKIE_NAME, { ...REMEMBER_COOKIE_OPTIONS, maxAge: 0 });
    }

    return res.json({ message: 'Logged out.' });
  } catch (error) {
    console.error('Logout error:', error);
    return res.status(500).json({ message: 'Internal server error.' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password, rememberMe = false } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required.' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials.' });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials.' });
    }

    if (user.isActive === false) {
      return res.status(403).json({ message: 'Your account has been deactivated. Please contact admin for activation.' });
    }

    const token = createJwtForUser(user);

    // Always issue a JWT session cookie
    res.cookie(COOKIE_NAME, token, SESSION_COOKIE_OPTIONS);

    // If rememberMe is true, create a DB-backed remember token and set a
    // separate persistent cookie that can be used to restore a session.
    if (rememberMe) {
      const rawToken = await createRememberToken(user._id);
      res.cookie(REMEMBER_COOKIE_NAME, rawToken, REMEMBER_COOKIE_OPTIONS);
    }

    let services = [];
    let hotelVerification = null;
    let travelVerification = null;

    if (user.role === 'service-provider') {
      const provider = await ServiceProvider.findOne({ userId: user._id });
      if (provider) services = Array.isArray(provider.services) ? provider.services : [];
      hotelVerification = await HotelVerification.findOne({ userId: user._id });
      travelVerification = await TravelVerification.findOne({ userId: user._id });
    }

    return res.json({
      message: 'Login successful.',
      token,
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: user.phone || null,
        cnic: user.cnic || null,
        profileImage: buildProfileImageUrl(user, req),
        role: user.role,
        services,
        verification: {
          hotel: hotelVerification || { status: 'not-submitted' },
          travel: travelVerification || { status: 'not-submitted' },
        },
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ message: 'Internal server error.' });
  }
});

// ─── Forgot Password ─────────────────────────────────────
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ message: 'Email is required.' });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    // Always return success to prevent email enumeration
    if (!user) {
      return res.json({ message: 'If an account with that email exists, a reset link has been sent.' });
    }

    // Delete any existing reset tokens for this user
    await PasswordResetToken.deleteMany({ userId: user._id });

    // Create token
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await PasswordResetToken.create({ userId: user._id, tokenHash, expiresAt });

    // Send email with reset link
    try {
      await sendPasswordResetEmail(user.email, rawToken);
    } catch (err) {
      console.error('SMTP Error:', err);
      await PasswordResetToken.deleteMany({ userId: user._id });
      return res.status(500).json({ message: 'Failed to send password reset link due to email server error. Please try again.' });
    }

    return res.json({ message: 'If an account with that email exists, a reset link has been sent.' });
  } catch (error) {
    console.error('Forgot password error:', error);
    return res.status(500).json({ message: 'Internal server error.' });
  }
});

router.post('/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) {
      return res.status(400).json({ message: 'Token and new password are required.' });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters.' });
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const stored = await PasswordResetToken.findOne({ tokenHash });

    if (!stored || stored.expiresAt < new Date()) {
      return res.status(400).json({ message: 'Reset link is invalid or has expired. Please request a new one.' });
    }

    const user = await User.findById(stored.userId);
    if (!user) {
      return res.status(400).json({ message: 'User not found.' });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (isMatch) {
      return res.status(400).json({ message: 'New password cannot be the same as your old password(s).' });
    }

    user.passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    await user.save();

    // Clean up used token
    await PasswordResetToken.deleteMany({ userId: user._id });

    return res.json({ message: 'Password has been reset successfully. You can now log in.' });
  } catch (error) {
    console.error('Reset password error:', error);
    return res.status(500).json({ message: 'Internal server error.' });
  }
});

export default router;

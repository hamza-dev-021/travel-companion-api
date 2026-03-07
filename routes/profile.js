import express from 'express';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import multer from 'multer';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import PasswordResetToken from '../models/PasswordResetToken.js';
import { sendOtpEmail, OTP_TIMER_SECONDS } from '../utils/email.js';

const router = express.Router();
const SALT_ROUNDS = 10;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-key-change-in-prod';
const COOKIE_NAME = 'tc_token';
const PK_PHONE_RE = /^\+92[0-9]{10}$/;
const CNIC_RE = /^\d{5}-\d{7}-\d{1}$/;

// Multer for in-memory upload (we store Buffer in MongoDB)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 2 * 1024 * 1024 }, // 2 MB
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed.'));
        }
    },
});

// ─── Auth middleware (reuse same cookie-based approach) ────
function requireAuth(req, res, next) {
    const token = req.cookies[COOKIE_NAME];
    if (!token) return res.status(401).json({ message: 'Not authenticated.' });

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.userId = decoded.id;
        next();
    } catch {
        return res.status(401).json({ message: 'Session expired. Please log in again.' });
    }
}

// ─── GET /profile ───────────────────────────────────────────
router.get('/', requireAuth, async (req, res) => {
    try {
        const user = await User.findById(req.userId).select('-passwordHash -profileImage');
        if (!user) return res.status(404).json({ message: 'User not found.' });

        return res.json({
            user: {
                id: user.id,
                firstName: user.firstName,
                lastName: user.lastName,
                email: user.email,
                phone: user.phone || null,
                cnic: user.cnic || null,
                role: user.role,
                profileImage: user.profileImage ? `/api/profile/${user._id}/photo` : null,
                createdAt: user.createdAt,
            },
        });
    } catch (error) {
        console.error('Get profile error:', error);
        return res.status(500).json({ message: 'Internal server error.' });
    }
});

// ─── PATCH /profile ──────────────────────────────────────────
router.patch('/', requireAuth, async (req, res) => {
    try {
        const user = await User.findById(req.userId);
        if (!user) return res.status(404).json({ message: 'User not found.' });

        const { firstName, lastName, phone, cnic } = req.body;

        if (firstName !== undefined) user.firstName = firstName.trim();
        if (lastName !== undefined) user.lastName = lastName.trim();

        if (phone !== undefined) {
            if (phone && !PK_PHONE_RE.test(phone)) {
                return res.status(400).json({ message: 'Phone must be in Pakistan format: +92XXXXXXXXXX' });
            }
            user.phone = phone || undefined;
        }

        if (cnic !== undefined) {
            if (cnic && !CNIC_RE.test(cnic)) {
                return res.status(400).json({ message: 'CNIC must be in format: XXXXX-XXXXXXX-X' });
            }
            user.cnic = cnic || undefined;
        }

        await user.save();

        return res.json({
            message: 'Profile updated successfully.',
            user: {
                id: user.id,
                firstName: user.firstName,
                lastName: user.lastName,
                email: user.email,
                phone: user.phone || null,
                cnic: user.cnic || null,
                role: user.role,
            },
        });
    } catch (error) {
        console.error('Update profile error:', error);
        return res.status(500).json({ message: 'Internal server error.' });
    }
});

// ─── PATCH /profile/photo ────────────────────────────────────
router.patch('/photo', requireAuth, upload.single('photo'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'Please upload an image file.' });
        }

        const user = await User.findById(req.userId);
        if (!user) return res.status(404).json({ message: 'User not found.' });

        user.profileImage = req.file.buffer;
        user.profileImageType = req.file.mimetype;
        user.photoUrl = `/api/profile/${user._id}/photo`;
        await user.save();

        return res.json({
            message: 'Profile photo updated.',
            profileImage: `/api/profile/${user._id}/photo`,
        });
    } catch (error) {
        console.error('Upload photo error:', error);
        return res.status(500).json({ message: 'Internal server error.' });
    }
});

// ─── DELETE /profile/photo ───────────────────────────────────
router.delete('/photo', requireAuth, async (req, res) => {
    try {
        const user = await User.findById(req.userId);
        if (!user) return res.status(404).json({ message: 'User not found.' });

        user.profileImage = undefined;
        user.profileImageType = undefined;
        user.photoUrl = null;
        await user.save();

        return res.json({ message: 'Profile photo removed.' });
    } catch (error) {
        console.error('Delete photo error:', error);
        return res.status(500).json({ message: 'Internal server error.' });
    }
});

// ─── GET /profile/:id/photo (public, serves the image binary) ──
router.get('/:id/photo', async (req, res) => {
    try {
        const user = await User.findById(req.params.id).select('profileImage profileImageType');
        if (!user || !user.profileImage) {
            return res.status(404).json({ message: 'No profile photo found.' });
        }

        res.set('Content-Type', user.profileImageType || 'image/jpeg');
        res.set('Cache-Control', 'public, max-age=86400');
        res.set('Cross-Origin-Resource-Policy', 'cross-origin');
        return res.send(user.profileImage);
    } catch (error) {
        console.error('Get photo error:', error);
        return res.status(500).json({ message: 'Internal server error.' });
    }
});

// ─── PATCH /profile/password ──────────────────────────────────
// If currentPassword is provided → verify & change
// If not → send OTP to email
router.patch('/password', requireAuth, async (req, res) => {
    try {
        const user = await User.findById(req.userId);
        if (!user) return res.status(404).json({ message: 'User not found.' });

        const { currentPassword, newPassword, otp } = req.body;

        if (!newPassword || newPassword.length < 6) {
            return res.status(400).json({ message: 'New password must be at least 6 characters.' });
        }

        // Path 1: User knows current password
        if (currentPassword) {
            const isMatch = await bcrypt.compare(currentPassword, user.passwordHash);
            if (!isMatch) {
                return res.status(400).json({ message: 'Current password is incorrect.' });
            }

            user.passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
            await user.save();
            return res.json({ message: 'Password changed successfully.' });
        }

        // Path 2: OTP-based verification
        if (otp) {
            const tokenHash = crypto.createHash('sha256').update(otp).digest('hex');
            const stored = await PasswordResetToken.findOne({ userId: user._id, tokenHash });

            if (!stored || stored.expiresAt < new Date()) {
                return res.status(400).json({ message: 'Invalid or expired OTP.' });
            }

            user.passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
            await user.save();
            await PasswordResetToken.deleteMany({ userId: user._id });
            return res.json({ message: 'Password changed successfully.' });
        }

        // No currentPassword and no OTP → need to send OTP first
        return res.status(400).json({
            message: 'Please provide your current password or request an OTP.',
            requireOtp: true,
        });
    } catch (error) {
        console.error('Change password error:', error);
        return res.status(500).json({ message: 'Internal server error.' });
    }
});

// ─── POST /profile/send-otp ───────────────────────────────────
router.post('/send-otp', requireAuth, async (req, res) => {
    try {
        const user = await User.findById(req.userId);
        if (!user) return res.status(404).json({ message: 'User not found.' });

        // Check for active existing OTP
        const existingToken = await PasswordResetToken.findOne({ userId: user._id });
        if (existingToken && existingToken.expiresAt > Date.now()) {
            const remainingSeconds = Math.ceil((existingToken.expiresAt.getTime() - Date.now()) / 1000);
            return res.status(429).json({
                message: `An OTP was already sent. Please wait before requesting another.`,
                remainingSeconds,
            });
        }

        // Delete existing OTPs
        await PasswordResetToken.deleteMany({ userId: user._id });

        // Generate 6-digit OTP
        const otp = String(Math.floor(100000 + Math.random() * 900000));
        const tokenHash = crypto.createHash('sha256').update(otp).digest('hex');
        const expiresAt = new Date(Date.now() + OTP_TIMER_SECONDS * 1000);

        await PasswordResetToken.create({ userId: user._id, tokenHash, expiresAt });

        try {
            await sendOtpEmail(user.email, otp);
        } catch (err) {
            console.error('SMTP Error:', err);
            await PasswordResetToken.deleteMany({ userId: user._id });
            return res.status(500).json({ message: 'Failed to send OTP due to email server error. Please try again.' });
        }

        return res.json({ message: 'OTP sent to your email address.', expiresIn: OTP_TIMER_SECONDS });
    } catch (error) {
        console.error('Send OTP error:', error);
        return res.status(500).json({ message: 'Internal server error.' });
    }
});

// ─── GET /profile/settings ───────────────────────────────────
router.get('/settings', requireAuth, async (req, res) => {
    try {
        const user = await User.findById(req.userId).select('preferences').lean();
        res.json({
            success: true,
            data: {
                notifications: user?.preferences?.notifications ?? true,
                emails: user?.preferences?.emails ?? true,
            },
        });
    } catch (error) {
        console.error('Get settings error:', error);
        res.status(500).json({ message: 'Internal server error.' });
    }
});

// ─── PATCH /profile/settings ─────────────────────────────────
router.patch('/settings', requireAuth, async (req, res) => {
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
        await User.findByIdAndUpdate(req.userId, { $set: update });
        res.json({ success: true, message: 'Settings updated.' });
    } catch (error) {
        console.error('Update settings error:', error);
        res.status(500).json({ message: 'Internal server error.' });
    }
});

export default router;

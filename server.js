import app from './index.js';
import { connectDB } from './config/db.js';
import User from './models/User.js';
import RememberToken from './models/RememberToken.js';
import bcrypt from 'bcrypt';
import mongoose from 'mongoose';
import { runBookingAutomation } from './utils/bookingAutomation.js';

const PORT = process.env.PORT || 5000;

async function ensureAdminUser() {
    const email = process.env.ADMIN_EMAIL || 'admin@gmail.com';
    const password = process.env.ADMIN_PASSWORD || 'admin123@';

    const existing = await User.findOne({ email });
    if (existing) return;

    const passwordHash = await bcrypt.hash(password, 10);

    await User.create({
        firstName: 'Admin',
        lastName: 'User',
        email,
        passwordHash,
        role: 'admin',
    });

    console.log('Default admin user created:', email);
}

let server;

connectDB().then(async () => {
    await ensureAdminUser();

    // Periodic cleanup for expired remember-me tokens
    const ONE_HOUR_MS = 60 * 60 * 1000;
    setInterval(async () => {
        try {
            await RememberToken.deleteMany({ expiresAt: { $lte: new Date() } });
        } catch (err) {
            console.error('Error during RememberToken cleanup:', err);
        }
    }, ONE_HOUR_MS);

    server = app.listen(PORT, () => {
        console.log(`Travel Companion API listening on port ${PORT} [${process.env.NODE_ENV || 'development'}]`);
    });
});

// ─── Graceful shutdown ──────────────────────────────────
const shutdown = (signal) => {
    console.log(`\n${signal} received. Shutting down gracefully…`);
    if (server) {
        server.close(() => {
            mongoose.connection.close(false).then(() => {
                console.log('MongoDB connection closed.');
                process.exit(0);
            });
        });
    } else {
        process.exit(0);
    }
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (err) => {
    console.error('Unhandled Rejection:', err);
    if (server) {
        server.close(() => process.exit(1));
    } else {
        process.exit(1);
    }
});

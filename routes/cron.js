import express from 'express';
import RememberToken from '../models/RememberToken.js';
import { syncBookingStatuses } from '../utils/bookingAutomation.js';

const router = express.Router();

/**
 * Secure Webhook Endpoint for Supabase Cron Trigger
 * Executes all periodic background cleanup tasks.
 */
router.post('/execute', async (req, res) => {
    try {
        // Validate Authorization header
        const authHeader = req.headers.authorization;
        const cronSecret = process.env.CRON_SECRET_KEY;
        
        if (!cronSecret) {
            console.error('CRON_SECRET_KEY is not configured in .env');
            return res.status(500).json({ success: false, message: 'Server configuration error' });
        }

        if (!authHeader || authHeader !== `Bearer ${cronSecret}`) {
            console.warn('Unauthorized cron execution attempt');
            return res.status(401).json({ success: false, message: 'Unauthorized execution' });
        }

        console.log('--- Executing Scheduled Background Tasks ---');
        const results = {};

        // 1. Cleanup expired remember-me tokens
        try {
            const tokenResult = await RememberToken.deleteMany({ expiresAt: { $lte: new Date() } });
            console.log(`Cleared ${tokenResult.deletedCount} expired RememberTokens`);
            results.tokensCleared = tokenResult.deletedCount;
        } catch (err) {
            console.error('Error cleaning RememberTokens:', err);
            results.tokenError = err.message;
        }

        // 2. Automate booking transitions (Check-in/Check-out)
        try {
            await syncBookingStatuses({});
            console.log('Synchronized booking statuses');
            results.bookingSync = 'success';
        } catch (err) {
            console.error('Error synchronizing booking statuses:', err);
            results.bookingError = err.message;
        }

        console.log('--- Background Tasks Complete ---');
        return res.status(200).json({ success: true, data: results });

    } catch (err) {
        console.error('Unhandled error in cron webhook:', err);
        return res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
});

export default router;

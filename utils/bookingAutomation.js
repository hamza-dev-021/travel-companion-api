import Booking from '../models/Booking.js';
import HotelVerification from '../models/HotelVerification.js';
import { sendNotificationToUser } from '../controllers/notificationController.js';

/**
 * Automatically transitions booking statuses based on dates
 * 1. confirmed -> checked-in (on check-in date)
 * 2. checked-in -> checked-out (after check-out date)
 * 3. Sends check-in reminders to providers
 */
/**
 * Automatically transitions booking statuses based on dates (Lazy Execution)
 * @param {Object} filter - mongoose query filter to limit scope (e.g., { user: userId } or { hotel: { $in: hotelIds } })
 */
export const syncBookingStatuses = async (filter = {}) => {
    try {
        const now = new Date();

        // 1. Auto Check-in: confirmed -> checked-in
        const autoCheckIn = await Booking.find({
            ...filter,
            status: 'confirmed',
            checkInDate: { $lte: now }
        });

        for (const booking of autoCheckIn) {
            booking.status = 'checked-in';
            await booking.save();
            console.log(`Lazy Auto Check-in: Booking ${booking._id} set to checked-in`);

            const hotel = await HotelVerification.findById(booking.hotel);

            // Notify provider
            if (hotel && hotel.userId) {
                await sendNotificationToUser(hotel.userId, {
                    sender: booking.user,
                    type: 'BOOKING_RESPONSE',
                    relatedType: 'BOOKING',
                    relatedId: booking._id,
                    message: `checked-in automatically (System)`
                });
            }

            // Notify traveller
            if (booking.user) {
                await sendNotificationToUser(booking.user, {
                    sender: hotel?.userId || booking.user,
                    type: 'BOOKING_RESPONSE',
                    relatedType: 'BOOKING',
                    relatedId: booking._id,
                    message: `checked-in — your stay has begun!`
                });
            }
        }

        // 2. Auto Check-out: checked-in -> checked-out
        const pastCheckOut = await Booking.find({
            ...filter,
            status: 'checked-in',
            checkOutDate: { $lt: now }
        });

        for (const booking of pastCheckOut) {
            booking.status = 'checked-out';
            await booking.save();
            console.log(`Lazy Auto Check-out: Booking ${booking._id} set to checked-out`);

            const hotel = await HotelVerification.findById(booking.hotel);

            // Notify provider
            if (hotel && hotel.userId) {
                await sendNotificationToUser(hotel.userId, {
                    sender: booking.user,
                    type: 'BOOKING_RESPONSE',
                    relatedType: 'BOOKING',
                    relatedId: booking._id,
                    message: `checked-out — stay ended`
                });
            }

            // Notify traveller
            if (booking.user) {
                await sendNotificationToUser(booking.user, {
                    sender: hotel?.userId || booking.user,
                    type: 'BOOKING_RESPONSE',
                    relatedType: 'BOOKING',
                    relatedId: booking._id,
                    message: `checked-out — your stay has ended. We hope you enjoyed it!`
                });
            }
        }

    } catch (error) {
        console.error('Error in Booking Lazy Sync:', error);
    }
};

// Keep deprecated name for compatibility if needed, but pointing to the new logic
export const runBookingAutomation = () => syncBookingStatuses({});

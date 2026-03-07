import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema({
    recipient: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    sender: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    type: {
        type: String,
        enum: ['BOOKING_REQUEST', 'BOOKING_RESPONSE', 'SYSTEM_ALERT', 'VERIFICATION_REQUEST', 'VERIFICATION_RESPONSE'],
        required: true
    },
    message: {
        type: String
    },
    relatedType: {
        type: String,
        enum: ['BOOKING', 'HOTEL', 'VERIFICATION', 'USER']
    },
    relatedId: {
        type: mongoose.Schema.Types.ObjectId
    },
    isRead: {
        type: Boolean,
        default: false,
        index: true
    },
    createdAt: {
        type: Date,
        default: Date.now,
        index: true
    }
});

const Notification = mongoose.model('Notification', notificationSchema);
export default Notification;

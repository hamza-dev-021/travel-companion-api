import mongoose from 'mongoose';

const trackingHistorySchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true // helpful for fast queries
    },
    latitude: {
        type: Number,
        required: true
    },
    longitude: {
        type: Number,
        required: true
    },
    address: {
        type: String
    },
    // the timestamp field itself can be used for TTL
    createdAt: {
        type: Date,
        default: Date.now,
        expires: 2592000 // 30 days in seconds (30 * 24 * 60 * 60)
    }
});

const TrackingHistory = mongoose.model('TrackingHistory', trackingHistorySchema);

export default TrackingHistory;

import Notification from '../models/Notification.js';
import User from '../models/User.js';

// Global map to hold SSE clients (userId -> Set of response objects)
const clients = new Map();

// Heartbeat interval (30 seconds) to detect dead connections
const HEARTBEAT_INTERVAL_MS = 30 * 1000;
// Max connection duration (2 hours) to prevent indefinite memory consumption
const MAX_CONNECTION_MS = 2 * 60 * 60 * 1000;

/**
 * SSE Endpoint to stream notifications
 */
export const streamNotifications = (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const userId = req.user._id.toString();

    // Add this client to the clients map
    if (!clients.has(userId)) {
        clients.set(userId, new Set());
    }
    clients.get(userId).add(res);

    // Send initial ping or connect message
    res.write(`data: ${JSON.stringify({ type: 'CONNECTED' })}\n\n`);

    // Heartbeat to detect dead connections
    const heartbeat = setInterval(() => {
        try {
            res.write(`:heartbeat\n\n`);
        } catch {
            cleanup();
        }
    }, HEARTBEAT_INTERVAL_MS);

    // Force-close after max duration to prevent memory buildup
    const maxTimeout = setTimeout(() => {
        cleanup();
        try { res.end(); } catch { /* already closed */ }
    }, MAX_CONNECTION_MS);

    const cleanup = () => {
        clearInterval(heartbeat);
        clearTimeout(maxTimeout);
        const userClients = clients.get(userId);
        if (userClients) {
            userClients.delete(res);
            if (userClients.size === 0) {
                clients.delete(userId);
            }
        }
    };

    req.on('close', cleanup);
};

/**
 * Helper function to create and send a notification to a specific user
 */
export const sendNotificationToUser = async (userId, notificationData) => {
    try {
        // Respect user notification preference
        const recipient = await User.findById(userId).select('preferences').lean();
        if (recipient?.preferences?.notifications === false) return null;

        const notification = await Notification.create({
            recipient: userId,
            ...notificationData
        });

        let populatedNotification = await Notification.findById(notification._id)
            .populate('sender', 'firstName lastName photoUrl preferences')
            .lean();

        if (populatedNotification?.sender) {
            // Handle missing photoUrl hydration
            if (!populatedNotification.sender.photoUrl) {
                populatedNotification.sender.photoUrl = `/api/profile/${populatedNotification.sender._id}/photo`;
            }

            const isPhotoPublic = populatedNotification.sender.preferences?.publicProfilePhoto === true;
            if (!isPhotoPublic) {
                delete populatedNotification.sender.photoUrl;
            }
            delete populatedNotification.sender.preferences;
        }

        const userClients = clients.get(userId.toString());
        if (userClients) {
            const data = `data: ${JSON.stringify(populatedNotification)}\n\n`;
            for (const client of userClients) {
                try {
                    client.write(data);
                } catch {
                    // Client disconnected, will be cleaned up by heartbeat
                    userClients.delete(client);
                }
            }
        }

        return notification;
    } catch (error) {
        console.error('Error sending notification:', error);
        // Don't throw — notifications are best-effort and shouldn't block the main operation
    }
};

/**
 * @desc    Get user notifications with pagination
 * @route   GET /api/notifications
 * @access  Private
 */
export const getNotifications = async (req, res, next) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        let notifications = await Notification.find({ recipient: req.user._id })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .populate('sender', 'firstName lastName photoUrl preferences')
            .lean();

        // Sanitize profile pictures based on sender privacy settings
        notifications = notifications.map(notif => {
            if (notif.sender) {
                // IMPORTANT: Clone the sender object to avoid shared reference mutations 
                // (Mongoose reuse objects for the same ID in populated lean results)
                const sender = { ...notif.sender };

                // Handle missing photoUrl hydration
                if (!sender.photoUrl) {
                    sender.photoUrl = `/api/profile/${sender._id}/photo`;
                }

                const isPhotoPublic = sender.preferences?.publicProfilePhoto === true;
                
                if (!isPhotoPublic) {
                    delete sender.photoUrl;
                }
                // Strip preferences from final payload
                delete sender.preferences;

                notif.sender = sender;
            }
            return notif;
        });

        const total = await Notification.countDocuments({ recipient: req.user._id });

        res.status(200).json({
            success: true,
            data: notifications,
            pagination: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit)
            }
        });
    } catch (err) {
        next(err);
    }
};

/**
 * @desc    Get unread notifications count
 * @route   GET /api/notifications/unread-count
 * @access  Private
 */
export const getUnreadCount = async (req, res, next) => {
    try {
        const count = await Notification.countDocuments({
            recipient: req.user._id,
            isRead: false
        });

        res.status(200).json({
            success: true,
            count
        });
    } catch (err) {
        next(err);
    }
};

/**
 * @desc    Mark a single notification as read
 * @route   PATCH /api/notifications/:id/read
 * @access  Private
 */
export const markAsRead = async (req, res, next) => {
    try {
        const notification = await Notification.findOneAndUpdate(
            { _id: req.params.id, recipient: req.user._id },
            { isRead: true },
            { new: true }
        );

        if (!notification) {
            return res.status(404).json({ success: false, error: 'Notification not found' });
        }

        res.status(200).json({
            success: true,
            data: notification
        });
    } catch (err) {
        next(err);
    }
};

/**
 * @desc    Mark all unread notifications as read
 * @route   PATCH /api/notifications/read-all
 * @access  Private
 */
export const markAllAsRead = async (req, res, next) => {
    try {
        await Notification.updateMany(
            { recipient: req.user._id, isRead: false },
            { isRead: true }
        );

        res.status(200).json({
            success: true,
            message: 'All notifications marked as read'
        });
    } catch (err) {
        next(err);
    }
};

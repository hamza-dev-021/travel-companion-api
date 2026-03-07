import express from 'express';
import { protect } from '../middleware/auth.js';
import {
    streamNotifications,
    getNotifications,
    getUnreadCount,
    markAsRead,
    markAllAsRead
} from '../controllers/notificationController.js';

const router = express.Router();

router.use(protect);

router.get('/stream', streamNotifications);
router.get('/', getNotifications);
router.get('/unread-count', getUnreadCount);
router.patch('/read-all', markAllAsRead);
router.patch('/:id/read', markAsRead);

export default router;

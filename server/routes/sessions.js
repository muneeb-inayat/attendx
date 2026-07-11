import express from 'express';
import {
    createSession,
    getSession,
    getSessionQR,
    forceRefreshQR,
    stopSession,
    cancelSession,
    getStudentSessionInfo,
    getActiveSessions,
    getSessionHistory,
    updateSessionSettings
} from '../controllers/sessionController.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();

// All routes require authentication
router.use(protect);

// ========================================
// STUDENT ROUTES
// ========================================

// Get session info for attendance marking
router.get('/:id/info', authorize('student'), getStudentSessionInfo);

// ========================================
// PROFESSOR ROUTES
// ========================================

// Create new session
router.post('/', authorize('professor', 'admin'), createSession);

// Get active sessions
router.get('/professor/active', authorize('professor', 'admin'), getActiveSessions);

// Get session history
router.get('/professor/history', authorize('professor', 'admin'), getSessionHistory);

// Get specific session
router.get('/:id', authorize('professor', 'admin'), getSession);

// Get/refresh QR code
router.get('/:id/qr', authorize('professor', 'admin'), getSessionQR);

// Force refresh QR
router.post('/:id/refresh-qr', authorize('professor', 'admin'), forceRefreshQR);

// Update session settings
router.put('/:id/settings', authorize('professor', 'admin'), updateSessionSettings);

// Stop session
router.put('/:id/stop', authorize('professor', 'admin'), stopSession);

// Cancel session (professor can cancel before session ends)
router.delete('/:id', authorize('professor'), cancelSession);

export default router;

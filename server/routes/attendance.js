import express from 'express';
import {
    markAttendance,
    getMyAttendance,
    getAttendanceBySession,
    getSuspiciousAttendance,
    getStudentAudit,
    getCourseAttendance,
    exportCourseAttendance,
    getSessionDetails,
    getStudentSummary,
    getFailedAttempts,
    acceptFailedAttempt,
    rejectFailedAttempt,
    acceptAllFailedAttempts,
    rejectAllFailedAttempts
} from '../controllers/attendanceController.js';
import { protect, authorize } from '../middleware/auth.js';
import { rateLimitAttendance } from '../middleware/rateLimiter.js';

const router = express.Router();

// All routes require authentication
router.use(protect);

// ========================================
// STUDENT ROUTES
// ========================================

// Mark attendance (rate limited)
router.post('/mark', authorize('student'), rateLimitAttendance, markAttendance);

// Get own attendance history
router.get('/history', authorize('student'), getMyAttendance);

// Get comprehensive attendance summary
router.get('/summary', authorize('student'), getStudentSummary);

// ========================================
// PROFESSOR ROUTES
// ========================================

// Get attendance for a session (basic)
router.get('/session/:sessionId', authorize('professor', 'admin'), getAttendanceBySession);

// Get detailed session attendance with full student info
router.get('/session/:sessionId/details', authorize('professor', 'admin'), getSessionDetails);

// Get failed attendance attempts for a session (for professor review)
router.get('/session/:sessionId/failed-attempts', authorize('professor', 'admin'), getFailedAttempts);

// Manually accept a failed attendance attempt
router.post('/failed-attempt/:attemptId/accept', authorize('professor', 'admin'), acceptFailedAttempt);

// Reject a failed attendance attempt
router.post('/failed-attempt/:attemptId/reject', authorize('professor', 'admin'), rejectFailedAttempt);

// Bulk accept all pending failed attempts for a session
router.post('/session/:sessionId/failed-attempts/accept-all', authorize('professor', 'admin'), acceptAllFailedAttempts);

// Bulk reject all pending failed attempts for a session
router.post('/session/:sessionId/failed-attempts/reject-all', authorize('professor', 'admin'), rejectAllFailedAttempts);

// Get complete course attendance with all students and sessions
router.get('/course/:courseId', authorize('professor', 'admin'), getCourseAttendance);

// Export course attendance to CSV
router.get('/course/:courseId/export', authorize('professor', 'admin'), exportCourseAttendance);

// ========================================
// ADMIN ROUTES
// ========================================

// Get suspicious attendance records
router.get('/suspicious', authorize('admin'), getSuspiciousAttendance);

// Get student audit log
router.get('/audit/:studentId', authorize('admin'), getStudentAudit);

export default router;


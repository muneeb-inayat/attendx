import express from 'express';
import {
    getCourses,
    getClaimableCourses,
    getCourse,
    claimCourse,
    unclaimCourse,
    getMyClaimRequests,
    updateCourse,
    getStudentCourses,
    getAvailableBranches,

} from '../controllers/courseController.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();

router.use(protect);

// ============================================
// STUDENT ROUTES
// ============================================
router.get('/my-courses', authorize('student'), getStudentCourses);

// ============================================
// PROFESSOR ROUTES
// ============================================
router.get(
    '/branches',
    authorize('professor', 'admin'),
    getAvailableBranches
);
// Get claimed courses and claimable courses
router.get('/', authorize('professor', 'admin'), getCourses);
router.get('/claimable', authorize('professor'), getClaimableCourses);
router.get('/my-requests', authorize('professor'), getMyClaimRequests);

// Course claiming
router.post('/:id/claim', authorize('professor'), claimCourse);
router.post('/:id/unclaim', authorize('professor'), unclaimCourse);

// Course details and updates (for claimed courses)
router.get('/:id', authorize('professor', 'admin'), getCourse);
router.put('/:id', authorize('professor', 'admin'), updateCourse);

// Note: Course creation and deletion moved to /api/admin/courses (Admin only)

export default router;

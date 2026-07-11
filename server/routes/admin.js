import express from 'express';
import {
    // Professor management
    getPendingProfessors,
    approveProfessor,
    getAllStudents,
    getAllProfessors,
    // Course management
    createCourse,
    bulkImportCourses,
    getAllCourses,
    updateCourse,
    deleteCourse,
  
    // Claim requests
    getClaimRequests,
    processClaimRequest,
    // Elective requests
    getElectiveRequests,
    processElectiveRequest,
    // Pending users
    getPendingUsers,
    processPendingUser,
    // Analytics
    getSystemAnalytics,
    bulkApproveStudents,
    // User management
    deleteUser
} from '../controllers/adminController.js';
import { protect, authorize } from '../middleware/auth.js';

import { uploadStudents } from '../middleware/upload.js'

const router = express.Router();

// All routes require authentication and admin role
router.use(protect);
router.use(authorize('admin'));

// ============================================
// ANALYTICS
// ============================================
router.get('/analytics', getSystemAnalytics);

// ============================================
// USER LISTS
// ============================================
router.get('/students', getAllStudents);
router.get('/professors', getAllProfessors);

// ============================================
// USER MANAGEMENT (DELETE)
// ============================================
router.delete('/users/:id', deleteUser);

// ============================================
// PROFESSOR MANAGEMENT
// ============================================
router.get('/pending-professors', getPendingProfessors);
router.put('/approve-professor/:id', approveProfessor);

// ============================================
// COURSE MANAGEMENT (NEW - Admin creates courses)
// ============================================
router.post('/courses', createCourse);
router.post(
    "/courses/import",
    protect,
    authorize("admin"),
    uploadStudents.single("file"),
    bulkImportCourses
);
router.get('/courses', getAllCourses);
router.put('/courses/:id', updateCourse);
router.delete('/courses/:id', deleteCourse);


// ============================================
// CLAIM REQUEST APPROVAL (NEW)
// ============================================
router.get('/claim-requests', getClaimRequests);
router.put('/claim-requests/:id', processClaimRequest);

// ============================================
// ELECTIVE REQUEST APPROVAL (NEW)
// ============================================
router.get('/elective-requests', getElectiveRequests);
router.put('/elective-requests/:id', processElectiveRequest);

// ============================================
// PENDING USERS (Non-standard emails)
// ============================================
router.get('/pending-users', getPendingUsers);
router.put('/pending-users/:id', processPendingUser);

// ============================================
// BULK OPERATIONS
// ============================================
router.post('/bulk-approve', bulkApproveStudents);

// ============================================
// REDIS CACHE MANAGEMENT (for fixing stale entries)
// ============================================
import { redisService } from '../config/redis.js';

router.post('/flush-redis-attendance', async (req, res) => {
    try {
        const result = await redisService.flushAllAttendanceMarks();
        if (result.success) {
            res.json({
                success: true,
                message: `Flushed ${result.deleted} attendance marks from Redis cache`
            });
        } else {
            res.status(500).json({
                success: false,
                error: result.error || 'Failed to flush Redis'
            });
        }
    } catch (error) {
        console.error('Flush Redis Error:', error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
});

// Debug endpoint to check student's attendance records
import { Attendance, Session } from '../models/index.js';

router.get('/debug/student-attendance/:studentId', async (req, res) => {
    try {
        const { studentId } = req.params;

        // Get all attendance records for this student
        const records = await Attendance.find({ student: studentId })
            .populate({
                path: 'session',
                select: 'startTime isActive course',
                populate: { path: 'course', select: 'courseName courseCode' }
            })
            .sort({ createdAt: -1 })
            .limit(20);

        res.json({
            success: true,
            count: records.length,
            records: records.map(r => ({
                id: r._id,
                sessionId: r.session?._id,
                courseName: r.session?.course?.courseName,
                courseCode: r.session?.course?.courseCode,
                sessionActive: r.session?.isActive,
                sessionStartTime: r.session?.startTime,
                attendanceMarkedAt: r.createdAt,
                status: r.status
            }))
        });
    } catch (error) {
        console.error('Debug Error:', error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
});

// Debug endpoint to clear stale attendance for a student (for specific session)
router.delete('/debug/clear-attendance/:studentId/:sessionId', async (req, res) => {
    try {
        const { studentId, sessionId } = req.params;

        const result = await Attendance.deleteOne({
            student: studentId,
            session: sessionId
        });

        // Also clear from Redis
        await redisService.clearAttendanceMark(sessionId, studentId);

        res.json({
            success: true,
            message: `Deleted ${result.deletedCount} attendance record`,
            deletedCount: result.deletedCount
        });
    } catch (error) {
        console.error('Clear Attendance Error:', error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
});

// ============================================
// FIX: Drop stale indexes from old schema versions
// This fixes the duplicate key error on:
// course_1_student_1_date_1_scheduleSlot.startTime_1
// ============================================
router.post('/fix-stale-indexes', async (req, res) => {
    try {
        const collection = Attendance.collection;

        // Get all indexes
        const indexes = await collection.indexes();
        console.log('Current indexes:', indexes.map(i => i.name));

        // List of old/stale indexes to drop
        const staleIndexNames = [
            'course_1_student_1_date_1_scheduleSlot.startTime_1',
            'course_1_student_1_date_1',
            'scheduleSlot.startTime_1'
        ];

        const droppedIndexes = [];
        const errors = [];

        for (const indexName of staleIndexNames) {
            try {
                // Check if index exists
                const exists = indexes.some(i => i.name === indexName);
                if (exists) {
                    await collection.dropIndex(indexName);
                    droppedIndexes.push(indexName);
                    console.log(`✅ Dropped stale index: ${indexName}`);
                }
            } catch (err) {
                if (!err.message.includes('index not found')) {
                    errors.push({ index: indexName, error: err.message });
                }
            }
        }

        // Get updated indexes
        const updatedIndexes = await collection.indexes();

        res.json({
            success: true,
            message: `Dropped ${droppedIndexes.length} stale indexes`,
            droppedIndexes,
            errors: errors.length > 0 ? errors : undefined,
            currentIndexes: updatedIndexes.map(i => ({ name: i.name, key: i.key }))
        });
    } catch (error) {
        console.error('Fix Indexes Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

export default router;

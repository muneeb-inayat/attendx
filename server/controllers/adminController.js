import { User, Course, Session, Attendance, AuditLog, ClaimRequest, ElectiveRequest, DeviceRegistry } from '../models/index.js';
import fs from "fs";
import csv from "csv-parser";

// ============================================
// PROFESSOR MANAGEMENT (EXISTING)
// ============================================

export const getPendingProfessors = async (req, res) => {
    try {
        const pending = await User.find({ role: 'pending_professor' });
        res.json({ success: true, count: pending.length, data: pending });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

/**
 * @route   GET /api/admin/students
 * @desc    Get all students
 * @access  Private (Admin)
 */
export const getAllStudents = async (req, res) => {
    try {
        const students = await User.find({ role: 'student' })
            .select('name email rollNo branch branchCode academicState createdAt')
            .sort({ createdAt: -1 });
        res.json({ success: true, count: students.length, data: students });
    } catch (error) {
        console.error('Get Students Error:', error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

/**
 * @route   GET /api/admin/professors
 * @desc    Get all approved professors
 * @access  Private (Admin)
 */
export const getAllProfessors = async (req, res) => {
    try {
        const professors = await User.find({ role: 'professor' })
            .select('name email createdAt');

        // Get count of courses claimed by each professor
        const professorsWithCourses = await Promise.all(
            professors.map(async (prof) => {
                const courseCount = await Course.countDocuments({ claimedBy: prof._id });
                return { ...prof.toObject(), courseCount };
            })
        );

        res.json({ success: true, count: professors.length, data: professorsWithCourses });
    } catch (error) {
        console.error('Get Professors Error:', error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

export const approveProfessor = async (req, res) => {
    try {
        const { id } = req.params;
        const { action } = req.body; // 'approve' or 'reject'

        const user = await User.findById(id);
        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        if (user.role !== 'pending_professor') {
            return res.status(400).json({ success: false, error: 'User is not a pending professor' });
        }

        if (action === 'approve') {
            user.role = 'professor';
            await user.save();
            res.json({ success: true, message: 'Professor approved', data: user });
        } else if (action === 'reject') {
            await user.deleteOne();
            res.json({ success: true, message: 'Request rejected and user removed' });
        } else {
            res.status(400).json({ success: false, error: 'Invalid action' });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

// ============================================
// COURSE MANAGEMENT (NEW - ADMIN ONLY)
// ============================================

/**
 * @route   POST /api/admin/courses
 * @desc    Create a new course (Admin only)
 * @access  Private (Admin)
 */
export const createCourse = async (req, res) => {
    try {
        const {
            courseCode,
            courseName,
            description,
            branch,
            year,
            semester,
            batch,
            schedules,
            schedule, // Support legacy single schedule
            defaultLocation,
            defaultDuration,
            lateThreshold
        } = req.body;

        // Validate required fields
        if (!courseCode || !courseName || !branch || !year || !semester) {
            return res.status(400).json({
                success: false,
                error: 'Please provide courseCode, courseName, branch, year, and semester'
            });
        }

        // Handle both schedules array and legacy single schedule
        let courseSchedules = schedules || [];
        if (!schedules && schedule) {
            // Convert legacy single schedule to array
            courseSchedules = [schedule];
        }

        // Check if course already exists for this branch/year/batch combination
        const existingCourse = await Course.findOne({
            courseCode: courseCode.toUpperCase(),
            branch: branch.toLowerCase(),
            year,
            batch: batch || 'all'
        });

        if (existingCourse) {
            return res.status(400).json({
                success: false,
                error: 'Course with this code already exists for this branch, year, and batch'
            });
        }

        const course = await Course.create({
            courseCode,
            courseName,
            description,
            branch: branch.toLowerCase(),
            year,
            semester,
            batch: batch || 'all',
            schedules: courseSchedules,
            defaultLocation,
            defaultDuration,
            lateThreshold,
            createdBy: req.user._id,
            claimedBy: []
        });

        res.status(201).json({
            success: true,
            message: 'Course created successfully',
            data: course
        });
    } catch (error) {
        console.error('Create Course Error:', error);
        res.status(500).json({ success: false, error: error.message || 'Server Error' });
    }
};

/**
 * @route POST /api/admin/courses/import
 * @desc Bulk import courses from CSV
 * @access Private (Admin)
 */
export const bulkImportCourses = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: "CSV file is required"
            });
        }

        // -----------------------------
        // Parse CSV
        // -----------------------------

        const rows = await new Promise((resolve, reject) => {
            const data = [];

            fs.createReadStream(req.file.path)
                .pipe(csv())
                .on("data", row => {
                    data.push({
                        courseCode: row.courseCode?.trim().toUpperCase(),
                        courseName: row.courseName?.trim(),
                        description: row.description?.trim() || "",
                        branch: row.branch?.trim().toLowerCase(),
                        semester: Number(row.semester),
                        batch: row.batch?.trim().toLowerCase() || "all",

                        day: row.day?.trim(),
                        startTime: row.startTime?.trim(),
                        endTime: row.endTime?.trim(),
                        room: row.room?.trim()
                    });
                })
                .on("end", () => resolve(data))
                .on("error", reject);
        });

        const report = {
            total: rows.length,
            imported: 0,
            skipped: [],
            failed: []
        };

        const validBranches = [
            "cs",
            "it",
            "stat",
            "math",
            "phy",
            "chem",
            "bio",
            "comm",
            "mgmt",
            "eco",
            "eng",
            "psych"
        ];
        const validDays = [
            "Monday",
            "Tuesday",
            "Wednesday",
            "Thursday",
            "Friday",
            "Saturday"
        ];
        const validBatches = ["all", "1", "2", "3", "4", "5"];

        // -------------------------------------
        // Group rows by course
        // -------------------------------------

        const groupedCourses = new Map();

        rows.forEach((row, index) => {
            const key = `${row.courseCode}_${row.branch}_${row.semester}_${row.batch}`;

            if (!groupedCourses.has(key)) {
                groupedCourses.set(key, {
                    rowNumber: index + 2,
                    courseCode: row.courseCode,
                    courseName: row.courseName,
                    description: row.description,
                    branch: row.branch,
                    credits: Number(row.credits) || 4,
                    semester: row.semester,
                    batch: row.batch,
                    schedules: []
                });
            }

            groupedCourses.get(key).schedules.push({
                day: row.day,
                startTime: row.startTime,
                endTime: row.endTime,
                room: row.room
            });
        });

        const courses = [...groupedCourses.values()];

        // -------------------------------------
        // Existing courses lookup
        // -------------------------------------

        const existingCourses = await Course.find({
            $or: courses.map(c => ({
                courseCode: c.courseCode,
                branch: c.branch,
                semester: c.semester,
                batch: c.batch
            }))
        }).select("courseCode branch semester batch");

        const existingSet = new Set(
            existingCourses.map(
                c => `${c.courseCode}_${c.branch}_${c.semester}_${c.batch}`
            )
        );

        const seen = new Set();

        const validCourses = [];

        // -------------------------------------
        // Validation
        // -------------------------------------

        for (const course of courses) {

            const key = `${course.courseCode}_${course.branch}_${course.semester}_${course.batch}`;

            if (
                !course.courseCode ||
                !course.courseName ||
                !course.branch ||
                !course.semester
            ) {
                report.failed.push({
                    row: course.rowNumber,
                    reason: "Missing required fields"
                });
                continue;
            }

            if (!validBranches.includes(course.branch)) {
                report.failed.push({
                    row: course.rowNumber,
                    courseCode: course.courseCode,
                    reason: "Invalid branch"
                });
                continue;
            }
            validBranches
            if (course.semester < 1 || course.semester > 8) {
                report.failed.push({
                    row: course.rowNumber,
                    courseCode: course.courseCode,
                    reason: "Invalid semester"
                });
                continue;
            }

            if (!validBatches.includes(course.batch)) {
                report.failed.push({
                    row: course.rowNumber,
                    courseCode: course.courseCode,
                    reason: "Invalid batch"
                });
                continue;
            }

            let invalidSchedule = false;

            for (const sched of course.schedules) {

                if (!validDays.includes(sched.day)) {
                    report.failed.push({
                        row: course.rowNumber,
                        courseCode: course.courseCode,
                        reason: `Invalid day ${sched.day}`
                    });

                    invalidSchedule = true;
                    break;
                }

                if (!sched.startTime || !sched.endTime || !sched.room) {
                    report.failed.push({
                        row: course.rowNumber,
                        courseCode: course.courseCode,
                        reason: "Incomplete schedule"
                    });

                    invalidSchedule = true;
                    break;
                }
            }

            if (invalidSchedule) continue;

            if (seen.has(key)) {
                report.failed.push({
                    row: course.rowNumber,
                    courseCode: course.courseCode,
                    reason: "Duplicate course in CSV"
                });

                continue;
            }

            seen.add(key);

            if (existingSet.has(key)) {
                report.skipped.push({
                    row: course.rowNumber,
                    courseCode: course.courseCode,
                    reason: "Course already exists"
                });

                continue;
            }

            validCourses.push({
                courseCode: course.courseCode,
                courseName: course.courseName,
                description: course.description,
                branch: course.branch,
                credits: course.credits,
                semester: course.semester,
                batch: course.batch,
                schedules: course.schedules,
                createdBy: req.user._id,
                claimedBy: []
            });
        }

        // -------------------------------------
        // Bulk Insert
        // -------------------------------------

        if (validCourses.length > 0) {
            await Course.insertMany(validCourses);
            report.imported = validCourses.length;
        }

        fs.unlink(req.file.path, () => { });

        return res.status(201).json({
            success: true,
            message: "Courses imported successfully",
            data: report
        });

    } catch (error) {

        console.error("Bulk Course Import Error:", error);

        if (req.file) {
            fs.unlink(req.file.path, () => { });
        }

        return res.status(500).json({
            success: false,
            error: "Failed to import courses"
        });
    }
};

/**
 * @route   GET /api/admin/courses
 * @desc    Get all courses (Admin view with claim status)
 * @access  Private (Admin)
 */
export const getAllCourses = async (req, res) => {
    try {
        const { branch, year, semester, claimed } = req.query;

        const filter = { isArchived: false };
        if (branch) filter.branch = branch.toLowerCase();
        if (year) filter.year = parseInt(year);
        if (semester) filter.semester = parseInt(semester);

        let courses = await Course.find(filter)
            .populate('createdBy', 'name email')
            .populate('claimedBy', 'name email')
            .sort({ branch: 1, year: 1, courseCode: 1 });

        // Filter by claimed status if specified
        if (claimed === 'true') {
            courses = courses.filter(c => c.claimedBy.length > 0);
        } else if (claimed === 'false') {
            courses = courses.filter(c => c.claimedBy.length === 0);
        }

        res.json({
            success: true,
            count: courses.length,
            data: courses
        });
    } catch (error) {
        console.error('Get Courses Error:', error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

/**
 * @route   PUT /api/admin/courses/:id
 * @desc    Update a course (Admin only)
 * @access  Private (Admin)
 */
export const updateCourse = async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        const course = await Course.findById(id);
        if (!course) {
            return res.status(404).json({ success: false, error: 'Course not found' });
        }

        // Fields that can be updated
        const allowedUpdates = [
            'courseName', 'description', 'schedule',
            'defaultLocation', 'defaultDuration', 'lateThreshold'
        ];

        allowedUpdates.forEach(field => {
            if (updates[field] !== undefined) {
                course[field] = updates[field];
            }
        });

        await course.save();

        res.json({
            success: true,
            message: 'Course updated successfully',
            data: course
        });
    } catch (error) {
        console.error('Update Course Error:', error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

/**
 * @route   DELETE /api/admin/courses/:id
 * @desc    Archive or delete a course (Admin only)
 * @access  Private (Admin)
 */
export const deleteCourse = async (req, res) => {
    try {
        const { id } = req.params;
        const { permanent } = req.query;

        const course = await Course.findById(id);
        if (!course) {
            return res.status(404).json({ success: false, error: 'Course not found' });
        }

        if (permanent === 'true') {
            // Check for existing sessions
            const sessionCount = await Session.countDocuments({ course: id });
            if (sessionCount > 0) {
                return res.status(400).json({
                    success: false,
                    error: `Cannot permanently delete course with ${sessionCount} sessions. Archive instead.`
                });
            }
            await course.deleteOne();
            res.json({ success: true, message: 'Course permanently deleted' });
        } else {
            course.isArchived = true;
            await course.save();
            res.json({ success: true, message: 'Course archived' });
        }
    } catch (error) {
        console.error('Delete Course Error:', error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};







// ============================================
// CLAIM REQUEST MANAGEMENT (NEW)
// ============================================

/**
 * @route   GET /api/admin/claim-requests
 * @desc    Get all pending claim/unclaim requests
 * @access  Private (Admin)
 */
export const getClaimRequests = async (req, res) => {
    try {
        const { status = 'pending', type } = req.query;

        const filter = {};
        if (status) filter.status = status;
        if (type) filter.type = type;

        const requests = await ClaimRequest.find(filter)
            .populate('professor', 'name email')
            .populate('course', 'courseCode courseName branch year')
            .sort({ createdAt: -1 });

        res.json({
            success: true,
            count: requests.length,
            data: requests
        });
    } catch (error) {
        console.error('Get Claim Requests Error:', error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

/**
 * @route   PUT /api/admin/claim-requests/:id
 * @desc    Approve or reject a claim request
 * @access  Private (Admin)
 */
export const processClaimRequest = async (req, res) => {
    try {
        const { id } = req.params;
        const { action, reviewNote } = req.body; // 'approve' or 'reject'

        const request = await ClaimRequest.findById(id).populate('course');
        if (!request) {
            return res.status(404).json({ success: false, error: 'Request not found' });
        }

        if (request.status !== 'pending') {
            return res.status(400).json({ success: false, error: 'Request already processed' });
        }

        if (action === 'approve') {
            request.status = 'approved';

            if (request.type === 'claim') {
                // Add professor to course's claimedBy array
                await Course.findByIdAndUpdate(request.course._id, {
                    $addToSet: { claimedBy: request.professor }
                });
            } else if (request.type === 'unclaim') {
                // Remove professor from course's claimedBy array
                await Course.findByIdAndUpdate(request.course._id, {
                    $pull: { claimedBy: request.professor }
                });
            }
        } else if (action === 'reject') {
            request.status = 'rejected';
        } else {
            return res.status(400).json({ success: false, error: 'Invalid action' });
        }

        request.reviewedBy = req.user._id;
        request.reviewedAt = new Date();
        request.reviewNote = reviewNote || '';
        await request.save();

        res.json({
            success: true,
            message: `Claim request ${action}d successfully`,
            data: request
        });
    } catch (error) {
        console.error('Process Claim Request Error:', error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

// ============================================
// ELECTIVE REQUEST MANAGEMENT (NEW)
// ============================================

/**
 * @route   GET /api/admin/elective-requests
 * @desc    Get all pending elective requests
 * @access  Private (Admin)
 */
export const getElectiveRequests = async (req, res) => {
    try {
        const { status = 'pending' } = req.query;

        const requests = await ElectiveRequest.find({ status })
            .populate('student', 'name email rollNo branch')
            .populate('course', 'courseCode courseName branch year')
            .sort({ createdAt: -1 });

        res.json({
            success: true,
            count: requests.length,
            data: requests
        });
    } catch (error) {
        console.error('Get Elective Requests Error:', error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

/**
 * @route   PUT /api/admin/elective-requests/:id
 * @desc    Approve or reject an elective request
 * @access  Private (Admin)
 */
export const processElectiveRequest = async (req, res) => {
    try {
        const { id } = req.params;
        const { action, reviewNote } = req.body;

        const request = await ElectiveRequest.findById(id);
        if (!request) {
            return res.status(404).json({ success: false, error: 'Request not found' });
        }

        if (request.status !== 'pending') {
            return res.status(400).json({ success: false, error: 'Request already processed' });
        }

        if (action === 'approve') {
            request.status = 'approved';

            // Add course to student's electiveCourses
            await User.findByIdAndUpdate(request.student, {
                $addToSet: { electiveCourses: request.course }
            });
        } else if (action === 'reject') {
            request.status = 'rejected';
        } else {
            return res.status(400).json({ success: false, error: 'Invalid action' });
        }

        request.reviewedBy = req.user._id;
        request.reviewedAt = new Date();
        request.reviewNote = reviewNote || '';
        await request.save();

        res.json({
            success: true,
            message: `Elective request ${action}d successfully`,
            data: request
        });
    } catch (error) {
        console.error('Process Elective Request Error:', error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

// ============================================
// PENDING USERS (NON-STANDARD EMAILS)
// ============================================

/**
 * @route   GET /api/admin/pending-users
 * @desc    Get users with non-standard emails needing review
 * @access  Private (Admin)
 */
export const getPendingUsers = async (req, res) => {
    try {
        const users = await User.find({ pendingReview: true })
            .sort({ createdAt: -1 });

        res.json({
            success: true,
            count: users.length,
            data: users
        });
    } catch (error) {
        console.error('Get Pending Users Error:', error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

/**
 * @route   PUT /api/admin/pending-users/:id
 * @desc    Assign role and branch to a pending user
 * @access  Private (Admin)
 */
export const processPendingUser = async (req, res) => {
    try {
        const { id } = req.params;
        const { role, branch, branchCode, admissionYear, action } = req.body;

        const user = await User.findById(id);
        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        if (action === 'reject') {
            await user.deleteOne();
            return res.json({ success: true, message: 'User rejected and removed' });
        }

        if (!role) {
            return res.status(400).json({ success: false, error: 'Role is required' });
        }

        user.role = role;
        if (role === 'student') {
            user.branch = branch;
            user.branchCode = branchCode;
            user.admissionYear = admissionYear;
        }
        user.pendingReview = false;
        await user.save();

        res.json({
            success: true,
            message: 'User updated successfully',
            data: user
        });
    } catch (error) {
        console.error('Process Pending User Error:', error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

// ============================================
// ANALYTICS (EXISTING - UPDATED)
// ============================================

export const getSystemAnalytics = async (req, res) => {
    try {
        const now = new Date();
        const today = new Date(now.setHours(0, 0, 0, 0));
        const thisWeek = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
        const thisMonth = new Date(today.getFullYear(), today.getMonth(), 1);

        // User stats
        const totalStudents = await User.countDocuments({ role: 'student' });
        const totalProfessors = await User.countDocuments({ role: 'professor' });
        const pendingProfessors = await User.countDocuments({ role: 'pending_professor' });
        const pendingReviewUsers = await User.countDocuments({ pendingReview: true });

        // Course stats (updated for new model)
        const totalCourses = await Course.countDocuments({ isArchived: false });
        const claimedCourses = await Course.countDocuments({
            isArchived: false,
            'claimedBy.0': { $exists: true }
        });
        const unclaimedCourses = totalCourses - claimedCourses;

        // Request stats
        const pendingClaimRequests = await ClaimRequest.countDocuments({ status: 'pending' });
        const pendingElectiveRequests = await ElectiveRequest.countDocuments({ status: 'pending' });

        // Session stats
        const totalSessions = await Session.countDocuments();
        const activeSessions = await Session.countDocuments({ isActive: true });
        const sessionsToday = await Session.countDocuments({ startTime: { $gte: today } });

        // Attendance stats
        const totalAttendance = await Attendance.countDocuments();
        const presentCount = await Attendance.countDocuments({ status: 'PRESENT' });
        const lateCount = await Attendance.countDocuments({ status: 'LATE' });

        res.json({
            success: true,
            data: {
                users: {
                    totalStudents,
                    totalProfessors,
                    pendingProfessors,
                    pendingReviewUsers
                },
                courses: {
                    total: totalCourses,
                    claimed: claimedCourses,
                    unclaimed: unclaimedCourses
                },
                requests: {
                    pendingClaims: pendingClaimRequests,
                    pendingElectives: pendingElectiveRequests
                },
                sessions: {
                    total: totalSessions,
                    active: activeSessions,
                    today: sessionsToday
                },
                attendance: {
                    total: totalAttendance,
                    present: presentCount,
                    late: lateCount,
                    averageRate: totalAttendance > 0
                        ? Math.round((presentCount + lateCount) / totalAttendance * 100)
                        : 0
                }
            }
        });
    } catch (error) {
        console.error('Analytics Error:', error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

export const bulkApproveStudents = async (req, res) => {
    try {
        const { studentIds, action = 'approve' } = req.body;

        if (!studentIds || !Array.isArray(studentIds) || studentIds.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Student IDs array is required'
            });
        }

        if (action === 'approve') {
            const result = await User.updateMany(
                { _id: { $in: studentIds }, role: 'pending_student' },
                { role: 'student' }
            );

            res.json({
                success: true,
                message: `${result.modifiedCount} students approved`,
                modifiedCount: result.modifiedCount
            });
        } else if (action === 'reject') {
            const result = await User.deleteMany({
                _id: { $in: studentIds },
                role: 'pending_student'
            });

            res.json({
                success: true,
                message: `${result.deletedCount} students rejected`,
                deletedCount: result.deletedCount
            });
        } else {
            res.status(400).json({ success: false, error: 'Invalid action' });
        }
    } catch (error) {
        console.error('Bulk Approve Error:', error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

/**
 * @route   DELETE /api/admin/users/:id
 * @desc    Delete a user (student/professor) and all related data
 * @access  Private (Admin)
 */
export const deleteUser = async (req, res) => {
    try {
        const { id } = req.params;

        const user = await User.findById(id);
        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        // Cannot delete admin accounts
        if (user.role === 'admin') {
            return res.status(403).json({
                success: false,
                error: 'Cannot delete admin accounts'
            });
        }

        const deletionSummary = {
            user: { email: user.email, role: user.role, name: user.name },
            deletedRecords: {}
        };

        // Handle STUDENT deletion
        if (user.role === 'student') {
            // Delete all attendance records for this student
            const attendanceResult = await Attendance.deleteMany({ student: user._id });
            deletionSummary.deletedRecords.attendanceRecords = attendanceResult.deletedCount;

            // Delete any elective requests
            const electiveResult = await ElectiveRequest.deleteMany({ student: user._id });
            deletionSummary.deletedRecords.electiveRequests = electiveResult.deletedCount;

            console.log(`Deleted student data: ${attendanceResult.deletedCount} attendance records, ${electiveResult.deletedCount} elective requests`);
        }

        // Handle PROFESSOR deletion
        if (user.role === 'professor' || user.role === 'pending_professor') {
            // Get all sessions created by this professor
            const professorSessions = await Session.find({ professor: user._id });
            const sessionIds = professorSessions.map(s => s._id);

            // Delete all attendance records for sessions created by this professor
            const attendanceResult = await Attendance.deleteMany({ session: { $in: sessionIds } });
            deletionSummary.deletedRecords.attendanceRecords = attendanceResult.deletedCount;

            // Delete all sessions created by this professor
            const sessionResult = await Session.deleteMany({ professor: user._id });
            deletionSummary.deletedRecords.sessions = sessionResult.deletedCount;

            // Release all courses claimed by this professor
            const courseResult = await Course.updateMany(
                { claimedBy: user._id },
                { $pull: { claimedBy: user._id } }
            );
            deletionSummary.deletedRecords.coursesReleased = courseResult.modifiedCount;

            // Delete any claim requests by this professor
            const claimResult = await ClaimRequest.deleteMany({ professor: user._id });
            deletionSummary.deletedRecords.claimRequests = claimResult.deletedCount;

            console.log(`Deleted professor data: ${sessionResult.deletedCount} sessions, ${attendanceResult.deletedCount} attendance records, ${courseResult.modifiedCount} courses released`);
        }

        // Log the deletion
        await AuditLog.log({
            eventType: 'ADMIN_DELETED_USER',
            userId: user._id,
            userEmail: user.email,
            userRole: user.role,
            adminId: req.user._id,
            adminEmail: req.user.email,
            metadata: {
                deletedAt: new Date(),
                deletionSummary
            }
        });

        // Delete the user
        await User.findByIdAndDelete(user._id);

        console.log(`Admin ${req.user.email} deleted user: ${user.email} (${user.role})`);

        res.json({
            success: true,
            message: `User ${user.email} and all related data deleted successfully`,
            data: deletionSummary
        });

    } catch (error) {
        console.error('Delete User Error:', error);
        res.status(500).json({ success: false, error: 'Failed to delete user' });
    }
};
export const getPendingDeviceChanges = async (req, res) => {
    const requests = await DeviceRegistry.find({ status: 'pending' })
        .populate('student', 'name email rollNo deviceSecurity')
        .sort({ requestedAt: 1 });
    res.json({ success: true, data: requests });
};

export const approveDeviceChange = async (req, res) => {
    const request = await DeviceRegistry.findOne({
        _id: req.params.requestId,
        status: 'pending'
    });
    if (!request) {
        return res.status(404).json({ success: false, error: 'Pending device request not found' });
    }

    // A student can have only one active device.
    await DeviceRegistry.updateMany(
        { student: request.student, status: 'active' },
        { $set: { status: 'revoked', reviewedBy: req.user._id, reviewedAt: new Date(), reviewNote: 'Replaced by approved device' } }
    );
    await DeviceRegistry.updateMany(
        {
            student: request.student,
            status: 'pending',
            _id: { $ne: request._id }
        },
        {
            $set: {
                status: 'rejected',
                reviewedBy: req.user._id,
                reviewedAt: new Date(),
                reviewNote: 'Another device-change request was approved'
            }
        }
    );

    request.status = 'active';
    request.reviewedBy = req.user._id;
    request.reviewedAt = new Date();
    request.reviewNote = req.body.note?.trim() || 'Approved by administrator';
    request.usageCount += 1;
    request.lastUsed = new Date();
    await request.save();

    // Approval resets the change counter and removes the block.
    await User.findByIdAndUpdate(request.student, {
        $set: {
            'deviceSecurity.changeAttempts': 0,
            'deviceSecurity.blocked': false,
            'deviceSecurity.blockedAt': null,
            'deviceSecurity.blockedReason': null
        }
    });

    res.json({ success: true, message: 'New device approved' });
};

export const rejectDeviceChange = async (req, res) => {
    const request = await DeviceRegistry.findOneAndUpdate(
        { _id: req.params.requestId, status: 'pending' },
        {
            $set: {
                status: 'rejected',
                reviewedBy: req.user._id,
                reviewedAt: new Date(),
                reviewNote: req.body.reason?.trim() || 'Rejected by administrator'
            }
        },
        { new: true }
    );
    if (!request) {
        return res.status(404).json({ success: false, error: 'Pending device request not found' });
    }
    res.json({ success: true, message: 'Device change rejected' });
};

export default {
    // Professor management
    getPendingProfessors,
    approveProfessor,
    // Course management
    createCourse,
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
    deleteUser,
    getPendingDeviceChanges,
    approveDeviceChange,
    rejectDeviceChange
};


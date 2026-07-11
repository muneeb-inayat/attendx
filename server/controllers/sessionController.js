import QRCode from 'qrcode';
import { Session, Course, Attendance, AuditLog } from '../models/index.js';
import { redisService } from '../config/redis.js';
import config from '../config/index.js';

/**
 * SECURE SESSION CONTROLLER
 * Implements enhanced QR generation with rotating tokens
 */

/**
 * @route   POST /api/sessions
 * @desc    Start a session (Professor Only)
 * @access  Private (Professor)
 */
export const createSession = async (req, res) => {
    try {
        const {
            courseId,
            centerLat,
            centerLng,
            radius,
            duration, // minutes
            qrRotationInterval, // milliseconds
            securityLevel = 'standard',
            deviceBinding = true,
            locationBinding = true,
            requiredAccuracy = 100,
            lateThreshold = 15
        } = req.body;

        if (!courseId || !centerLat || !centerLng) {
            return res.status(400).json({
                success: false,
                error: 'Course ID and location are required'
            });
        }

        // Validate professor has claimed this course
        const course = await Course.findOne({
            _id: courseId,
            claimedBy: req.user._id
        });

        if (!course) {
            return res.status(404).json({
                success: false,
                error: 'Course not found or not claimed by you'
            });
        }

        // Check for existing active session for this course
        const existingSession = await Session.findOne({
            course: courseId,
            isActive: true,
            endTime: { $gt: new Date() }
        });

        if (existingSession) {
            return res.status(400).json({
                success: false,
                error: 'An active session already exists for this course',
                existingSessionId: existingSession._id
            });
        }

        // Calculate times
        const startTime = new Date();
        const sessionDuration = duration || course.defaultDuration || 60;
        const endTime = new Date(startTime.getTime() + sessionDuration * 60000);

        // Get session number (count of previous sessions + 1)
        const previousSessionsCount = await Session.countDocuments({ course: course._id });
        const sessionNumber = previousSessionsCount + 1;

        // Create session with security settings
        const session = await Session.create({
            course: course._id,
            professor: req.user._id,
            sessionNumber,
            startTime,
            endTime,
            centerLat,
            centerLng,
            radius: radius || course.defaultLocation?.radius || 150,
            qrRotationInterval: qrRotationInterval || 30000,
            securityLevel,
            deviceBinding,
            locationBinding,
            requiredAccuracy,
            lateThreshold,
            isActive: true
        });

        // Generate initial QR token
        await session.refreshQRToken();

        // Cache session in Redis
        await redisService.cacheSession(
            session._id.toString(),
            session.getCacheSummary(),
            sessionDuration * 60 + 300 // Session duration + 5 min buffer
        );

        // Audit log
        await AuditLog.log({
            eventType: 'SESSION_START',
            userId: req.user._id,
            userEmail: req.user.email,
            userRole: 'professor',
            sessionId: session._id,
            courseId: course._id,
            metadata: {
                duration: sessionDuration,
                securityLevel,
                deviceBinding,
                locationBinding,
                radius: session.radius
            }
        });

        res.status(201).json({
            success: true,
            message: 'Session started',
            data: {
                _id: session._id,
                sessionId: session.sessionId,
                course: {
                    _id: course._id,
                    courseName: course.courseName,
                    courseCode: course.courseCode
                },
                startTime: session.startTime,
                endTime: session.endTime,
                duration: sessionDuration,
                centerLat: session.centerLat,
                centerLng: session.centerLng,
                radius: session.radius,
                securityLevel: session.securityLevel,
                isActive: session.isActive
            }
        });

    } catch (error) {
        console.error('Create Session Error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to start session'
        });
    }
};

/**
 * @route   GET /api/sessions/:id
 * @desc    Get session details (Professor)
 * @access  Private (Professor)
 */
export const getSession = async (req, res) => {
    try {
        // Find session and verify professor has claimed the course
        const session = await Session.findById(req.params.id)
            .populate('course', 'courseName courseCode branch year claimedBy');

        if (!session || !session.course.claimedBy.includes(req.user._id)) {

            return res.status(404).json({
                success: false,
                error: 'Session not found or you have not claimed this course'
            });
        }

        // Get attendance stats
        const stats = await Attendance.getSessionStats(session._id);

        res.json({
            success: true,
            data: {
                ...session.toObject(),
                stats
            }
        });

    } catch (error) {
        console.error('Get Session Error:', error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

/**
 * @route   GET /api/sessions/:id/qr
 * @desc    Get/Refresh QR (Professor Only) - Enhanced with rotating tokens
 * @access  Private (Professor)
 */
export const getSessionQR = async (req, res) => {
    try {
        const session = await Session.findById(req.params.id)
            .populate('course', 'claimedBy');

        if (!session || !session.course.claimedBy.includes(req.user._id)) {
            return res.status(404).json({
                success: false,
                error: 'Session not found or you have not claimed this course'
            });
        }

        if (!session.isActive) {
            return res.status(400).json({
                success: false,
                error: 'Session is not active'
            });
        }

        // Check if session has ended
        if (new Date() > session.endTime) {
            session.isActive = false;
            await session.save();
            return res.status(400).json({
                success: false,
                error: 'Session has ended'
            });
        }

        // Check if QR needs refresh
        const now = Date.now();
        if (now >= session.qrExpiresAt.getTime()) {
            await session.refreshQRToken();
        }

        // Get QR data for encoding
        const qrData = session.getQRData();

        // Store nonce in Redis for validation
        await redisService.setSessionNonce(
            session._id.toString(),
            qrData.n,
            Math.ceil((qrData.e - now) / 1000) + 5 // TTL in seconds + buffer
        );

        // Generate QR Code
        const qrContent = JSON.stringify(qrData);
        const qrCodeDataUrl = await QRCode.toDataURL(qrContent, {
            width: 400,
            margin: 2,
            color: {
                dark: '#000000',
                light: '#ffffff'
            }
        });

        // Audit QR generation
        await AuditLog.log({
            eventType: 'QR_GENERATED',
            userId: req.user._id,
            userRole: 'professor',
            sessionId: session._id,
            metadata: {
                rotationCount: session.qrRotationCount,
                expiresAt: session.qrExpiresAt
            }
        });

        res.json({
            success: true,
            data: {
                qrCode: qrCodeDataUrl,
                expiresAt: session.qrExpiresAt,
                remainingMs: session.qrExpiresAt.getTime() - now,
                rotationCount: session.qrRotationCount,
                refreshInterval: session.qrRotationInterval
            }
        });

    } catch (error) {
        console.error('QR Error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to generate QR'
        });
    }
};

/**
 * @route   POST /api/sessions/:id/refresh-qr
 * @desc    Force refresh QR token (Professor Only)
 * @access  Private (Professor)
 */
export const forceRefreshQR = async (req, res) => {
    try {
        const session = await Session.findOne({
            _id: req.params.id,
            isActive: true
        }).populate('course', 'claimedBy');

        if (!session || !session.course.claimedBy.includes(req.user._id)) {
            return res.status(404).json({
                success: false,
                error: 'Active session not found or you have not claimed this course'
            });
        }

        // Force refresh
        await session.refreshQRToken();

        // Invalidate old nonces in Redis
        // (They will expire naturally, but we can explicitly invalidate if needed)

        // Get new QR
        const qrData = session.getQRData();
        const qrContent = JSON.stringify(qrData);
        const qrCodeDataUrl = await QRCode.toDataURL(qrContent, {
            width: 400,
            margin: 2
        });

        // Store new nonce
        await redisService.setSessionNonce(
            session._id.toString(),
            qrData.n,
            35
        );

        res.json({
            success: true,
            message: 'QR refreshed',
            data: {
                qrCode: qrCodeDataUrl,
                expiresAt: session.qrExpiresAt,
                rotationCount: session.qrRotationCount
            }
        });

    } catch (error) {
        console.error('Force Refresh Error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to refresh QR'
        });
    }
};

/**
 * @route   PUT /api/sessions/:id/stop
 * @desc    Stop/End session
 * @access  Private (Professor)
 */
export const stopSession = async (req, res) => {
    try {
        // First verify professor has claimed the course
        const session = await Session.findById(req.params.id)
            .populate('course', 'claimedBy');

        if (!session || !session.course.claimedBy.includes(req.user._id)) {
            return res.status(404).json({
                success: false,
                error: 'Session not found or you have not claimed this course'
            });
        }

        // Stop the session
        session.isActive = false;
        session.endTime = new Date();
        await session.save();

        // Invalidate session cache
        await redisService.invalidateSession(session._id.toString());

        // Get final stats
        const stats = await Attendance.getSessionStats(session._id);

        // Audit log
        await AuditLog.log({
            eventType: 'SESSION_STOP',
            userId: req.user._id,
            userRole: 'professor',
            sessionId: session._id,
            metadata: {
                duration: (new Date() - session.startTime) / 60000,
                attendanceCount: stats.total,
                stats
            }
        });

        res.json({
            success: true,
            message: 'Session stopped',
            stats
        });
    } catch (error) {
        console.error('Stop Session Error:', error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

/**
 * @route   GET /api/sessions/:id/info
 * @desc    Get session basic info for student verification
 * @access  Private (Student)
 */
export const getStudentSessionInfo = async (req, res) => {
    try {
        const session = await Session.findById(req.params.id)
            .populate('course', 'courseName courseCode branch year semester');

        if (!session) {
            return res.status(404).json({
                success: false,
                error: 'Session not found'
            });
        }

        // Check if student is eligible for this course
        const student = req.user;
        if (student.role === 'student') {
            const studentBranchCode = (student.branchCode || '').toLowerCase();
            const courseBranchCode = (session.course.branch || '').toLowerCase();

            const branchMatch = studentBranchCode === courseBranchCode;
            const yearMatch = session.course.year === student.academicState?.year;

            // Check batch eligibility:
            // - If course has no batch or batch is 'all', everyone is eligible
            // - Otherwise, batch must match
            const courseBatch = session.course.batch || 'all';
            const batchMatch = courseBatch === 'all' || courseBatch === student.batch;

            // Check if course is in student's approved electives
            const isElective = student.electiveCourses?.some(
                ec => ec.toString() === session.course._id.toString()
            );

            if (!((branchMatch && yearMatch && batchMatch) || isElective)) {
                const batchInfo = courseBatch !== 'all' ? ` Batch ${courseBatch}` : '';
                return res.status(403).json({
                    success: false,
                    error: 'You are not eligible for this course',
                    details: {
                        required: {
                            branch: session.course.branch?.toUpperCase(),
                            year: session.course.year,
                            batch: session.course.batch
                        },
                        your: {
                            branch: studentBranchCode.toUpperCase(),
                            year: student.academicState?.year,
                            batch: student.batch
                        }
                    }
                });
            }
        }

        res.json({
            success: true,
            data: {
                id: session._id,
                sessionId: session.sessionId,
                courseName: session.course.courseName,
                courseCode: session.course.courseCode,
                branch: session.course.branch,
                year: session.course.year,
                startTime: session.startTime,
                endTime: session.endTime,
                isActive: session.isActive,
                securityLevel: session.securityLevel,
                // Location info for client-side distance preview
                centerLat: session.centerLat,
                centerLng: session.centerLng,
                radius: session.radius,
                requiredAccuracy: session.requiredAccuracy
            }
        });
    } catch (error) {
        console.error('Get Session Info Error:', error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

/**
 * @route   GET /api/sessions/professor/active
 * @desc    Get all active sessions for courses claimed by professor
 * @access  Private (Professor)
 */
export const getActiveSessions = async (req, res) => {
    try {
        // Find all courses claimed by this professor
        const claimedCourses = await Course.find({
            claimedBy: req.user._id,
            isArchived: false
        }).select('_id');

        const courseIds = claimedCourses.map(c => c._id);

        const sessions = await Session.find({
            course: { $in: courseIds },
            isActive: true,
            endTime: { $gt: new Date() }
        }).populate('course', 'courseName courseCode branch year');

        res.json({
            success: true,
            count: sessions.length,
            data: sessions
        });
    } catch (error) {
        console.error('Get Active Sessions Error:', error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

/**
 * @route   GET /api/sessions/professor/history
 * @desc    Get session history for courses claimed by professor
 * @access  Private (Professor)
 */
export const getSessionHistory = async (req, res) => {
    try {
        const { page = 1, limit = 20, courseId } = req.query;

        // Find all courses claimed by this professor
        const claimedCourses = await Course.find({
            claimedBy: req.user._id
        }).select('_id');

        const courseIds = claimedCourses.map(c => c._id);

        const query = { course: { $in: courseIds } };
        if (courseId && courseIds.some(id => id.toString() === courseId)) {
            query.course = courseId;
        }

        const sessions = await Session.find(query)
            .populate('course', 'courseName courseCode')
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(parseInt(limit));

        // Get attendance stats for each session
        const sessionsWithStats = await Promise.all(
            sessions.map(async (session) => {
                const stats = await Attendance.getSessionStats(session._id);
                return {
                    ...session.toObject(),
                    stats
                };
            })
        );

        const total = await Session.countDocuments(query);

        res.json({
            success: true,
            count: sessions.length,
            total,
            page: parseInt(page),
            pages: Math.ceil(total / limit),
            data: sessionsWithStats
        });
    } catch (error) {
        console.error('Get Session History Error:', error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

/**
 * @route   DELETE /api/sessions/:id
 * @desc    Cancel a session (before it ends)
 * @access  Private (Professor - must have claimed the course)
 */
export const cancelSession = async (req, res) => {
    try {
        const session = await Session.findById(req.params.id)
            .populate('course', 'claimedBy courseName courseCode');

        if (!session || !session.course.claimedBy.includes(req.user._id)) {
            return res.status(404).json({
                success: false,
                error: 'Session not found or you have not claimed this course'
            });
        }

        if (!session.isActive) {
            return res.status(400).json({
                success: false,
                error: 'Session is already inactive'
            });
        }

        // Mark as cancelled
        session.isActive = false;
        session.endTime = new Date();
        session.cancelledAt = new Date();
        session.cancelledBy = req.user._id;
        await session.save();

        // Invalidate session cache
        await redisService.invalidateSession(session._id.toString());

        // Audit log
        await AuditLog.log({
            eventType: 'SESSION_CANCELLED',
            userId: req.user._id,
            userRole: 'professor',
            sessionId: session._id,
            metadata: {
                courseName: session.course.courseName,
                courseCode: session.course.courseCode
            }
        });

        res.json({
            success: true,
            message: 'Session cancelled successfully'
        });
    } catch (error) {
        console.error('Cancel Session Error:', error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

/**
 * @route   PUT /api/sessions/:id/settings
 * @desc    Update session security settings
 * @access  Private (Professor)
 */
export const updateSessionSettings = async (req, res) => {
    try {
        const { securityLevel, deviceBinding, locationBinding, radius, requiredAccuracy, centerLat, centerLng } = req.body;

        // First verify professor has claimed the course
        const session = await Session.findOne({
            _id: req.params.id,
            isActive: true
        }).populate('course', 'claimedBy');

        if (!session || !session.course.claimedBy.includes(req.user._id)) {
            return res.status(404).json({
                success: false,
                error: 'Active session not found or you have not claimed this course'
            });
        }

        // Update settings
        if (securityLevel) session.securityLevel = securityLevel;
        if (deviceBinding !== undefined) session.deviceBinding = deviceBinding;
        if (locationBinding !== undefined) session.locationBinding = locationBinding;
        if (radius) session.radius = radius;
        if (requiredAccuracy) session.requiredAccuracy = requiredAccuracy;
        if (centerLat !== undefined) session.centerLat = centerLat;
        if (centerLng !== undefined) session.centerLng = centerLng;
        await session.save();

        // Update cache
        await redisService.cacheSession(
            session._id.toString(),
            session.getCacheSummary()
        );

        res.json({
            success: true,
            message: 'Settings updated',
            data: session
        });
    } catch (error) {
        console.error('Update Settings Error:', error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

export default {
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
};

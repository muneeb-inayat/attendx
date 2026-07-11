import mongoose from 'mongoose';
import { Attendance, Session, Course, AuditLog, DeviceRegistry, FailedAttempt } from '../models/index.js';
import { redisService } from '../config/redis.js';
import { trackFailedAttempt, isBlocked } from '../middleware/rateLimiter.js';
import {
    hashDeviceFingerprint,
    isValidFingerprint,
    getTimeWindow
} from '../utils/security.js';
import {
    validateLocation,
    detectSpoofing,
    calculateDistance
} from '../utils/geolocation.js';

/**
 * SECURE ATTENDANCE CONTROLLER
 * Implements the complete security chain:
 * Session + Student + Device + Time + Location
 * All must pass.
 */

/**
 * Helper: Log audit event
 */
const logAudit = async (eventType, data) => {
    try {
        await AuditLog.log({
            eventType,
            ...data,
            timestamp: new Date()
        });
    } catch (err) {
        console.error('Audit log error:', err.message);
    }
};

/**
 * Helper: Parse device info from user agent
 */
const parseDeviceInfo = (userAgent) => {
    if (!userAgent) return { deviceType: 'unknown', browser: 'unknown', os: 'unknown' };

    let deviceType = 'desktop';
    if (/mobile/i.test(userAgent)) deviceType = 'mobile';
    else if (/tablet|ipad/i.test(userAgent)) deviceType = 'tablet';

    let browser = 'unknown';
    if (/chrome/i.test(userAgent)) browser = 'Chrome';
    else if (/firefox/i.test(userAgent)) browser = 'Firefox';
    else if (/safari/i.test(userAgent)) browser = 'Safari';
    else if (/edge/i.test(userAgent)) browser = 'Edge';

    let os = 'unknown';
    if (/android/i.test(userAgent)) os = 'Android';
    else if (/iphone|ipad|ios/i.test(userAgent)) os = 'iOS';
    else if (/windows/i.test(userAgent)) os = 'Windows';
    else if (/mac/i.test(userAgent)) os = 'macOS';
    else if (/linux/i.test(userAgent)) os = 'Linux';

    return { deviceType, browser, os };
};

/**
 * @route   POST /api/attendance/mark
 * @desc    Mark attendance with full security chain (Student)
 * @access  Private (Student)
 */
export const markAttendance = async (req, res) => {
    const startTime = Date.now();
    const student = req.user;
    const ipAddress = req.ip || req.connection?.remoteAddress;
    const userAgent = req.headers['user-agent'];

    // Validation results for audit
    const validationResults = {
        tokenValid: false,
        timeWindowValid: false,
        locationValid: false,
        deviceValid: false,
        academicMatch: false,
        replayCheckPassed: false,
        rateLimitPassed: false
    };

    const securityFlags = [];
    let suspicionScore = 0;

    try {
        // Extract request data
        const {
            sessionId,
            token,
            nonce,
            timestamp,
            latitude,
            longitude,
            accuracy,
            altitude,
            altitudeAccuracy,
            heading,
            speed,
            deviceFingerprint,
            locationSamples  // Optional: array of location samples for strict mode
        } = req.body;

        // ========================================
        // PRE-CHECK: Role Verification
        // ========================================
        if (student.role !== 'student') {
            await logAudit('ATTENDANCE_FAILED', {
                userId: student._id,
                userEmail: student.email,
                userRole: student.role,
                sessionId,
                failureReason: 'Not a student',
                failureCode: 'ROLE_MISMATCH',
                ipAddress
            });
            return res.status(403).json({
                success: false,
                error: 'Only students can mark attendance'
            });
        }

        // ========================================
        // CHECK 1: Rate Limit / Block Check
        // ========================================
        const blockCheck = await isBlocked(student._id.toString());
        if (blockCheck.blocked) {
            await logAudit('ATTENDANCE_FAILED', {
                userId: student._id,
                userEmail: student.email,
                sessionId,
                failureReason: 'User blocked',
                failureCode: 'BLOCKED_USER',
                ipAddress
            });
            return res.status(429).json({
                success: false,
                error: 'Too many failed attempts. Please wait.',
                retryAfter: blockCheck.retryAfter
            });
        }
        validationResults.rateLimitPassed = true;

        // ========================================
        // CHECK 2: Session Validity
        // ========================================
        const session = await Session.findById(sessionId).populate('course');
        if (!session) {
            await trackFailedAttempt(student._id.toString(), 'SESSION_NOT_FOUND');
            await logAudit('ATTENDANCE_FAILED', {
                userId: student._id,
                userEmail: student.email,
                sessionId,
                failureReason: 'Session not found',
                failureCode: 'SESSION_NOT_FOUND',
                ipAddress
            });
            return res.status(404).json({
                success: false,
                error: 'Session not found'
            });
        }

        if (!session.isActive) {
            await trackFailedAttempt(student._id.toString(), 'SESSION_INACTIVE');
            await logAudit('ATTENDANCE_FAILED', {
                userId: student._id,
                userEmail: student.email,
                sessionId: session._id,
                courseId: session.course._id,
                failureReason: 'Session inactive',
                failureCode: 'SESSION_INACTIVE',
                ipAddress
            });
            return res.status(400).json({
                success: false,
                error: 'Session is no longer active'
            });
        }

        const course = session.course;

        // ========================================
        // CHECK 3: Time Window Validity
        // ========================================
        const now = new Date();
        if (now < session.startTime || now > session.endTime) {
            await logAudit('ATTENDANCE_FAILED', {
                userId: student._id,
                userEmail: student.email,
                sessionId: session._id,
                failureReason: 'Outside session time window',
                failureCode: 'TIME_WINDOW_INVALID',
                ipAddress
            });
            return res.status(400).json({
                success: false,
                error: 'Session has ended or not yet started'
            });
        }
        validationResults.timeWindowValid = true;

        // ========================================
        // CHECK 4: QR Token Validity (Enhanced)
        // ========================================
        const tokenValidation = session.isQRTokenValid(token, nonce, timestamp);
        if (!tokenValidation.valid) {
            await trackFailedAttempt(student._id.toString(), tokenValidation.reason);
            await redisService.logSuspiciousActivity(
                student._id.toString(),
                sessionId,
                'INVALID_TOKEN',
                { reason: tokenValidation.reason }
            );
            await logAudit('ATTENDANCE_FAILED', {
                userId: student._id,
                userEmail: student.email,
                sessionId: session._id,
                failureReason: tokenValidation.reason,
                failureCode: tokenValidation.reason,
                ipAddress
            });
            return res.status(400).json({
                success: false,
                error: 'Invalid or expired QR code. Please scan again.'
            });
        }
        validationResults.tokenValid = true;

        // ========================================
        // CHECK 5: Replay Protection (MongoDB is source of truth)
        // ========================================

        // DEBUG: Log session IDs to verify they're the same
        console.log('🔍 ATTENDANCE CHECK DEBUG:', {
            requestSessionId: sessionId,
            dbSessionId: session._id.toString(),
            match: sessionId === session._id.toString(),
            studentId: student._id.toString(),
            rollNo: student.rollNo
        });

        // FIRST: Check MongoDB (the source of truth)
        const alreadyMarkedDB = await Attendance.findOne({
            session: session._id,
            student: student._id
        });

        if (alreadyMarkedDB) {
            // Detailed debug logging to understand what's happening
            console.log('❌ BLOCKED BY MONGODB: Already marked!');
            console.log('   Session ID (from QR):', sessionId);
            console.log('   Session ID (from DB):', session._id.toString());
            console.log('   Course:', session.course?.courseName || course?.courseName);
            console.log('   Course Code:', session.course?.courseCode || course?.courseCode);
            console.log('   Student:', student.email, student.rollNo);
            console.log('   Existing record ID:', alreadyMarkedDB._id.toString());
            console.log('   Existing record timestamp:', alreadyMarkedDB.createdAt);
            console.log('   Session start time:', session.startTime);

            // Ensure Redis is in sync
            await redisService.markAttendanceComplete(session._id.toString(), student._id.toString());
            await logAudit('ATTENDANCE_FAILED', {
                userId: student._id,
                userEmail: student.email,
                sessionId: session._id,
                failureReason: 'Already marked (verified in database)',
                failureCode: 'ALREADY_MARKED',
                ipAddress
            });
            return res.status(400).json({
                success: false,
                error: 'Attendance already marked for this session',
                code: 'ALREADY_MARKED',
                debug: {
                    source: 'mongodb',
                    sessionId: session._id.toString(),
                    courseName: session.course?.courseName || course?.courseName,
                    existingRecordAt: alreadyMarkedDB.createdAt,
                    sessionStartTime: session.startTime
                }
            });
        }

        // SECOND: Check Redis (for fast duplicate prevention during same request)
        // Use session._id consistently for all Redis operations
        const alreadyMarkedRedis = await redisService.isAttendanceMarked(
            session._id.toString(),
            student._id.toString()
        );

        if (alreadyMarkedRedis) {
            // Redis says marked, but MongoDB says NOT marked
            // This is a STALE REDIS ENTRY from a failed previous attempt
            // Clear it and allow attendance to proceed!
            console.log('⚠️ STALE REDIS ENTRY DETECTED! Redis says marked but MongoDB says no.');
            console.log('🧹 Clearing stale Redis entry for sessionId:', sessionId);

            try {
                // Delete the stale Redis entry using the proper method
                await redisService.clearAttendanceMark(session._id.toString(), student._id.toString());
                console.log('✅ Stale Redis entry cleared, proceeding with attendance');
            } catch (redisError) {
                console.error('Failed to clear stale Redis entry:', redisError.message);
                // Continue anyway - MongoDB is the source of truth
            }
        }

        validationResults.replayCheckPassed = true;

        // Check if specific token/nonce was already used
        // Use session._id (validated) instead of request sessionId for consistency
        if (nonce) {
            const tokenUsed = await redisService.isTokenUsed(session._id.toString(), nonce);
            if (tokenUsed) {
                securityFlags.push('TOKEN_REPLAY_ATTEMPT');
                suspicionScore += 30;
                await redisService.logSuspiciousActivity(
                    student._id.toString(),
                    session._id.toString(),
                    'TOKEN_REPLAY',
                    { nonce }
                );
            }
        }

        // ========================================
        // CHECK 6: Device Fingerprint Validation
        // ========================================
        if (!deviceFingerprint || !isValidFingerprint(deviceFingerprint)) {
            await trackFailedAttempt(student._id.toString(), 'INVALID_DEVICE');
            return res.status(400).json({
                success: false,
                error: 'Invalid device information'
            });
        }

        const deviceHash = hashDeviceFingerprint(deviceFingerprint);
        const { deviceType, browser, os } = parseDeviceInfo(userAgent);

        // Check device in current session (prevent device sharing)
        if (session.deviceBinding) {
            const deviceUsedInSession = await Attendance.findOne({
                session: session._id,
                deviceHash,
                student: { $ne: student._id }
            });

            if (deviceUsedInSession) {
                securityFlags.push('SHARED_DEVICE');
                suspicionScore += 40;
                await redisService.logSuspiciousActivity(
                    student._id.toString(),
                    sessionId,
                    'DEVICE_ALREADY_USED',
                    { deviceHash, otherStudent: deviceUsedInSession.student }
                );
                await logAudit('ATTENDANCE_FAILED', {
                    userId: student._id,
                    userEmail: student.email,
                    sessionId: session._id,
                    deviceHash,
                    failureReason: 'Device used by another student in this session',
                    failureCode: 'DEVICE_ALREADY_USED',
                    ipAddress
                });
                return res.status(409).json({
                    success: false,
                    error: 'This device has already been used by another student in this session',
                    code: 'DEVICE_ALREADY_USED'
                });
            }
        }

        // ========================================
        // CHECK 6b: Cross-Session Device Sharing (V5 Enhancement)
        // Detect if this device has been used by OTHER students in ANY session
        // ========================================
        const deviceUsersGlobal = await DeviceRegistry.getDeviceUsers(deviceHash);
        const otherUsersOfDevice = deviceUsersGlobal.filter(
            d => d.student && d.student._id.toString() !== student._id.toString()
        );

        if (otherUsersOfDevice.length > 0) {
            // This device is registered to multiple students!
            securityFlags.push('MULTI_STUDENT_DEVICE');
            suspicionScore += 30;

            await redisService.logSuspiciousActivity(
                student._id.toString(),
                sessionId,
                'DEVICE_SHARED_ACROSS_ACCOUNTS',
                {
                    deviceHash,
                    otherStudents: otherUsersOfDevice.map(d => ({
                        id: d.student._id,
                        rollNo: d.student.rollNo,
                        name: d.student.name
                    }))
                }
            );

            await logAudit('SECURITY_WARNING', {
                userId: student._id,
                userEmail: student.email,
                sessionId: session._id,
                deviceHash,
                warningType: 'DEVICE_SHARED_ACROSS_ACCOUNTS',
                otherStudentsCount: otherUsersOfDevice.length,
                otherStudents: otherUsersOfDevice.map(d => d.student?.rollNo),
                ipAddress
            });

            // In strict or paranoid mode, BLOCK the attendance
            if (session.securityLevel === 'strict' || session.securityLevel === 'paranoid') {
                return res.status(409).json({
                    success: false,
                    error: 'This device is registered to another student. Please use your own device.',
                    code: 'DEVICE_OWNERSHIP_CONFLICT'
                });
            }
            // In standard mode, allow but flag for review
        }

        // Register/validate device for student
        const deviceResult = await DeviceRegistry.registerDevice(student._id, {
            deviceHash,
            fingerprintComponents: req.body.fingerprintComponents || {},
            deviceType,
            browser,
            os,
            ip: ipAddress,
            location: { latitude, longitude }
        });

        if (!deviceResult.success) {
            securityFlags.push('TOO_MANY_DEVICES');
            suspicionScore += 20;
            await logAudit('ATTENDANCE_FAILED', {
                userId: student._id,
                userEmail: student.email,
                sessionId: session._id,
                deviceHash,
                failureReason: deviceResult.message,
                failureCode: 'TOO_MANY_DEVICES',
                ipAddress
            });
            // Don't fail - just flag it
        }

        if (deviceResult.isNew) {
            securityFlags.push('DEVICE_SWITCHING');
            suspicionScore += 10;
            await redisService.incrementDeviceSwitches(student._id.toString());
        }
        validationResults.deviceValid = true;

        // ========================================
        // CHECK 7: Academic Eligibility
        // ========================================
        const academicState = student.academicState;
        const studentBranchCode = (student.branchCode || '').toLowerCase();
        const courseBranchCode = (course.branch || '').toLowerCase();

        // Check if student's branch matches course branch
        const branchMatch = studentBranchCode === courseBranchCode;
        const yearMatch = course.year === academicState?.year;

        // Check batch eligibility:
        // - If course has no batch or batch is 'all', everyone is eligible
        // - If student has no batch set, they're eligible for 'all' courses only
        // - Otherwise, batch must match
        const courseBatch = course.batch || 'all';
        const studentBatch = student.batch;
        const batchMatch = courseBatch === 'all' || courseBatch === studentBatch;

        // Check if student has this course as an approved elective
        const isElective = student.electiveCourses?.some(
            ec => ec.toString() === course._id.toString()
        );

        // Student is eligible if:
        // 1. Branch and year match AND batch is compatible, OR
        // 2. The course is in their approved electiveCourses
        const isEligible = (branchMatch && yearMatch && batchMatch) || isElective;

        if (!isEligible) {
            console.log('Eligibility check failed:', {
                studentBranchCode,
                courseBranchCode,
                branchMatch,
                studentYear: academicState?.year,
                courseYear: course.year,
                yearMatch,
                studentBatch: student.batch,
                courseBatch: course.batch,
                batchMatch,
                isElective,
                electiveCourses: student.electiveCourses
            });

            await logAudit('ATTENDANCE_FAILED', {
                userId: student._id,
                userEmail: student.email,
                sessionId: session._id,
                courseId: course._id,
                failureReason: 'Academic mismatch',
                failureCode: 'ACADEMIC_MISMATCH',
                ipAddress,
                metadata: {
                    studentBranchCode,
                    courseBranchCode,
                    branchMatch,
                    studentYear: academicState?.year,
                    courseYear: course.year,
                    yearMatch,
                    studentBatch: student.batch,
                    courseBatch: course.batch,
                    batchMatch,
                    isElective
                }
            });

            const batchInfo = course.batch !== 'all' ? ` Batch ${course.batch}` : '';
            return res.status(403).json({
                success: false,
                error: `You are not eligible for this course. Required: ${course.branch?.toUpperCase()} Year ${course.year}${batchInfo}`
            });
        }
        validationResults.academicMatch = true;

        // ========================================
        // CHECK 8: Geolocation Validation (V5 - Adaptive Geo-Fencing)
        // ========================================
        if (session.locationBinding) {
            const locationValidation = validateLocation({
                studentLocation: {
                    latitude,
                    longitude,
                    accuracy,
                    altitude,
                    altitudeAccuracy,
                    heading,
                    speed,
                    timestamp: Date.now()
                },
                sessionLocation: {
                    centerLat: session.centerLat,
                    centerLng: session.centerLng,
                    radius: session.radius,
                    requiredAccuracy: session.requiredAccuracy,
                    // V5: Pass adaptive geo configuration with updated defaults
                    adaptiveGeo: session.adaptiveGeo || {
                        enabled: true,
                        baseRadius: 50,
                        maxRadius: 400,  // Increased for indoor GPS
                        accuracyMultiplier: 1.0
                    }
                },
                strictMode: session.securityLevel === 'strict' || session.securityLevel === 'paranoid',
                deviceType  // V5: Pass device type for adaptive radius
            });

            // Debug logging for location validation
            console.log('Location validation result:', {
                studentEmail: student.email,
                sessionId: session._id,
                sessionRadius: session.radius,
                studentLocation: { latitude, longitude, accuracy },
                sessionLocation: { lat: session.centerLat, lng: session.centerLng },
                distance: locationValidation.distance,
                effectiveRadius: locationValidation.allowedRadius,
                valid: locationValidation.valid,
                radiusDetails: locationValidation.details?.distance?.radiusDetails
            });

            // Add location security flags
            if (locationValidation.flags?.length > 0) {
                securityFlags.push(...locationValidation.flags);
                suspicionScore += locationValidation.details?.spoofing?.score || 0;
            }

            if (locationValidation.details?.distance?.nearEdge) {
                securityFlags.push('NEAR_EDGE');
            }

            // V5: Flag extended allowance (allowed due to GPS accuracy compensation)
            if (locationValidation.details?.distance?.extendedAllowance) {
                securityFlags.push('EXTENDED_ALLOWANCE');
            }

            if (!locationValidation.valid) {
                await trackFailedAttempt(student._id.toString(), 'LOCATION_INVALID');

                console.warn('Location validation FAILED:', {
                    studentEmail: student.email,
                    distance: locationValidation.distance,
                    allowedRadius: locationValidation.allowedRadius,
                    sessionRadius: session.radius,
                    gpsAccuracy: accuracy
                });

                await logAudit('ATTENDANCE_FAILED', {
                    userId: student._id,
                    userEmail: student.email,
                    sessionId: session._id,
                    location: { latitude, longitude, accuracy },
                    distanceFromCenter: locationValidation.distance,
                    allowedRadius: locationValidation.allowedRadius || session.radius,
                    failureReason: locationValidation.error,
                    failureCode: 'LOCATION_OUT_OF_RANGE',
                    securityFlags,
                    ipAddress
                });

                // Store failed attempt in database for professor review
                try {
                    await FailedAttempt.create({
                        session: session._id,
                        student: student._id,
                        studentName: student.name,
                        rollNo: student.rollNo,
                        failureReason: 'LOCATION_TOO_FAR',
                        failureMessage: `Distance: ${Math.round(locationValidation.distance)}m, Allowed: ${locationValidation.allowedRadius || session.radius}m`,
                        location: { latitude, longitude, accuracy },
                        distance: locationValidation.distance,
                        deviceFingerprint: deviceHash,
                        deviceType,
                        status: 'PENDING'
                    });
                } catch (err) {
                    console.error('Failed to store failed attempt:', err.message);
                }

                // V5: User-friendly error message
                return res.status(400).json({
                    success: false,
                    error: locationValidation.error || 'Location verification failed',
                    distance: locationValidation.distance,
                    allowedRadius: locationValidation.allowedRadius || session.radius,
                    hint: `Please move closer to the classroom. You need to be within ${locationValidation.allowedRadius || session.radius}m of the session location.`,
                    failedAttemptSaved: true
                });
            }

            // Check for spoofing suspicion
            if (locationValidation.suspicious) {
                securityFlags.push('SUSPICIOUS_LOCATION');
                suspicionScore += 25;
                await redisService.logSuspiciousActivity(
                    student._id.toString(),
                    sessionId,
                    'LOCATION_SPOOFING_SUSPECTED',
                    { flags: locationValidation.flags }
                );
            }
        }
        validationResults.locationValid = true;

        // Calculate distance for record
        const distance = calculateDistance(latitude, longitude, session.centerLat, session.centerLng);

        // ========================================
        // ALL CHECKS PASSED - Create Attendance Record
        // ========================================

        // Determine status
        const minutesLate = (now - session.startTime) / 60000;
        let status = 'PRESENT';
        if (minutesLate > session.lateThreshold) {
            status = 'LATE';
        }
        if (suspicionScore >= 50) {
            status = 'SUSPICIOUS';
        }

        // ========================================
        // IMPORTANT: Create MongoDB record FIRST, then mark Redis
        // This ensures that if MongoDB fails, Redis doesn't block retries
        // ========================================

        // Create attendance record in MongoDB FIRST
        const attendance = await Attendance.create({
            session: session._id,
            student: student._id,
            studentName: student.name,
            rollNo: student.rollNo,
            status,
            timestamp: now,
            minutesAfterStart: Math.round(minutesLate),
            location: {
                latitude,
                longitude,
                accuracy,
                altitude,
                altitudeAccuracy,
                heading,
                speed
            },
            latitude,
            longitude,
            distance: Math.round(distance),
            deviceFingerprint,
            deviceHash,
            deviceType,
            userAgent,
            browser,
            os,
            ipAddress,
            tokenNonce: nonce,
            tokenTimestamp: timestamp,
            validation: validationResults,
            securityFlags,
            suspicionScore,
            markedBy: 'self'
        });

        // ONLY mark in Redis AFTER successful MongoDB save
        // This prevents the "already marked" error on retry if MongoDB fails
        // Use session._id consistently for all Redis operations
        await redisService.markAttendanceComplete(session._id.toString(), student._id.toString());
        if (nonce) {
            await redisService.markTokenUsed(session._id.toString(), nonce, student._id.toString());
        }

        // Update session attendance count
        await Session.findByIdAndUpdate(session._id, {
            $inc: { attendanceCount: 1 },
            lastAttendanceAt: now
        });

        // Log successful attendance
        await logAudit('ATTENDANCE_SUCCESS', {
            userId: student._id,
            userEmail: student.email,
            userRole: 'student',
            sessionId: session._id,
            courseId: course._id,
            deviceHash,
            location: { latitude, longitude, accuracy },
            distanceFromCenter: Math.round(distance),
            allowedRadius: session.radius,
            validationResult: 'PASSED',
            validationDetails: validationResults,
            securityFlags,
            ipAddress,
            metadata: {
                processingTime: Date.now() - startTime,
                status,
                minutesLate: Math.round(minutesLate)
            }
        });

        // Decrease device trust if suspicious
        if (suspicionScore > 0) {
            await DeviceRegistry.decreaseTrust(
                student._id,
                deviceHash,
                Math.min(suspicionScore / 5, 20),
                `Attendance with suspicion score ${suspicionScore}`
            );
        }

        // Response
        res.json({
            success: true,
            message: status === 'LATE'
                ? `Marked as LATE (${Math.round(minutesLate)} min after start)`
                : 'Attendance marked successfully',
            data: {
                status,
                timestamp: now,
                distance: Math.round(distance),
                course: course.courseName,
                sessionId: session.sessionId
            }
        });

    } catch (error) {
        console.error('Mark Attendance Error:', error);

        // Log error
        await logAudit('ATTENDANCE_FAILED', {
            userId: student?._id,
            userEmail: student?.email,
            sessionId: req.body?.sessionId,
            failureReason: error.message,
            failureCode: 'INTERNAL_ERROR',
            ipAddress,
            validationDetails: validationResults
        });

        // Handle duplicate key error (race condition - attendance exists in MongoDB)
        if (error.code === 11000) {
            // Also update Redis for consistency
            try {
                await redisService.markAttendanceComplete(req.body?.sessionId, student._id.toString());
            } catch (redisErr) {
                // Ignore Redis errors here
            }
            return res.status(400).json({
                success: false,
                error: 'Attendance already marked for this session',
                code: 'ALREADY_MARKED'
            });
        }

        // Handle validation errors
        if (error.name === 'ValidationError') {
            return res.status(400).json({
                success: false,
                error: 'Invalid data provided: ' + Object.values(error.errors).map(e => e.message).join(', '),
                code: 'VALIDATION_ERROR'
            });
        }

        // Handle MongoDB connection errors
        if (error.name === 'MongoNetworkError' || error.name === 'MongoTimeoutError') {
            return res.status(503).json({
                success: false,
                error: 'Database temporarily unavailable. Please try again in a few seconds.',
                code: 'DATABASE_ERROR',
                retryAfter: 5
            });
        }

        // Default error - provide more context
        res.status(500).json({
            success: false,
            error: 'Server error while marking attendance. Please try again.',
            code: 'INTERNAL_ERROR',
            message: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * @route   GET /api/attendance/history
 * @desc    Get student attendance history
 * @access  Private (Student)
 */
export const getMyAttendance = async (req, res) => {
    try {
        const history = await Attendance.find({ student: req.user._id })
            .populate({
                path: 'session',
                select: 'startTime endTime sessionId',
                populate: { path: 'course', select: 'courseCode courseName' }
            })
            .select('status timestamp distance minutesAfterStart securityFlags')
            .sort({ createdAt: -1 })
            .limit(100);

        const summary = {
            total: history.length,
            present: history.filter(h => h.status === 'PRESENT').length,
            late: history.filter(h => h.status === 'LATE').length,
            suspicious: history.filter(h => h.status === 'SUSPICIOUS').length,
            flagged: history.filter(h => h.securityFlags?.length > 0).length
        };

        res.json({
            success: true,
            summary,
            data: history
        });
    } catch (error) {
        console.error('Get History Error:', error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

/**
 * @route   GET /api/attendance/session/:sessionId
 * @desc    Get all attendance records for a session (Professor/Admin)
 * @access  Private (Professor/Admin)
 */
export const getAttendanceBySession = async (req, res) => {
    try {
        const { sessionId } = req.params;

        const session = await Session.findById(sessionId);
        if (!session) {
            return res.status(404).json({ success: false, error: 'Session not found' });
        }

        // Verify ownership
        if (session.professor.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
            return res.status(403).json({ success: false, error: 'Not authorized' });
        }

        const records = await Attendance.find({ session: sessionId })
            .select('studentName rollNo status timestamp distance minutesAfterStart deviceType securityFlags suspicionScore')
            .sort({ timestamp: 1 });

        const stats = await Attendance.getSessionStats(sessionId);

        res.json({
            success: true,
            stats,
            count: records.length,
            data: records
        });
    } catch (error) {
        console.error('Get Session Attendance Error:', error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

/**
 * @route   GET /api/attendance/suspicious
 * @desc    Get suspicious attendance records (Admin)
 * @access  Private (Admin)
 */
export const getSuspiciousAttendance = async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ success: false, error: 'Admin only' });
        }

        const { limit = 50, minScore = 20 } = req.query;

        const records = await Attendance.getSuspiciousRecords({
            limit: parseInt(limit),
            minScore: parseInt(minScore)
        });

        res.json({ success: true, count: records.length, data: records });
    } catch (error) {
        console.error('Get Suspicious Error:', error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

/**
 * @route   GET /api/attendance/audit/:studentId
 * @desc    Get student audit log (Admin)
 * @access  Private (Admin)
 */
export const getStudentAudit = async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ success: false, error: 'Admin only' });
        }

        const { studentId } = req.params;
        const { limit = 50 } = req.query;

        const auditLog = await AuditLog.getStudentActivity(studentId, parseInt(limit));
        const abuseLog = await redisService.getAbuseLog(studentId, parseInt(limit));

        res.json({
            success: true,
            mongoAudit: auditLog,
            redisAbuseLog: abuseLog
        });
    } catch (error) {
        console.error('Get Audit Error:', error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

/**
 * @route   GET /api/attendance/course/:courseId
 * @desc    Get complete attendance data for a course (Professor)
 * @access  Private (Professor)
 */
export const getCourseAttendance = async (req, res) => {
    try {
        const { courseId } = req.params;

        // Verify course ownership - check if professor has claimed this course
        const course = await Course.findById(courseId);
        if (!course) {
            return res.status(404).json({ success: false, error: 'Course not found' });
        }

        const isProfessorClaimed = course.claimedBy?.some(
            profId => profId.toString() === req.user._id.toString()
        );

        if (!isProfessorClaimed && req.user.role !== 'admin') {
            return res.status(403).json({ success: false, error: 'Not authorized - you have not claimed this course' });
        }

        // Get all sessions for this course
        const sessions = await Session.find({ course: courseId })
            .select('sessionId startTime endTime isActive')
            .sort({ startTime: -1 });

        const sessionIds = sessions.map(s => s._id);

        // Get all attendance records for these sessions
        const attendanceRecords = await Attendance.find({
            session: { $in: sessionIds },
            status: { $in: ['PRESENT', 'LATE'] }
        })
            .select('student studentName rollNo session status timestamp')
            .populate('student', 'name email rollNo branch admissionYear');

        // Create student attendance map
        const studentMap = {};

        attendanceRecords.forEach(record => {
            const studentId = record.student?._id?.toString() || record.rollNo;

            if (!studentMap[studentId]) {
                studentMap[studentId] = {
                    _id: record.student?._id,
                    name: record.student?.name || record.studentName,
                    rollNo: record.student?.rollNo || record.rollNo,
                    email: record.student?.email,
                    branch: record.student?.branch,
                    admissionYear: record.student?.admissionYear,
                    sessionsAttended: 0,
                    lateCount: 0,
                    presentCount: 0,
                    attendanceDetails: []
                };
            }

            studentMap[studentId].sessionsAttended++;
            if (record.status === 'LATE') {
                studentMap[studentId].lateCount++;
            } else {
                studentMap[studentId].presentCount++;
            }

            studentMap[studentId].attendanceDetails.push({
                sessionId: record.session,
                status: record.status,
                timestamp: record.timestamp
            });
        });

        // Calculate attendance percentage
        const totalSessions = sessions.length;
        const students = Object.values(studentMap).map(student => ({
            ...student,
            attendancePercentage: totalSessions > 0
                ? Math.round((student.sessionsAttended / totalSessions) * 100)
                : 0,
            meetsMinimum: totalSessions > 0
                ? (student.sessionsAttended / totalSessions) >= 0.75
                : true
        }));

        // Sort by roll number
        students.sort((a, b) => (a.rollNo || '').localeCompare(b.rollNo || ''));

        res.json({
            success: true,
            course: {
                _id: course._id,
                courseCode: course.courseCode,
                courseName: course.courseName,
                branch: course.branch,
                year: course.year,
                semester: course.semester
            },
            stats: {
                totalSessions,
                totalStudents: students.length,
                averageAttendance: students.length > 0
                    ? Math.round(students.reduce((sum, s) => sum + s.attendancePercentage, 0) / students.length)
                    : 0,
                studentsBelow75: students.filter(s => !s.meetsMinimum).length
            },
            sessions: sessions.map(s => ({
                _id: s._id,
                sessionId: s.sessionId,
                date: s.startTime,
                isActive: s.isActive
            })),
            students
        });
    } catch (error) {
        console.error('Get Course Attendance Error:', error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

/**
 * @route   GET /api/attendance/course/:courseId/export
 * @desc    Export course attendance to CSV (Professor)
 * @access  Private (Professor)
 */
export const exportCourseAttendance = async (req, res) => {
    try {
        const { courseId } = req.params;

        // Verify course ownership
        const course = await Course.findById(courseId);
        if (!course) {
            return res.status(404).json({ success: false, error: 'Course not found' });
        }

        if (!course.claimedBy?.some(id => id.toString() === req.user._id.toString()) && req.user.role !== 'admin') {
            return res.status(403).json({ success: false, error: 'Not authorized' });
        }

        // Get all sessions
        const sessions = await Session.find({ course: courseId })
            .select('sessionId startTime')
            .sort({ startTime: 1 });

        const sessionIds = sessions.map(s => s._id);

        // Get all attendance records
        const attendanceRecords = await Attendance.find({
            session: { $in: sessionIds },
            status: { $in: ['PRESENT', 'LATE'] }
        })
            .select('student studentName rollNo session status')
            .populate('student', 'name rollNo');

        // Create student session matrix
        const studentMap = {};

        attendanceRecords.forEach(record => {
            const rollNo = record.student?.rollNo || record.rollNo;
            const name = record.student?.name || record.studentName;

            if (!studentMap[rollNo]) {
                studentMap[rollNo] = {
                    rollNo,
                    name,
                    sessions: {}
                };
            }

            studentMap[rollNo].sessions[record.session.toString()] = record.status === 'PRESENT' ? 'P' : 'L';
        });

        // Build CSV
        const students = Object.values(studentMap).sort((a, b) => a.rollNo.localeCompare(b.rollNo));

        // Header row
        let csv = 'Roll No,Name';
        sessions.forEach((s, i) => {
            const date = new Date(s.startTime).toLocaleDateString('en-IN', {
                day: '2-digit',
                month: 'short'
            });
            csv += `,${date}`;
        });
        csv += ',Total,Percentage\n';

        // Data rows
        students.forEach(student => {
            let total = 0;
            let row = `${student.rollNo},"${student.name}"`;

            sessions.forEach(session => {
                const status = student.sessions[session._id.toString()] || 'A';
                row += `,${status}`;
                if (status === 'P' || status === 'L') total++;
            });

            const percentage = sessions.length > 0
                ? Math.round((total / sessions.length) * 100)
                : 0;
            row += `,"${total} of ${sessions.length}",${percentage}%\n`;
            csv += row;
        });

        // Set response headers for CSV download
        const filename = `${course.courseCode}_attendance_${new Date().toISOString().split('T')[0]}.csv`;

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(csv);

    } catch (error) {
        console.error('Export Attendance Error:', error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

/**
 * @route   GET /api/attendance/session/:sessionId/details
 * @desc    Get detailed session attendance with full student info (Professor)
 * @access  Private (Professor)
 */
export const getSessionDetails = async (req, res) => {
    try {
        const { sessionId } = req.params;

        const session = await Session.findById(sessionId)
            .populate('course', 'courseCode courseName branch year');

        if (!session) {
            return res.status(404).json({ success: false, error: 'Session not found' });
        }

        // Verify ownership
        if (session.professor.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
            return res.status(403).json({ success: false, error: 'Not authorized' });
        }

        const records = await Attendance.find({ session: sessionId })
            .populate('student', 'name email rollNo branch admissionYear')
            .sort({ timestamp: 1 });

        const detailedRecords = records.map(record => ({
            _id: record._id,
            student: {
                _id: record.student?._id,
                name: record.student?.name || record.studentName,
                rollNo: record.student?.rollNo || record.rollNo,
                email: record.student?.email,
                branch: record.student?.branch
            },
            status: record.status,
            timestamp: record.timestamp,
            minutesAfterStart: record.minutesAfterStart,
            distance: record.distance,
            accuracy: record.accuracy,
            deviceType: record.deviceType,
            browser: record.browser,
            os: record.os,
            securityFlags: record.securityFlags,
            suspicionScore: record.suspicionScore
        }));

        const stats = {
            total: records.length,
            present: records.filter(r => r.status === 'PRESENT').length,
            late: records.filter(r => r.status === 'LATE').length,
            suspicious: records.filter(r => r.status === 'SUSPICIOUS' || r.suspicionScore > 20).length
        };

        res.json({
            success: true,
            session: {
                _id: session._id,
                sessionId: session.sessionId,
                course: session.course,
                startTime: session.startTime,
                endTime: session.endTime,
                isActive: session.isActive,
                radius: session.radius,
                securityLevel: session.securityLevel
            },
            stats,
            records: detailedRecords
        });
    } catch (error) {
        console.error('Get Session Details Error:', error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

/**
 * @route   GET /api/attendance/summary
 * @desc    Get comprehensive attendance summary for student
 * @access  Private (Student)
 */
export const getStudentSummary = async (req, res) => {
    try {
        const studentId = req.user._id;

        // Get all attendance records for the student
        const attendanceRecords = await Attendance.find({
            student: studentId,
            status: { $in: ['PRESENT', 'LATE'] }
        })
            .populate({
                path: 'session',
                select: 'course startTime',
                populate: { path: 'course', select: 'courseCode courseName branch year semester' }
            });

        // Group by course
        const courseMap = {};

        attendanceRecords.forEach(record => {
            if (!record.session?.course) return;

            const courseId = record.session.course._id.toString();

            if (!courseMap[courseId]) {
                courseMap[courseId] = {
                    course: {
                        _id: record.session.course._id,
                        courseCode: record.session.course.courseCode,
                        courseName: record.session.course.courseName,
                        branch: record.session.course.branch,
                        year: record.session.course.year,
                        semester: record.session.course.semester
                    },
                    sessionsAttended: 0,
                    presentCount: 0,
                    lateCount: 0,
                    recentAttendance: []
                };
            }

            courseMap[courseId].sessionsAttended++;
            if (record.status === 'PRESENT') {
                courseMap[courseId].presentCount++;
            } else {
                courseMap[courseId].lateCount++;
            }

            // Keep last 5 attendance
            if (courseMap[courseId].recentAttendance.length < 5) {
                courseMap[courseId].recentAttendance.push({
                    date: record.session.startTime,
                    status: record.status
                });
            }
        });

        // Get total sessions per course
        const courseIds = Object.keys(courseMap);
        const courseSessions = await Session.aggregate([
            {
                $match: {
                    course: { $in: courseIds.map(id => new mongoose.Types.ObjectId(id)) }
                }
            },
            {
                $group: {
                    _id: '$course',
                    totalSessions: { $sum: 1 }
                }
            }
        ]);

        // Calculate percentages
        const courseStats = Object.values(courseMap).map(entry => {
            const totalSessions = courseSessions.find(
                cs => cs._id.toString() === entry.course._id.toString()
            )?.totalSessions || 0;

            const percentage = totalSessions > 0
                ? Math.round((entry.sessionsAttended / totalSessions) * 100)
                : 0;

            return {
                ...entry,
                totalSessions,
                attendancePercentage: percentage,
                meetsMinimum: percentage >= 75
            };
        });

        // Overall stats
        const totalAttended = courseStats.reduce((sum, c) => sum + c.sessionsAttended, 0);
        const totalSessions = courseStats.reduce((sum, c) => sum + c.totalSessions, 0);
        const overallPercentage = totalSessions > 0
            ? Math.round((totalAttended / totalSessions) * 100)
            : 0;

        // Recent attendance history (last 10)
        const recentHistory = await Attendance.find({ student: studentId })
            .populate({
                path: 'session',
                select: 'startTime',
                populate: { path: 'course', select: 'courseCode courseName' }
            })
            .select('status timestamp')
            .sort({ timestamp: -1 })
            .limit(10);

        res.json({
            success: true,
            data: {
                overall: {
                    totalCourses: courseStats.length,
                    totalSessionsAttended: totalAttended,
                    totalSessionsHeld: totalSessions,
                    overallPercentage,
                    coursesBelow75: courseStats.filter(c => !c.meetsMinimum).length
                },
                courses: courseStats.sort((a, b) => a.attendancePercentage - b.attendancePercentage),
                recentHistory: recentHistory.map(h => ({
                    courseCode: h.session?.course?.courseCode,
                    courseName: h.session?.course?.courseName,
                    date: h.session?.startTime,
                    status: h.status,
                    timestamp: h.timestamp
                }))
            }
        });
    } catch (error) {
        console.error('Get Student Summary Error:', error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

/**
 * @route   GET /api/attendance/session/:sessionId/failed-attempts
 * @desc    Get all failed attendance attempts for a session (for professor review)
 * @access  Private (Professor)
 */
export const getFailedAttempts = async (req, res) => {
    try {
        const { sessionId } = req.params;

        // Verify session exists and professor owns the course
        const session = await Session.findById(sessionId).populate('course');
        if (!session) {
            return res.status(404).json({ success: false, error: 'Session not found' });
        }

        const isProfessorClaimed = session.course.claimedBy?.some(
            profId => profId.toString() === req.user._id.toString()
        );

        if (!isProfessorClaimed && req.user.role !== 'admin') {
            return res.status(403).json({ success: false, error: 'Not authorized' });
        }

        const failedAttempts = await FailedAttempt.find({ session: sessionId })
            .populate('student', 'name email rollNo branch')
            .sort({ attemptedAt: -1 });

        res.json({
            success: true,
            count: failedAttempts.length,
            data: failedAttempts
        });
    } catch (error) {
        console.error('Get Failed Attempts Error:', error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

/**
 * @route   POST /api/attendance/failed-attempt/:attemptId/accept
 * @desc    Manually accept a failed attendance attempt
 * @access  Private (Professor)
 */
export const acceptFailedAttempt = async (req, res) => {
    try {
        const { attemptId } = req.params;
        const { note } = req.body;

        const failedAttempt = await FailedAttempt.findById(attemptId);
        if (!failedAttempt) {
            return res.status(404).json({ success: false, error: 'Failed attempt not found' });
        }

        if (failedAttempt.status !== 'PENDING') {
            return res.status(400).json({ success: false, error: 'This attempt has already been reviewed' });
        }

        // Verify session and professor ownership
        const session = await Session.findById(failedAttempt.session).populate('course');
        if (!session) {
            return res.status(404).json({ success: false, error: 'Session not found' });
        }

        const isProfessorClaimed = session.course.claimedBy?.some(
            profId => profId.toString() === req.user._id.toString()
        );

        if (!isProfessorClaimed && req.user.role !== 'admin') {
            return res.status(403).json({ success: false, error: 'Not authorized' });
        }

        // Check if already has attendance for this session
        const existingAttendance = await Attendance.findOne({
            session: failedAttempt.session,
            student: failedAttempt.student
        });

        if (existingAttendance) {
            return res.status(400).json({ success: false, error: 'Student already has attendance for this session' });
        }

        // Create attendance record
        const attendance = await Attendance.create({
            session: failedAttempt.session,
            student: failedAttempt.student,
            studentName: failedAttempt.studentName,
            rollNo: failedAttempt.rollNo,
            status: 'PRESENT',  // Manually accepted = PRESENT
            timestamp: failedAttempt.attemptedAt,
            location: failedAttempt.location,
            latitude: failedAttempt.location?.latitude || 0,
            longitude: failedAttempt.location?.longitude || 0,
            distance: failedAttempt.distance || 0,
            deviceFingerprint: failedAttempt.deviceFingerprint || 'manual-accept',
            deviceHash: failedAttempt.deviceFingerprint || 'manual-accept',
            markedBy: 'admin',
            verifiedBy: req.user._id,
            notes: `Manually accepted by professor. ${note || ''}`
        });

        // Update failed attempt status
        failedAttempt.status = 'ACCEPTED';
        failedAttempt.acceptedAttendance = attendance._id;
        failedAttempt.reviewedBy = req.user._id;
        failedAttempt.reviewedAt = new Date();
        failedAttempt.reviewNote = note || 'Manually accepted';
        await failedAttempt.save();

        // Update session attendance count
        await Session.findByIdAndUpdate(failedAttempt.session, {
            $inc: { attendanceCount: 1 },
            lastAttendanceAt: new Date()
        });

        res.json({
            success: true,
            message: `Attendance marked for ${failedAttempt.studentName}`,
            data: attendance
        });
    } catch (error) {
        console.error('Accept Failed Attempt Error:', error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

/**
 * @route   POST /api/attendance/failed-attempt/:attemptId/reject
 * @desc    Reject a failed attendance attempt and flag the student
 * @access  Private (Professor)
 */
export const rejectFailedAttempt = async (req, res) => {
    try {
        const { attemptId } = req.params;
        const { reason, flagStudent } = req.body;

        const failedAttempt = await FailedAttempt.findById(attemptId);
        if (!failedAttempt) {
            return res.status(404).json({ success: false, error: 'Failed attempt not found' });
        }

        if (failedAttempt.status !== 'PENDING') {
            return res.status(400).json({ success: false, error: 'This attempt has already been reviewed' });
        }

        // Verify session and professor ownership
        const session = await Session.findById(failedAttempt.session).populate('course');
        if (!session) {
            return res.status(404).json({ success: false, error: 'Session not found' });
        }

        const isProfessorClaimed = session.course.claimedBy?.some(
            profId => profId.toString() === req.user._id.toString()
        );

        if (!isProfessorClaimed && req.user.role !== 'admin') {
            return res.status(403).json({ success: false, error: 'Not authorized' });
        }

        // Update failed attempt status to REJECTED
        failedAttempt.status = 'REJECTED';
        failedAttempt.reviewedBy = req.user._id;
        failedAttempt.reviewedAt = new Date();
        failedAttempt.reviewNote = reason || 'Rejected by professor - attendance not valid';
        await failedAttempt.save();

        // Log this rejection as an audit event
        await AuditLog.log({
            eventType: 'ATTENDANCE_REJECTED',
            userId: failedAttempt.student,
            sessionId: session._id,
            courseId: session.course._id,
            reviewedBy: req.user._id,
            reason: reason || 'Location too far - rejected by professor',
            distance: failedAttempt.distance,
            timestamp: new Date()
        });

        res.json({
            success: true,
            message: `Attendance rejected for ${failedAttempt.studentName}`,
            data: failedAttempt
        });
    } catch (error) {
        console.error('Reject Failed Attempt Error:', error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

/**
 * @route   POST /api/attendance/session/:sessionId/failed-attempts/accept-all
 * @desc    Accept all pending failed attempts for a session
 * @access  Private (Professor)
 */
export const acceptAllFailedAttempts = async (req, res) => {
    try {
        const { sessionId } = req.params;
        const { note } = req.body;

        // Verify session and professor ownership
        const session = await Session.findById(sessionId).populate('course');
        if (!session) {
            return res.status(404).json({ success: false, error: 'Session not found' });
        }

        const isProfessorClaimed = session.course.claimedBy?.some(
            profId => profId.toString() === req.user._id.toString()
        );

        if (!isProfessorClaimed && req.user.role !== 'admin') {
            return res.status(403).json({ success: false, error: 'Not authorized' });
        }

        // Get all pending failed attempts
        const pendingAttempts = await FailedAttempt.find({
            session: sessionId,
            status: 'PENDING'
        });

        if (pendingAttempts.length === 0) {
            return res.status(400).json({ success: false, error: 'No pending attempts to accept' });
        }

        let acceptedCount = 0;
        let skippedCount = 0;

        for (const attempt of pendingAttempts) {
            // Check if already has attendance
            const existingAttendance = await Attendance.findOne({
                session: sessionId,
                student: attempt.student
            });

            if (existingAttendance) {
                skippedCount++;
                attempt.status = 'ACCEPTED';
                attempt.reviewNote = 'Already had attendance';
                await attempt.save();
                continue;
            }

            // Create attendance record
            await Attendance.create({
                session: sessionId,
                student: attempt.student,
                studentName: attempt.studentName,
                rollNo: attempt.rollNo,
                status: 'PRESENT',
                timestamp: attempt.attemptedAt,
                location: attempt.location,
                latitude: attempt.location?.latitude || 0,
                longitude: attempt.location?.longitude || 0,
                distance: attempt.distance || 0,
                deviceFingerprint: attempt.deviceFingerprint || 'bulk-accept',
                deviceHash: attempt.deviceFingerprint || 'bulk-accept',
                markedBy: 'admin',
                verifiedBy: req.user._id,
                notes: `Bulk accepted by professor. ${note || ''}`
            });

            // Update failed attempt
            attempt.status = 'ACCEPTED';
            attempt.reviewedBy = req.user._id;
            attempt.reviewedAt = new Date();
            attempt.reviewNote = note || 'Bulk accepted by professor';
            await attempt.save();

            acceptedCount++;
        }

        // Update session attendance count
        await Session.findByIdAndUpdate(sessionId, {
            $inc: { attendanceCount: acceptedCount },
            lastAttendanceAt: new Date()
        });

        res.json({
            success: true,
            message: `Accepted ${acceptedCount} students${skippedCount > 0 ? `, ${skippedCount} already had attendance` : ''}`,
            data: { acceptedCount, skippedCount }
        });
    } catch (error) {
        console.error('Accept All Failed Attempts Error:', error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

/**
 * @route   POST /api/attendance/session/:sessionId/failed-attempts/reject-all
 * @desc    Reject all pending failed attempts for a session
 * @access  Private (Professor)
 */
export const rejectAllFailedAttempts = async (req, res) => {
    try {
        const { sessionId } = req.params;
        const { reason } = req.body;

        // Verify session and professor ownership
        const session = await Session.findById(sessionId).populate('course');
        if (!session) {
            return res.status(404).json({ success: false, error: 'Session not found' });
        }

        const isProfessorClaimed = session.course.claimedBy?.some(
            profId => profId.toString() === req.user._id.toString()
        );

        if (!isProfessorClaimed && req.user.role !== 'admin') {
            return res.status(403).json({ success: false, error: 'Not authorized' });
        }

        // Reject all pending failed attempts
        const result = await FailedAttempt.updateMany(
            { session: sessionId, status: 'PENDING' },
            {
                $set: {
                    status: 'REJECTED',
                    reviewedBy: req.user._id,
                    reviewedAt: new Date(),
                    reviewNote: reason || 'Bulk rejected by professor - location too far'
                }
            }
        );

        res.json({
            success: true,
            message: `Rejected ${result.modifiedCount} students`,
            data: { rejectedCount: result.modifiedCount }
        });
    } catch (error) {
        console.error('Reject All Failed Attempts Error:', error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

export default {
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
};

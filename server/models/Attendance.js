import mongoose from 'mongoose';

/**
 * Enhanced Attendance Model with Security Audit Fields
 * Every attendance record stores comprehensive audit data
 */

const attendanceSchema = new mongoose.Schema({
    // Core references
    session: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Session',
        required: true
    },
    student: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },

    // Redundant but useful for fast display without population
    studentName: {
        type: String,
        required: true
    },
    rollNo: {
        type: String,
        required: true
    },

    // Attendance status
    status: {
        type: String,
        enum: ['PRESENT', 'LATE', 'SUSPICIOUS', 'REJECTED'],
        default: 'PRESENT'
    },

    // Timing information
    timestamp: {
        type: Date,
        default: Date.now
    },
    minutesAfterStart: {
        type: Number,
        default: 0
    },

    // Location Data (comprehensive)
    location: {
        latitude: { type: Number, required: true },
        longitude: { type: Number, required: true },
        accuracy: Number,
        altitude: Number,
        altitudeAccuracy: Number,
        heading: Number,
        speed: Number
    },
    // Legacy flat fields for backward compatibility
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true },
    distance: { type: Number, required: true },

    // Device Information (hashed for privacy)
    deviceFingerprint: {
        type: String,
        required: true
    },
    deviceHash: String,  // Shortened hash for quick comparison
    deviceType: {
        type: String,
        enum: ['mobile', 'tablet', 'desktop', 'unknown'],
        default: 'unknown'
    },
    userAgent: String,
    browser: String,
    os: String,

    // Network Information
    ipAddress: String,

    // Token/Nonce used (for audit trail)
    tokenNonce: String,
    tokenTimestamp: Number,

    // Validation Results (comprehensive audit)
    validation: {
        tokenValid: { type: Boolean, default: true },
        timeWindowValid: { type: Boolean, default: true },
        locationValid: { type: Boolean, default: true },
        deviceValid: { type: Boolean, default: true },
        academicMatch: { type: Boolean, default: true },
        replayCheckPassed: { type: Boolean, default: true },
        rateLimitPassed: { type: Boolean, default: true }
    },

    // Security flags detected
    securityFlags: [{
        type: String,
        enum: [
            'PERFECT_ACCURACY',
            'LOCATION_JUMP',
            'DEVICE_SWITCHING',
            'RAPID_ATTEMPTS',
            'SHARED_DEVICE',
            'SUSPICIOUS_LOCATION',
            'LOW_PRECISION_COORDINATES',
            'ZERO_ALTITUDE',
            'MISSING_ACCURACY',
            'NEAR_EDGE',
            // V5 additions - used in controller
            'TOKEN_REPLAY_ATTEMPT',
            'MULTI_STUDENT_DEVICE',
            'TOO_MANY_DEVICES',
            'EXTENDED_ALLOWANCE'
        ]
    }],
    suspicionScore: {
        type: Number,
        default: 0
    },

    // Administrative
    markedBy: {
        type: String,
        enum: ['self', 'admin', 'system'],
        default: 'self'
    },
    verifiedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    notes: String
}, {
    timestamps: true
});

// Unique constraints - one attendance per student per session
attendanceSchema.index({ session: 1, student: 1 }, { unique: true });

// One device per session (prevents device sharing in same session)
attendanceSchema.index({ session: 1, deviceHash: 1 }, { unique: true, sparse: true });

// Query optimization indexes
attendanceSchema.index({ student: 1, createdAt: -1 });
attendanceSchema.index({ session: 1, status: 1 });
attendanceSchema.index({ deviceHash: 1, createdAt: -1 });
attendanceSchema.index({ securityFlags: 1, createdAt: -1 });
attendanceSchema.index({ suspicionScore: -1 });

/**
 * Pre-save: Calculate minutes after start
 */
attendanceSchema.pre('save', async function (next) {
    if (this.isNew && this.session) {
        const Session = mongoose.model('Session');
        const session = await Session.findById(this.session);
        if (session) {
            const minutesAfter = (this.timestamp - session.startTime) / 60000;
            this.minutesAfterStart = Math.round(minutesAfter);
        }
    }
    next();
});

/**
 * Static: Get session attendance with statistics
 */
attendanceSchema.statics.getSessionStats = async function (sessionId) {
    const records = await this.find({ session: sessionId });

    const stats = {
        total: records.length,
        present: records.filter(r => r.status === 'PRESENT').length,
        late: records.filter(r => r.status === 'LATE').length,
        suspicious: records.filter(r => r.status === 'SUSPICIOUS').length,
        rejected: records.filter(r => r.status === 'REJECTED').length,
        flagged: records.filter(r => r.securityFlags?.length > 0).length,
        averageDistance: 0,
        averageMinutesAfterStart: 0
    };

    if (records.length > 0) {
        stats.averageDistance = Math.round(
            records.reduce((sum, r) => sum + (r.distance || 0), 0) / records.length
        );
        stats.averageMinutesAfterStart = Math.round(
            records.reduce((sum, r) => sum + (r.minutesAfterStart || 0), 0) / records.length
        );
    }

    return stats;
};

/**
 * Static: Get student attendance summary
 */
attendanceSchema.statics.getStudentSummary = async function (studentId, courseId = null) {
    const match = { student: studentId };
    if (courseId) {
        const Session = mongoose.model('Session');
        const sessions = await Session.find({ course: courseId }).select('_id');
        match.session = { $in: sessions.map(s => s._id) };
    }

    const records = await this.find(match)
        .populate({
            path: 'session',
            select: 'startTime course',
            populate: { path: 'course', select: 'courseName courseCode' }
        })
        .sort({ createdAt: -1 });

    return {
        totalSessions: records.length,
        present: records.filter(r => r.status === 'PRESENT').length,
        late: records.filter(r => r.status === 'LATE').length,
        suspicious: records.filter(r => r.securityFlags?.length > 0).length,
        records
    };
};

/**
 * Static: Get suspicious attendance records
 */
attendanceSchema.statics.getSuspiciousRecords = async function (options = {}) {
    const { limit = 50, minScore = 20 } = options;

    return await this.find({
        $or: [
            { suspicionScore: { $gte: minScore } },
            { securityFlags: { $exists: true, $ne: [] } },
            { status: 'SUSPICIOUS' }
        ]
    })
        .populate('student', 'name email rollNo')
        .populate({
            path: 'session',
            select: 'startTime course',
            populate: { path: 'course', select: 'courseName courseCode' }
        })
        .sort({ suspicionScore: -1, createdAt: -1 })
        .limit(limit);
};

/**
 * Static: Check for device abuse patterns
 */
attendanceSchema.statics.checkDeviceAbuse = async function (deviceHash, excludeStudentId = null) {
    const query = { deviceHash };
    if (excludeStudentId) {
        query.student = { $ne: excludeStudentId };
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    query.createdAt = { $gte: today };

    const records = await this.find(query)
        .populate('student', 'name email rollNo')
        .select('student session createdAt');

    const uniqueStudents = [...new Set(records.map(r => r.student?._id?.toString()))];

    return {
        isAbuse: uniqueStudents.length > 1,
        deviceHash,
        usageCount: records.length,
        uniqueStudents: uniqueStudents.length,
        records
    };
};

export default mongoose.model('Attendance', attendanceSchema);

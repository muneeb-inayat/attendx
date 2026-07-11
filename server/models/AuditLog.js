import mongoose from 'mongoose';

/**
 * Audit Log Model
 * Stores comprehensive audit trail for all attendance operations
 * Non-negotiable security requirement
 */

const auditLogSchema = new mongoose.Schema({
    // Event identification
    eventType: {
        type: String,
        required: true,
        enum: [
            'ATTENDANCE_ATTEMPT',
            'ATTENDANCE_SUCCESS',
            'ATTENDANCE_FAILED',
            'SESSION_START',
            'SESSION_STOP',
            'QR_GENERATED',
            'QR_SCANNED',
            'DEVICE_REGISTERED',
            'DEVICE_BLOCKED',
            'RATE_LIMIT_HIT',
            'SUSPICIOUS_ACTIVITY',
            'LOCATION_SPOOFING_SUSPECTED',
            'TOKEN_REPLAY_ATTEMPT',
            'ADMIN_ACTION'
        ],
        index: true
    },

    // Actor information
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        index: true
    },
    userEmail: String,
    userRole: {
        type: String,
        enum: ['student', 'professor', 'admin', 'system']
    },

    // Session context
    sessionId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Session',
        index: true
    },
    courseId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Course'
    },

    // Device information
    deviceFingerprint: String,
    deviceHash: String,
    userAgent: String,

    // Network information
    ipAddress: String,
    ipCountry: String,
    ipCity: String,

    // Location data
    location: {
        latitude: Number,
        longitude: Number,
        accuracy: Number,
        altitude: Number,
        altitudeAccuracy: Number,
        heading: Number,
        speed: Number
    },

    // Calculated values
    distanceFromCenter: Number,
    allowedRadius: Number,

    // Validation results
    validationResult: {
        type: String,
        enum: ['PASSED', 'FAILED', 'SUSPICIOUS', 'BLOCKED'],
        default: 'PASSED'
    },
    validationDetails: {
        tokenValid: Boolean,
        timeWindowValid: Boolean,
        locationValid: Boolean,
        deviceValid: Boolean,
        academicMatch: Boolean,
        replayCheck: Boolean,
        rateLimitCheck: Boolean
    },

    // Failure information
    failureReason: String,
    failureCode: {
        type: String,
        enum: [
            null,
            'INVALID_TOKEN',
            'EXPIRED_TOKEN',
            'TOKEN_REPLAY',
            'LOCATION_OUT_OF_RANGE',
            'LOCATION_SPOOFING',
            'DEVICE_ALREADY_USED',
            'TOO_MANY_DEVICES',
            'ACADEMIC_MISMATCH',
            'SESSION_INACTIVE',
            'SESSION_NOT_FOUND',
            'RATE_LIMIT_EXCEEDED',
            'ALREADY_MARKED',
            'BLOCKED_USER'
        ]
    },

    // Security flags
    securityFlags: [{
        type: String,
        enum: [
            'PERFECT_ACCURACY',      // GPS accuracy too perfect (spoofing sign)
            'LOCATION_JUMP',         // Sudden location change
            'DEVICE_SWITCHING',      // Multiple devices in short time
            'RAPID_ATTEMPTS',        // Too many attempts
            'SHARED_DEVICE',         // Device used by multiple students
            'VPN_DETECTED',          // VPN/Proxy detected
            'EMULATOR_DETECTED',     // Emulator detected
            'ROOT_DETECTED'          // Rooted device detected
        ]
    }],

    // Raw request data (for debugging)
    requestBody: {
        type: mongoose.Schema.Types.Mixed,
        select: false  // Not included in queries by default
    },

    // Metadata
    metadata: {
        type: mongoose.Schema.Types.Mixed
    },

    // Timestamps
    timestamp: {
        type: Date,
        default: Date.now
        // Note: indexed via TTL index defined below
    }
}, {
    timestamps: true,
    collection: 'audit_logs'
});

// Compound indexes for common queries
auditLogSchema.index({ userId: 1, eventType: 1, timestamp: -1 });
auditLogSchema.index({ sessionId: 1, eventType: 1, timestamp: -1 });
auditLogSchema.index({ deviceHash: 1, timestamp: -1 });
auditLogSchema.index({ validationResult: 1, timestamp: -1 });

// TTL index - auto-delete logs after 90 days (also serves as timestamp index)
auditLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

/**
 * Static method to log an event
 */
auditLogSchema.statics.log = async function (eventData) {
    try {
        return await this.create(eventData);
    } catch (error) {
        console.error('Audit log error:', error.message);
        // Don't throw - audit logging should never break main flow
        return null;
    }
};

/**
 * Static method to get student's recent activity
 */
auditLogSchema.statics.getStudentActivity = async function (userId, limit = 50) {
    return await this.find({ userId })
        .sort({ timestamp: -1 })
        .limit(limit)
        .select('-requestBody');
};

/**
 * Static method to get session audit trail
 */
auditLogSchema.statics.getSessionAudit = async function (sessionId) {
    return await this.find({ sessionId })
        .sort({ timestamp: 1 })
        .select('-requestBody')
        .populate('userId', 'name email rollNo');
};

/**
 * Static method to get suspicious activities
 */
auditLogSchema.statics.getSuspiciousActivities = async function (options = {}) {
    const { startDate, endDate, limit = 100 } = options;

    const query = {
        $or: [
            { validationResult: 'SUSPICIOUS' },
            { validationResult: 'BLOCKED' },
            { securityFlags: { $exists: true, $ne: [] } }
        ]
    };

    if (startDate || endDate) {
        query.timestamp = {};
        if (startDate) query.timestamp.$gte = new Date(startDate);
        if (endDate) query.timestamp.$lte = new Date(endDate);
    }

    return await this.find(query)
        .sort({ timestamp: -1 })
        .limit(limit)
        .populate('userId', 'name email rollNo');
};

/**
 * Static method to get device usage statistics
 */
auditLogSchema.statics.getDeviceStats = async function (deviceHash) {
    return await this.aggregate([
        { $match: { deviceHash, eventType: 'ATTENDANCE_SUCCESS' } },
        {
            $group: {
                _id: '$userId',
                count: { $sum: 1 },
                lastUsed: { $max: '$timestamp' }
            }
        },
        { $sort: { count: -1 } }
    ]);
};

export default mongoose.model('AuditLog', auditLogSchema);

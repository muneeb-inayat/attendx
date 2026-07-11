import mongoose from 'mongoose';

/**
 * Failed Attendance Attempt Model
 * Stores all failed attendance attempts for review by professors
 * Allows manual acceptance of students who had valid reasons
 */

const failedAttemptSchema = new mongoose.Schema({
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

    // Student info for quick display
    studentName: {
        type: String,
        required: true
    },
    rollNo: {
        type: String,
        required: true
    },

    // Failure reason
    failureReason: {
        type: String,
        enum: [
            'LOCATION_TOO_FAR',
            'SESSION_EXPIRED',
            'INVALID_TOKEN',
            'DEVICE_MISMATCH',
            'RATE_LIMITED',
            'NOT_ELIGIBLE',
            'ALREADY_MARKED',
            'OTHER'
        ],
        required: true
    },
    failureMessage: String,

    // Location data (even if failed)
    location: {
        latitude: Number,
        longitude: Number,
        accuracy: Number
    },
    distance: Number,  // Distance from session center

    // Device info
    deviceFingerprint: String,
    deviceType: String,

    // Request timestamp
    attemptedAt: {
        type: Date,
        default: Date.now
    },

    // Resolution status
    status: {
        type: String,
        enum: ['PENDING', 'ACCEPTED', 'REJECTED'],
        default: 'PENDING'
    },

    // If accepted, link to created attendance
    acceptedAttendance: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Attendance'
    },

    // Professor who reviewed
    reviewedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    reviewedAt: Date,
    reviewNote: String
}, {
    timestamps: true
});

// Indexes for efficient queries
failedAttemptSchema.index({ session: 1, status: 1 });
failedAttemptSchema.index({ student: 1, createdAt: -1 });
failedAttemptSchema.index({ session: 1, student: 1 });

export default mongoose.model('FailedAttempt', failedAttemptSchema);

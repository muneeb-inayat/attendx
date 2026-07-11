import mongoose from 'mongoose';

/**
 * ClaimRequest Model
 * Tracks professor requests to claim or unclaim courses.
 * Requires admin approval.
 */
const ClaimRequestSchema = new mongoose.Schema({
    // Professor making the request
    professor: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },

    // Course being claimed/unclaimed
    course: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Course',
        required: true
    },

    // Type of request
    type: {
        type: String,
        enum: ['claim', 'unclaim'],
        required: true
    },

    // Request status
    status: {
        type: String,
        enum: ['pending', 'approved', 'rejected'],
        default: 'pending'
    },

    // Optional message from professor
    message: {
        type: String,
        default: ''
    },

    // Admin review details
    reviewedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    reviewedAt: {
        type: Date,
        default: null
    },
    reviewNote: {
        type: String,
        default: ''
    }
}, {
    timestamps: true
});

// Indexes for efficient queries
ClaimRequestSchema.index({ professor: 1, status: 1 });
ClaimRequestSchema.index({ course: 1, status: 1 });
ClaimRequestSchema.index({ status: 1, createdAt: -1 });

// Prevent duplicate pending requests
ClaimRequestSchema.index(
    { professor: 1, course: 1, type: 1, status: 1 },
    {
        unique: true,
        partialFilterExpression: { status: 'pending' }
    }
);

export default mongoose.model('ClaimRequest', ClaimRequestSchema);

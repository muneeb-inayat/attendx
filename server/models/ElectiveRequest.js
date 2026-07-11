import mongoose from 'mongoose';

/**
 * ElectiveRequest Model
 * Tracks student requests for elective/extra courses outside their branch/year.
 * Requires admin approval.
 */
const ElectiveRequestSchema = new mongoose.Schema({
    // Student making the request
    student: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },

    // Course being requested
    course: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Course',
        required: true
    },

    // Reason for requesting this elective
    reason: {
        type: String,
        required: [true, 'Please provide a reason for this elective request'],
        maxlength: 500
    },

    // Request status
    status: {
        type: String,
        enum: ['pending', 'approved', 'rejected'],
        default: 'pending'
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
ElectiveRequestSchema.index({ student: 1, status: 1 });
ElectiveRequestSchema.index({ course: 1, status: 1 });
ElectiveRequestSchema.index({ status: 1, createdAt: -1 });

// Prevent duplicate pending requests for same course
ElectiveRequestSchema.index(
    { student: 1, course: 1, status: 1 },
    {
        unique: true,
        partialFilterExpression: { status: 'pending' }
    }
);

export default mongoose.model('ElectiveRequest', ElectiveRequestSchema);

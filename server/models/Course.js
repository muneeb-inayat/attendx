import mongoose from 'mongoose';

const CourseSchema = new mongoose.Schema({
    courseCode: {
        type: String,
        required: [true, 'Please add a course code'],
        trim: true,
        uppercase: true
    },
    courseName: {
        type: String,
        required: [true, 'Please add a course name']
    },
    description: {
        type: String,
        default: ''
    },
    
    credits: {
        type: Number,
        default: 4,
        min: 1
    },

    // Academic Binding
    branch: {
        type: String,
        required: true,
        lowercase: true,
    },
    
    semester: {
        type: Number, // 1-8
        required: true,
        min: 1,
        max: 8
    },

    // Batch: 'all' for entire branch, or '1'-'5' for specific batch
    batch: {
        type: String,
        enum: ['all', '1', '2', '3', '4', '5'],
        default: 'all'
    },

    // Admin who created the course
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },

    // Professors who have claimed this course (can be multiple)
    claimedBy: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    }],

    // Multiple schedules (course can be on different days/times/rooms)
    schedules: [{
        day: {
            type: String,
            enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
        },
        startTime: {
            type: String // HH:MM format
        },
        endTime: {
            type: String // HH:MM format
        },
        room: {
            type: String,
            default: ''
        }
    }],

    // Default location for sessions (geofencing)
    defaultLocation: {
        latitude: { type: Number, default: null },
        longitude: { type: Number, default: null },
        radius: { type: Number, default: 50 }
    },
    defaultDuration: { type: Number, default: 60 },
    lateThreshold: { type: Number, default: 15 },

    isArchived: {
        type: Boolean,
        default: false
    }
}, {
    timestamps: true
});

// Indexes for efficient queries
CourseSchema.index({ createdBy: 1 });
CourseSchema.index({ claimedBy: 1 });
CourseSchema.index({ semester: 1, branch: 1 });
CourseSchema.index({ branch: 1, semester: 1, courseCode: 1 }, { unique: true });

// Virtual to check if course has been claimed
CourseSchema.virtual("isClaimed").get(function () {
    return this.claimedBy !== null;
});

// Virtual to get professor count
CourseSchema.virtual('professorCount').get(function () {
    return this.claimedBy ? this.claimedBy.length : 0;
});

CourseSchema.virtual("year").get(function () {
    return Math.ceil(this.semester / 2);
});

export default mongoose.model('Course', CourseSchema);

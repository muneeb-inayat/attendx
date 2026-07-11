import mongoose from 'mongoose';
// import { calculateAcademicState } from '../utils/identity.js';

const userSchema = new mongoose.Schema({
    assignedCourses: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: "Course",
        default: []
    }],
    name: {
        type: String,
        required: true,
        trim: true
    },
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true
    },
    semester: {
    type: Number,
    min: 1,
    max: 8,
    default: null
},
    password: {
        type: String,
        select: false
    },

    mustChangePassword: {
        type: Boolean,
        default: true
    },
    googleId: {
        type: String,
        sparse: true, // Allows null values while still being unique when present
        unique: true
    },
    role: {
        type: String,
        enum: ['student', 'pending_professor', 'professor', 'admin'],
        default: 'student'
    },

    // Student Specific Fields (Derived & Immutable)
    rollNo: {
        type: String,
        required: true,
        unique: true,
        uppercase: true,
        trim: true
    },
    branch: {
        type: String,
        default: null
    },
    admissionYear: {
        type: Number,
        default: null
    },
    // Student's batch (1-5 for lab divisions)
    batch: {
        type: String,
        enum: ['1', '2', '3', '4', '5'],
        default: null
    },

    // For non-standard MNIT emails that need admin review
    pendingReview: {
        type: Boolean,
        default: false
    },

    // Approved elective courses (courses outside student's branch/year)
    electiveCourses: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Course'
    }]
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// // Dynamic Academic State
// userSchema.virtual('academicState').get(function () {
//     if (this.role !== 'student' || !this.admissionYear) return null;
//     return calculateAcademicState(this.admissionYear);
// });

// Virtual to check if user needs admin review
userSchema.virtual('needsReview').get(function () {
    return this.pendingReview === true;
});

export default mongoose.model('User', userSchema);

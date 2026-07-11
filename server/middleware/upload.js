import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure upload directories exist
const uploadDir = path.join(__dirname, '..', 'uploads');
const materialsDir = path.join(uploadDir, 'materials');
const submissionsDir = path.join(uploadDir, 'submissions');

[uploadDir, materialsDir, submissionsDir].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

// File filter - allowed file types
const fileFilter = (req, file, cb) => {
    const allowedTypes = [
        'text/csv',
         'application/vnd.ms-excel',
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'image/jpeg',
        'image/png',
        'image/gif',
        'application/zip',
        'application/x-zip-compressed',
        'text/plain'
    ];

    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Invalid file type. Allowed: PDF, DOC, PPT, XLS, images, ZIP, TXT'), false);
    }
};

// Storage for course materials
const materialStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const courseDir = path.join(materialsDir, req.params.id || 'general');
        if (!fs.existsSync(courseDir)) {
            fs.mkdirSync(courseDir, { recursive: true });
        }
        cb(null, courseDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, uniqueSuffix + ext);
    }
});

// Storage for student submissions
const submissionStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const assignmentDir = path.join(submissionsDir, req.params.id || 'general');
        if (!fs.existsSync(assignmentDir)) {
            fs.mkdirSync(assignmentDir, { recursive: true });
        }
        cb(null, assignmentDir);
    },
    filename: (req, file, cb) => {
        const studentId = req.body.studentId || req.student?.rollNo || 'unknown';
        const uniqueSuffix = Date.now();
        const ext = path.extname(file.originalname);
        cb(null, `${studentId}-${uniqueSuffix}${ext}`);
    }
});

// Upload configurations
export const uploadMaterial = multer({
    storage: materialStorage,
    fileFilter,
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB max
    }
});

export const uploadSubmission = multer({
    storage: submissionStorage,
    fileFilter,
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB max
    }
});

export const uploadStudents = multer({
    dest: uploadDir,
    fileFilter,
    limits: {
        fileSize: 2 * 1024 * 1024 // 2MB
    }
});

// Error handler for multer
export const handleUploadError = (err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                success: false,
                error: 'File too large. Maximum size is 10MB.'
            });
        }
        return res.status(400).json({
            success: false,
            error: err.message
        });
    } else if (err) {
        return res.status(400).json({
            success: false,
            error: err.message
        });
    }
    next();
};

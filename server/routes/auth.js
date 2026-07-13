import express from 'express';
import {
    studentGoogleLogin,
    professorGoogleLogin,
    getMe,
    adminLogin,
    studentLogin,
    deleteAccount,
    changePassword
} from '../controllers/authController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// Student Google Login
router.post('/google/student', studentGoogleLogin);

router.post("/student/login", studentLogin);

router.put(
    "/student/change-password",
    protect,
    changePassword
);

// Professor Google Login (Any email)
router.post('/google/professor', professorGoogleLogin);

// Admin Email/Password Login
router.post('/admin/login', adminLogin);

// Get current user
router.get('/me', protect, getMe);

// Delete own account
router.delete('/delete-account', protect, deleteAccount);

export default router;


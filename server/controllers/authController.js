import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';
import { User } from '../models/index.js';
import config from '../config/index.js';
import bcrypt from 'bcryptjs';
import { hashDeviceFingerprint, isValidFingerprint } from '../utils/security.js';
import { evaluateStudentDevice } from '../utils/deviceCheck.js';

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

/**
 * Helper function to generate JWT
 */
const generateToken = (user) => {
    return jwt.sign(
        { id: user._id, role: user.role },
        config.jwtSecret,
        { expiresIn: config.jwtExpire }
    );
};


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
 * @route   POST /api/auth/google/student
 * @desc    Student Login & Implicit Signup
 * @access  Public
 */
export const studentGoogleLogin = async (req, res) => {
    try {
        const { credential } = req.body;

        if (!credential) {
            return res.status(400).json({
                success: false,
                error: 'Google credential is required'
            });
        }

        // Verify Google Token
        let ticket;
        try {
            ticket = await client.verifyIdToken({
                idToken: credential,
                audience: process.env.GOOGLE_CLIENT_ID
            });
        } catch (verifyError) {
            console.error('Token verification failed:', verifyError);
            return res.status(401).json({
                success: false,
                error: 'Invalid Google token'
            });
        }

        const payload = ticket.getPayload();
        const { email, name, sub: googleId } = payload;



        // Find student imported by admin
        let user = await User.findOne({
            email: email.toLowerCase(),
            role: 'student'
        });

        // Student not found
        if (!user) {
            return res.status(403).json({
                success: false,
                error: 'You are not registered. Please contact the administrator.'
            });
        }

        // First login - link Google account
        if (!user.googleId) {

            user.googleId = googleId;
            user.name = name;

            await user.save();

        }
        // Future logins - must use same Google account
        else if (user.googleId !== googleId) {

            return res.status(403).json({
                success: false,
                error: "This Google account is not linked to your student account."
            });

        }
        // Keep student's display name updated
        else if (user.name !== name) {

            user.name = name;
            await user.save();

        }



        const token = generateToken(user);

        res.json({
            success: true,
            data: {
                user: {
                    id: user._id,
                    name: user.name,
                    email: user.email,
                    role: user.role,
                    rollNo: user.rollNo,
                    branch: user.branch,
                    branchCode: user.branchCode,
                    admissionYear: user.admissionYear,
                    academicState: user.academicState,
                    assignedCourses: user.assignedCourses,
                    mustChangePassword: user.mustChangePassword
                },
                token
            }
        });

    } catch (error) {
        console.error('Student Login Error:', error);
        res.status(500).json({
            success: false,
            error: 'Authentication failed'
        });
    }
};


export const studentLogin = async (req, res) => {
    try {

        const { identifier, password, deviceFingerprint, fingerprintComponents } = req.body;

        if (!identifier || !password) {
            return res.status(400).json({
                success: false,
                error: "Email/Roll No and password are required"
            });
        }

        if (!deviceFingerprint || !isValidFingerprint(deviceFingerprint)) {
            return res.status(400).json({
                success: false,
                error: "Invalid or missing device information. Please refresh and try again."
            });
        }

        const normalized = identifier.trim();

        const user = await User.findOne({
            role: "student",
            $or: [
                { email: normalized.toLowerCase() },
                { rollNo: normalized.toUpperCase() }
            ]
        }).select("+password");


        if (!user) {
            return res.status(401).json({
                success: false,
                error: "Invalid credentials"
            });
        }
        if (!user.password) {
            return res.status(400).json({
                success: false,
                error: "Password login is not enabled for this account."
            });
        }

        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) {
            return res.status(401).json({
                success: false,
                error: "Invalid credentials"
            });
        }

        // ========================================
        // Device gate — unapproved/blocked devices never receive a token
        // ========================================
        const deviceHash = hashDeviceFingerprint(deviceFingerprint);
        const { deviceType, browser, os } = parseDeviceInfo(req.headers['user-agent']);

        const deviceCheck = await evaluateStudentDevice({
            studentId: user._id,
            deviceHash,
            fingerprintComponents: fingerprintComponents || {},
            deviceType,
            browser,
            os,
            ip: req.ip || req.connection?.remoteAddress,
            location: null,
            currentDeviceSecurity: user.deviceSecurity
        });

        if (!deviceCheck.ok) {
            return res.status(deviceCheck.status).json({
                success: false,
                error: deviceCheck.error,
                code: deviceCheck.code
            });
        }

        const token = generateToken(user);

        res.json({
            success: true,
            data: {
                user: {
                    id: user._id,
                    name: user.name,
                    email: user.email,
                    role: user.role,
                    rollNo: user.rollNo,
                    branch: user.branch,
                    admissionYear: user.admissionYear,
                    academicState: user.academicState,
                    assignedCourses: user.assignedCourses,
                    mustChangePassword: user.mustChangePassword
                },
                token
            }
        });

    } catch (error) {

        console.error(error);

        res.status(500).json({
            success: false,
            error: "Login failed"
        });

    }
};


/**
 * @route   PUT /api/auth/change-password
 * @desc    Change student password
 * @access  Private (Student)
 */
export const changePassword = async (req, res) => {
    try {

        const { currentPassword, newPassword } = req.body;

        // Validation
        if (!currentPassword || !newPassword) {
            return res.status(400).json({
                success: false,
                error: "Current password and new password are required."
            });
        }

        if (newPassword.length < 8) {
            return res.status(400).json({
                success: false,
                error: "Password must be at least 8 characters long."
            });
        }

        if (currentPassword === newPassword) {
            return res.status(400).json({
                success: false,
                error: "New password must be different from current password."
            });
        }

        // Only students can use this endpoint
        if (req.user.role !== "student") {
            return res.status(403).json({
                success: false,
                error: "Only students can change their password."
            });
        }

        // Load password (it's select:false)
        const user = await User.findById(req.user._id).select("+password");

        if (!user) {
            return res.status(404).json({
                success: false,
                error: "User not found."
            });
        }

        // Verify current password
        const isMatch = await bcrypt.compare(
            currentPassword,
            user.password
        );

        if (!isMatch) {
            return res.status(400).json({
                success: false,
                error: "Current password is incorrect."
            });
        }

        // Hash new password
        user.password = await bcrypt.hash(newPassword, 10);

        // Student no longer needs to change password
        user.mustChangePassword = false;

        await user.save();

        res.json({
            success: true,
            message: "Password changed successfully."
        });

    } catch (error) {

        console.error("Change Password Error:", error);

        res.status(500).json({
            success: false,
            error: "Failed to change password."
        });

    }
};

/**
 * @route   POST /api/auth/google/professor
 * @desc    Professor Login (Any Google email) & Implicit Signup
 * @access  Public
 */
export const professorGoogleLogin = async (req, res) => {
    try {
        const { credential } = req.body;

        if (!credential) {
            return res.status(400).json({
                success: false,
                error: 'Google credential is required'
            });
        }

        // Verify Google Token
        let ticket;
        try {
            ticket = await client.verifyIdToken({
                idToken: credential,
                audience: process.env.GOOGLE_CLIENT_ID
            });
        } catch (verifyError) {
            console.error('Token verification failed:', verifyError);
            return res.status(401).json({
                success: false,
                error: 'Invalid Google token'
            });
        }

        const payload = ticket.getPayload();
        const { email, name, sub: googleId } = payload;

        // Check if user exists
        let user = await User.findOne({ email });

        if (!user) {
            // Create professor user (pending approval)
            user = await User.create({
                email,
                name,
                googleId,
                role: 'pending_professor'
            });
            console.log(`New professor registered (pending): ${email}`);
        }

        // Check role - reject if student trying to login as professor
        if (user.role === 'student') {
            return res.status(403).json({
                success: false,
                error: 'Student accounts cannot access professor portal.'
            });
        }

        const token = generateToken(user);

        res.json({
            success: true,
            data: {
                user: {
                    id: user._id,
                    name: user.name,
                    email: user.email,
                    role: user.role
                },
                token
            }
        });

    } catch (error) {
        console.error('Professor Login Error:', error);
        res.status(500).json({
            success: false,
            error: 'Authentication failed'
        });
    }
};

/**
 * @route   GET /api/auth/me
 * @desc    Get current user
 * @access  Private
 */
export const getMe = async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        res.json({
            success: true,
            data: user
        });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

/**
 * @route   POST /api/auth/admin/login
 * @desc    Admin Login with email/password from .env
 * @access  Public
 */
export const adminLogin = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                error: 'Email and password are required'
            });
        }

        // Check against .env credentials
        const adminEmail = process.env.ADMIN_EMAIL;
        const adminPassword = process.env.ADMIN_PASSWORD;

        if (!adminEmail || !adminPassword) {
            return res.status(500).json({
                success: false,
                error: 'Admin credentials not configured'
            });
        }

        if (email !== adminEmail || password !== adminPassword) {
            return res.status(401).json({
                success: false,
                error: 'Invalid credentials'
            });
        }

        // Find or create admin user in DB
        let user = await User.findOne({ email: adminEmail, role: 'admin' });

        if (!user) {
            user = await User.create({
                email: adminEmail,
                name: 'System Admin',
                role: 'admin',
                googleId: 'env-admin'
            });
        }

        const token = generateToken(user);

        res.json({
            success: true,
            data: {
                user: {
                    id: user._id,
                    name: user.name,
                    email: user.email,
                    role: user.role
                },
                token
            }
        });

    } catch (error) {
        console.error('Admin Login Error:', error);
        res.status(500).json({
            success: false,
            error: 'Login failed'
        });
    }
};


/**
 * @route   DELETE /api/auth/delete-account
 * @desc    Delete user's own account
 * @access  Private (Student/Professor)
 */
export const deleteAccount = async (req, res) => {
    try {
        const user = req.user;

        // Admin cannot delete their account through this endpoint
        if (user.role === 'admin') {
            return res.status(403).json({
                success: false,
                error: 'Admin accounts cannot be deleted through this endpoint'
            });
        }

        // Import models dynamically to avoid circular dependencies
        const { Attendance, Course, AuditLog } = await import('../models/index.js');

        // If professor, release all claimed courses
        if (user.role === 'professor') {
            await Course.updateMany(
                { claimedBy: user._id },
                { $pull: { claimedBy: user._id } }
            );
            console.log(`Released courses for professor: ${user.email}`);
        }

        // If student, optionally delete attendance records
        if (user.role === 'student') {
            // Delete attendance records
            await Attendance.deleteMany({ student: user._id });
            console.log(`Deleted attendance records for student: ${user.email}`);
        }

        // Log the deletion
        await AuditLog.log({
            eventType: 'ACCOUNT_DELETED',
            userId: user._id,
            userEmail: user.email,
            userRole: user.role,
            metadata: {
                deletedAt: new Date(),
                selfDeleted: true
            }
        });

        // Delete the user
        await User.findByIdAndDelete(user._id);

        console.log(`Account deleted: ${user.email} (${user.role})`);

        res.json({
            success: true,
            message: 'Account deleted successfully'
        });

    } catch (error) {
        console.error('Delete Account Error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete account'
        });
    }
};


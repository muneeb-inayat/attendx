import dotenv from 'dotenv';
dotenv.config();
console.log("MONGODB_URI =", process.env.MONGODB_URI);
export default {
    // Server
    port: process.env.PORT || 5000,
    nodeEnv: process.env.NODE_ENV || 'development',

    // MongoDB
    mongoUri: process.env.MONGODB_URI,

    // JWT
    jwtSecret: process.env.JWT_SECRET || 'your-secret-key-change-in-production',
    jwtExpire: process.env.JWT_EXPIRE || '7d',

    // Frontend (remove trailing slash to prevent CORS mismatch)
    frontendUrl: (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/+$/, ''),

    // Email config
    smtpHost: process.env.SMTP_HOST || 'smtp.gmail.com',
    smtpPort: process.env.SMTP_PORT || 587,
    smtpUser: process.env.SMTP_USER,
    smtpPass: process.env.SMTP_PASS,

    // Google OAuth
    googleClientId: process.env.GOOGLE_CLIENT_ID,

    // Redis (for security features)
    redis: {
        host: process.env.REDIS_HOST || '127.0.0.1',
        port: parseInt(process.env.REDIS_PORT) || 6379,
        password: process.env.REDIS_PASSWORD || undefined,
        db: parseInt(process.env.REDIS_DB) || 0
    },

    // Security Settings
    security: {
        // QR token settings
        qrRotationInterval: parseInt(process.env.QR_ROTATION_INTERVAL) || 30000, // 30 seconds
        qrTimeWindowTolerance: parseInt(process.env.QR_TIME_WINDOW) || 35000,    // 35 seconds

        // Rate limiting
        maxAttendanceAttempts: parseInt(process.env.MAX_ATTENDANCE_ATTEMPTS) || 10,
        maxDevicesPerStudent: parseInt(process.env.MAX_DEVICES_PER_STUDENT) || 3,

        // Location settings
        defaultRadius: parseInt(process.env.DEFAULT_RADIUS) || 50,         // 50 meters
        maxRadius: parseInt(process.env.MAX_RADIUS) || 500,                // 500 meters
        requiredAccuracy: parseInt(process.env.REQUIRED_ACCURACY) || 100,  // 100 meters

        // Suspicion thresholds
        suspicionThreshold: parseInt(process.env.SUSPICION_THRESHOLD) || 50,
        autoBlockThreshold: parseInt(process.env.AUTO_BLOCK_THRESHOLD) || 100
    }
};

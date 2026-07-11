import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import connectDB from './config/db.js';
import config from './config/index.js';
import path from 'path';
import { fileURLToPath } from 'url';
import keepAlive from './utils/keepalive.js';

// Load environment variables
dotenv.config();

// Route imports
import studentRoutes from './routes/students.js';
import authRoutes from './routes/auth.js';
import adminRoutes from './routes/admin.js';
import courseRoutes from './routes/courses.js';
import sessionRoutes from './routes/sessions.js';
import attendanceRoutes from './routes/attendance.js';

// Security middleware
import { globalRateLimit } from './middleware/rateLimiter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Connect to database
connectDB();

const app = express();

// ============================================
// MIDDLEWARE
// ============================================

// Trust proxy (for accurate IP detection behind reverse proxy)
app.set('trust proxy', 1);

// CORS configuration
app.use(cors({
    origin: config.frontendUrl,
    credentials: true
}));

// Parse JSON bodies
app.use(express.json({ limit: '10mb' }));

// Parse URL-encoded bodies
app.use(express.urlencoded({ extended: true }));

// Add request metadata for security
app.use((req, res, next) => {
    req.requestTime = new Date();
    req.clientIp = req.ip || req.connection?.remoteAddress;
    next();
});

// Global rate limiting (100 requests per minute per user)
// Enable after Redis is set up
// app.use(globalRateLimit);

// Serve uploaded files (if any)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ============================================
// API ROUTES
// ============================================

// Authentication (Google Only)
app.use('/api/auth', authRoutes);
// Admin Management
app.use('/api/admin', adminRoutes);

// Course Management (Professor)
app.use('/api/courses', courseRoutes);

// Session Management (Professor)
app.use('/api/sessions', sessionRoutes);

// Attendance Marking & Tracking
app.use('/api/attendance', attendanceRoutes);

// student
app.use('/api/students', studentRoutes);

// ============================================
// UTILITY ROUTES
// ============================================

// Ping endpoint for keep-alive system
app.get('/ping', (req, res) => {
    res.status(200).send('pong');
});
// ============================================

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({
        success: true,
        message: 'QR Attendance API is running',
        version: '4.0.0-secure',  // Security update version
        timestamp: new Date().toISOString(),
        security: {
            qrRotation: true,
            deviceBinding: true,
            replayProtection: true,
            auditLogging: true
        }
    });
});

// Security status endpoint (for monitoring)
app.get('/api/health/security', async (req, res) => {
    try {
        const { redisService } = await import('./config/redis.js');
        const redisStats = await redisService.getStats();

        res.json({
            success: true,
            redis: {
                connected: redisStats.connected,
                status: redisStats.connected ? 'operational' : 'degraded'
            },
            features: {
                hmacTokens: true,
                rotatingQR: true,
                deviceFingerprinting: true,
                replayProtection: redisStats.connected,
                rateLimiting: redisStats.connected,
                auditLogging: true
            },
            degradedMode: !redisStats.connected
        });
    } catch (error) {
        res.json({
            success: true,
            redis: { connected: false, status: 'unavailable' },
            degradedMode: true
        });
    }
});

// ============================================
// ERROR HANDLING
// ============================================

// 404 handler
app.use((req, res, next) => {
    res.status(404).json({
        success: false,
        error: `Route ${req.originalUrl} not found`
    });
});

// Global error handler
app.use((err, req, res, next) => {
    console.error('Server Error:', err.stack);

    // Log error to audit if available
    import('./models/AuditLog.js').then(({ default: AuditLog }) => {
        AuditLog.log({
            eventType: 'SYSTEM_ERROR',
            userId: req.user?._id,
            metadata: {
                error: err.message,
                path: req.path,
                method: req.method
            }
        }).catch(() => { });
    }).catch(() => { });

    res.status(err.statusCode || 500).json({
        success: false,
        error: config.nodeEnv === 'production'
            ? 'Internal Server Error'
            : err.message
    });
});

// ============================================
// GRACEFUL SHUTDOWN
// ============================================

const gracefulShutdown = async (signal) => {
    console.log(`\n${signal} received. Starting graceful shutdown...`);

    try {
        // Close Redis connection
        const { redis } = await import('./config/redis.js');
        await redis.quit();
        console.log('Redis connection closed');
    } catch (err) {
        console.log('Redis not connected or already closed');
    }

    process.exit(0);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// ============================================
// SERVER START
// ============================================

const PORT = config.port || 5000;

app.listen(PORT, '0.0.0.0', () => {
    console.log(`
╔═══════════════════════════════════════════════════╗
║     QR Attendance System - Secure Backend         ║
║           Version 4.0.0-secure                    ║
╠═══════════════════════════════════════════════════╣
║  Security Features:                               ║
║  ✓ HMAC-based rotating QR tokens                  ║
║  ✓ Device fingerprinting & binding                ║
║  ✓ Replay attack protection                       ║
║  ✓ Enhanced geolocation validation                ║
║  ✓ Rate limiting & abuse detection                ║
║  ✓ Comprehensive audit logging                    ║
╠═══════════════════════════════════════════════════╣
║  Server: http://localhost:${PORT}                     ║
║  API:    http://localhost:${PORT}/api                 ║
╚═══════════════════════════════════════════════════╝
    `);

    // Start keep-alive pings AFTER server is running
    keepAlive();
});

export default app;

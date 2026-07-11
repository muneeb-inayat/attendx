import { RateLimiterRedis, RateLimiterMemory } from 'rate-limiter-flexible';
import { redis, redisService } from '../config/redis.js';

/**
 * Rate Limiter Middleware
 * Implements multiple rate limiting strategies for abuse prevention
 */

// Fallback to memory-based rate limiting if Redis unavailable
let attendanceLimiter;
let deviceLimiter;
let globalLimiter;
let failedAttemptLimiter;
let isInitializedWithRedis = false;

/**
 * Initialize rate limiters
 * Uses Redis if available, falls back to memory
 */
const initializeLimiters = (useRedis = false) => {
    if (useRedis) {
        // Attendance attempts: 10 per minute per student
        attendanceLimiter = new RateLimiterRedis({
            storeClient: redis,
            keyPrefix: 'ratelimit:attendance',
            points: 10,          // Number of attempts
            duration: 60,        // Per 60 seconds
            blockDuration: 60    // Block for 60 seconds if exceeded
        });

        // Device switch: 5 different devices per day
        deviceLimiter = new RateLimiterRedis({
            storeClient: redis,
            keyPrefix: 'ratelimit:device',
            points: 5,
            duration: 86400,     // 24 hours
            blockDuration: 3600  // Block for 1 hour
        });

        // Global API rate limit: 100 requests per minute
        globalLimiter = new RateLimiterRedis({
            storeClient: redis,
            keyPrefix: 'ratelimit:global',
            points: 100,
            duration: 60,
            blockDuration: 30
        });

        // Failed attempts: 5 failures before temporary block
        failedAttemptLimiter = new RateLimiterRedis({
            storeClient: redis,
            keyPrefix: 'ratelimit:failed',
            points: 5,
            duration: 300,       // 5 minutes
            blockDuration: 300   // Block for 5 minutes
        });

        isInitializedWithRedis = true;
        console.log('✅ Rate limiters initialized with Redis');
    } else {
        // Memory fallback
        attendanceLimiter = new RateLimiterMemory({
            points: 10,
            duration: 60
        });

        deviceLimiter = new RateLimiterMemory({
            points: 5,
            duration: 86400
        });

        globalLimiter = new RateLimiterMemory({
            points: 100,
            duration: 60
        });

        failedAttemptLimiter = new RateLimiterMemory({
            points: 5,
            duration: 300
        });

        console.log('⚠️ Rate limiters initialized with Memory (Redis unavailable)');
    }
};

// Initialize with memory first
initializeLimiters(false);

// When Redis becomes ready, reinitialize with Redis
redis.on('ready', () => {
    if (!isInitializedWithRedis) {
        initializeLimiters(true);
    }
});

/**
 * Rate limit attendance attempts
 * Key: studentId
 */
export const rateLimitAttendance = async (req, res, next) => {
    if (!attendanceLimiter) {
        return next(); // Skip if not initialized
    }

    const studentId = req.user?._id?.toString() || req.ip;

    try {
        await attendanceLimiter.consume(studentId);
        next();
    } catch (rejRes) {
        const retryAfter = Math.round(rejRes.msBeforeNext / 1000) || 60;

        res.set('Retry-After', String(retryAfter));
        res.set('X-RateLimit-Limit', '10');
        res.set('X-RateLimit-Remaining', '0');
        res.set('X-RateLimit-Reset', new Date(Date.now() + retryAfter * 1000).toISOString());

        // Log abuse attempt
        if (req.user?._id) {
            redisService.logSuspiciousActivity(
                req.user._id.toString(),
                req.body?.sessionId || 'unknown',
                'RATE_LIMIT_EXCEEDED',
                { endpoint: 'attendance', ip: req.ip }
            );
        }

        return res.status(429).json({
            success: false,
            error: 'Too many attendance attempts',
            message: `Please wait ${retryAfter} seconds before trying again`,
            retryAfter
        });
    }
};

/**
 * Track and limit device switches
 * Called when a new device is detected
 */
export const checkDeviceLimit = async (studentId, deviceHash) => {
    if (!deviceLimiter) {
        return { allowed: true };
    }

    const key = `${studentId}:${deviceHash}`;

    try {
        const result = await deviceLimiter.consume(key);
        return {
            allowed: true,
            remaining: result.remainingPoints,
            total: 5
        };
    } catch (rejRes) {
        return {
            allowed: false,
            remaining: 0,
            retryAfter: Math.round(rejRes.msBeforeNext / 1000),
            reason: 'TOO_MANY_DEVICES'
        };
    }
};

/**
 * Global API rate limiting middleware
 * Applied to all API routes
 */
export const globalRateLimit = async (req, res, next) => {
    if (!globalLimiter) {
        return next();
    }

    const key = req.user?._id?.toString() || req.ip;

    try {
        const result = await globalLimiter.consume(key);

        res.set('X-RateLimit-Limit', '100');
        res.set('X-RateLimit-Remaining', String(result.remainingPoints));

        next();
    } catch (rejRes) {
        const retryAfter = Math.round(rejRes.msBeforeNext / 1000) || 30;

        res.set('Retry-After', String(retryAfter));
        res.set('X-RateLimit-Limit', '100');
        res.set('X-RateLimit-Remaining', '0');

        return res.status(429).json({
            success: false,
            error: 'Too many requests',
            retryAfter
        });
    }
};

/**
 * Track failed validation attempts
 * Blocks after too many failures
 */
export const trackFailedAttempt = async (studentId, reason) => {
    if (!failedAttemptLimiter) {
        return { blocked: false };
    }

    try {
        await failedAttemptLimiter.consume(studentId);
        return { blocked: false };
    } catch (rejRes) {
        // Log suspicious activity
        redisService.logSuspiciousActivity(studentId, 'unknown', 'TOO_MANY_FAILURES', {
            reason,
            blockedFor: Math.round(rejRes.msBeforeNext / 1000)
        });

        return {
            blocked: true,
            retryAfter: Math.round(rejRes.msBeforeNext / 1000),
            reason: 'TOO_MANY_FAILED_ATTEMPTS'
        };
    }
};

/**
 * Check if student is currently blocked
 */
export const isBlocked = async (studentId) => {
    if (!failedAttemptLimiter) {
        return { blocked: false };
    }

    try {
        const result = await failedAttemptLimiter.get(studentId);
        if (result && result.remainingPoints <= 0) {
            return {
                blocked: true,
                retryAfter: Math.round(result.msBeforeNext / 1000)
            };
        }
        return { blocked: false };
    } catch {
        return { blocked: false };
    }
};

/**
 * Reset rate limits for a student (admin function)
 */
export const resetRateLimits = async (studentId) => {
    try {
        if (attendanceLimiter) await attendanceLimiter.delete(studentId);
        if (failedAttemptLimiter) await failedAttemptLimiter.delete(studentId);
        return true;
    } catch {
        return false;
    }
};

export default {
    rateLimitAttendance,
    checkDeviceLimit,
    globalRateLimit,
    trackFailedAttempt,
    isBlocked,
    resetRateLimits
};

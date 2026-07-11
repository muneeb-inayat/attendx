import Redis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

// Redis connection configuration
const redisConfig = {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB) || 0,

    maxRetriesPerRequest: 1,
    connectTimeout: 3000,

    // Add these
    retryStrategy: () => null,
    lazyConnect: true
};

// Log config (without password)
console.log('📡 Redis Config:', {
    host: redisConfig.host,
    port: redisConfig.port,
    tls: !!redisConfig.tls
});

// Create Redis client with connection handling
const redis = new Redis(redisConfig);
redis.connect().catch(() => {
    console.log("⚠️ Running without Redis");
});

// Connection state tracking
let isConnected = false;

redis.on('connect', () => {
    console.log('🔗 Redis: Connecting...');
});

redis.on('ready', () => {
    isConnected = true;
    console.log('✅ Redis: Connected and ready');
});

redis.on('error', (err) => {
    isConnected = false;
    console.error('❌ Redis Error:', err.message);
});

redis.on('close', () => {
    isConnected = false;
    console.log('🔌 Redis: Connection closed');
});

// Key prefixes for organization
export const REDIS_KEYS = {
    // Session management
    SESSION_ACTIVE: 'session:active:',          // session:active:{sessionId}
    SESSION_NONCE: 'session:nonce:',            // session:nonce:{sessionId}

    // Attendance replay protection
    ATTENDANCE_MARKED: 'attendance:marked:',    // attendance:marked:{sessionId}:{studentId}
    TOKEN_USED: 'token:used:',                  // token:used:{sessionId}:{nonce}

    // Device tracking
    DEVICE_STUDENT: 'device:student:',          // device:student:{deviceHash}:{date}
    STUDENT_DEVICES: 'student:devices:',        // student:devices:{studentId}

    // Rate limiting
    RATE_ATTEMPT: 'rate:attempt:',              // rate:attempt:{studentId}
    RATE_DEVICE_SWITCH: 'rate:device:',         // rate:device:{studentId}:{date}
    RATE_FAILED: 'rate:failed:',                // rate:failed:{studentId}

    // Abuse tracking
    ABUSE_LOG: 'abuse:log:',                    // abuse:log:{studentId}
    SUSPICIOUS_ACTIVITY: 'suspicious:'          // suspicious:{sessionId}:{studentId}
};

// Session TTL constants (in seconds)
export const TTL = {
    SESSION_CACHE: 3600 * 4,      // 4 hours
    NONCE: 35,                     // 35 seconds (slightly longer than QR rotation)
    ATTENDANCE_LOCK: 3600 * 4,    // 4 hours (duration of session)
    TOKEN_REPLAY: 60,             // 1 minute
    DEVICE_TRACKING: 86400,       // 24 hours
    RATE_LIMIT_WINDOW: 60,        // 1 minute
    ABUSE_LOG: 86400 * 7          // 7 days
};

/**
 * Redis Service Class - Encapsulates all Redis operations
 */
class RedisService {
    constructor() {
        this.client = redis;
    }

    /**
     * Check if Redis is available
     */
    isAvailable() {
        return isConnected;
    }

    /**
     * Graceful fallback getter - returns null if Redis unavailable
     */
    async safeGet(key) {
        try {
            if (!isConnected) return null;
            return await this.client.get(key);
        } catch (err) {
            console.error('Redis GET error:', err.message);
            return null;
        }
    }

    /**
     * Graceful fallback setter
     */
    async safeSet(key, value, ttl = null) {
        try {
            if (!isConnected) return false;
            if (ttl) {
                await this.client.setex(key, ttl, value);
            } else {
                await this.client.set(key, value);
            }
            return true;
        } catch (err) {
            console.error('Redis SET error:', err.message);
            return false;
        }
    }

    // ========================================
    // SESSION MANAGEMENT
    // ========================================

    /**
     * Cache active session data
     */
    async cacheSession(sessionId, sessionData, ttlSeconds = TTL.SESSION_CACHE) {
        const key = REDIS_KEYS.SESSION_ACTIVE + sessionId;
        return await this.safeSet(key, JSON.stringify(sessionData), ttlSeconds);
    }

    /**
     * Get cached session
     */
    async getCachedSession(sessionId) {
        const key = REDIS_KEYS.SESSION_ACTIVE + sessionId;
        const data = await this.safeGet(key);
        return data ? JSON.parse(data) : null;
    }

    /**
     * Invalidate session cache
     */
    async invalidateSession(sessionId) {
        try {
            if (!isConnected) return false;
            await this.client.del(REDIS_KEYS.SESSION_ACTIVE + sessionId);
            return true;
        } catch (err) {
            return false;
        }
    }

    /**
     * Store rotating nonce for session
     */
    async setSessionNonce(sessionId, nonce, ttlSeconds = TTL.NONCE) {
        const key = REDIS_KEYS.SESSION_NONCE + sessionId;
        return await this.safeSet(key, nonce, ttlSeconds);
    }

    /**
     * Validate nonce for session
     */
    async validateNonce(sessionId, nonce) {
        const key = REDIS_KEYS.SESSION_NONCE + sessionId;
        const storedNonce = await this.safeGet(key);
        return storedNonce === nonce;
    }

    // ========================================
    // REPLAY PROTECTION
    // ========================================

    /**
     * Check if attendance already marked (prevents replay)
     * Returns true if ALREADY marked (should reject)
     */
    async isAttendanceMarked(sessionId, studentId) {
        const key = REDIS_KEYS.ATTENDANCE_MARKED + `${sessionId}:${studentId}`;
        const exists = await this.safeGet(key);
        return exists !== null;
    }

    /**
     * Mark attendance as complete (prevents replay)
     */
    async markAttendanceComplete(sessionId, studentId, ttlSeconds = TTL.ATTENDANCE_LOCK) {
        const key = REDIS_KEYS.ATTENDANCE_MARKED + `${sessionId}:${studentId}`;
        return await this.safeSet(key, Date.now().toString(), ttlSeconds);
    }

    /**
     * Clear a specific attendance mark (for fixing stale entries)
     */
    async clearAttendanceMark(sessionId, studentId) {
        try {
            if (!isConnected) return false;
            const key = REDIS_KEYS.ATTENDANCE_MARKED + `${sessionId}:${studentId}`;
            await this.client.del(key);
            console.log(`🧹 Cleared Redis attendance mark: ${key}`);
            return true;
        } catch (err) {
            console.error('Redis DEL error:', err.message);
            return false;
        }
    }

    /**
     * Flush ALL attendance marks from Redis (admin use only)
     */
    async flushAllAttendanceMarks() {
        try {
            if (!isConnected) return { success: false, error: 'Redis not connected' };
            const pattern = REDIS_KEYS.ATTENDANCE_MARKED + '*';
            const keys = await this.client.keys(pattern);

            if (keys.length === 0) {
                return { success: true, deleted: 0 };
            }

            await this.client.del(...keys);
            console.log(`🧹 Flushed ${keys.length} attendance marks from Redis`);
            return { success: true, deleted: keys.length };
        } catch (err) {
            console.error('Redis FLUSH error:', err.message);
            return { success: false, error: err.message };
        }
    }

    /**
     * Check if specific token/nonce combination was used
     */
    async isTokenUsed(sessionId, nonce) {
        const key = REDIS_KEYS.TOKEN_USED + `${sessionId}:${nonce}`;
        const exists = await this.safeGet(key);
        return exists !== null;
    }

    /**
     * Mark token as used (one-time use)
     */
    async markTokenUsed(sessionId, nonce, studentId, ttlSeconds = TTL.TOKEN_REPLAY) {
        const key = REDIS_KEYS.TOKEN_USED + `${sessionId}:${nonce}`;
        return await this.safeSet(key, studentId, ttlSeconds);
    }

    // ========================================
    // DEVICE TRACKING
    // ========================================

    /**
     * Track device usage for the day
     * Returns list of student IDs who used this device today
     */
    async getDeviceUsageToday(deviceHash) {
        const today = new Date().toISOString().split('T')[0];
        const key = REDIS_KEYS.DEVICE_STUDENT + `${deviceHash}:${today}`;
        try {
            if (!isConnected) return [];
            const data = await this.client.smembers(key);
            return data || [];
        } catch (err) {
            return [];
        }
    }

    /**
     * Add student to device's daily usage
     */
    async addDeviceUsage(deviceHash, studentId) {
        const today = new Date().toISOString().split('T')[0];
        const key = REDIS_KEYS.DEVICE_STUDENT + `${deviceHash}:${today}`;
        try {
            if (!isConnected) return false;
            await this.client.sadd(key, studentId);
            await this.client.expire(key, TTL.DEVICE_TRACKING);
            return true;
        } catch (err) {
            return false;
        }
    }

    /**
     * Get student's registered devices
     */
    async getStudentDevices(studentId) {
        const key = REDIS_KEYS.STUDENT_DEVICES + studentId;
        try {
            if (!isConnected) return [];
            const data = await this.client.smembers(key);
            return data || [];
        } catch (err) {
            return [];
        }
    }

    /**
     * Register device for student (max 3 devices)
     */
    async registerStudentDevice(studentId, deviceHash) {
        const key = REDIS_KEYS.STUDENT_DEVICES + studentId;
        try {
            if (!isConnected) return { success: true, isNew: false };

            const devices = await this.client.smembers(key);
            const isNew = !devices.includes(deviceHash);

            if (isNew && devices.length >= 3) {
                // Too many devices - don't add, but don't fail
                return { success: true, isNew: true, tooMany: true, count: devices.length };
            }

            await this.client.sadd(key, deviceHash);
            return { success: true, isNew, count: devices.length + (isNew ? 1 : 0) };
        } catch (err) {
            return { success: false };
        }
    }

    // ========================================
    // RATE LIMITING
    // ========================================

    /**
     * Increment attendance attempt counter
     * Returns current count
     */
    async incrementAttempts(studentId) {
        const key = REDIS_KEYS.RATE_ATTEMPT + studentId;
        try {
            if (!isConnected) return 0;
            const count = await this.client.incr(key);
            if (count === 1) {
                await this.client.expire(key, TTL.RATE_LIMIT_WINDOW);
            }
            return count;
        } catch (err) {
            return 0;
        }
    }

    /**
     * Get current attempt count
     */
    async getAttemptCount(studentId) {
        const key = REDIS_KEYS.RATE_ATTEMPT + studentId;
        const count = await this.safeGet(key);
        return parseInt(count) || 0;
    }

    /**
     * Track failed validation
     */
    async incrementFailedValidations(studentId) {
        const key = REDIS_KEYS.RATE_FAILED + studentId;
        try {
            if (!isConnected) return 0;
            const count = await this.client.incr(key);
            if (count === 1) {
                await this.client.expire(key, TTL.RATE_LIMIT_WINDOW * 5); // 5 minute window
            }
            return count;
        } catch (err) {
            return 0;
        }
    }

    /**
     * Track device switches per day
     */
    async incrementDeviceSwitches(studentId) {
        const today = new Date().toISOString().split('T')[0];
        const key = REDIS_KEYS.RATE_DEVICE_SWITCH + `${studentId}:${today}`;
        try {
            if (!isConnected) return 0;
            const count = await this.client.incr(key);
            if (count === 1) {
                await this.client.expire(key, TTL.DEVICE_TRACKING);
            }
            return count;
        } catch (err) {
            return 0;
        }
    }

    // ========================================
    // ABUSE DETECTION & LOGGING
    // ========================================

    /**
     * Log suspicious activity
     */
    async logSuspiciousActivity(studentId, sessionId, reason, metadata = {}) {
        const key = REDIS_KEYS.ABUSE_LOG + studentId;
        const entry = JSON.stringify({
            timestamp: Date.now(),
            sessionId,
            reason,
            ...metadata
        });

        try {
            if (!isConnected) return false;
            await this.client.lpush(key, entry);
            await this.client.ltrim(key, 0, 99); // Keep last 100 entries
            await this.client.expire(key, TTL.ABUSE_LOG);
            return true;
        } catch (err) {
            return false;
        }
    }

    /**
     * Get abuse log for student
     */
    async getAbuseLog(studentId, limit = 50) {
        const key = REDIS_KEYS.ABUSE_LOG + studentId;
        try {
            if (!isConnected) return [];
            const logs = await this.client.lrange(key, 0, limit - 1);
            return logs.map(log => JSON.parse(log));
        } catch (err) {
            return [];
        }
    }

    /**
     * Mark session suspicious for a student
     */
    async markSuspicious(sessionId, studentId, reason) {
        const key = REDIS_KEYS.SUSPICIOUS_ACTIVITY + `${sessionId}:${studentId}`;
        return await this.safeSet(key, reason, TTL.SESSION_CACHE);
    }

    /**
     * Check if marked suspicious
     */
    async isSuspicious(sessionId, studentId) {
        const key = REDIS_KEYS.SUSPICIOUS_ACTIVITY + `${sessionId}:${studentId}`;
        return await this.safeGet(key);
    }

    // ========================================
    // CLEANUP & MAINTENANCE
    // ========================================

    /**
     * Clean up expired keys (for maintenance scripts)
     */
    async cleanup() {
        // Redis handles TTL automatically, but this can be used for manual cleanup
        console.log('Redis cleanup triggered (TTL handles expiration automatically)');
    }

    /**
     * Get Redis stats
     */
    async getStats() {
        try {
            if (!isConnected) return { connected: false };
            const info = await this.client.info();
            return { connected: true, info };
        } catch (err) {
            return { connected: false, error: err.message };
        }
    }
}

// Export singleton instance
export const redisService = new RedisService();
export { redis };
export default redisService;

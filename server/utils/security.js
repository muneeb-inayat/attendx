import crypto from 'crypto';
import config from '../config/index.js';

/**
 * Security utilities for the attendance system
 * Implements HMAC-based token generation and validation
 */

// Server secret for HMAC operations
const SERVER_SECRET = config.jwtSecret || 'default-secret-change-in-production';

// Time window tolerance (in milliseconds)
const TIME_WINDOW_TOLERANCE = 30000; // 30 seconds

/**
 * Generate a cryptographically secure nonce
 * @returns {string} Random nonce
 */
export const generateNonce = () => {
    return crypto.randomBytes(16).toString('hex');
};

/**
 * Generate session-bound rotating nonce with timestamp
 * @param {string} sessionId 
 * @returns {object} { nonce, generatedAt, expiresAt }
 */
export const generateRotatingNonce = (sessionId) => {
    const timestamp = Date.now();
    const nonce = crypto.randomBytes(12).toString('hex');
    const combined = `${sessionId}:${nonce}:${timestamp}`;
    const signature = crypto.createHmac('sha256', SERVER_SECRET)
        .update(combined)
        .digest('hex')
        .substring(0, 16);

    return {
        nonce: `${nonce}${signature}`,
        generatedAt: timestamp,
        expiresAt: timestamp + TIME_WINDOW_TOLERANCE
    };
};

/**
 * Validate rotating nonce
 * @param {string} sessionId 
 * @param {string} fullNonce 
 * @param {number} originalTimestamp 
 * @returns {boolean}
 */
export const validateRotatingNonce = (sessionId, fullNonce, originalTimestamp) => {
    if (!fullNonce || fullNonce.length !== 40) return false;

    const nonce = fullNonce.substring(0, 24);
    const signature = fullNonce.substring(24);

    const combined = `${sessionId}:${nonce}:${originalTimestamp}`;
    const expectedSignature = crypto.createHmac('sha256', SERVER_SECRET)
        .update(combined)
        .digest('hex')
        .substring(0, 16);

    return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
    );
};

/**
 * Generate student-bound attendance hash (CRITICAL SECURITY)
 * This hash binds: session + student + device + time window
 * @param {object} params 
 * @returns {string} HMAC hash
 */
export const generateAttendanceHash = ({ sessionId, studentId, deviceFingerprint, timeWindow }) => {
    const payload = `${sessionId}:${studentId}:${deviceFingerprint}:${timeWindow}`;
    return crypto.createHmac('sha256', SERVER_SECRET)
        .update(payload)
        .digest('hex');
};

/**
 * Validate student-bound attendance hash
 * @param {object} params 
 * @param {string} providedHash 
 * @returns {boolean}
 */
export const validateAttendanceHash = ({ sessionId, studentId, deviceFingerprint, timeWindow }, providedHash) => {
    const expectedHash = generateAttendanceHash({ sessionId, studentId, deviceFingerprint, timeWindow });

    try {
        return crypto.timingSafeEqual(
            Buffer.from(expectedHash),
            Buffer.from(providedHash)
        );
    } catch {
        return false;
    }
};

/**
 * Calculate time window from timestamp
 * Time windows are 30-second buckets
 * @param {number} timestamp 
 * @returns {number} Time window identifier
 */
export const getTimeWindow = (timestamp = Date.now()) => {
    return Math.floor(timestamp / TIME_WINDOW_TOLERANCE);
};

/**
 * Check if timestamp is within valid time window
 * @param {number} timestamp 
 * @param {number} toleranceWindows - Number of windows to allow (default: 1)
 * @returns {boolean}
 */
export const isWithinTimeWindow = (timestamp, toleranceWindows = 1) => {
    const currentWindow = getTimeWindow();
    const targetWindow = getTimeWindow(timestamp);
    return Math.abs(currentWindow - targetWindow) <= toleranceWindows;
};

/**
 * Hash device fingerprint for storage (privacy)
 * @param {string} fingerprint Raw fingerprint from client
 * @returns {string} Hashed fingerprint
 */
export const hashDeviceFingerprint = (fingerprint) => {
    if (!fingerprint) return null;
    return crypto.createHash('sha256')
        .update(fingerprint + SERVER_SECRET)
        .digest('hex')
        .substring(0, 32);
};

/**
 * Validate device fingerprint format
 * @param {string} fingerprint 
 * @returns {boolean}
 */
export const isValidFingerprint = (fingerprint) => {
    if (!fingerprint || typeof fingerprint !== 'string') return false;
    // Fingerprints should be at least 16 characters
    return fingerprint.length >= 16 && fingerprint.length <= 128;
};

/**
 * Generate secure session token for QR code
 * @param {string} sessionId 
 * @returns {object} { token, nonce, expiresAt }
 */
export const generateQRToken = (sessionId) => {
    const nonce = generateNonce();
    const timestamp = Date.now();
    const expiresAt = timestamp + TIME_WINDOW_TOLERANCE;

    const payload = `${sessionId}:${nonce}:${timestamp}`;
    const token = crypto.createHmac('sha256', SERVER_SECRET)
        .update(payload)
        .digest('hex');

    return {
        token,
        nonce,
        timestamp,
        expiresAt
    };
};

/**
 * Validate QR token
 * @param {string} sessionId 
 * @param {string} token 
 * @param {string} nonce 
 * @param {number} timestamp 
 * @returns {boolean}
 */
export const validateQRToken = (sessionId, token, nonce, timestamp) => {
    // Check time window first
    if (!isWithinTimeWindow(timestamp)) {
        return { valid: false, reason: 'TOKEN_EXPIRED' };
    }

    const payload = `${sessionId}:${nonce}:${timestamp}`;
    const expectedToken = crypto.createHmac('sha256', SERVER_SECRET)
        .update(payload)
        .digest('hex');

    try {
        const isValid = crypto.timingSafeEqual(
            Buffer.from(token),
            Buffer.from(expectedToken)
        );
        return { valid: isValid, reason: isValid ? null : 'INVALID_TOKEN' };
    } catch {
        return { valid: false, reason: 'INVALID_TOKEN' };
    }
};

/**
 * Generate student-specific QR challenge
 * This is an optional enhancement where the QR contains a challenge
 * that the student app must solve using their credentials
 * @param {string} sessionId 
 * @param {string} nonce 
 * @returns {string} Challenge string
 */
export const generateQRChallenge = (sessionId, nonce) => {
    return crypto.createHmac('sha256', SERVER_SECRET)
        .update(`challenge:${sessionId}:${nonce}`)
        .digest('hex')
        .substring(0, 16);
};

/**
 * Solve QR challenge with student ID
 * @param {string} challenge 
 * @param {string} studentId 
 * @param {string} deviceHash 
 * @returns {string} Solution
 */
export const solveQRChallenge = (challenge, studentId, deviceHash) => {
    return crypto.createHmac('sha256', SERVER_SECRET)
        .update(`solve:${challenge}:${studentId}:${deviceHash}`)
        .digest('hex');
};

/**
 * Verify QR challenge solution
 * @param {string} sessionId 
 * @param {string} nonce 
 * @param {string} studentId 
 * @param {string} deviceHash 
 * @param {string} solution 
 * @returns {boolean}
 */
export const verifyQRChallengeSolution = (sessionId, nonce, studentId, deviceHash, solution) => {
    const challenge = generateQRChallenge(sessionId, nonce);
    const expectedSolution = solveQRChallenge(challenge, studentId, deviceHash);

    try {
        return crypto.timingSafeEqual(
            Buffer.from(solution),
            Buffer.from(expectedSolution)
        );
    } catch {
        return false;
    }
};

export default {
    generateNonce,
    generateRotatingNonce,
    validateRotatingNonce,
    generateAttendanceHash,
    validateAttendanceHash,
    getTimeWindow,
    isWithinTimeWindow,
    hashDeviceFingerprint,
    isValidFingerprint,
    generateQRToken,
    validateQRToken,
    generateQRChallenge,
    solveQRChallenge,
    verifyQRChallengeSolution
};


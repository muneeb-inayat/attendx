/**
 * Enhanced Geolocation Validation
 * Implements hardened location verification to reduce spoofing effectiveness
 */

/**
 * Calculate distance between two coordinates using Haversine formula
 * @param {number} lat1 
 * @param {number} lon1 
 * @param {number} lat2 
 * @param {number} lon2 
 * @returns {number} Distance in meters
 */
export const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371e3; // Earth's radius in meters
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
        Math.cos(φ1) * Math.cos(φ2) *
        Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
};

/**
 * Validate location data format
 * @param {object} location 
 * @returns {object} { valid, reason }
 */
export const validateLocationFormat = (location) => {
    const { latitude, longitude, accuracy, altitude, altitudeAccuracy, heading, speed, timestamp } = location;

    // Basic presence check
    if (typeof latitude !== 'number' || typeof longitude !== 'number') {
        return { valid: false, reason: 'MISSING_COORDINATES' };
    }

    // Valid coordinate ranges
    if (latitude < -90 || latitude > 90) {
        return { valid: false, reason: 'INVALID_LATITUDE' };
    }
    if (longitude < -180 || longitude > 180) {
        return { valid: false, reason: 'INVALID_LONGITUDE' };
    }

    // Accuracy check (if provided)
    if (typeof accuracy === 'number') {
        if (accuracy < 0) {
            return { valid: false, reason: 'NEGATIVE_ACCURACY' };
        }
    }

    return { valid: true };
};

/**
 * Detect potential GPS spoofing indicators
 * @param {object} location Current location data
 * @param {object} previousLocation Previous location data (optional)
 * @returns {object} { suspicious, flags, score }
 */
export const detectSpoofing = (location, previousLocation = null) => {
    const flags = [];
    let suspicionScore = 0;

    const { latitude, longitude, accuracy, altitude, altitudeAccuracy, heading, speed, timestamp } = location;

    // Flag 1: Perfect accuracy (< 3 meters is suspiciously perfect)
    if (typeof accuracy === 'number' && accuracy < 3) {
        flags.push('PERFECT_ACCURACY');
        suspicionScore += 20;
    }

    // Flag 2: Accuracy too poor to be useful (> 500 meters)
    if (typeof accuracy === 'number' && accuracy > 500) {
        flags.push('POOR_ACCURACY');
        suspicionScore += 10;
    }

    // Flag 3: Missing accuracy when it should be present
    if (accuracy === undefined || accuracy === null) {
        flags.push('MISSING_ACCURACY');
        suspicionScore += 5;
    }

    // Flag 4: Altitude at exact 0 (common in spoofed locations)
    if (typeof altitude === 'number' && altitude === 0) {
        flags.push('ZERO_ALTITUDE');
        suspicionScore += 10;
    }

    // Flag 5: Exactly round coordinates (common in mock locations)
    const latDecimals = (latitude.toString().split('.')[1] || '').length;
    const lonDecimals = (longitude.toString().split('.')[1] || '').length;
    if (latDecimals < 4 || lonDecimals < 4) {
        flags.push('LOW_PRECISION_COORDINATES');
        suspicionScore += 15;
    }

    // Flag 6: Exactly matching hundredths (very unlikely naturally)
    const latStr = latitude.toFixed(6);
    const lonStr = longitude.toFixed(6);
    if (latStr.endsWith('000000') || lonStr.endsWith('000000')) {
        flags.push('SUSPICIOUS_PRECISION');
        suspicionScore += 15;
    }

    // Flag 7: Location jump detection (if previous location available)
    if (previousLocation && previousLocation.latitude && previousLocation.longitude) {
        const distance = calculateDistance(
            previousLocation.latitude,
            previousLocation.longitude,
            latitude,
            longitude
        );
        const timeDiff = (timestamp || Date.now()) - (previousLocation.timestamp || 0);
        const timeSeconds = timeDiff / 1000;

        if (timeSeconds > 0) {
            const speedMps = distance / timeSeconds;

            // Teleportation: > 300 m/s (faster than any vehicle)
            if (speedMps > 300) {
                flags.push('TELEPORTATION');
                suspicionScore += 50;
            }
            // Very fast movement: > 50 m/s (180 km/h)
            else if (speedMps > 50 && timeSeconds < 60) {
                flags.push('RAPID_MOVEMENT');
                suspicionScore += 20;
            }
        }
    }

    // Flag 8: Inconsistent reported speed vs calculated speed
    if (previousLocation && typeof speed === 'number' && previousLocation.timestamp) {
        const distance = calculateDistance(
            previousLocation.latitude,
            previousLocation.longitude,
            latitude,
            longitude
        );
        const timeDiff = ((timestamp || Date.now()) - previousLocation.timestamp) / 1000;
        const calculatedSpeed = timeDiff > 0 ? distance / timeDiff : 0;

        // More than 50% difference
        if (speed > 0 && Math.abs(calculatedSpeed - speed) > speed * 0.5) {
            flags.push('SPEED_MISMATCH');
            suspicionScore += 25;
        }
    }

    return {
        suspicious: suspicionScore >= 30,
        flags,
        score: suspicionScore,
        maxScore: 100
    };
};

/**
 * V5: Calculate effective radius using adaptive geo-fencing
 * Takes into account GPS accuracy and device type
 * 
 * IMPORTANT: The session's `radius` field is the ACTUAL allowed distance set by professor.
 * The adaptiveGeo settings are for ADDITIONAL flexibility based on GPS accuracy.
 * 
 * @param {object} sessionLocation - Session geo configuration
 * @param {number} gpsAccuracy - Reported GPS accuracy in meters
 * @param {string} deviceType - 'mobile', 'tablet', or 'desktop'
 * @returns {object} { effectiveRadius, baseRadius, maxRadius, adjustments }
 */
export const calculateEffectiveRadius = (sessionLocation, gpsAccuracy, deviceType = 'mobile') => {
    const adaptiveGeo = sessionLocation.adaptiveGeo || {};

    // FIXED: Use the session's actual radius as the base, NOT adaptiveGeo.baseRadius
    // The professor sets radius (e.g., 150m), that should be the minimum allowed distance
    const sessionRadius = sessionLocation.radius || 50;

    // adaptiveGeo.baseRadius is for internal calculations, but we should never go below sessionRadius
    const baseRadius = Math.max(sessionRadius, adaptiveGeo.baseRadius || 50);

    // Maximum radius cap - should be at least the session radius + buffer
    const maxRadius = Math.max(
        adaptiveGeo.maxRadius || 300,
        sessionRadius + 100  // At least sessionRadius + 100m buffer
    );

    const accuracyMultiplier = adaptiveGeo.accuracyMultiplier || 1.0; // Reduced from 1.5
    const deviceTolerances = adaptiveGeo.deviceTolerances || {
        mobile: 1.0,
        tablet: 1.1,
        desktop: 1.2
    };

    // Get device tolerance multiplier
    const deviceMultiplier = deviceTolerances[deviceType] || 1.0;

    // Add GPS accuracy buffer
    // Indoor GPS can be off by 50-100m, so we need to account for this
    const gpsAccuracyValue = gpsAccuracy || 30; // Default to 30m if not provided

    // Minimum buffer for indoor usage (GPS is always somewhat inaccurate indoors)
    const minimumBuffer = 30; // Always add 30m buffer for indoor GPS drift

    // Calculate adaptive expansion based on GPS accuracy
    // Only expand if accuracy is worse than 20m (good GPS)
    const accuracyContribution = gpsAccuracyValue > 20
        ? (gpsAccuracyValue - 20) * accuracyMultiplier
        : 0;

    // Effective radius = base radius + minimum buffer + accuracy contribution
    const adaptiveRadius = baseRadius + minimumBuffer + accuracyContribution;

    // Apply device tolerance and cap at maximum
    const effectiveRadius = Math.min(adaptiveRadius * deviceMultiplier, maxRadius);

    return {
        effectiveRadius: Math.round(effectiveRadius),
        baseRadius,
        maxRadius,
        sessionRadius,  // Include original session radius for debugging
        accuracyContribution: Math.round(accuracyContribution),
        minimumBuffer,
        deviceMultiplier,
        gpsAccuracyUsed: gpsAccuracyValue,
        adjustments: {
            fromAccuracy: Math.round(accuracyContribution),
            fromBuffer: minimumBuffer,
            fromDevice: Math.round((deviceMultiplier - 1) * adaptiveRadius),
            capped: effectiveRadius >= maxRadius
        }
    };
};

/**
 * V5: Validate location against session center with ADAPTIVE GEO-FENCING
 * @param {object} studentLocation - Student's GPS data
 * @param {object} sessionLocation - Session geo configuration
 * @param {string} deviceType - Device type for tolerance calculation
 * @returns {object} Validation result with distance and effective radius
 */
export const validateLocationAgainstSession = (studentLocation, sessionLocation, deviceType = 'mobile') => {
    const { latitude, longitude, accuracy } = studentLocation;
    const { centerLat, centerLng, radius } = sessionLocation;

    // Check if adaptive geo is enabled
    const adaptiveEnabled = sessionLocation.adaptiveGeo?.enabled !== false;

    // Calculate distance
    const distance = calculateDistance(latitude, longitude, centerLat, centerLng);

    // Calculate effective radius (v5 adaptive)
    let effectiveRadius = radius;
    let radiusDetails = null;

    if (adaptiveEnabled) {
        const radiusCalc = calculateEffectiveRadius(sessionLocation, accuracy, deviceType);
        effectiveRadius = radiusCalc.effectiveRadius;
        radiusDetails = radiusCalc;
    }

    // Check if within effective radius
    const withinRadius = distance <= effectiveRadius;

    // Also check raw distance vs base radius for flagging
    const withinBaseRadius = distance <= (radiusDetails?.baseRadius || radius);

    // Distance buffer warning (within 10% of edge)
    const nearEdge = distance > effectiveRadius * 0.9 && distance <= effectiveRadius;

    // Extended beyond base but within adaptive
    const extendedAllowance = withinRadius && !withinBaseRadius;

    return {
        valid: withinRadius,
        distance: Math.round(distance),
        allowedRadius: effectiveRadius,
        baseRadius: radiusDetails?.baseRadius || radius,
        adaptiveEnabled,
        withinBaseRadius,
        extendedAllowance,
        nearEdge,
        percentage: Math.min(100, Math.round((distance / effectiveRadius) * 100)),
        radiusDetails,
        message: withinRadius
            ? `Within range (${Math.round(distance)}m of ${effectiveRadius}m)`
            : `You are ${Math.round(distance)}m away. Please move closer to the classroom. (Allowed: ${effectiveRadius}m)`
    };
};

/**
 * V5: Comprehensive location validation with adaptive geo-fencing
 * @param {object} params 
 * @returns {object} Complete validation result
 */
export const validateLocation = (params) => {
    const {
        studentLocation,
        sessionLocation,
        previousLocation = null,
        strictMode = false,
        deviceType = 'mobile'  // v5: Pass device type for adaptive radius
    } = params;

    const result = {
        valid: true,
        checks: {},
        flags: [],
        distance: 0,
        details: {},
        deviceType
    };

    // Check 1: Format validation
    const formatCheck = validateLocationFormat(studentLocation);
    result.checks.format = formatCheck.valid;
    if (!formatCheck.valid) {
        result.valid = false;
        result.flags.push(formatCheck.reason);
        result.error = formatCheck.reason;
        return result;
    }

    // Check 2: Distance validation with adaptive geo-fencing (v5)
    const distanceCheck = validateLocationAgainstSession(studentLocation, sessionLocation, deviceType);
    result.checks.distance = distanceCheck.valid;
    result.distance = distanceCheck.distance;
    result.allowedRadius = distanceCheck.allowedRadius;
    result.details.distance = distanceCheck;

    if (!distanceCheck.valid) {
        result.valid = false;
        result.flags.push('OUT_OF_RANGE');
        result.error = distanceCheck.message;
    }

    // Flag if location was allowed only due to adaptive extension
    if (distanceCheck.extendedAllowance) {
        result.flags.push('EXTENDED_ALLOWANCE');
    }

    // Check 3: Spoofing detection (preserved from v4)
    const spoofCheck = detectSpoofing(studentLocation, previousLocation);
    result.checks.spoofing = !spoofCheck.suspicious;
    result.details.spoofing = spoofCheck;
    result.flags = [...result.flags, ...spoofCheck.flags];

    if (spoofCheck.suspicious) {
        // In strict mode, fail on suspicion
        if (strictMode) {
            result.valid = false;
            result.error = 'Suspicious location patterns detected. Please try again.';
        }
        result.suspicious = true;
    }

    // Check 4: Accuracy requirement (v5: relaxed to 150m, softer handling)
    const minAccuracy = sessionLocation.requiredAccuracy || 150; // v5: Relaxed to 150m
    if (typeof studentLocation.accuracy === 'number' && studentLocation.accuracy > minAccuracy) {
        result.checks.accuracy = false;
        result.flags.push('ACCURACY_TOO_LOW');
        // v5: Don't fail on poor accuracy alone (adaptive radius already accounts for it)
        // Only fail in strict mode
        if (strictMode) {
            result.valid = false;
            result.error = `Your GPS accuracy is ±${Math.round(studentLocation.accuracy)}m. Please move to an area with better GPS signal.`;
        }
    } else {
        result.checks.accuracy = true;
    }

    return result;
};

/**
 * V5: Generate location sample requirements
 * Relaxed timing for real-world mobile usage
 */
export const getLocationSampleRequirements = () => {
    return {
        minSamples: 3,             // Minimum 3 samples
        maxSamples: 5,             // Maximum 5 samples
        maxTimeBetweenSamples: 5000, // 5 seconds max (relaxed from 10)
        minTimeBetweenSamples: 500,  // 500ms min (relaxed from 2s)
        maxVariance: 80,             // 80 meters max variance (relaxed from 50)
        maxTeleportSpeed: 50,        // 50 m/s max speed (detect teleportation)
        requiredAccuracy: 150        // 150m accuracy (relaxed from 100)
    };
};

/**
 * V5: Validate multiple location samples with improved detection
 * @param {array} samples Array of location samples
 * @returns {object} Validation result with centroid and flags
 */
export const validateLocationSamples = (samples) => {
    const requirements = getLocationSampleRequirements();
    const flags = [];

    // Handle missing or insufficient samples (graceful degradation)
    if (!samples || samples.length === 0) {
        return {
            valid: true, // Don't fail if no samples provided - use single location
            reason: 'NO_SAMPLES',
            useSingleLocation: true
        };
    }

    if (samples.length < requirements.minSamples) {
        return {
            valid: true, // Still allow with fewer samples, just flag it
            reason: 'INSUFFICIENT_SAMPLES',
            required: requirements.minSamples,
            provided: samples.length,
            useSingleLocation: true,
            flags: ['FEW_SAMPLES']
        };
    }

    // Calculate centroid
    const avgLat = samples.reduce((sum, s) => sum + s.latitude, 0) / samples.length;
    const avgLon = samples.reduce((sum, s) => sum + s.longitude, 0) / samples.length;
    const avgAccuracy = samples.reduce((sum, s) => sum + (s.accuracy || 0), 0) / samples.length;

    // Check variance
    const variances = samples.map(s =>
        calculateDistance(s.latitude, s.longitude, avgLat, avgLon)
    );
    const maxVariance = Math.max(...variances);

    // V5: Flag high variance but don't fail (real GPS drifts)
    if (maxVariance > requirements.maxVariance) {
        flags.push('HIGH_VARIANCE');
    }

    // Teleportation detection (critical for spoofing detection)
    const timestamps = samples.map(s => s.timestamp || 0).sort((a, b) => a - b);
    let teleportationDetected = false;

    for (let i = 1; i < samples.length; i++) {
        const distance = calculateDistance(
            samples[i - 1].latitude, samples[i - 1].longitude,
            samples[i].latitude, samples[i].longitude
        );
        const timeDiff = (samples[i].timestamp - samples[i - 1].timestamp) / 1000; // seconds

        if (timeDiff > 0) {
            const speed = distance / timeDiff;
            if (speed > requirements.maxTeleportSpeed) {
                teleportationDetected = true;
                flags.push('TELEPORTATION_DETECTED');
                break;
            }
        }
    }

    // If teleportation detected, this is highly suspicious
    if (teleportationDetected) {
        return {
            valid: false,
            reason: 'TELEPORTATION_DETECTED',
            suspicious: true,
            message: 'Location jumped unexpectedly. This may indicate GPS spoofing.',
            flags
        };
    }

    return {
        valid: true,
        centroid: { latitude: avgLat, longitude: avgLon, accuracy: avgAccuracy },
        maxVariance: Math.round(maxVariance),
        sampleCount: samples.length,
        flags,
        useSingleLocation: false
    };
};

export default {
    calculateDistance,
    validateLocationFormat,
    detectSpoofing,
    calculateEffectiveRadius,  // v5: New export
    validateLocationAgainstSession,
    validateLocation,
    getLocationSampleRequirements,
    validateLocationSamples
};

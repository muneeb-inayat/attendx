import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useNavigate, useLocation as useRouterLocation } from 'react-router-dom';
import axios from 'axios';
import API_URL from '../config/api';
import { useAuth } from '../context/AuthContext';
import {
    generateDeviceFingerprint,
    collectFingerprintComponents,
    detectDeviceType,
    getBrowserName,
    getOSName
} from '../utils/deviceFingerprint';
import SecurityAlert, { ProxyWarning } from '../components/SecurityAlert';
import './Attend.css';

/**
 * Attendance Marking Component (v5.0 - Location captured pre-scan)
 *
 * Flow:
 * - Scan.jsx now captures GPS location BEFORE the QR is scanned, and
 *   passes it here via react-router `state` when navigating.
 * - If that location is present, we skip our own GPS step and go
 *   straight from "fetch session info" to "confirm".
 * - If it's missing (e.g. this page was opened directly via a saved
 *   link, or state was lost on refresh), we fall back to requesting
 *   location ourselves, exactly like before.
 *
 * Collects and sends:
 * - Session ID & Token (from QR)
 * - Nonce & Timestamp (from QR - for replay protection)
 * - Full location data (lat, lng, accuracy, altitude, etc.)
 * - Device fingerprint & components
 * - Device metadata
 */

const Attend = () => {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const routerLocation = useRouterLocation();
    const { user, token } = useAuth();

    // Location captured on the Scan screen (if any)
    const preScannedLocation = routerLocation.state?.location || null;

    // QR Data
    const sessionId = searchParams.get('session');
    const qrToken = searchParams.get('token');
    const qrNonce = searchParams.get('nonce');
    const qrTimestamp = searchParams.get('ts');

    // State
    const [step, setStep] = useState('init'); // init, location, confirm, processing, success, error, blocked
    const [statusMsg, setStatusMsg] = useState('Initializing...');
    const [sessionInfo, setSessionInfo] = useState(null);
    const [location, setLocation] = useState(preScannedLocation);
    const [locationStatus, setLocationStatus] = useState('');
    const [distance, setDistance] = useState(null);

    // V5: Security-related state
    const [isSecurityBlocked, setIsSecurityBlocked] = useState(false);
    const [securityError, setSecurityError] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Redirect if no QR data, and reset all state when session changes
    useEffect(() => {
        if (!sessionId || !qrToken) {
            navigate('/student/scan-qr');
            return;
        }

        // IMPORTANT: Reset ALL state when navigating to a new session
        // This prevents stale "already marked" messages from previous sessions
        setStep('init');
        setStatusMsg('Initializing...');
        setSessionInfo(null);
        setLocation(preScannedLocation);
        setLocationStatus('');
        setDistance(null);
        setIsSecurityBlocked(false);
        setSecurityError(null);
        setIsSubmitting(false);

        // Fetch new session info
        fetchSessionInfo();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sessionId, qrToken]);


    const fetchSessionInfo = async () => {
        try {
            const res = await axios.get(`${API_URL}/sessions/${sessionId}/info`, {
                headers: { Authorization: `Bearer ${token}` }
            });

            setSessionInfo(res.data.data);

            if (preScannedLocation) {
                // Location was already captured on the Scan screen -
                // process it now that we have session info, and skip
                // straight to the confirm step.
                processLocation(preScannedLocation, preScannedLocation.samples || [], res.data.data);
            } else {
                // Fallback: no location came through (e.g. direct link),
                // fetch it here like before.
                setStep('location');
                setStatusMsg('Getting your location...');
            }

        } catch (err) {
            console.error(err);

            if (err.response?.status === 403) {
                setStep("error");
                setStatusMsg(
                    err.response.data.error ||
                    "You are not enrolled in this course."
                );
                return;
            }

            if (err.response?.status === 404) {
                setStep("error");
                setStatusMsg("Session not found.");
                return;
            }

            setStep("error");
            setStatusMsg("Unable to fetch session information.");
        }
    };

    // Calculate distance between two points
    const calculateDistance = useCallback((lat1, lon1, lat2, lon2) => {
        const R = 6371e3; // Earth's radius in meters
        const φ1 = lat1 * Math.PI / 180;
        const φ2 = lat2 * Math.PI / 180;
        const Δφ = (lat2 - lat1) * Math.PI / 180;
        const Δλ = (lon2 - lon1) * Math.PI / 180;

        const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

        return Math.round(R * c);
    }, []);

    // Fallback: request location here if it wasn't captured on the Scan screen
    const requestLocation = useCallback(() => {
        setLocationStatus('📡 Acquiring GPS signal...');

        if (!navigator.geolocation) {
            setStep('error');
            setStatusMsg('Geolocation is not supported by your browser.');
            return;
        }

        const samples = [];
        const maxSamples = 4;
        const collectionDuration = 3500; // 3.5 seconds
        let sampleCount = 0;

        const collectSample = () => {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    const { coords } = position;

                    samples.push({
                        latitude: coords.latitude,
                        longitude: coords.longitude,
                        accuracy: coords.accuracy,
                        altitude: coords.altitude,
                        altitudeAccuracy: coords.altitudeAccuracy,
                        heading: coords.heading,
                        speed: coords.speed,
                        timestamp: position.timestamp
                    });

                    sampleCount++;
                    setLocationStatus(`📍 Collecting GPS data... (${sampleCount}/${maxSamples})`);

                    if (navigator.vibrate) {
                        navigator.vibrate(50);
                    }
                },
                (error) => {
                    // Don't fail on individual sample errors, continue collecting
                },
                {
                    enableHighAccuracy: true,
                    timeout: 8000,
                    maximumAge: 0
                }
            );
        };

        collectSample();
        const interval = setInterval(() => {
            if (sampleCount < maxSamples) {
                collectSample();
            }
        }, collectionDuration / maxSamples);

        setTimeout(() => {
            clearInterval(interval);

            let bestSample = samples[0];
            if (samples.length > 1) {
                const avgLat = samples.reduce((sum, s) => sum + s.latitude, 0) / samples.length;
                const avgLon = samples.reduce((sum, s) => sum + s.longitude, 0) / samples.length;
                const avgAccuracy = samples.reduce((sum, s) => sum + (s.accuracy || 0), 0) / samples.length;

                bestSample = {
                    ...samples[samples.length - 1],
                    latitude: avgLat,
                    longitude: avgLon,
                    accuracy: avgAccuracy
                };
            }

            if (!bestSample) {
                navigator.geolocation.getCurrentPosition(
                    (position) => {
                        const { coords } = position;
                        const locationData = {
                            latitude: coords.latitude,
                            longitude: coords.longitude,
                            accuracy: coords.accuracy,
                            altitude: coords.altitude,
                            altitudeAccuracy: coords.altitudeAccuracy,
                            heading: coords.heading,
                            speed: coords.speed,
                            timestamp: position.timestamp
                        };
                        processLocation(locationData, []);
                    },
                    handleLocationError,
                    { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
                );
            } else {
                processLocation(bestSample, samples);
            }
        }, collectionDuration + 500);
    }, [sessionInfo, calculateDistance]);


    useEffect(() => {
        if (step === "location") {
            requestLocation();
        }
    }, [step, requestLocation]);

    // Handle location errors with clear messages
    const handleLocationError = (error) => {
        setStep('error');
        switch (error.code) {
            case error.PERMISSION_DENIED:
                setStatusMsg('📍 Location permission denied. You must enable GPS to mark attendance.');
                break;
            case error.POSITION_UNAVAILABLE:
                setStatusMsg('📍 GPS signal unavailable. Please check your location settings and try again.');
                break;
            case error.TIMEOUT:
                setStatusMsg('📍 Location request timed out. Please move to an area with better GPS signal.');
                break;
            default:
                setStatusMsg('📍 Unable to get your location. Please try again.');
        }
    };

    // Process collected location data.
    // `sessionData` defaults to the sessionInfo state, but can be passed
    // explicitly to avoid stale-closure issues when called immediately
    // after fetchSessionInfo resolves (before the state update has landed).
    const processLocation = (locationData, samples, sessionData = sessionInfo) => {
        setLocation(locationData);

        if (samples && samples.length > 0) {
            setLocation(prev => ({ ...prev, samples }));
        }

        if (sessionData?.centerLat && sessionData?.centerLng) {
            const dist = calculateDistance(
                locationData.latitude,
                locationData.longitude,
                sessionData.centerLat,
                sessionData.centerLng
            );
            setDistance(dist);

            const gpsAccuracy = locationData.accuracy || 30;
            const sessionRadius = sessionData.radius || 50;

            const baseRadius = Math.max(sessionRadius, 50);
            const maxRadius = Math.max(400, sessionRadius + 100);
            const minimumBuffer = 30;
            const accuracyMultiplier = 1.0;
            const accuracyContribution = gpsAccuracy > 20 ? (gpsAccuracy - 20) * accuracyMultiplier : 0;

            const isMobile = /mobile|android|iphone|ipad/i.test(navigator.userAgent);
            const deviceMultiplier = isMobile ? 1.0 : 1.2;

            const adaptiveRadius = baseRadius + minimumBuffer + accuracyContribution;
            const effectiveRadius = Math.min(Math.round(adaptiveRadius * deviceMultiplier), maxRadius);

            const accuracyNote = gpsAccuracy > 50
                ? ` (GPS accuracy: ±${Math.round(gpsAccuracy)}m - results may vary)`
                : '';

            if (dist > effectiveRadius) {
                setLocationStatus(
                    `⚠️ GPS shows ${dist}m from class center. ` +
                    `Allowed range: ~${Math.round(effectiveRadius)}m${accuracyNote}`
                );
            } else {
                setLocationStatus(
                    `✅ Within allowed range (GPS distance: ~${dist}m)${accuracyNote}`
                );
                if (navigator.vibrate) {
                    navigator.vibrate([100, 50, 100]);
                }
            }
        } else {
            setLocationStatus(`✅ Location acquired${locationData.accuracy ? ` (GPS accuracy: ±${Math.round(locationData.accuracy)}m)` : ''}`);
        }

        setStep('confirm');
    };

    // Submit attendance with enhanced security data and location samples
    const handleSubmit = async () => {
        if (isSubmitting) return;

        try {
            setIsSubmitting(true);
            setStep('processing');
            setStatusMsg('✨ Verifying and marking your attendance...');

            const { fingerprint, components } = generateDeviceFingerprint();

            const payload = {
                sessionId,
                token: qrToken,

                ...(qrNonce && { nonce: qrNonce }),
                ...(qrTimestamp && { timestamp: parseInt(qrTimestamp) }),

                latitude: location.latitude,
                longitude: location.longitude,
                accuracy: location.accuracy,
                altitude: location.altitude,
                altitudeAccuracy: location.altitudeAccuracy,
                heading: location.heading,
                speed: location.speed,

                ...(location.samples && { locationSamples: location.samples }),

                deviceFingerprint: fingerprint,
                fingerprintComponents: components,

                deviceType: detectDeviceType(),
                browser: getBrowserName(),
                os: getOSName()
            };

            const response = await axios.post(`${API_URL}/attendance/mark`, payload, {
                headers: { Authorization: `Bearer ${token}` }
            });

            setStep('success');
            setStatusMsg(response.data.message || '✅ Attendance marked successfully!');

            if (navigator.vibrate) {
                navigator.vibrate([100, 50, 100, 50, 200]);
            }

        } catch (error) {
            const errData = error.response?.data;
            const errorCode = errData?.code || '';

            const securityBlockCodes = [
                'DEVICE_OWNERSHIP_CONFLICT',
                'DEVICE_ALREADY_USED',
                'MULTI_STUDENT_DEVICE',
                'SUSPICIOUS_ACTIVITY',
                'BLOCKED'
            ];

            if (securityBlockCodes.includes(errorCode) || error.response?.status === 409) {
                setIsSecurityBlocked(true);
                setSecurityError({
                    code: errorCode,
                    message: errData?.error || 'Access blocked due to security concerns.',
                    isBlocked: true
                });
                setStep('blocked');

                if (navigator.vibrate) {
                    navigator.vibrate([300, 100, 300, 100, 500]);
                }
                return;
            }

            setStep('error');

            let errMsg = errData?.error || 'Failed to mark attendance.';

            if (errorCode === 'ALREADY_MARKED' || errMsg.toLowerCase().includes('already marked')) {
                errMsg = '✅ Attendance already marked for this session!\n\nYou have already successfully marked your attendance.';
                if (errData?.debug) {
                    errMsg += `\n\n[Debug: ${errData.debug.source}, session: ${errData.debug.sessionId?.substring(0, 8)}...]`;
                }
            } else if (errorCode === 'DEVICE_ALREADY_USED' || errMsg.toLowerCase().includes('device has already been used')) {
                errMsg = '📱 This device was already used by another student in this session.\n\nEach student must use their own device.';
            } else if (errData?.distance && errData?.allowedRadius) {
                errMsg = `📍 You are ${errData.distance}m away from the classroom.\n\nAllowed range: ${errData.allowedRadius}m`;
            }

            if (errData?.hint) {
                errMsg += `\n\n💡 ${errData.hint}`;
            }

            if (errData?.retryAfter) {
                errMsg += `\n\n⏱️ Please wait ${errData.retryAfter} seconds before trying again.`;
            }

            setStatusMsg(errMsg);

            if (navigator.vibrate) {
                navigator.vibrate([200, 100, 200]);
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    // Render session info card
    const renderSessionInfo = () => {
        if (!sessionInfo) return null;

        const gpsAccuracy = location?.accuracy || 30;
        const effectiveRadius = sessionInfo.radius + 30 + (gpsAccuracy > 20 ? (gpsAccuracy - 20) : 0);

        return (
            <div className="session-info">
                <h3>{sessionInfo.courseName}</h3>
                <p className="course-code">{sessionInfo.courseCode}</p>
                <div className="session-details">
                    <span className="detail">
                        📍 Radius: {sessionInfo.radius}m
                    </span>
                    <span className={`detail ${sessionInfo.isActive ? 'active' : 'inactive'}`}>
                        {sessionInfo.isActive ? '🟢 Active' : '🔴 Inactive'}
                    </span>
                </div>
                {sessionInfo.securityLevel && sessionInfo.securityLevel !== 'standard' && (
                    <span className="security-badge">
                        🔒 {sessionInfo.securityLevel.toUpperCase()} Security
                    </span>
                )}
            </div>
        );
    };

    // Render location info
    const renderLocationInfo = () => {
        if (!location) return null;

        const gpsAccuracy = location.accuracy || 30;
        const sessionRadius = sessionInfo?.radius || 50;

        const baseRadius = Math.max(sessionRadius, 50);
        const maxRadius = Math.max(400, sessionRadius + 100);
        const minimumBuffer = 30;
        const accuracyMultiplier = 1.0;
        const accuracyContribution = gpsAccuracy > 20 ? (gpsAccuracy - 20) * accuracyMultiplier : 0;

        const isMobile = /mobile|android|iphone|ipad/i.test(navigator.userAgent);
        const deviceMultiplier = isMobile ? 1.0 : 1.2;

        const adaptiveRadius = baseRadius + minimumBuffer + accuracyContribution;
        const effectiveRadius = Math.min(Math.round(adaptiveRadius * deviceMultiplier), maxRadius);
        const isWithinRange = distance <= effectiveRadius;

        return (
            <div className="location-info">
                <div className="accuracy-indicator" style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    background: gpsAccuracy > 50 ? 'rgba(255, 193, 7, 0.15)' : 'rgba(34, 197, 94, 0.15)',
                    borderRadius: '8px',
                    marginBottom: '8px'
                }}>
                    <span>🎯 GPS Accuracy</span>
                    <span style={{
                        fontWeight: 600,
                        color: gpsAccuracy > 50 ? 'var(--warning)' : 'var(--success)'
                    }}>
                        ±{Math.round(gpsAccuracy)}m {gpsAccuracy > 50 ? '(poor)' : '(good)'}
                    </span>
                </div>

                {distance !== null && (
                    <div className={`distance-status ${isWithinRange ? 'success' : 'warning'}`} style={{
                        padding: '12px',
                        background: isWithinRange ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                        borderRadius: '8px',
                        textAlign: 'center'
                    }}>
                        <p style={{ fontSize: '1.5rem', fontWeight: 700, margin: '0 0 4px 0' }}>
                            {isWithinRange ? '✅' : '⚠️'} ~{distance}m
                        </p>
                        <p style={{ fontSize: '0.8rem', margin: 0, opacity: 0.8 }}>
                            GPS-estimated distance from classroom
                        </p>
                        <p style={{ fontSize: '0.7rem', margin: '4px 0 0 0', opacity: 0.6 }}>
                            Allowed range: ~{Math.round(effectiveRadius)}m (includes GPS accuracy buffer)
                        </p>
                    </div>
                )}

                <div style={{
                    marginTop: '10px',
                    padding: '8px 10px',
                    background: 'var(--bg-surface)',
                    borderRadius: '6px',
                    fontSize: '0.7rem',
                    color: 'var(--text-muted)',
                    lineHeight: 1.4
                }}>
                    💡 <strong>Note:</strong> GPS distance is an estimate based on phone signals.
                    Indoor accuracy varies (typically ±30-100m). The system automatically adjusts
                    the allowed range based on your GPS accuracy.
                </div>
            </div>
        );
    };



    return (
        <div className="attend-page">
            <div className="attend-card">
                <h1>📋 Mark Attendance</h1>

                {renderSessionInfo()}

                <div className="status-box">
                    {/* Location Request Step (fallback path only) */}
                    {step === 'location' && (
                        <div className="loading-state">
                            <div className="spinner"></div>
                            <p>{locationStatus || "Getting your location..."}</p>
                        </div>
                    )}

                    {/* Confirm Step */}
                    {step === 'confirm' && (
                        <div className="confirm-step">
                            <div className="location-confirmed">
                                <span className="check-icon">✓</span>
                                <p>Location Acquired</p>
                            </div>
                            {renderLocationInfo()}
                            {locationStatus && <p className="location-status">{locationStatus}</p>}
                            <button
                                className="btn btn-success"
                                onClick={handleSubmit}
                                disabled={isSubmitting}
                            >
                                {isSubmitting ? (
                                    <>
                                        <span className="btn-spinner"></span>
                                        Verifying...
                                    </>
                                ) : (
                                    '✓ Confirm Attendance'
                                )}
                            </button>
                        </div>
                    )}

                    {/* Loading States */}
                    {(step === 'init' || step === 'processing') && (
                        <div className="loading-state">
                            <div className="spinner"></div>
                            <p>{statusMsg}</p>
                        </div>
                    )}

                    {/* Success State */}
                    {step === 'success' && (
                        <div className="success-message">
                            <div className="success-icon">✅</div>
                            <h2>Success!</h2>
                            <p>{statusMsg}</p>
                            <button
                                className="btn btn-secondary"
                                onClick={() => navigate('/student/dashboard')}
                            >
                                Back to Dashboard
                            </button>
                        </div>
                    )}

                    {/* Error State */}
                    {step === 'error' && (
                        <div className="error-message">
                            <div className="error-icon">❌</div>
                            <p>{statusMsg}</p>
                            <div className="error-actions">
                                <button
                                    className="btn btn-primary"
                                    onClick={() => navigate('/student/scan-qr')}
                                >
                                    Try Again
                                </button>
                                <button
                                    className="btn btn-secondary"
                                    onClick={() => navigate('/student/dashboard')}
                                >
                                    Dashboard
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Status message for non-terminal states */}
                {step !== 'success' && step !== 'error' && step !== 'processing' && step !== 'init' && step !== 'blocked' && (
                    <p className="status-text">{statusMsg}</p>
                )}

                {/* Security indicator */}
                <div className="security-footer">
                    <small>🔒 Secured with device binding & location verification</small>
                </div>
            </div>

            {/* Security Block Overlay */}
            {isSecurityBlocked && (
                <ProxyWarning
                    isBlocked={securityError?.isBlocked}
                    reason={securityError?.message}
                    onGoBack={() => navigate('/student/dashboard')}
                />
            )}
        </div>
    );
};

export default Attend;

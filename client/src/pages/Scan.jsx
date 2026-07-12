import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Html5Qrcode } from 'html5-qrcode';
import './Scan.css';

/**
 * QR Scanner Component
 * Scans the rotating QR codes displayed by professors
 *
 * Flow (v5.0):
 * 1. Page loads -> request GPS location FIRST
 * 2. Location acquired -> "Start Camera" becomes available
 * 3. Student scans QR -> navigate to /student/attend with the
 *    already-captured location passed via router state
 *
 * New QR Format (v4.0):
 * {
 *   s: sessionId,      // Session ID
 *   t: token,          // HMAC token
 *   n: nonce,          // Rotating nonce
 *   ts: timestamp,     // Token generation timestamp
 *   e: expiresAt       // Token expiry timestamp
 * }
 */

const Scan = () => {
    const [scanning, setScanning] = useState(false);
    const [error, setError] = useState('');
    const [scanStatus, setScanStatus] = useState('');
    const scannerRef = useRef(null);
    const navigate = useNavigate();

    // ====================================
    // LOCATION STATE (fetched before scanning is allowed)
    // ====================================
    const [locationStep, setLocationStep] = useState('requesting'); // requesting | acquired | error
    const [locationStatus, setLocationStatus] = useState('');
    const [locationError, setLocationError] = useState('');
    const [location, setLocation] = useState(null);

    useEffect(() => {
        return () => {
            if (scannerRef.current) {
                scannerRef.current.stop().catch(() => { });
            }
        };
    }, []);

    // Request location as soon as the scan page mounts
    useEffect(() => {
        requestLocation();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const finalizeLocation = (locationData, samples) => {
        const finalLocation = samples && samples.length > 0
            ? { ...locationData, samples }
            : locationData;

        setLocation(finalLocation);
        setLocationStep('acquired');
        setLocationStatus(
            `✅ Location acquired${locationData.accuracy ? ` (±${Math.round(locationData.accuracy)}m)` : ''}`
        );

        if (navigator.vibrate) {
            navigator.vibrate([100, 50, 100]);
        }
    };

    const handleLocationError = (err) => {
        setLocationStep('error');
        switch (err.code) {
            case err.PERMISSION_DENIED:
                setLocationError('📍 Location permission denied. You must enable GPS to scan the attendance QR code.');
                break;
            case err.POSITION_UNAVAILABLE:
                setLocationError('📍 GPS signal unavailable. Please check your location settings and try again.');
                break;
            case err.TIMEOUT:
                setLocationError('📍 Location request timed out. Please move to an area with better GPS signal.');
                break;
            default:
                setLocationError('📍 Unable to get your location. Please try again.');
        }
    };

    // Multi-sample GPS collection (moved here from Attend.jsx so location
    // is ready BEFORE the QR scanner is allowed to start)
    const requestLocation = useCallback(() => {
        setLocationStep('requesting');
        setLocationError('');
        setLocationStatus('📡 Acquiring GPS signal...');

        if (!navigator.geolocation) {
            setLocationStep('error');
            setLocationError('Geolocation is not supported by your browser.');
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
                () => {
                    // Don't fail on individual sample errors, keep collecting
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
                // Fallback to a single location request
                navigator.geolocation.getCurrentPosition(
                    (position) => {
                        const { coords } = position;
                        finalizeLocation({
                            latitude: coords.latitude,
                            longitude: coords.longitude,
                            accuracy: coords.accuracy,
                            altitude: coords.altitude,
                            altitudeAccuracy: coords.altitudeAccuracy,
                            heading: coords.heading,
                            speed: coords.speed,
                            timestamp: position.timestamp
                        }, []);
                    },
                    handleLocationError,
                    { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
                );
            } else {
                finalizeLocation(bestSample, samples);
            }
        }, collectionDuration + 500);
    }, []);

    const startScanner = async () => {
        if (locationStep !== 'acquired') {
            // Should not happen since the button is disabled, but guard anyway
            return;
        }

        setError('');
        setScanStatus('Starting camera...');
        setScanning(true);

        try {
            const scanner = new Html5Qrcode('qr-reader');
            scannerRef.current = scanner;

            await scanner.start(
                { facingMode: 'environment' },
                {
                    fps: 10,
                    qrbox: { width: 250, height: 250 },
                    aspectRatio: 1
                },
                (decodedText) => {
                    handleScan(decodedText, scanner);
                },
                (error) => {
                    // QR not found, continue scanning
                }
            );
            setScanStatus('Point camera at QR code...');
        } catch (err) {
            setScanning(false);
            if (err.toString().includes('Permission')) {
                setError('Camera permission denied. Please allow camera access.');
            } else {
                setError('Failed to start camera. Please try again.');
            }
        }
    };

    const handleScan = async (data, scanner) => {
        try {
            await scanner.stop();
            scannerRef.current = null;
            setScanStatus('Processing QR code...');

            let sessionId, token, nonce, timestamp;

            // ====================================
            // PARSE QR DATA (Multiple Formats)
            // ====================================

            // 1. Try New Enhanced JSON Format (v4.0 - with nonce & timestamp)
            try {
                const parsed = JSON.parse(data);

                if (parsed.s && parsed.t) {
                    sessionId = parsed.s;
                    token = parsed.t;

                    if (parsed.n) nonce = parsed.n;
                    if (parsed.ts) timestamp = parsed.ts;

                    if (parsed.e && Date.now() > parsed.e) {
                        setError('QR code has expired. Please ask professor to refresh.');
                        setScanning(false);
                        return;
                    }
                }
            } catch (e) {
                // Not JSON, try other formats
            }

            // 2. Try URL Format (Legacy)
            if (!sessionId) {
                try {
                    const url = new URL(data);
                    const params = new URLSearchParams(url.search);
                    sessionId = params.get('session');
                    token = params.get('token');
                    nonce = params.get('nonce');
                    timestamp = params.get('ts');
                } catch (e) {
                    // Not URL
                }
            }

            // 3. Try Pipe Format (Very Legacy)
            if (!sessionId) {
                const parts = data.split('|');
                if (parts.length >= 2) {
                    sessionId = parts[0];
                    token = parts[1];
                    if (parts.length >= 3) nonce = parts[2];
                    if (parts.length >= 4) timestamp = parts[3];
                }
            }

            // ====================================
            // NAVIGATE TO ATTENDANCE PAGE
            // ====================================
            if (sessionId && token) {
                const params = new URLSearchParams({
                    session: sessionId,
                    token: token
                });

                if (nonce) params.append('nonce', nonce);
                if (timestamp) params.append('ts', timestamp);

                // Pass the already-captured location via router state
                // (keeps raw GPS coordinates out of the URL)
                navigate(`/student/attend?${params.toString()}`, {
                    state: { location }
                });
            } else {
                setError('Invalid QR code format. Please scan a valid attendance QR.');
                setScanning(false);
            }
        } catch (err) {
            setError('Failed to process QR code. Please try again.');
            setScanning(false);
        }
    };

    const stopScanner = async () => {
        if (scannerRef.current) {
            await scannerRef.current.stop().catch(() => { });
            scannerRef.current = null;
        }
        setScanning(false);
        setScanStatus('');
    };

    return (
        <div className="scan-page">
            <div className="scan-container animate-fade-in-up">
                <div className="scan-header">
                    <h1>📷 Scan QR Code</h1>
                    <p>Point your camera at the Professor's screen</p>
                </div>

                {/* Location gate - must complete before scanning is allowed */}
                {locationStep !== 'acquired' && (
                    <div className="alert alert-error" style={{ marginBottom: '12px' }}>
                        {locationStep === 'requesting' && (
                            <div className="loading-state" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <div className="spinner"></div>
                                <p style={{ margin: 0 }}>{locationStatus || 'Getting your location...'}</p>
                            </div>
                        )}
                        {locationStep === 'error' && (
                            <div>
                                <p style={{ margin: '0 0 8px 0' }}>{locationError}</p>
                                <button className="btn btn-primary" onClick={requestLocation}>
                                    📍 Retry Location
                                </button>
                            </div>
                        )}
                    </div>
                )}

                {locationStep === 'acquired' && (
                    <p className="scan-status" style={{ marginBottom: '12px' }}>{locationStatus}</p>
                )}

                <div className="scanner-wrapper">
                    <div id="qr-reader"></div>

                    {!scanning && (
                        <div className="scanner-placeholder">
                            <div className="camera-icon">📷</div>
                            <p>Camera not active</p>
                        </div>
                    )}
                </div>

                {scanStatus && <p className="scan-status">{scanStatus}</p>}
                {error && <div className="alert alert-error">{error}</div>}

                <div className="scan-actions">
                    {!scanning ? (
                        <button
                            className="btn btn-primary"
                            onClick={startScanner}
                            disabled={locationStep !== 'acquired'}
                            title={locationStep !== 'acquired' ? 'Waiting for location...' : ''}
                        >
                            🎥 Start Camera
                        </button>
                    ) : (
                        <button className="btn btn-secondary" onClick={stopScanner}>
                            ⏹ Stop Scanning
                        </button>
                    )}
                </div>

                <div className="scan-tips">
                    <h4>Tips for successful scanning:</h4>
                    <ul>
                        <li>✓ Ensure good lighting</li>
                        <li>✓ Hold phone steady</li>
                        <li>✓ Keep QR code within the frame</li>
                        <li>✓ QR codes rotate every 30 seconds</li>
                    </ul>
                </div>
            </div>
        </div>
    );
};

export default Scan;

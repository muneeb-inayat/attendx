import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Html5Qrcode } from 'html5-qrcode';
import './Scan.css';

/**
 * QR Scanner Component
 * Scans the rotating QR codes displayed by professors
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

    useEffect(() => {
        return () => {
            if (scannerRef.current) {
                scannerRef.current.stop().catch(() => { });
            }
        };
    }, []);

    const startScanner = async () => {
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

                    // Enhanced security fields
                    if (parsed.n) nonce = parsed.n;
                    if (parsed.ts) timestamp = parsed.ts;

                    // Check if token might be expired (client-side pre-check)
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
                // Build query string with all available data
                const params = new URLSearchParams({
                    session: sessionId,
                    token: token
                });

                // Add enhanced security params if available
                if (nonce) params.append('nonce', nonce);
                if (timestamp) params.append('ts', timestamp);

                navigate(`/student/attend?${params.toString()}`);
            } else {
                setError('Invalid QR code format. Please scan a valid attendance QR.');
                setScanning(false);
            }
        } catch (err) {
            // QR parse error - handled by UI
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
                        <button className="btn btn-primary" onClick={startScanner}>
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

import { useState, useEffect } from 'react';
import './SecurityAlert.css';

/**
 * SecurityAlert Component
 * Shows security warnings and blocks for proxy attendance detection
 */

const SecurityAlert = ({
    type = 'warning', // 'warning', 'error', 'blocked', 'success'
    title,
    message,
    details = null,
    code = null,
    onDismiss = null,
    autoDismiss = false,
    dismissDelay = 5000,
    icon = null
}) => {
    const [visible, setVisible] = useState(true);
    const [isExiting, setIsExiting] = useState(false);

    useEffect(() => {
        if (autoDismiss && type !== 'blocked' && type !== 'error') {
            const timer = setTimeout(() => {
                handleDismiss();
            }, dismissDelay);
            return () => clearTimeout(timer);
        }
    }, [autoDismiss, dismissDelay, type]);

    const handleDismiss = () => {
        setIsExiting(true);
        setTimeout(() => {
            setVisible(false);
            if (onDismiss) onDismiss();
        }, 300);
    };

    if (!visible) return null;

    const getIcon = () => {
        if (icon) return icon;
        switch (type) {
            case 'blocked':
                return '🚫';
            case 'error':
                return '❌';
            case 'warning':
                return '⚠️';
            case 'success':
                return '✅';
            default:
                return '📢';
        }
    };

    const getTitle = () => {
        if (title) return title;
        switch (type) {
            case 'blocked':
                return 'Access Blocked';
            case 'error':
                return 'Error';
            case 'warning':
                return 'Security Warning';
            case 'success':
                return 'Success';
            default:
                return 'Notice';
        }
    };

    return (
        <div className={`security-alert security-alert-${type} ${isExiting ? 'exiting' : ''}`}>
            <div className="security-alert-icon">
                {getIcon()}
            </div>

            <div className="security-alert-content">
                <h4 className="security-alert-title">{getTitle()}</h4>
                <p className="security-alert-message">{message}</p>

                {details && (
                    <div className="security-alert-details">
                        {details}
                    </div>
                )}

                {code && (
                    <span className="security-alert-code">
                        Error Code: {code}
                    </span>
                )}
            </div>

            {onDismiss && type !== 'blocked' && (
                <button
                    className="security-alert-dismiss"
                    onClick={handleDismiss}
                    aria-label="Dismiss"
                >
                    ✕
                </button>
            )}
        </div>
    );
};

/**
 * ProxyWarning - Specific component for proxy attendance warnings
 */
export const ProxyWarning = ({ isBlocked = false, reason, onGoBack }) => {
    return (
        <div className="proxy-warning-container">
            <div className={`proxy-warning ${isBlocked ? 'blocked' : 'warning'}`}>
                <div className="proxy-warning-icon">
                    {isBlocked ? '🚫' : '⚠️'}
                </div>

                <h2 className="proxy-warning-title">
                    {isBlocked ? 'Attendance Blocked' : 'Security Alert'}
                </h2>

                <p className="proxy-warning-message">
                    {reason || (isBlocked
                        ? 'This device is registered to another student. You cannot mark attendance on someone else\'s device.'
                        : 'Suspicious activity detected. Your attendance has been flagged for review.'
                    )}
                </p>

                <div className="proxy-warning-info">
                    <div className="proxy-warning-info-item">
                        <span className="info-icon">📱</span>
                        <span>Each student must use their own registered device</span>
                    </div>
                    <div className="proxy-warning-info-item">
                        <span className="info-icon">📍</span>
                        <span>You must be physically present in the classroom</span>
                    </div>
                    <div className="proxy-warning-info-item">
                        <span className="info-icon">🔒</span>
                        <span>All attendance attempts are logged and monitored</span>
                    </div>
                </div>

                {isBlocked && (
                    <div className="proxy-warning-consequences">
                        <h4>⚠️ Consequences of Proxy Attendance:</h4>
                        <ul>
                            <li>Immediate attendance rejection</li>
                            <li>Report generated for faculty review</li>
                            <li>Potential disciplinary action</li>
                        </ul>
                    </div>
                )}

                {onGoBack && (
                    <button className="btn btn-primary" onClick={onGoBack}>
                        ← Go Back
                    </button>
                )}
            </div>
        </div>
    );
};

/**
 * DeviceWarning - Shows when device ownership conflicts detected
 */
export const DeviceWarning = ({ ownerName, ownerRollNo, onUseOwnDevice }) => {
    return (
        <div className="device-warning">
            <div className="device-warning-header">
                <span className="device-warning-icon">📱</span>
                <h3>Device Already Registered</h3>
            </div>

            <p className="device-warning-message">
                This device is registered to <strong>{ownerName || 'another student'}</strong>
                {ownerRollNo && <span className="roll-no"> (Roll No: {ownerRollNo})</span>}
            </p>

            <p className="device-warning-instruction">
                Please use your own device to mark attendance. Sharing devices for attendance is not allowed.
            </p>

            <button className="btn btn-secondary" onClick={onUseOwnDevice}>
                I understand, use my device
            </button>
        </div>
    );
};

export default SecurityAlert;

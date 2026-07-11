import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'react-toastify';
import { useAuth } from '../../context/AuthContext';
import API_URL from '../../config/api';
import './SessionLive.css';

/**
 * Live Session Management (Professor)
 * Premium QR code display with real-time attendance tracking
 */

const SessionLive = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { token } = useAuth();

    const [session, setSession] = useState(null);
    const [qrCode, setQrCode] = useState('');
    const [qrExpiry, setQrExpiry] = useState(null);
    const [countdown, setCountdown] = useState(30);
    const [stats, setStats] = useState({ validCount: 0, lateCount: 0, totalCount: 0, suspicious: 0 });
    const [attendees, setAttendees] = useState([]);
    const [failedAttempts, setFailedAttempts] = useState([]);
    const [isActive, setIsActive] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isRefreshingLocation, setIsRefreshingLocation] = useState(false);
    const [acceptingId, setAcceptingId] = useState(null);
    const [showAttendeesPanel, setShowAttendeesPanel] = useState(false);
    const [loading, setLoading] = useState(true);

    const pollingRef = useRef(null);
    const countdownRef = useRef(null);

    useEffect(() => {
        fetchSessionDetails();
        fetchQR();

        // Start polling for stats every 5 seconds
        pollingRef.current = setInterval(() => {
            fetchStats();
            fetchFailedAttempts();
        }, 5000);

        return () => {
            clearInterval(pollingRef.current);
            clearInterval(countdownRef.current);
        };
    }, [id]);

    // Countdown timer for QR refresh
    useEffect(() => {
        if (qrExpiry && isActive) {
            clearInterval(countdownRef.current);

            countdownRef.current = setInterval(() => {
                const remaining = Math.max(0, Math.floor((qrExpiry - Date.now()) / 1000));
                setCountdown(remaining);

                // Auto-refresh when expired
                if (remaining <= 0) {
                    fetchQR();
                }
            }, 1000);
        }

        return () => clearInterval(countdownRef.current);
    }, [qrExpiry, isActive]);

    const fetchSessionDetails = async () => {
        try {
            const res = await axios.get(`${API_URL}/sessions/${id}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setSession(res.data.data);
            setIsActive(res.data.data.isActive);
            setLoading(false);
        } catch (error) {
            toast.error('Failed to load session');
            setLoading(false);
        }
    };

    const fetchQR = useCallback(async () => {
        if (!isActive) return;

        try {
            const res = await axios.get(`${API_URL}/sessions/${id}/qr`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setQrCode(res.data.data.qrCode);
            setQrExpiry(new Date(res.data.data.expiresAt).getTime());
            setCountdown(Math.floor(res.data.data.remainingMs / 1000));
        } catch (error) {
            if (error.response?.data?.error === 'Session has ended') {
                setIsActive(false);
            }
        }
    }, [id, token, isActive]);

    const fetchStats = async () => {
        try {
            const res = await axios.get(`${API_URL}/attendance/session/${id}`, {
                headers: { Authorization: `Bearer ${token}` }
            });

            const data = res.data.data || [];
            setAttendees(data);
            setStats({
                validCount: data.filter(a => a.status === 'PRESENT').length,
                lateCount: data.filter(a => a.status === 'LATE').length,
                suspicious: data.filter(a =>
                    a.status === 'SUSPICIOUS' ||
                    (a.securityFlags && a.securityFlags.length > 0)
                ).length,
                totalCount: data.length
            });
        } catch (error) {
            // Silent fail for stats polling
        }
    };

    const fetchFailedAttempts = async () => {
        try {
            const res = await axios.get(`${API_URL}/attendance/session/${id}/failed-attempts`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setFailedAttempts(res.data.data?.filter(a => a.status === 'PENDING') || []);
        } catch (error) {
            // Silent fail for polling
        }
    };

    const handleAcceptStudent = async (attemptId, studentName) => {
        if (!confirm(`Accept attendance for ${studentName}?`)) return;

        setAcceptingId(attemptId);
        try {
            await axios.post(`${API_URL}/attendance/failed-attempt/${attemptId}/accept`, {
                note: 'Manually accepted during live session'
            }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            toast.success(`Attendance marked for ${studentName}`);
            fetchStats();
            fetchFailedAttempts();
        } catch (error) {
            toast.error(error.response?.data?.error || 'Failed to accept');
        }
        setAcceptingId(null);
    };

    const handleRejectStudent = async (attemptId, studentName) => {
        if (!confirm(`Reject attendance for ${studentName}? They will be marked as ABSENT.`)) return;

        setAcceptingId(attemptId);
        try {
            await axios.post(`${API_URL}/attendance/failed-attempt/${attemptId}/reject`, {
                reason: 'Rejected - location too far from classroom'
            }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            toast.info(`Attendance rejected for ${studentName}`);
            fetchFailedAttempts();
        } catch (error) {
            toast.error(error.response?.data?.error || 'Failed to reject');
        }
        setAcceptingId(null);
    };

    const handleAcceptAll = async () => {
        if (!confirm(`Accept ALL ${failedAttempts.length} students who were too far away?`)) return;

        try {
            const res = await axios.post(`${API_URL}/attendance/session/${id}/failed-attempts/accept-all`, {
                note: 'Bulk accepted during live session'
            }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            toast.success(res.data.message || `Accepted ${failedAttempts.length} students`);
            fetchStats();
            fetchFailedAttempts();
        } catch (error) {
            toast.error(error.response?.data?.error || 'Failed to accept all');
        }
    };

    const handleRejectAll = async () => {
        if (!confirm(`Reject ALL ${failedAttempts.length} students? They will NOT receive attendance.`)) return;

        try {
            const res = await axios.post(`${API_URL}/attendance/session/${id}/failed-attempts/reject-all`, {
                reason: 'Bulk rejected - location too far from classroom'
            }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            toast.info(res.data.message || `Rejected ${failedAttempts.length} students`);
            fetchFailedAttempts();
        } catch (error) {
            toast.error(error.response?.data?.error || 'Failed to reject all');
        }
    };

    const handleForceRefresh = async () => {
        setIsRefreshing(true);
        try {
            const res = await axios.post(`${API_URL}/sessions/${id}/refresh-qr`, {}, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setQrCode(res.data.data.qrCode);
            setQrExpiry(new Date(res.data.data.expiresAt).getTime());
            setCountdown(30);
            toast.success('QR code refreshed!');
        } catch (error) {
            toast.error('Failed to refresh QR');
        }
        setIsRefreshing(false);
    };

    const handleRefreshLocation = () => {
        if (!navigator.geolocation) {
            toast.error('Geolocation not supported');
            return;
        }
        setIsRefreshingLocation(true);
        navigator.geolocation.getCurrentPosition(
            async (pos) => {
                try {
                    const res = await axios.put(`${API_URL}/sessions/${id}/settings`, {
                        centerLat: pos.coords.latitude,
                        centerLng: pos.coords.longitude
                    }, {
                        headers: { Authorization: `Bearer ${token}` }
                    });
                    setSession(res.data.data);
                    toast.success('Location updated successfully!');
                } catch (error) {
                    toast.error('Failed to update location');
                }
                setIsRefreshingLocation(false);
            },
            (err) => {
                toast.error('Failed to get location - check permissions');
                setIsRefreshingLocation(false);
            },
            { enableHighAccuracy: true, timeout: 15000 }
        );
    };

    const handleStopSession = async () => {
        if (!confirm('Stop this session? Students will no longer be able to mark attendance.')) return;
        try {
            await axios.put(`${API_URL}/sessions/${id}/stop`, {}, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setIsActive(false);
            clearInterval(pollingRef.current);
            clearInterval(countdownRef.current);
            toast.success('Session stopped successfully!');
            navigate('/professor/dashboard', { state: { refresh: true } });
        } catch (error) {
            toast.error('Failed to stop session');
        }
    };

    const getStatusBadge = (status) => {
        switch (status) {
            case 'PRESENT': return 'present';
            case 'LATE': return 'late';
            case 'SUSPICIOUS': return 'suspicious';
            default: return 'default';
        }
    };

    const getCountdownColor = () => {
        if (countdown <= 5) return 'critical';
        if (countdown <= 10) return 'warning';
        return 'normal';
    };

    // Calculate session duration
    const getSessionDuration = () => {
        if (!session?.startTime) return '0:00';
        const start = new Date(session.startTime);
        const now = new Date();
        const diff = Math.floor((now - start) / 1000);
        const hours = Math.floor(diff / 3600);
        const mins = Math.floor((diff % 3600) / 60);
        const secs = diff % 60;
        if (hours > 0) return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    if (loading) {
        return (
            <div className="session-live-page loading-state">
                <div className="loading-content">
                    <div className="loading-spinner"></div>
                    <p>Loading session...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="session-live-page">
            {/* Header */}
            <header className="live-header">
                <div className="header-left">
                    <button className="btn-back" onClick={() => navigate('/professor/dashboard')}>
                        ← Back
                    </button>
                    <div className="session-title">
                        <h1>{session?.course?.courseName || 'Live Session'}</h1>
                        <div className="title-meta">
                            <span className="course-code">{session?.course?.courseCode}</span>
                            {session?.sessionNumber && (
                                <span className="session-number">Session #{session.sessionNumber}</span>
                            )}
                        </div>
                    </div>
                </div>
                <div className="header-right">
                    {isActive ? (
                        <div className="live-indicator">
                            <span className="live-dot"></span>
                            <span className="live-text">LIVE</span>
                        </div>
                    ) : (
                        <div className="ended-indicator">
                            <span className="ended-text">ENDED</span>
                        </div>
                    )}
                </div>
            </header>

            <main className="live-content">
                {/* QR Section */}
                <section className="qr-section">
                    <div className="qr-container">
                        {isActive ? (
                            <>
                                <div className="qr-frame">
                                    {qrCode ? (
                                        <img src={qrCode} alt="Attendance QR Code" className="qr-image" />
                                    ) : (
                                        <div className="qr-loading">
                                            <div className="spinner"></div>
                                            <p>Generating QR...</p>
                                        </div>
                                    )}
                                    <div className={`countdown-ring ${getCountdownColor()}`}>
                                        <svg viewBox="0 0 36 36">
                                            <path
                                                d="M18 2.0845
                                                   a 15.9155 15.9155 0 0 1 0 31.831
                                                   a 15.9155 15.9155 0 0 1 0 -31.831"
                                                fill="none"
                                                stroke="currentColor"
                                                strokeOpacity="0.2"
                                                strokeWidth="2"
                                            />
                                            <path
                                                d="M18 2.0845
                                                   a 15.9155 15.9155 0 0 1 0 31.831
                                                   a 15.9155 15.9155 0 0 1 0 -31.831"
                                                fill="none"
                                                stroke="currentColor"
                                                strokeWidth="2"
                                                strokeDasharray={`${(countdown / 30) * 100}, 100`}
                                                strokeLinecap="round"
                                            />
                                        </svg>
                                        <span className="countdown-value">{countdown}s</span>
                                    </div>
                                </div>

                                <div className="qr-actions">
                                    <button
                                        className="btn-refresh"
                                        onClick={handleForceRefresh}
                                        disabled={isRefreshing}
                                    >
                                        {isRefreshing ? (
                                            <span className="btn-spinner"></span>
                                        ) : (
                                            <span className="refresh-icon">🔄</span>
                                        )}
                                        <span>{isRefreshing ? 'Refreshing...' : 'Refresh QR'}</span>
                                    </button>
                                    <button
                                        className="btn-refresh btn-location"
                                        onClick={handleRefreshLocation}
                                        disabled={isRefreshingLocation}
                                    >
                                        {isRefreshingLocation ? (
                                            <span className="btn-spinner"></span>
                                        ) : (
                                            <span className="refresh-icon">📍</span>
                                        )}
                                        <span>{isRefreshingLocation ? 'Updating...' : 'Refresh Location'}</span>
                                    </button>
                                    <button
                                        className="btn-stop"
                                        onClick={handleStopSession}
                                    >
                                        <span className="stop-icon">⏹</span>
                                        <span>Stop Session</span>
                                    </button>
                                </div>

                                <div className="qr-info">
                                    <p className="security-note">
                                        🔐 QR rotates every {session?.qrRotationInterval ? Math.round(session.qrRotationInterval / 1000) : 30}s with HMAC security
                                    </p>
                                    <div className="session-params">
                                        <span className="param">📍 Radius: {session?.radius || 150}m</span>
                                        <span className="param">⏱ Duration: {getSessionDuration()}</span>
                                        {session?.securityLevel && session.securityLevel !== 'standard' && (
                                            <span className="param security">🔒 {session.securityLevel.toUpperCase()}</span>
                                        )}
                                    </div>
                                </div>
                            </>
                        ) : (
                            <div className="session-ended-display">
                                <div className="ended-icon">⏹</div>
                                <h2>Session Ended</h2>
                                <p>This session has been stopped</p>
                                <button
                                    className="btn-primary"
                                    onClick={() => navigate('/professor/dashboard')}
                                >
                                    ← Back to Dashboard
                                </button>
                            </div>
                        )}
                    </div>
                </section>

                {/* Stats Section */}
                <section className="stats-section">
                    <div className="stats-grid">
                        <div className="stat-card present">
                            <div className="stat-icon">✓</div>
                            <div className="stat-info">
                                <span className="stat-value">{stats.validCount}</span>
                                <span className="stat-label">Present</span>
                            </div>
                        </div>
                        <div className="stat-card late">
                            <div className="stat-icon">⏰</div>
                            <div className="stat-info">
                                <span className="stat-value">{stats.lateCount}</span>
                                <span className="stat-label">Late</span>
                            </div>
                        </div>
                        <div className="stat-card flagged">
                            <div className="stat-icon">⚠️</div>
                            <div className="stat-info">
                                <span className="stat-value">{stats.suspicious}</span>
                                <span className="stat-label">Flagged</span>
                            </div>
                        </div>
                        <div className="stat-card total">
                            <div className="stat-icon">👥</div>
                            <div className="stat-info">
                                <span className="stat-value">{stats.totalCount}</span>
                                <span className="stat-label">Total</span>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Failed Attempts Section */}
                {failedAttempts.length > 0 && (
                    <section className="failed-section">
                        <div className="section-header">
                            <div className="section-title-group">
                                <h3>⚠️ Needs Review</h3>
                                <span className="count-badge">{failedAttempts.length}</span>
                            </div>
                            <div className="bulk-actions">
                                <button
                                    className="btn-bulk btn-accept-all"
                                    onClick={handleAcceptAll}
                                    title="Accept all pending students"
                                >
                                    ✓ Accept All
                                </button>
                                <button
                                    className="btn-bulk btn-reject-all"
                                    onClick={handleRejectAll}
                                    title="Reject all pending students"
                                >
                                    ✗ Reject All
                                </button>
                            </div>
                        </div>
                        <p className="section-hint">Students who tried but were too far away</p>
                        <div className="failed-list">
                            {failedAttempts.map(attempt => (
                                <div key={attempt._id} className="failed-card">
                                    <div className="failed-info">
                                        <div className="student-avatar">
                                            {attempt.studentName?.charAt(0) || '?'}
                                        </div>
                                        <div className="student-details">
                                            <span className="student-name">{attempt.studentName}</span>
                                            <span className="student-roll">{attempt.rollNo}</span>
                                        </div>
                                    </div>
                                    <div className="failed-meta">
                                        <span className="distance-badge">
                                            {Math.round(attempt.distance || 0)}m away
                                        </span>
                                        <span className="attempt-time">
                                            {new Date(attempt.attemptedAt).toLocaleTimeString('en-IN', {
                                                hour: '2-digit',
                                                minute: '2-digit'
                                            })}
                                        </span>
                                    </div>
                                    <div className="action-buttons">
                                        <button
                                            className="btn-accept"
                                            onClick={() => handleAcceptStudent(attempt._id, attempt.studentName)}
                                            disabled={acceptingId === attempt._id}
                                            title="Accept this student's attendance"
                                        >
                                            {acceptingId === attempt._id ? '...' : '✓ Accept'}
                                        </button>
                                        <button
                                            className="btn-reject"
                                            onClick={() => handleRejectStudent(attempt._id, attempt.studentName)}
                                            disabled={acceptingId === attempt._id}
                                            title="Reject - student will be marked absent"
                                        >
                                            {acceptingId === attempt._id ? '...' : '✗ Reject'}
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>
                )}

                {/* Attendees Section */}
                <section className="attendees-section">
                    <div className="section-header">
                        <h3>👥 Live Attendance</h3>
                        <button
                            className="btn-toggle-panel"
                            onClick={() => setShowAttendeesPanel(!showAttendeesPanel)}
                        >
                            {showAttendeesPanel ? 'Hide' : 'Show All'}
                        </button>
                    </div>

                    {attendees.length === 0 ? (
                        <div className="empty-attendees">
                            <span className="empty-icon">👀</span>
                            <p>Waiting for students to mark attendance...</p>
                        </div>
                    ) : (
                        <>
                            {/* Recent Attendees Preview */}
                            <div className="attendees-preview">
                                {attendees.slice(0, 5).map((a, idx) => (
                                    <div
                                        key={a._id}
                                        className="attendee-bubble"
                                        style={{ '--delay': `${idx * 0.1}s` }}
                                        title={`${a.studentName} - ${a.status}`}
                                    >
                                        {a.studentName?.charAt(0)}
                                    </div>
                                ))}
                                {attendees.length > 5 && (
                                    <div className="attendee-more">
                                        +{attendees.length - 5}
                                    </div>
                                )}
                            </div>

                            {/* Full Attendees List */}
                            {showAttendeesPanel && (
                                <div className="attendees-list">
                                    {attendees.map(a => (
                                        <div
                                            key={a._id}
                                            className={`attendee-row ${a.securityFlags?.length > 0 ? 'flagged' : ''}`}
                                        >
                                            <div className="attendee-avatar">
                                                {a.studentName?.charAt(0)}
                                            </div>
                                            <div className="attendee-info">
                                                <span className="attendee-name">{a.studentName}</span>
                                                <span className="attendee-roll">{a.rollNo}</span>
                                            </div>
                                            <span className={`status-badge ${getStatusBadge(a.status)}`}>
                                                {a.status}
                                            </span>
                                            <span className="attendee-distance">{a.distance}m</span>
                                            <span className="attendee-time">
                                                {new Date(a.timestamp).toLocaleTimeString('en-IN', {
                                                    hour: '2-digit',
                                                    minute: '2-digit'
                                                })}
                                            </span>
                                            {a.securityFlags?.length > 0 && (
                                                <span className="flag-icon" title={a.securityFlags.join(', ')}>
                                                    ⚠️
                                                </span>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </>
                    )}
                </section>
            </main>

            {/* Mobile Bottom Bar */}
            <div className="mobile-bottom-bar">
                <div className="mobile-stats">
                    <span className="mobile-stat present">✓ {stats.validCount}</span>
                    <span className="mobile-stat late">⏰ {stats.lateCount}</span>
                    <span className="mobile-stat total">👥 {stats.totalCount}</span>
                </div>
                {isActive ? (
                    <button className="btn-mobile-stop" onClick={handleStopSession}>
                        ⏹ Stop
                    </button>
                ) : (
                    <button className="btn-mobile-back" onClick={() => navigate('/professor/dashboard')}>
                        ← Back
                    </button>
                )}
            </div>
        </div>
    );
};

export default SessionLive;

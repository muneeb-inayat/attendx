import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import API_URL from '../../config/api';
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    BarElement,
    Title,
    Tooltip,
    Legend,
    ArcElement
} from 'chart.js';
import { Bar, Doughnut } from 'react-chartjs-2';
import './SessionDetail.css';

ChartJS.register(
    CategoryScale,
    LinearScale,
    BarElement,
    Title,
    Tooltip,
    Legend,
    ArcElement
);

const SessionDetail = () => {
    const { id } = useParams();
    const { token } = useAuth();

    const [session, setSession] = useState(null);
    const [attendance, setAttendance] = useState([]);
    const [stats, setStats] = useState(null);
    const [qrCode, setQrCode] = useState('');
    const [staticQrCode, setStaticQrCode] = useState('');
    const [loading, setLoading] = useState(true);
    const [showQR, setShowQR] = useState(false);
    const [isStaticQR, setIsStaticQR] = useState(false);
    const [updating, setUpdating] = useState(false);
    const [updateMessage, setUpdateMessage] = useState('');

    const qrRefreshInterval = useRef(null);

    useEffect(() => {
        fetchSessionData();
        return () => {
            if (qrRefreshInterval.current) {
                clearInterval(qrRefreshInterval.current);
            }
        };
    }, [id]);

    const fetchSessionData = async () => {
        try {
            const [sessionRes, attendanceRes] = await Promise.all([
                axios.get(`${API_URL}/sessions/${id}`, {
                    headers: { Authorization: `Bearer ${token}` }
                }),
                axios.get(`${API_URL}/attendance/${id}`, {
                    headers: { Authorization: `Bearer ${token}` }
                })
            ]);

            setSession(sessionRes.data.data);
            setAttendance(attendanceRes.data.data);
            setStats(attendanceRes.data.stats);
        } catch (error) {
            console.error('Failed to fetch session data:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchQRCode = async () => {
        try {
            const res = await axios.get(`${API_URL}/sessions/${id}/qr`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setQrCode(res.data.data.qrCode);
        } catch (error) {
            console.error('Failed to fetch QR code:', error);
        }
    };

    const startQRDisplay = () => {
        setShowQR(true);
        fetchQRCode();
        // Refresh QR every 25 seconds (before 30s expiry)
        qrRefreshInterval.current = setInterval(fetchQRCode, 25000);
    };

    const stopQRDisplay = () => {
        setShowQR(false);
        if (qrRefreshInterval.current) {
            clearInterval(qrRefreshInterval.current);
        }
    };

    const fetchStaticQR = async () => {
        try {
            const res = await axios.get(`${API_URL}/sessions/${id}/static-qr`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setStaticQrCode(res.data.data.qrCode);
        } catch (error) {
            console.error('Failed to fetch static QR:', error);
        }
    };

    const toggleQRMode = () => {
        if (!isStaticQR) {
            // Switching to static mode
            if (qrRefreshInterval.current) {
                clearInterval(qrRefreshInterval.current);
            }
            fetchStaticQR();
        } else {
            // Switching back to dynamic mode
            fetchQRCode();
            qrRefreshInterval.current = setInterval(fetchQRCode, 25000);
        }
        setIsStaticQR(!isStaticQR);
    };

    const downloadQR = () => {
        const qrToDownload = isStaticQR ? staticQrCode : qrCode;
        if (!qrToDownload) return;

        const link = document.createElement('a');
        link.href = qrToDownload;
        link.download = `QR-${session?.courseName || 'session'}-${isStaticQR ? 'static' : 'dynamic'}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const exportCSV = async () => {
        try {
            const response = await axios.get(`${API_URL}/attendance/${id}/export`, {
                headers: { Authorization: `Bearer ${token}` },
                responseType: 'blob'
            });

            const url = window.URL.createObjectURL(new Blob([response.data]));
            const a = document.createElement('a');
            a.href = url;
            a.download = `attendance-${session?.courseName || id}.csv`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Failed to export CSV:', error);
        }
    };

    const updateLocation = () => {
        setUpdating(true);
        setUpdateMessage('');

        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                async (position) => {
                    try {
                        const res = await axios.put(
                            `${API_URL}/sessions/${id}`,
                            {
                                centerLat: position.coords.latitude,
                                centerLng: position.coords.longitude
                            },
                            { headers: { Authorization: `Bearer ${token}` } }
                        );
                        setSession(res.data.data);
                        setUpdateMessage('Location updated successfully!');
                        setTimeout(() => setUpdateMessage(''), 3000);
                    } catch (error) {
                        setUpdateMessage('Failed to update location');
                        console.error('Failed to update location:', error);
                    } finally {
                        setUpdating(false);
                    }
                },
                (error) => {
                    setUpdateMessage('Failed to get current location');
                    setUpdating(false);
                    console.error('Geolocation error:', error);
                }
            );
        } else {
            setUpdateMessage('Geolocation not supported');
            setUpdating(false);
        }
    };

    const toggleActive = async () => {
        setUpdating(true);
        setUpdateMessage('');

        try {
            const res = await axios.put(
                `${API_URL}/sessions/${id}`,
                { isActive: !session.isActive },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            setSession(res.data.data);
            setUpdateMessage(`Session ${res.data.data.isActive ? 'activated' : 'deactivated'}!`);
            setTimeout(() => setUpdateMessage(''), 3000);
        } catch (error) {
            setUpdateMessage('Failed to update session status');
            console.error('Failed to toggle active:', error);
        } finally {
            setUpdating(false);
        }
    };

    const updateRadius = async (newRadius) => {
        if (newRadius < 10 || newRadius > 500) {
            setUpdateMessage('Radius must be between 10m and 500m');
            setTimeout(() => setUpdateMessage(''), 3000);
            return;
        }

        setUpdating(true);
        setUpdateMessage('');

        try {
            const res = await axios.put(
                `${API_URL}/sessions/${id}`,
                { radius: newRadius },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            setSession(res.data.data);
            setUpdateMessage(`Radius updated to ${newRadius}m!`);
            setTimeout(() => setUpdateMessage(''), 3000);
        } catch (error) {
            setUpdateMessage('Failed to update radius');
            console.error('Failed to update radius:', error);
        } finally {
            setUpdating(false);
        }
    };

    if (loading) {
        return (
            <div className="session-detail-page">
                <div className="loading-state">
                    <div className="spinner"></div>
                    <p>Loading session...</p>
                </div>
            </div>
        );
    }

    if (!session) {
        return (
            <div className="session-detail-page">
                <div className="error-state">
                    <h2>Session Not Found</h2>
                    <Link to="/admin/dashboard" className="btn btn-primary">
                        Back to Dashboard
                    </Link>
                </div>
            </div>
        );
    }

    const chartData = {
        labels: ['Present', 'Late', 'Invalid'],
        datasets: [{
            data: [stats?.present || 0, stats?.late || 0, stats?.invalid || 0],
            backgroundColor: ['#06d6a0', '#f77f00', '#ef476f'],
            borderWidth: 0
        }]
    };

    const chartOptions = {
        responsive: true,
        plugins: {
            legend: {
                position: 'bottom',
                labels: { color: '#a0a0b0' }
            }
        }
    };

    return (
        <div className="session-detail-page">
            <header className="detail-header">
                <div className="header-nav">
                    <Link to="/admin/dashboard" className="back-link">← Back to Dashboard</Link>
                </div>
                <div className="header-content">
                    <div className="header-info">
                        <h1>{session.courseName}</h1>
                        <p>{session.description || 'No description'}</p>
                        <div className="session-meta">
                            <span>📍 {session.radius}m radius</span>
                            <span>⏰ {new Date(session.startTime).toLocaleString()}</span>
                            <span className={`status-badge ${session.isActive ? 'active' : 'inactive'}`}>
                                {session.isActive ? 'Active' : 'Inactive'}
                            </span>
                        </div>
                    </div>
                    <div className="header-actions">
                        {!showQR ? (
                            <button className="btn btn-primary" onClick={startQRDisplay}>
                                📱 Show QR Code
                            </button>
                        ) : (
                            <button className="btn btn-secondary" onClick={stopQRDisplay}>
                                ✕ Hide QR Code
                            </button>
                        )}
                        <button className="btn btn-secondary" onClick={exportCSV}>
                            📥 Export CSV
                        </button>
                    </div>
                </div>

                {/* Session Controls */}
                <div className="session-controls">
                    <button
                        className="btn btn-secondary"
                        onClick={updateLocation}
                        disabled={updating}
                    >
                        📍 {updating ? 'Updating...' : 'Update Location'}
                    </button>
                    <button
                        className={`btn ${session.isActive ? 'btn-danger' : 'btn-success'}`}
                        onClick={toggleActive}
                        disabled={updating}
                    >
                        {session.isActive ? '⏸ Deactivate' : '▶ Activate'}
                    </button>
                    {updateMessage && (
                        <span className={`update-message ${updateMessage.includes('Failed') ? 'error' : 'success'}`}>
                            {updateMessage}
                        </span>
                    )}
                </div>

                <div className="location-info">
                    <span>📍 Current: {session.centerLat?.toFixed(6)}, {session.centerLng?.toFixed(6)}</span>
                    <div className="radius-control">
                        <span>📏 Radius:</span>
                        <button
                            className="radius-btn"
                            onClick={() => updateRadius(session.radius - 10)}
                            disabled={updating || session.radius <= 10}
                        >
                            −
                        </button>
                        <span className="radius-value">{session.radius}m</span>
                        <button
                            className="radius-btn"
                            onClick={() => updateRadius(session.radius + 10)}
                            disabled={updating || session.radius >= 500}
                        >
                            +
                        </button>
                    </div>
                </div>
            </header>

            {showQR && (
                <div className="qr-display animate-fade-in">
                    <div className="qr-container">
                        <h3>Scan to Mark Attendance</h3>
                        {(isStaticQR ? staticQrCode : qrCode) ? (
                            <img src={isStaticQR ? staticQrCode : qrCode} alt="QR Code" className="qr-image" />
                        ) : (
                            <div className="spinner"></div>
                        )}
                        <p className="qr-note">
                            {isStaticQR
                                ? '⚡ Static QR - Does not expire (for printing/sharing)'
                                : '🔄 Dynamic QR - Refreshes every 30 seconds (more secure)'
                            }
                        </p>
                        <div className="qr-actions">
                            <button
                                className={`btn ${isStaticQR ? 'btn-primary' : 'btn-secondary'}`}
                                onClick={toggleQRMode}
                            >
                                {isStaticQR ? '🔄 Switch to Dynamic' : '📌 Switch to Static'}
                            </button>
                            <button
                                className="btn btn-success"
                                onClick={downloadQR}
                                disabled={!(isStaticQR ? staticQrCode : qrCode)}
                            >
                                📥 Download QR
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <main className="detail-content">
                <div className="stats-row">
                    <div className="stat-card">
                        <h4>Total</h4>
                        <p className="stat-value">{stats?.total || 0}</p>
                    </div>
                    <div className="stat-card present">
                        <h4>Present</h4>
                        <p className="stat-value">{stats?.present || 0}</p>
                    </div>
                    <div className="stat-card late">
                        <h4>Late</h4>
                        <p className="stat-value">{stats?.late || 0}</p>
                    </div>
                    <div className="stat-card invalid">
                        <h4>Invalid</h4>
                        <p className="stat-value">{stats?.invalid || 0}</p>
                    </div>
                </div>

                <div className="content-grid">
                    <div className="chart-section card">
                        <h3>Attendance Distribution</h3>
                        <div className="chart-container">
                            <Doughnut data={chartData} options={chartOptions} />
                        </div>
                    </div>

                    <div className="attendance-section card">
                        <h3>Attendance List ({attendance.length})</h3>
                        {attendance.length === 0 ? (
                            <div className="empty-list">
                                <p>No attendance records yet</p>
                            </div>
                        ) : (
                            <div className="table-wrapper">
                                <table className="table">
                                    <thead>
                                        <tr>
                                            <th>#</th>
                                            <th>Student ID</th>
                                            <th>Name</th>
                                            <th>Time</th>
                                            <th>Distance</th>
                                            <th>Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {attendance.map((record, index) => (
                                            <tr key={record._id}>
                                                <td>{index + 1}</td>
                                                <td>{record.studentId}</td>
                                                <td>{record.studentName}</td>
                                                <td>{new Date(record.createdAt).toLocaleTimeString()}</td>
                                                <td>{record.distance}m</td>
                                                <td>
                                                    <span className={`badge badge-${record.status.toLowerCase()}`}>
                                                        {record.status}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            </main>
        </div>
    );
};

export default SessionDetail;

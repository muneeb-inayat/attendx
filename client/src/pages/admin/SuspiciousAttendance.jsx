import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'react-toastify';
import { useAuth } from '../../context/AuthContext';
import API_URL from '../../config/api';
import './SuspiciousAttendance.css';

const SuspiciousAttendance = () => {
    const { token, logout } = useAuth();
    const navigate = useNavigate();
    const [records, setRecords] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('all'); // all, location, device, time

    useEffect(() => {
        fetchSuspiciousRecords();
    }, []);

    const fetchSuspiciousRecords = async () => {
        try {
            const res = await axios.get(`${API_URL}/attendance/suspicious`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setRecords(res.data.data || []);
        } catch (error) {
            toast.error(error.response?.data?.error || 'Failed to load suspicious records');
        } finally {
            setLoading(false);
        }
    };

    const filteredRecords = records.filter(record => {
        if (filter === 'all') return true;
        if (filter === 'location') return record.securityFlags?.locationSpoofing || record.securityFlags?.outsideGeofence;
        if (filter === 'device') return record.securityFlags?.deviceMismatch || record.securityFlags?.multipleDevices;
        if (filter === 'time') return record.securityFlags?.lateSubmission;
        return true;
    });

    const getFlagBadges = (flags) => {
        const badges = [];
        if (flags?.locationSpoofing) badges.push({ text: '📍 Location Spoofing', color: 'red' });
        if (flags?.outsideGeofence) badges.push({ text: '🚫 Outside Range', color: 'orange' });
        if (flags?.deviceMismatch) badges.push({ text: '📱 Device Mismatch', color: 'purple' });
        if (flags?.multipleDevices) badges.push({ text: '🔄 Multiple Devices', color: 'blue' });
        if (flags?.lateSubmission) badges.push({ text: '⏰ Late Submission', color: 'yellow' });
        return badges;
    };

    return (
        <div className="suspicious-page">
            {/* Header */}
            <header className="page-header">
                <button className="btn-back" onClick={() => navigate('/admin/dashboard')}>
                    ← Back
                </button>
                <div className="header-content">
                    <h1>🔒 Suspicious Attendance</h1>
                    <p>Review flagged attendance records</p>
                </div>
                <button className="btn-logout" onClick={() => { logout(); navigate('/'); }}>
                    Logout
                </button>
            </header>

            {/* Filters */}
            <div className="filter-bar">
                <button
                    className={`filter-btn ${filter === 'all' ? 'active' : ''}`}
                    onClick={() => setFilter('all')}
                >
                    All ({records.length})
                </button>
                <button
                    className={`filter-btn ${filter === 'location' ? 'active' : ''}`}
                    onClick={() => setFilter('location')}
                >
                    📍 Location Issues
                </button>
                <button
                    className={`filter-btn ${filter === 'device' ? 'active' : ''}`}
                    onClick={() => setFilter('device')}
                >
                    📱 Device Issues
                </button>
                <button
                    className={`filter-btn ${filter === 'time' ? 'active' : ''}`}
                    onClick={() => setFilter('time')}
                >
                    ⏰ Time Issues
                </button>
            </div>

            {/* Records List */}
            <div className="records-container">
                {loading ? (
                    <div className="loading-state">
                        <div className="spinner"></div>
                        <p>Loading suspicious records...</p>
                    </div>
                ) : filteredRecords.length === 0 ? (
                    <div className="empty-state">
                        <span className="empty-icon">✅</span>
                        <h3>No Suspicious Records</h3>
                        <p>All attendance records look clean!</p>
                    </div>
                ) : (
                    <div className="records-grid">
                        {filteredRecords.map(record => (
                            <div key={record._id} className="record-card">
                                <div className="record-header">
                                    <div className="student-info">
                                        <div className="student-avatar">
                                            {record.student?.name?.charAt(0) || 'S'}
                                        </div>
                                        <div>
                                            <h3>{record.student?.name}</h3>
                                            <p>{record.student?.rollNo}</p>
                                        </div>
                                    </div>
                                    <span className={`status-badge ${record.status?.toLowerCase()}`}>
                                        {record.status}
                                    </span>
                                </div>

                                <div className="record-details">
                                    <div className="detail-row">
                                        <span className="detail-label">Course:</span>
                                        <span className="detail-value">
                                            {record.session?.course?.courseCode} - {record.session?.course?.courseName}
                                        </span>
                                    </div>
                                    <div className="detail-row">
                                        <span className="detail-label">Session:</span>
                                        <span className="detail-value">
                                            {new Date(record.session?.startTime).toLocaleString()}
                                        </span>
                                    </div>
                                    <div className="detail-row">
                                        <span className="detail-label">Marked At:</span>
                                        <span className="detail-value">
                                            {new Date(record.createdAt).toLocaleString()}
                                        </span>
                                    </div>
                                </div>

                                <div className="flags-section">
                                    <h4>Security Flags:</h4>
                                    <div className="flags-list">
                                        {getFlagBadges(record.securityFlags).map((badge, idx) => (
                                            <span key={idx} className={`flag-badge ${badge.color}`}>
                                                {badge.text}
                                            </span>
                                        ))}
                                    </div>
                                </div>

                                {record.metadata && (
                                    <div className="metadata-section">
                                        <details>
                                            <summary>View Technical Details</summary>
                                            <div className="metadata-content">
                                                {record.metadata.distance && (
                                                    <p><strong>Distance:</strong> {record.metadata.distance}m</p>
                                                )}
                                                {record.metadata.deviceInfo && (
                                                    <p><strong>Device:</strong> {record.metadata.deviceInfo.type} - {record.metadata.deviceInfo.os}</p>
                                                )}
                                                {record.metadata.ipAddress && (
                                                    <p><strong>IP:</strong> {record.metadata.ipAddress}</p>
                                                )}
                                            </div>
                                        </details>
                                    </div>
                                )}

                                <div className="record-actions">
                                    <button
                                        className="btn-view-audit"
                                        onClick={() => navigate(`/admin/audit/${record.student._id}`)}
                                    >
                                        View Student Audit
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default SuspiciousAttendance;

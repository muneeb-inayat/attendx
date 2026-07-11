import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'react-toastify';
import { useAuth } from '../../context/AuthContext';
import API_URL from '../../config/api';
import './StudentAudit.css';

const StudentAudit = () => {
    const { studentId } = useParams();
    const { token, logout } = useAuth();
    const navigate = useNavigate();
    const [auditLogs, setAuditLogs] = useState([]);
    const [studentInfo, setStudentInfo] = useState(null);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('all'); // all, attendance, security, auth

    useEffect(() => {
        fetchAuditLogs();
    }, [studentId]);

    const fetchAuditLogs = async () => {
        try {
            const res = await axios.get(`${API_URL}/attendance/audit/${studentId}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setAuditLogs(res.data.data || []);
            // Extract student info from first log
            if (res.data.data && res.data.data.length > 0) {
                setStudentInfo(res.data.data[0].student);
            }
        } catch (error) {
            toast.error(error.response?.data?.error || 'Failed to load audit logs');
        } finally {
            setLoading(false);
        }
    };

    const filteredLogs = auditLogs.filter(log => {
        if (filter === 'all') return true;
        if (filter === 'attendance') return log.eventType?.includes('ATTENDANCE');
        if (filter === 'security') return log.eventType?.includes('SECURITY') || log.eventType?.includes('FLAG');
        if (filter === 'auth') return log.eventType?.includes('LOGIN') || log.eventType?.includes('AUTH');
        return true;
    });

    const getEventIcon = (eventType) => {
        if (eventType?.includes('ATTENDANCE_MARKED')) return '✅';
        if (eventType?.includes('ATTENDANCE_FAILED')) return '❌';
        if (eventType?.includes('SECURITY')) return '🔒';
        if (eventType?.includes('FLAG')) return '🚩';
        if (eventType?.includes('LOGIN')) return '🔑';
        if (eventType?.includes('DEVICE')) return '📱';
        return '📝';
    };

    const getEventColor = (eventType) => {
        if (eventType?.includes('FAILED') || eventType?.includes('FLAG')) return 'red';
        if (eventType?.includes('SECURITY')) return 'orange';
        if (eventType?.includes('MARKED')) return 'green';
        return 'blue';
    };

    return (
        <div className="audit-page">
            {/* Header */}
            <header className="page-header">
                <button className="btn-back" onClick={() => navigate(-1)}>
                    ← Back
                </button>
                <div className="header-content">
                    <h1>📋 Student Audit Log</h1>
                    {studentInfo && (
                        <p>{studentInfo.name} ({studentInfo.rollNo})</p>
                    )}
                </div>
                <button className="btn-logout" onClick={() => { logout(); navigate('/'); }}>
                    Logout
                </button>
            </header>

            {/* Student Info Card */}
            {studentInfo && (
                <div className="student-info-card">
                    <div className="student-avatar-large">
                        {studentInfo.name?.charAt(0) || 'S'}
                    </div>
                    <div className="student-details">
                        <h2>{studentInfo.name}</h2>
                        <div className="student-meta">
                            <span>📧 {studentInfo.email}</span>
                            <span>🎓 {studentInfo.rollNo}</span>
                            <span>📚 {studentInfo.branch} - Year {studentInfo.year}</span>
                        </div>
                    </div>
                </div>
            )}

            {/* Filters */}
            <div className="filter-bar">
                <button
                    className={`filter-btn ${filter === 'all' ? 'active' : ''}`}
                    onClick={() => setFilter('all')}
                >
                    All Events ({auditLogs.length})
                </button>
                <button
                    className={`filter-btn ${filter === 'attendance' ? 'active' : ''}`}
                    onClick={() => setFilter('attendance')}
                >
                    ✅ Attendance
                </button>
                <button
                    className={`filter-btn ${filter === 'security' ? 'active' : ''}`}
                    onClick={() => setFilter('security')}
                >
                    🔒 Security
                </button>
                <button
                    className={`filter-btn ${filter === 'auth' ? 'active' : ''}`}
                    onClick={() => setFilter('auth')}
                >
                    🔑 Authentication
                </button>
            </div>

            {/* Audit Timeline */}
            <div className="audit-container">
                {loading ? (
                    <div className="loading-state">
                        <div className="spinner"></div>
                        <p>Loading audit logs...</p>
                    </div>
                ) : filteredLogs.length === 0 ? (
                    <div className="empty-state">
                        <span className="empty-icon">📭</span>
                        <h3>No Audit Logs</h3>
                        <p>No events found for this student</p>
                    </div>
                ) : (
                    <div className="audit-timeline">
                        {filteredLogs.map((log, index) => (
                            <div key={log._id || index} className={`audit-item ${getEventColor(log.eventType)}`}>
                                <div className="audit-icon">
                                    {getEventIcon(log.eventType)}
                                </div>
                                <div className="audit-content">
                                    <div className="audit-header">
                                        <h3>{log.eventType}</h3>
                                        <span className="audit-time">
                                            {new Date(log.timestamp).toLocaleString()}
                                        </span>
                                    </div>

                                    {log.description && (
                                        <p className="audit-description">{log.description}</p>
                                    )}

                                    {log.metadata && Object.keys(log.metadata).length > 0 && (
                                        <div className="audit-metadata">
                                            <details>
                                                <summary>View Details</summary>
                                                <div className="metadata-grid">
                                                    {Object.entries(log.metadata).map(([key, value]) => (
                                                        <div key={key} className="metadata-item">
                                                            <span className="metadata-key">{key}:</span>
                                                            <span className="metadata-value">
                                                                {typeof value === 'object'
                                                                    ? JSON.stringify(value, null, 2)
                                                                    : String(value)
                                                                }
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </details>
                                        </div>
                                    )}

                                    {log.ipAddress && (
                                        <div className="audit-footer">
                                            <span className="ip-badge">🌐 {log.ipAddress}</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default StudentAudit;

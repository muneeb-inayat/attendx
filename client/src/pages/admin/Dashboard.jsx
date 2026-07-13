import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'react-toastify';
import { useAuth } from '../../context/AuthContext';
import ThemeToggle from '../../components/ThemeToggle';
import API_URL from '../../config/api';
import './Dashboard.css';

const AdminDashboard = () => {
    const { user, token, logout } = useAuth();
    const navigate = useNavigate();

    const [deviceChanges, setDeviceChanges] = useState([]);
    const [analytics, setAnalytics] = useState(null);
    const [pendingProfessors, setPendingProfessors] = useState([]);
    const [claimRequests, setClaimRequests] = useState([]);
    const [electiveRequests, setElectiveRequests] = useState([]);
    const [pendingUsers, setPendingUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('overview');
    const [approvalTab, setApprovalTab] = useState('professors');

    // Modal states
    const [showModal, setShowModal] = useState(false);
    const [modalData, setModalData] = useState({ type: '', data: [], title: '' });
    const [processingId, setProcessingId] = useState(null);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        const headers = { Authorization: `Bearer ${token}` };
        try {
            const [analyticsRes, professorsRes, claimsRes, electivesRes, usersRes, deviceChangesRes] = await Promise.all(
                [
                    axios.get(`${API_URL}/admin/analytics`, { headers }).catch(() => ({ data: { data: null } })),
                    axios.get(`${API_URL}/admin/pending-professors`, { headers }).catch(() => ({ data: { data: [] } })),
                    axios.get(`${API_URL}/admin/claim-requests`, { headers }).catch(() => ({ data: { data: [] } })),
                    axios.get(`${API_URL}/admin/elective-requests`, { headers }).catch(() => ({ data: { data: [] } })),
                    axios.get(`${API_URL}/admin/pending-users`, { headers }).catch(() => ({ data: { data: [] } })),
                    axios.get(`${API_URL}/admin/device-changes`, { headers }).catch(() => ({ data: { data: [] } }))
                ]
            );
            setAnalytics(analyticsRes.data.data);
            setPendingProfessors(professorsRes.data.data || []);
            setClaimRequests(claimsRes.data.data?.filter(r => r.status === 'pending') || []);
            setElectiveRequests(electivesRes.data.data?.filter(r => r.status === 'pending') || []);
            setPendingUsers(usersRes.data.data || []);
            setDeviceChanges(deviceChangesRes.data.data || []);
        } catch (error) {
            console.error('Fetch error:', error);
            toast.error('Failed to load dashboard data');
        } finally {
            setLoading(false);
        }
    };

    // Action handlers
    const handleProfessorApproval = async (id, action) => {
        setProcessingId(id);
        try {
            await axios.put(`${API_URL}/admin/approve-professor/${id}`,
                { action },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            toast.success(`Professor ${action === 'approve' ? 'approved' : 'rejected'}`);
            fetchData();
        } catch (error) {
            toast.error(error.response?.data?.error || 'Action failed');
        }
        setProcessingId(null);
    };

    const handleClaimRequest = async (id, action) => {
        setProcessingId(id);
        try {
            await axios.put(`${API_URL}/admin/claim-requests/${id}`,
                { action },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            toast.success(`Claim request ${action}d`);
            fetchData();
        } catch (error) {
            toast.error(error.response?.data?.error || 'Action failed');
        }
        setProcessingId(null);
    };

    const handleElectiveRequest = async (id, action) => {
        setProcessingId(id);
        try {
            await axios.put(`${API_URL}/admin/elective-requests/${id}`,
                { action },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            toast.success(`Elective request ${action}d`);
            fetchData();
        } catch (error) {
            toast.error(error.response?.data?.error || 'Action failed');
        }
        setProcessingId(null);
    };

    const handlePendingUser = async (id, action, userData) => {
        setProcessingId(id);
        try {
            await axios.put(`${API_URL}/admin/pending-users/${id}`,
                { action, ...userData },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            toast.success(`User ${action}d successfully`);
            fetchData();
        } catch (error) {
            toast.error(error.response?.data?.error || 'Action failed');
        }
        setProcessingId(null);
    };

    const handleCardClick = async (type) => {
        const headers = { Authorization: `Bearer ${token}` };
        try {
            let res, title;
            switch (type) {
                case 'students':
                    res = await axios.get(`${API_URL}/admin/students`, { headers });
                    title = 'All Students';
                    break;
                case 'professors':
                    res = await axios.get(`${API_URL}/admin/professors`, { headers });
                    title = 'All Professors';
                    break;
                default:
                    return;
            }
            setModalData({ type, data: res.data.data || [], title });
            setShowModal(true);
        } catch (error) {
            toast.error('Failed to load data');
        }
    };

    const handleDeleteUser = async (user) => {
        const userType = user.role === 'student' ? 'student' : 'professor';
        const confirmText = `Delete ${userType} "${user.name}"?\n\n⚠️ This will permanently delete:\n${userType === 'student'
            ? '• All attendance records'
            : '• All sessions created\n• All attendance records in those sessions\n• Release all claimed courses'
            }`;

        if (!confirm(confirmText)) return;

        setProcessingId(user._id);
        try {
            const res = await axios.delete(`${API_URL}/admin/users/${user._id}`, {
                headers: { Authorization: `Bearer ${token}` }
            });

            const deleted = res.data.data?.deletedRecords;
            let message = `Deleted ${user.name}`;
            if (userType === 'student' && deleted?.attendanceRecords) {
                message += ` and ${deleted.attendanceRecords} attendance records`;
            } else if (userType === 'professor') {
                message += ` (${deleted?.sessions || 0} sessions, ${deleted?.attendanceRecords || 0} attendance records, ${deleted?.coursesReleased || 0} courses released)`;
            }

            toast.success(message);

            // Refresh modal data
            setModalData(prev => ({
                ...prev,
                data: prev.data.filter(u => u._id !== user._id)
            }));

            // Refresh analytics
            fetchData();
        } catch (error) {
            toast.error(error.response?.data?.error || 'Failed to delete user');
        }
        setProcessingId(null);
    };

    const handleDeviceChange = async (requestId, action) => {
        const actionLabel = action === 'approve' ? 'approve' : 'reject';
        if (!confirm(`${actionLabel === 'approve' ? 'Approve' : 'Reject'} this device change?`)) return;

        setProcessingId(requestId);
        try {
            const res = await axios.post(
                `${API_URL}/admin/device-changes/${requestId}/${action}`,
                {},
                { headers: { Authorization: `Bearer ${token}` } }
            );
            toast.success(res.data.message || `Device change ${actionLabel}d`);
            await fetchData();
        } catch (error) {
            toast.error(error.response?.data?.error || `Could not ${actionLabel} device change`);
        } finally {
            setProcessingId(null);
        }
    };

    // Flush Redis Cache (for fixing stale attendance marks)
    const handleFlushRedis = async () => {
        if (!confirm('⚠️ Clear ALL attendance cache in Redis?\n\nThis will NOT delete actual attendance records from database.\nUse this to fix "already marked" errors on new sessions.')) {
            return;
        }
        try {
            const res = await axios.post(`${API_URL}/admin/flush-redis-attendance`, {}, {
                headers: { Authorization: `Bearer ${token}` }
            });
            toast.success(res.data.message || 'Redis cache cleared!');
        } catch (error) {
            toast.error(error.response?.data?.error || 'Failed to flush Redis');
        }
    };

    // Fix stale MongoDB indexes (for fixing duplicate key errors)
    const handleFixStaleIndexes = async () => {
        if (!confirm('🔧 Fix stale MongoDB indexes?\n\nThis will drop old indexes that cause duplicate key errors.\nThis is safe and recommended if you see "E11000 duplicate key" errors.')) {
            return;
        }
        try {
            const res = await axios.post(`${API_URL}/admin/fix-stale-indexes`, {}, {
                headers: { Authorization: `Bearer ${token}` }
            });
            toast.success(res.data.message || 'Stale indexes fixed!');
            console.log('Index fix result:', res.data);
        } catch (error) {
            toast.error(error.response?.data?.error || 'Failed to fix indexes');
        }
    };

    // Calculate pending totals
    const totalPending = pendingProfessors.length
        + claimRequests.length
        + electiveRequests.length
        + pendingUsers.length
        + deviceChanges.length;
    // Skeleton components
    const SkeletonCard = () => (
        <div className="skeleton-card">
            <div className="skeleton-icon shimmer"></div>
            <div className="skeleton-content">
                <div className="skeleton-line short shimmer"></div>
                <div className="skeleton-line shimmer"></div>
            </div>
        </div>
    );

    return (
        <div className="admin-dashboard">
            {/* Header */}
            <header className="dashboard-header">
                <div className="header-left">
                    <div className="header-greeting">
                        <span className="greeting-emoji">🛡️</span>
                        <div>
                            <p className="greeting-text">Admin Portal</p>
                            <h1 className="user-name">{user?.name || 'Administrator'}</h1>
                        </div>
                    </div>
                </div>
                <div className="header-right">
                    <ThemeToggle />
                    <button className="header-avatar" onClick={() => { logout(); navigate('/'); }}>
                        {user?.name?.charAt(0)?.toUpperCase() || 'A'}
                    </button>
                </div>
            </header>

            <main className="dashboard-content">
                {loading ? (
                    <div className="loading-skeleton">
                        <div className="skeleton-stats-grid">
                            <SkeletonCard />
                            <SkeletonCard />
                            <SkeletonCard />
                            <SkeletonCard />
                            <SkeletonCard />
                            <SkeletonCard />
                        </div>
                    </div>
                ) : (
                    <>
                        {/* Quick Stats Section */}
                        <section className="quick-stats-section">
                            <div className="quick-stats-grid">
                                <div
                                    className="stat-card clickable"
                                    onClick={() => navigate('/admin/students')}
                                >
                                    <div className="stat-icon students">👨‍🎓</div>
                                    <div className="stat-info">
                                        <span className="stat-value">{analytics?.users?.totalStudents || 0}</span>
                                        <span className="stat-label">Students</span>
                                    </div>
                                    <span className="stat-arrow">→</span>
                                </div>

                                <div
                                    className="stat-card clickable"
                                    onClick={() => handleCardClick('professors')}
                                >
                                    <div className="stat-icon professors">👨‍🏫</div>
                                    <div className="stat-info">
                                        <span className="stat-value">{analytics?.users?.totalProfessors || 0}</span>
                                        <span className="stat-label">Professors</span>
                                    </div>
                                    <span className="stat-arrow">→</span>
                                </div>

                                <div
                                    className="stat-card clickable"
                                    onClick={() => navigate('/admin/courses')}
                                >
                                    <div className="stat-icon courses">📚</div>
                                    <div className="stat-info">
                                        <span className="stat-value">{analytics?.courses?.total || 0}</span>
                                        <span className="stat-label">Courses</span>
                                    </div>
                                    <span className="stat-arrow">→</span>
                                </div>

                                <div className="stat-card">
                                    <div className="stat-icon claimed">✓</div>
                                    <div className="stat-info">
                                        <span className="stat-value">{analytics?.courses?.claimed || 0}</span>
                                        <span className="stat-label">Claimed</span>
                                    </div>
                                </div>

                                <div
                                    className="stat-card highlight"
                                    onClick={() => setActiveTab('approvals')}
                                >
                                    <div className="stat-icon pending">⏳</div>
                                    <div className="stat-info">
                                        <span className="stat-value">{totalPending}</span>
                                        <span className="stat-label">Pending</span>
                                    </div>
                                    {totalPending > 0 && <span className="pulse-dot"></span>}
                                </div>

                                <div className="stat-card">
                                    <div className="stat-icon active">🔴</div>
                                    <div className="stat-info">
                                        <span className="stat-value">{analytics?.sessions?.active || 0}</span>
                                        <span className="stat-label">Live Sessions</span>
                                    </div>
                                </div>
                            </div>
                        </section>

                        {/* Tab Navigation */}
                        <div className="tab-nav">
                            <button
                                className={`tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
                                onClick={() => setActiveTab('overview')}
                            >
                                <span className="tab-icon">📊</span>
                                <span className="tab-text">Overview</span>
                            </button>
                            <button
                                className={`tab-btn ${activeTab === 'approvals' ? 'active' : ''}`}
                                onClick={() => setActiveTab('approvals')}
                            >
                                <span className="tab-icon">✅</span>
                                <span className="tab-text">Approvals</span>
                                {totalPending > 0 && <span className="tab-badge">{totalPending}</span>}
                            </button>
                            <button
                                className={`tab-btn ${activeTab === 'manage' ? 'active' : ''}`}
                                onClick={() => setActiveTab('manage')}
                            >
                                <span className="tab-icon">⚙️</span>
                                <span className="tab-text">Manage</span>
                            </button>
                        </div>

                        {/* Overview Tab */}
                        {activeTab === 'overview' && (
                            <div className="tab-content overview-content">
                                {/* Attendance Overview */}
                                <div className="overview-card">
                                    <div className="card-header">
                                        <h3>📈 Attendance Overview</h3>
                                    </div>
                                    <div className="overview-stats">
                                        <div className="overview-stat">
                                            <span className="overview-value">{analytics?.todaySessions || 0}</span>
                                            <span className="overview-label">Sessions Today</span>
                                        </div>
                                        <div className="overview-stat">
                                            <span className="overview-value">{analytics?.totalAttendance || 0}</span>
                                            <span className="overview-label">Total Records</span>
                                        </div>
                                        <div className="overview-stat">
                                            <span className="overview-value">{analytics?.attendanceRate || 0}%</span>
                                            <span className="overview-label">Success Rate</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Quick Actions */}
                                <div className="quick-actions-card">
                                    <div className="card-header">
                                        <h3>⚡ Quick Actions</h3>
                                    </div>
                                    <div className="action-buttons">
                                        <button
                                            className="action-btn"
                                            onClick={() => navigate('/admin/courses')}
                                        >
                                            <span className="action-icon">📚</span>
                                            <span>Manage Courses</span>
                                        </button>
                                        <button
                                            className="action-btn"
                                            onClick={() => handleCardClick('students')}
                                        >
                                            <span className="action-icon">👨‍🎓</span>
                                            <span>View Students</span>
                                        </button>
                                        <button
                                            className="action-btn"
                                            onClick={() => handleCardClick('professors')}
                                        >
                                            <span className="action-icon">👨‍🏫</span>
                                            <span>View Professors</span>
                                        </button>
                                        <button
                                            className="action-btn highlight"
                                            onClick={() => setActiveTab('approvals')}
                                        >
                                            <span className="action-icon">⏳</span>
                                            <span>Pending ({totalPending})</span>
                                        </button>
                                    </div>
                                </div>

                                {/* Pending Summary */}
                                {totalPending > 0 && (
                                    <div className="pending-summary-card">
                                        <div className="card-header">
                                            <h3>⏳ Pending Approvals</h3>
                                            <button
                                                className="btn-view-all"
                                                onClick={() => setActiveTab('approvals')}
                                            >
                                                View All →
                                            </button>
                                        </div>
                                        <div className="pending-summary">
                                            {pendingProfessors.length > 0 && (
                                                <div className="pending-item">
                                                    <span className="pending-icon">👨‍🏫</span>
                                                    <span className="pending-label">Professor Registrations</span>
                                                    <span className="pending-count">{pendingProfessors.length}</span>
                                                </div>
                                            )}
                                            {claimRequests.length > 0 && (
                                                <div className="pending-item">
                                                    <span className="pending-icon">📚</span>
                                                    <span className="pending-label">Course Claims</span>
                                                    <span className="pending-count">{claimRequests.length}</span>
                                                </div>
                                            )}
                                            {electiveRequests.length > 0 && (
                                                <div className="pending-item">
                                                    <span className="pending-icon">✨</span>
                                                    <span className="pending-label">Elective Requests</span>
                                                    <span className="pending-count">{electiveRequests.length}</span>
                                                </div>
                                            )}
                                            {pendingUsers.length > 0 && (
                                                <div className="pending-item">
                                                    <span className="pending-icon">👤</span>
                                                    <span className="pending-label">User Approvals</span>
                                                    <span className="pending-count">{pendingUsers.length}</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Approvals Tab */}
                        {activeTab === 'approvals' && (
                            <div className="tab-content approvals-content">
                                {/* Approval Sub-tabs */}
                                <div className="approval-tabs">
                                    <button
                                        className={`approval-tab ${approvalTab === 'professors' ? 'active' : ''}`}
                                        onClick={() => setApprovalTab('professors')}
                                    >
                                        👨‍🏫 Professors
                                        {pendingProfessors.length > 0 && (
                                            <span className="count">{pendingProfessors.length}</span>
                                        )}
                                    </button>
                                    <button
                                        className={`approval-tab ${approvalTab === 'claims' ? 'active' : ''}`}
                                        onClick={() => setApprovalTab('claims')}
                                    >
                                        📚 Claims
                                        {claimRequests.length > 0 && (
                                            <span className="count">{claimRequests.length}</span>
                                        )}
                                    </button>
                                    <button
                                        className={`approval-tab ${approvalTab === 'electives' ? 'active' : ''}`}
                                        onClick={() => setApprovalTab('electives')}
                                    >
                                        ✨ Electives
                                        {electiveRequests.length > 0 && (
                                            <span className="count">{electiveRequests.length}</span>
                                        )}
                                    </button>
                                    <button
                                        className={`approval-tab ${approvalTab === 'users' ? 'active' : ''}`}
                                        onClick={() => setApprovalTab('users')}
                                    >
                                        👤 Users
                                        {pendingUsers.length > 0 && (
                                            <span className="count">{pendingUsers.length}</span>
                                        )}
                                    </button>
                                    <button
                                        className={`approval-tab ${approvalTab === 'devices' ? 'active' : ''}`}
                                        onClick={() => setApprovalTab('devices')}
                                    >
                                        📱 Devices
                                        {deviceChanges.length > 0 && <span className="count">{deviceChanges.length}</span>}
                                    </button>
                                </div>

                                {/* Pending Professors */}
                                {approvalTab === 'professors' && (
                                    <div className="approval-list">
                                        {pendingProfessors.length === 0 ? (
                                            <div className="empty-state">
                                                <span className="empty-icon">✅</span>
                                                <p>No pending professor registrations</p>
                                            </div>
                                        ) : (
                                            pendingProfessors.map(prof => (
                                                <div key={prof._id} className="approval-card">
                                                    <div className="approval-avatar">
                                                        {prof.name?.charAt(0) || '?'}
                                                    </div>
                                                    <div className="approval-info">
                                                        <h4>{prof.name}</h4>
                                                        <p>{prof.email}</p>
                                                        <span className="approval-date">
                                                            {new Date(prof.createdAt).toLocaleDateString()}
                                                        </span>
                                                    </div>
                                                    <div className="approval-actions">
                                                        <button
                                                            className="btn-approve"
                                                            onClick={() => handleProfessorApproval(prof._id, 'approve')}
                                                            disabled={processingId === prof._id}
                                                        >
                                                            {processingId === prof._id ? '...' : '✓ Approve'}
                                                        </button>
                                                        <button
                                                            className="btn-reject"
                                                            onClick={() => handleProfessorApproval(prof._id, 'reject')}
                                                            disabled={processingId === prof._id}
                                                        >
                                                            ✕
                                                        </button>
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                )}

                                {/* Course Claims */}
                                {approvalTab === 'claims' && (
                                    <div className="approval-list">
                                        {claimRequests.length === 0 ? (
                                            <div className="empty-state">
                                                <span className="empty-icon">✅</span>
                                                <p>No pending course claims</p>
                                            </div>
                                        ) : (
                                            claimRequests.map(req => (
                                                <div key={req._id} className="approval-card">
                                                    <div className="approval-icon course">📚</div>
                                                    <div className="approval-info">
                                                        <h4>{req.course?.courseCode} - {req.course?.courseName}</h4>
                                                        <p>By: {req.professor?.name}</p>
                                                        {req.message && (
                                                            <span className="approval-message">"{req.message}"</span>
                                                        )}
                                                    </div>
                                                    <div className="approval-actions">
                                                        <button
                                                            className="btn-approve"
                                                            onClick={() => handleClaimRequest(req._id, 'approve')}
                                                            disabled={processingId === req._id}
                                                        >
                                                            {processingId === req._id ? '...' : '✓ Approve'}
                                                        </button>
                                                        <button
                                                            className="btn-reject"
                                                            onClick={() => handleClaimRequest(req._id, 'reject')}
                                                            disabled={processingId === req._id}
                                                        >
                                                            ✕
                                                        </button>
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                )}

                                {/* Elective Requests */}
                                {approvalTab === 'electives' && (
                                    <div className="approval-list">
                                        {electiveRequests.length === 0 ? (
                                            <div className="empty-state">
                                                <span className="empty-icon">✅</span>
                                                <p>No pending elective requests</p>
                                            </div>
                                        ) : (
                                            electiveRequests.map(req => (
                                                <div key={req._id} className="approval-card">
                                                    <div className="approval-icon elective">✨</div>
                                                    <div className="approval-info">
                                                        <h4>{req.course?.courseCode} - {req.course?.courseName}</h4>
                                                        <p>Student: {req.student?.name} ({req.student?.rollNo})</p>
                                                    </div>
                                                    <div className="approval-actions">
                                                        <button
                                                            className="btn-approve"
                                                            onClick={() => handleElectiveRequest(req._id, 'approve')}
                                                            disabled={processingId === req._id}
                                                        >
                                                            {processingId === req._id ? '...' : '✓ Approve'}
                                                        </button>
                                                        <button
                                                            className="btn-reject"
                                                            onClick={() => handleElectiveRequest(req._id, 'reject')}
                                                            disabled={processingId === req._id}
                                                        >
                                                            ✕
                                                        </button>
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                )}

                                {/* Pending Users */}
                                {approvalTab === 'users' &&
                                    (
                                        <div className="approval-list">
                                            {pendingUsers.length === 0 ? (
                                                <div className="empty-state">
                                                    <span className="empty-icon">✅</span>
                                                    <p>No pending user approvals</p>
                                                </div>
                                            ) : (
                                                pendingUsers.map(user => (
                                                    <div key={user._id} className="approval-card">
                                                        <div className="approval-avatar">
                                                            {user.name?.charAt(0) || '?'}
                                                        </div>
                                                        <div className="approval-info">
                                                            <h4>{user.name}</h4>
                                                            <p>{user.email}</p>
                                                            <span className="approval-role">{user.role}</span>
                                                        </div>
                                                        <div className="approval-actions">
                                                            <button
                                                                className="btn-approve"
                                                                onClick={() => handlePendingUser(user._id, 'approve', { role: user.role, branch: user.branch, year: user.year })}
                                                                disabled={processingId === user._id}
                                                            >
                                                                {processingId === user._id ? '...' : '✓ Approve'}
                                                            </button>
                                                            <button
                                                                className="btn-reject"
                                                                onClick={() => handlePendingUser(user._id, 'reject')}
                                                                disabled={processingId === user._id}
                                                            >
                                                                ✕
                                                            </button>
                                                        </div>
                                                    </div>
                                                ))
                                            )}
                                        </div>

                                    )}
                                {approvalTab === 'devices' && (
                                    <div className="approval-list">
                                        {deviceChanges.length === 0 ? (
                                            <div className="empty-state">
                                                <span className="empty-icon">✅</span>
                                                <p>No pending device changes</p>
                                            </div>
                                        ) : (
                                            deviceChanges.map(request => (
                                                <div key={request._id} className="approval-card">
                                                    <div className="approval-icon elective">📱</div>
                                                    <div className="approval-info">
                                                        <h4>{request.student?.name || 'Student'}</h4>
                                                        <p>
                                                            {request.student?.rollNo || 'No roll number'}
                                                            {request.student?.email ? ` · ${request.student.email}` : ''}
                                                        </p>
                                                        <p>
                                                            {request.deviceType || 'Unknown device'}
                                                            {request.browser ? ` · ${request.browser}` : ''}
                                                            {request.os ? ` · ${request.os}` : ''}
                                                        </p>
                                                        {request.requestedAt && (
                                                            <span className="approval-date">
                                                                Requested {new Date(request.requestedAt).toLocaleString('en-IN')}
                                                            </span>
                                                        )}
                                                        {request.student?.deviceSecurity?.blocked && (
                                                            <span className="approval-message">Student is currently blocked for repeated device changes.</span>
                                                        )}
                                                    </div>
                                                    <div className="approval-actions">
                                                        <button
                                                            className="btn-approve"
                                                            onClick={() => handleDeviceChange(request._id, 'approve')}
                                                            disabled={processingId === request._id}
                                                        >
                                                            {processingId === request._id ? '...' : '✓ Approve'}
                                                        </button>
                                                        <button
                                                            className="btn-reject"
                                                            onClick={() => handleDeviceChange(request._id, 'reject')}
                                                            disabled={processingId === request._id}
                                                            title="Reject device change"
                                                        >
                                                            ✕
                                                        </button>
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Manage Tab */}
                        {activeTab === 'manage' && (
                            <div className="tab-content manage-content">
                                <div className="manage-grid">
                                    <Link to="/admin/courses" className="manage-card">
                                        <div className="manage-icon">📚</div>
                                        <div className="manage-info">
                                            <h3>Manage Courses</h3>
                                            <p>Create, edit, and delete courses. Bulk import available.</p>
                                        </div>
                                        <span className="manage-arrow">→</span>
                                    </Link>

                                    <div
                                        className="manage-card"
                                        onClick={() => handleCardClick('students')}
                                    >
                                        <div className="manage-icon">👨‍🎓</div>
                                        <div className="manage-info">
                                            <h3>View Students</h3>
                                            <p>Browse all registered students and their details.</p>
                                        </div>
                                        <span className="manage-arrow">→</span>
                                    </div>

                                    <div
                                        className="manage-card"
                                        onClick={() => handleCardClick('professors')}
                                    >
                                        <div className="manage-icon">👨‍🏫</div>
                                        <div className="manage-info">
                                            <h3>View Professors</h3>
                                            <p>Browse all approved professors and their courses.</p>
                                        </div>
                                        <span className="manage-arrow">→</span>
                                    </div>

                                    <div className="manage-card">
                                        <div className="manage-icon">📊</div>
                                        <div className="manage-info">
                                            <h3>Attendance Reports</h3>
                                            <p>View and export attendance reports.</p>
                                        </div>
                                        <span className="manage-arrow">→</span>
                                    </div>

                                    <div
                                        className="manage-card"
                                        onClick={() => navigate('/admin/suspicious')}
                                        style={{ cursor: 'pointer' }}
                                    >
                                        <div className="manage-icon">🔒</div>
                                        <div className="manage-info">
                                            <h3>Security Logs</h3>
                                            <p>Review suspicious activities and security flags.</p>
                                        </div>
                                        <span className="manage-arrow">→</span>
                                    </div>

                                    <div className="manage-card">
                                        <div className="manage-icon">⚙️</div>
                                        <div className="manage-info">
                                            <h3>System Settings</h3>
                                            <p>Configure system parameters and defaults.</p>
                                        </div>
                                        <span className="manage-arrow">→</span>
                                    </div>

                                    <div
                                        className="manage-card danger"
                                        onClick={handleFlushRedis}
                                        style={{ cursor: 'pointer' }}
                                    >
                                        <div className="manage-icon">🧹</div>
                                        <div className="manage-info">
                                            <h3>Clear Redis Cache</h3>
                                            <p>Fix "already marked" errors. Clears stale attendance cache.</p>
                                        </div>
                                        <span className="manage-arrow">→</span>
                                    </div>

                                    <div
                                        className="manage-card danger"
                                        onClick={handleFixStaleIndexes}
                                        style={{ cursor: 'pointer' }}
                                    >
                                        <div className="manage-icon">🔧</div>
                                        <div className="manage-info">
                                            <h3>Fix Database Indexes</h3>
                                            <p>Fix "duplicate key" errors. Drop stale MongoDB indexes.</p>
                                        </div>
                                        <span className="manage-arrow">→</span>
                                    </div>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </main>

            {/* Bottom Navigation */}
            <nav className="bottom-nav">
                <button
                    className={`nav-item ${activeTab === 'overview' ? 'active' : ''}`}
                    onClick={() => setActiveTab('overview')}
                >
                    <span className="nav-icon">📊</span>
                    <span className="nav-label">Overview</span>
                </button>
                <button
                    className={`nav-item ${activeTab === 'approvals' ? 'active' : ''}`}
                    onClick={() => setActiveTab('approvals')}
                >
                    <span className="nav-icon">✅</span>
                    <span className="nav-label">Approvals</span>
                    {totalPending > 0 && <span className="nav-badge">{totalPending}</span>}
                </button>
                <Link to="/admin/courses" className="nav-item center-btn">
                    <span className="center-icon-wrapper">
                        <span className="nav-icon">📚</span>
                    </span>
                    <span className="nav-label">Courses</span>
                </Link>
                <button
                    className={`nav-item ${activeTab === 'manage' ? 'active' : ''}`}
                    onClick={() => setActiveTab('manage')}
                >
                    <span className="nav-icon">⚙️</span>
                    <span className="nav-label">Manage</span>
                </button>
                <button
                    className="nav-item"
                    onClick={() => { logout(); navigate('/'); }}
                >
                    <span className="nav-icon">🚪</span>
                    <span className="nav-label">Logout</span>
                </button>
            </nav>

            {/* Detail Modal */}
            {showModal && (
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="modal glass-modal large" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>{modalData.title}</h2>
                            <button className="modal-close" onClick={() => setShowModal(false)}>×</button>
                        </div>
                        <div className="modal-body">
                            {modalData.data.length === 0 ? (
                                <div className="empty-state">
                                    <span className="empty-icon">📭</span>
                                    <p>No data found</p>
                                </div>
                            ) : (
                                <div className="modal-list">
                                    {modalData.data.map((item, idx) => (
                                        <div key={item._id || idx} className="modal-list-item">
                                            <div className="list-avatar">
                                                {item.name?.charAt(0) || '?'}
                                            </div>
                                            <div className="list-info">
                                                <h4>{item.name}</h4>
                                                <p>{item.email}</p>
                                                {item.rollNo && <span className="list-badge">{item.rollNo}</span>}
                                                {item.branch && <span className="list-meta">{item.branch?.toUpperCase()}</span>}
                                            </div>
                                            <button
                                                className="btn-delete-user"
                                                onClick={() => handleDeleteUser(item)}
                                                disabled={processingId === item._id}
                                                title="Delete user"
                                            >
                                                {processingId === item._id ? '...' : '🗑️'}
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminDashboard;

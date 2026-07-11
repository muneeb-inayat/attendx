import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'react-toastify';
import { useAuth } from '../../context/AuthContext';
import ThemeToggle from '../../components/ThemeToggle';
import API_URL from '../../config/api';
import './ProfessorDashboard.css';

const BRANCH_OPTIONS = [
    { code: 'uch', name: 'Chemical' },
    { code: 'ucp', name: 'Computer Science' },
    { code: 'uce', name: 'Civil' },
    { code: 'uec', name: 'Electronics' },
    { code: 'uee', name: 'Electrical' },
    { code: 'ume', name: 'Mechanical' },
    { code: 'umt', name: 'Metallurgical' }
];

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const ProfessorDashboard = () => {
    const { user, token, logout } = useAuth();
    const navigate = useNavigate();
    const navState = useLocation();

    const [claimedCourses, setClaimedCourses] = useState([]);
    const [claimableCourses, setClaimableCourses] = useState([]);
    const [myRequests, setMyRequests] = useState([]);
    const [pastSessions, setPastSessions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('courses');
    const [browseFilter, setBrowseFilter] = useState({ branch: '', year: '', batch: '' });

    // Session Modal State
    const [showSessionModal, setShowSessionModal] = useState(false);
    const [newSession, setNewSession] = useState({ courseId: '', duration: 60, radius: 150, qrInterval: 30 });
    const [location, setLocation] = useState(null);
    const [locationError, setLocationError] = useState('');
    const [gettingLocation, setGettingLocation] = useState(false);

    // Claim Modal State
    const [showClaimModal, setShowClaimModal] = useState(false);
    const [selectedCourse, setSelectedCourse] = useState(null);
    const [claimMessage, setClaimMessage] = useState('');

    const getLocation = useCallback(() => {
        setGettingLocation(true);
        setLocationError('');
        if (!navigator.geolocation) {
            setLocationError('Geolocation not supported');
            setGettingLocation(false);
            return;
        }
        navigator.geolocation.getCurrentPosition(
            pos => {
                const accuracy = pos.coords.accuracy;
                setLocation({
                    lat: pos.coords.latitude,
                    lng: pos.coords.longitude,
                    accuracy: accuracy
                });
                setGettingLocation(false);

                // Warn if accuracy is very poor (common on desktops using IP-based geolocation)
                if (accuracy > 1000) {
                    setLocationError(`⚠️ GPS accuracy is very poor (±${Math.round(accuracy / 1000)}km). This usually happens on desktops. Consider using a mobile device or entering coordinates manually.`);
                } else if (accuracy > 200) {
                    setLocationError(`⚠️ GPS accuracy is ±${Math.round(accuracy)}m. For best results, use a mobile device with GPS.`);
                }
            },
            err => {
                if (err.code === err.PERMISSION_DENIED) {
                    setLocationError('Location permission denied. Please enable location access.');
                } else if (err.code === err.POSITION_UNAVAILABLE) {
                    setLocationError('Location unavailable. Try using a mobile device with GPS.');
                } else {
                    setLocationError('Could not get location. Please try again or enter manually.');
                }
                setGettingLocation(false);
            },
            { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
        );
    }, []);

    useEffect(() => {
        fetchData();
        getLocation();
    }, []);

    // Refresh data when coming back from stopped session
    useEffect(() => {
        if (navState.state?.refresh) {
            fetchData();
            window.history.replaceState({}, document.title);
        }
    }, [navState.state]);

    useEffect(() => {
        if (showSessionModal && !location) getLocation();
    }, [showSessionModal, location, getLocation]);

    const fetchData = async () => {
        const headers = { Authorization: `Bearer ${token}` };
        try {
            const [coursesRes, requestsRes, sessionsRes] = await Promise.all([
                axios.get(`${API_URL}/courses`, { headers }),
                axios.get(`${API_URL}/courses/my-requests`, { headers }).catch(() => ({ data: { data: [] } })),
                axios.get(`${API_URL}/sessions/professor/history`, { headers }).catch(() => ({ data: { data: [] } }))
            ]);
            setClaimedCourses(coursesRes.data.data || []);
            setMyRequests(requestsRes.data.data || []);
            setPastSessions(sessionsRes.data.data || []);
            await fetchClaimableCourses();
        } catch (error) {
            // Error handled silently
        } finally {
            setLoading(false);
        }
    };

    const fetchClaimableCourses = async () => {
        const headers = { Authorization: `Bearer ${token}` };
        try {
            const params = new URLSearchParams();
            if (browseFilter.branch) params.append('branch', browseFilter.branch);
            if (browseFilter.year) params.append('year', browseFilter.year);
            if (browseFilter.batch) params.append('batch', browseFilter.batch);
            const res = await axios.get(`${API_URL}/courses/claimable?${params}`, { headers });
            setClaimableCourses(res.data.data || []);
        } catch (error) {
            // Error handled silently
        }
    };

    useEffect(() => {
        if (activeTab === 'browse') {
            fetchClaimableCourses();
        }
    }, [browseFilter]);

    const handleClaimCourse = async () => {
        if (!selectedCourse) return;
        try {
            await axios.post(`${API_URL}/courses/${selectedCourse._id}/claim`,
                { message: claimMessage },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            toast.success('Claim request sent! Awaiting admin approval.');
            setShowClaimModal(false);
            setSelectedCourse(null);
            setClaimMessage('');
            fetchData();
        } catch (error) {
            toast.error(error.response?.data?.error || 'Failed to send claim request');
        }
    };

    const handleUnclaimCourse = async (course) => {
        if (!confirm(`Request to unclaim "${course.courseName}"?`)) return;
        try {
            await axios.post(`${API_URL}/courses/${course._id}/unclaim`,
                { message: 'Requesting to unclaim this course' },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            toast.success('Unclaim request sent! Awaiting admin approval.');
            fetchData();
        } catch (error) {
            toast.error(error.response?.data?.error || 'Failed to send unclaim request');
        }
    };

    const handleStartSession = async (e) => {
        e.preventDefault();
        if (!location) {
            toast.error('Location not available');
            return;
        }
        try {
            const res = await axios.post(`${API_URL}/sessions`, {
                courseId: newSession.courseId,
                duration: newSession.duration,
                radius: newSession.radius,
                qrRotationInterval: newSession.qrInterval * 1000,
                centerLat: location.lat,
                centerLng: location.lng
            }, { headers: { Authorization: `Bearer ${token}` } });
            setShowSessionModal(false);
            toast.success('Session started!');
            navigate(`/professor/session/${res.data.data._id}`);
        } catch (error) {
            toast.error(error.response?.data?.error || 'Failed to start session');
        }
    };

    const handleQuickStart = (course) => {
        setNewSession({ ...newSession, courseId: course._id });
        setShowSessionModal(true);
    };

    // Calculate stats
    const activeSessions = pastSessions.filter(s => s.isActive).length;
    const todaySessions = pastSessions.filter(s => {
        const sessionDate = new Date(s.startTime).toDateString();
        return sessionDate === new Date().toDateString();
    }).length;
    const totalStudentsReached = pastSessions.reduce((acc, s) => acc + (s.stats?.total || 0), 0);
    const pendingRequests = myRequests.filter(r => r.status === 'pending');

    // Get today's scheduled classes
    const getTodaysScheduledClasses = () => {
        const today = new Date().toLocaleDateString('en-US', { weekday: 'long' });
        const now = new Date();
        const currentTime = now.getHours() * 60 + now.getMinutes();

        return claimedCourses
            .filter(course => {
                if (!course.schedules) return false;
                return course.schedules.some(sched => sched.day === today);
            })
            .map(course => {
                const todaySchedule = course.schedules.find(s => s.day === today);
                return { ...course, todaySchedule };
            })
            .filter(course => {
                if (!course.todaySchedule) return false;
                const [hours, minutes] = course.todaySchedule.endTime.split(':').map(Number);
                return (hours * 60 + minutes) > currentTime;
            })
            .sort((a, b) => {
                const [aH, aM] = a.todaySchedule.startTime.split(':').map(Number);
                const [bH, bM] = b.todaySchedule.startTime.split(':').map(Number);
                return (aH * 60 + aM) - (bH * 60 + bM);
            });
    };

    const todaysClasses = getTodaysScheduledClasses();

    // Skeleton components
    const SkeletonStat = () => (
        <div className="skeleton-stat">
            <div className="skeleton-icon shimmer"></div>
            <div className="skeleton-content">
                <div className="skeleton-line short shimmer"></div>
                <div className="skeleton-line shimmer"></div>
            </div>
        </div>
    );

    const SkeletonCard = () => (
        <div className="skeleton-card">
            <div className="skeleton-line shimmer"></div>
            <div className="skeleton-line short shimmer"></div>
            <div className="skeleton-line shimmer"></div>
        </div>
    );

    return (
        <div className="professor-dashboard">
            {/* Header */}
            <header className="dashboard-header">
                <div className="header-left">
                    <div className="header-greeting">
                        <span className="greeting-emoji">👨‍🏫</span>
                        <div>
                            <p className="greeting-text">Professor Dashboard</p>
                            <h1 className="user-name">{user?.name?.split(' ')[0] || 'Professor'}</h1>
                        </div>
                    </div>
                </div>
                <div className="header-right">
                    <ThemeToggle />
                    <Link to="/professor/profile" className="header-avatar">
                        {user?.name?.charAt(0)?.toUpperCase() || 'P'}
                    </Link>
                </div>
            </header>

            <main className="dashboard-content">
                {loading ? (
                    <div className="loading-skeleton">
                        <div className="skeleton-stats-grid">
                            <SkeletonStat />
                            <SkeletonStat />
                            <SkeletonStat />
                            <SkeletonStat />
                        </div>
                        <SkeletonCard />
                        <SkeletonCard />
                    </div>
                ) : (
                    <>
                        {/* Quick Stats */}
                        <section className="quick-stats-section">
                            <div className="quick-stats-grid">
                                <div className="quick-stat-card stat-courses">
                                    <div className="stat-icon-wrapper">
                                        <div className="stat-icon">📚</div>
                                    </div>
                                    <div className="stat-content">
                                        <span className="stat-value">{claimedCourses.length}</span>
                                        <span className="stat-label">My Courses</span>
                                    </div>
                                </div>

                                <div className="quick-stat-card stat-active">
                                    <div className="stat-icon-wrapper">
                                        <div className="stat-icon pulse-icon">🔴</div>
                                    </div>
                                    <div className="stat-content">
                                        <span className="stat-value">{activeSessions}</span>
                                        <span className="stat-label">Active Now</span>
                                    </div>
                                </div>

                                <div className="quick-stat-card stat-today">
                                    <div className="stat-icon-wrapper">
                                        <div className="stat-icon">📅</div>
                                    </div>
                                    <div className="stat-content">
                                        <span className="stat-value">{todaySessions}</span>
                                        <span className="stat-label">Today's Sessions</span>
                                    </div>
                                </div>

                                <div className="quick-stat-card stat-students">
                                    <div className="stat-icon-wrapper">
                                        <div className="stat-icon">👥</div>
                                    </div>
                                    <div className="stat-content">
                                        <span className="stat-value">{totalStudentsReached}</span>
                                        <span className="stat-label">Total Attendance</span>
                                    </div>
                                </div>
                            </div>
                        </section>

                        {/* Today's Schedule */}
                        {todaysClasses.length > 0 && (
                            <section className="todays-schedule-section">
                                <div className="section-header">
                                    <h2>📅 Today's Schedule</h2>
                                    <span className="schedule-count">{todaysClasses.length} remaining</span>
                                </div>
                                <div className="todays-schedule-list">
                                    {todaysClasses.map((course, idx) => (
                                        <div key={idx} className="schedule-card">
                                            <div className="schedule-time">
                                                <span className="time-start">{course.todaySchedule.startTime}</span>
                                                <span className="time-divider">→</span>
                                                <span className="time-end">{course.todaySchedule.endTime}</span>
                                            </div>
                                            <div className="schedule-info">
                                                <h4>{course.courseName}</h4>
                                                <div className="schedule-meta">
                                                    <span className="schedule-code">{course.courseCode}</span>
                                                    {course.todaySchedule.room && (
                                                        <span className="schedule-room">📍 {course.todaySchedule.room}</span>
                                                    )}
                                                </div>
                                            </div>
                                            <button
                                                className="btn-quick-start"
                                                onClick={() => handleQuickStart(course)}
                                            >
                                                ▶ Start
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </section>
                        )}

                        {/* Pending Requests Alert */}
                        {pendingRequests.length > 0 && (
                            <section className="pending-alert-section">
                                <div className="pending-alert-card">
                                    <span className="pending-icon">⏳</span>
                                    <div className="pending-content">
                                        <h4>Pending Requests</h4>
                                        <p>You have {pendingRequests.length} course claim request(s) awaiting admin approval</p>
                                    </div>
                                    <button
                                        className="btn-view-requests"
                                        onClick={() => setActiveTab('requests')}
                                    >
                                        View
                                    </button>
                                </div>
                            </section>
                        )}

                        {/* Tab Navigation */}
                        <div className="tab-nav">
                            <button
                                className={`tab-btn ${activeTab === 'courses' ? 'active' : ''}`}
                                onClick={() => setActiveTab('courses')}
                            >
                                <span className="tab-icon">📚</span>
                                <span className="tab-text">My Courses</span>
                                <span className="tab-badge">{claimedCourses.length}</span>
                            </button>
                            <button
                                className={`tab-btn ${activeTab === 'browse' ? 'active' : ''}`}
                                onClick={() => setActiveTab('browse')}
                            >
                                <span className="tab-icon">🔍</span>
                                <span className="tab-text">Browse</span>
                            </button>
                            <button
                                className={`tab-btn ${activeTab === 'sessions' ? 'active' : ''}`}
                                onClick={() => setActiveTab('sessions')}
                            >
                                <span className="tab-icon">📜</span>
                                <span className="tab-text">History</span>
                            </button>
                            <button
                                className={`tab-btn ${activeTab === 'requests' ? 'active' : ''}`}
                                onClick={() => setActiveTab('requests')}
                            >
                                <span className="tab-icon">📝</span>
                                <span className="tab-text">Requests</span>
                                {pendingRequests.length > 0 && (
                                    <span className="tab-badge pending">{pendingRequests.length}</span>
                                )}
                            </button>
                        </div>

                        {/* My Courses Tab */}
                        {activeTab === 'courses' && (
                            <div className="tab-content courses-content">
                                {claimedCourses.length === 0 ? (
                                    <div className="empty-state-card">
                                        <span className="empty-icon">📦</span>
                                        <h3>No courses yet</h3>
                                        <p>Browse and claim courses to start taking attendance</p>
                                        <button
                                            className="btn btn-primary"
                                            onClick={() => setActiveTab('browse')}
                                        >
                                            🔍 Browse Courses
                                        </button>
                                    </div>
                                ) : (
                                    <div className="courses-grid">
                                        {claimedCourses.map(course => (
                                            <div key={course._id} className="course-card">
                                                <div className="course-header">
                                                    <span className="course-code">{course.courseCode}</span>
                                                    <span className="course-batch">
                                                        {course.batch === 'all' ? 'All Batches' : `Batch ${course.batch}`}
                                                    </span>
                                                </div>
                                                <h3 className="course-name">{course.courseName}</h3>
                                                <div className="course-meta">
                                                    <span className="meta-item">
                                                        {course.branch?.toUpperCase()} • Year {course.year}
                                                    </span>
                                                </div>
                                                {course.schedules?.length > 0 && (
                                                    <div className="course-schedules">
                                                        {course.schedules.slice(0, 2).map((sched, idx) => (
                                                            <span key={idx} className="schedule-tag">
                                                                {sched.day.slice(0, 3)} {sched.startTime}
                                                            </span>
                                                        ))}
                                                        {course.schedules.length > 2 && (
                                                            <span className="schedule-more">+{course.schedules.length - 2}</span>
                                                        )}
                                                    </div>
                                                )}
                                                <div className="course-actions">
                                                    <button
                                                        className="btn-action btn-start"
                                                        onClick={() => handleQuickStart(course)}
                                                    >
                                                        ▶ Start Session
                                                    </button>
                                                    <button
                                                        className="btn-action btn-attendance"
                                                        onClick={() => navigate(`/professor/course/${course._id}/attendance`)}
                                                    >
                                                        📊 Attendance
                                                    </button>
                                                    <button
                                                        className="btn-action btn-unclaim"
                                                        onClick={() => handleUnclaimCourse(course)}
                                                    >
                                                        ✕
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Browse Courses Tab */}
                        {activeTab === 'browse' && (
                            <div className="tab-content browse-content">
                                <div className="filters-bar">
                                    <select
                                        value={browseFilter.branch}
                                        onChange={e => setBrowseFilter({ ...browseFilter, branch: e.target.value })}
                                        className="filter-select"
                                    >
                                        <option value="">All Branches</option>
                                        {BRANCH_OPTIONS.map(b => (
                                            <option key={b.code} value={b.code}>{b.name}</option>
                                        ))}
                                    </select>
                                    <select
                                        value={browseFilter.year}
                                        onChange={e => setBrowseFilter({ ...browseFilter, year: e.target.value })}
                                        className="filter-select"
                                    >
                                        <option value="">All Years</option>
                                        <option value="1">Year 1</option>
                                        <option value="2">Year 2</option>
                                        <option value="3">Year 3</option>
                                        <option value="4">Year 4</option>
                                    </select>
                                    <span className="filter-count">{claimableCourses.length} found</span>
                                </div>

                                {claimableCourses.length === 0 ? (
                                    <div className="empty-state-card small">
                                        <span className="empty-icon">🔍</span>
                                        <p>No courses found matching your filters</p>
                                    </div>
                                ) : (
                                    <div className="courses-grid claimable">
                                        {claimableCourses.map(course => (
                                            <div key={course._id} className="course-card claimable-card">
                                                <div className="course-header">
                                                    <span className="course-code">{course.courseCode}</span>
                                                    <span className="course-batch">
                                                        {course.batch === 'all' ? 'All' : `B${course.batch}`}
                                                    </span>
                                                </div>
                                                <h3 className="course-name">{course.courseName}</h3>
                                                <div className="course-meta">
                                                    <span className="meta-item">
                                                        {course.branch?.toUpperCase()} • Year {course.year}
                                                    </span>
                                                </div>
                                                {course.claimedBy?.length > 0 && (
                                                    <p className="other-professors">
                                                        Also: {course.claimedBy.map(p => p.name).join(', ')}
                                                    </p>
                                                )}
                                                <button
                                                    className="btn-claim"
                                                    onClick={() => {
                                                        setSelectedCourse(course);
                                                        setShowClaimModal(true);
                                                    }}
                                                >
                                                    🙋 Claim Course
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Sessions History Tab */}
                        {activeTab === 'sessions' && (
                            <div className="tab-content sessions-content">
                                {pastSessions.length === 0 ? (
                                    <div className="empty-state-card small">
                                        <span className="empty-icon">📜</span>
                                        <p>No sessions yet. Start your first class!</p>
                                    </div>
                                ) : (
                                    <div className="sessions-timeline">
                                        {pastSessions.slice(0, 10).map(session => (
                                            <div
                                                key={session._id}
                                                className={`session-item ${session.isActive ? 'active' : ''}`}
                                                onClick={() => navigate(`/professor/session/${session._id}`)}
                                            >
                                                <div className="session-date">
                                                    <span className="date-day">
                                                        {new Date(session.startTime).toLocaleDateString('en-IN', { day: '2-digit' })}
                                                    </span>
                                                    <span className="date-month">
                                                        {new Date(session.startTime).toLocaleDateString('en-IN', { month: 'short' })}
                                                    </span>
                                                </div>
                                                <div className="session-connector">
                                                    <div className={`connector-dot ${session.isActive ? 'active' : ''}`}></div>
                                                    <div className="connector-line"></div>
                                                </div>
                                                <div className="session-card">
                                                    <div className="session-header">
                                                        <h4>{session.course?.courseName || 'Course'}</h4>
                                                        <span className={`session-status ${session.isActive ? 'live' : 'ended'}`}>
                                                            {session.isActive ? '🔴 LIVE' : 'Ended'}
                                                        </span>
                                                    </div>
                                                    <div className="session-stats">
                                                        <span className="stat-item">
                                                            <span className="stat-icon">👥</span>
                                                            {session.stats?.total || 0} attended
                                                        </span>
                                                        <span className="stat-item">
                                                            <span className="stat-icon">⏱️</span>
                                                            {new Date(session.startTime).toLocaleTimeString('en-IN', {
                                                                hour: '2-digit', minute: '2-digit'
                                                            })}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Requests Tab */}
                        {activeTab === 'requests' && (
                            <div className="tab-content requests-content">
                                {myRequests.length === 0 ? (
                                    <div className="empty-state-card small">
                                        <span className="empty-icon">📝</span>
                                        <p>No claim requests yet</p>
                                    </div>
                                ) : (
                                    <div className="requests-list">
                                        {myRequests.map(req => (
                                            <div key={req._id} className={`request-item ${req.status}`}>
                                                <div className="request-icon">
                                                    {req.type === 'claim' ? '🙋' : '✕'}
                                                </div>
                                                <div className="request-info">
                                                    <h4>{req.course?.courseCode} - {req.course?.courseName}</h4>
                                                    <p>{req.type === 'claim' ? 'Claim Request' : 'Unclaim Request'}</p>
                                                </div>
                                                <span className={`request-status ${req.status}`}>
                                                    {req.status === 'pending' && '⏳'}
                                                    {req.status === 'approved' && '✓'}
                                                    {req.status === 'rejected' && '✕'}
                                                    {req.status.charAt(0).toUpperCase() + req.status.slice(1)}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </>
                )}
            </main>

            {/* Bottom Navigation */}
            <nav className="bottom-nav">
                <button
                    className={`nav-item ${activeTab === 'courses' ? 'active' : ''}`}
                    onClick={() => setActiveTab('courses')}
                >
                    <span className="nav-icon">📚</span>
                    <span className="nav-label">Courses</span>
                </button>
                <button
                    className={`nav-item ${activeTab === 'browse' ? 'active' : ''}`}
                    onClick={() => setActiveTab('browse')}
                >
                    <span className="nav-icon">🔍</span>
                    <span className="nav-label">Browse</span>
                </button>
                <button
                    className="nav-item start-btn"
                    onClick={() => setShowSessionModal(true)}
                    disabled={claimedCourses.length === 0}
                >
                    <span className="start-icon-wrapper">
                        <span className="nav-icon">▶</span>
                    </span>
                    <span className="nav-label">Start</span>
                </button>
                <button
                    className={`nav-item ${activeTab === 'sessions' ? 'active' : ''}`}
                    onClick={() => setActiveTab('sessions')}
                >
                    <span className="nav-icon">📜</span>
                    <span className="nav-label">History</span>
                </button>
                <button
                    className="nav-item"
                    onClick={() => { logout(); navigate('/'); }}
                >
                    <span className="nav-icon">🚪</span>
                    <span className="nav-label">Logout</span>
                </button>
            </nav>

            {/* Floating Start Session Button (Desktop) */}
            <button
                className="fab-start-btn"
                onClick={() => setShowSessionModal(true)}
                disabled={claimedCourses.length === 0}
            >
                <span className="fab-icon">▶</span>
                <span className="fab-text">Start Session</span>
                <div className="fab-pulse"></div>
            </button>

            {/* Claim Course Modal */}
            {showClaimModal && selectedCourse && (
                <div className="modal-overlay" onClick={() => setShowClaimModal(false)}>
                    <div className="modal glass-modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>🙋 Claim Course</h2>
                            <button className="modal-close" onClick={() => setShowClaimModal(false)}>×</button>
                        </div>
                        <div className="modal-body">
                            <div className="course-preview">
                                <span className="preview-code">{selectedCourse.courseCode}</span>
                                <h3>{selectedCourse.courseName}</h3>
                                <p>{selectedCourse.branch?.toUpperCase()} • Year {selectedCourse.year}</p>
                            </div>
                            <div className="form-group">
                                <label>Message for Admin (optional)</label>
                                <textarea
                                    placeholder="Add a note for the admin..."
                                    value={claimMessage}
                                    onChange={e => setClaimMessage(e.target.value)}
                                    className="form-input"
                                    rows={3}
                                />
                            </div>
                        </div>
                        <div className="modal-actions">
                            <button className="btn btn-ghost" onClick={() => setShowClaimModal(false)}>
                                Cancel
                            </button>
                            <button className="btn btn-success" onClick={handleClaimCourse}>
                                Send Claim Request
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Start Session Modal */}
            {showSessionModal && (
                <div className="modal-overlay" onClick={() => setShowSessionModal(false)}>
                    <div className="modal glass-modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>▶ Start Live Session</h2>
                            <button className="modal-close" onClick={() => setShowSessionModal(false)}>×</button>
                        </div>
                        {claimedCourses.length === 0 ? (
                            <div className="modal-body">
                                <div className="empty-state-card small">
                                    <span className="empty-icon">📦</span>
                                    <p>You need to claim a course first</p>
                                    <button
                                        className="btn btn-primary"
                                        onClick={() => { setShowSessionModal(false); setActiveTab('browse'); }}
                                    >
                                        Browse Courses
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <form onSubmit={handleStartSession}>
                                <div className="modal-body">
                                    <div className="form-group">
                                        <label>Select Course</label>
                                        <select
                                            value={newSession.courseId}
                                            onChange={e => setNewSession({ ...newSession, courseId: e.target.value })}
                                            required
                                            className="form-input"
                                        >
                                            <option value="">Choose a course...</option>
                                            {claimedCourses.map(c => (
                                                <option key={c._id} value={c._id}>
                                                    {c.courseCode} - {c.courseName}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="form-row">
                                        <div className="form-group">
                                            <label>Duration (mins)</label>
                                            <input
                                                type="number"
                                                value={newSession.duration}
                                                onChange={e => setNewSession({ ...newSession, duration: parseInt(e.target.value) })}
                                                className="form-input"
                                                min="10"
                                                max="180"
                                            />
                                        </div>
                                        <div className="form-group">
                                            <label>Radius (m)</label>
                                            <input
                                                type="number"
                                                value={newSession.radius}
                                                onChange={e => setNewSession({ ...newSession, radius: parseInt(e.target.value) })}
                                                className="form-input"
                                                min="20"
                                                max="500"
                                            />
                                        </div>
                                    </div>
                                    <div className="form-group">
                                        <label>QR Rotation (seconds)</label>
                                        <select
                                            value={newSession.qrInterval}
                                            onChange={e => setNewSession({ ...newSession, qrInterval: parseInt(e.target.value) })}
                                            className="form-input"
                                        >
                                            <option value="15">15s - High Security</option>
                                            <option value="30">30s - Recommended</option>
                                            <option value="60">60s - Standard</option>
                                            <option value="120">2 min - Relaxed</option>
                                        </select>
                                    </div>
                                    <div className="location-status">
                                        {location ? (
                                            <div className="location-details">
                                                <div className="location-ok">
                                                    <span className="location-icon">📍</span>
                                                    <span>Location acquired</span>
                                                    {location.accuracy && (
                                                        <span className={`accuracy-badge ${location.accuracy > 500 ? 'poor' : location.accuracy > 100 ? 'moderate' : 'good'}`}>
                                                            ±{location.accuracy > 1000 ? `${Math.round(location.accuracy / 1000)}km` : `${Math.round(location.accuracy)}m`}
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="location-coords" style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                                                    {location.lat.toFixed(6)}, {location.lng.toFixed(6)}
                                                </div>
                                                <button type="button" className="btn-link" style={{ fontSize: '0.75rem', marginTop: '4px' }} onClick={getLocation}>
                                                    🔄 Refresh location
                                                </button>
                                            </div>
                                        ) : gettingLocation ? (
                                            <div className="location-pending">
                                                <div className="spinner-small"></div>
                                                <span>Getting location...</span>
                                            </div>
                                        ) : (
                                            <button type="button" className="btn btn-secondary" onClick={getLocation}>
                                                📍 Get Location
                                            </button>
                                        )}
                                        {locationError && (
                                            <div className="location-error-box" style={{
                                                marginTop: '8px',
                                                padding: '8px 12px',
                                                background: 'rgba(255, 193, 7, 0.15)',
                                                border: '1px solid rgba(255, 193, 7, 0.4)',
                                                borderRadius: '8px',
                                                fontSize: '0.8rem'
                                            }}>
                                                {locationError}
                                            </div>
                                        )}

                                        {/* Manual coordinate input for desktop/poor GPS */}
                                        {location && location.accuracy > 500 && (
                                            <div className="manual-coords" style={{ marginTop: '12px', padding: '12px', background: 'var(--card-bg)', borderRadius: '8px' }}>
                                                <p style={{ fontSize: '0.8rem', marginBottom: '8px', color: 'var(--text-muted)' }}>
                                                    💡 <strong>Tip:</strong> For better accuracy, you can enter your classroom coordinates manually:
                                                </p>
                                                <div className="form-row" style={{ gap: '8px' }}>
                                                    <input
                                                        type="number"
                                                        step="0.000001"
                                                        placeholder="Latitude (e.g., 26.8607)"
                                                        value={location.lat}
                                                        onChange={e => setLocation({ ...location, lat: parseFloat(e.target.value) || 0, accuracy: 10 })}
                                                        className="form-input"
                                                        style={{ flex: 1, fontSize: '0.85rem' }}
                                                    />
                                                    <input
                                                        type="number"
                                                        step="0.000001"
                                                        placeholder="Longitude (e.g., 75.8166)"
                                                        value={location.lng}
                                                        onChange={e => setLocation({ ...location, lng: parseFloat(e.target.value) || 0, accuracy: 10 })}
                                                        className="form-input"
                                                        style={{ flex: 1, fontSize: '0.85rem' }}
                                                    />
                                                </div>
                                                <p style={{ fontSize: '0.7rem', marginTop: '6px', color: 'var(--text-muted)' }}>
                                                    Find coordinates on <a href="https://www.google.com/maps" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)' }}>Google Maps</a> (right-click → "What's here?")
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <div className="modal-actions">
                                    <button type="button" className="btn btn-ghost" onClick={() => setShowSessionModal(false)}>
                                        Cancel
                                    </button>
                                    <button type="submit" className="btn btn-success" disabled={!location || !newSession.courseId}>
                                        🚀 Start Class
                                    </button>
                                </div>
                            </form>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default ProfessorDashboard;

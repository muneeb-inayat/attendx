import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import ThemeToggle from '../../components/ThemeToggle';
import axios from 'axios';
import { toast } from 'react-toastify';
import API_URL from '../../config/api';
import './StudentDashboard.css';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const StudentDashboard = () => {
    const { user, token, logout, refreshUser } = useAuth();
    const navigate = useNavigate();

    const [summary, setSummary] = useState(null);
    const [courses, setCourses] = useState({ autoEnrolled: [], electives: [] });
    const [timetable, setTimetable] = useState(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('overview');
    const [savingBatch, setSavingBatch] = useState(false);
    const [selectedDay, setSelectedDay] = useState(() => {
        const today = new Date().toLocaleDateString('en-US', { weekday: 'long' });
        return DAYS.includes(today) ? today : 'Monday';
    });

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        const headers = { Authorization: `Bearer ${token}` };
        try {
            const [summaryRes, coursesRes, timetableRes] = await Promise.all([
                axios.get(`${API_URL}/attendance/summary`, { headers }).catch(() => ({ data: { data: null } })),
                axios.get(`${API_URL}/courses/my-courses`, { headers }).catch(() => ({ data: { data: { autoEnrolled: [], electives: [] } } })),
                axios.get(`${API_URL}/courses/my-timetable`, { headers }).catch(() => ({ data: { data: null } }))
            ]);
            setSummary(summaryRes.data.data);
            console.log("Courses API Response:", coursesRes.data);
            setCourses(coursesRes.data.data || { autoEnrolled: [], electives: [] });
            setTimetable(timetableRes.data.data);
        } catch (error) {
            // Error handled silently - UI shows empty state
        } finally {
            setLoading(false);
        }
    };

    const getPercentageColor = (percentage) => {
        if (percentage >= 75) return 'good';
        if (percentage >= 50) return 'warning';
        return 'danger';
    };

    const handleBatchChange = async (newBatch) => {
        if (!newBatch || savingBatch) return;
        setSavingBatch(true);
        try {
            await axios.put(`${API_URL}/auth/batch`, { batch: newBatch }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            toast.success(`Batch updated to ${newBatch}`);
            if (refreshUser) await refreshUser();
            fetchData();
        } catch (err) {
            toast.error(err.response?.data?.error || 'Failed to update batch');
        } finally {
            setSavingBatch(false);
        }
    };

    const allCourses = [...(courses.autoEnrolled || []), ...(courses.electives || [])];

    // Get today's remaining classes
    const getTodaysClasses = () => {
        const today = new Date().toLocaleDateString('en-US', { weekday: 'long' });
        if (!timetable?.byDay || !timetable.byDay[today]) return [];

        const now = new Date();
        const currentTime = now.getHours() * 60 + now.getMinutes();

        return timetable.byDay[today].filter(slot => {
            const [hours, minutes] = slot.endTime.split(':').map(Number);
            const classEndTime = hours * 60 + minutes;
            return classEndTime > currentTime;
        });
    };

    const todaysClasses = getTodaysClasses();

    // Calculate quick stats
    const quickStats = {
        present: summary?.overall?.totalSessionsAttended || 0,
        late: summary?.courses?.reduce((acc, c) => acc + (c.lateCount || 0), 0) || 0,
        absent: (summary?.overall?.totalSessionsHeld || 0) - (summary?.overall?.totalSessionsAttended || 0),
        percentage: summary?.overall?.overallPercentage || 0
    };

    // Skeleton loader component
    const SkeletonCard = ({ className = '' }) => (
        <div className={`skeleton-card ${className}`}>
            <div className="skeleton-shimmer"></div>
        </div>
    );

    const SkeletonStat = () => (
        <div className="skeleton-stat">
            <div className="skeleton-circle"></div>
            <div className="skeleton-lines">
                <div className="skeleton-line short"></div>
                <div className="skeleton-line"></div>
            </div>
        </div>
    );

    return (
        <div className="student-dashboard">
            {/* Header */}
            <header className="dashboard-header">
                <div className="header-left">
                    <div className="header-greeting">
                        <span className="greeting-emoji">👋</span>
                        <div>
                            <p className="greeting-text">Welcome back,</p>
                            <h1 className="user-name">{user?.name?.split(' ')[0] || 'Student'}</h1>
                        </div>
                    </div>
                </div>
                <div className="header-right">
                    <ThemeToggle />
                    <Link to="/student/profile" className="header-avatar">
                        {user?.name?.charAt(0)?.toUpperCase() || 'S'}
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
                        <SkeletonCard className="skeleton-large" />
                        <SkeletonCard className="skeleton-medium" />
                    </div>
                ) : (
                    <>
                        {/* Quick Stats Section */}
                        <section className="quick-stats-section">
                            <div className="quick-stats-grid">
                                <div className="quick-stat-card stat-overall">
                                    <div className="stat-icon-wrapper">
                                        <div className={`stat-ring ${getPercentageColor(quickStats.percentage)}`}>
                                            <svg viewBox="0 0 36 36">
                                                <path
                                                    d="M18 2.0845
                                                       a 15.9155 15.9155 0 0 1 0 31.831
                                                       a 15.9155 15.9155 0 0 1 0 -31.831"
                                                    fill="none"
                                                    stroke="currentColor"
                                                    strokeOpacity="0.1"
                                                    strokeWidth="3"
                                                />
                                                <path
                                                    d="M18 2.0845
                                                       a 15.9155 15.9155 0 0 1 0 31.831
                                                       a 15.9155 15.9155 0 0 1 0 -31.831"
                                                    fill="none"
                                                    stroke="currentColor"
                                                    strokeWidth="3"
                                                    strokeDasharray={`${quickStats.percentage}, 100`}
                                                    strokeLinecap="round"
                                                />
                                            </svg>
                                            <span className="ring-value">{quickStats.percentage}%</span>
                                        </div>
                                    </div>
                                    <div className="stat-content">
                                        <span className="stat-label">Overall</span>
                                        <span className="stat-sublabel">Attendance</span>
                                    </div>
                                </div>

                                <div className="quick-stat-card stat-present">
                                    <div className="stat-icon-wrapper">
                                        <div className="stat-icon">✓</div>
                                    </div>
                                    <div className="stat-content">
                                        <span className="stat-value">{quickStats.present}</span>
                                        <span className="stat-label">Present</span>
                                    </div>
                                </div>

                                <div className="quick-stat-card stat-late">
                                    <div className="stat-icon-wrapper">
                                        <div className="stat-icon">⏰</div>
                                    </div>
                                    <div className="stat-content">
                                        <span className="stat-value">{quickStats.late}</span>
                                        <span className="stat-label">Late</span>
                                    </div>
                                </div>

                                <div className="quick-stat-card stat-absent">
                                    <div className="stat-icon-wrapper">
                                        <div className="stat-icon">✗</div>
                                    </div>
                                    <div className="stat-content">
                                        <span className="stat-value">{quickStats.absent}</span>
                                        <span className="stat-label">Absent</span>
                                    </div>
                                </div>
                            </div>
                        </section>

                        {/* Today's Classes Section */}
                        {todaysClasses.length > 0 && (
                            <section className="todays-classes-section">
                                <div className="section-header">
                                    <h2>📅 Today's Classes</h2>
                                    <span className="classes-count">{todaysClasses.length} remaining</span>
                                </div>
                                <div className="todays-classes-list">
                                    {todaysClasses.map((slot, idx) => (
                                        <div key={idx} className="today-class-card">
                                            <div className="class-time-badge">
                                                <span className="time-start">{slot.startTime}</span>
                                                <span className="time-divider">→</span>
                                                <span className="time-end">{slot.endTime}</span>
                                            </div>
                                            <div className="class-info">
                                                <h4 className="class-name">{slot.course?.courseName || 'Class'}</h4>
                                                <div className="class-meta">
                                                    <span className="class-code">{slot.course?.courseCode}</span>
                                                    {slot.room && <span className="class-room">📍 {slot.room}</span>}
                                                </div>
                                            </div>
                                            <div className="class-status">
                                                <span className="status-dot"></span>
                                                <span className="status-text">Upcoming</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </section>
                        )}

                        {/* Low Attendance Warning */}
                        {summary?.overall?.coursesBelow75 > 0 && (
                            <section className="warning-section">
                                <div className="warning-card">
                                    <div className="warning-header">
                                        <span className="warning-icon">⚠️</span>
                                        <h3>Attendance Alert</h3>
                                    </div>
                                    <p className="warning-text">
                                        You have <strong>{summary.overall.coursesBelow75}</strong> course(s) below 75% attendance
                                    </p>
                                    <div className="warning-courses-list">
                                        {summary.courses
                                            .filter(c => !c.meetsMinimum)
                                            .map((course, idx) => (
                                                <div key={idx} className="warning-course-item">
                                                    <span className="warning-course-name">{course.course?.courseCode}</span>
                                                    <div className="warning-progress-wrapper">
                                                        <div className="warning-progress-bar">
                                                            <div
                                                                className="warning-progress-fill"
                                                                style={{ width: `${course.attendancePercentage}%` }}
                                                            ></div>
                                                        </div>
                                                        <span className="warning-percentage">{course.attendancePercentage}%</span>
                                                    </div>
                                                    <span className="sessions-needed">
                                                        Need {Math.ceil(course.totalSessions * 0.75) - course.sessionsAttended} more
                                                    </span>
                                                </div>
                                            ))
                                        }
                                    </div>
                                </div>
                            </section>
                        )}

                        {/* Tab Navigation */}
                        <div id="tab-section" className="tab-nav">
                            <button
                                className={`tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
                                onClick={() => setActiveTab('overview')}
                            >
                                <span className="tab-icon">📊</span>
                                <span className="tab-text">Overview</span>
                            </button>
                            <button
                                className={`tab-btn ${activeTab === 'timetable' ? 'active' : ''}`}
                                onClick={() => setActiveTab('timetable')}
                            >
                                <span className="tab-icon">📅</span>
                                <span className="tab-text">Timetable</span>
                            </button>
                            <button
                                className={`tab-btn ${activeTab === 'courses' ? 'active' : ''}`}
                                onClick={() => setActiveTab('courses')}
                            >
                                <span className="tab-icon">📚</span>
                                <span className="tab-text">Courses</span>
                                <span className="tab-badge">{allCourses.length}</span>
                            </button>
                        </div>

                        {/* Overview Tab */}
                        {activeTab === 'overview' && (
                            <div className="tab-content overview-content">
                                {/* Profile Card */}
                                <div className="profile-info-card glass-card">
                                    <div className="profile-header">
                                        <div className="profile-avatar-large">
                                            {user?.name?.charAt(0)?.toUpperCase()}
                                        </div>
                                        <div className="profile-details">
                                            <h3>{user?.name}</h3>
                                            <p className="roll-badge">{user?.rollNo || 'Student'}</p>
                                            <p className="email-text">{user?.email}</p>
                                            {user?.branch && (
                                                <p className="branch-info">
                                                    {user.branch?.toUpperCase()} • Year {user?.academicState?.year || '?'}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                    
                                </div>

                                {/* Course Attendance Grid */}
                                <div className="course-attendance-section">
                                    <div className="section-header">
                                        <h2>📈 Course-wise Attendance</h2>
                                    </div>
                                    {!summary?.courses || summary.courses.length === 0 ? (
                                        <div className="empty-state-card">
                                            <span className="empty-icon">📭</span>
                                            <p>No attendance records yet</p>
                                            <span className="empty-hint">Start marking attendance to see stats!</span>
                                        </div>
                                    ) : (
                                        <div className="course-cards-grid">
                                            {summary.courses.map((course, idx) => (
                                                <div
                                                    key={idx}
                                                    className={`course-attendance-card ${!course.meetsMinimum ? 'below-threshold' : ''}`}
                                                >
                                                    <div className="course-card-header">
                                                        <span className="course-code-badge">{course.course.courseCode}</span>
                                                        <span className={`percentage-badge ${getPercentageColor(course.attendancePercentage)}`}>
                                                            {course.attendancePercentage}%
                                                        </span>
                                                    </div>
                                                    <h4 className="course-name">{course.course.courseName}</h4>
                                                    <div className="attendance-bar-wrapper">
                                                        <div className="attendance-bar">
                                                            <div
                                                                className={`attendance-fill ${getPercentageColor(course.attendancePercentage)}`}
                                                                style={{ width: `${course.attendancePercentage}%` }}
                                                            ></div>
                                                        </div>
                                                    </div>
                                                    <div className="course-card-footer">
                                                        <span className="sessions-count">
                                                            {course.sessionsAttended} / {course.totalSessions} sessions
                                                        </span>
                                                        {!course.meetsMinimum && (
                                                            <span className="needs-more">
                                                                Need {Math.ceil(course.totalSessions * 0.75) - course.sessionsAttended} more
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* Recent Activity */}
                                <div className="recent-activity-section">
                                    <div className="section-header">
                                        <h2>🕐 Recent Activity</h2>
                                    </div>
                                    {!summary?.recentHistory || summary.recentHistory.length === 0 ? (
                                        <div className="empty-state-card small">
                                            <span className="empty-icon">📋</span>
                                            <p>No recent attendance</p>
                                        </div>
                                    ) : (
                                        <div className="activity-timeline">
                                            {summary.recentHistory.slice(0, 5).map((record, idx) => (
                                                <div key={idx} className="activity-item">
                                                    <div className={`activity-dot ${record.status?.toLowerCase()}`}></div>
                                                    <div className="activity-content">
                                                        <div className="activity-header">
                                                            <span className="activity-course">{record.courseCode || record.courseName}</span>
                                                            <span className={`activity-status ${record.status?.toLowerCase()}`}>
                                                                {record.status}
                                                            </span>
                                                        </div>
                                                        <span className="activity-time">
                                                            {record.timestamp && new Date(record.timestamp).toLocaleDateString('en-IN', {
                                                                day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
                                                            })}
                                                        </span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Timetable Tab */}
                        {activeTab === 'timetable' && (
                            <div className="tab-content timetable-content">
                                <div className="timetable-header-card glass-card">
                                    <h3>📅 My Timetable</h3>
                                    {timetable?.academicInfo && (
                                        <div className="timetable-badges">
                                            <span className="info-badge branch">{timetable.academicInfo.branch?.toUpperCase()}</span>
                                            <span className="info-badge year">Year {timetable.academicInfo.year}</span>
                                            {timetable.academicInfo.batch && (
                                                <span className="info-badge batch">Batch {timetable.academicInfo.batch}</span>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {!timetable?.byDay ? (
                                    <div className="empty-state-card">
                                        <span className="empty-icon">📭</span>
                                        <p>No timetable available yet</p>
                                        {!user?.batch && <span className="empty-hint">⚠️ Set your batch first!</span>}
                                    </div>
                                ) : (
                                    <>
                                        {/* Day Tabs */}
                                        <div className="day-tabs">
                                            {DAYS.map(day => {
                                                const isToday = new Date().toLocaleDateString('en-US', { weekday: 'long' }) === day;
                                                const hasClasses = (timetable.byDay[day] || []).length > 0;
                                                return (
                                                    <button
                                                        key={day}
                                                        className={`day-tab ${selectedDay === day ? 'active' : ''} ${isToday ? 'today' : ''} ${!hasClasses ? 'empty' : ''}`}
                                                        onClick={() => setSelectedDay(day)}
                                                    >
                                                        <span className="day-short">{day.slice(0, 3)}</span>
                                                        {isToday && <span className="today-indicator"></span>}
                                                    </button>
                                                );
                                            })}
                                        </div>

                                        {/* Selected Day Classes */}
                                        <div className="day-classes">
                                            <h4 className="day-title">
                                                {selectedDay}
                                                {new Date().toLocaleDateString('en-US', { weekday: 'long' }) === selectedDay && (
                                                    <span className="today-badge">Today</span>
                                                )}
                                            </h4>
                                            {(timetable.byDay[selectedDay] || []).length === 0 ? (
                                                <div className="no-classes-card">
                                                    <span className="relax-emoji">🎉</span>
                                                    <p>No classes scheduled!</p>
                                                    <span className="relax-text">Enjoy your free time</span>
                                                </div>
                                            ) : (
                                                <div className="classes-timeline">
                                                    {(timetable.byDay[selectedDay] || []).map((slot, idx) => (
                                                        <div key={idx} className="timeline-item">
                                                            <div className="timeline-time">
                                                                <span className="time-start">{slot.startTime}</span>
                                                                <span className="time-end">{slot.endTime}</span>
                                                            </div>
                                                            <div className="timeline-connector">
                                                                <div className="connector-dot"></div>
                                                                <div className="connector-line"></div>
                                                            </div>
                                                            <div className="timeline-card">
                                                                <span className="timeline-code">{slot.course?.courseCode}</span>
                                                                <h5 className="timeline-name">{slot.course?.courseName}</h5>
                                                                {slot.room && <span className="timeline-room">📍 {slot.room}</span>}
                                                                {slot.course?.batch && slot.course.batch !== 'all' && (
                                                                    <span className="timeline-batch">Batch {slot.course.batch}</span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </>
                                )}
                            </div>
                        )}

                        {/* Courses Tab */}
                        {activeTab === 'courses' && (
                            <div className="tab-content courses-content">
                                {/* Auto-Enrolled Courses */}
                                <div className="courses-group">
                                    <div className="section-header">
                                        <h2>📚 Auto-Enrolled Courses</h2>
                                        <span className="course-count">{courses.autoEnrolled?.length || 0} courses</span>
                                    </div>
                                    {courses.autoEnrolled?.length === 0 ? (
                                        <div className="empty-state-card small">
                                            <span className="empty-icon">📦</span>
                                            <p>No courses for your branch/year</p>
                                        </div>
                                    ) : (
                                        <div className="enrolled-courses-list">
                                            {courses.autoEnrolled?.map(course => (
                                                <div key={course._id} className="enrolled-course-card">
                                                    <div className="course-main">
                                                        <span className="course-code-tag">{course.courseCode}</span>
                                                        <h4 className="course-title">{course.courseName}</h4>
                                                    </div>
                                                    <div className="course-details">
                                                        {course.schedule && (
                                                            <span className="schedule-info">
                                                                📅 {course.schedule.day} {course.schedule.startTime}
                                                            </span>
                                                        )}
                                                        {course.claimedBy?.length > 0 && (
                                                            <span className="professor-name">
                                                                👨‍🏫 {course.claimedBy.map(p => p.name).join(', ')}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* Elective Courses */}
                                {courses.electives?.length > 0 && (
                                    <div className="courses-group">
                                        <div className="section-header">
                                            <h2>✨ Elective Courses</h2>
                                            <span className="course-count">{courses.electives?.length || 0} courses</span>
                                        </div>
                                        <div className="enrolled-courses-list">
                                            {courses.electives.map(course => (
                                                <div key={course._id} className="enrolled-course-card elective">
                                                    <div className="course-main">
                                                        <span className="course-code-tag">{course.courseCode}</span>
                                                        <span className="elective-tag">Elective</span>
                                                        <h4 className="course-title">{course.courseName}</h4>
                                                    </div>
                                                    <div className="course-details">
                                                        {course.claimedBy?.length > 0 && (
                                                            <span className="professor-name">
                                                                👨‍🏫 {course.claimedBy.map(p => p.name).join(', ')}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </>
                )}
            </main>

            {/* Bottom Navigation */}
            <nav className="bottom-nav">
                <a
                    href="#"
                    className={`nav-item ${activeTab === 'overview' ? 'active' : ''}`}
                    onClick={(e) => { e.preventDefault(); setActiveTab('overview'); document.getElementById('tab-section')?.scrollIntoView({ behavior: 'smooth' }); }}
                >
                    <span className="nav-icon">🏠</span>
                    <span className="nav-label">Home</span>
                </a>
                <a
                    href="#"
                    className={`nav-item ${activeTab === 'timetable' ? 'active' : ''}`}
                    onClick={(e) => { e.preventDefault(); setActiveTab('timetable'); document.getElementById('tab-section')?.scrollIntoView({ behavior: 'smooth' }); }}
                >
                    <span className="nav-icon">📅</span>
                    <span className="nav-label">Timetable</span>
                </a>
                <Link to="/student/scan-qr" className="nav-item scan-btn">
                    <span className="scan-icon-wrapper">
                        <span className="nav-icon">📷</span>
                    </span>
                    <span className="nav-label">Scan</span>
                </Link>
                <a
                    href="#"
                    className={`nav-item ${activeTab === 'courses' ? 'active' : ''}`}
                    onClick={(e) => { e.preventDefault(); setActiveTab('courses'); document.getElementById('tab-section')?.scrollIntoView({ behavior: 'smooth' }); }}
                >
                    <span className="nav-icon">📚</span>
                    <span className="nav-label">Courses</span>
                </a>
                <Link to="/student/profile" className="nav-item">
                    <span className="nav-icon">👤</span>
                    <span className="nav-label">Profile</span>
                </Link>
            </nav>

            {/* Floating Scan Button (Desktop) */}
            <Link to="/student/scan-qr" className="fab-scan-btn">
                <span className="fab-icon">📷</span>
                <span className="fab-text">Scan QR</span>
                <div className="fab-pulse"></div>
            </Link>
        </div>
    );
};

export default StudentDashboard;

import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import API_URL from '../../config/api';
import './CourseAttendance.css';

/**
 * Course Attendance View
 * Shows complete attendance data for a course with:
 * - Student details (name, roll number)
 * - Per-session attendance
 * - Overall statistics
 * - CSV export functionality
 */

const CourseAttendance = () => {
    const { courseId } = useParams();
    const navigate = useNavigate();
    const { token } = useAuth();

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [courseData, setCourseData] = useState(null);
    const [filter, setFilter] = useState('all'); // all, below75, above75
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        fetchCourseAttendance();
    }, [courseId]);

    const fetchCourseAttendance = async () => {
        try {
            setLoading(true);
            const res = await axios.get(`${API_URL}/attendance/course/${courseId}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setCourseData(res.data);
            setLoading(false);
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to load attendance data');
            setLoading(false);
        }
    };

    const handleExportCSV = async () => {
        try {
            const response = await axios.get(`${API_URL}/attendance/course/${courseId}/export`, {
                headers: { Authorization: `Bearer ${token}` },
                responseType: 'blob'
            });

            // Create download link
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `${courseData.course.courseCode}_attendance.csv`);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
        } catch (err) {
            alert('Failed to export CSV');
        }
    };

    // Filter students based on filter and search
    const getFilteredStudents = () => {
        if (!courseData?.students) return [];

        let filtered = courseData.students;

        // Apply filter
        if (filter === 'below75') {
            filtered = filtered.filter(s => !s.meetsMinimum);
        } else if (filter === 'above75') {
            filtered = filtered.filter(s => s.meetsMinimum);
        }

        // Apply search
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            filtered = filtered.filter(s =>
                s.name?.toLowerCase().includes(term) ||
                s.rollNo?.toLowerCase().includes(term)
            );
        }

        return filtered;
    };

    if (loading) {
        return (
            <div className="attendance-page">
                <div className="loading-container">
                    <div className="spinner"></div>
                    <p>Loading attendance data...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="attendance-page">
                <div className="error-container">
                    <p>❌ {error}</p>
                    <button className="btn btn-primary" onClick={() => navigate(-1)}>Go Back</button>
                </div>
            </div>
        );
    }

    const filteredStudents = getFilteredStudents();

    return (
        <div className="attendance-page">
            <header className="attendance-header">
                <div className="header-info">
                    <button className="btn-back" onClick={() => navigate(-1)}>← Back</button>
                    <div>
                        <h1>{courseData.course.courseName}</h1>
                        <p className="course-meta">
                            {courseData.course.courseCode} | {courseData.course.branch} |
                            Year {courseData.course.year} | Sem {courseData.course.semester}
                        </p>
                    </div>
                </div>
                <button className="btn btn-success" onClick={handleExportCSV}>
                    📥 Export CSV
                </button>
            </header>

            {/* Stats Cards */}
            <div className="stats-grid">
                <div className="stat-card">
                    <span className="stat-value">{courseData.stats.totalSessions}</span>
                    <span className="stat-label">Total Sessions</span>
                </div>
                <div className="stat-card">
                    <span className="stat-value">{courseData.stats.totalStudents}</span>
                    <span className="stat-label">Total Students</span>
                </div>
                <div className="stat-card">
                    <span className="stat-value">{courseData.stats.averageAttendance}%</span>
                    <span className="stat-label">Avg Attendance</span>
                </div>
                <div className="stat-card warning">
                    <span className="stat-value">{courseData.stats.studentsBelow75}</span>
                    <span className="stat-label">Below 75%</span>
                </div>
            </div>

            {/* Filters */}
            <div className="filters-bar">
                <div className="search-box">
                    <input
                        type="text"
                        placeholder="🔍 Search by name or roll number..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <div className="filter-buttons">
                    <button
                        className={`filter-btn ${filter === 'all' ? 'active' : ''}`}
                        onClick={() => setFilter('all')}
                    >
                        All ({courseData.students.length})
                    </button>
                    <button
                        className={`filter-btn ${filter === 'below75' ? 'active' : ''}`}
                        onClick={() => setFilter('below75')}
                    >
                        Below 75% ({courseData.stats.studentsBelow75})
                    </button>
                    <button
                        className={`filter-btn ${filter === 'above75' ? 'active' : ''}`}
                        onClick={() => setFilter('above75')}
                    >
                        Above 75% ({courseData.students.length - courseData.stats.studentsBelow75})
                    </button>
                </div>
            </div>

            {/* Students Table */}
            <div className="students-table-container">
                <table className="students-table">
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>Roll Number</th>
                            <th>Name</th>
                            <th>Present</th>
                            <th>Late</th>
                            <th>Total</th>
                            <th>Percentage</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredStudents.length === 0 ? (
                            <tr>
                                <td colSpan="8" className="empty-row">
                                    No students found
                                </td>
                            </tr>
                        ) : (
                            filteredStudents.map((student, index) => (
                                <tr key={student._id || student.rollNo} className={!student.meetsMinimum ? 'below-threshold' : ''}>
                                    <td>{index + 1}</td>
                                    <td className="roll-no">{student.rollNo}</td>
                                    <td className="name">{student.name}</td>
                                    <td className="present">{student.presentCount}</td>
                                    <td className="late">{student.lateCount}</td>
                                    <td>{student.sessionsAttended}/{courseData.stats.totalSessions}</td>
                                    <td className={`percentage ${student.attendancePercentage < 75 ? 'low' : 'good'}`}>
                                        {student.attendancePercentage}%
                                    </td>
                                    <td>
                                        {student.meetsMinimum ? (
                                            <span className="status-badge good">✓ OK</span>
                                        ) : (
                                            <span className="status-badge warning">⚠ Low</span>
                                        )}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Sessions List */}
            <div className="sessions-section">
                <h2>Session History ({courseData.sessions.length})</h2>
                <div className="sessions-grid">
                    {courseData.sessions.map((session, index) => (
                        <div
                            key={session._id}
                            className={`session-card ${session.isActive ? 'active' : ''}`}
                            onClick={() => navigate(`/professor/session/${session._id}`)}
                        >
                            <span className="session-number">#{courseData.sessions.length - index}</span>
                            <span className="session-date">
                                {new Date(session.date).toLocaleDateString('en-IN', {
                                    day: '2-digit',
                                    month: 'short',
                                    year: 'numeric'
                                })}
                            </span>
                            <span className="session-time">
                                {new Date(session.date).toLocaleTimeString('en-IN', {
                                    hour: '2-digit',
                                    minute: '2-digit'
                                })}
                            </span>
                            {session.isActive && <span className="live-badge">LIVE</span>}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default CourseAttendance;

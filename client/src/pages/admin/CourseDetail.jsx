import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import API_URL from '../../config/api';
import { useAuth } from '../../context/AuthContext';
import './CourseDetail.css';

const CourseDetail = () => {
    const { id } = useParams();
    const [course, setCourse] = useState(null);
    const [sessions, setSessions] = useState([]);
    const [enrollments, setEnrollments] = useState([]);
    const [materials, setMaterials] = useState([]);
    const [assignments, setAssignments] = useState([]);
    const [announcements, setAnnouncements] = useState([]);
    const [activeTab, setActiveTab] = useState('sessions');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    // Modal states
    const [showMaterialModal, setShowMaterialModal] = useState(false);
    const [showAnnouncementModal, setShowAnnouncementModal] = useState(false);
    const [showAssignmentModal, setShowAssignmentModal] = useState(false);
    const [newMaterial, setNewMaterial] = useState({ title: '', url: '', description: '', type: 'LINK' });
    const [newAnnouncement, setNewAnnouncement] = useState('');
    const [newAssignment, setNewAssignment] = useState({ title: '', description: '', dueDate: '', points: 0 });
    const [uploadFile, setUploadFile] = useState(null);
    const [uploading, setUploading] = useState(false);

    const { token, logout } = useAuth();
    const navigate = useNavigate();

    useEffect(() => {
        fetchCourse();
        fetchMaterials();
        fetchAnnouncements();
        fetchAssignments();
    }, [id]);

    const fetchCourse = async () => {
        try {
            const res = await axios.get(`${API_URL}/courses/${id}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setCourse(res.data.data);
            setSessions(res.data.data.sessions || []);

            const enrollRes = await axios.get(`${API_URL}/courses/${id}/enrollments`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setEnrollments(enrollRes.data.data || []);
        } catch (err) {
            if (err.response?.status === 401) {
                logout();
                navigate('/login');
            } else {
                setError('Failed to fetch course details');
            }
        } finally {
            setLoading(false);
        }
    };

    const fetchMaterials = async () => {
        try {
            const res = await axios.get(`${API_URL}/courses/${id}/materials`);
            setMaterials(res.data.data || []);
        } catch (err) {
            console.error('Failed to fetch materials:', err);
        }
    };

    const fetchAnnouncements = async () => {
        try {
            const res = await axios.get(`${API_URL}/courses/${id}/announcements`);
            setAnnouncements(res.data.data || []);
        } catch (err) {
            console.error('Failed to fetch announcements:', err);
        }
    };

    const fetchAssignments = async () => {
        try {
            const res = await axios.get(`${API_URL}/courses/${id}/assignments`);
            setAssignments(res.data.data || []);
        } catch (err) {
            console.error('Failed to fetch assignments:', err);
        }
    };

    const handleStartSession = async () => {
        if (!navigator.geolocation) {
            setError('Geolocation is not supported');
            return;
        }

        navigator.geolocation.getCurrentPosition(
            async (position) => {
                try {
                    const res = await axios.post(
                        `${API_URL}/courses/${id}/start-session`,
                        {
                            centerLat: position.coords.latitude,
                            centerLng: position.coords.longitude,
                            radius: course?.defaultLocation?.radius || 50,
                            duration: course?.defaultDuration || 60
                        },
                        { headers: { Authorization: `Bearer ${token}` } }
                    );
                    navigate(`/admin/session/${res.data.data.session._id}`);
                } catch (err) {
                    setError(err.response?.data?.error || 'Failed to start session');
                }
            },
            () => setError('Please enable location to start a session'),
            { enableHighAccuracy: true }
        );
    };

    const handleStopSession = async () => {
        try {
            await axios.post(`${API_URL}/courses/${id}/stop-session`, {}, {
                headers: { Authorization: `Bearer ${token}` }
            });
            fetchCourse();
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to stop session');
        }
    };

    // Materials handlers
    const handleAddLink = async (e) => {
        e.preventDefault();
        try {
            await axios.post(`${API_URL}/courses/${id}/materials`, newMaterial, {
                headers: { Authorization: `Bearer ${token}` }
            });
            fetchMaterials();
            setShowMaterialModal(false);
            setNewMaterial({ title: '', url: '', description: '', type: 'LINK' });
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to add material');
        }
    };

    const handleUploadFile = async (e) => {
        e.preventDefault();
        if (!uploadFile) return;
        setUploading(true);
        try {
            const formData = new FormData();
            formData.append('file', uploadFile);
            formData.append('title', newMaterial.title || uploadFile.name);
            formData.append('description', newMaterial.description);

            await axios.post(`${API_URL}/courses/${id}/materials/upload`, formData, {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'multipart/form-data'
                }
            });
            fetchMaterials();
            setShowMaterialModal(false);
            setNewMaterial({ title: '', url: '', description: '', type: 'LINK' });
            setUploadFile(null);
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to upload file');
        } finally {
            setUploading(false);
        }
    };

    const handleDeleteMaterial = async (materialId) => {
        if (!confirm('Delete this material?')) return;
        try {
            await axios.delete(`${API_URL}/courses/${id}/materials/${materialId}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            fetchMaterials();
        } catch (err) {
            setError('Failed to delete material');
        }
    };

    // Announcements handlers
    const handlePostAnnouncement = async (e) => {
        e.preventDefault();
        try {
            await axios.post(`${API_URL}/courses/${id}/announcements`, { content: newAnnouncement }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            fetchAnnouncements();
            setShowAnnouncementModal(false);
            setNewAnnouncement('');
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to post announcement');
        }
    };

    const handleDeleteAnnouncement = async (announcementId) => {
        if (!confirm('Delete this announcement?')) return;
        try {
            await axios.delete(`${API_URL}/announcements/${announcementId}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            fetchAnnouncements();
        } catch (err) {
            setError('Failed to delete announcement');
        }
    };

    // Assignments handlers
    const handleCreateAssignment = async (e) => {
        e.preventDefault();
        try {
            await axios.post(`${API_URL}/courses/${id}/assignments`, newAssignment, {
                headers: { Authorization: `Bearer ${token}` }
            });
            fetchAssignments();
            setShowAssignmentModal(false);
            setNewAssignment({ title: '', description: '', dueDate: '', points: 0 });
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to create assignment');
        }
    };

    if (loading) {
        return (
            <div className="course-detail-page">
                <div className="loading-container">
                    <div className="spinner spinner-lg"></div>
                    <p>Loading course...</p>
                </div>
            </div>
        );
    }

    if (!course) {
        return (
            <div className="course-detail-page">
                <div className="error-container">
                    <h2>Course not found</h2>
                    <button className="btn btn-primary" onClick={() => navigate('/admin/courses')}>
                        Back to Courses
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="course-detail-page">
            <header className="course-detail-header">
                <button className="back-btn" onClick={() => navigate('/admin/courses')}>← Back</button>
                <div className="header-info">
                    <div className="course-badge">{course.courseCode}</div>
                    <h1>{course.courseName}</h1>
                    {course.semester && <span className="semester">{course.semester}</span>}
                </div>
                <div className="header-actions">
                    {course.activeSession ? (
                        <>
                            <button className="btn btn-danger" onClick={handleStopSession}>⏹ Stop</button>
                            <button className="btn btn-secondary" onClick={() => navigate(`/admin/session/${course.activeSession._id || course.activeSession}`)}>
                                📺 Live
                            </button>
                        </>
                    ) : (
                        <button className="btn btn-success" onClick={handleStartSession}>
                            ▶ Start Session {course.totalSessions + 1}
                        </button>
                    )}
                </div>
            </header>

            {error && (
                <div className="alert alert-error" style={{ margin: 'var(--space-4) var(--space-6)' }}>
                    {error}
                    <button onClick={() => setError('')}>×</button>
                </div>
            )}

            <div className="tabs">
                <button className={`tab ${activeTab === 'sessions' ? 'active' : ''}`} onClick={() => setActiveTab('sessions')}>
                    📅 Sessions ({sessions.length})
                </button>
                <button className={`tab ${activeTab === 'materials' ? 'active' : ''}`} onClick={() => setActiveTab('materials')}>
                    📁 Materials ({materials.length})
                </button>
                <button className={`tab ${activeTab === 'assignments' ? 'active' : ''}`} onClick={() => setActiveTab('assignments')}>
                    📝 Assignments ({assignments.length})
                </button>
                <button className={`tab ${activeTab === 'announcements' ? 'active' : ''}`} onClick={() => setActiveTab('announcements')}>
                    📢 Announcements ({announcements.length})
                </button>
                <button className={`tab ${activeTab === 'students' ? 'active' : ''}`} onClick={() => setActiveTab('students')}>
                    👥 Students ({enrollments.length})
                </button>
            </div>

            <div className="tab-content">
                {/* Sessions Tab */}
                {activeTab === 'sessions' && (
                    <div className="sessions-list">
                        {sessions.length === 0 ? (
                            <div className="empty-state"><p>No sessions yet. Start your first session!</p></div>
                        ) : (
                            sessions.map(session => (
                                <div key={session._id} className={`session-row ${session.isActive ? 'active' : ''}`}
                                    onClick={() => navigate(`/admin/session/${session._id}`)}>
                                    <div className="session-number">#{session.sessionNumber}</div>
                                    <div className="session-info">
                                        <div className="session-date">
                                            {new Date(session.startTime).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}
                                        </div>
                                    </div>
                                    <div className="session-status">
                                        {session.isActive ? <span className="badge badge-live">🔴 LIVE</span> : <span className="badge badge-done">✓</span>}
                                    </div>
                                    <div className="session-arrow">→</div>
                                </div>
                            ))
                        )}
                    </div>
                )}

                {/* Materials Tab */}
                {activeTab === 'materials' && (
                    <div className="materials-section">
                        <button className="btn btn-primary add-btn" onClick={() => setShowMaterialModal(true)}>
                            + Add Material
                        </button>
                        {materials.length === 0 ? (
                            <div className="empty-state"><p>No materials yet. Add links or upload files.</p></div>
                        ) : (
                            <div className="materials-list">
                                {materials.map(material => (
                                    <div key={material._id} className="material-item">
                                        <div className="material-icon">
                                            {material.type === 'LINK' ? '🔗' : '📄'}
                                        </div>
                                        <div className="material-info">
                                            <h4>{material.title}</h4>
                                            {material.description && <p>{material.description}</p>}
                                            <span className="material-meta">
                                                {material.type === 'FILE' && `${Math.round(material.fileSize / 1024)}KB • `}
                                                {new Date(material.createdAt).toLocaleDateString()}
                                            </span>
                                        </div>
                                        <div className="material-actions">
                                            {material.type === 'LINK' ? (
                                                <a href={material.url} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-sm">
                                                    Open ↗
                                                </a>
                                            ) : (
                                                <a href={`${API_URL}/courses/${id}/materials/${material._id}/download`} className="btn btn-secondary btn-sm">
                                                    Download
                                                </a>
                                            )}
                                            <button className="btn btn-ghost btn-sm" onClick={() => handleDeleteMaterial(material._id)}>🗑</button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Assignments Tab */}
                {activeTab === 'assignments' && (
                    <div className="assignments-section">
                        <button className="btn btn-primary add-btn" onClick={() => setShowAssignmentModal(true)}>
                            + Create Assignment
                        </button>
                        {assignments.length === 0 ? (
                            <div className="empty-state"><p>No assignments yet.</p></div>
                        ) : (
                            <div className="assignments-list">
                                {assignments.map(assignment => (
                                    <div key={assignment._id} className="assignment-item" onClick={() => navigate(`/admin/assignments/${assignment._id}`)}>
                                        <div className="assignment-icon">📝</div>
                                        <div className="assignment-info">
                                            <h4>{assignment.title}</h4>
                                            <p className="due-date">
                                                Due: {new Date(assignment.dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                            </p>
                                        </div>
                                        <div className="assignment-meta">
                                            {assignment.points > 0 && <span className="points">{assignment.points} pts</span>}
                                            <span className="submissions">{assignment.submissionCount || 0} submitted</span>
                                        </div>
                                        <div className="session-arrow">→</div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Announcements Tab */}
                {activeTab === 'announcements' && (
                    <div className="announcements-section">
                        <button className="btn btn-primary add-btn" onClick={() => setShowAnnouncementModal(true)}>
                            + Post Announcement
                        </button>
                        {announcements.length === 0 ? (
                            <div className="empty-state"><p>No announcements yet.</p></div>
                        ) : (
                            <div className="announcements-list">
                                {announcements.map(announcement => (
                                    <div key={announcement._id} className={`announcement-item ${announcement.isPinned ? 'pinned' : ''}`}>
                                        {announcement.isPinned && <span className="pin-badge">📌 Pinned</span>}
                                        <p>{announcement.content}</p>
                                        <div className="announcement-footer">
                                            <span className="announcement-date">
                                                {new Date(announcement.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                            <button className="btn btn-ghost btn-sm" onClick={() => handleDeleteAnnouncement(announcement._id)}>🗑</button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Students Tab */}
                {activeTab === 'students' && (
                    <div className="students-list">
                        {enrollments.length === 0 ? (
                            <div className="empty-state"><p>No students enrolled yet.</p></div>
                        ) : (
                            <table className="students-table">
                                <thead>
                                    <tr><th>Roll No</th><th>Name</th><th>Attendance</th><th>%</th></tr>
                                </thead>
                                <tbody>
                                    {enrollments.map(enrollment => (
                                        <tr key={enrollment._id}>
                                            <td className="roll-no">{enrollment.studentId}</td>
                                            <td>{enrollment.studentName}</td>
                                            <td>{enrollment.attendanceCount} / {course.totalSessions}</td>
                                            <td>
                                                <div className="percentage-bar">
                                                    <div className="percentage-fill" style={{ width: `${enrollment.attendancePercentage || 0}%` }}></div>
                                                    <span>{enrollment.attendancePercentage || 0}%</span>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                )}
            </div>

            {/* Material Modal */}
            {showMaterialModal && (
                <div className="modal-overlay" onClick={() => setShowMaterialModal(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>Add Material</h2>
                            <button className="modal-close" onClick={() => setShowMaterialModal(false)}>×</button>
                        </div>
                        <div className="modal-tabs">
                            <button className={newMaterial.type === 'LINK' ? 'active' : ''} onClick={() => setNewMaterial({ ...newMaterial, type: 'LINK' })}>
                                🔗 Link
                            </button>
                            <button className={newMaterial.type === 'FILE' ? 'active' : ''} onClick={() => setNewMaterial({ ...newMaterial, type: 'FILE' })}>
                                📄 File
                            </button>
                        </div>
                        {newMaterial.type === 'LINK' ? (
                            <form onSubmit={handleAddLink}>
                                <div className="form-group">
                                    <label>Title *</label>
                                    <input type="text" className="form-input" value={newMaterial.title}
                                        onChange={e => setNewMaterial({ ...newMaterial, title: e.target.value })} required />
                                </div>
                                <div className="form-group">
                                    <label>URL *</label>
                                    <input type="url" className="form-input" value={newMaterial.url}
                                        onChange={e => setNewMaterial({ ...newMaterial, url: e.target.value })} required />
                                </div>
                                <div className="form-group">
                                    <label>Description</label>
                                    <textarea className="form-input" value={newMaterial.description}
                                        onChange={e => setNewMaterial({ ...newMaterial, description: e.target.value })} rows={2} />
                                </div>
                                <div className="modal-actions">
                                    <button type="button" className="btn btn-secondary" onClick={() => setShowMaterialModal(false)}>Cancel</button>
                                    <button type="submit" className="btn btn-primary">Add Link</button>
                                </div>
                            </form>
                        ) : (
                            <form onSubmit={handleUploadFile}>
                                <div className="form-group">
                                    <label>File *</label>
                                    <input type="file" className="form-input" onChange={e => setUploadFile(e.target.files[0])} required />
                                </div>
                                <div className="form-group">
                                    <label>Title (optional)</label>
                                    <input type="text" className="form-input" value={newMaterial.title}
                                        onChange={e => setNewMaterial({ ...newMaterial, title: e.target.value })} />
                                </div>
                                <div className="modal-actions">
                                    <button type="button" className="btn btn-secondary" onClick={() => setShowMaterialModal(false)}>Cancel</button>
                                    <button type="submit" className="btn btn-primary" disabled={uploading}>
                                        {uploading ? 'Uploading...' : 'Upload File'}
                                    </button>
                                </div>
                            </form>
                        )}
                    </div>
                </div>
            )}

            {/* Announcement Modal */}
            {showAnnouncementModal && (
                <div className="modal-overlay" onClick={() => setShowAnnouncementModal(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>Post Announcement</h2>
                            <button className="modal-close" onClick={() => setShowAnnouncementModal(false)}>×</button>
                        </div>
                        <form onSubmit={handlePostAnnouncement}>
                            <div className="form-group">
                                <label>Message</label>
                                <textarea className="form-input" value={newAnnouncement}
                                    onChange={e => setNewAnnouncement(e.target.value)} rows={4} required
                                    placeholder="Share an update with your class..." />
                            </div>
                            <div className="modal-actions">
                                <button type="button" className="btn btn-secondary" onClick={() => setShowAnnouncementModal(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary">Post</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Assignment Modal */}
            {showAssignmentModal && (
                <div className="modal-overlay" onClick={() => setShowAssignmentModal(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>Create Assignment</h2>
                            <button className="modal-close" onClick={() => setShowAssignmentModal(false)}>×</button>
                        </div>
                        <form onSubmit={handleCreateAssignment}>
                            <div className="form-group">
                                <label>Title *</label>
                                <input type="text" className="form-input" value={newAssignment.title}
                                    onChange={e => setNewAssignment({ ...newAssignment, title: e.target.value })} required />
                            </div>
                            <div className="form-group">
                                <label>Description</label>
                                <textarea className="form-input" value={newAssignment.description}
                                    onChange={e => setNewAssignment({ ...newAssignment, description: e.target.value })} rows={3} />
                            </div>
                            <div className="form-row">
                                <div className="form-group">
                                    <label>Due Date *</label>
                                    <input type="datetime-local" className="form-input" value={newAssignment.dueDate}
                                        onChange={e => setNewAssignment({ ...newAssignment, dueDate: e.target.value })} required />
                                </div>
                                <div className="form-group">
                                    <label>Points</label>
                                    <input type="number" className="form-input" value={newAssignment.points}
                                        onChange={e => setNewAssignment({ ...newAssignment, points: parseInt(e.target.value) || 0 })} min={0} />
                                </div>
                            </div>
                            <div className="modal-actions">
                                <button type="button" className="btn btn-secondary" onClick={() => setShowAssignmentModal(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary">Create</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CourseDetail;

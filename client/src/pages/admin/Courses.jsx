    import { useState, useEffect } from 'react';
    import { useNavigate, Link } from 'react-router-dom';
    import axios from 'axios';
    import { toast } from 'react-toastify';
    import API_URL from '../../config/api';
    import { useAuth } from '../../context/AuthContext';
    import ThemeToggle from '../../components/ThemeToggle';
    import './Courses.css';



    const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    const SAMPLE_CSV = `courseCode,courseName,description,credits,branch,semester,batch,day,startTime,endTime,room
    CS101,Programming Fundamentals,Introduction to Programming,4,cs,1,all,Monday,09:00,10:00,CS-101
    CS101,Programming Fundamentals,Introduction to Programming,4,cs,1,all,Wednesday,09:00,10:00,CS-101
    STAT201,Statistical Inference,Hypothesis Testing,4,stat,3,all,Tuesday,11:00,12:00,STAT-201`;

    const AdminCourses = () => {
        const [courses, setCourses] = useState([]);
        const [loading, setLoading] = useState(true);
        const [showModal, setShowModal] = useState(false);
        const [modalTab, setModalTab] = useState('single');
        const [editingCourse, setEditingCourse] = useState(null);
        const [filter, setFilter] = useState({ branch: '', semester: '', claimed: '' });
        const [searchQuery, setSearchQuery] = useState('');
        const [viewMode, setViewMode] = useState('grid'); // 'grid' or 'list'

        // Single course form
        const [formData, setFormData] = useState({
            courseCode: "",
            courseName: "",
            description: "",
            credits: 4,
            branch: "",
            semester: 1,
            batch: "all",

            schedules: [
                {
                    day: "Monday",
                    startTime: "09:00",
                    endTime: "10:00",
                    room: ""
                }
            ],

            defaultDuration: 60,
            lateThreshold: 15
        });

        ////////
        const [branches, setBranches] = useState([]);
        
        const fetchBranches = async () => {
            try {
                const res = await axios.get(`${API_URL}/admin/courses/branches`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                setBranches(res.data.data || []);
            } catch (error) {
                toast.error('Failed to load available branches');
            }
        };

        // Bulk import
        const [csvFile, setCsvFile] = useState(null);
        const [importResult, setImportResult] = useState(null);
        const [saving, setSaving] = useState(false);

        const { token, user, logout } = useAuth();
        const navigate = useNavigate();

        useEffect(() => { fetchCourses(); }, [filter]);
        useEffect(() => {
            fetchBranches();
        }, []);
        const fetchCourses = async () => {
            try {
                const params = new URLSearchParams();
                if (filter.branch) params.append('branch', filter.branch);
                if (filter.semester) params.append("semester", filter.semester);
                if (filter.claimed) params.append('claimed', filter.claimed);
                const res = await axios.get(`${API_URL}/admin/courses?${params}`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                setCourses(res.data.data);
            } catch (err) {
                if (err.response?.status === 401) { logout(); navigate('/admin/login'); }
                else toast.error('Failed to fetch courses');
            } finally { setLoading(false); }
        };

        const resetForm = () => {
            setFormData({
                courseCode: "",
                courseName: "",
                description: "",
                credits: 4,
                branch: "",
                semester: 1,
                batch: "all",
                schedules: [
                    {
                        day: "Monday",
                        startTime: "09:00",
                        endTime: "10:00",
                        room: ""
                    }
                ],
                defaultDuration: 60,
                lateThreshold: 15
            });

            setEditingCourse(null);
            setCsvFile(null);
            setImportResult(null);
        };

        const handleSubmit = async (e) => {
            e.preventDefault();
            setSaving(true);
            try {
                if (editingCourse) {
                    await axios.put(`${API_URL}/admin/courses/${editingCourse._id}`, formData, {
                        headers: { Authorization: `Bearer ${token}` }
                    });
                    toast.success('Course updated successfully');
                } else {
                    await axios.post(`${API_URL}/admin/courses`, formData, {
                        headers: { Authorization: `Bearer ${token}` }
                    });
                    toast.success('Course created successfully');
                }
                setShowModal(false);
                resetForm();
                fetchCourses();
            } catch (err) {
                toast.error(err.response?.data?.error || 'Failed to save course');
            } finally { setSaving(false); }
        };


        const handleBulkImport = async () => {
            if (!csvFile) {
                toast.error("Please choose a CSV file.");
                return;
            }

            setSaving(true);
            setImportResult(null);

            try {

                const formData = new FormData();
                formData.append("file", csvFile);

                const res = await axios.post(
                    `${API_URL}/admin/courses/import`,
                    formData,
                    {
                        headers: {
                            Authorization: `Bearer ${token}`,
                        }
                    }
                );

                setImportResult(res.data.data);
                toast.success(res.data.message);
                fetchCourses();

            } catch (err) {

                toast.error(
                    err.response?.data?.error || "Bulk import failed"
                );

            } finally {
                setSaving(false);
            }
        };

        const handleEdit = (course) => {
            setFormData({
                courseCode: course.courseCode, courseName: course.courseName,
                description: course.description || '', branch: course.branch,
                semester: course.semester,
                credits: course.credits ?? 4,
                batch: course.batch || 'all',
                schedules: course.schedules?.length > 0
                    ? course.schedules
                    : [{ day: 'Monday', startTime: '09:00', endTime: '10:00', room: '' }],
                defaultDuration: course.defaultDuration || 60, lateThreshold: course.lateThreshold || 15
            });
            setEditingCourse(course);
            setModalTab('single');
            setShowModal(true);
        };

        const handleDelete = async (course) => {
            if (!confirm(`Archive "${course.courseName}"?`)) return;
            try {
                await axios.delete(`${API_URL}/admin/courses/${course._id}`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                toast.success('Course archived');
                fetchCourses();
            } catch (err) { toast.error(err.response?.data?.error || 'Failed to archive'); }
        };

        const getBranchName = (code) => branches.find(b => b.code === code)?.name || code?.toUpperCase();
        const getBranchShort = (code) => code?.toUpperCase() || '';

        // Filter courses by search
        const query = searchQuery.toLowerCase();

        const filteredCourses = courses.filter(c =>
            c.courseName.toLowerCase().includes(query) ||
            c.courseCode.toLowerCase().includes(query) ||
            c.branch.toLowerCase().includes(query) ||
            c.description?.toLowerCase().includes(query)
        );
        // Stats
        const stats = {
            total: courses.length,
            claimed: courses.filter(c => c.claimedBy?.length > 0).length,
            unclaimed: courses.filter(c => !c.claimedBy?.length).length
        };

        // Skeleton component
        const SkeletonCard = () => (
            <div className="skeleton-course-card">
                <div className="skeleton-line short shimmer"></div>
                <div className="skeleton-line shimmer"></div>
                <div className="skeleton-line shimmer"></div>
            </div>
        );

        return (
            <div className="courses-page">
                {/* Header */}
                <header className="courses-header">
                    <div className="header-left">
                        <Link to="/admin/dashboard" className="btn-back">← Back</Link>
                        <div className="header-title">
                            <h1>📚 Course Management</h1>
                            <p>Create, edit, and manage all courses</p>
                        </div>
                    </div>
                    <div className="header-right">
                        <ThemeToggle />
                        <button className="header-avatar" onClick={() => { logout(); navigate('/'); }}>
                            {user?.name?.charAt(0)?.toUpperCase() || 'A'}
                        </button>
                    </div>
                </header>

                <main className="courses-content">
                    {/* Stats Bar */}
                    <div className="stats-bar">
                        <div className="stat-item">
                            <span className="stat-value">{stats.total}</span>
                            <span className="stat-label">Total</span>
                        </div>
                        <div className="stat-divider"></div>
                        <div className="stat-item claimed">
                            <span className="stat-value">{stats.claimed}</span>
                            <span className="stat-label">Claimed</span>
                        </div>
                        <div className="stat-divider"></div>
                        <div className="stat-item unclaimed">
                            <span className="stat-value">{stats.unclaimed}</span>
                            <span className="stat-label">Unclaimed</span>
                        </div>
                    </div>

                    {/* Action Bar */}
                    <div className="action-bar">
                        <div className="search-box">
                            <span className="search-icon">🔍</span>
                            <input
                                type="text"
                                placeholder="Search courses..."
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                className="search-input"
                            />
                            {searchQuery && (
                                <button className="search-clear" onClick={() => setSearchQuery('')}>×</button>
                            )}
                        </div>
                        <div className="action-buttons">
                            <button
                                className="btn btn-primary"
                                onClick={() => { resetForm(); setModalTab('single'); setShowModal(true); }}
                            >
                                <span>+</span> Create
                            </button>
                            <button
                                className="btn btn-secondary"
                                onClick={() => { resetForm(); setModalTab('bulk'); setShowModal(true); }}
                            >
                                <span>📥</span> Import
                            </button>
                        </div>
                    </div>

                    {/* Filters */}
                    <div className="filters-section">
                        <div className="filters-row">
                            <select
                                value={filter.branch}
                                onChange={(e) => setFilter({ ...filter, branch: e.target.value })}
                                className="filter-select"
                            >
                                <option value="">All Branches</option>
                                {branches.map(b => <option key={b.code} value={b.code}>{b.name}</option>)}
                            </select>
                            <select
                                value={filter.semester}
                                onChange={(e) => setFilter({ ...filter, semester: e.target.value })}
                                className="filter-select"
                            >
                                <option value="">All Semesters</option>
                                {[1, 2, 3, 4, 5, 6, 7, 8].map(s => (
                                    <option key={s} value={s}>
                                        Semester {s}
                                    </option>
                                ))}
                            </select>
                            <select
                                value={filter.claimed}
                                onChange={(e) => setFilter({ ...filter, claimed: e.target.value })}
                                className="filter-select"
                            >
                                <option value="">All Status</option>
                                <option value="true">Claimed</option>
                                <option value="false">Unclaimed</option>
                            </select>
                        </div>
                        <div className="view-toggle">
                            <button
                                className={`view-btn ${viewMode === 'grid' ? 'active' : ''}`}
                                onClick={() => setViewMode('grid')}
                                title="Grid View"
                            >
                                ▦
                            </button>
                            <button
                                className={`view-btn ${viewMode === 'list' ? 'active' : ''}`}
                                onClick={() => setViewMode('list')}
                                title="List View"
                            >
                                ☰
                            </button>
                        </div>
                    </div>

                    {/* Results Count */}
                    <div className="results-info">
                        <span>{filteredCourses.length} courses found</span>
                        {searchQuery && <span className="search-term">for "{searchQuery}"</span>}
                    </div>

                    {/* Courses Display */}
                    {loading ? (
                        <div className={`courses-${viewMode}`}>
                            <SkeletonCard />
                            <SkeletonCard />
                            <SkeletonCard />
                            <SkeletonCard />
                            <SkeletonCard />
                            <SkeletonCard />
                        </div>
                    ) : filteredCourses.length === 0 ? (
                        <div className="empty-state">
                            <div className="empty-icon">📚</div>
                            <h3>No courses found</h3>
                            <p>{searchQuery ? 'Try a different search term' : 'Create your first course or use bulk import'}</p>
                            <div className="empty-actions">
                                <button
                                    className="btn btn-primary"
                                    onClick={() => { resetForm(); setModalTab('single'); setShowModal(true); }}
                                >
                                    + Create Course
                                </button>
                                <button
                                    className="btn btn-secondary"
                                    onClick={() => { resetForm(); setModalTab('bulk'); setShowModal(true); }}
                                >
                                    📥 Bulk Import
                                </button>
                            </div>
                        </div>
                    ) : viewMode === 'grid' ? (
                        <div className="courses-grid">
                            {filteredCourses.map((course, idx) => (
                                <div
                                    key={course._id}
                                    className={`course-card ${course.claimedBy?.length > 0 ? 'claimed' : 'unclaimed'}`}
                                    style={{ '--delay': `${idx * 0.05}s` }}
                                >
                                    <div className="card-header">
                                        <span className="course-code-badge">{course.courseCode}</span>
                                        <span className={`status-badge ${course.claimedBy?.length > 0 ? 'claimed' : 'unclaimed'}`}>
                                            {course.claimedBy?.length > 0 ? '✓' : '○'}
                                        </span>
                                    </div>
                                    <h3 className="course-name">{course.courseName}</h3>
                                    <div className="course-meta">
                                        <span className="meta-tag branch">{getBranchShort(course.branch)}</span>
                                        <span className="meta-tag">S{course.semester}</span>
                                        <span className="meta-tag batch">
                                            {course.batch === 'all' ? 'All' : `B${course.batch}`}
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
                                    {course.claimedBy?.length > 0 && (
                                        <div className="claimed-by">
                                            <span className="claimed-icon">👨‍🏫</span>
                                            <span className="claimed-names">
                                                {course.claimedBy.map(p => p.name.split(' ')[0]).join(', ')}
                                            </span>
                                        </div>
                                    )}
                                    <div className="card-actions">
                                        <button
                                            className="action-btn edit"
                                            onClick={() => handleEdit(course)}
                                            title="Edit"
                                        >
                                            ✏️
                                        </button>
                                        <button
                                            className="action-btn view"
                                            onClick={() => navigate(`/admin/courses/${course._id}`)}
                                            title="Details"
                                        >
                                            📊
                                        </button>
                                        <button
                                            className="action-btn delete"
                                            onClick={() => handleDelete(course)}
                                            title="Archive"
                                        >
                                            🗑️
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="courses-list">
                            {filteredCourses.map((course, idx) => (
                                <div
                                    key={course._id}
                                    className={`course-row ${course.claimedBy?.length > 0 ? 'claimed' : 'unclaimed'}`}
                                    style={{ '--delay': `${idx * 0.03}s` }}
                                >
                                    <div className="row-main">
                                        <span className="course-code-badge">{course.courseCode}</span>
                                        <div className="row-info">
                                            <span className="row-name">{course.courseName}</span>
                                            <span className="row-meta">
                                                {getBranchName(course.branch)} • Sem {course.semester}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="row-middle">
                                        {course.claimedBy?.length > 0 ? (
                                            <span className="row-professor">
                                                👨‍🏫 {course.claimedBy[0]?.name}
                                                {course.claimedBy.length > 1 && ` +${course.claimedBy.length - 1}`}
                                            </span>
                                        ) : (
                                            <span className="row-unclaimed">Not claimed</span>
                                        )}
                                    </div>
                                    <div className="row-actions">
                                        <button className="btn-sm" onClick={() => handleEdit(course)}>Edit</button>
                                        <button className="btn-sm" onClick={() => navigate(`/admin/courses/${course._id}`)}>Details</button>
                                        <button className="btn-sm danger" onClick={() => handleDelete(course)}>🗑️</button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </main>

                {/* Mobile Bottom Bar */}
                <div className="mobile-bottom-bar">
                    <button
                        className="mobile-action-btn primary"
                        onClick={() => { resetForm(); setModalTab('single'); setShowModal(true); }}
                    >
                        <span>+</span> Create
                    </button>
                    <button
                        className="mobile-action-btn secondary"
                        onClick={() => { resetForm(); setModalTab('bulk'); setShowModal(true); }}
                    >
                        <span>📥</span> Import
                    </button>
                </div>

                {/* Create/Edit/Bulk Modal */}
                {showModal && (
                    <div className="modal-overlay" onClick={() => setShowModal(false)}>
                        <div className="modal glass-modal" onClick={e => e.stopPropagation()}>
                            <div className="modal-header">
                                <h2>{editingCourse ? '✏️ Edit Course' : '📚 Add Course'}</h2>
                                <button className="modal-close" onClick={() => setShowModal(false)}>×</button>
                            </div>

                            {/* Tab Switcher (only for new courses) */}
                            {!editingCourse && (
                                <div className="modal-tabs">
                                    <button
                                        className={`modal-tab ${modalTab === 'single' ? 'active' : ''}`}
                                        onClick={() => setModalTab('single')}
                                    >
                                        <span>📝</span> Single Course
                                    </button>
                                    <button
                                        className={`modal-tab ${modalTab === 'bulk' ? 'active' : ''}`}
                                        onClick={() => setModalTab('bulk')}
                                    >
                                        <span>📥</span> Bulk Import
                                    </button>
                                </div>
                            )}

                            <div className="modal-body">
                                {/* Single Course Form */}
                                {modalTab === 'single' && (
                                    <form onSubmit={handleSubmit}>
                                        <div className="form-section">
                                            <h4 className="section-title">📋 Basic Info</h4>
                                            <div className="form-row">
                                                <div className="form-group">
                                                    <label>Course Code *</label>
                                                    <input
                                                        type="text"
                                                        placeholder="e.g., CS101"
                                                        value={formData.courseCode}
                                                        onChange={e => setFormData({ ...formData, courseCode: e.target.value })}
                                                        required
                                                        disabled={!!editingCourse}
                                                        className="form-input"
                                                    />
                                                </div>
                                                <div className="form-group">
                                                    <label>Course Name *</label>
                                                    <input
                                                        type="text"
                                                        placeholder="e.g., Data Structures"
                                                        value={formData.courseName}
                                                        onChange={e => setFormData({ ...formData, courseName: e.target.value })}
                                                        required
                                                        className="form-input"
                                                    />
                                                </div>

                                                <div className="form-group">
                                                    <label>Description</label>
                                                    <textarea
                                                        rows={3}
                                                        value={formData.description}
                                                        onChange={e =>
                                                            setFormData({
                                                                ...formData,
                                                                description: e.target.value
                                                            })
                                                        }
                                                        placeholder="Brief description..."
                                                        className="form-input"
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        <div className="form-section">
                                            <h4 className="section-title">🎓 Classification</h4>
                                            <div className="form-row four-col">
                                                <div className="form-group">
                                                    <label>Branch *</label>
                                                    <select
                                                        value={formData.branch}
                                                        onChange={e => setFormData({ ...formData, branch: e.target.value })}
                                                        required
                                                        disabled={!!editingCourse}
                                                        className="form-input"
                                                    >
                                                        <option value="">Select</option>
                                                        {branches.map(b => <option key={b.code} value={b.code}>{b.name}</option>)}
                                                    </select>
                                                </div>
                                                <div className="form-group">
                                                    <label>Semester *</label>
                                                    <select
                                                        value={formData.semester}
                                                        onChange={e => setFormData({ ...formData, semester: parseInt(e.target.value) })}
                                                        required
                                                        className="form-input"
                                                    >
                                                        {[1, 2, 3, 4, 5, 6, 7, 8].map(s => <option key={s} value={s}>Sem {s}</option>)}
                                                    </select>
                                                </div>
                                                <div className="form-group">
                                                    <label>Batch *</label>
                                                    <select
                                                        value={formData.batch}
                                                        onChange={e => setFormData({ ...formData, batch: e.target.value })}
                                                        required
                                                        className="form-input"
                                                    >
                                                        <option value="all">All Batches</option>
                                                        {['1', '2', '3', '4', '5'].map(b => <option key={b} value={b}>Batch {b}</option>)}
                                                    </select>
                                                </div>
                                                <div className="form-group">
                                                    <label>Credits </label>
                                                    <input
                                                        type="number"
                                                        min={1}
                                                        value={formData.credits}
                                                        onChange={e =>
                                                            setFormData({
                                                                ...formData,
                                                                credits: Number(e.target.value)
                                                            })
                                                        }
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        <div className="form-section">
                                            <div className="section-header">
                                                <h4 className="section-title">📅 Schedule</h4>
                                                <button
                                                    type="button"
                                                    className="btn-add-schedule"
                                                    onClick={() => setFormData({
                                                        ...formData,
                                                        schedules: [...formData.schedules, { day: 'Monday', startTime: '09:00', endTime: '10:00', room: '' }]
                                                    })}
                                                >
                                                    + Add
                                                </button>
                                            </div>
                                            <div className="schedules-list">
                                                {formData.schedules.map((sched, idx) => (
                                                    <div key={idx} className="schedule-row">
                                                        <select
                                                            value={sched.day}
                                                            onChange={e => {
                                                                const newSchedules = [...formData.schedules];
                                                                newSchedules[idx] = { ...newSchedules[idx], day: e.target.value };
                                                                setFormData({ ...formData, schedules: newSchedules });
                                                            }}
                                                            className="schedule-input day"
                                                        >
                                                            {DAYS.map(d => <option key={d} value={d}>{d}</option>)}
                                                        </select>
                                                        <input
                                                            type="time"
                                                            value={sched.startTime}
                                                            onChange={e => {
                                                                const newSchedules = [...formData.schedules];
                                                                newSchedules[idx] = { ...newSchedules[idx], startTime: e.target.value };
                                                                setFormData({ ...formData, schedules: newSchedules });
                                                            }}
                                                            className="schedule-input time"
                                                        />
                                                        <span className="schedule-separator">→</span>
                                                        <input
                                                            type="time"
                                                            value={sched.endTime}
                                                            onChange={e => {
                                                                const newSchedules = [...formData.schedules];
                                                                newSchedules[idx] = { ...newSchedules[idx], endTime: e.target.value };
                                                                setFormData({ ...formData, schedules: newSchedules });
                                                            }}
                                                            className="schedule-input time"
                                                        />
                                                        <input
                                                            type="text"
                                                            placeholder="Room"
                                                            value={sched.room}
                                                            onChange={e => {
                                                                const newSchedules = [...formData.schedules];
                                                                newSchedules[idx] = { ...newSchedules[idx], room: e.target.value };
                                                                setFormData({ ...formData, schedules: newSchedules });
                                                            }}
                                                            className="schedule-input room"
                                                        />
                                                        {formData.schedules.length > 1 && (
                                                            <button
                                                                type="button"
                                                                className="btn-remove-schedule"
                                                                onClick={() => {
                                                                    const newSchedules = formData.schedules.filter((_, i) => i !== idx);
                                                                    setFormData({ ...formData, schedules: newSchedules });
                                                                }}
                                                            >
                                                                ×
                                                            </button>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        <div className="modal-actions">
                                            <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>
                                                Cancel
                                            </button>
                                            <button type="submit" className="btn btn-primary" disabled={saving}>
                                                {saving ? 'Saving...' : (editingCourse ? 'Update Course' : 'Create Course')}
                                            </button>
                                        </div>
                                    </form>
                                )}

                                {/* Bulk Import Tab */}
                                {modalTab === 'bulk' && (
                                    <div className="bulk-import-section">
                                        <div className="json-help">
                                            <h4>📋 CSV Format</h4>
                                            <p>Paste your timetable in this CSV format:</p>
                                            <pre className="csv-example">
                                                {SAMPLE_CSV}
                                            </pre>
                                            <div className="format-notes">
                                                <span><strong>Branch:</strong> cs,it,stat,math,phy,chem,bio,comm,mgmt,eco,eng,psych</span>
                                                <span><strong>Days:</strong> Monday - Saturday</span>
                                            </div>
                                        </div>

                                        <div className="form-group">
                                            <label>Paste CSV:</label>
                                            <input
                                                type="file"
                                                accept=".csv"
                                                onChange={(e) => setCsvFile(e.target.files[0])}
                                                className="form-input"
                                            />
                                        </div>

                                        {importResult && (
                                            <div className="import-result">
                                                <h4>Import Results</h4>
                                                <div className="result-stats">
                                                    <span className="result-stat success">✅ {importResult.total || 0} Total</span>
                                                    <span className="result-stat success">✅ {importResult.imported || 0} Created</span>
                                                    <span className="result-stat warning">⏭️ {importResult.skipped?.length || 0} Skipped</span>
                                                    <span className="result-stat error">❌ {importResult.failed?.length || 0} Failed</span>
                                                </div>
                                                {importResult.failed?.length > 0 && (
                                                    <div className="failed-items">
                                                        {importResult.failed.map((f, i) => (
                                                            <div key={i} className="failed-item">
                                                                <span className="failed-code">{f.courseCode}</span>
                                                                <span className="failed-error">{f.reason || f.error}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        <div className="modal-actions">
                                            <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>
                                                Cancel
                                            </button>
                                            <button
                                                type="button"
                                                className="btn btn-success"
                                                onClick={handleBulkImport}
                                                disabled={saving || !csvFile}
                                            >
                                                {saving ? 'Importing...' : '📥 Import Courses'}
                                            </button>
                                        </div>
                                    </div >
                                )}
                            </div >
                        </div >
                    </div >
                )}
            </div >
        );
    };

    export default AdminCourses;

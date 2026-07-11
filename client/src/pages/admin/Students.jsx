import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'react-toastify';
import { useAuth } from '../../context/AuthContext';
import API_URL from '../../config/api';
import './Students.css';

const Students = () => {
    const { token } = useAuth();

    const [students, setStudents] = useState([]);
    const [batches, setBatches] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedBatch, setSelectedBatch] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedFile, setSelectedFile] = useState(null);

    // Upload modal state
    const [showUploadModal, setShowUploadModal] = useState(false);

    const [uploadLoading, setUploadLoading] = useState(false);
    const [uploadResult, setUploadResult] = useState(null);

    useEffect(() => {
        fetchStudents();
    }, [selectedBatch, searchQuery]);

    const fetchStudents = async () => {
        try {
            const params = new URLSearchParams();
            if (selectedBatch) params.append('batch', selectedBatch);
            if (searchQuery) params.append('search', searchQuery);

            const res = await axios.get(`${API_URL}/students?${params}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setStudents(res.data.data || []);
            setBatches(res.data.batches || []);
        } catch (error) {
            console.error('Failed to fetch students:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleUpload = async () => {
        if (!selectedFile) {
            toast.error("Please select a CSV file.");
            return;
        }

        setUploadLoading(true);

        try {
            const formData = new FormData();
            formData.append("file", selectedFile);

            const res = await axios.post(
                `${API_URL}/students/upload`,
                formData,
                {
                    headers: {
                        Authorization: `Bearer ${token}`
                    }
                }
            );

            if (res.data.success) {

                setUploadResult(res.data);

                await fetchStudents();

                setSelectedFile(null);
                setShowUploadModal(false);

                toast.success("Students imported successfully!");

            } else {

                setUploadResult(res.data);

                toast.error(res.data.error || "Upload failed");

            }

        } catch (error) {

            setUploadResult({
                success: false,
                error: error.response?.data?.error || "Upload failed"
            });

            toast.error(error.response?.data?.error || "Upload failed");

        } finally {

            setUploadLoading(false);

        }
    };

    const handleFileUpload = (e) => {
        setSelectedFile(e.target.files[0]);
    };

    const deleteStudent = async (student) => {
        const confirmText = `Delete student "${student.name}" (${student.rollNo})?\n\nThis will permanently delete all their attendance records.`;
        if (!confirm(confirmText)) return;

        try {
            const res = await axios.delete(`${API_URL}/students/${student._id}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            toast.success("Student deleted successfully");
            fetchStudents();
        } catch (error) {
            console.error('Failed to delete student:', error);
            toast.error(error.response?.data?.error || 'Failed to delete student');
        }
    };

    return (
        <div className="students-page">
            <header className="students-header">
                <div className="header-left">
                    <Link to="/admin/dashboard" className="back-link">← Back</Link>
                    <h1>👥 Student List</h1>
                    <p>Manage your student database</p>
                </div>
                <div className="header-right">
                    <button className="btn btn-primary" onClick={() => setShowUploadModal(true)}>
                        📤 Upload Students
                    </button>
                </div>
            </header>

            <main className="students-content">
                {/* Filters */}
                <div className="filters-bar">
                    <input
                        type="text"
                        className="form-input search-input"
                        placeholder="Search by name or roll number..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                    <select
                        className="form-input batch-select"
                        value={selectedBatch}
                        onChange={(e) => setSelectedBatch(e.target.value)}
                    >
                        <option value="">All Batches</option>
                        {batches.map(batch => (
                            <option key={batch} value={batch}>{batch}</option>
                        ))}
                    </select>
                </div>

                {/* Stats */}
                <div className="students-stats">
                    <div className="stat-item">
                        <span className="stat-value">{students.length}</span>
                        <span className="stat-label">Students</span>
                    </div>
                    <div className="stat-item">
                        <span className="stat-value">{batches.length}</span>
                        <span className="stat-label">Batches</span>
                    </div>
                </div>

                {/* Student List */}
                {loading ? (
                    <div className="loading-state">
                        <div className="spinner"></div>
                        <p>Loading students...</p>
                    </div>
                ) : students.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-icon">📋</div>
                        <h3>No Students Yet</h3>
                        <p>Upload a CSV file to add students</p>
                        <button className="btn btn-primary" onClick={() => setShowUploadModal(true)}>
                            Upload Students
                        </button>
                    </div>
                ) : (
                    <div className="table-wrapper">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>Roll No</th>
                                    <th>Name</th>
                                    <th>Email</th>
                                    <th>Batch</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {students.map(student => (
                                    <tr key={student._id}>
                                        <td><strong>{student.rollNo}</strong></td>
                                        <td>{student.name}</td>
                                        <td>{student.email || '-'}</td>
                                        <td>
                                            {student.batch ? (
                                                <span className="batch-tag">{student.batch}</span>
                                            ) : '-'}
                                        </td>
                                        <td>
                                            <button
                                                className="btn-icon delete"
                                                onClick={() => deleteStudent(student)}
                                                title="Delete"
                                            >
                                                🗑️
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </main>

            {/* Upload Modal */}
            {showUploadModal && (
                <div className="modal-overlay" onClick={() => setShowUploadModal(false)}>
                    <div className="modal upload-modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>📤 Upload Students</h2>
                            <button className="close-btn" onClick={() => setShowUploadModal(false)}>×</button>
                        </div>

                        <div className="modal-form">

                            <div className="form-group">
                                <label className="form-label">Upload CSV File</label>
                                <input
                                    type="file"
                                    accept=".csv,.txt"
                                    onChange={handleFileUpload}
                                    className="file-input"
                                />
                            </div>



                            {uploadResult && (
                                <div className={`alert ${uploadResult.success ? 'alert-success' : 'alert-error'}`}>
                                    {uploadResult.success
                                        ? uploadResult.message
                                        : uploadResult.error
                                    }
                                </div>
                            )}

                            <div className="modal-actions">
                                <button
                                    className="btn btn-secondary"
                                    onClick={() => setShowUploadModal(false)}
                                >
                                    Cancel
                                </button>
                                <button
                                    className="btn btn-primary"
                                    onClick={handleUpload}
                                    disabled={uploadLoading || !selectedFile}
                                >
                                    {uploadLoading ? 'Uploading...' : 'Upload Students'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Students;
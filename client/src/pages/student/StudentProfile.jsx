import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import axios from 'axios';
import { toast } from 'react-toastify';
import API_URL from '../../config/api';
import './StudentProfile.css';

const StudentProfile = () => {
    const { user, token, logout } = useAuth();
    const navigate = useNavigate();

    const [activeTab, setActiveTab] = useState('profile');
    const [loading, setLoading] = useState(false);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [deleteConfirmText, setDeleteConfirmText] = useState('');

    const handleLogout = () => {
        logout();
        toast.success('Logged out successfully');
        navigate('/');
    };

    const handleDeleteAccount = async () => {
        if (deleteConfirmText !== 'DELETE') {
            toast.error('Please type DELETE to confirm');
            return;
        }

        setLoading(true);
        try {
            await axios.delete(`${API_URL}/auth/delete-account`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            toast.success('Account deleted successfully');
            logout();
            navigate('/');
        } catch (err) {
            toast.error(err.response?.data?.error || 'Failed to delete account');
        } finally {
            setLoading(false);
            setShowDeleteModal(false);
        }
    };

    return (
        <div className="profile-page">
            <header className="profile-header">
                <div className="header-left">
                    <Link to="/student/dashboard" className="back-link">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="m15 18-6-6 6-6" />
                        </svg>
                        Back to Dashboard
                    </Link>
                    <h1>👤 My Profile</h1>
                </div>
            </header>

            <main className="profile-content">
                {/* Profile Summary */}
                <div className="profile-summary card">
                    <div className="profile-avatar">
                        {user?.name?.charAt(0)?.toUpperCase() || 'S'}
                    </div>
                    <div className="profile-details">
                        <h2>{user?.name || 'Student'}</h2>
                        <p className="roll">{user?.rollNo}</p>
                        <p className="email">{user?.email}</p>
                        {user?.branch && (
                            <p className="branch-year">
                                {user.branch?.toUpperCase()} • Year {user?.academicState?.year || '?'}
                            </p>
                        )}
                    </div>
                </div>

                {/* Tabs */}
                <div className="tabs">
                    <button
                        className={`tab ${activeTab === 'profile' ? 'active' : ''}`}
                        onClick={() => setActiveTab('profile')}
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                            <circle cx="12" cy="7" r="4" />
                        </svg>
                        Profile Info
                    </button>
                    <button
                        className={`tab ${activeTab === 'account' ? 'active' : ''}`}
                        onClick={() => setActiveTab('account')}
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="12" cy="12" r="3" />
                            <path d="M12 1v6m0 6v6m-3-3h6m-6-6h6" />
                        </svg>
                        Account
                    </button>
                </div>

                {/* Tab Content */}
                <div className="tab-content card">
                    {activeTab === 'profile' && (
                        <div className="profile-info">
                            <div className="info-group">
                                <label>Full Name</label>
                                <p>{user?.name || 'Not set'}</p>
                            </div>
                             <div className="info-group">
                                <label>Email</label>
                                <p>{user?.email || 'Not set'}</p>
                            </div>
                            <div className="info-row">
                            <div className="info-group">
                                <label>Roll Number</label>
                                <p>{user?.rollNo || 'Not set'}</p>
                            </div>
                            <div className="info-group">
                                <label>Branch</label>
                                <p>{user?.branch.toUpperCase() || 'Not set'}</p>
                            </div>
                            </div>
                            <div className="info-row">
                                <div className="info-group">
                                    <label>Semester</label>
                                    <p>{user?.semester || 'Not set'}</p>
                                </div>
                                <div className="info-group">
                                    <label>Academic Year</label>
                                    <p>Year {user?.academicState?.year || '?'}</p>
                                </div>
                            </div>
                            <div className="info-note">
                                ℹ️ Profile information is automatically extracted from your college email.
                                Contact admin if any details are incorrect.
                            </div>
                        </div>
                    )}

                    {activeTab === 'account' && (
                        <div className="account-section">
                            {/* Logout Button */}
                            <div className="account-action">
                                <div className="action-info">
                                    <h4>🚪 Logout</h4>
                                    <p>Sign out from your account on this device</p>
                                </div>
                                <button className="btn btn-secondary" onClick={handleLogout}>
                                    Logout
                                </button>
                            </div>

                            <div className="divider"></div>

                            {/* Delete Account */}
                            <div className="account-action danger">
                                <div className="action-info">
                                    <h4>🗑️ Delete Account</h4>
                                    <p>Permanently delete your account and all attendance records. This action cannot be undone.</p>
                                </div>
                                <button
                                    className="btn btn-danger"
                                    onClick={() => setShowDeleteModal(true)}
                                >
                                    Delete Account
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </main>

            {/* Delete Confirmation Modal */}
            {showDeleteModal && (
                <div className="modal-overlay" onClick={() => setShowDeleteModal(false)}>
                    <div className="modal delete-modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>⚠️ Delete Account</h2>
                            <button className="modal-close" onClick={() => setShowDeleteModal(false)}>×</button>
                        </div>
                        <div className="modal-body">
                            <div className="warning-box">
                                <p><strong>This action is irreversible!</strong></p>
                                <p>Deleting your account will:</p>
                                <ul>
                                    <li>Remove all your attendance records</li>
                                    <li>Delete your profile information</li>
                                    <li>Remove you from all courses</li>
                                </ul>
                            </div>
                            <div className="form-group">
                                <label>Type <strong>DELETE</strong> to confirm:</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    value={deleteConfirmText}
                                    onChange={(e) => setDeleteConfirmText(e.target.value)}
                                    placeholder="Type DELETE"
                                />
                            </div>
                        </div>
                        <div className="modal-actions">
                            <button
                                className="btn btn-ghost"
                                onClick={() => setShowDeleteModal(false)}
                                disabled={loading}
                            >
                                Cancel
                            </button>
                            <button
                                className="btn btn-danger"
                                onClick={handleDeleteAccount}
                                disabled={loading || deleteConfirmText !== 'DELETE'}
                            >
                                {loading ? 'Deleting...' : 'Delete My Account'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default StudentProfile;

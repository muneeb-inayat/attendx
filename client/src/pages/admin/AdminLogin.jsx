import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import axios from 'axios';
import API_URL from '../../config/api';
import './AdminLogin.css';

const AdminLogin = () => {
    const navigate = useNavigate();
    const { loginWithToken } = useAuth();

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const res = await axios.post(`${API_URL}/auth/admin/login`, {
                email,
                password
            });

            if (res.data.success) {
                localStorage.setItem('token', res.data.data.token);
                loginWithToken(res.data.data.token, res.data.data.user);
                navigate('/admin/dashboard');
            }
        } catch (err) {
            setError(err.response?.data?.error || 'Login failed');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="auth-page admin-auth">
            <div className="auth-card">
                {/* Title */}
                <h1 className="auth-title">🔐 Admin Portal</h1>
                <p className="auth-subtitle">System Administration</p>

                {/* Instructions */}
                <div className="auth-instructions admin-instructions">
                    <div className="instruction-header">
                        <span className="instruction-icon">ℹ️</span>
                        <span>Admin Access</span>
                    </div>
                    <p className="admin-info">
                        Use credentials from server config. Contact system admin for access.
                    </p>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="admin-form">
                    <div className="form-field">
                        <label>Email</label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="admin@example.com"
                            required
                            autoComplete="email"
                        />
                    </div>

                    <div className="form-field">
                        <label>Password</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Enter password"
                            required
                            autoComplete="current-password"
                        />
                    </div>

                    {error && <div className="form-error">⚠️ {error}</div>}

                    <button type="submit" className="submit-btn" disabled={loading}>
                        {loading ? 'Signing in...' : 'Sign In'}
                    </button>
                </form>

                {/* Footer */}
                <div className="auth-footer">
                    <Link to="/" className="auth-link">← Back to Login</Link>
                </div>
            </div>
        </div>
    );
};

export default AdminLogin;

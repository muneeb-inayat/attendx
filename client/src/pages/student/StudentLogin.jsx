import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useStudentAuth } from '../../context/StudentAuthContext';
import GoogleLoginButton from '../../components/GoogleLoginButton';
import './StudentLogin.css';

const StudentLogin = () => {
    const [isRegister, setIsRegister] = useState(false);
    const [formData, setFormData] = useState({
        rollNo: '',
        name: '',
        email: '',
        password: '',
        phone: '',
        batch: ''
    });
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const { login, register, googleLogin } = useStudentAuth();
    const navigate = useNavigate();

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            if (isRegister) {
                await register(
                    formData.rollNo,
                    formData.name,
                    formData.email,
                    formData.password,
                    formData.phone,
                    formData.batch
                );
            } else {
                await login(formData.email, formData.password);
            }
            navigate('/student/dashboard');
        } catch (err) {
            setError(err.response?.data?.error || 'Authentication failed');
        } finally {
            setLoading(false);
        }
    };

    // Google OAuth handlers
    const handleGoogleSuccess = async (credential) => {
        setError('');
        setLoading(true);
        try {
            await googleLogin(credential);
            navigate('/student/dashboard');
        } catch (err) {
            setError(err.response?.data?.error || 'Google authentication failed');
        } finally {
            setLoading(false);
        }
    };

    const handleGoogleError = (errorMessage) => {
        setError(errorMessage);
    };

    return (
        <div className="student-login-page">
            <div className="login-container animate-fade-in-up">
                <div className="login-card">
                    <div className="login-header">
                        <Link to="/" className="back-link">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="m15 18-6-6 6-6" />
                            </svg>
                            Back to home
                        </Link>

                        <div className="login-icon student">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                                <circle cx="12" cy="7" r="4" />
                            </svg>
                        </div>

                        <h1>{isRegister ? 'Create Account' : 'Student Login'}</h1>
                        <p>
                            {isRegister
                                ? 'Register to track your attendance'
                                : 'Sign in to view your attendance'
                            }
                        </p>
                    </div>

                    <form onSubmit={handleSubmit} className="login-form">
                        {isRegister && (
                            <>
                                <div className="form-row">
                                    <div className="form-group">
                                        <label className="form-label">Roll Number</label>
                                        <input
                                            type="text"
                                            name="rollNo"
                                            className="form-input"
                                            placeholder="e.g., CS2024001"
                                            value={formData.rollNo}
                                            onChange={handleChange}
                                            required
                                            disabled={loading}
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Batch (Optional)</label>
                                        <input
                                            type="text"
                                            name="batch"
                                            className="form-input"
                                            placeholder="e.g., 2024"
                                            value={formData.batch}
                                            onChange={handleChange}
                                            disabled={loading}
                                        />
                                    </div>
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Full Name</label>
                                    <input
                                        type="text"
                                        name="name"
                                        className="form-input"
                                        placeholder="Enter your full name"
                                        value={formData.name}
                                        onChange={handleChange}
                                        required
                                        disabled={loading}
                                    />
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Phone (Optional)</label>
                                    <input
                                        type="tel"
                                        name="phone"
                                        className="form-input"
                                        placeholder="e.g., 9876543210"
                                        value={formData.phone}
                                        onChange={handleChange}
                                        disabled={loading}
                                    />
                                </div>
                            </>
                        )}

                        <div className="form-group">
                            <label className="form-label">Email Address</label>
                            <input
                                type="email"
                                name="email"
                                className="form-input"
                                placeholder="you@example.com"
                                value={formData.email}
                                onChange={handleChange}
                                required
                                disabled={loading}
                            />
                        </div>

                        <div className="form-group">
                            <label className="form-label">Password</label>
                            <input
                                type="password"
                                name="password"
                                className="form-input"
                                placeholder="Enter password"
                                value={formData.password}
                                onChange={handleChange}
                                required
                                minLength={6}
                                disabled={loading}
                            />
                        </div>

                        {!isRegister && (
                            <div className="forgot-link-wrapper">
                                <Link to="/forgot-password" className="forgot-link">
                                    Forgot password?
                                </Link>
                            </div>
                        )}

                        {error && (
                            <div className="alert alert-error">{error}</div>
                        )}

                        <button
                            type="submit"
                            className="btn btn-success login-btn"
                            disabled={loading}
                        >
                            {loading ? (
                                <>
                                    <span className="spinner"></span>
                                    {isRegister ? 'Creating...' : 'Signing in...'}
                                </>
                            ) : (
                                isRegister ? 'Create Account' : 'Sign In'
                            )}
                        </button>
                    </form>

                    {/* Google Sign-In - Only show for login, not registration */}
                    {!isRegister && (
                        <GoogleLoginButton
                            onSuccess={handleGoogleSuccess}
                            onError={handleGoogleError}
                            disabled={loading}
                        />
                    )}

                    <div className="login-footer">
                        <p>
                            {isRegister ? 'Already have an account?' : "Don't have an account?"}
                            <button
                                className="switch-btn"
                                onClick={() => setIsRegister(!isRegister)}
                            >
                                {isRegister ? 'Sign In' : 'Sign Up'}
                            </button>
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default StudentLogin;

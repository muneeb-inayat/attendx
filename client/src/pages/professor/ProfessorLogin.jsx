import { useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import GoogleLoginButton from '../../components/GoogleLoginButton';
import './ProfessorLogin.css';

/**
 * Professor Login Page
 * Any Google email allowed
 */
const ProfessorLogin = () => {
    const { user, loginAsProfessor } = useAuth();
    const navigate = useNavigate();

    useEffect(() => {
        if (user) {
            if (user.role === 'professor') {
                navigate('/professor/dashboard');
            } else if (user.role === 'pending_professor') {
                navigate('/pending-approval');
            }
        }
    }, [user, navigate]);

    const handleGoogleSuccess = async (credential) => {
        try {
            const userData = await loginAsProfessor(credential);
            if (userData.role === 'pending_professor') {
                navigate('/pending-approval');
            } else {
                navigate('/professor/dashboard');
            }
        } catch (error) {
            alert(error.response?.data?.error || 'Login failed.');
        }
    };

    return (
        <div className="auth-page professor-auth">
            <div className="auth-card">
                {/* Icon */}
                <div className="auth-icon professor-icon">👨‍🏫</div>

                {/* Title */}
                <h1 className="auth-title">Professor Portal</h1>
                <p className="auth-subtitle">Attendance Management</p>

                {/* Instructions */}
                <div className="auth-instructions professor-instructions">
                    <div className="instruction-header">
                        <span className="instruction-icon">📋</span>
                        <span>How It Works</span>
                    </div>
                    <ul className="instruction-list">
                        <li>Sign in with any Google account</li>
                        <li>First login requires admin approval</li>
                        <li>Claim courses & take attendance</li>
                    </ul>
                </div>

                {/* Google Login */}
                <div className="auth-button-wrapper">
                    <GoogleLoginButton
                        onSuccess={handleGoogleSuccess}
                        onError={() => { }}
                        text="signin_with"
                    />
                </div>

                {/* Footer */}
                <div className="auth-footer">
                    <p className="auth-note">New professors need admin approval</p>
                    <div className="auth-links">
                        <Link to="/" className="auth-link">🎓 Student</Link>
                        <Link to="/admin/login" className="auth-link">🔐 Admin</Link>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ProfessorLogin;

import { useEffect,useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import GoogleLoginButton from '../components/GoogleLoginButton';
import './Login.css';

/**
 * Student Login Page
 * Only MNIT emails allowed
 */
const Login = () => {
    const {
    user,
    loginAsStudent,
    studentLogin
} = useAuth();
    const navigate = useNavigate();

    const [identifier, setIdentifier] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (user) {
            if (user.role === 'student') {
                navigate('/student/dashboard');
            } else if (user.role === 'admin') {
                navigate('/admin/dashboard');
            }
        }
    }, [user, navigate]);
       
    const handleGoogleSuccess = async (credential) => {
        try {
            const user = await loginAsStudent(credential);

            if (user.mustChangePassword) {
                navigate("/student/change-password");
            } else {
                navigate("/student/dashboard");
            }
        } catch (error) {
            console.error('Login Failed', error);
            alert(error.response?.data?.error || 'Login failed.');
        }
    };

    const handleLogin = async (e) => {
    e.preventDefault();

    try {

        setLoading(true);

        const user = await studentLogin(identifier, password);

        if (user.mustChangePassword) {
            navigate("/student/change-password");
        } else {
            navigate("/student/dashboard");
        }

    } catch (error) {

        alert(error.response?.data?.error || "Login failed.");

    } finally {

        setLoading(false);

    }
};

    return (
        <div className="auth-page student-auth">
            <div className="auth-card">
                {/* Icon */}
                <div className="auth-icon">🎓</div>

                {/* Title */}
                <h1 className="auth-title">Student Portal</h1>
                <p className="auth-subtitle">QR Attendance System</p>

                {/* Instructions */}
                <div className="auth-instructions">
                    <div className="instruction-header">
                        <span className="instruction-icon">📋</span>
                        <span>How to Login</span>
                    </div>
                    <ul className="instruction-list">
                        <li> Login using your email or roll number</li>
                        <li> Use your password or continue with Google</li>
                        <li> Allow location access during attendance</li>
                    </ul>
                </div>

                <form onSubmit={handleLogin} className="login-form">

                <div className="form-group">
                    <label>Email or Roll Number</label>
                    <input
                        type="text"
                        className="form-input"
                        placeholder="Enter email or roll number"
                        value={identifier}
                        onChange={(e) => setIdentifier(e.target.value)}
                        disabled={loading}
                        required
                    />
                </div>

                <div className="form-group">
                    <label>Password</label>
                    <input
                        type="password"
                        className="form-input"
                        placeholder="Enter your password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        disabled={loading}
                        required
                    />
                </div>

                <div className="forgot-password">
                    <Link to="/forgot-password">
                        Forgot Password?
                    </Link>
                </div>

                <button
                    type="submit"
                    className="auth-btn"
                    disabled={loading}
                >
                    {loading ? "Signing In..." : "Sign In"}
                </button>

            </form>

                <div className="auth-divider">
                    <span>OR</span>
                </div>

                <p className="google-note">
                    You can also sign in using your linked Google account.
                </p>

                {/* Google Login */}
                <div className="auth-button-wrapper">
                    <GoogleLoginButton
                        onSuccess={handleGoogleSuccess}
                        onError={(err) => console.error(err)}
                        text="signin_with"
                    />
                </div>

                {/* Footer */}
                <div className="auth-footer">

                <p className="auth-note">
                    First time logging in?
                </p>

                <p className="auth-note-small">
                    Use the temporary password provided by your administrator.
                </p>

                <Link to="/professor/login" className="auth-link">
                    👨‍🏫 Professor Login
                </Link>

            </div>
            </div>
        </div>
    );
};

export default Login;

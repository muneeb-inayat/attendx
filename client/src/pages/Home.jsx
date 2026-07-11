import { Link } from 'react-router-dom';
import { useState } from 'react';
import './Home.css';

const Home = () => {
    const [showInstructions, setShowInstructions] = useState(false);

    return (
        <div className="home-page">
            <div className="home-content animate-fade-in-up">
                <div className="home-logo">
                    <div className="logo-mark">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                            <circle cx="12" cy="10" r="3" />
                        </svg>
                    </div>
                    <span className="logo-text">AttendX</span>
                </div>

                <p className="home-subtitle">
                    Smart attendance tracking with QR codes and geolocation verification
                </p>

                <div className="home-cards">
                    <Link to="/scan" className="home-card student-card">
                        <div className="card-icon-wrapper">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="3" y="3" width="18" height="18" rx="2" />
                                <path d="M7 7h.01M7 12h.01M7 17h.01M12 7h.01M12 12h.01M12 17h.01M17 7h.01M17 12h.01M17 17h.01" />
                            </svg>
                        </div>
                        <h3>Scan QR</h3>
                        <p>Mark your attendance</p>
                    </Link>

                    <Link to="/student/login" className="home-card portal-card">
                        <div className="card-icon-wrapper">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                                <circle cx="12" cy="7" r="4" />
                            </svg>
                        </div>
                        <h3>Student Dashboard</h3>
                        <p>View attendance history</p>
                    </Link>

                    <Link to="/admin/login" className="home-card educator-card">
                        <div className="card-icon-wrapper">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                                <circle cx="9" cy="7" r="4" />
                                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                            </svg>
                        </div>
                        <h3>Educators Portal</h3>
                        <p>Manage courses & attendance</p>
                    </Link>
                </div>

                {/* How It Works Section */}
                <button
                    className="how-it-works-toggle"
                    onClick={() => setShowInstructions(!showInstructions)}
                >
                    {showInstructions ? '✕ Hide Instructions' : '❓ New here? See how it works'}
                </button>

                {showInstructions && (
                    <div className="instructions-section animate-fade-in">
                        <h3>📖 How It Works</h3>

                        <div className="instruction-group">
                            <h4>👨‍🎓 For Students</h4>
                            <div className="steps">
                                <div className="step">
                                    <span className="step-number">1</span>
                                    <div className="step-content">
                                        <strong>Register/Login</strong>
                                        <p>Click "My Dashboard" → Create account or login</p>
                                    </div>
                                </div>
                                <div className="step">
                                    <span className="step-number">2</span>
                                    <div className="step-content">
                                        <strong>Scan QR Code</strong>
                                        <p>When professor shows QR, tap "Scan QR" and point camera at it</p>
                                    </div>
                                </div>
                                <div className="step">
                                    <span className="step-number">3</span>
                                    <div className="step-content">
                                        <strong>Enter Details</strong>
                                        <p>Enter your Roll Number & Name → Submit</p>
                                    </div>
                                </div>
                                <div className="step">
                                    <span className="step-number">4</span>
                                    <div className="step-content">
                                        <strong>Done!</strong>
                                        <p>Your attendance is marked. View history in dashboard.</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="instruction-group">
                            <h4>👨‍🏫 For Professors</h4>
                            <div className="steps">
                                <div className="step">
                                    <span className="step-number">1</span>
                                    <div className="step-content">
                                        <strong>Login to Educators Portal</strong>
                                        <p>Click "Educators Portal" → Register/Login</p>
                                    </div>
                                </div>
                                <div className="step">
                                    <span className="step-number">2</span>
                                    <div className="step-content">
                                        <strong>Create a Course</strong>
                                        <p>Go to Courses → Add New Course</p>
                                    </div>
                                </div>
                                <div className="step">
                                    <span className="step-number">3</span>
                                    <div className="step-content">
                                        <strong>Start a Session</strong>
                                        <p>Open course → Click "Start Session" → QR appears!</p>
                                    </div>
                                </div>
                                <div className="step">
                                    <span className="step-number">4</span>
                                    <div className="step-content">
                                        <strong>Show QR to Class</strong>
                                        <p>Students scan it. Watch attendance appear in real-time!</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="pro-tips">
                            <h4>💡 Pro Tips</h4>
                            <ul>
                                <li>📍 Students must be within 50m of the classroom</li>
                                <li>📱 Install as app: Menu → "Add to Home Screen"</li>
                                <li>🔄 QR codes refresh automatically for security</li>
                            </ul>
                        </div>
                    </div>
                )}

                <div className="home-features">
                    <div className="feature">
                        <span className="feature-icon">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                <polyline points="20 6 9 17 4 12" />
                            </svg>
                        </span>
                        50m Radius Check
                    </div>
                    <div className="feature">
                        <span className="feature-icon">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                <polyline points="20 6 9 17 4 12" />
                            </svg>
                        </span>
                        Dynamic QR Codes
                    </div>
                    <div className="feature">
                        <span className="feature-icon">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                <polyline points="20 6 9 17 4 12" />
                            </svg>
                        </span>
                        Real-time Tracking
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Home;

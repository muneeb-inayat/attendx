import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import './PendingApproval.css';

const PendingApproval = () => {
    const { logout, user } = useAuth();
    const [dots, setDots] = useState('');

    // Animated dots effect
    useEffect(() => {
        const interval = setInterval(() => {
            setDots(prev => prev.length >= 3 ? '' : prev + '.');
        }, 500);
        return () => clearInterval(interval);
    }, []);

    const handleLogout = () => {
        logout();
        // Redirect to home/login page
        window.location.href = '/';
    };

    return (
        <div className="pending-container">
            <div className="pending-bg-animation">
                <div className="pending-circle pending-circle-1"></div>
                <div className="pending-circle pending-circle-2"></div>
            </div>

            <div className="pending-content">
                {/* Icon */}
                <div className="pending-icon-wrapper">
                    <div className="pending-icon-pulse"></div>
                    <div className="pending-icon">⏳</div>
                </div>

                {/* Header */}
                <h1 className="pending-title">Approval Pending</h1>
                <p className="pending-subtitle">Your request is being reviewed</p>

                {/* Status */}
                <div className="pending-status-card">
                    <h3>Waiting for Admin Approval{dots}</h3>
                    <p>Your request for Professor access is under review.</p>
                </div>

                {/* Timeline */}
                <div className="pending-timeline">
                    <div className="pending-timeline-item completed">
                        <div className="pending-timeline-dot"></div>
                        <div>
                            <h4>Registration Submitted</h4>
                            <p>Account created</p>
                        </div>
                    </div>
                    <div className="pending-timeline-item active">
                        <div className="pending-timeline-dot"></div>
                        <div>
                            <h4>Admin Review</h4>
                            <p>Waiting for approval</p>
                        </div>
                    </div>
                    <div className="pending-timeline-item">
                        <div className="pending-timeline-dot"></div>
                        <div>
                            <h4>Access Granted</h4>
                            <p>Login again to access</p>
                        </div>
                    </div>
                </div>

                {/* Info */}
                <div className="pending-info-box">
                    <div className="pending-info-icon">💡</div>
                    <div>
                        <h4>What happens next?</h4>
                        <ul>
                            <li>Admin will review your request</li>
                            <li>Once approved, logout and login again</li>
                            <li>You'll then have full access</li>
                        </ul>
                    </div>
                </div>

                {/* Action Button */}
                <button onClick={handleLogout} className="pending-btn-logout">
                    🚪 Logout & Login Again
                </button>

                {/* Footer */}
                <p className="pending-footer">
                    Contact admin if approval takes too long
                </p>
            </div>
        </div>
    );
};

export default PendingApproval;

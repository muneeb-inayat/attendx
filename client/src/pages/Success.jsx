import { useLocation, Link } from 'react-router-dom';
import './Success.css';

const Success = () => {
    const location = useLocation();
    const { status, distance, message } = location.state || {};

    const getStatusConfig = () => {
        switch (status) {
            case 'PRESENT':
                return {
                    title: 'Attendance Marked',
                    icon: 'check',
                    class: 'present'
                };
            case 'LATE':
                return {
                    title: 'Marked as Late',
                    icon: 'clock',
                    class: 'late'
                };
            case 'INVALID':
                return {
                    title: 'Invalid Location',
                    icon: 'x',
                    class: 'invalid'
                };
            default:
                return {
                    title: 'Error',
                    icon: 'x',
                    class: 'error'
                };
        }
    };

    const config = getStatusConfig();

    const renderIcon = () => {
        if (config.icon === 'check') {
            return (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                </svg>
            );
        }
        if (config.icon === 'clock') {
            return (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                </svg>
            );
        }
        return (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
        );
    };

    return (
        <div className="success-page">
            <div className="success-container animate-fade-in-up">
                <div className={`result-icon ${config.class}`}>
                    {renderIcon()}
                </div>

                <h1>{config.title}</h1>
                <p className="subtitle">
                    {status === 'PRESENT' && 'Your attendance has been recorded successfully'}
                    {status === 'LATE' && 'You arrived after the late threshold'}
                    {status === 'INVALID' && 'You are outside the allowed area'}
                    {!status && 'Something went wrong'}
                </p>

                {(status && distance !== undefined) && (
                    <div className="result-details">
                        <div className="detail-item">
                            <span className="detail-label">Status</span>
                            <span className={`badge badge-${status.toLowerCase()}`}>{status}</span>
                        </div>
                        <div className="detail-item">
                            <span className="detail-label">Distance from center</span>
                            <span className="detail-value">{distance}m</span>
                        </div>
                    </div>
                )}

                {message && (
                    <div className={`message-box ${status?.toLowerCase() || 'invalid'}`}>
                        {message}
                    </div>
                )}

                <Link to="/" className="btn btn-secondary">
                    Back to Home
                </Link>
            </div>
        </div>
    );
};

export default Success;

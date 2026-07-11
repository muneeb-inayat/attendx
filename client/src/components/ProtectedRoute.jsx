import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const ProtectedRoute = ({ children, allowedRoles = [] }) => {
    const { user, loading } = useAuth();

    if (loading) {
        return (
            <div className="page-center">
                <div className="spinner"></div>
            </div>
        );
    }

    if (!user) {
        return <Navigate to="/" replace />;
    }

    if (allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
        // Redirect based on actual role if they try to access unauthorized area
        switch (user.role) {
            case 'admin':
                return <Navigate to="/admin/dashboard" replace />;
            case 'professor':
                return <Navigate to="/professor/dashboard" replace />;
            case 'student':
                return <Navigate to="/student/dashboard" replace />;
            case 'pending_professor':
                return <Navigate to="/pending-approval" replace />;
            default:
                return <Navigate to="/" replace />;
        }
    }

    return children;
};

export default ProtectedRoute;

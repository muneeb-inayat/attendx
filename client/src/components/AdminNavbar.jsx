import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import ThemeToggle from '../ThemeToggle';
import './AdminNavbar.css';

const AdminNavbar = () => {
    const { admin, logout } = useAuth();
    const navigate = useNavigate();

    const handleLogout = () => {
        logout();
        navigate('/');
    };

    return (
        <nav className="admin-navbar">
            <div className="navbar-brand">
                <div className="brand-logo">📊</div>
                <div className="brand-info">
                    <h1>QR Attendance</h1>
                    <span className="brand-subtitle">Admin Panel</span>
                </div>
            </div>

            <ul className="navbar-menu">
                <li>
                    <NavLink to="/admin/dashboard" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
                        <span className="nav-icon">🏠</span>
                        <span className="nav-text">Dashboard</span>
                    </NavLink>
                </li>
                <li>
                    <NavLink to="/admin/courses" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
                        <span className="nav-icon">📚</span>
                        <span className="nav-text">Courses</span>
                    </NavLink>
                </li>
                <li>
                    <NavLink to="/admin/students" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
                        <span className="nav-icon">👥</span>
                        <span className="nav-text">Students</span>
                    </NavLink>
                </li>
            </ul>

            <div className="navbar-actions">
                <ThemeToggle />
                <div className="user-menu">
                    <div className="user-avatar">{admin?.name?.charAt(0)?.toUpperCase() || 'A'}</div>
                    <div className="user-info">
                        <span className="user-name">{admin?.name}</span>
                        <span className="user-role">Professor</span>
                    </div>
                </div>
                <button className="btn btn-ghost logout-btn" onClick={handleLogout}>
                    <span className="nav-icon">🚪</span>
                    <span className="nav-text">Logout</span>
                </button>
            </div>
        </nav>
    );
};

export default AdminNavbar;

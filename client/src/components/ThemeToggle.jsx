import { useTheme } from '../context/ThemeContext';
import './ThemeToggle.css';

const ThemeToggle = () => {
    const { theme, toggleTheme } = useTheme();

    return (
        <button
            className="theme-toggle"
            onClick={toggleTheme}
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
        >
            <span className={`theme-icon ${theme === 'dark' ? 'show' : 'hide'}`}>
                ☀️
            </span>
            <span className={`theme-icon ${theme === 'light' ? 'show' : 'hide'}`}>
                🌙
            </span>
        </button>
    );
};

export default ThemeToggle;

import { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';
import API_URL from '../config/api';
import { generateDeviceFingerprint } from '../utils/deviceFingerprint';

const AuthContext = createContext(null);

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [token, setToken] = useState(localStorage.getItem('token'));
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (token) {
            fetchMe();
        } else {
            setLoading(false);
        }
    }, [token]);

    const fetchMe = async () => {
        try {
            const res = await axios.get(`${API_URL}/auth/me`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setUser(res.data.data);
        } catch (error) {
            if (error.response?.status === 401) {
                logout();
            }
        } finally {
            setLoading(false);
        }
    };

    /**
     * Student Login with Google (MNIT emails only)
     */
    const loginAsStudent = async (credential) => {
        const res = await axios.post(`${API_URL}/auth/google/student`, { credential });
        const { token: newToken, user: userData } = res.data.data;

        localStorage.setItem('token', newToken);
        setToken(newToken);
        setUser(userData);
        return userData;
    };

    /**
  * Student Login with Email/Roll Number + Password
  */
    const studentLogin = async (identifier, password) => {

        const { fingerprint, components } = generateDeviceFingerprint();

        const res = await axios.post(`${API_URL}/auth/student/login`, {
            identifier,
            password,
            deviceFingerprint: fingerprint,
            fingerprintComponents: components
        });

        const { token: newToken, user: userData } = res.data.data;

        localStorage.setItem("token", newToken);

        setToken(newToken);
        setUser(userData);

        return userData;
    };

    /**
     * Professor Login with Google (Any email)
     */
    const loginAsProfessor = async (credential) => {
        const res = await axios.post(`${API_URL}/auth/google/professor`, { credential });
        const { token: newToken, user: userData } = res.data.data;

        localStorage.setItem('token', newToken);
        setToken(newToken);
        setUser(userData);
        return userData;
    };

    /**
     * Admin Login with email/password
     */
    const loginAsAdmin = async (email, password) => {
        const res = await axios.post(`${API_URL}/auth/admin/login`, { email, password });
        const { token: newToken, user: userData } = res.data.data;

        localStorage.setItem('token', newToken);
        setToken(newToken);
        setUser(userData);
        return userData;
    };

    /**
     * Login with token directly (for admin login component)
     */
    const loginWithToken = (newToken, userData) => {
        localStorage.setItem('token', newToken);
        setToken(newToken);
        setUser(userData);
    };

    const logout = () => {
        localStorage.removeItem('token');
        setToken(null);
        setUser(null);
    };

    /**
     * Refresh user data from API
     */
    const refreshUser = async () => {
        if (token) {
            await fetchMe();
        }
    };

    return (
        <AuthContext.Provider value={{
            user,
            token,
            loading,

            studentLogin,
            loginAsStudent,

            loginAsProfessor,
            loginAsAdmin,

            loginWithToken,
            logout,
            refreshUser
        }}>
            {children}
        </AuthContext.Provider>
    );
};

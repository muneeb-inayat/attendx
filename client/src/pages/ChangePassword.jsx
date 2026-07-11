import { useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import API_URL from "../config/api";
import { useAuth } from "../context/AuthContext";
import "./Login.css";

const ChangePassword = () => {
    const navigate = useNavigate();
    const { token } = useAuth();

    const [formData, setFormData] = useState({
        currentPassword: "",
        newPassword: "",
        confirmPassword: ""
    });

    const [loading, setLoading] = useState(false);

    const handleChange = (e) => {
        setFormData({
            ...formData,
            [e.target.name]: e.target.value
        });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (formData.newPassword !== formData.confirmPassword) {
            alert("Passwords do not match.");
            return;
        }

        try {

            setLoading(true);

            await axios.put(
                `${API_URL}/auth/change-password`,
                {
                    currentPassword: formData.currentPassword,
                    newPassword: formData.newPassword
                },
                {
                    headers: {
                        Authorization: `Bearer ${token}`
                    }
                }
            );

            alert("Password changed successfully.");

            navigate("/student/dashboard");

        } catch (error) {

            alert(
                error.response?.data?.error ||
                "Failed to change password."
            );

        } finally {

            setLoading(false);

        }
    };

    return (
        <div className="auth-page student-auth">
            <div className="auth-card">

                <div className="auth-icon">
                    🔒
                </div>

                <h1 className="auth-title">
                    Change Password
                </h1>

                <p className="auth-subtitle">
                    Please change your temporary password before continuing.
                </p>

                <form
                    onSubmit={handleSubmit}
                    className="login-form"
                >

                    <div className="form-group">
                        <label>Current Password</label>
                        <input
                            type="password"
                            name="currentPassword"
                            className="form-input"
                            value={formData.currentPassword}
                            onChange={handleChange}
                            required
                        />
                    </div>

                    <div className="form-group">
                        <label>New Password</label>
                        <input
                            type="password"
                            name="newPassword"
                            className="form-input"
                            value={formData.newPassword}
                            onChange={handleChange}
                            required
                            minLength={8}
                        />
                    </div>

                    <div className="form-group">
                        <label>Confirm Password</label>
                        <input
                            type="password"
                            name="confirmPassword"
                            className="form-input"
                            value={formData.confirmPassword}
                            onChange={handleChange}
                            required
                            minLength={8}
                        />
                    </div>

                    <button
                        className="auth-btn"
                        type="submit"
                        disabled={loading}
                    >
                        {loading
                            ? "Updating..."
                            : "Change Password"}
                    </button>

                </form>

            </div>
        </div>
    );
};

export default ChangePassword;
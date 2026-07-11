import nodemailer from 'nodemailer';
import config from '../config/index.js';

const sendEmail = async (options) => {
    // Create transporter
    const transporter = nodemailer.createTransport({
        host: config.smtpHost || 'smtp.gmail.com',
        port: config.smtpPort || 587,
        secure: false,
        auth: {
            user: config.smtpUser,
            pass: config.smtpPass
        }
    });

    // Email options
    const mailOptions = {
        from: `"AttendX" <${config.smtpUser}>`,
        to: options.to,
        subject: options.subject,
        html: options.html
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        console.log('Email sent:', info.messageId);
        return true;
    } catch (error) {
        console.error('Email error:', error);
        return false;
    }
};

// Password reset email template
export const sendPasswordResetEmail = async (email, resetUrl, name) => {
    const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #0a0a0f; color: #f8fafc; margin: 0; padding: 40px; }
                .container { max-width: 500px; margin: 0 auto; background: #12121a; border-radius: 16px; padding: 40px; border: 1px solid rgba(255,255,255,0.1); }
                .logo { font-size: 24px; font-weight: 700; color: #6366f1; margin-bottom: 24px; }
                h1 { margin: 0 0 16px; font-size: 22px; }
                p { color: #94a3b8; line-height: 1.6; margin: 0 0 16px; }
                .btn { display: inline-block; padding: 14px 28px; background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); color: white; text-decoration: none; border-radius: 10px; font-weight: 600; margin: 24px 0; }
                .note { font-size: 13px; color: #64748b; margin-top: 24px; padding-top: 20px; border-top: 1px solid rgba(255,255,255,0.1); }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="logo">📍 AttendX</div>
                <h1>Reset Your Password</h1>
                <p>Hi ${name},</p>
                <p>We received a request to reset your password. Click the button below to create a new password:</p>
                <a href="${resetUrl}" class="btn">Reset Password</a>
                <p>This link will expire in <strong>30 minutes</strong>.</p>
                <p class="note">If you didn't request this, you can safely ignore this email. Your password won't be changed.</p>
            </div>
        </body>
        </html>
    `;

    return await sendEmail({
        to: email,
        subject: 'Password Reset Request - AttendX',
        html
    });
};

export default sendEmail;

import { KanbanSquare } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { requestPasswordOtp } from "../../../api.jsx";

function ForgetPassword() {
    const [email, setEmail] = useState("");
    const [errorMessage, setErrorMessage] = useState("");
    const [loading, setLoading] = useState(false);

    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setErrorMessage("");

        if (!email.trim()) {
            setErrorMessage("Please enter your email.");
            return;
        }

        try {
            setLoading(true);
            const data = await requestPasswordOtp(email.trim());
            sessionStorage.setItem("resetPasswordEmail", email.trim());
            sessionStorage.setItem("resetPasswordResendAt", String(Date.now() + (Number(data?.resendAfterSeconds) || 60) * 1000));
            navigate('/resetPassword');
        } catch (error) {
            console.error("Lỗi quên mật khẩu:", error);
            setErrorMessage(error.message || "Could not reach the server.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <main className="auth-page">
            <div className="auth-wrap size-lg">
                <div className="auth-brand-row">
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', textAlign: 'center', marginBottom: '24px' }}>
                        <span
                            style={{
                                width: '44px',
                                height: '44px',
                                borderRadius: '12px',
                                background: 'var(--brand-color)',
                                color: '#fff',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                            }}
                        >
                            <KanbanSquare size={24} />
                        </span>
                        <div>
                            <h1 style={{ fontSize: '20px', fontWeight: 600, margin: 0, color: 'var(--text-primary)' }}>Forget Password</h1>
                            <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginTop: '4px' }}>Enter your email and we will send you a verification code.</p>
                        </div>
                    </div>
                </div>

                <div className="card auth-card">
                    <div className="auth-divider">
                        <span></span>
                        <p style={{ color: 'var(--text-secondary)' }}>reset your password</p>
                        <span></span>
                    </div>

                    <form onSubmit={handleSubmit} id="forgotPasswordForm" noValidate>
                        <div className="field">
                            <label className="field-label" htmlFor="forgotEmail" style={{ color: 'var(--text-primary)' }}>
                                Email
                            </label>

                            <input
                                className="input"
                                type="email"
                                id="forgotEmail"
                                name="forgotEmail"
                                placeholder="Enter your registered email"
                                autoComplete="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                            />

                            {errorMessage && (
                                <p className="field-error" data-error-for="forgotEmail">
                                    {errorMessage}
                                </p>
                            )}
                        </div>

                        <button
                            style={{ marginTop: '20px' }}
                            type="submit"
                            className="btn btn-primary btn-full"
                            disabled={loading}
                        >
                            {loading ? "Sending code..." : "Send verification code"}
                        </button>
                    </form>
                </div>

                <p className="auth-footer-text" style={{ color: 'var(--text-secondary)' }}>
                    Remember your password?{" "}
                    <Link to='/Login' className="auth-inline-link">
                        Back to login
                    </Link>
                </p>
            </div>
        </main>
    );
}

export default ForgetPassword;
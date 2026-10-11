import { useEffect, useState } from "react";
import { KanbanSquare } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { requestPasswordOtp, verifyPasswordOtp } from "../../../../api.jsx";
import { notify } from "../../../utils/notify.js";
import { secondsLeft, validateReset } from "../../../utils/passwordForm.js";

const EMAIL_KEY = "resetPasswordEmail";
const RESEND_KEY = "resetPasswordResendAt";

const readNumber = (key) => {
    const value = Number(sessionStorage.getItem(key));
    return Number.isFinite(value) ? value : 0;
};

// Step 2 of "forgot password": the code comes from the email the backend sent (nothing is generated or shown here)
function ResetPassword() {
    const navigate = useNavigate();
    // read once: clearing the storage after a successful reset must not re-trigger the "no email" redirect
    const [email] = useState(() => sessionStorage.getItem(EMAIL_KEY) || "");
    const [otp, setOtp] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [errors, setErrors] = useState({});
    const [formError, setFormError] = useState("");
    const [info, setInfo] = useState("");
    const [loading, setLoading] = useState(false);
    const [resending, setResending] = useState(false);
    const [resendLeft, setResendLeft] = useState(() => secondsLeft(readNumber(RESEND_KEY)));

    useEffect(() => {
        if (!email) navigate("/forgot", { replace: true });
    }, [email, navigate]);

    useEffect(() => {
        if (resendLeft <= 0) return undefined;
        const id = setInterval(() => setResendLeft(secondsLeft(readNumber(RESEND_KEY))), 1000);
        return () => clearInterval(id);
    }, [resendLeft]);

    const handleResend = async () => {
        if (resending || resendLeft > 0) return;
        setFormError("");
        setInfo("");
        try {
            setResending(true);
            const data = await requestPasswordOtp(email);
            sessionStorage.setItem(RESEND_KEY, String(Date.now() + (Number(data?.resendAfterSeconds) || 60) * 1000));
            setResendLeft(secondsLeft(readNumber(RESEND_KEY)));
            setInfo("If an account exists for this email, a new code has been sent.");
        } catch (error) {
            setFormError(error.message || "Could not send the code. Please try again.");
        } finally {
            setResending(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (loading) return;
        setFormError("");
        setInfo("");
        const found = validateReset({ otp, newPassword, confirm: confirmPassword });
        setErrors(found);
        if (Object.keys(found).length > 0) return;

        try {
            setLoading(true);
            await verifyPasswordOtp({ email, otp: otp.trim(), newPassword });
            sessionStorage.removeItem(EMAIL_KEY);
            sessionStorage.removeItem(RESEND_KEY);
            notify({ type: "success", title: "Your password has been changed." });
            navigate("/login");
        } catch (error) {
            // wrong / expired code, too many attempts, network error: the backend message is shown as is
            setFormError(error.message || "Something went wrong. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    if (!email) return null;

    return (
        <main className="auth-page">
            <div className="auth-wrap size-lg">
                <div className="auth-brand-row">
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', textAlign: 'center', marginBottom: '24px' }}>
                        <span style={{ width: '44px', height: '44px', borderRadius: '12px', background: '#4f46e5', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <KanbanSquare size={24} />
                        </span>
                        <div>
                            <h1 style={{ fontSize: '20px', fontWeight: 600, margin: 0 }}>Reset Password</h1>
                            <p style={{ fontSize: '14px', color: '#6b7280', marginTop: '4px' }}>
                                Enter the 6-digit code sent to {email} and choose a new password.
                            </p>
                        </div>
                    </div>
                </div>

                <form id="resetPasswordForm" onSubmit={handleSubmit} noValidate>
                    <div className="field">
                        <label className="field-label" htmlFor="otp">Verification code</label>
                        <input
                            className="input"
                            id="otp"
                            name="otp"
                            inputMode="numeric"
                            autoComplete="one-time-code"
                            maxLength={6}
                            placeholder="6-digit code"
                            value={otp}
                            onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                            required
                        />
                        {errors.otp && <p className="field-error" data-error-for="otp">{errors.otp}</p>}
                    </div>

                    <div className="field">
                        <label className="field-label" htmlFor="newPassword">New Password</label>
                        <input
                            className="input"
                            type="password"
                            id="newPassword"
                            name="newPassword"
                            placeholder="Enter your new password"
                            autoComplete="new-password"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            required
                        />
                        {errors.newPassword && <p className="field-error" data-error-for="newPassword">{errors.newPassword}</p>}
                    </div>

                    <div className="field">
                        <label className="field-label" htmlFor="confirmPassword">Confirm Password</label>
                        <input
                            className="input"
                            type="password"
                            id="confirmPassword"
                            name="confirmPassword"
                            placeholder="Re-enter your new password"
                            autoComplete="new-password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            required
                        />
                        {errors.confirm && <p className="field-error" data-error-for="confirmPassword">{errors.confirm}</p>}
                    </div>

                    {formError && <p className="field-error" role="alert">{formError}</p>}
                    {info && <p className="chart-note" role="status">{info}</p>}

                    <button type="submit" className="btn btn-primary btn-full" style={{ marginTop: '20px' }} disabled={loading}>
                        {loading ? "Resetting..." : "Reset Password"}
                    </button>
                    <button type="button" className="btn btn-ghost btn-full" style={{ marginTop: '8px' }} onClick={handleResend} disabled={resending || resendLeft > 0}>
                        {resending ? "Sending..." : resendLeft > 0 ? `Resend code in ${resendLeft}s` : "Resend code"}
                    </button>
                    <p className="auth-footer-text"><Link to="/login">Back to login</Link></p>
                </form>
            </div>
        </main>
    );
}

export default ResetPassword;

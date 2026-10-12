import { Target, Eye, EyeOff, Send, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { API_BASE_URL, translateBackendMessage } from "../../config/apiConfig.js";
import { notify } from "../../utils/notify.js";

function Register() {
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    username: "",
    email: "",
    password: "",
    confirmPassword: "",
    role: "User",
    otp: ""
  });

  const [otpHash, setOtpHash] = useState("");
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [isOtpSent, setIsOtpSent] = useState(false);
  const [countdown, setCountdown] = useState(0);

  // State quản lý ẩn/hiện mật khẩu
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Đếm ngược thời gian gửi lại OTP
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  function handleChange(e) {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  }

  // Hàm gửi OTP
  async function handleSendOtp() {
    if (!formData.email) {
      notify({ type: "error", title: "Please enter your email first." });
      return;
    }

    try {
      setIsSendingOtp(true);
      const res = await fetch(`${API_BASE_URL}/user/send-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: formData.email })
      });
      const data = await res.json();

      if (res.ok) {
        setOtpHash(data.otpHash);
        setIsOtpSent(true);
        setCountdown(60); // Đếm ngược 60s
        notify({ type: "success", title: "OTP sent to your email!" });
      } else {
        notify({ type: "error", title: "Failed to send OTP", message: translateBackendMessage(data.message) });
      }
    } catch (error) {
      console.error(error);
      notify({ type: "error", title: "Server error while sending OTP." });
    } finally {
      setIsSendingOtp(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();

    if (!isOtpSent || !formData.otp) {
      notify({ type: "error", title: "Please enter the OTP sent to your email." });
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      notify({ type: "error", title: "The passwords do not match." });
      return;
    }

    try {
      const res = await fetch(`${API_BASE_URL}/user/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          otpHash // Truyền otpHash để backend xác thực
        })
      });
      const data = await res.json();
      if (res.ok) {
        notify({ type: "success", title: "Registration successful!" });
        navigate("/login");
      } else {
        notify({ type: "error", title: "Registration failed", message: translateBackendMessage(data.message) });
      }
    } catch (error) {
      console.log(error);
    }
  }

  return (
      <div className="auth-wrap size-lg">
        <div className="auth-brand-row">
          <span className="icon icon-xl auth-logo" data-icon="kanbanSquare">
            <svg viewBox="0 0 24 24">
              <rect width="18" height="18" x="3" y="3" rx="2"></rect>
              <path d="M8 7v7"></path>
              <path d="M12 7v4"></path>
              <path d="M16 7v9"></path>
            </svg>
          </span>
          <div>
            <h1>Create your account</h1>
            <p className="page-subtitle">It only takes a minute to get started with TeamFlow.</p>
          </div>
        </div>

        <div className="card auth-card">
          <form id="registerForm" noValidate="" onSubmit={handleSubmit}>
            <div className="field">
              <label className="field-label" htmlFor="UserName">UserName</label>
              <input className="input" type="text" id="UserName" name="username" value={formData.username} onChange={handleChange} placeholder="Your Name" autoComplete="username" required="" />
            </div>

            {/* Field Email + Nút Gửi OTP */}
            <div className="field">
              <label className="field-label" htmlFor="registerEmail">Email</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                    className="input"
                    type="email"
                    id="registerEmail"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    placeholder="you@teamflow.dev"
                    autoComplete="email"
                    required=""
                />
                <button
                    type="button"
                    className="btn btn-outline"
                    onClick={handleSendOtp}
                    disabled={isSendingOtp || countdown > 0}
                    style={{ whiteSpace: 'nowrap', minWidth: '110px' }}
                >
                  {isSendingOtp ? (
                      <Loader2 className="animate-spin" size={16} />
                  ) : countdown > 0 ? (
                      `${countdown}s`
                  ) : (
                      'Send OTP'
                  )}
                </button>
              </div>
            </div>

            {/* Field nhập OTP */}
            {isOtpSent && (
                <div className="field" style={{ marginTop: '12px' }}>
                  <label className="field-label" htmlFor="otp">Enter OTP Code</label>
                  <input
                      className="input"
                      type="text"
                      id="otp"
                      name="otp"
                      maxLength={6}
                      value={formData.otp}
                      onChange={handleChange}
                      placeholder="6-digit code"
                      required=""
                  />
                </div>
            )}

            {/* Password */}
            <div className="field">
              <label className="field-label" htmlFor="registerPassword">Password</label>
              <div className="password-field-wrap">
                <input
                    className="input"
                    type={showPassword ? "text" : "password"}
                    id="registerPassword"
                    value={formData.password}
                    onChange={handleChange}
                    name="password"
                    placeholder="At least 8 characters"
                    autoComplete="new-password"
                    required=""
                />
                <button
                    type="button"
                    className="password-toggle-btn icon-btn icon-btn-sm"
                    onClick={() => setShowPassword(!showPassword)}
                >
                  <span className="icon icon-sm">
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </span>
                </button>
              </div>
            </div>

            {/* Confirm Password */}
            <div className="field">
              <label className="field-label" htmlFor="confirmPassword">Confirm password</label>
              <div className="password-field-wrap">
                <input
                    className="input"
                    type={showConfirmPassword ? "text" : "password"}
                    id="confirmPassword"
                    value={formData.confirmPassword}
                    onChange={handleChange}
                    name="confirmPassword"
                    placeholder="Re-enter your password"
                    autoComplete="new-password"
                    required=""
                />
                <button
                    type="button"
                    className="password-toggle-btn icon-btn icon-btn-sm"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                >
                  <span className="icon icon-sm">
                    {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </span>
                </button>
              </div>
            </div>

            <button style={{ marginTop: '20px' }} type="submit" className="btn btn-primary btn-full">Sign up</button>
          </form>
        </div>

        <p className="auth-footer-text">Already have an account? <Link to='/login' className="auth-inline-link">Log in</Link></p>
      </div>
  );
}

export default Register;
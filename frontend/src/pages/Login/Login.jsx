import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { KanbanSquare, ArrowRight } from 'lucide-react';
import { API_BASE_URL, translateBackendMessage } from "../../config/apiConfig.js";

const DEMO_USERS = [
    { name: 'Quach Loan', role: 'Admin', initials: 'CS', color: '#4f46e5', email: 'quachloan2k3@gmail.com' },
    { name: 'Ngo Lam', role: 'Manager', initials: 'QL', color: '#0ea5e9', email: 'Manager@gmail.com' },
    { name: 'Khanh Ngoc', role: 'Member', initials: 'NL', color: '#16a34a', email: 'Member@gmail.com'},
    { name: 'Khánh Ngọc', role: 'System Admin', initials: 'KN', color: '#db2777', email: 'khanhngoc@teamflow.dev' },
];

export default function LoginPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [errorMessage, setErrorMessage] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const navigate = useNavigate();

    useEffect(() => {
        setEmail("");
        setPassword("");
    },[]);

    const handleFormSubmit = async (e) => {
        e.preventDefault();
        setErrorMessage('');
        setIsLoading(true);

        try {
            const response = await fetch(`${API_BASE_URL}/user/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password }),
            });

            const data = await response.json();

            if (response.ok) {
                localStorage.setItem('token', data.token);
                localStorage.setItem('user', JSON.stringify(data.user));
                navigate('/dashboard');
            } else {
                setErrorMessage(translateBackendMessage(data.message || data.error) || 'Sign-in failed.');
            }
        } catch (error) {
            setErrorMessage('Could not reach the server. Check that the backend is running.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleDemoSelect = async (demoEmail) => {
        setErrorMessage('');
        setIsLoading(true);

        try {
            const response = await fetch(
                `${API_BASE_URL}/user/login`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        email: demoEmail,
                        password: '123456'
                    })
                }
            );

            const data = await response.json();

            if (response.ok) {
                localStorage.setItem('token', data.token);
                localStorage.setItem('user', JSON.stringify(data.user));
                navigate('/dashboard');
            } else {
                setErrorMessage(
                    translateBackendMessage(data.message || data.error) || 'Sign-in failed.'
                );
            }
        } catch (error) {
            setErrorMessage('Could not reach the server. Check that the backend is running.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', backgroundColor: 'var(--bg-primary)' }}>
            <div style={{ width: '100%', maxWidth: '384px' }}>

                {/* Header */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', textAlign: 'center', marginBottom: '24px' }}>
                    <span
                        style={{
                            width: '44px',
                            height: '44px',
                            borderRadius: '12px',
                            background: 'var(--brand-color, #4f46e5)',
                            color: '#fff',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}
                    >
                        <KanbanSquare size={24} />
                    </span>
                    <div>
                        <h1 style={{ fontSize: '20px', fontWeight: 600, margin: 0, color: 'var(--text-primary)' }}>Welcome to TeamFlow</h1>
                        <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginTop: '4px' }}>Sign in to your workspace to continue.</p>
                    </div>
                </div>

                {/* Form Đăng nhập */}
                <form
                    className="card"
                    style={{
                        padding: '24px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '16px',
                        borderRadius: '8px',
                        border: '1px solid var(--border-color)',
                        backgroundColor: 'var(--bg-card)'
                    }}
                    onSubmit={handleFormSubmit}
                >
                    {/* Ô nhập Email */}
                    <div className="field">
                        <label className="field-label" htmlFor="email" style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px', color: 'var(--text-primary)' }}>
                            Email
                        </label>
                        <div style={{ position: 'relative' }}>
                            <input
                                className="input"
                                type="email"
                                id="email"
                                placeholder="you@teamflow.dev"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                                style={{
                                    width: '100%',
                                    padding: '8px 12px',
                                    borderRadius: '6px',
                                    border: '1px solid var(--input-border)',
                                    backgroundColor: 'var(--input-bg)',
                                    color: 'var(--text-primary)',
                                    outline: 'none'
                                }}
                            />
                        </div>
                    </div>

                    {/* Ô nhập Password */}
                    <div className="field">
                        <label className="field-label" htmlFor="password" style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px', color: 'var(--text-primary)' }}>
                            Password
                        </label>
                        <div style={{ position: 'relative' }}>
                            <input
                                className="input"
                                type="password"
                                id="password"
                                placeholder="••••••••"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                style={{
                                    width: '100%',
                                    padding: '8px 12px',
                                    borderRadius: '6px',
                                    border: '1px solid var(--input-border)',
                                    backgroundColor: 'var(--input-bg)',
                                    color: 'var(--text-primary)',
                                    outline: 'none'
                                }}
                            />
                        </div>
                    </div>

                    {/* Thông báo lỗi */}
                    {errorMessage && (
                        <div style={{ color: '#ef4444', backgroundColor: 'rgba(239, 68, 68, 0.1)', padding: '8px 12px', borderRadius: '6px', fontSize: '13px', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                            {errorMessage}
                        </div>
                    )}

                    {/* Nút Submit */}
                    <button
                        type="submit"
                        disabled={isLoading}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '8px',
                            padding: '10px',
                            backgroundColor: 'var(--brand-color, #4f46e5)',
                            color: '#fff',
                            border: 'none',
                            borderRadius: '6px',
                            fontWeight: 500,
                            cursor: 'pointer',
                            opacity: isLoading ? 0.7 : 1
                        }}
                    >
                        {isLoading ? 'Loading...' : 'Continue'}
                        {!isLoading && <ArrowRight size={16} />}
                    </button>
                </form>

                <p className="auth-footer-text" style={{ textAlign: "center", fontSize: "14px", color: "var(--text-secondary)", marginTop: "16px" }}>
                    Don't have an account?{" "}
                    <Link to='/register' className="auth-inline-link" style={{ color: "var(--brand-color, #4f46e5)", fontWeight: 500, textDecoration: "none" }}>Sign up</Link>
                </p>
                <p className="auth-footer-text" style={{ textAlign: "center", fontSize: "14px", color: "var(--text-secondary)", marginTop: "8px" }}>
                    <Link to='/forgot' className="auth-inline-link" style={{ color: "var(--brand-color, #4f46e5)", fontWeight: 500, textDecoration: "none" }}>Forgot Password ?</Link>
                </p>

                <div style={{ marginTop: '24px' }}>
                    <p style={{ textAlign: 'center', marginBottom: '8px', fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '.04em' }}>
                        Or continue as a demo account
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {DEMO_USERS.map((user) => (
                            <button
                                key={user.name}
                                type="button"
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '12px',
                                    padding: '10px 12px',
                                    textAlign: 'left',
                                    cursor: 'pointer',
                                    border: '1px solid var(--border-color)',
                                    borderRadius: '6px',
                                    backgroundColor: 'var(--bg-card)'
                                }}
                                onClick={() => handleDemoSelect(user.email)}
                                disabled={isLoading}
                            >
                                <span style={{ width: '32px', height: '32px', borderRadius: '50%', background: user.color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 600 }}>
                                    {user.initials}
                                </span>
                                <span style={{ flex: 1 }}>
                                    <span style={{ display: 'block', fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>
                                        {user.name}
                                    </span>
                                    <span style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)' }}>
                                        {user.role} ({user.email})
                                    </span>
                                </span>
                            </button>
                        ))}
                    </div>
                </div>

            </div>
        </main>
    );
}
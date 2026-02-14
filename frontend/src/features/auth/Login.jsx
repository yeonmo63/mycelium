import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { emit } from '@tauri-apps/api/event';
import { QRCodeSVG } from 'qrcode.react';

const Login = ({ onLoginSuccess }) => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [companyName, setCompanyName] = useState('마이셀리움');
    const [localIp, setLocalIp] = useState('');
    const [showQR, setShowQR] = useState(false);

    useEffect(() => {
        sessionStorage.clear();

        const loadCompanyName = async () => {
            try {
                if (window.__TAURI__) {
                    const info = await invoke('get_company_info');
                    if (info && info.company_name) {
                        setCompanyName(info.company_name);
                    }
                }
            } catch (err) {
                console.error("Failed to load company name:", err);
            }
        };
        loadCompanyName();

        const fetchIp = async () => {
            try {
                if (window.__TAURI__) {
                    const ip = await invoke('get_local_ip_command');
                    if (ip) setLocalIp(ip);
                }
            } catch (err) {
                console.error("Failed to fetch IP:", err);
            }
        };
        fetchIp();
    }, []);

    const handleLogin = async (e) => {
        e.preventDefault();
        setError('');

        if (!username || !password) {
            setError('아이디와 비밀번호를 모두 입력해주세요.');
            return;
        }

        setIsLoading(true);

        try {
            const isWeb = !window.__TAURI__;

            // Check if we are in a mobile browser (no Tauri bridge)
            if (isWeb && window.location.pathname.startsWith('/mobile-')) {
                console.log("Mobile browser detected. Entering Preview Mode.");
                sessionStorage.setItem('isLoggedIn', 'true');
                sessionStorage.setItem('userId', '999');
                sessionStorage.setItem('username', 'MobilePreview');
                sessionStorage.setItem('userRole', 'admin');

                if (onLoginSuccess) {
                    onLoginSuccess();
                } else {
                    window.location.reload();
                }
                return;
            }

            let response;
            if (isWeb) {
                try {
                    const res = await fetch('/api/auth/login', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            username: username.trim(),
                            password: password.trim()
                        })
                    });
                    response = await res.json();
                } catch (e) {
                    console.error("Web Login Fetch Error:", e);
                    throw e;
                }
            } else {
                response = await invoke('login', {
                    username: username.trim(),
                    password: password.trim()
                });
            }

            if (response.success) {
                sessionStorage.setItem('isLoggedIn', 'true');
                sessionStorage.setItem('userId', response.user_id.toString());
                sessionStorage.setItem('username', response.username);
                sessionStorage.setItem('userRole', response.role);

                if (onLoginSuccess) {
                    onLoginSuccess();
                } else {
                    window.location.reload();
                }
            } else {
                setError(response.message || '로그인에 실패했습니다.');
            }
        } catch (err) {
            console.error('Login error:', err);
            setError('서버와의 통신 중 오류가 발생했습니다.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 animate-in fade-in duration-500">
            {/* Backdrop Blur Layer */}
            <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-md" />

            <div style={{
                width: '100%',
                maxWidth: '440px',
                zIndex: 10,
                position: 'relative'
            }} className="animate-in zoom-in-95 duration-500 slide-in-from-bottom-4">
                <div style={{
                    background: 'rgba(30, 41, 59, 0.7)',
                    backdropFilter: 'blur(24px)',
                    WebkitBackdropFilter: 'blur(24px)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '40px',
                    padding: '56px 48px',
                    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
                    display: 'flex',
                    flexDirection: 'column',
                    position: 'relative'
                }}>
                    {/* Background Glows */}
                    <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/20 blur-[50px] rounded-full pointer-events-none"></div>
                    <div className="absolute bottom-0 left-0 w-32 h-32 bg-purple-500/20 blur-[50px] rounded-full pointer-events-none"></div>

                    {/* Tiny QR Code (Top Left) - Always Visible */}
                    <div style={{
                        position: 'absolute',
                        top: '24px',
                        left: '24px',
                        background: '#fff',
                        padding: '6px',
                        borderRadius: '14px',
                        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.2)',
                        zIndex: 20,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        transition: 'transform 0.2s',
                        cursor: 'pointer'
                    }} className="hover:scale-110" title={`접속 주소: ${localIp}:8989`}>
                        <QRCodeSVG
                            value={`http://${localIp || 'localhost'}:8989`}
                            size={40}
                            level="M"
                            includeMargin={false}
                        />
                        <span style={{ fontSize: '7px', fontWeight: '900', color: '#1e293b', marginTop: '2px', opacity: 0.6 }}>QR LINK</span>
                    </div>

                    {/* UI Close Button (Top Right) */}
                    <button
                        type="button"
                        onClick={() => {
                            console.log("Login: UI Close button clicked");
                            emit('window_close_requested', {});
                        }}
                        style={{
                            position: 'absolute',
                            top: '24px',
                            right: '24px',
                            background: '#fff',
                            border: '1px solid #e2e8f0',
                            width: '40px',
                            height: '40px',
                            borderRadius: '12px',
                            color: '#6366f1',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                            zIndex: 200,
                            boxShadow: '0 4px 12px rgba(0,0,0,0.08)'
                        }}
                        className="hover:scale-110 active:scale-95"
                        title="프로그램 종료"
                    >
                        <span className="material-symbols-rounded" style={{ fontSize: '20px', fontWeight: 'bold' }}>close</span>
                    </button>

                    <div style={{ textAlign: 'center', marginBottom: '48px', position: 'relative', zIndex: 10 }}>
                        <div style={{
                            width: '88px',
                            height: '88px',
                            background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
                            borderRadius: '28px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            margin: '0 auto 28px',
                            boxShadow: '0 20px 40px rgba(99, 102, 241, 0.3)',
                            transform: 'rotate(-5deg)'
                        }}>
                            <span className="material-symbols-rounded" style={{ fontSize: '48px', color: '#fff' }}>space_dashboard</span>
                        </div>
                        <h1 style={{
                            fontSize: '32px',
                            fontWeight: '900',
                            color: '#fff',
                            marginBottom: '12px',
                            letterSpacing: '-0.02em',
                        }}>{companyName}</h1>
                        <p style={{ color: '#94a3b8', fontSize: '15px', fontWeight: '500' }}>지능형 통합 관제 센터</p>
                    </div>

                    <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '20px', position: 'relative', zIndex: 10 }}>
                        <div style={{ position: 'relative' }}>
                            <span className="material-symbols-rounded" style={{
                                position: 'absolute',
                                left: '20px',
                                top: '50%',
                                transform: 'translateY(-50%)',
                                color: '#64748b',
                                fontSize: '22px'
                            }}>person</span>
                            <input
                                type="text"
                                placeholder="아이디"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                style={{
                                    width: '100%',
                                    padding: '18px 20px 18px 60px',
                                    background: '#020617', // Force dark background (slate-950)
                                    border: '1px solid #334155', // slate-700
                                    borderRadius: '20px',
                                    color: '#ffffff', // Force white text
                                    fontSize: '16px',
                                    fontWeight: '500',
                                    outline: 'none',
                                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                    boxSizing: 'border-box'
                                }}
                                className="focus:border-indigo-500 transition-colors"
                            />
                        </div>

                        <div style={{ position: 'relative' }}>
                            <span className="material-symbols-rounded" style={{
                                position: 'absolute',
                                left: '20px',
                                top: '50%',
                                transform: 'translateY(-50%)',
                                color: '#64748b',
                                fontSize: '22px'
                            }}>lock</span>
                            <input
                                type="password"
                                placeholder="비밀번호"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                style={{
                                    width: '100%',
                                    padding: '18px 20px 18px 60px',
                                    background: '#020617', // Force dark background
                                    border: '1px solid #334155',
                                    borderRadius: '20px',
                                    color: '#ffffff', // Force white text
                                    fontSize: '16px',
                                    fontWeight: '500',
                                    outline: 'none',
                                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                    boxSizing: 'border-box'
                                }}
                                className="focus:border-indigo-500 transition-colors"
                            />
                            {/* Force Autofill Override Styles - Scoped to this component */}
                            <style>{`
                                input:-webkit-autofill,
                                input:-webkit-autofill:hover, 
                                input:-webkit-autofill:focus, 
                                input:-webkit-autofill:active {
                                    -webkit-box-shadow: 0 0 0 30px #020617 inset !important;
                                    -webkit-text-fill-color: white !important;
                                    caret-color: white !important;
                                }
                            `}</style>
                        </div>

                        {error && (
                            <div style={{
                                padding: '14px 20px',
                                background: 'rgba(239, 68, 68, 0.12)',
                                color: '#f87171',
                                borderRadius: '16px',
                                fontSize: '14px',
                                fontWeight: '500',
                                textAlign: 'center',
                                border: '1px solid rgba(239, 68, 68, 0.2)',
                            }} className="animate-pulse">
                                {error}
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={isLoading}
                            style={{
                                padding: '18px',
                                background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
                                border: 'none',
                                borderRadius: '20px',
                                color: '#fff',
                                fontWeight: '800',
                                fontSize: '17px',
                                cursor: 'pointer',
                                marginTop: '16px',
                                boxShadow: '0 12px 24px rgba(99, 102, 241, 0.3)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '10px'
                            }}
                            className="hover:translate-y-[-2px] hover:shadow-indigo-500/50 active:translate-y-[0px] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isLoading ? (
                                <>
                                    <span className="material-symbols-rounded animate-spin text-xl">sync</span>
                                    <span>인증 처리 중...</span>
                                </>
                            ) : (
                                <span>시스템 로그인</span>
                            )}
                        </button>
                    </form>

                    <div style={{
                        marginTop: '48px',
                        textAlign: 'center',
                        fontSize: '14px',
                        color: '#64748b',
                        fontWeight: '500'
                    }}>
                        <p style={{ opacity: 0.8 }}>인가된 관계자 전용 시스템</p>
                        <p style={{ marginTop: '12px', opacity: 0.5, fontSize: '12px', letterSpacing: '0.05em' }}>© 2024 {companyName.toUpperCase()}.</p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Login;

import React, { useState, useEffect } from 'react';
import { Shield, Delete, RefreshCw, X as XIcon } from 'lucide-react';
import { invoke } from '../../utils/apiBridge';

const MobileLogin = ({ onLoginSuccess }) => {
    const [pin, setPin] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    // Auto-submit when PIN reaches 6 digits
    useEffect(() => {
        if (pin.length === 6 && !isLoading) {
            verifyPin(pin);
        }
    }, [pin]);

    const handleNumber = (n) => {
        if (pin.length < 6 && !isLoading) {
            setPin(prev => prev + n);
            setError('');
        }
    };

    const handleDelete = () => {
        if (isLoading) return;
        setPin(pin.slice(0, -1));
        setError('');
    };

    const handleClear = () => {
        if (isLoading) return;
        setPin('');
        setError('');
    };

    const verifyPin = async (currentPin) => {
        setIsLoading(true);
        setError('');

        try {
            const data = await invoke('verify_mobile_pin', { pin: currentPin });

            if (data.success) {
                localStorage.setItem('username', data.username);
                localStorage.setItem('userRole', data.role);
                localStorage.setItem('isLoggedIn', 'true');
                localStorage.setItem('pin_verified', 'true');
                if (data.token) {
                    localStorage.setItem('token', data.token);
                }
                onLoginSuccess();
            } else {
                setError(data.error || 'PIN 번호가 올바르지 않습니다.');
                if (window.navigator.vibrate) window.navigator.vibrate(200);
                setPin('');
            }
        } catch (err) {
            console.error('Login Error:', err);
            const baseUrl = localStorage.getItem('API_BASE_URL') || '';
            const callUrl = `${baseUrl}/api/auth/verify`;
            setError(`${err.name}: ${err.message} (Target: ${callUrl})`);
        } finally {
            setIsLoading(false);
        }
    };

    const [showSettings, setShowSettings] = useState(() => !localStorage.getItem('API_BASE_URL'));
    const [serverUrl, setServerUrl] = useState(localStorage.getItem('API_BASE_URL') || '');

    const saveSettings = () => {
        let url = serverUrl.trim();
        if (url && !url.startsWith('http')) {
            url = 'https://' + url; // Default to https
        }
        localStorage.setItem('API_BASE_URL', url);
        setShowSettings(false);
        setError('서버 주소가 업데이트되었습니다.');
        setTimeout(() => setError(''), 2000);
    };

    return (
        <div className="fixed inset-0 bg-slate-50 flex flex-col items-center justify-between pt-40 pb-10 px-8 font-sans z-[1000] animate-in fade-in duration-500 overflow-hidden touch-none select-none">
            {/* Top Section */}
            <div className="flex-1 flex flex-col items-center justify-start text-center space-y-8 w-full min-h-0">
                <div className={`w-20 h-20 sm:w-28 sm:h-28 rounded-3xl sm:rounded-[2.5rem] flex items-center justify-center shadow-xl sm:shadow-2xl transition-all duration-500 bg-white ${error ? 'border-4 border-rose-500 shadow-rose-200' : 'shadow-indigo-200 animate-bounce-slow'
                    }`}>
                    {isLoading ? (
                        <RefreshCw size={40} className="text-indigo-600 animate-spin sm:w-[52px] sm:h-[52px]" />
                    ) : (
                        <img src="/mushroom-app-icon.png" alt="Logo" className="w-12 h-12 sm:w-16 sm:h-16 object-contain" />
                    )}
                </div>

                <div className="space-y-2 sm:space-y-4">
                    <h1 className="text-2xl sm:text-3xl font-black text-slate-800 tracking-tight">현장 모바일 접속</h1>
                    <p className="text-slate-400 font-bold text-xs sm:text-base">6자리 보안 PIN을 입력하세요.</p>
                </div>

                {/* PIN Display */}
                <div className="flex gap-4 sm:gap-6 mt-6 sm:mt-12">
                    {[...Array(6)].map((_, i) => {
                        const isActive = i < pin.length;
                        return (
                            <div
                                key={i}
                                className={`w-5 h-5 sm:w-6 sm:h-6 rounded-full transition-all duration-200 ${isActive
                                    ? 'bg-indigo-600 scale-125 shadow-lg shadow-indigo-200'
                                    : 'bg-slate-200 scale-100'
                                    } ${error ? 'bg-rose-500 shadow-rose-100' : ''}`}
                            />
                        );
                    })}
                </div>

                <div className="h-6">
                    {error && (
                        <p className="text-rose-500 text-xs sm:text-sm font-black animate-shake">{error}</p>
                    )}
                </div>
            </div>

            {/* Keypad Section */}
            <div className="w-full max-w-sm grid grid-cols-3 gap-3 sm:gap-4 mb-6 sm:mb-12">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                    <button
                        key={n}
                        type="button"
                        onClick={() => handleNumber(n)}
                        className="h-14 sm:h-18 bg-white rounded-2xl flex items-center justify-center text-2xl font-black text-slate-700 shadow-[0_3px_0_0_rgba(226,232,240,1)] active:shadow-none active:translate-y-1 active:bg-indigo-50 transition-all"
                    >
                        {n}
                    </button>
                ))}
                <button
                    type="button"
                    onClick={handleDelete}
                    className="h-14 flex items-center justify-center text-slate-400 active:text-rose-500"
                >
                    <Delete size={24} />
                </button>
                <button
                    type="button"
                    onClick={() => handleNumber(0)}
                    className="h-14 bg-white rounded-2xl flex items-center justify-center text-2xl font-black text-slate-700 shadow-[0_3px_0_0_rgba(226,232,240,1)] active:shadow-none active:translate-y-1 active:bg-indigo-50 transition-all"
                >
                    0
                </button>
                <button
                    type="button"
                    onClick={() => setShowSettings(true)}
                    className="h-14 flex flex-col items-center justify-center text-slate-400 active:text-indigo-600 transition-colors"
                >
                    <RefreshCw size={18} className="mb-1" />
                    <span className="text-[10px] font-black">서버설정</span>
                </button>
            </div>

            {/* Settings Modal */}
            {showSettings && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[1100] flex items-end sm:items-center justify-center p-0 sm:p-4">
                    <div className="bg-white w-full max-w-md rounded-t-[2.5rem] sm:rounded-[2.5rem] p-8 space-y-6 shadow-2xl animate-in slide-in-from-bottom duration-300">
                        <div className="flex justify-between items-center">
                            <h2 className="text-xl font-black text-slate-800">서버 연결 설정</h2>
                            <button onClick={() => setShowSettings(false)} className="p-2 bg-slate-100 rounded-full text-slate-400"><XIcon size={20} /></button>
                        </div>
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <label className="text-xs font-black text-slate-400 uppercase tracking-wider pl-1">서버 주소 (IP 또는 도메인)</label>
                                <input
                                    type="text"
                                    className="w-full h-14 bg-slate-50 border-2 border-transparent focus:border-indigo-500 focus:bg-white rounded-2xl px-6 font-bold text-slate-700 outline-none transition-all"
                                    placeholder="http://100.x.x.x:3000"
                                    value={serverUrl}
                                    onChange={(e) => setServerUrl(e.target.value)}
                                />
                            </div>
                            <button
                                onClick={saveSettings}
                                className="w-full h-14 bg-indigo-600 text-white rounded-2xl font-black text-sm shadow-lg shadow-indigo-100 active:scale-[0.98] transition-all"
                            >
                                주소 저장 및 적용
                            </button>
                            <p className="text-[10px] text-slate-400 font-bold text-center leading-relaxed">
                                * 테일스케일 IP와 포트 3000을 입력해 주세요.<br />
                                (예: http://100.78.11.10:3000)
                            </p>
                        </div>
                    </div>
                </div>
            )}

            <style>{`
                @keyframes bounce-slow {
                    0%, 100% { transform: translateY(0); }
                    50% { transform: translateY(-12px); }
                }
                .animate-bounce-slow {
                    animation: bounce-slow 4s ease-in-out infinite;
                }
                @keyframes shake {
                    0%, 100% { transform: translateX(0); }
                    20% { transform: translateX(-8px); }
                    40% { transform: translateX(8px); }
                    60% { transform: translateX(-8px); }
                    80% { transform: translateX(8px); }
                }
                .animate-shake {
                    animation: shake 0.4s cubic-bezier(.36,.07,.19,.97) both;
                }
                button {
                    -webkit-tap-highlight-color: transparent;
                }
            `}</style>
        </div>
    );
};

export default MobileLogin;

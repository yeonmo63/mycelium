import React, { useState, useEffect } from 'react';
import { Shield, Delete, RefreshCw, X } from 'lucide-react';

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
            const response = await fetch('/api/auth/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pin: currentPin })
            });

            const data = await response.json();
            if (data.success) {
                sessionStorage.setItem('username', data.username);
                sessionStorage.setItem('userRole', data.role);
                sessionStorage.setItem('isLoggedIn', 'true');
                sessionStorage.setItem('pin_verified', 'true');
                onLoginSuccess();
            } else {
                setError(data.error || 'PIN 번호가 올바르지 않습니다.');
                // Haptic feedback simulation
                if (window.navigator.vibrate) window.navigator.vibrate(200);
                setPin('');
            }
        } catch (err) {
            console.error(err);
            setError('서버 연결에 실패했습니다.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-slate-50 flex flex-col items-center justify-between p-4 sm:p-8 font-sans z-[1000] animate-in fade-in duration-500 overflow-hidden touch-none select-none">
            {/* Top Section - Reduced padding and spacing for small screens */}
            <div className="flex-1 flex flex-col items-center justify-center text-center space-y-4 sm:space-y-8 w-full min-h-0">
                <div className={`w-16 h-16 sm:w-24 sm:h-24 rounded-2xl sm:rounded-[2.5rem] flex items-center justify-center shadow-xl sm:shadow-2xl transition-all duration-500 ${error ? 'bg-rose-500 shadow-rose-200' : 'bg-indigo-600 shadow-indigo-200 animate-bounce-slow'
                    }`}>
                    {isLoading ? (
                        <RefreshCw size={32} className="text-white animate-spin sm:w-[44px] sm:h-[44px]" />
                    ) : (
                        <Shield size={32} className="text-white sm:w-[44px] sm:h-[44px]" />
                    )}
                </div>

                <div className="space-y-1 sm:space-y-3">
                    <h1 className="text-xl sm:text-2xl font-black text-slate-800 tracking-tight">현장 모바일 접속</h1>
                    <p className="text-slate-400 font-bold text-[10px] sm:text-sm">6자리 보안 PIN을 입력하세요.</p>
                </div>

                {/* PIN Display - Made more compact */}
                <div className="flex gap-3 sm:gap-4 mt-4 sm:mt-8">
                    {[...Array(6)].map((_, i) => {
                        const isActive = i < pin.length;
                        return (
                            <div
                                key={i}
                                className={`w-4 h-4 sm:w-5 sm:h-5 rounded-full transition-all duration-200 ${isActive
                                    ? 'bg-indigo-600 scale-125 shadow-lg shadow-indigo-200'
                                    : 'bg-slate-200 scale-100'
                                    } ${error ? 'bg-rose-500 shadow-rose-100' : ''}`}
                            />
                        );
                    })}
                </div>

                <div className="h-4">
                    {error && (
                        <p className="text-rose-500 text-[10px] sm:text-xs font-black animate-shake">{error}</p>
                    )}
                </div>
            </div>

            {/* Keypad Section - Responsive button height and smaller gaps */}
            <div className="w-full max-w-sm grid grid-cols-3 gap-2 sm:gap-3 mb-2 sm:mb-8">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                    <button
                        key={n}
                        type="button"
                        onClick={() => handleNumber(n)}
                        className="h-14 sm:h-20 bg-white rounded-2xl sm:rounded-[2rem] flex items-center justify-center text-2xl sm:text-3xl font-black text-slate-700 shadow-[0_3px_0_0_rgba(226,232,240,1)] active:shadow-none active:translate-y-1 active:bg-indigo-50 active:text-indigo-600 transition-all duration-75"
                    >
                        {n}
                    </button>
                ))}
                <button
                    type="button"
                    onClick={handleDelete}
                    className="h-14 sm:h-20 flex items-center justify-center text-slate-400 active:text-rose-500 transition-colors"
                >
                    <Delete size={24} className="sm:w-[28px] sm:h-[28px]" />
                </button>
                <button
                    type="button"
                    onClick={() => handleNumber(0)}
                    className="h-14 sm:h-20 bg-white rounded-2xl sm:rounded-[2rem] flex items-center justify-center text-2xl sm:text-3xl font-black text-slate-700 shadow-[0_3px_0_0_rgba(226,232,240,1)] active:shadow-none active:translate-y-1 active:bg-indigo-50 active:text-indigo-600 transition-all duration-75"
                >
                    0
                </button>
                <button
                    type="button"
                    onClick={handleClear}
                    className="h-14 sm:h-20 flex items-center justify-center text-slate-400 active:text-indigo-600 transition-colors font-black text-[10px] sm:text-sm"
                >
                    초기화
                </button>
            </div>

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

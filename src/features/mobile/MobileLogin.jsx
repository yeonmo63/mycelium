import React, { useState } from 'react';
import { Shield, Delete, RefreshCw } from 'lucide-react';

const MobileLogin = ({ onLoginSuccess }) => {
    const [pin, setPin] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    const handleNumber = (n) => {
        if (pin.length < 6) {
            const newPin = pin + n;
            setPin(newPin);
            if (newPin.length >= 4) {
                // Potential auto-submit can be added here, but manual is safer for variability
            }
        }
    };

    const handleDelete = () => {
        setPin(pin.slice(0, -1));
        setError('');
    };

    const handleSubmit = async () => {
        if (pin.length < 4) {
            setError('PIN 번호를 4자리 이상 입력해주세요.');
            return;
        }

        setIsLoading(true);
        setError('');

        try {
            const response = await fetch('/api/auth/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pin })
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
        <div className="fixed inset-0 bg-slate-50 flex flex-col items-center justify-between p-8 font-sans z-[1000] animate-in fade-in duration-500">
            {/* Top Section */}
            <div className="flex-1 flex flex-col items-center justify-center text-center space-y-6">
                <div className="w-20 h-20 bg-indigo-600 rounded-3xl flex items-center justify-center shadow-2xl shadow-indigo-200 animate-bounce-slow">
                    <Shield size={40} className="text-white" />
                </div>

                <div className="space-y-2">
                    <h1 className="text-2xl font-black text-slate-800 tracking-tight">마이셀리움 현장 접속</h1>
                    <p className="text-slate-400 font-bold text-sm">보안을 위해 PIN 번호를 입력해주세요.</p>
                </div>

                {/* PIN Display */}
                <div className="flex gap-4 mt-8">
                    {[...Array(6)].map((_, i) => (
                        <div
                            key={i}
                            className={`w-4 h-4 rounded-full transition-all duration-300 ${i < pin.length
                                ? 'bg-indigo-600 scale-125 shadow-lg shadow-indigo-200'
                                : 'bg-slate-200'
                                }`}
                        />
                    ))}
                </div>

                {error && (
                    <p className="text-rose-500 text-xs font-black animate-shake">{error}</p>
                )}
            </div>

            {/* Keypad Section */}
            <div className="w-full max-w-xs grid grid-cols-3 gap-4 mb-12">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                    <button
                        key={n}
                        onClick={() => handleNumber(n)}
                        className="h-20 bg-white rounded-2xl flex items-center justify-center text-2xl font-black text-slate-700 shadow-sm active:bg-slate-100 active:scale-95 transition-all"
                    >
                        {n}
                    </button>
                ))}
                <button
                    onClick={handleDelete}
                    className="h-20 flex items-center justify-center text-slate-400 active:text-slate-600 transition-colors"
                >
                    <Delete size={24} />
                </button>
                <button
                    onClick={() => handleNumber(0)}
                    className="h-20 bg-white rounded-2xl flex items-center justify-center text-2xl font-black text-slate-700 shadow-sm active:bg-slate-100 active:scale-95 transition-all"
                >
                    0
                </button>
                <button
                    onClick={handleSubmit}
                    disabled={isLoading || pin.length < 4}
                    className="h-20 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-indigo-100 active:scale-95 transition-all disabled:opacity-50"
                >
                    {isLoading ? <RefreshCw size={24} className="animate-spin" /> : <Shield size={24} />}
                </button>
            </div>

            <style>{`
                @keyframes bounce-slow {
                    0%, 100% { transform: translateY(0); }
                    50% { transform: translateY(-10px); }
                }
                .animate-bounce-slow {
                    animation: bounce-slow 3s ease-in-out infinite;
                }
                @keyframes shake {
                    0%, 100% { transform: translateX(0); }
                    25% { transform: translateX(-5px); }
                    75% { transform: translateX(5px); }
                }
                .animate-shake {
                    animation: shake 0.2s ease-in-out 2;
                }
            `}</style>
        </div>
    );
};

export default MobileLogin;

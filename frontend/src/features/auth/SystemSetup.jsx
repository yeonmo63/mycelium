import React, { useState } from 'react';
import { useModal } from '../../contexts/ModalContext';
import { invoke } from '../../utils/apiBridge';

const SystemSetup = ({ onComplete }) => {
    const { showAlert } = useModal();
    const [dbUser, setDbUser] = useState('postgres');
    const [dbPass, setDbPass] = useState('');
    const [dbHost, setDbHost] = useState('localhost');
    const [dbPort, setDbPort] = useState('5432');
    const [dbName, setDbName] = useState('mycelium');
    const [geminiKey, setGeminiKey] = useState('');
    const [jwtSecret, setJwtSecret] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isFinished, setIsFinished] = useState(false);
    const [isTransitioning, setIsTransitioning] = useState(false); // New state to prevent double-click fire
    const [step, setStep] = useState(1);

    const generateSecret = () => {
        const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+';
        let secret = '';
        for (let i = 0; i < 32; i++) {
            secret += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        setJwtSecret(secret);
    };

    const goToNextStep = (next) => {
        setIsTransitioning(true);
        setStep(next);
        // Add a 500ms delay before allowing inputs/buttons in the next step to prevent accidental clicks
        setTimeout(() => setIsTransitioning(false), 500);
    };

    // Generate random secret on mount
    React.useEffect(() => {
        generateSecret();
    }, []);

    const handleSetup = async (e) => {
        e.preventDefault();

        // Safety: Only allow submission on the final step AND not transitioning
        if (step < 3 || isTransitioning || isLoading) return;

        setIsLoading(true);
        try {
            await invoke('system_setup', {
                dbUser,
                dbPass,
                dbHost,
                dbPort,
                dbName,
                geminiKey: geminiKey || null,
                jwtSecret: jwtSecret || null
            });

            await showAlert("설정 완료", "시스템 설정이 완료되었습니다. 변경 사항을 적용하기 위해 프로그램을 재시작해주세요.");

            setIsFinished(true);

            // Give the backend a moment to settle (and potentially auto-restart in dev mode)
            setTimeout(() => {
                window.location.href = '/';
            }, 3000);
        } catch (err) {
            console.error(err);
            await showAlert("설정 오류", err.message || "알 수 없는 오류가 발생했습니다.");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 animate-in fade-in duration-500">
            {/* Backdrop Blur Overlay */}
            <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-md" />

            {/* Modal Content */}
            <div className="w-full max-w-2xl bg-slate-900/90 backdrop-blur-3xl border border-slate-700/50 rounded-[48px] p-12 shadow-2xl relative z-10 animate-in zoom-in-95 duration-500 slide-in-from-bottom-4">
                {/* Background Aesthetic inside Modal */}
                <div className="absolute top-[-10%] left-[-10%] w-[400px] h-[400px] bg-indigo-500/20 blur-[100px] rounded-full pointer-events-none"></div>
                <div className="absolute bottom-[-10%] right-[-10%] w-[400px] h-[400px] bg-purple-500/20 blur-[100px] rounded-full pointer-events-none"></div>

                {/* Close Button */}
                <button
                    onClick={async () => {
                        if (window.confirm("설정을 중단하고 창을 닫으시겠습니까?")) {
                            window.close();
                        }
                    }}
                    className="absolute top-8 right-8 w-10 h-10 rounded-xl bg-slate-800/50 border border-slate-700 text-slate-500 hover:text-rose-500 hover:bg-rose-500/10 hover:border-rose-500/20 transition-all flex items-center justify-center z-20"
                    title="프로그램 종료"
                >
                    <span className="material-symbols-rounded text-xl">close</span>
                </button>

                <div className="text-center mb-12 relative z-10">
                    <div className="w-20 h-20 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-indigo-500/20 rotate-3 ring-4 ring-slate-900/50">
                        <span className="material-symbols-rounded text-white text-4xl">auto_fix_high</span>
                    </div>
                    <h1 className="text-4xl font-black text-white mb-3 tracking-tight">System Setup</h1>
                    <p className="text-slate-400 font-medium">관리자 권한으로 초기 시스템 환경을 구성합니다.</p>
                </div>

                <div className="flex gap-4 mb-10 justify-center relative z-10">
                    {[1, 2, 3].map(i => (
                        <div key={i} className={`h-1.5 rounded-full transition-all duration-500 ${step >= i ? 'w-12 bg-indigo-500' : 'w-6 bg-slate-800'}`}></div>
                    ))}
                </div>

                {isFinished ? (
                    <div className="text-center py-10 animate-in zoom-in-95 duration-500 relative z-10">
                        <div className="w-24 h-24 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-8 text-green-500 border border-green-500/20">
                            <span className="material-symbols-rounded text-6xl">check_circle</span>
                        </div>
                        <h2 className="text-3xl font-black text-white mb-4">설정 완료!</h2>
                        <p className="text-slate-400 mb-8 leading-relaxed">
                            데이터베이스와 보안 설정이 성공적으로 저장되었습니다.<br />
                            보다 안정적인 작동을 위해 프로그램을 **완전히 종료 후 재시작**해 주시기 바랍니다.
                        </p>
                        <div className="p-4 bg-indigo-500/10 rounded-2xl border border-indigo-500/20 mb-8">
                            <p className="text-indigo-400 text-sm font-bold flex items-center justify-center gap-2">
                                <span className="material-symbols-rounded animate-spin text-lg">sync</span>
                                잠시 후 로그인 화면으로 이동합니다...
                            </p>
                        </div>
                    </div>
                ) : (
                    <div className="relative z-10">
                        {step === 1 ? (
                            <div className="space-y-6 animate-in fade-in slide-in-from-right-8 duration-300">
                                <div>
                                    <h3 className="text-xl font-bold text-white mb-1">데이터베이스 연결</h3>
                                    <p className="text-sm text-slate-500 mb-6">PostgreSQL 서버 접속 정보를 입력하세요.</p>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <label className="text-xs font-bold text-slate-500 ml-1">호스트 (Host)</label>
                                            <input type="text" value={dbHost} onChange={e => setDbHost(e.target.value)}
                                                className="w-full rounded-2xl px-5 py-3.5 outline-none focus:border-indigo-500 transition-all"
                                                style={{ backgroundColor: '#020617', color: '#ffffff', border: '1px solid #334155' }} />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-xs font-bold text-slate-500 ml-1">포트 (Port)</label>
                                            <input type="text" value={dbPort} onChange={e => setDbPort(e.target.value)}
                                                className="w-full rounded-2xl px-5 py-3.5 outline-none focus:border-indigo-500 transition-all"
                                                style={{ backgroundColor: '#020617', color: '#ffffff', border: '1px solid #334155' }} />
                                        </div>
                                        <div className="space-y-2 col-span-2">
                                            <label className="text-xs font-bold text-slate-500 ml-1">데이터베이스 이름 (DB Name)</label>
                                            <input type="text" value={dbName} onChange={e => setDbName(e.target.value)}
                                                className="w-full rounded-2xl px-5 py-3.5 outline-none focus:border-indigo-500 transition-all"
                                                style={{ backgroundColor: '#020617', color: '#ffffff', border: '1px solid #334155' }}
                                                placeholder="기본값: mycelium" />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-xs font-bold text-slate-500 ml-1">사용자 ID</label>
                                            <input type="text" value={dbUser} onChange={e => setDbUser(e.target.value)}
                                                className="w-full rounded-2xl px-5 py-3.5 outline-none focus:border-indigo-500 transition-all"
                                                style={{ backgroundColor: '#020617', color: '#ffffff', border: '1px solid #334155' }} />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-xs font-bold text-slate-500 ml-1">비밀번호</label>
                                            <input type="password" value={dbPass} onChange={e => setDbPass(e.target.value)}
                                                onKeyDown={e => e.key === 'Enter' && e.preventDefault()}
                                                className="w-full rounded-2xl px-5 py-3.5 outline-none focus:border-indigo-500 transition-all"
                                                style={{ backgroundColor: '#020617', color: '#ffffff', border: '1px solid #334155' }}
                                                placeholder="••••••••" />
                                        </div>
                                    </div>
                                </div>
                                <button type="button"
                                    disabled={isTransitioning}
                                    onClick={() => goToNextStep(2)}
                                    className="w-full bg-white text-slate-950 font-black py-4 rounded-2xl hover:bg-slate-200 transition-all shadow-xl shadow-white/5 flex items-center justify-center gap-2 group disabled:opacity-50">
                                    다음 단계로 <span className="material-symbols-rounded group-hover:translate-x-1 transition-transform">arrow_forward</span>
                                </button>
                            </div>
                        ) : step === 2 ? (
                            <div className="space-y-6 animate-in fade-in slide-in-from-right-8 duration-300">
                                <div>
                                    <h3 className="text-xl font-bold text-white mb-1">인공지능 서비스 (선택)</h3>
                                    <p className="text-sm text-slate-500 mb-6">Gemini API 키를 입력하여 AI 분석 기능을 활성화합니다.</p>

                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-slate-500 ml-1">Gemini API Key</label>
                                        <input
                                            type="text"
                                            value={geminiKey}
                                            onChange={e => setGeminiKey(e.target.value)}
                                            onKeyDown={e => e.key === 'Enter' && e.preventDefault()}
                                            className="w-full rounded-2xl px-5 py-3.5 outline-none focus:border-indigo-500 transition-all"
                                            style={{
                                                backgroundColor: '#020617',
                                                color: '#ffffff',
                                                border: '1px solid #334155'
                                            }}
                                            placeholder="선택사항 (나중에 설정 가능)"
                                        />
                                        {/* Force Autofill Override */}
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
                                </div>
                                <div className="flex gap-4">
                                    <button type="button" onClick={() => goToNextStep(1)} className="flex-1 bg-slate-800 text-white font-bold py-4 rounded-2xl hover:bg-slate-700 transition-all">이전</button>
                                    <button type="button"
                                        disabled={isTransitioning}
                                        onClick={() => goToNextStep(3)}
                                        className="flex-[2] bg-white text-slate-950 font-black py-4 rounded-2xl hover:bg-slate-200 transition-all shadow-xl shadow-white/5 flex items-center justify-center gap-2 group disabled:opacity-50">
                                        보안 설정 단계로 <span className="material-symbols-rounded group-hover:translate-x-1 transition-transform">arrow_forward</span>
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-6 animate-in fade-in slide-in-from-right-8 duration-300">
                                <div>
                                    <h3 className="text-xl font-bold text-white mb-1">시스템 보안 강화</h3>
                                    <p className="text-sm text-slate-500 mb-6">로그인 세션 보호를 위한 강력한 비밀키를 생성합니다.</p>

                                    <div className="space-y-4">
                                        <div className="p-6 bg-[#020617] rounded-3xl border border-slate-700/50">
                                            <label htmlFor="jwt-secret" className="text-xs font-bold text-slate-500 mb-3 block">JWT Authentication Secret</label>
                                            <div className="flex gap-3">
                                                <input
                                                    id="jwt-secret"
                                                    type="text"
                                                    value={jwtSecret}
                                                    onChange={e => setJwtSecret(e.target.value)}
                                                    onKeyDown={e => e.key === 'Enter' && e.preventDefault()}
                                                    className="flex-1 bg-transparent border-none outline-none text-indigo-400 font-mono text-sm"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={generateSecret}
                                                    className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center text-slate-400 hover:text-white transition-all"
                                                    title="새 비밀키 생성"
                                                >
                                                    <span className="material-symbols-rounded text-lg">refresh</span>
                                                </button>
                                            </div>
                                        </div>
                                        <p className="text-[10px] text-slate-400 px-2 leading-relaxed font-medium">
                                            * 이 키는 외부에 유출되어서는 안 됩니다. 시스템을 재설치하거나 배포할 때마다 새로운 무작위 키를 사용하는 것이 보안상 안전합니다.
                                        </p>
                                    </div>
                                </div>
                                <div className="flex gap-4">
                                    <button type="button" onClick={() => goToNextStep(2)} className="flex-1 bg-slate-800 text-white font-bold py-4 rounded-2xl hover:bg-slate-700 transition-all">이전</button>
                                    <button
                                        type="button"
                                        disabled={isLoading || isTransitioning}
                                        onClick={handleSetup}
                                        className="flex-[2] bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-black py-4 rounded-2xl hover:brightness-110 active:scale-[0.98] transition-all shadow-xl shadow-indigo-500/20 flex items-center justify-center gap-2 disabled:opacity-50">
                                        {isLoading ? (
                                            <><span className="material-symbols-rounded animate-spin">sync</span> 구성 중...</>
                                        ) : (
                                            <><span className="material-symbols-rounded">rocket_launch</span> 전체 설정 완료</>
                                        )}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                <div className="mt-12 pt-8 border-t border-slate-800/50 text-center relative z-10">
                    <p className="text-[11px] text-slate-600 font-bold uppercase tracking-widest">© 2024 Mycelium • Enterprise Edition</p>
                </div>
            </div>
        </div >
    );
};

export default SystemSetup;

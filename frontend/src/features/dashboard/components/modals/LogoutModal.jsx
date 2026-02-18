import React from 'react';

const LogoutModal = ({ onClose }) => {
    return (
        <div className="modal-overlay fixed inset-0 z-[10001] flex items-center justify-center bg-[#0f172a]/80 backdrop-blur-md px-4" onClick={onClose}>
            <div className="bg-white w-full max-w-sm rounded-[32px] overflow-hidden shadow-[0_32px_64px_rgba(0,0,0,0.2)] animate-in zoom-in-95 duration-200 border border-slate-200" onClick={e => e.stopPropagation()}>
                <div className="bg-gradient-to-br from-[#1e293b] to-[#0f172a] h-28 flex items-center justify-center relative">
                    <div className="w-16 h-16 rounded-2xl bg-white/5 backdrop-blur-xl flex items-center justify-center border border-white/10 shadow-inner">
                        <span className="material-symbols-rounded text-indigo-400 text-3xl drop-shadow-[0_0_10px_rgba(129,140,248,0.3)]">logout</span>
                    </div>
                </div>
                <div className="p-8 text-center">
                    <h3 className="text-xl font-black text-slate-800 mb-2">세션을 종료할까요?</h3>
                    <p className="text-slate-500 text-[14px] mb-8 font-medium leading-relaxed uppercase tracking-tight">안전하게 로그아웃 후<br />인증 게이트웨이로 리다이렉트합니다.</p>
                    <div className="flex gap-3">
                        <button
                            onClick={onClose}
                            className="flex-1 py-3.5 rounded-2xl bg-slate-50 text-slate-500 font-bold text-sm hover:bg-slate-100 transition-all active:scale-95 border border-slate-100"
                        >
                            돌아가기
                        </button>
                        <button
                            onClick={async () => {
                                try {
                                    await fetch('/api/auth/logout', { method: 'POST' });
                                } catch (e) {
                                    console.error("Logout API failed", e);
                                }
                                sessionStorage.clear();
                                window.location.reload();
                            }}
                            className="flex-1 py-3.5 rounded-2xl bg-[#0f172a] text-white font-bold text-sm hover:bg-slate-800 shadow-xl shadow-slate-200 transition-all active:scale-95"
                        >
                            로그아웃
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default LogoutModal;

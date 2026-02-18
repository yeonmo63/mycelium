import React, { useState, useEffect } from 'react';
import { Download, X, Rocket, ArrowRight } from 'lucide-react';

const UpdateNotifier = () => {
    const [updateInfo, setUpdateInfo] = useState(null);
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        const checkUpdate = async () => {
            try {
                const res = await fetch('/api/system/check-update');
                const data = await res.json();

                if (data.update_available) {
                    setUpdateInfo(data);
                    // Show after a short delay
                    setTimeout(() => setIsVisible(true), 2000);
                }
            } catch (err) {
                console.warn("Update check failed", err);
            }
        };

        checkUpdate();
    }, []);

    if (!updateInfo || !isVisible) return null;

    return (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[9999] w-[90%] max-w-md animate-in slide-in-from-top duration-700">
            <div className="bg-white/80 backdrop-blur-2xl border border-indigo-100 rounded-[2rem] p-6 shadow-2xl shadow-indigo-500/20 relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 blur-[40px] rounded-full -mr-16 -mt-16 group-hover:bg-indigo-500/10 transition-colors"></div>

                <button
                    onClick={() => setIsVisible(false)}
                    className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-all"
                >
                    <X size={16} />
                </button>

                <div className="flex items-start gap-4">
                    <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center shrink-0 shadow-lg shadow-indigo-200">
                        <Rocket size={24} className="text-white" />
                    </div>

                    <div className="flex-1 pr-6 text-left">
                        <div className="flex items-center gap-2 mb-1">
                            <h3 className="text-lg font-black text-slate-800 tracking-tight">새로운 업데이트</h3>
                            <span className="px-2 py-0.5 bg-indigo-50 text-indigo-600 text-[10px] font-black rounded-full border border-indigo-100">
                                v{updateInfo.latest_version}
                            </span>
                        </div>
                        <p className="text-slate-500 text-xs font-bold leading-relaxed mb-4">
                            더 강력해진 AI 모델과 안정화된 기능이 포함된 새 버전이 배포되었습니다.
                        </p>

                        <div className="flex items-center gap-3">
                            <a
                                href={updateInfo.release_url}
                                target="_blank"
                                rel="noreferrer"
                                className="flex-1 h-10 bg-indigo-600 hover:bg-slate-800 text-white rounded-xl text-[11px] font-black flex items-center justify-center gap-2 shadow-lg shadow-indigo-100 transition-all hover:scale-[1.02] active:scale-[0.98]"
                            >
                                <Download size={14} /> 최신 버전 다운로드
                            </a>
                            <button
                                onClick={() => setIsVisible(false)}
                                className="flex-1 h-10 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-xl text-[11px] font-black flex items-center justify-center gap-2 transition-all"
                            >
                                나중에 하기 <ArrowRight size={14} />
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default UpdateNotifier;

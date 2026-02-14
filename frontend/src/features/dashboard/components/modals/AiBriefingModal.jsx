import React from 'react';
import dayjs from 'dayjs';
import { handlePrint } from '../../../../utils/printUtils';

const AiBriefingModal = ({ content, isLoading, onClose }) => {
    if (!content) return null;

    return (
        <div className="modal-overlay fixed inset-0 z-[10000] flex items-center justify-center bg-slate-900/60 backdrop-blur-md px-4" onClick={onClose}>
            <div className="bg-white w-full max-w-xl rounded-[32px] overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300 border border-slate-200" onClick={e => e.stopPropagation()}>
                <div className="bg-gradient-to-br from-amber-400 via-amber-500 to-orange-500 p-8 flex items-center justify-between text-white">
                    <div className="flex items-center gap-4">
                        <div className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center border border-white/30 shadow-inner">
                            <span className="material-symbols-rounded text-3xl">wb_sunny</span>
                        </div>
                        <div>
                            <div className="text-[10px] font-black uppercase tracking-[0.2em] opacity-80 mb-0.5">일일 브리핑</div>
                            <h2 className="text-2xl font-black tracking-tight">마이셀리움 일일 브리핑</h2>
                        </div>
                    </div>
                    <button onClick={onClose} className="w-10 h-10 rounded-full bg-black/10 hover:bg-black/20 flex items-center justify-center transition-colors">
                        <span className="material-symbols-rounded">close</span>
                    </button>
                </div>

                <div className="p-10 pt-8">
                    <div className="bg-slate-50/80 rounded-[28px] p-8 leading-relaxed whitespace-pre-wrap font-bold text-slate-700 text-[15px] border border-slate-100 shadow-inner relative min-h-[250px]">
                        {isLoading ? (
                            <div className="absolute inset-0 flex flex-col items-center justify-center z-10">
                                <div className="w-12 h-12 border-4 border-amber-200 border-t-amber-500 rounded-full animate-spin mb-4"></div>
                                <div className="text-slate-400 font-black animate-pulse">데이터 요약 중...</div>
                            </div>
                        ) : (
                            content.split('===').map((section, idx) => (
                                <div key={idx}>
                                    {section.includes('===') ? '===' + section : section}
                                </div>
                            ))
                        )}
                    </div>

                    <div className="mt-8 flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <button onClick={() => handlePrint('마이셀리움 일일 브리핑', content)} className="flex items-center gap-1.5 text-[11px] font-black text-slate-400 hover:text-indigo-600 transition-colors">
                                <span className="material-symbols-rounded text-base">print</span> 리포트 인쇄
                            </button>
                            <div className="w-px h-3 bg-slate-200"></div>
                            <div className="flex items-center gap-1.5 text-[11px] font-black text-slate-400">
                                <span className="material-symbols-rounded text-sm">history_edu</span>
                                DATE: {dayjs().format('YYYY-MM-DD')}
                            </div>
                        </div>
                        <button onClick={onClose} className="bg-slate-900 text-white px-8 py-3.5 rounded-2xl font-black text-sm hover:bg-slate-800 transition-all shadow-lg shadow-slate-200 active:scale-95">
                            확인
                        </button>
                    </div>

                    <div className="mt-8 pt-6 border-t border-slate-100 text-center">
                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-50 border border-slate-100 text-[10px] font-bold text-slate-400">
                            <span className="material-symbols-rounded text-xs">info</span>
                            이 분석은 어제 실적 및 오늘 예약 현황을 기반으로 합니다.
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AiBriefingModal;

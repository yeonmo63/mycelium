import React from 'react';
import { handlePrint } from '../../../../utils/printUtils';

const BusinessReportModal = ({ report, isLoading, onClose }) => {
    if (!report) return null;

    return (
        <div className="modal-overlay fixed inset-0 z-[10002] flex items-center justify-center bg-slate-900/60 backdrop-blur-md px-4" onClick={onClose}>
            <div className="bg-white w-full max-w-2xl rounded-[32px] overflow-hidden shadow-[0_32px_64px_rgba(0,0,0,0.2)] animate-in zoom-in-95 duration-300 border border-white/20" onClick={e => e.stopPropagation()}>
                <div className={`p-8 flex items-center justify-between text-white ${report.type === 'weekly' ? 'bg-gradient-to-br from-indigo-600 to-indigo-800' : 'bg-gradient-to-br from-emerald-600 to-emerald-800'}`}>
                    <div className="flex items-center gap-5">
                        <div className="w-16 h-16 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center shadow-inner">
                            <span className="material-symbols-rounded text-4xl">
                                {report.type === 'weekly' ? 'query_stats' : 'leaderboard'}
                            </span>
                        </div>
                        <div>
                            <div className="text-[11px] font-black uppercase tracking-[0.2em] opacity-70 mb-1">경영 보고서</div>
                            <h2 className="text-3xl font-black tracking-tight">{report.type === 'weekly' ? '주간 성과 요약' : '월간 경영 보고서'}</h2>
                        </div>
                    </div>
                    <button onClick={onClose} className="w-10 h-10 rounded-full bg-black/10 hover:bg-black/20 flex items-center justify-center transition-colors">
                        <span className="material-symbols-rounded">close</span>
                    </button>
                </div>

                <div className="p-10">
                    <div className="bg-slate-50/80 rounded-[24px] p-8 min-h-[400px] max-h-[550px] overflow-auto stylish-scrollbar border border-slate-100 shadow-inner relative">
                        {isLoading ? (
                            <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-50/80 backdrop-blur-sm z-10">
                                <div className="w-16 h-16 border-4 border-indigo-500/20 border-t-indigo-600 rounded-full animate-spin mb-6"></div>
                                <div className="text-xl font-black text-slate-800 animate-pulse">Mycelium AI 분석 중...</div>
                                <p className="text-slate-500 text-sm mt-2 font-bold">실제 경영 데이터를 집계하여 전략 리포트를 생성하고 있습니다.</p>
                            </div>
                        ) : report.content.includes('<') ? (
                            <div dangerouslySetInnerHTML={{ __html: report.content }} className="prose prose-slate max-w-none prose-headings:font-black prose-p:text-slate-600 prose-strong:text-indigo-600 prose-h3:text-indigo-700" />
                        ) : (
                            <div className="whitespace-pre-wrap leading-relaxed text-slate-700 font-medium">{report.content}</div>
                        )}
                    </div>

                    {!isLoading && report.rawData && (
                        <div className="mt-6 p-4 bg-slate-900 rounded-2xl flex items-center gap-6 overflow-hidden">
                            <div className="text-[10px] font-black text-indigo-400 uppercase tracking-widest ring-1 ring-indigo-400/30 px-2 py-1 rounded shrink-0">참고 데이터</div>
                            <div className="flex gap-6 overflow-x-auto stylish-scrollbar-horizontal pb-1">
                                <div className="shrink-0"><span className="text-[10px] text-slate-500 font-bold block mb-0.5 uppercase">매출</span><span className="text-xs font-black text-white">{report.rawData.total_sales.toLocaleString()}원</span></div>
                                <div className="shrink-0"><span className="text-[10px] text-slate-500 font-bold block mb-0.5 uppercase">주문</span><span className="text-xs font-black text-white">{report.rawData.total_orders}건</span></div>
                                <div className="shrink-0"><span className="text-[10px] text-slate-500 font-bold block mb-0.5 uppercase">신규 고객</span><span className="text-xs font-black text-white">{report.rawData.new_customers}명</span></div>
                                {report.rawData.top_products.length > 0 && (
                                    <div className="shrink-0"><span className="text-[10px] text-slate-500 font-bold block mb-0.5 uppercase">베스트 상품</span><span className="text-xs font-black text-white">{report.rawData.top_products[0].product_name}</span></div>
                                )}
                            </div>
                        </div>
                    )}

                    <div className="mt-6 flex items-center justify-between">
                        <div className="flex items-center gap-2 text-[11px] font-black text-slate-400">
                            <span className="material-symbols-rounded text-sm">verified_user</span>
                            MYCELIUM 시스템 자동 생성
                        </div>
                        <div className="flex items-center gap-4">
                            <button onClick={() => handlePrint((report.type === 'weekly' ? '주간 성과 요약' : '월간 경영 보고서'), report.content)} className="flex items-center gap-2 text-[11px] font-black text-indigo-600 hover:text-indigo-700">
                                <span className="material-symbols-rounded text-sm">print</span> 리포트 인쇄
                            </button>
                            <button onClick={onClose} className="bg-slate-900 text-white px-8 py-3.5 rounded-2xl font-black text-sm hover:bg-slate-800 active:scale-95 transition-all shadow-lg shadow-slate-200">
                                확인 및 닫기
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default BusinessReportModal;

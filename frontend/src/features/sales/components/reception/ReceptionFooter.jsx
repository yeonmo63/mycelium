import React from 'react';
import { formatCurrency } from '../../../../utils/common';

const ReceptionFooter = ({ summary, handleReset, handlePrintStatement, handleSaveAll, isProcessing, customer, salesRows }) => {
    return (
        <div className="bg-slate-900 p-4 px-8 flex justify-between items-center text-white border-t border-slate-800 rounded-b-[1.5rem]">
            <div className="flex gap-10 items-center">
                <div className="flex gap-3 items-center">
                    <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white/40"><span className="material-symbols-rounded">analytics</span></div>
                    <div className="flex flex-col">
                        <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">전체 합계 요약</span>
                        <div className="flex items-baseline gap-1">
                            <span className="text-xl font-black">{summary.count}건</span>
                            <span className="mx-2 w-1 h-3 bg-white/10 rounded-full"></span>
                            <span className="text-xl font-black">{summary.qty}개</span>
                        </div>
                    </div>
                </div>
                <div className="flex flex-col pl-10 border-l border-white/10 ml-2">
                    <span className="text-[9px] font-black text-indigo-400 uppercase tracking-widest italic mb-0.5">최종 합계</span>
                    <div className="flex items-baseline gap-1">
                        <span className="text-[9px] font-black text-indigo-400/50 uppercase">KRW</span>
                        <span className="text-xl font-black text-indigo-400 leading-none">{formatCurrency(summary.amount)}원</span>
                    </div>
                </div>
            </div>
            <div className="flex gap-3 h-12">
                <button onClick={handleReset} className="px-6 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 font-black transition-all text-xs">초기화</button>
                <button onClick={handlePrintStatement}
                    className={`px-6 rounded-xl border-2 font-black transition-all text-xs flex items-center gap-2 ${(!customer || salesRows.length === 0) ? 'bg-slate-800 border-slate-700 text-slate-500 cursor-not-allowed opacity-50' : 'bg-white border-slate-700 text-slate-700 hover:bg-slate-50'}`}>
                    <span className="material-symbols-rounded text-lg">print</span> 거래명세서 출력
                </button>
                <button onClick={handleSaveAll} disabled={isProcessing || !customer}
                    className={`px-10 rounded-xl font-black shadow-xl flex items-center gap-2 transition-all ${isProcessing ? 'bg-slate-700 text-slate-500' : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/40'}`}>
                    {isProcessing ? (
                        <span className="material-symbols-rounded animate-spin text-lg">refresh</span>
                    ) : (
                        <span className="material-symbols-rounded text-lg">save_as</span>
                    )}
                    <span className="text-sm uppercase tracking-tight">일괄 저장하기</span>
                </button>
            </div>
        </div>
    );
};

export default ReceptionFooter;

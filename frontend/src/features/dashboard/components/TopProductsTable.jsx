import React from 'react';
import { formatCurrency } from '../../../utils/common';

const TopProductsTable = ({
    top3Products,
    topProfitProducts,
    topMode,
    setTopMode,
    isRankLoading
}) => {
    return (
        <div className="bg-white rounded-[20px] p-5 min-[2000px]:p-8 shadow-sm border border-slate-100 flex flex-col h-full min-h-0 relative overflow-hidden">
            <div className="flex justify-between items-center mb-4 shrink-0">
                <h3 className="text-[1.1rem] font-bold text-slate-800 flex items-center gap-2">
                    <span className="material-symbols-rounded text-amber-500 bg-amber-50 p-1.5 rounded-lg">emoji_events</span>
                    월간 히트 상품 순위
                </h3>
                <div className="flex bg-slate-100 p-1 rounded-full">
                    <button onClick={() => setTopMode('qty')} className={`px-4 py-1.5 rounded-full text-[0.75rem] font-bold transition-all ${topMode === 'qty' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}>판매량</button>
                    <button onClick={() => setTopMode('profit')} className={`px-4 py-1.5 rounded-full text-[0.75rem] font-bold transition-all ${topMode === 'profit' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}>순이익</button>
                </div>
            </div>
            <div className="flex-1 overflow-auto stylish-scrollbar relative min-h-0 border-t border-slate-50">
                {isRankLoading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-white/50 z-10">
                        <div className="flex flex-col items-center gap-2">
                            <span className="material-symbols-rounded animate-spin text-3xl text-indigo-500">refresh</span>
                            <span className="text-[11px] font-bold text-slate-400 uppercase">분석 중...</span>
                        </div>
                    </div>
                )}
                <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-white">
                        <tr className="text-slate-400 font-semibold border-b border-slate-100 text-[0.75rem] text-left uppercase tracking-wider">
                            <th className="py-2.5 w-16 text-center">순위</th>
                            <th className="py-2.5 px-2">제품명</th>
                            <th className="py-2.5 text-center">수량</th>
                            <th className="py-2.5 text-right pr-2">판매금액</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50 border-b border-slate-50">
                        {(topMode === 'qty' ? top3Products : topProfitProducts).map((p, idx) => (
                            <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                                <td className="py-1.5 text-center font-bold text-slate-400">
                                    {idx === 0 ? <span className="text-xl">🥇</span> : idx === 1 ? <span className="text-xl">🥈</span> : idx === 2 ? <span className="text-xl">🥉</span> : idx + 1}
                                </td>
                                <td className="py-1.5 px-2 font-black text-slate-700 text-xs">{p.product_name}</td>
                                <td className="py-1.5 text-center">
                                    <span className="bg-slate-100 text-slate-600 px-2.5 py-0.5 rounded-full font-black text-[9px] tracking-tight">{formatCurrency(p.total_quantity)}개</span>
                                </td>
                                <td className="py-1.5 text-right font-black text-slate-800 text-xs">
                                    {formatCurrency(topMode === 'qty' ? p.total_amount : p.net_profit)}원
                                    {topMode === 'profit' && p.margin_rate && <div className="text-[9px] text-emerald-500 font-medium">마진 {p.margin_rate.toFixed(1)}%</div>}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default TopProductsTable;

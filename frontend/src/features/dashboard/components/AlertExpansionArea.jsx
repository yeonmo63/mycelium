import React from 'react';
import dayjs from 'dayjs';

const AlertExpansionArea = ({
    type,
    onClose,
    forecastAlerts,
    freshnessAlerts,
    anniversaries,
    repurchaseCandidates,
    generateAIDraft,
    navigate
}) => {
    if (!type) return null;

    return (
        <div id="alert-expansion-area" className="mb-6 animate-in slide-in-from-top-4 duration-500">
            <div className="bg-white rounded-[32px] border border-slate-200 shadow-2xl overflow-hidden ring-1 ring-black/5">
                <div className={`p-6 flex items-center justify-between text-white ${type === 'inventory' ? 'bg-gradient-to-r from-rose-500 to-rose-600' :
                    type === 'anniversary' ? 'bg-gradient-to-r from-pink-500 to-pink-600' :
                        'bg-gradient-to-r from-indigo-500 to-indigo-600'
                    }`}>
                    <div className="flex items-center gap-3">
                        <span className="material-symbols-rounded text-2xl">
                            {type === 'inventory' ? 'inventory_2' : type === 'anniversary' ? 'cake' : 'notifications_active'}
                        </span>
                        <h3 className="text-xl font-black tracking-tight">
                            {type === 'inventory' ? '재고 소모 상세' : type === 'anniversary' ? '기념일 고객 케어' : '재구매 예정 고객'}
                        </h3>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] font-black uppercase tracking-widest bg-white/20 px-3 py-1 rounded-full border border-white/20">상세 분석</span>
                        <button onClick={onClose} className="w-8 h-8 rounded-full bg-black/10 hover:bg-black/20 flex items-center justify-center transition-colors">
                            <span className="material-symbols-rounded text-lg">close</span>
                        </button>
                    </div>
                </div>

                <div className="p-8 max-h-[600px] overflow-auto stylish-scrollbar">
                    {type === 'inventory' ? (
                        <div className="space-y-8">
                            <div>
                                <h4 className="text-lg font-black text-rose-600 mb-3 flex items-center gap-2">
                                    <span className="material-symbols-rounded">trending_down</span> 재고 소진 임박 (Forecast)
                                </h4>
                                <div className="overflow-x-auto rounded-2xl border border-slate-100">
                                    <table className="w-full text-sm">
                                        <thead className="bg-slate-50 text-slate-500 font-bold">
                                            <tr>
                                                <th className="p-4 text-left">품목명</th>
                                                <th className="p-4 text-center">현재고</th>
                                                <th className="p-4 text-center">평균소모</th>
                                                <th className="p-4 text-center">예상소진</th>
                                                <th className="p-4 text-center">태스크</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {forecastAlerts.map((item, i) => (
                                                <tr key={i} className="hover:bg-slate-50 transition-colors">
                                                    <td className="p-4">
                                                        <div className="font-bold text-slate-800">{item.product_name}</div>
                                                        <div className="text-[10px] text-slate-400 font-black uppercase tracking-tight">{item.item_type === 'material' ? '📦 자재' : '🍄 완제품'}</div>
                                                    </td>
                                                    <td className="p-4 text-center font-bold text-slate-700">{item.stock_quantity.toLocaleString()}개</td>
                                                    <td className="p-4 text-center text-slate-500">{item.daily_avg_consumption.toFixed(1)}개/일</td>
                                                    <td className={`p-4 text-center font-black ${item.days_remaining <= 3 ? 'text-rose-500' : 'text-amber-500'}`}>
                                                        {item.days_remaining >= 900 ? '출고 없음' : `${item.days_remaining}일 남음`}
                                                    </td>
                                                    <td className="p-4 text-center">
                                                        <button onClick={() => navigate(item.item_type === 'material' ? '/finance/purchase' : '/sales/stock')} className="bg-slate-900 text-white px-4 py-2 rounded-xl font-bold text-xs hover:bg-slate-800 transition-all">입고등록</button>
                                                    </td>
                                                </tr>
                                            ))}
                                            {forecastAlerts.length === 0 && <tr><td colSpan="5" className="p-12 text-center text-slate-400 font-bold italic underline border-t border-slate-100">소진 임박 품목이 없습니다.</td></tr>}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                            <div className="pt-4 border-t border-slate-100">
                                <h4 className="text-lg font-black text-amber-600 mb-3 flex items-center gap-2">
                                    <span className="material-symbols-rounded">timer</span> 골든 타임 경과 (Freshness)
                                </h4>
                                <div className="overflow-x-auto rounded-2xl border border-slate-100">
                                    <table className="w-full text-sm">
                                        <thead className="bg-slate-50 text-slate-500 font-bold">
                                            <tr>
                                                <th className="p-4 text-left">품목명</th>
                                                <th className="p-4 text-center">현재고</th>
                                                <th className="p-4 text-center">마지막 입고일</th>
                                                <th className="p-4 text-center">경과일</th>
                                                <th className="p-4 text-center">태스크</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {freshnessAlerts.map((item, i) => (
                                                <tr key={i} className="hover:bg-slate-50 transition-colors">
                                                    <td className="p-4 font-bold text-slate-800">{item.product_name}</td>
                                                    <td className="p-4 text-center font-bold text-slate-700">{item.stock_quantity.toLocaleString()}개</td>
                                                    <td className="p-4 text-center text-slate-500">{item.last_in_date ? item.last_in_date.substring(0, 10) : '-'}</td>
                                                    <td className="p-4 text-center font-black text-rose-500">+{item.diffDays}일</td>
                                                    <td className="p-4 text-center">
                                                        <button onClick={() => navigate('/sales/stock')} className="bg-slate-900 text-white px-4 py-2 rounded-xl font-bold text-xs hover:bg-slate-800 transition-all">재고관리</button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    ) : type === 'anniversary' ? (
                        <div className="overflow-x-auto rounded-2xl border border-slate-100">
                            <table className="w-full text-sm">
                                <thead className="bg-slate-50 text-slate-500 font-bold">
                                    <tr>
                                        <th className="p-4 text-left">고객명</th>
                                        <th className="p-4 text-left">구분</th>
                                        <th className="p-4 text-center">날짜</th>
                                        <th className="p-4 text-center">관리</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {anniversaries.map((c, i) => (
                                        <tr key={i} className="hover:bg-slate-50 transition-colors">
                                            <td className="p-4 font-black text-slate-800">{c.customer_name}</td>
                                            <td className="p-4 text-slate-500 font-bold">{c.anniversary_type}</td>
                                            <td className="p-4 text-center text-slate-500 font-mono">{c.anniversary_date}</td>
                                            <td className="p-4 text-center">
                                                <button onClick={() => navigate('/customer/sms')} className="bg-pink-100 text-pink-600 px-4 py-2 rounded-xl font-bold text-xs hover:bg-pink-200 transition-all border border-pink-200 shadow-sm">문자발송</button>
                                            </td>
                                        </tr>
                                    ))}
                                    {anniversaries.length === 0 && <tr><td colSpan="4" className="p-12 text-center text-slate-400 font-bold italic">예정된 기념일이 없습니다.</td></tr>}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="flex items-center gap-4 p-4 bg-indigo-50 rounded-2xl border border-indigo-100 mb-4">
                                <div className="w-10 h-10 rounded-full bg-indigo-500 flex items-center justify-center text-white shrink-0 shadow-lg">
                                    <span className="material-symbols-rounded">psychology</span>
                                </div>
                                <div>
                                    <p className="text-indigo-800 text-[13px] font-bold leading-relaxed line-clamp-2">고객별 과거 구매 주기를 분석하여 재구매 시점이 임박한 분들입니다. 맞춤형 판촉 문자를 발송해 보세요.</p>
                                    <div className="text-[10px] text-indigo-400 font-bold mt-1 flex items-center gap-1">
                                        <span className="material-symbols-rounded text-[12px]">verified</span>
                                        최근 2년간의 주문 데이터 및 SKU별 소모 주기를 기준으로 분석됨
                                    </div>
                                </div>
                            </div>
                            <div className="overflow-x-auto rounded-2xl border border-slate-100">
                                <table className="w-full text-sm">
                                    <thead className="bg-slate-50 text-slate-500 font-bold">
                                        <tr>
                                            <th className="p-4 text-left">고객명</th>
                                            <th className="p-4 text-left">연락처</th>
                                            <th className="p-4 text-center">마지막 주문</th>
                                            <th className="p-4 text-center">구매주기</th>
                                            <th className="p-4 text-center">예측상태</th>
                                            <th className="p-4 text-center">관리</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {repurchaseCandidates.map((c, i) => {
                                            const remaining = parseInt(c.predicted_days_remaining);
                                            const status = remaining === 0 ? "오늘" : (remaining > 0 ? `${remaining}일 남음` : `${Math.abs(remaining)}일 경과`);
                                            const color = remaining === 0 ? 'text-rose-500' : (remaining > 0 ? 'text-emerald-500' : 'text-amber-500');
                                            return (
                                                <tr key={i} className="hover:bg-slate-50 transition-colors">
                                                    <td className="p-4 font-black text-slate-800">{c.customer_name}</td>
                                                    <td className="p-4 text-slate-500 font-mono text-xs">{c.mobile_number}</td>
                                                    <td className="p-4 text-center text-slate-500">{c.last_order_date}</td>
                                                    <td className="p-4 text-center font-black text-slate-700">{c.avg_interval_days}일</td>
                                                    <td className={`p-4 text-center font-black ${color}`}>{status}</td>
                                                    <td className="p-4 text-center">
                                                        <button onClick={() => generateAIDraft(c)} className="bg-indigo-600 text-white px-4 py-2 rounded-xl font-bold text-xs hover:bg-indigo-500 transition-all shadow-lg shadow-indigo-100 italic flex items-center gap-1.5 mx-auto">
                                                            <span className="material-symbols-rounded text-sm">auto_fix_high</span> 추천 문구
                                                        </button>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                        {repurchaseCandidates.length === 0 && <tr><td colSpan="6" className="p-12 text-center text-slate-400 font-bold italic">재구매 대상 고객이 없습니다.</td></tr>}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>

                <div className="px-8 py-5 bg-slate-50 border-t border-slate-100 flex justify-between items-center text-[11px] font-black text-slate-400 uppercase tracking-widest">
                    <div className="flex items-center gap-4">
                        <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> 실시간 분석</span>
                        <span className="w-px h-3 bg-slate-200"></span>
                        <span className="flex items-center gap-1.5"><span className="material-symbols-rounded text-xs">history</span> 갱신됨 {dayjs().format('HH:mm')}</span>
                    </div>
                    <button onClick={onClose} className="text-indigo-600 hover:text-indigo-700 flex items-center gap-1">분석 닫기 <span className="material-symbols-rounded text-xs">expand_less</span></button>
                </div>
            </div>
        </div>
    );
};

export default AlertExpansionArea;

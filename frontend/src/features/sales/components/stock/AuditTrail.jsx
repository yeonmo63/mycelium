import React, { useMemo } from 'react';
import { formatCurrency } from '../../../../utils/common';

const AuditTrail = ({ logs, hideAutoLogs, setHideAutoLogs, logSearchQuery, setLogSearchQuery, loadData }) => {
    const groupedLogs = useMemo(() => {
        const groups = {};
        logs.forEach(log => {
            const isoStr = (typeof log.created_at === 'string' && !log.created_at.includes('Z') && !log.created_at.includes('+'))
                ? `${log.created_at.replace(' ', 'T')}Z`
                : log.created_at;
            const d = new Date(isoStr);
            if (isNaN(d.getTime())) {
                const parts = log.created_at.split(' ');
                const fallbackDate = parts[0];
                if (!groups[fallbackDate]) groups[fallbackDate] = [];
                groups[fallbackDate].push({ ...log, _localTime: parts[1]?.substring(0, 5) || '' });
                return;
            }
            const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
            if (!groups[date]) groups[date] = [];
            groups[date].push({ ...log, _localDate: date, _localTime: time });
        });
        return groups;
    }, [logs]);

    const stats = useMemo(() => {
        const plus = logs.filter(l => l.change_quantity > 0).reduce((a, b) => a + b.change_quantity, 0);
        const minus = logs.filter(l => l.change_quantity < 0).reduce((a, b) => a + b.change_quantity, 0);
        return { plus, minus };
    }, [logs]);

    return (
        <div className="w-[420px] flex flex-col bg-white rounded-[1.5rem] shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-5 border-b border-slate-100 bg-slate-50/80">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="font-black text-slate-800 text-sm flex items-center gap-2">
                        <span className="w-8 h-8 rounded-lg bg-amber-100 text-amber-600 flex items-center justify-center">
                            <span className="material-symbols-rounded text-xl">history</span>
                        </span>
                        재고 감사 로그 (Audit Trail)
                    </h3>
                    <button onClick={loadData} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-200 text-slate-400 hover:text-indigo-600 transition-all">
                        <span className="material-symbols-rounded text-lg">refresh</span>
                    </button>
                </div>
                <div className="space-y-3">
                    <div className="relative group">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 material-symbols-rounded text-lg group-focus-within:text-orange-500 transition-colors">search</span>
                        <input value={logSearchQuery} onChange={e => setLogSearchQuery(e.target.value)} className="pl-10 pr-4 h-9 w-full bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-4 focus:ring-orange-100 focus:border-orange-300 transition-all placeholder:text-slate-400" placeholder="로그 내역 검색..." />
                    </div>
                    <div className="flex justify-between items-center">
                        <label className="flex items-center gap-2 cursor-pointer group">
                            <div className={`w-8 h-4 rounded-full relative transition-colors ${hideAutoLogs ? 'bg-indigo-600' : 'bg-slate-300'}`}>
                                <input type="checkbox" className="hidden" checked={hideAutoLogs} onChange={e => setHideAutoLogs(e.target.checked)} />
                                <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${hideAutoLogs ? 'left-[18px]' : 'left-0.5'}`} />
                            </div>
                            <span className="text-[10px] font-black text-slate-500 group-hover:text-indigo-600 tracking-tighter uppercase transition-colors">시스템 자동로그 숨김</span>
                        </label>
                        <div className="flex gap-2">
                            <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-600 text-[10px] font-black">+{formatCurrency(stats.plus)}</span>
                            <span className="px-2 py-0.5 rounded bg-rose-50 text-rose-600 text-[10px] font-black">{formatCurrency(stats.minus)}</span>
                        </div>
                    </div>
                </div>
            </div>
            <div className="flex-1 overflow-auto stylish-scrollbar scroll-smooth bg-slate-50/30">
                {logs.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-3 p-10">
                        <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center"><span className="material-symbols-rounded text-4xl text-slate-300">history_toggle_off</span></div>
                        <div className="text-center"><div className="text-xs font-black text-slate-500 mb-1">매칭되는 로그가 없습니다</div></div>
                    </div>
                ) : (
                    <div className="p-4 space-y-6">
                        {Object.entries(groupedLogs).sort((a, b) => b[0].localeCompare(a[0])).map(([date, items]) => (
                            <div key={date} className="relative">
                                <div className="sticky top-0 z-10 py-2 mb-3">
                                    <div className="bg-white/80 backdrop-blur inline-flex items-center gap-2 px-3 py-1 rounded-full border border-slate-200 shadow-sm">
                                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span><span className="text-[10px] font-black text-slate-700">{date}</span><span className="text-[10px] text-slate-400 font-bold ml-1">{items.length}건</span>
                                    </div>
                                </div>
                                <div className="space-y-3 ml-2 border-l-2 border-slate-100 pl-4">
                                    {items.map((log, idx) => {
                                        const isPlus = log.change_quantity > 0;
                                        let typeColor = "bg-slate-100 text-slate-500 border-slate-200";
                                        if (log.change_type === '입고') typeColor = "bg-blue-50 text-blue-600 border-blue-100";
                                        else if (log.change_type === '출고') typeColor = "bg-rose-50 text-rose-600 border-rose-100";
                                        else if (log.change_type === '수확' || log.change_type === '생산입고') typeColor = "bg-emerald-50 text-emerald-600 border-emerald-100";
                                        else if (log.change_type === '취소반품') typeColor = "bg-green-50 text-green-600 border-green-100";
                                        else if (log.change_type === '상품생산') typeColor = "bg-purple-50 text-purple-600 border-purple-100";
                                        else if (log.change_type === '조정') typeColor = "bg-amber-50 text-amber-600 border-amber-100";
                                        return (
                                            <div key={idx} className="group relative bg-white p-3 rounded-xl border border-slate-100 shadow-sm hover:shadow-md hover:border-indigo-200 transition-all">
                                                <div className="flex justify-between items-start gap-4">
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2 mb-1">
                                                            <div className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase border shrink-0 ${typeColor}`}>{log.change_type}</div>
                                                            <span className="text-[11px] font-black text-slate-800 truncate leading-tight">{log.product_name}</span>
                                                        </div>
                                                        <div className="flex items-center gap-2 text-[10px] text-slate-400 font-mono mb-2"><span>{log._localTime}</span><span className="w-px h-2 bg-slate-200"></span><span className="font-bold text-slate-500">잔액: {formatCurrency(log.current_stock)}</span></div>
                                                    </div>
                                                    <div className={`text-sm font-black text-right shrink-0 ${isPlus ? 'text-blue-600' : 'text-rose-500'}`}>{isPlus ? '+' : ''}{formatCurrency(log.change_quantity)}</div>
                                                </div>
                                                {log.memo && (
                                                    <div className="relative mt-1 pl-3 py-1.5 border-l-2 border-indigo-100 bg-indigo-50/30 rounded-r-md">
                                                        <span className="material-symbols-rounded text-[12px] absolute left-[-7px] top-1/2 -translate-y-1/2 bg-white text-indigo-400 rounded-full h-4 w-4 flex items-center justify-center border border-indigo-100">chat_bubble</span>
                                                        <p className="text-[10px] text-slate-600 font-medium leading-relaxed italic">{log.memo}</p>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default AuditTrail;

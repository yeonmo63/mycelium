import React, { useState, useEffect } from 'react';
import { useModal } from '../../contexts/ModalContext';

const CustomerSpecialCare = () => {
    const { showAlert, showConfirm } = useModal();
    const [customers, setCustomers] = useState([]);
    const [stats, setStats] = useState({ total: 0, avgRatio: 0, mainReason: '-' });
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        if (!window.__TAURI__) return;
        setIsLoading(true);
        try {
            const data = await window.__TAURI__.core.invoke('get_special_care_customers');
            const sorted = (data || []).sort((a, b) => b.claim_ratio - a.claim_ratio); // Sort by risk
            setCustomers(sorted);
            calculateStats(sorted);
        } catch (e) {
            console.error(e);
            showAlert("오류", "데이터 조회 실패: " + e);
        } finally {
            setIsLoading(false);
        }
    };

    const calculateStats = (data) => {
        if (!data || data.length === 0) {
            setStats({ total: 0, avgRatio: 0, mainReason: '-' });
            return;
        }

        let totalRatios = 0;
        const reasons = {};

        data.forEach(item => {
            totalRatios += item.claim_ratio;
            if (item.major_reason) {
                reasons[item.major_reason] = (reasons[item.major_reason] || 0) + 1;
            }
        });

        let mainReason = '-';
        let maxCount = 0;
        for (const r in reasons) {
            if (reasons[r] > maxCount) {
                maxCount = reasons[r];
                mainReason = r;
            }
        }

        setStats({
            total: data.length,
            avgRatio: data.length > 0 ? (totalRatios / data.length).toFixed(1) : 0,
            mainReason
        });
    };

    const handleMemo = (item) => {
        if (!item.is_member) {
            showAlert("알림", "비회원 고객은 통합 메모 기능을 지원하지 않습니다.\n상담 관리(CRM)에서 해당 연락처로 상세 상담을 등록해주세요.");
        } else {
            showAlert("알림", "회원 상세 정보 페이지에서 고객 대응 메모를 작성하실 수 있습니다.\n[고객 수정/말소] 메뉴에서 해당 고객을 검색하세요.");
        }
    };

    return (
        <div className="sales-v3-container fade-in flex flex-col h-full bg-slate-50">
            {/* Header Area */}
            <div className="flex-none px-6 lg:px-8 min-[2000px]:px-12 pt-6 lg:pt-8 min-[2000px]:pt-12 pb-1">
                <div className="flex justify-between items-end mb-4">
                    <div>
                        <div className="flex items-center gap-2 mb-0.5">
                            <span className="w-6 h-1 bg-indigo-600 rounded-full"></span>
                            <span className="text-[9px] font-black tracking-[0.2em] text-indigo-600 uppercase">Targeted Care & Churn Risk Management</span>
                        </div>
                        <h1 className="text-3xl font-black text-slate-600 tracking-tighter" style={{ fontFamily: '"Noto Sans KR", sans-serif' }}>집중 관리 고객 분석 <span className="text-slate-300 font-light ml-1 text-xl">Special Care</span></h1>
                    </div>
                    <button onClick={loadData} className="w-10 h-10 rounded-full bg-white border border-slate-200 shadow-sm flex items-center justify-center hover:bg-slate-50 transition-colors">
                        <span className={`material-symbols-rounded text-slate-400 ${isLoading ? 'animate-spin' : ''}`}>refresh</span>
                    </button>
                </div>
            </div>

            {/* Dashboard Stats */}
            <div className="flex-none px-6 lg:px-8 min-[2000px]:px-12 grid grid-cols-3 gap-6 mb-6">
                <div className="bg-white p-5 rounded-[1.5rem] shadow-lg border border-slate-200/60 flex items-center gap-5 relative overflow-hidden group">
                    <div className="absolute right-0 top-0 bottom-0 w-24 bg-gradient-to-l from-rose-50 to-transparent opacity-50"></div>
                    <div className="w-14 h-14 rounded-2xl bg-rose-50 flex items-center justify-center flex-shrink-0 shadow-inner group-hover:scale-110 transition-transform">
                        <span className="material-symbols-rounded text-rose-500 text-3xl">priority_high</span>
                    </div>
                    <div>
                        <div className="text-[10px] font-black text-slate-400 uppercase tracking-wide">관리 대상 고객</div>
                        <div className="text-3xl font-black text-slate-800 tracking-tight">{stats.total.toLocaleString()}<span className="text-base font-bold text-slate-400 ml-1">명</span></div>
                    </div>
                </div>
                <div className="bg-white p-5 rounded-[1.5rem] shadow-lg border border-slate-200/60 flex items-center gap-5 relative overflow-hidden group">
                    <div className="absolute right-0 top-0 bottom-0 w-24 bg-gradient-to-l from-orange-50 to-transparent opacity-50"></div>
                    <div className="w-14 h-14 rounded-2xl bg-orange-50 flex items-center justify-center flex-shrink-0 shadow-inner group-hover:scale-110 transition-transform">
                        <span className="material-symbols-rounded text-orange-500 text-3xl">percent</span>
                    </div>
                    <div>
                        <div className="text-[10px] font-black text-slate-400 uppercase tracking-wide">평균 클레임 비율</div>
                        <div className="text-3xl font-black text-slate-800 tracking-tight">{stats.avgRatio}<span className="text-base font-bold text-slate-400 ml-1">%</span></div>
                    </div>
                </div>
                <div className="bg-white p-5 rounded-[1.5rem] shadow-lg border border-slate-200/60 flex items-center gap-5 relative overflow-hidden group">
                    <div className="absolute right-0 top-0 bottom-0 w-24 bg-gradient-to-l from-blue-50 to-transparent opacity-50"></div>
                    <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center flex-shrink-0 shadow-inner group-hover:scale-110 transition-transform">
                        <span className="material-symbols-rounded text-blue-500 text-3xl">error_outline</span>
                    </div>
                    <div>
                        <div className="text-[10px] font-black text-slate-400 uppercase tracking-wide">주요 귀책 사유</div>
                        <div className="text-2xl font-black text-slate-800 tracking-tight truncate max-w-[150px]" title={stats.mainReason}>{stats.mainReason}</div>
                    </div>
                </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-hidden flex flex-col px-6 lg:px-8 min-[2000px]:px-12 pb-6">
                <div className="flex-1 overflow-hidden flex flex-col bg-white rounded-[1.5rem] shadow-xl border border-slate-200 relative">
                    <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-rose-500 via-orange-500 to-yellow-500"></div>

                    <div className="flex-1 overflow-auto stylish-scrollbar p-0.5">
                        <table className="w-full text-xs border-separate border-spacing-0">
                            <thead className="sticky top-0 z-20">
                                <tr className="bg-slate-50/80 backdrop-blur-md">
                                    <th className="px-4 py-3 text-left w-40 text-[9px] font-black uppercase text-slate-400 border-b border-slate-100">고객명</th>
                                    <th className="px-4 py-3 text-left w-32 text-[9px] font-black uppercase text-slate-400 border-b border-slate-100">연락처</th>
                                    <th className="px-4 py-3 text-center w-20 text-[9px] font-black uppercase text-slate-400 border-b border-slate-100">구분</th>
                                    <th className="px-4 py-3 text-right text-[9px] font-black uppercase text-slate-400 border-b border-slate-100">총 주문</th>
                                    <th className="px-4 py-3 text-right text-[9px] font-black uppercase text-rose-500 border-b border-slate-100">클레임</th>
                                    <th className="px-4 py-3 text-left w-40 text-[9px] font-black uppercase text-slate-400 border-b border-slate-100">비율 (Ratio)</th>
                                    <th className="px-4 py-3 text-left text-[9px] font-black uppercase text-slate-400 border-b border-slate-100">주요 사유</th>
                                    <th className="px-4 py-3 text-center w-32 text-[9px] font-black uppercase text-slate-400 border-b border-slate-100">최근 발생일</th>
                                    <th className="px-4 py-3 text-center w-20 text-[9px] font-black uppercase text-slate-400 border-b border-slate-100">관리</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {isLoading ? (
                                    <tr><td colSpan="9" className="py-20 text-center"><div className="flex justify-center"><span className="material-symbols-rounded spin text-3xl text-rose-300">sync</span></div></td></tr>
                                ) : customers.length === 0 ? (
                                    <tr><td colSpan="9" className="py-20 text-center text-slate-300 font-bold">
                                        <div className="flex flex-col items-center gap-2">
                                            <span className="material-symbols-rounded text-4xl text-green-200">check_circle</span>
                                            <span>집중 관리 대상 고객이 없습니다.</span>
                                        </div>
                                    </td></tr>
                                ) : (
                                    customers.map((c, idx) => {
                                        // Ratio Color
                                        let ratioColor = 'text-slate-600';
                                        let progressColor = 'bg-slate-300';
                                        if (c.claim_ratio >= 30) { ratioColor = 'text-rose-600'; progressColor = 'bg-rose-500'; }
                                        else if (c.claim_ratio >= 15) { ratioColor = 'text-orange-500'; progressColor = 'bg-orange-400'; }

                                        return (
                                            <tr key={idx} className="hover:bg-rose-50/20 transition-colors group">
                                                <td className="px-4 py-3 font-bold text-slate-700">{c.name}</td>
                                                <td className="px-4 py-3 text-slate-500 font-mono tracking-tight">{c.mobile}</td>
                                                <td className="px-4 py-3 text-center">
                                                    <span className={`px-2 py-1 rounded-lg text-[10px] font-black tracking-tight ${c.is_member ? 'bg-blue-50 text-blue-600 border-blue-100' : 'bg-slate-50 text-slate-500 border-slate-100'}`}>
                                                        {c.is_member ? '회원' : '비회원'}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-right font-mono text-slate-600">{c.total_orders.toLocaleString()}</td>
                                                <td className="px-4 py-3 text-right font-mono font-bold text-rose-600 bg-rose-50/30">{c.claim_count.toLocaleString()}</td>
                                                <td className="px-4 py-3">
                                                    <div className="flex flex-col gap-1">
                                                        <div className="flex justify-between items-center">
                                                            <span className={`font-bold text-[10px] ${ratioColor}`}>{c.claim_ratio.toFixed(1)}%</span>
                                                        </div>
                                                        <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                                            <div className={`h-full ${progressColor}`} style={{ width: `${Math.min(c.claim_ratio, 100)}%` }}></div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 text-slate-600 text-xs truncate max-w-[200px]" title={c.major_reason}>{c.major_reason || '-'}</td>
                                                <td className="px-4 py-3 text-center text-slate-500 text-[10px] font-mono">{c.last_claim_date || '-'}</td>
                                                <td className="px-4 py-3 text-center">
                                                    <button onClick={() => handleMemo(c)} className="w-8 h-8 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 flex items-center justify-center transition-colors">
                                                        <span className="material-symbols-rounded text-lg">edit_note</span>
                                                    </button>
                                                </td>
                                            </tr>
                                        )
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CustomerSpecialCare;

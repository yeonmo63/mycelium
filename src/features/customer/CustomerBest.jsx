import React, { useState, useEffect } from 'react';
import { formatCurrency, copyToClipboard } from '../../utils/common';
import { useModal } from '../../contexts/ModalContext';
import dayjs from 'dayjs';
import { invokeAI } from '../../utils/aiErrorHandler';

const CustomerBest = () => {
    const { showAlert, showConfirm } = useModal();
    // --- State ---
    const [customers, setCustomers] = useState([]);
    const [searchParams, setSearchParams] = useState({
        minQty: 100,
        minAmt: 0,
        logic: 'AND' // 'AND' | 'OR'
    });
    const [isLoading, setIsLoading] = useState(false);

    // Pagination
    const PAGE_SIZE = 20;
    const [page, setPage] = useState(1);

    // Selection
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [batchLevel, setBatchLevel] = useState('');

    // AI Insight
    const [aiModalOpen, setAiModalOpen] = useState(false);
    const [aiData, setAiData] = useState(null);
    const [isAiLoading, setIsAiLoading] = useState(false);

    // --- Init ---
    useEffect(() => {
        handleSearch();
    }, []);

    // --- Search ---
    const handleSearch = async () => {
        if (!window.__TAURI__) return;
        setIsLoading(true);
        setPage(1);
        setSelectedIds(new Set());
        try {
            const res = await window.__TAURI__.core.invoke('search_best_customers', {
                minQty: Number(searchParams.minQty),
                minAmt: Number(searchParams.minAmt),
                logic: searchParams.logic
            });
            setCustomers(res || []);
        } catch (e) {
            console.error(e);
            showAlert("오류", "조회 중 오류가 발생했습니다: " + e);
            setCustomers([]);
        } finally {
            setIsLoading(false);
        }
    };

    // --- Selection ---
    const handleCheck = (id) => {
        const next = new Set(selectedIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelectedIds(next);
    };

    // Calculate paginated data first to help with Select All logic if needed
    const totalPages = Math.ceil(customers.length / PAGE_SIZE) || 1;
    const paginatedData = customers.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

    const handleSelectAll = (e) => {
        if (e.target.checked) {
            // Select displayed items
            const currentIds = paginatedData.map(c => c.customer_id);
            setSelectedIds(new Set([...selectedIds, ...currentIds]));
        } else {
            // Deselect displayed items
            const next = new Set(selectedIds);
            paginatedData.forEach(c => next.delete(c.customer_id));
            setSelectedIds(next);
        }
    };

    // --- Actions ---
    const handleApplyLevel = async () => {
        if (!batchLevel) return showAlert("알림", "변경할 등급을 선택해주세요.");
        if (selectedIds.size === 0) return showAlert("알림", "선택된 고객이 없습니다.");

        if (!await showConfirm("등급 변경", `선택한 ${selectedIds.size}명의 고객 등급을 '${batchLevel}'(으)로 변경하시겠습니까?`)) return;

        try {
            if (window.__TAURI__) {
                await window.__TAURI__.core.invoke('update_customer_membership_batch', {
                    customerIds: Array.from(selectedIds),
                    newLevel: batchLevel
                });
                await showAlert("완료", "등급이 변경되었습니다.");
                handleSearch();
            }
        } catch (e) {
            showAlert("오류", "등급 변경 실패: " + e);
        }
    };

    const handleExportCsv = async () => {
        if (customers.length === 0) return showAlert("알림", "저장할 데이터가 없습니다.");

        let csv = '\uFEFFNo,고객명,연락처,등급,거래건수,총판매량,총판매액,주소\n';
        customers.forEach((c, idx) => {
            const row = [
                idx + 1,
                c.customer_name,
                c.mobile_number,
                c.membership_level === 'Normal' ? '일반' : c.membership_level,
                c.total_orders,
                c.total_qty,
                c.total_amount,
                (c.address_primary || '') + ' ' + (c.address_detail || '')
            ].map(v => `"${v || ''}"`).join(',');
            csv += row + '\n';
        });

        try {
            if (window.__TAURI__) {
                const filePath = await window.__TAURI__.dialog.save({
                    filters: [{
                        name: 'Excel CSV',
                        extensions: ['csv']
                    }],
                    defaultPath: `우수고객목록_${dayjs().format('YYYYMMDD')}.csv`
                });

                if (filePath) {
                    await window.__TAURI__.fs.writeTextFile(filePath, csv);
                    showAlert("성공", "파일이 저장되었습니다.");
                }
            }
        } catch (e) {
            console.error(e);
        }
    };

    const handleAiInsight = async (cid) => {
        if (!window.__TAURI__) return;
        setAiData(null);
        setAiModalOpen(true);
        setIsAiLoading(true);
        try {
            const data = await invokeAI(showAlert, 'get_customer_ai_insight', { customerId: cid });
            setAiData(data);
        } catch (e) {
            console.error(e);
            if (e.message !== 'AI_QUOTA_EXCEEDED') {
                showAlert("오류", "AI 분석 실패: " + e);
            }
            setAiModalOpen(false);
        } finally {
            setIsAiLoading(false);
        }
    };

    const isAllSelected = paginatedData.length > 0 && paginatedData.every(c => selectedIds.has(c.customer_id));

    return (
        <div className="sales-v3-container fade-in flex flex-col h-full bg-slate-50">
            {/* Header Area */}
            <div className="flex-none px-6 lg:px-8 min-[2000px]:px-12 pt-6 lg:pt-8 min-[2000px]:pt-12 pb-1">
                <div className="flex justify-between items-end mb-4">
                    <div>
                        <div className="flex items-center gap-2 mb-0.5">
                            <span className="w-6 h-1 bg-indigo-600 rounded-full"></span>
                            <span className="text-[9px] font-black tracking-[0.2em] text-indigo-600 uppercase">VIP Customer & LTV Analysis</span>
                        </div>
                        <h1 className="text-3xl font-black text-slate-600 tracking-tighter" style={{ fontFamily: '"Noto Sans KR", sans-serif' }}>우수 고객 관리 <span className="text-slate-300 font-light ml-1 text-xl">Best Customers</span></h1>
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 overflow-hidden flex flex-col px-6 lg:px-8 min-[2000px]:px-12 pb-6">

                {/* Control Bar */}
                <div className="bg-white rounded-[1.5rem] p-5 shadow-lg border border-slate-200/60 mb-4 flex flex-wrap items-center justify-between gap-4">
                    {/* Search Params */}
                    <div className="flex items-end gap-4">
                        <div>
                            <label className="text-[10px] font-black text-slate-400 uppercase mb-1 block ml-1">최소 주문량 (개)</label>
                            <input type="number" value={searchParams.minQty} onChange={e => setSearchParams({ ...searchParams, minQty: e.target.value })}
                                className="w-32 h-10 rounded-xl bg-slate-50 border-slate-200 font-bold text-center focus:ring-2 focus:ring-indigo-500" placeholder="0" />
                        </div>

                        <div className="flex h-10 items-center bg-slate-100 rounded-xl p-1">
                            <button onClick={() => setSearchParams({ ...searchParams, logic: 'AND' })}
                                className={`h-full px-4 rounded-lg text-xs font-black transition-all ${searchParams.logic === 'AND' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>AND</button>
                            <button onClick={() => setSearchParams({ ...searchParams, logic: 'OR' })}
                                className={`h-full px-4 rounded-lg text-xs font-black transition-all ${searchParams.logic === 'OR' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>OR</button>
                        </div>

                        <div>
                            <label className="text-[10px] font-black text-slate-400 uppercase mb-1 block ml-1">최소 주문금액 (원)</label>
                            <input type="number" value={searchParams.minAmt} onChange={e => setSearchParams({ ...searchParams, minAmt: e.target.value })}
                                className="w-40 h-10 rounded-xl bg-slate-50 border-slate-200 font-bold text-right focus:ring-2 focus:ring-indigo-500 px-3" placeholder="0" />
                        </div>

                        <button onClick={handleSearch} className="h-10 px-6 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow-lg shadow-indigo-200 transition-all flex items-center gap-2">
                            <span className="material-symbols-rounded">search</span> 조회
                        </button>
                    </div>

                    {/* Batch & Export */}
                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2 bg-slate-50 p-1.5 px-3 rounded-xl border border-slate-200">
                            <span className="text-[10px] font-black text-slate-400 uppercase">일괄 변경</span>
                            <select value={batchLevel} onChange={e => setBatchLevel(e.target.value)} className="h-8 rounded-lg border-none bg-white text-xs font-bold w-28 focus:ring-0">
                                <option value="">--등급--</option>
                                <option value="Normal">일반</option>
                                <option value="VIP">VIP</option>
                                <option value="VVIP">VVIP</option>
                                <option value="Group">법인/단체</option>
                            </select>
                            <button onClick={handleApplyLevel} className="h-8 px-3 rounded-lg bg-slate-800 text-white text-xs font-bold hover:bg-slate-700">적용</button>
                        </div>
                        <div className="w-px h-8 bg-slate-200"></div>
                        <button onClick={handleExportCsv} className="h-10 w-10 rounded-xl bg-green-50 text-green-600 hover:bg-green-100 flex items-center justify-center transition-colors">
                            <span className="material-symbols-rounded">download</span>
                        </button>
                    </div>
                </div>

                {/* Table */}
                <div className="flex-1 overflow-hidden flex flex-col bg-white rounded-[1.5rem] shadow-xl border border-slate-200 relative">
                    <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500"></div>
                    <div className="flex-1 overflow-auto stylish-scrollbar p-0.5">
                        <table className="w-full text-xs border-separate border-spacing-0">
                            <thead className="sticky top-0 z-20">
                                <tr className="bg-slate-50/80 backdrop-blur-md">
                                    <th className="px-4 py-3 w-12 text-center border-b border-slate-100">
                                        <input type="checkbox" checked={isAllSelected} onChange={handleSelectAll} className="rounded text-indigo-600 focus:ring-indigo-500 border-slate-300" />
                                    </th>
                                    <th className="px-4 py-3 text-left text-[9px] font-black uppercase text-slate-400 border-b border-slate-100">고객명</th>
                                    <th className="px-4 py-3 text-center text-[9px] font-black uppercase text-slate-400 border-b border-slate-100">연락처</th>
                                    <th className="px-4 py-3 text-center text-[9px] font-black uppercase text-slate-400 border-b border-slate-100 w-24">등급</th>
                                    <th className="px-4 py-3 text-right text-[9px] font-black uppercase text-slate-500 border-b border-slate-100 bg-blue-50/50">거래건수</th>
                                    <th className="px-4 py-3 text-right text-[9px] font-black uppercase text-slate-500 border-b border-slate-100 bg-green-50/50">총판매량</th>
                                    <th className="px-4 py-3 text-right text-[9px] font-black uppercase text-slate-500 border-b border-slate-100 bg-orange-50/50">총판매액</th>
                                    <th className="px-4 py-3 text-left text-[9px] font-black uppercase text-slate-400 border-b border-slate-100">주소</th>
                                    <th className="px-4 py-3 text-center text-[9px] font-black uppercase text-slate-400 border-b border-slate-100 w-20">AI</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {isLoading ? (
                                    <tr><td colSpan="9" className="py-20 text-center"><div className="flex justify-center"><span className="material-symbols-rounded spin text-3xl text-indigo-300">sync</span></div></td></tr>
                                ) : customers.length === 0 ? (
                                    <tr><td colSpan="9" className="py-20 text-center text-slate-300 font-bold">조건에 맞는 우수 고객이 없습니다.</td></tr>
                                ) : (
                                    paginatedData.map(c => (
                                        <tr key={c.customer_id} className="hover:bg-indigo-50/30 transition-colors group">
                                            <td className="px-4 py-3 text-center">
                                                <input type="checkbox" checked={selectedIds.has(c.customer_id)} onChange={() => handleCheck(c.customer_id)} className="rounded text-indigo-600 focus:ring-indigo-500 border-slate-300" />
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="font-bold text-slate-700 flex items-center gap-2">
                                                    {c.customer_name}
                                                    <button onClick={() => copyToClipboard(c.customer_name)} className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-indigo-500"><span className="material-symbols-rounded text-[14px]">content_copy</span></button>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-center text-slate-500 font-mono tracking-tight">{c.mobile_number}</td>
                                            <td className="px-4 py-3 text-center">
                                                <span className={`px-2 py-1 rounded-lg text-[10px] font-black tracking-tight ${c.membership_level === 'VVIP' ? 'bg-amber-100 text-amber-700' :
                                                    c.membership_level === 'VIP' ? 'bg-purple-100 text-purple-700' :
                                                        c.membership_level === 'Group' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'
                                                    }`}>{c.membership_level === 'Normal' ? '일반' : c.membership_level}</span>
                                            </td>
                                            <td className="px-4 py-3 text-right font-mono font-medium text-slate-600 bg-blue-50/30">{c.total_orders}</td>
                                            <td className="px-4 py-3 text-right font-mono font-bold text-green-600 bg-green-50/30">{formatCurrency(c.total_qty)}</td>
                                            <td className="px-4 py-3 text-right font-mono font-black text-orange-600 bg-orange-50/30">{formatCurrency(c.total_amount)}</td>
                                            <td className="px-4 py-3 text-slate-500 truncate max-w-[300px]" title={`${c.address_primary} ${c.address_detail}`}>
                                                {c.address_primary} {c.address_detail}
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <button onClick={() => handleAiInsight(c.customer_id)} className="w-8 h-8 rounded-full hover:bg-purple-100 text-purple-300 hover:text-purple-600 transition-colors flex items-center justify-center">
                                                    <span className="material-symbols-rounded text-lg">auto_awesome</span>
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Footer / Pagination */}
                    <div className="p-3 border-t border-slate-100 bg-white flex justify-between items-center px-6">
                        <div className="text-xs font-bold text-slate-400">
                            총 <span className="text-slate-800">{customers.length.toLocaleString()}</span>명 조회됨
                        </div>
                        <div className="flex items-center gap-2">
                            <button onClick={() => setPage(page - 1)} disabled={page === 1} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-white transition-colors">
                                <span className="material-symbols-rounded text-slate-500">chevron_left</span>
                            </button>
                            <span className="text-xs font-black text-slate-600 min-w-[60px] text-center">{page} / {totalPages}</span>
                            <button onClick={() => setPage(page + 1)} disabled={page === totalPages} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-white transition-colors">
                                <span className="material-symbols-rounded text-slate-500">chevron_right</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* AI Modal */}
            {aiModalOpen && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setAiModalOpen(false)}></div>
                    <div className="bg-white rounded-3xl w-full max-w-[450px] shadow-2xl relative overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="bg-slate-900 px-6 py-4 flex justify-between items-center">
                            <h3 className="text-white font-bold text-lg flex items-center gap-2">
                                <span className="material-symbols-rounded text-purple-400">auto_awesome</span>
                                AI 고객 통찰
                            </h3>
                            <button onClick={() => setAiModalOpen(false)} className="text-slate-400 hover:text-white"><span className="material-symbols-rounded">close</span></button>
                        </div>

                        <div className="p-6">
                            {isAiLoading ? (
                                <div className="py-12 flex flex-col items-center gap-4">
                                    <div className="w-10 h-10 border-4 border-slate-200 border-t-purple-500 rounded-full animate-spin"></div>
                                    <p className="text-sm font-bold text-slate-500 animate-pulse">AI가 고객 데이터를 분석 중입니다...</p>
                                </div>
                            ) : aiData ? (
                                <div className="space-y-6">
                                    <div>
                                        <div className="text-[10px] font-black text-slate-400 uppercase mb-2">키워드</div>
                                        <div className="flex flex-wrap gap-2">
                                            {aiData.keywords && aiData.keywords.map((k, i) => (
                                                <span key={i} className="px-3 py-1 bg-purple-50 text-purple-700 rounded-lg text-xs font-bold border border-purple-100 shadow-sm">{k}</span>
                                            ))}
                                            {(!aiData.keywords || aiData.keywords.length === 0) && <span className="text-xs text-slate-400">키워드 없음</span>}
                                        </div>
                                    </div>

                                    <div>
                                        <div className="text-[10px] font-black text-slate-400 uppercase mb-2">세일즈 팁 (Sales Tip)</div>
                                        <div className="p-4 bg-green-50 rounded-2xl border border-green-100 text-green-900 text-sm font-medium leading-relaxed shadow-sm">
                                            {aiData.sales_tip || "생성된 팁이 없습니다."}
                                        </div>
                                    </div>

                                    {aiData.ice_breaking && (
                                        <div>
                                            <div className="text-[10px] font-black text-slate-400 uppercase mb-2">아이스 브레이킹</div>
                                            <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100 text-blue-900 text-sm font-medium leading-relaxed shadow-sm">
                                                {aiData.ice_breaking}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="py-10 text-center text-rose-500 font-bold">데이터를 불러오지 못했습니다.</div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CustomerBest;

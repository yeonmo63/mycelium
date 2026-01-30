import React, { useState, useEffect } from 'react';
import { useModal } from '../../contexts/ModalContext';
import { invokeAI } from '../../utils/aiErrorHandler';

const CustomerBatch = () => {
    const { showAlert, showConfirm } = useModal();

    // --- State ---
    const [customerList, setCustomerList] = useState([]);
    const [currentPage, setCurrentPage] = useState(1);
    const ITEMS_PER_PAGE = 20;

    // Search Params
    const [searchParams, setSearchParams] = useState({
        keyword: '',
        level: '',
        dateStart: '',
        dateEnd: '',
        dormantYears: '3',
        isDormantMode: false
    });

    // Checkboxes
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [deleteSalesChecked, setDeleteSalesChecked] = useState(false);

    // AI Insight
    const [aiModalOpen, setAiModalOpen] = useState(false);
    const [aiInsight, setAiInsight] = useState(null);
    const [isLoadingAi, setIsLoadingAi] = useState(false);

    // --- Handlers ---
    useEffect(() => {
        // Initial Search
        handleSearch(true);
    }, []);

    const handleSearch = async (isAll = false) => {
        if (!window.__TAURI__) return;

        let start, end;
        let keyword = '';
        let level = null;

        if (isAll) {
            start = "1900-01-01";
            end = "2999-12-31";
            setSearchParams(prev => ({ ...prev, dateStart: '', dateEnd: '', level: '', keyword: '', isDormantMode: false }));
        } else {
            start = searchParams.dateStart || "1900-01-01";
            end = searchParams.dateEnd || "2999-12-31";
            keyword = searchParams.keyword.trim();
            level = searchParams.level || null;
            if (keyword.length > 0 && /^\d+$/.test(keyword) && keyword.length < 2) {
                await showAlert('알림', '연락처(숫자) 검색 시 최소 2글자 이상 입력해주세요.');
                return;
            }
            setSearchParams(prev => ({ ...prev, isDormantMode: false }));
        }

        try {
            const results = await window.__TAURI__.core.invoke('search_customers_by_date', {
                start, end, keyword: keyword || null, membershipLevel: level
            });
            setCustomerList(results || []);
            setCurrentPage(1);
            setSelectedIds(new Set());
        } catch (e) {
            console.error(e);
            showAlert('오류', '조회 중 오류가 발생했습니다: ' + e);
        }
    };

    const handleDormantSearch = async () => {
        if (!window.__TAURI__) return;

        // Reset non-dormant params visually
        setSearchParams(prev => ({ ...prev, keyword: '', level: '', dateStart: '', dateEnd: '', isDormantMode: true }));

        const years = parseFloat(searchParams.dormantYears) || 3;
        const days = Math.round(years * 365);

        try {
            const results = await window.__TAURI__.core.invoke('search_dormant_customers', { daysThreshold: days });
            setCustomerList(results || []);
            setCurrentPage(1);
            setSelectedIds(new Set());
        } catch (e) {
            console.error(e);
            showAlert('오류', '휴먼 고객 조회 실패: ' + e);
        }
    };

    const handleDelete = async () => {
        if (selectedIds.size === 0) {
            await showAlert('알림', '삭제할 고객을 선택해주세요.');
            return;
        }

        let msg = `선택한 ${selectedIds.size}명의 고객 정보를 영구 삭제하시겠습니까?`;
        if (deleteSalesChecked) {
            msg += `\n\n⚠️ 주의: 해당 고객들의 모든 판매 내역(매출 데이터)도 함께 삭제됩니다!`;
        }
        msg += `\n이 작업은 되돌릴 수 없습니다.`;

        if (!await showConfirm('삭제 확인', msg)) return;

        try {
            await window.__TAURI__.core.invoke('delete_customers_batch', {
                ids: Array.from(selectedIds),
                alsoDeleteSales: deleteSalesChecked
            });
            await showAlert('성공', `${selectedIds.size}명의 고객 정보가 삭제되었습니다.`);

            // Refresh
            if (searchParams.isDormantMode) {
                handleDormantSearch();
            } else {
                handleSearch(false); // Re-run last search params logic effectively?
                // Actually handleSearch(false) uses current state, which is good.
                // But we need to handle the case where we just looked at dormant.
                // searchParams.isDormantMode tracks this.
            }
        } catch (e) {
            showAlert('오류', '삭제 실패: ' + e);
        }
    };

    const handleExportCSV = async () => {
        if (customerList.length === 0) {
            await showAlert('알림', '저장할 데이터가 없습니다.');
            return;
        }

        const headers = ['No', '고객명', '연락처', '등급', '등록일', '우편번호', '주소', '상세주소', '메모'];
        const rows = customerList.map((c, i) => [
            i + 1,
            c.customer_name,
            c.mobile_number,
            c.membership_level || '',
            c.join_date || '',
            c.zip_code || '',
            c.address_primary || '',
            c.address_detail || '',
            c.memo || ''
        ]);

        let csvContent = "\uFEFF";
        csvContent += headers.join(",") + "\n";
        rows.forEach(row => {
            csvContent += row.map(e => `"${String(e).replace(/"/g, '""')}"`).join(",") + "\n";
        });

        try {
            const filePath = await window.__TAURI__.dialog.save({
                defaultPath: `고객일괄조회_${new Date().toISOString().slice(0, 10)}.csv`,
                filters: [{ name: 'CSV Files', extensions: ['csv'] }]
            });

            if (filePath) {
                await window.__TAURI__.fs.writeTextFile(filePath, csvContent);
                showAlert('성공', '파일이 성공적으로 저장되었습니다.');
            }
        } catch (e) {
            showAlert('오류', '파일 저장 실패: ' + e);
        }
    };

    const handleAiInsight = async (customerId) => {
        if (!customerId || !window.__TAURI__) return;
        setIsLoadingAi(true);
        setAiModalOpen(true);
        setAiInsight(null);

        try {
            const insight = await invokeAI(showAlert, 'get_customer_ai_insight', { customerId });
            setAiInsight(insight);
        } catch (e) {
            console.error(e);
            // invokeAI handles the quota error alert, but we might want to show a message in the modal too
            setAiInsight({ error: String(e) });
        } finally {
            setIsLoadingAi(false);
        }
    };

    // --- Pagination Logic ---
    const totalPages = Math.ceil(customerList.length / ITEMS_PER_PAGE) || 1;
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const currentItems = customerList.slice(startIndex, startIndex + ITEMS_PER_PAGE);

    const toggleSelectAll = (checked) => {
        if (checked) {
            const newSet = new Set(currentItems.map(c => c.customer_id));
            setSelectedIds(prev => new Set([...prev, ...newSet]));
            // Note: This logic only selects current page items. If "Select All" means ALL pages, logic differs.
            // MushroomFarm batch.js implies selecting currently rendered rows usually, but let's stick to current page for simplicity or full list?
            // "batch.js" logic: document.querySelectorAll('.batch-row-checkbox').forEach... -> implies visible rows only.
            // So we select current page items.
        } else {
            const currentIds = new Set(currentItems.map(c => c.customer_id));
            setSelectedIds(prev => {
                const newSet = new Set(prev);
                currentIds.forEach(id => newSet.delete(id));
                return newSet;
            });
        }
    };

    const toggleSelectOne = (id, checked) => {
        setSelectedIds(prev => {
            const newSet = new Set(prev);
            if (checked) newSet.add(id);
            else newSet.delete(id);
            return newSet;
        });
    };

    const isAllSelected = currentItems.length > 0 && currentItems.every(c => selectedIds.has(c.customer_id));

    return (
        <div className="flex flex-col h-full bg-[#f8fafc] overflow-hidden animate-in fade-in duration-700">
            {/* Header Area */}
            <div className="px-6 lg:px-8 min-[2000px]:px-12 pt-6 lg:pt-8 min-[2000px]:pt-12 pb-1">
                <div className="flex justify-between items-end mb-4">
                    <div>
                        <div className="flex items-center gap-2 mb-0.5">
                            <span className="w-6 h-1 bg-indigo-600 rounded-full"></span>
                            <span className="text-[9px] font-black tracking-[0.2em] text-indigo-600 uppercase">Customer Management System</span>
                        </div>
                        <h1 className="text-3xl font-black text-slate-600 tracking-tighter" style={{ fontFamily: '"Noto Sans KR", sans-serif' }}>
                            고객 일괄 조회 <span className="text-slate-300 font-light ml-1 text-xl">Batch View</span>
                        </h1>
                    </div>
                </div>

                {/* Search / Filter Bar */}
                <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm mb-4">
                    <div className="flex flex-wrap items-center gap-3">
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-black text-slate-500 uppercase">가입일</span>
                            <input type="date" value={searchParams.dateStart} onChange={e => setSearchParams({ ...searchParams, dateStart: e.target.value })} className="h-9 px-3 rounded-lg bg-slate-50 border border-slate-200 text-sm font-bold text-slate-700" />
                            <span className="text-slate-400">~</span>
                            <input type="date" value={searchParams.dateEnd} onChange={e => setSearchParams({ ...searchParams, dateEnd: e.target.value })} className="h-9 px-3 rounded-lg bg-slate-50 border border-slate-200 text-sm font-bold text-slate-700" />
                        </div>
                        <div className="h-6 w-px bg-slate-200 mx-1"></div>
                        <select value={searchParams.level} onChange={e => setSearchParams({ ...searchParams, level: e.target.value })} className="h-10 px-2 rounded-lg bg-slate-50 border border-slate-200 text-sm font-bold text-slate-700">
                            <option value="">전체 등급</option>
                            <option value="일반">일반</option>
                            <option value="VIP">VIP</option>
                            <option value="VVIP">VVIP</option>
                            <option value="법인/단체">법인/단체</option>
                        </select>
                        <div className="relative">
                            <input value={searchParams.keyword} onChange={e => setSearchParams({ ...searchParams, keyword: e.target.value })} placeholder="이름 또는 연락처 검색" className="h-9 w-48 pl-9 pr-3 rounded-lg bg-slate-50 border border-slate-200 text-sm font-bold text-slate-700 focus:ring-2 focus:ring-indigo-500" />
                            <span className="material-symbols-rounded absolute left-2.5 top-2 text-slate-400 text-lg">search</span>
                        </div>
                        <button onClick={() => handleSearch(false)} className="h-9 px-4 rounded-lg bg-indigo-600 text-white font-black hover:bg-indigo-500 transition-all text-sm shadow-md shadow-indigo-200">조회</button>
                        <button onClick={() => handleSearch(true)} className="h-9 px-4 rounded-lg bg-white border border-slate-200 text-slate-600 font-black hover:bg-slate-50 transition-all text-sm">전체 조회</button>

                        <div className="flex-1"></div>

                        <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">
                            <span className="text-xs font-bold text-slate-500">휴먼 고객(미구매)</span>
                            <input type="number" value={searchParams.dormantYears} onChange={e => setSearchParams({ ...searchParams, dormantYears: e.target.value })} className="w-12 h-6 text-center text-sm font-bold bg-white border border-slate-300 rounded" />
                            <span className="text-xs font-bold text-slate-500">년 이상</span>
                            <button onClick={handleDormantSearch} className="h-6 px-2 rounded bg-rose-100 text-rose-600 text-xs font-black hover:bg-rose-200">조회</button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Table Area */}
            <div className="px-6 lg:px-8 min-[2000px]:px-12 flex flex-col overflow-hidden flex-1 pb-4">
                <div className="bg-white rounded-[1.5rem] border border-slate-200 shadow-sm flex flex-col overflow-hidden h-full">
                    {/* Toolbar */}
                    <div className="px-5 py-3 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                        <div className="text-xs font-black text-slate-500 flex items-center gap-2">
                            <span>총 <span className="text-indigo-600 text-sm">{customerList.length.toLocaleString()}</span>명</span>
                        </div>
                        <div className="flex items-center gap-3">
                            <label className="flex items-center gap-2 cursor-pointer group">
                                <input type="checkbox" checked={deleteSalesChecked} onChange={e => setDeleteSalesChecked(e.target.checked)} className="w-4 h-4 rounded text-rose-500 focus:ring-rose-500 border-slate-300" />
                                <span className="text-xs font-bold text-slate-500 group-hover:text-rose-500 transition-colors">매출 내역까지 완전 삭제</span>
                            </label>
                            <button onClick={handleDelete} className="h-8 px-3 rounded-lg bg-white border border-rose-200 text-rose-500 font-black hover:bg-rose-50 hover:border-rose-300 transition-all flex items-center gap-1 text-xs">
                                <span className="material-symbols-rounded text-sm">delete</span> 선택 삭제
                            </button>
                            <div className="h-4 w-px bg-slate-200 mx-1"></div>
                            <button onClick={handleExportCSV} className="h-8 px-3 rounded-lg bg-white border border-emerald-200 text-emerald-600 font-black hover:bg-emerald-50 hover:border-emerald-300 transition-all flex items-center gap-1 text-xs">
                                <span className="material-symbols-rounded text-sm">download</span> 엑셀 저장
                            </button>
                        </div>
                    </div>

                    {/* Table */}
                    <div className="flex-1 overflow-auto bg-slate-50/30">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-50 text-slate-500 font-black text-xs uppercase border-b border-slate-200 sticky top-0 z-10">
                                <tr>
                                    <th className="px-4 py-3 text-center w-[40px]">
                                        <input type="checkbox" checked={isAllSelected} onChange={e => toggleSelectAll(e.target.checked)} className="w-4 h-4 rounded text-indigo-600 border-slate-300 focus:ring-indigo-500" />
                                    </th>
                                    <th className="px-4 py-3 text-center w-[5%] min-w-[50px]">No</th>
                                    <th className="px-4 py-3 text-center w-[12%] min-w-[80px]">고객명</th>
                                    <th className="px-4 py-3 text-center w-[13%] min-w-[100px]">연락처</th>
                                    <th className="px-4 py-3 text-center w-[8%] min-w-[60px]">등급</th>
                                    <th className="px-4 py-3 text-center w-[10%] min-w-[90px]">가입일</th>
                                    <th className="px-4 py-3 text-left">주소</th>
                                    <th className="px-4 py-3 text-center w-[80px]">AI 분석</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {currentItems.length === 0 ? (
                                    <tr><td colSpan="8" className="p-20 text-center text-slate-400 font-bold italic">조회된 데이터가 없습니다.</td></tr>
                                ) : (
                                    currentItems.map((c, idx) => (
                                        <tr key={c.customer_id} className="hover:bg-slate-50 group transition-colors bg-white">
                                            <td className="px-4 py-3 text-center">
                                                <input type="checkbox" checked={selectedIds.has(c.customer_id)} onChange={e => toggleSelectOne(c.customer_id, e.target.checked)} className="w-4 h-4 rounded text-indigo-600 border-slate-300 focus:ring-indigo-500" />
                                            </td>
                                            <td className="px-4 py-3 text-center text-slate-400 text-xs font-mono">{startIndex + idx + 1}</td>
                                            <td className="px-4 py-3 text-center font-bold text-slate-700 cursor-pointer hover:text-indigo-600" title={c.customer_id}>{c.customer_name}</td>
                                            <td className="px-4 py-3 text-center font-mono text-slate-600 text-xs">{c.mobile_number}</td>
                                            <td className="px-4 py-3 text-center">
                                                <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${c.membership_level === 'VIP' ? 'bg-amber-100 text-amber-600' : 'bg-slate-100 text-slate-500'}`}>
                                                    {c.membership_level || '일반'}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-center text-slate-500 text-xs">{c.join_date || '-'}</td>
                                            <td className="px-4 py-3 text-slate-600 text-xs truncate max-w-[300px]" title={`${c.address_primary || ''} ${c.address_detail || ''}`}>
                                                {c.address_primary} {c.address_detail}
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <button onClick={() => handleAiInsight(c.customer_id)} className="w-8 h-8 rounded-full hover:bg-indigo-50 text-indigo-300 hover:text-indigo-600 transition-all flex items-center justify-center">
                                                    <span className="material-symbols-rounded text-lg">auto_awesome</span>
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                    {/* Pagination */}
                    <div className="px-5 py-3 border-t border-slate-100 flex justify-between items-center bg-white">
                        <div className="text-xs text-slate-400 font-medium">Page {currentPage} of {totalPages}</div>
                        <div className="flex gap-1">
                            <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-50 disabled:opacity-30 disabled:hover:bg-white transition-all">
                                <span className="material-symbols-rounded text-sm">chevron_left</span>
                            </button>
                            <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-50 disabled:opacity-30 disabled:hover:bg-white transition-all">
                                <span className="material-symbols-rounded text-sm">chevron_right</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* AI Insight Modal */}
            {aiModalOpen && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in">
                    <div className="relative w-full max-w-md bg-white rounded-[2rem] shadow-2xl overflow-hidden animate-in zoom-in-95 flex flex-col">
                        <div className="px-6 py-5 bg-indigo-600 text-white flex justify-between items-center">
                            <h3 className="text-lg font-black flex items-center gap-2">
                                <span className="material-symbols-rounded">auto_awesome</span> AI 고객 분석
                            </h3>
                            <button onClick={() => setAiModalOpen(false)} className="w-8 h-8 rounded-full hover:bg-white/20 transition-colors flex items-center justify-center">
                                <span className="material-symbols-rounded">close</span>
                            </button>
                        </div>
                        <div className="p-6 min-h-[200px] flex flex-col justify-center">
                            {isLoadingAi ? (
                                <div className="text-center space-y-3">
                                    <span className="material-symbols-rounded text-4xl text-indigo-300 animate-spin">sync</span>
                                    <p className="font-bold text-slate-500 animate-pulse">고객 데이터를 분석하고 있습니다...</p>
                                </div>
                            ) : aiInsight?.error ? (
                                <div className="text-center text-rose-500 font-bold p-4 bg-rose-50 rounded-xl">
                                    {aiInsight.error}
                                </div>
                            ) : aiInsight ? (
                                <div className="space-y-4">
                                    <div className="flex flex-wrap gap-2">
                                        {aiInsight.keywords?.map((k, i) => (
                                            <span key={i} className="px-3 py-1 bg-purple-50 text-purple-700 rounded-lg text-sm font-bold border border-purple-100">
                                                {k}
                                            </span>
                                        ))}
                                    </div>
                                    <div className="space-y-1">
                                        <div className="text-xs font-black text-slate-400 uppercase">Ice Breaking</div>
                                        <div className="p-3 bg-slate-50 rounded-xl text-slate-700 text-sm font-medium leading-relaxed">
                                            "{aiInsight.ice_breaking}"
                                        </div>
                                    </div>
                                    <div className="space-y-1">
                                        <div className="text-xs font-black text-slate-400 uppercase">Sales Tip</div>
                                        <div className="p-3 bg-indigo-50 rounded-xl text-indigo-800 text-sm font-bold leading-relaxed border border-indigo-100">
                                            {aiInsight.sales_tip}
                                        </div>
                                    </div>
                                </div>
                            ) : null}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CustomerBatch;

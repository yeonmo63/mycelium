import React, { useState, useEffect } from 'react';
import { useModal } from '../../contexts/ModalContext';

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
    const [statusTab, setStatusTab] = useState('전체'); // '전체' | '정상' | '말소'

    // AI Insight
    const [aiModalOpen, setAiModalOpen] = useState(false);
    const [aiInsight, setAiInsight] = useState(null);
    const [isLoadingAi, setIsLoadingAi] = useState(false);

    // Change History Modal
    const [isLogsModalOpen, setIsLogsModalOpen] = useState(false);
    const [customerLogs, setCustomerLogs] = useState([]);
    const [selectedCustomerForLogs, setSelectedCustomerForLogs] = useState(null);

    // --- Handlers ---
    useEffect(() => {
        // Initial Search
        handleSearch(true);
    }, []);

    const handleSearch = async (isAll = false) => {
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
            const params = new URLSearchParams({ start, end });
            if (keyword) params.append('keyword', keyword);
            if (level) params.append('membershipLevel', level);

            const res = await fetch(`/api/customer/batch/search?${params.toString()}`);
            if (res.ok) {
                const results = await res.json();
                setCustomerList(results || []);
                setCurrentPage(1);
                setSelectedIds(new Set());
            } else {
                const errText = await res.text();
                throw new Error(errText);
            }
        } catch (e) {
            console.error(e);
            showAlert('오류', '조회 중 오류가 발생했습니다: ' + e.message);
        }
    };

    const handleDormantSearch = async () => {
        // Reset non-dormant params visually
        setSearchParams(prev => ({ ...prev, keyword: '', level: '', dateStart: '', dateEnd: '', isDormantMode: true }));

        const years = parseFloat(searchParams.dormantYears) || 3;
        const days = Math.round(years * 365);

        try {
            const res = await fetch(`/api/customer/batch/dormant?daysThreshold=${days}`);
            if (res.ok) {
                const results = await res.json();
                setCustomerList(results || []);
                setCurrentPage(1);
                setSelectedIds(new Set());
            } else {
                const errText = await res.text();
                throw new Error(errText);
            }
        } catch (e) {
            console.error(e);
            showAlert('오류', '휴먼 고객 조회 실패: ' + e.message);
        }
    };

    const handleDelete = async () => {
        if (selectedIds.size === 0) {
            await showAlert('알림', '삭제할 고객을 선택해주세요.');
            return;
        }

        const isPermanentDelete = statusTab === '휴면';
        let msg = isPermanentDelete
            ? `선택한 ${selectedIds.size}명의 고객 정보를 영구 삭제하시겠습니까?`
            : `선택한 ${selectedIds.size}명의 고객을 '휴면' 상태로 전환하시겠습니까?`;

        if (isPermanentDelete && deleteSalesChecked) {
            msg += `\n\n⚠️ 주의: 해당 고객들의 모든 판매 내역(매출 데이터)도 함께 삭제됩니다!`;
        }
        msg += `\n이 작업은 되돌릴 수 없습니다.`;

        if (!await showConfirm(isPermanentDelete ? '영구 삭제 확인' : '휴면 전환 확인', msg)) return;

        try {
            const res = await fetch('/api/customer/batch/delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ids: Array.from(selectedIds),
                    permanent: isPermanentDelete,
                    alsoDeleteSales: isPermanentDelete ? deleteSalesChecked : false
                })
            });

            if (!res.ok) {
                const errText = await res.text();
                throw new Error(errText);
            }

            await showAlert('성공', isPermanentDelete
                ? `${selectedIds.size}명의 고객 정보가 영구 삭제되었습니다.`
                : `${selectedIds.size}명의 고객이 휴면 고객으로 전환되었습니다.`);

            // Refresh
            if (searchParams.isDormantMode) {
                handleDormantSearch();
            } else {
                handleSearch(false);
            }
        } catch (e) {
            showAlert('오류', '삭제 실패: ' + e.message);
        }
    };

    const handleReactivate = async () => {
        if (selectedIds.size === 0) {
            await showAlert('알림', '복구할 고객을 선택해주세요.');
            return;
        }

        if (!await showConfirm('정상 복구 확인', `선택한 ${selectedIds.size}명의 휴면 고객을 '정상' 상태로 복구하시겠습니까?`)) return;

        try {
            const res = await fetch('/api/customer/batch/reactivate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ids: Array.from(selectedIds) })
            });

            if (!res.ok) {
                const errText = await res.text();
                throw new Error(errText);
            }

            await showAlert('성공', `${selectedIds.size}명의 고객이 정상 고객으로 복구되었습니다.`);

            // Refresh
            if (searchParams.isDormantMode) {
                handleDormantSearch();
            } else {
                handleSearch(false);
            }
        } catch (e) {
            showAlert('오류', '복구 실패: ' + e.message);
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

        // Web: Use browser download instead of Tauri dialog
        try {
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `고객일괄조회_${new Date().toISOString().slice(0, 10)}.csv`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            showAlert('성공', '파일이 성공적으로 다운로드되었습니다.');
        } catch (e) {
            showAlert('오류', '파일 저장 실패: ' + e.message);
        }
    };

    const handleAiInsight = async (customerId) => {
        if (!customerId) return;
        setIsLoadingAi(true);
        setAiModalOpen(true);
        setAiInsight(null);

        try {
            const res = await fetch(`/api/customer/ai-insight?customer_id=${customerId}`);

            if (res.status === 429 || res.status === 403) {
                throw new Error('AI_QUOTA_EXCEEDED');
            }

            if (!res.ok) {
                const errText = await res.text();
                throw new Error(`AI 분석 실패: ${errText}`);
            }

            const insight = await res.json();
            setAiInsight(insight);
        } catch (e) {
            console.error(e);
            if (e.message === 'AI_QUOTA_EXCEEDED') {
                setAiInsight({ error: '🚫 일일 무료 사용량을 초과했습니다.' });
            } else {
                setAiInsight({ error: String(e.message) });
            }
        } finally {
            setIsLoadingAi(false);
        }
    };

    const viewLogs = async (c) => {
        setSelectedCustomerForLogs(c);
        try {
            const res = await fetch(`/api/customer/logs?customer_id=${c.customer_id}`);
            if (res.ok) {
                const logs = await res.json();
                setCustomerLogs(logs || []);
                setIsLogsModalOpen(true);
            } else {
                const errText = await res.text();
                throw new Error(errText);
            }
        } catch (e) {
            showAlert('오류', '이력 조회 실패: ' + e.message);
        }
    };

    // --- Pagination Logic ---
    const filteredList = customerList.filter(c => {
        if (statusTab === '전체') return true;
        const displayStatus = (c.status || '정상') === '말소' ? '휴면' : (c.status || '정상');
        return displayStatus === statusTab;
    });

    const totalPages = Math.ceil(filteredList.length / ITEMS_PER_PAGE) || 1;
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const currentItems = filteredList.slice(startIndex, startIndex + ITEMS_PER_PAGE);

    const toggleSelectAll = (checked) => {
        if (checked) {
            const newSet = new Set(currentItems.map(c => c.customer_id));
            setSelectedIds(prev => new Set([...prev, ...newSet]));
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

            <div className="px-6 lg:px-8 min-[2000px]:px-12 flex gap-1 mb-4">
                {['전체', '정상', '휴면'].map(tab => (
                    <button
                        key={tab}
                        onClick={() => {
                            setStatusTab(tab);
                            setCurrentPage(1);
                            if (tab === '전체') setSelectedIds(new Set());
                        }}
                        className={`px-6 py-2 rounded-xl font-black text-sm transition-all ${statusTab === tab ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200' : 'bg-white border border-slate-200 text-slate-400 hover:bg-slate-50'}`}
                    >
                        {tab} {statusTab === tab && <span className="ml-1.5 px-1.5 py-0.5 bg-white/20 rounded text-[10px]">{filteredList.length}</span>}
                    </button>
                ))}
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
                            {statusTab === '정상' && (
                                <button onClick={handleDelete} className="h-8 px-4 rounded-lg bg-rose-600 text-white font-black hover:bg-rose-500 transition-all flex items-center gap-1 text-xs shadow-sm shadow-rose-200">
                                    <span className="material-symbols-rounded text-sm">person_remove</span> 휴면 고객 전환
                                </button>
                            )}

                            {statusTab === '휴면' && (
                                <>
                                    <button onClick={handleReactivate} className="h-8 px-4 rounded-lg bg-indigo-600 text-white font-black hover:bg-indigo-500 transition-all flex items-center gap-1 text-xs shadow-sm shadow-indigo-200">
                                        <span className="material-symbols-rounded text-sm">person_add</span> 정상 고객 전환
                                    </button>
                                    {/* 영구 삭제 영역 (주의용 테두리 및 연한 배경 적용) */}
                                    <div className="flex items-center gap-3 px-3 py-1 bg-rose-50 border border-rose-200 rounded-xl">
                                        <div className="flex items-center gap-2 cursor-pointer group" onClick={() => setDeleteSalesChecked(!deleteSalesChecked)}>
                                            <input type="checkbox" checked={deleteSalesChecked} onChange={e => setDeleteSalesChecked(e.target.checked)} className="w-4 h-4 rounded text-rose-600 focus:ring-rose-500 border-rose-300 cursor-pointer" />
                                            <span className="text-xs font-bold text-rose-600 select-none">매출 내역 영구 삭제</span>
                                        </div>
                                        <div className="h-4 w-px bg-rose-200"></div>
                                        <button onClick={handleDelete} className="h-8 px-4 rounded-lg bg-rose-600 text-white font-black hover:bg-rose-700 transition-all flex items-center gap-1 text-xs shadow-sm">
                                            <span className="material-symbols-rounded text-sm">delete_forever</span> 영구 삭제
                                        </button>
                                    </div>
                                </>
                            )}

                            {(statusTab === '정상' || statusTab === '휴면') && <div className="h-4 w-px bg-slate-200 mx-1"></div>}

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
                                        <input
                                            type="checkbox"
                                            checked={isAllSelected}
                                            onChange={e => toggleSelectAll(e.target.checked)}
                                            disabled={statusTab === '전체'}
                                            className={`w-4 h-4 rounded text-indigo-600 border-slate-300 focus:ring-indigo-500 ${statusTab === '전체' ? 'opacity-20 cursor-not-allowed' : ''}`}
                                        />
                                    </th>
                                    <th className="px-4 py-3 text-center w-[5%] min-w-[50px]">No</th>
                                    <th className="px-4 py-3 text-center w-[12%] min-w-[80px]">고객명</th>
                                    <th className="px-4 py-3 text-center w-[13%] min-w-[100px]">연락처</th>
                                    <th className="px-4 py-3 text-center w-[8%] min-w-[60px]">등급</th>
                                    <th className="px-4 py-3 text-center w-[10%] min-w-[90px]">가입일</th>
                                    <th className="px-4 py-3 text-center w-[7%] min-w-[60px]">상태</th>
                                    <th className="px-4 py-3 text-left">주소</th>
                                    <th className="px-4 py-3 text-center w-[80px]">AI 분석</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {currentItems.length === 0 ? (
                                    <tr><td colSpan="8" className="p-20 text-center text-slate-400 font-bold italic">조회된 데이터가 없습니다.</td></tr>
                                ) : (
                                    currentItems.map((c, idx) => (
                                        <tr
                                            key={c.customer_id}
                                            className="hover:bg-slate-50 group transition-colors bg-white cursor-pointer"
                                            onClick={() => viewLogs(c)}
                                        >
                                            <td className="px-4 py-3 text-center" onClick={e => e.stopPropagation()}>
                                                <input
                                                    type="checkbox"
                                                    checked={selectedIds.has(c.customer_id)}
                                                    onChange={e => toggleSelectOne(c.customer_id, e.target.checked)}
                                                    disabled={statusTab === '전체'}
                                                    className={`w-4 h-4 rounded text-indigo-600 border-slate-300 focus:ring-indigo-500 ${statusTab === '전체' ? 'opacity-20 cursor-not-allowed' : ''}`}
                                                />
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
                                            <td className="px-4 py-3 text-center">
                                                <span className={`px-2 py-0.5 rounded text-[10px] font-black ${(c.status || '정상') === '정상' ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'}`}>
                                                    {(c.status || '정상') === '말소' ? '휴면' : (c.status || '정상')}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-slate-600 text-xs truncate max-w-[300px]" title={`${c.address_primary || ''} ${c.address_detail || ''}`}>
                                                {c.address_primary} {c.address_detail}
                                            </td>
                                            <td className="px-4 py-3 text-center" onClick={e => e.stopPropagation()}>
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
                        <div className="text-xs text-slate-400 font-medium">Page {currentPage} of {totalPages} (Showing {filteredList.length} items)</div>
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

            {/* Change History Modal */}
            {isLogsModalOpen && (
                <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden border border-white/20 scale-in-center">
                        <div className="px-6 py-5 bg-slate-800 text-white flex justify-between items-center shrink-0">
                            <h3 className="text-lg font-black flex items-center gap-3">
                                <span className="material-symbols-rounded text-indigo-400">history</span>
                                정보 변경 이력 <span className="text-slate-400 font-light text-sm">{selectedCustomerForLogs?.customer_name} 고객님</span>
                            </h3>
                            <button onClick={() => setIsLogsModalOpen(false)} className="w-8 h-8 rounded-full hover:bg-white/10 flex items-center justify-center transition-colors"><span className="material-symbols-rounded">close</span></button>
                        </div>
                        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 bg-slate-50/10">
                            {customerLogs.length === 0 ? (
                                <div className="h-40 flex flex-col items-center justify-center text-slate-400 italic font-bold">
                                    <span className="material-symbols-rounded text-4xl mb-2 opacity-20">history</span>
                                    기록된 변경 이력이 없습니다.
                                </div>
                            ) : (
                                <div className="relative">
                                    <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-slate-200/50"></div>
                                    <div className="space-y-6 relative">
                                        {customerLogs.map((log) => (
                                            <div key={log.log_id} className="relative pl-10">
                                                <div className="absolute left-3 w-2.5 h-2.5 rounded-full bg-indigo-500 border-2 border-white translate-x-[-1px] z-10"></div>
                                                <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100/50">
                                                    <div className="flex justify-between items-start mb-2">
                                                        <span className="text-[10px] font-black px-2 py-0.5 bg-slate-100 text-slate-500 rounded-full uppercase tracking-wider">{log.field_name} 변경</span>
                                                        <span className="text-[10px] font-bold text-slate-400 flex items-center gap-1">
                                                            <span className="material-symbols-rounded text-xs">schedule</span>
                                                            {log.changed_at ? new Date(log.changed_at).toLocaleString() : '정보 없음'}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center gap-3 text-sm font-bold">
                                                        <div className="flex-1 p-2.5 bg-rose-50/50 rounded-xl border border-rose-100/30">
                                                            <div className="text-[9px] font-black text-rose-300 uppercase mb-0.5">이전 정보</div>
                                                            <div className="text-rose-600 truncate">{log.old_value || '(비어있음)'}</div>
                                                        </div>
                                                        <span className="material-symbols-rounded text-slate-300">arrow_right_alt</span>
                                                        <div className="flex-1 p-2.5 bg-emerald-50/50 rounded-xl border border-emerald-100/30">
                                                            <div className="text-[9px] font-black text-emerald-300 uppercase mb-0.5">변경된 정보</div>
                                                            <div className="text-emerald-600 truncate">{log.new_value || '(비어있음)'}</div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="px-6 py-4 bg-white border-t border-slate-100 flex justify-end">
                            <button onClick={() => setIsLogsModalOpen(false)} className="px-6 h-10 rounded-xl bg-slate-800 text-white font-black text-sm hover:bg-slate-700 transition-all">확인</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CustomerBatch;

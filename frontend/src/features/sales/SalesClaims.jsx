import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { formatCurrency } from '../../utils/common';
import { useModal } from '../../contexts/ModalContext';

const SalesClaims = () => {
    const { showAlert, showConfirm } = useModal();

    // --- State ---
    const [claims, setClaims] = useState([]);
    const [dateRange, setDateRange] = useState({
        start: new Date(new Date().setMonth(new Date().getMonth() - 1)).toISOString().split('T')[0],
        end: new Date().toISOString().split('T')[0]
    });

    // Stats
    const stats = useMemo(() => ({
        pending: claims.filter(c => c.claim_status === '접수' || c.claim_status === '처리중').length,
        today: claims.filter(c => c.created_at?.startsWith(new Date().toISOString().split('T')[0])).length
    }), [claims]);

    // Modals
    const [processModal, setProcessModal] = useState({ open: false, claim: null, refundAmount: 0, recoverInventory: false, memo: '' });
    const [editModal, setEditModal] = useState({ open: false, claim: null, category: '', qty: 0, memo: '' });
    const [detailModal, setDetailModal] = useState({ open: false, saleId: null, data: null });
    const [searchModal, setSearchModal] = useState({ open: false, query: '', results: [], loading: false });
    // Global Create Claim Modal (Usually triggered from search or anywhere) - we'll integrate it here for "Manual Registration"
    const [createModal, setCreateModal] = useState({ open: false, sale: null, type: '반품', category: '단순변심', qty: 1, memo: '' });

    // --- Effects ---
    useEffect(() => {
        loadClaims();
    }, [dateRange]);

    const loadClaims = async () => {
        if (!window.__TAURI__) return;
        try {
            const data = await window.__TAURI__.core.invoke('get_sales_claims', {
                startDate: dateRange.start || null,
                endDate: dateRange.end || null
            });
            // Sort by created_at desc
            data.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
            setClaims(data);
        } catch (e) {
            console.error(e);
        }
    };

    // --- Actions ---
    const handleDelete = async (claimId) => {
        if (await showConfirm("삭제 확인", "이 클레임 내역을 삭제하시겠습니까?\n이미 완료된 처리는 되돌릴 수 없습니다.")) {
            executeDelete(claimId);
        }
    };

    const executeDelete = async (claimId) => {
        try {
            if (window.__TAURI__) {
                await window.__TAURI__.core.invoke('delete_sales_claim', { claimId });
            }
            showAlert("성공", "삭제되었습니다.");
            loadClaims();
        } catch (e) {
            showAlert("오류", "삭제 실패: " + e);
        }
    };

    // --- Process Flow ---
    const openProcess = (claim) => {
        setProcessModal({
            open: true,
            claim,
            refundAmount: 0,
            recoverInventory: claim.claim_type === '반품',
            memo: ''
        });
    };

    const handleProcessSubmit = async (status) => { // status: '완료' | '거부'
        if (await showConfirm("처리 확인", `이 클레임을 '${status}' 처리하시겠습니까?`)) {
            executeProcess(status);
        }
    };

    const executeProcess = async (status) => {
        const { claim, refundAmount, recoverInventory, memo } = processModal;
        try {
            const amt = Number(String(refundAmount).replace(/[^0-9]/g, ''));
            if (window.__TAURI__) {
                const invoke = window.__TAURI__.core.invoke;
                await invoke('process_sales_claim', {
                    claimId: claim.claim_id,
                    claimStatus: status,
                    isInventoryRecovered: recoverInventory,
                    refundAmount: amt
                });

                // CRM Log
                let crmLogSuccess = false;
                if (status === '완료' && claim.customer_id) {
                    const title = `[시스템 자동] ${claim.claim_type} 클레임 처리 완료`;
                    const content = `주문번호: ${claim.sales_id}\n유형: ${claim.claim_type}\n사유: ${claim.reason_category}\n메모: ${claim.memo || '-'}\n\n[처리 결과]\n환불금액: ${formatCurrency(amt)}원\n처리메모: ${memo || '-'}`;
                    try {
                        await invoke('create_consultation', {
                            customerId: claim.customer_id,
                            guestName: claim.customer_name || '회원',
                            contact: '',
                            channel: '시스템',
                            counselorName: '자동',
                            category: '클레임',
                            priority: '보통',
                            title, content
                        });
                        crmLogSuccess = true;
                        console.log("CRM Log created successfully");
                    } catch (e) {
                        console.error("CRM Log failed:", e);
                        showAlert("경고", "클레임 처리는 완료되었으나, CRM 상담 내역 등록에 실패했습니다: " + e);
                    }
                }

                setProcessModal({ ...processModal, open: false });

                let successMsg = `클레임 처리가 ${status}되었습니다.`;
                if (crmLogSuccess) {
                    successMsg += "\n(CRM 상담 내역에 자동 등록되었습니다)";
                }
                showAlert("성공", successMsg);

                loadClaims();
                return; // Exit here as we handled alerts
            }
        } catch (e) {
            showAlert("오류", "처리 실패: " + e);
        }
    };

    // --- Edit Flow ---
    const openEdit = (claim) => {
        setEditModal({
            open: true,
            claim,
            category: claim.reason_category,
            qty: claim.quantity,
            memo: claim.memo || ''
        });
    };

    const handleEditSubmit = async () => {
        try {
            if (window.__TAURI__) {
                await window.__TAURI__.core.invoke('update_sales_claim', {
                    claimId: editModal.claim.claim_id,
                    reasonCategory: editModal.category,
                    quantity: Number(editModal.qty),
                    memo: editModal.memo
                });
            }
            setEditModal({ ...editModal, open: false });
            showAlert("성공", "수정되었습니다.");
            loadClaims();
        } catch (e) {
            showAlert("오류", "수정 실패: " + e);
        }
    };

    // --- Detail Flow ---
    const openDetail = async (salesId) => {
        if (!salesId) {
            showAlert("알림", "주문 번호 정보가 없습니다.");
            return;
        }
        setDetailModal({ open: true, saleId: salesId, data: null }); // Open with loading state

        if (window.__TAURI__) {
            try {
                const data = await window.__TAURI__.core.invoke('get_sale_detail', { salesId });
                setDetailModal(prev => ({ ...prev, data }));
            } catch (e) {
                console.error("Failed to fetch sale detail:", e);
                setDetailModal(prev => ({ ...prev, error: e }));
                // Optional: Close modal if failed immediately?
                // setDetailModal({ open: false, saleId: null, data: null });
                // showAlert("오류", "상세 정보를 불러오지 못했습니다: " + e);
            }
        }
    };

    // --- Search & Create Flow ---
    const handleSearch = async () => {
        if (!searchModal.query) return;
        setSearchModal(prev => ({ ...prev, loading: true, results: [] }));
        try {
            if (window.__TAURI__) {
                const sales = await window.__TAURI__.core.invoke('search_sales_by_any', { query: searchModal.query, period: 'all' });
                setSearchModal(prev => ({ ...prev, results: sales, loading: false }));
            }
        } catch (e) {
            console.error(e);
            setSearchModal(prev => ({ ...prev, loading: false }));
        }
    };

    const openCreate = (sale) => {
        // Determine allowed claim types based on order status
        // Pre-shipping statuses: '접수', '주문접수', '입금대기', '입금확인' -> Only Cancel allowed
        // Post-shipping: '배송중', '배송완료' -> Return/Exchange allowed
        const isPreShipping = ['접수', '주문접수', '입금대기', '입금확인'].includes(sale.status);

        setCreateModal({
            open: true,
            sale,
            type: isPreShipping ? '취소' : '반품', // Auto-select appropriate default
            category: '단순변심',
            qty: sale.quantity,
            memo: ''
        });
        setSearchModal({ ...searchModal, open: false });
    };

    const handleCreateSubmit = async () => {
        try {
            if (window.__TAURI__) {
                await window.__TAURI__.core.invoke('create_sales_claim', {
                    salesId: createModal.sale.sales_id,
                    customerId: createModal.sale.customer_id || null,
                    claimType: createModal.type,
                    reasonCategory: createModal.category,
                    quantity: Number(createModal.qty),
                    memo: createModal.memo
                });
            }
            setCreateModal({ ...createModal, open: false });
            showAlert("성공", "클레임이 접수되었습니다.");
            loadClaims();
        } catch (e) {
            showAlert("오류", "접수 실패: " + e);
        }
    };


    return (
        <div className="h-full flex flex-col relative overflow-hidden">
            {/* Header Title */}
            <div className="px-6 lg:px-8 min-[2000px]:px-12 pt-6 lg:pt-8 min-[2000px]:pt-12 pb-1 shrink-0">
                <div className="flex justify-between items-end mb-4">
                    <div>
                        <div className="flex items-center gap-2 mb-0.5">
                            <span className="w-6 h-1 bg-rose-500 rounded-full"></span>
                            <span className="text-[9px] font-black tracking-[0.2em] text-rose-600 uppercase">Claims Management</span>
                        </div>
                        <h1 className="text-3xl font-black text-slate-600 tracking-tighter" style={{ fontFamily: '"Noto Sans KR", sans-serif' }}>
                            취소/반품/교환 처리 <span className="text-slate-300 font-light ml-1 text-xl">Claims</span>
                        </h1>
                    </div>
                </div>
            </div>

            {/* Top Controls & Stats */}
            <div className="px-6 lg:px-8 min-[2000px]:px-12 mb-3 shrink-0">
                <div className="bg-white p-4 rounded-[2rem] shadow-xl border border-slate-100 flex justify-between items-center relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-rose-400 via-pink-400 to-rose-400 opacity-30"></div>

                    <div className="flex gap-6 items-center z-10">
                        <div className="flex items-center gap-3 bg-slate-50 px-4 py-2 rounded-xl border border-slate-100">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">기간 조회</span>
                            <div className="h-4 w-px bg-slate-200"></div>
                            <input type="date" value={dateRange.start} onChange={e => setDateRange({ ...dateRange, start: e.target.value })}
                                className="bg-transparent border-none text-xs font-bold text-slate-600 focus:ring-0 p-0 font-mono" />
                            <span className="text-slate-300 text-xs">~</span>
                            <input type="date" value={dateRange.end} onChange={e => setDateRange({ ...dateRange, end: e.target.value })}
                                className="bg-transparent border-none text-xs font-bold text-slate-600 focus:ring-0 p-0 font-mono" />
                        </div>
                        <button onClick={loadClaims} className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 transition-colors">
                            <span className="material-symbols-rounded text-lg">refresh</span>
                        </button>
                    </div>

                    <div className="flex gap-6 items-center z-10">
                        <div className="flex gap-4 pr-6 border-r border-slate-100">
                            <div className="flex flex-col items-end">
                                <span className="text-[9px] font-black text-rose-400 uppercase tracking-wider">미처리 건수</span>
                                <span className="text-xl font-black text-rose-500 leading-none">{stats.pending}</span>
                            </div>
                            <div className="flex flex-col items-end">
                                <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider">오늘 접수</span>
                                <span className="text-xl font-black text-slate-600 leading-none">{stats.today}</span>
                            </div>
                        </div>
                        <button onClick={() => setSearchModal({ open: true, query: '', results: [] })}
                            className="h-10 px-5 rounded-xl bg-gradient-to-br from-rose-500 to-pink-600 text-white font-bold shadow-lg shadow-rose-200 hover:shadow-rose-300 hover:scale-[1.02] transition-all flex items-center gap-2 text-xs">
                            <span className="material-symbols-rounded text-base">add_circle</span>
                            클레임 수기 접수
                        </button>
                    </div>
                </div>
            </div>

            {/* List Table */}
            <div className="flex-1 px-6 lg:px-8 min-[2000px]:px-12 pb-6 lg:pb-8 min-[2000px]:pb-12 overflow-hidden">
                <div className="h-full bg-white rounded-[1.5rem] shadow-xl border border-slate-200 relative flex flex-col overflow-hidden">
                    <div className="flex-1 overflow-auto stylish-scrollbar p-0.5">
                        <table className="w-full text-xs border-separate border-spacing-0">
                            <thead className="sticky top-0 z-10">
                                <tr className="bg-slate-50/80 backdrop-blur-md">
                                    <th className="px-4 py-3 text-center text-[9px] font-black uppercase text-slate-400 border-b border-slate-100 w-[8%]">상태</th>
                                    <th className="px-4 py-3 text-center text-[9px] font-black uppercase text-slate-400 border-b border-slate-100 w-[8%]">유형</th>
                                    <th className="px-4 py-3 text-center text-[9px] font-black uppercase text-slate-400 border-b border-slate-100 w-[12%]">접수일시</th>
                                    <th className="px-4 py-3 text-left text-[9px] font-black uppercase text-slate-400 border-b border-slate-100 w-[15%]">고객정보</th>
                                    <th className="px-4 py-3 text-center text-[9px] font-black uppercase text-slate-400 border-b border-slate-100 w-[10%]">주문번호</th>
                                    <th className="px-4 py-3 text-center text-[9px] font-black uppercase text-slate-400 border-b border-slate-100 w-[10%]">사유</th>
                                    <th className="px-4 py-3 text-left text-[9px] font-black uppercase text-slate-400 border-b border-slate-100">메모</th>
                                    <th className="px-4 py-3 text-center text-[9px] font-black uppercase text-slate-400 border-b border-slate-100 w-[6%]">수량</th>
                                    <th className="px-4 py-3 text-right text-[9px] font-black uppercase text-slate-400 border-b border-slate-100 w-[10%]">환불예정</th>
                                    <th className="px-4 py-3 text-center text-[9px] font-black uppercase text-slate-400 border-b border-slate-100 w-[10%]">관리</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {claims.map(claim => (
                                    <tr key={claim.claim_id} className="hover:bg-rose-50/30 transition-colors cursor-pointer group" onClick={() => {
                                        const id = claim.sales_id || claim.salesId;
                                        if (id) {
                                            openDetail(id);
                                        } else {
                                            // Fail silently or just log
                                            console.warn("Claim missing sales_id:", claim);
                                        }
                                    }}>
                                        <td className="px-4 py-3 text-center">
                                            <span className={`px-2 py-1 rounded-lg text-[10px] font-black tracking-tight ${claim.claim_status === '접수' ? 'bg-purple-100 text-purple-600' :
                                                claim.claim_status === '완료' ? 'bg-emerald-100 text-emerald-600' :
                                                    claim.claim_status === '거부' ? 'bg-slate-100 text-slate-500' :
                                                        'bg-amber-100 text-amber-600'
                                                }`}>
                                                {claim.claim_status}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            <span className={`text-[10px] font-bold ${claim.claim_type === '취소' ? 'text-rose-500' :
                                                claim.claim_type === '반품' ? 'text-orange-500' : 'text-blue-500'
                                                }`}>{claim.claim_type}</span>
                                        </td>
                                        <td className="px-4 py-3 text-center text-slate-400 font-mono text-[10px]">
                                            {claim.created_at?.substring(5, 16).replace('T', ' ')}
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="font-bold text-slate-700">{claim.customer_name || '비회원'}</div>
                                            <div className="text-[10px] text-slate-400">{claim.customer_id || '-'}</div>
                                        </td>
                                        <td className="px-4 py-3 text-center text-[10px] font-mono text-slate-500">{claim.sales_id}</td>
                                        <td className="px-4 py-3 text-center">
                                            <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-[10px] font-bold">{claim.reason_category}</span>
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="truncate max-w-[200px] text-slate-500 font-medium text-[11px]" title={claim.memo}>{claim.memo || '-'}</div>
                                        </td>
                                        <td className="px-4 py-3 text-center font-bold text-slate-700">{claim.quantity}</td>
                                        <td className="px-4 py-3 text-right font-black text-rose-500/80">{formatCurrency(claim.refund_amount)}</td>
                                        <td className="px-4 py-3 text-center">
                                            <div className="flex justify-end items-center gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                                                {(claim.claim_status === '접수' || claim.claim_status === '처리중') && (
                                                    <button onClick={(e) => { e.stopPropagation(); openProcess(claim); }} className="h-6 px-2 rounded-md bg-rose-500 hover:bg-rose-600 text-white text-[10px] font-bold shadow-sm transition-colors">
                                                        처리
                                                    </button>
                                                )}
                                                <button onClick={(e) => { e.stopPropagation(); openEdit(claim); }} className="w-6 h-6 rounded-md hover:bg-blue-50 text-slate-400 hover:text-blue-500 transition-colors flex items-center justify-center">
                                                    <span className="material-symbols-rounded text-sm">edit</span>
                                                </button>
                                                <button onClick={(e) => { e.stopPropagation(); handleDelete(claim.claim_id); }} className="w-6 h-6 rounded-md hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors flex items-center justify-center">
                                                    <span className="material-symbols-rounded text-sm">delete</span>
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                                {claims.length === 0 && (
                                    <tr><td colSpan="10" className="py-20 text-center text-slate-300 font-bold text-sm">등록된 클레임 내역이 없습니다.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Process Modal */}
            {processModal.open && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity" onClick={() => setProcessModal({ ...processModal, open: false })}></div>
                    <div className="bg-white rounded-3xl w-full max-w-[400px] shadow-2xl relative overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="bg-rose-50 px-6 py-4 border-b border-rose-100 flex justify-between items-center">
                            <h3 className="text-rose-600 font-black text-lg flex items-center gap-2">
                                <span className="material-symbols-rounded">gavel</span> 클레임 처리
                            </h3>
                            <button onClick={() => setProcessModal({ ...processModal, open: false })} className="text-rose-300 hover:text-rose-500 transition-colors">
                                <span className="material-symbols-rounded">close</span>
                            </button>
                        </div>
                        <div className="p-6">
                            <div className="mb-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-100 text-xs font-bold text-slate-600">
                                <span className="text-rose-500">{processModal.claim.claim_type}</span>
                                <span className="text-slate-300">|</span>
                                <span>{processModal.claim.reason_category}</span>
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <label className="text-[10px] font-black text-slate-400 uppercase mb-1 block ml-1">환불 금액</label>
                                    <div className="relative">
                                        <input value={formatCurrency(processModal.refundAmount)}
                                            onChange={e => setProcessModal({ ...processModal, refundAmount: e.target.value.replace(/[^0-9]/g, '') })}
                                            className="w-full h-10 px-3 text-right rounded-xl bg-slate-50 border-none font-bold text-slate-700 focus:ring-2 focus:ring-rose-200"
                                        />
                                        <span className="absolute left-3 top-2.5 text-xs text-slate-400 font-bold">KRW</span>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 p-3 rounded-xl bg-slate-50 border border-slate-100 cursor-pointer"
                                    onClick={() => setProcessModal({ ...processModal, recoverInventory: !processModal.recoverInventory })}>
                                    <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-colors ${processModal.recoverInventory ? 'bg-rose-500 border-rose-500' : 'bg-white border-slate-300'}`}>
                                        {processModal.recoverInventory && <span className="material-symbols-rounded text-white text-sm">check</span>}
                                    </div>
                                    <span className="text-xs font-bold text-slate-600">재고 복구 (반품 입고 처리)</span>
                                </div>
                                <div>
                                    <label className="text-[10px] font-black text-slate-400 uppercase mb-1 block ml-1">처리 메모</label>
                                    <textarea value={processModal.memo} onChange={e => setProcessModal({ ...processModal, memo: e.target.value })}
                                        className="w-full h-24 p-3 rounded-xl bg-slate-50 border-none text-xs font-medium text-slate-600 resize-none focus:ring-2 focus:ring-rose-200"
                                        placeholder="처리 내용이나 사유를 입력하세요." />
                                </div>
                            </div>
                        </div>
                        <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-between items-center">
                            <button onClick={() => handleProcessSubmit('거부')} className="text-xs font-bold text-slate-400 hover:text-rose-500 px-2 py-1 transition-colors">거부/반려</button>
                            <div className="flex gap-2">
                                <button onClick={() => setProcessModal({ ...processModal, open: false })} className="px-4 py-2 rounded-xl text-slate-500 font-bold hover:bg-slate-200 text-xs transition-colors">취소</button>
                                <button onClick={() => handleProcessSubmit('완료')} className="px-6 py-2 rounded-xl bg-rose-500 hover:bg-rose-600 text-white font-bold shadow-lg shadow-rose-200 text-xs transition-colors hover:scale-[1.02]">처리 확정</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Detail Modal */}
            {detailModal.open && createPortal(
                <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setDetailModal({ ...detailModal, open: false })}></div>
                    <div className="bg-white rounded-3xl w-full max-w-[500px] shadow-2xl relative overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="bg-slate-900 px-6 py-4 flex justify-between items-center">
                            <h3 className="text-white font-bold text-lg">주문 상세 정보</h3>
                            <button onClick={() => setDetailModal({ ...detailModal, open: false })} className="text-slate-400 hover:text-white"><span className="material-symbols-rounded">close</span></button>
                        </div>
                        <div className="p-6">
                            {detailModal.error ? (
                                <div className="py-10 text-center text-rose-500 font-bold">
                                    정보를 불러오는 중 오류가 발생했습니다.<br />
                                    <span className="text-xs text-rose-400 font-normal">{String(detailModal.error)}</span>
                                </div>
                            ) : detailModal.data ? (
                                <div className="space-y-6">
                                    <div className="flex justify-between items-end border-b border-slate-100 pb-4">
                                        <div>
                                            <div className="text-[10px] font-black text-slate-400 uppercase tracking-wide">주문번호</div>
                                            <div className="text-xl font-black text-slate-800 font-mono tracking-tight">{detailModal.data.sales_id}</div>
                                        </div>
                                        <div className="text-xs font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded-lg">주문일: {detailModal.data.order_date?.substring(0, 10)}</div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <div className="text-[10px] font-black text-slate-400 uppercase mb-2">상품 정보</div>
                                            <div className="font-bold text-slate-700">{detailModal.data.product_name}</div>
                                            <div className="text-xs text-slate-500 mt-1">{detailModal.data.specification || '-'} / {detailModal.data.quantity}개</div>
                                            <div className="text-sm font-black text-slate-500 mt-2">{formatCurrency(detailModal.data.unit_price)}원</div>
                                        </div>
                                        <div>
                                            <div className="text-[10px] font-black text-slate-400 uppercase mb-2">주문자 정보</div>
                                            <div className="font-bold text-slate-700">{detailModal.data.customer_name || '비회원'}</div>
                                            <div className="text-xs text-slate-500 mt-1">{detailModal.data.customer_id || '-'}</div>
                                        </div>
                                    </div>

                                    <div>
                                        <div className="text-[10px] font-black text-slate-400 uppercase mb-2 ml-1">배송 정보</div>
                                        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 text-xs text-slate-600">
                                            <div className="mb-1"><span className="font-bold mr-2">받는 분:</span> {detailModal.data.shipping_name || '-'}</div>
                                            <div className="mb-1"><span className="font-bold mr-2">연락처:</span> {detailModal.data.shipping_mobile_number || '-'}</div>
                                            <div><span className="font-bold mr-2">주소:</span> [{detailModal.data.shipping_zip_code || '-'}] {detailModal.data.shipping_address_primary} {detailModal.data.shipping_address_detail}</div>
                                        </div>
                                    </div>

                                    {detailModal.data.memo && (
                                        <div className="space-y-2">
                                            <div className="text-[10px] font-black text-slate-400 uppercase ml-1">주문 메모</div>
                                            <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100 text-xs text-amber-900 font-medium">
                                                {detailModal.data.memo}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="py-20 flex justify-center">
                                    <div className="w-8 h-8 border-4 border-slate-200 border-t-rose-500 rounded-full animate-spin"></div>
                                </div>
                            )}
                        </div>
                        {detailModal.data && (
                            <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end">
                                <button onClick={() => setDetailModal({ ...detailModal, open: false })} className="px-6 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-600 font-bold text-xs transition-colors">닫기</button>
                            </div>
                        )}
                    </div>
                </div>,
                document.body
            )}

            {/* Search Modal */}
            {searchModal.open && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setSearchModal({ ...searchModal, open: false })}></div>
                    <div className="bg-white rounded-3xl w-full max-w-[600px] shadow-2xl relative overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[85vh]">
                        <div className="p-6 border-b border-slate-100">
                            <h3 className="text-lg font-black text-slate-700 mb-4">클레임 대상 주문 검색</h3>
                            <div className="flex gap-2">
                                <div className="flex-1 relative">
                                    <span className="absolute left-3 top-3 text-slate-400 material-symbols-rounded">search</span>
                                    <input value={searchModal.query} onChange={e => setSearchModal({ ...searchModal, query: e.target.value })}
                                        onKeyDown={e => e.key === 'Enter' && handleSearch()}
                                        className="w-full h-12 pl-10 pr-4 rounded-xl bg-slate-50 border-none font-bold text-slate-600 focus:ring-2 focus:ring-rose-200"
                                        placeholder="주문자명, 전화번호, 주문번호 등 입력" autoFocus
                                    />
                                </div>
                                <button onClick={handleSearch} className="px-6 h-12 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold transition-colors">검색</button>
                            </div>
                        </div>

                        <div className="flex-1 overflow-auto p-0 bg-slate-50 relative">
                            {searchModal.loading && (
                                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-white/80 backdrop-blur-sm">
                                    <div className="w-10 h-10 border-4 border-slate-200 border-t-rose-500 rounded-full animate-spin mb-3"></div>
                                    <span className="text-rose-500 font-bold text-xs animate-pulse">검색 중...</span>
                                </div>
                            )}
                            <table className="w-full text-xs">
                                <thead className="bg-slate-100 sticky top-0 border-b border-slate-200">
                                    <tr>
                                        <th className="px-4 py-3 text-center font-bold text-slate-500">주문일</th>
                                        <th className="px-4 py-3 text-center font-bold text-slate-500">고객명</th>
                                        <th className="px-4 py-3 text-left font-bold text-slate-500">상품정보</th>
                                        <th className="px-4 py-3 w-16 text-center font-bold text-slate-500">선택</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 bg-white">
                                    {searchModal.results.map(s => (
                                        <tr key={s.sales_id} className="hover:bg-slate-50">
                                            <td className="px-4 py-3 text-center text-slate-400">{s.order_date?.substring(0, 10)}</td>
                                            <td className="px-4 py-3 text-center font-bold text-slate-700">{s.customer_name}</td>
                                            <td className="px-4 py-3 font-medium text-slate-600">{s.product_name}</td>
                                            <td className="px-4 py-3 text-center">
                                                <button onClick={() => openCreate(s)} className="px-3 py-1.5 rounded-lg bg-rose-50 text-rose-600 font-bold hover:bg-rose-100 transition-colors text-[10px]">선택</button>
                                            </td>
                                        </tr>
                                    ))}
                                    {!searchModal.loading && searchModal.results.length === 0 && (
                                        <tr><td colSpan="4" className="py-20 text-center text-slate-400 font-medium">검색 결과가 없습니다.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>

                        <div className="p-4 border-t border-slate-100 flex justify-end bg-white">
                            <button onClick={() => setSearchModal({ ...searchModal, open: false })} className="text-slate-400 font-bold hover:text-slate-600 transition-colors text-xs px-4 py-2">닫기</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Create Claim Modal */}
            {createModal.open && createModal.sale && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setCreateModal({ ...createModal, open: false })}></div>
                    <div className="bg-white rounded-3xl w-full max-w-[400px] shadow-2xl relative overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="bg-slate-900 px-6 py-4 flex justify-between items-center">
                            <h3 className="text-white font-bold text-lg">신규 클레임 접수</h3>
                            <button onClick={() => setCreateModal({ ...createModal, open: false })} className="text-slate-400 hover:text-white"><span className="material-symbols-rounded">close</span></button>
                        </div>

                        <div className="p-6">
                            <div className="bg-slate-50 p-3 rounded-xl mb-6 border border-slate-100">
                                <div className="text-xs text-slate-400 font-bold mb-1">대상 주문</div>
                                <div className="font-bold text-slate-700">{createModal.sale.customer_name}님 - {createModal.sale.product_name}</div>
                            </div>

                            <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-[10px] font-black text-slate-400 uppercase mb-1 block ml-1">유형</label>
                                        <select value={createModal.type} onChange={e => setCreateModal({ ...createModal, type: e.target.value })}
                                            className="w-full h-10 px-2 rounded-xl bg-slate-50 border-none font-bold text-xs text-slate-600 focus:ring-2 focus:ring-slate-200">
                                            {['접수', '주문접수', '입금대기', '입금확인'].includes(createModal.sale.status) ? (
                                                <option>취소</option>
                                            ) : (
                                                <>
                                                    <option>반품</option>
                                                    <option>교환</option>
                                                </>
                                            )}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-black text-slate-400 uppercase mb-1 block ml-1">사유</label>
                                        <select value={createModal.category} onChange={e => setCreateModal({ ...createModal, category: e.target.value })}
                                            className="w-full h-10 px-2 rounded-xl bg-slate-50 border-none font-bold text-xs text-slate-600 focus:ring-2 focus:ring-slate-200">
                                            <option>단순변심</option>
                                            <option>상품불량</option>
                                            <option>오배송</option>
                                            <option>기타</option>
                                        </select>
                                    </div>
                                </div>

                                <div>
                                    <label className="text-[10px] font-black text-slate-400 uppercase mb-1 block ml-1">수량</label>
                                    <input type="number" min="1" max={createModal.sale.quantity} value={createModal.qty}
                                        onChange={e => setCreateModal({ ...createModal, qty: e.target.value })}
                                        className="w-full h-10 px-3 rounded-xl bg-slate-50 border-none font-bold text-slate-600 focus:ring-2 focus:ring-slate-200" />
                                </div>

                                <div>
                                    <label className="text-[10px] font-black text-slate-400 uppercase mb-1 block ml-1">상세 메모</label>
                                    <textarea value={createModal.memo} onChange={e => setCreateModal({ ...createModal, memo: e.target.value })}
                                        className="w-full h-20 p-3 rounded-xl bg-slate-50 border-none text-xs font-medium text-slate-600 resize-none focus:ring-2 focus:ring-slate-200"
                                        placeholder="클레임 상세 사유를 입력하세요." />
                                </div>
                            </div>
                        </div>

                        <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-2">
                            <button onClick={() => setCreateModal({ ...createModal, open: false })} className="px-4 py-2 rounded-xl text-slate-500 font-bold hover:bg-slate-200 text-xs transition-colors">취소</button>
                            <button onClick={handleCreateSubmit} className="px-6 py-2 rounded-xl bg-slate-800 text-white font-bold hover:bg-slate-700 shadow-lg shadow-slate-300 text-xs transition-colors hover:scale-[1.02]">접수 등록</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Edit Modal */}
            {editModal.open && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setEditModal({ ...editModal, open: false })}></div>
                    <div className="bg-white rounded-3xl w-full max-w-[400px] shadow-2xl relative overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="bg-white px-6 py-4 flex justify-between items-center border-b border-slate-100">
                            <h3 className="text-slate-700 font-black text-lg">클레임 정보 수정</h3>
                            <button onClick={() => setEditModal({ ...editModal, open: false })} className="text-slate-300 hover:text-slate-500"><span className="material-symbols-rounded">close</span></button>
                        </div>

                        <div className="p-6 space-y-4">
                            <div>
                                <label className="text-[10px] font-black text-slate-400 uppercase mb-1 block ml-1">사유 분류</label>
                                <select value={editModal.category} onChange={e => setEditModal({ ...editModal, category: e.target.value })}
                                    className="w-full h-10 px-2 rounded-xl bg-slate-50 border-none font-bold text-xs text-slate-600 focus:ring-2 focus:ring-blue-100">
                                    <option>단순변심</option>
                                    <option>상품불량</option>
                                    <option>오배송</option>
                                    <option>기타</option>
                                </select>
                            </div>

                            <div>
                                <label className="text-[10px] font-black text-slate-400 uppercase mb-1 block ml-1">수량</label>
                                <input type="number" value={editModal.qty} onChange={e => setEditModal({ ...editModal, qty: e.target.value })}
                                    className="w-full h-10 px-3 rounded-xl bg-slate-50 border-none font-bold text-slate-600 focus:ring-2 focus:ring-blue-100" />
                            </div>

                            <div>
                                <label className="text-[10px] font-black text-slate-400 uppercase mb-1 block ml-1">상세 메모</label>
                                <textarea value={editModal.memo} onChange={e => setEditModal({ ...editModal, memo: e.target.value })}
                                    className="w-full h-24 p-3 rounded-xl bg-slate-50 border-none text-xs font-medium text-slate-600 resize-none focus:ring-2 focus:ring-blue-100" />
                            </div>
                        </div>

                        <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-2">
                            <button onClick={() => setEditModal({ ...editModal, open: false })} className="px-4 py-2 rounded-xl text-slate-500 font-bold hover:bg-slate-200 text-xs transition-colors">취소</button>
                            <button onClick={handleEditSubmit} className="px-6 py-2 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-500 shadow-lg shadow-blue-200 text-xs transition-colors hover:scale-[1.02]">수정사항 저장</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SalesClaims;

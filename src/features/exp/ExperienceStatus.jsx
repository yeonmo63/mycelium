import React, { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useModal } from '../../contexts/ModalContext';
import { formatPhoneNumber } from '../../utils/common';

const ExperienceStatus = () => {
    const { showAlert, showConfirm } = useModal();
    const [reservations, setReservations] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filters, setFilters] = useState({
        startDate: new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split('T')[0],
        endDate: new Date().toISOString().split('T')[0],
        keyword: ''
    });
    const [programs, setPrograms] = useState([]); // Programs for dropdown

    const [editingRes, setEditingRes] = useState(null);

    const loadPrograms = useCallback(async () => {
        try {
            const data = await invoke('get_experience_programs');
            setPrograms(data);
        } catch (err) {
            console.error('Failed to load programs:', err);
        }
    }, []);

    useEffect(() => {
        loadPrograms();
    }, [loadPrograms]);

    const loadReservations = useCallback(async () => {
        setLoading(true);
        try {
            const data = await invoke('get_experience_reservations', {
                startDate: filters.startDate || null,
                endDate: filters.endDate || null
            });

            const filtered = data.filter(r =>
                (r.guest_name || '').includes(filters.keyword) ||
                (r.guest_contact || '').includes(filters.keyword) ||
                (r.program_name || '').includes(filters.keyword)
            );

            setReservations(filtered);
            setSelectedIds([]); // Reset selection on reload
        } catch (err) {
            console.error('Load error:', err);
            showAlert('예약 내역을 불러오지 못했습니다.');
        } finally {
            setLoading(false);
        }
    }, [filters, showAlert]);

    // --- Selection & Batch Logic ---
    const [selectedIds, setSelectedIds] = useState([]);

    const handleSelectAll = (e) => {
        if (e.target.checked) {
            setSelectedIds(reservations.map(r => r.reservation_id));
        } else {
            setSelectedIds([]);
        }
    };

    const handleSelectRow = (id) => {
        setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    };

    const handleBatchAction = async (actionType) => {
        if (selectedIds.length === 0) return;

        let confirmMsg = '';
        let targetStatus = '';
        let isPayment = false;
        let isDelete = false;

        switch (actionType) {
            case 'status_confirmed':
                confirmMsg = `선택한 ${selectedIds.length}건을 [예약확정] 처리하시겠습니까?`;
                targetStatus = '예약완료';
                break;
            case 'payment_paid':
                confirmMsg = `선택한 ${selectedIds.length}건을 [결제완료] 처리하시겠습니까?`;
                isPayment = true;
                break;
            case 'status_completed':
                confirmMsg = `선택한 ${selectedIds.length}건을 [체험완료] 처리하시겠습니까?`;
                targetStatus = '체험완료';
                break;
            case 'status_canceled':
                confirmMsg = `선택한 ${selectedIds.length}건을 [예약취소] 처리하시겠습니까?`;
                targetStatus = '예약취소';
                break;
            case 'delete':
                confirmMsg = `선택한 ${selectedIds.length}건을 영구 삭제하시겠습니까?`;
                isDelete = true;
                break;
            default:
                return;
        }

        if (!await showConfirm('일괄 처리', confirmMsg)) return;

        try {
            for (const id of selectedIds) {
                if (isDelete) {
                    await invoke('delete_experience_reservation', { reservationId: id });
                } else if (isPayment) {
                    await invoke('update_experience_payment_status', { reservationId: id, paymentStatus: '결제완료' });
                } else {
                    await invoke('update_experience_status', { reservationId: id, status: targetStatus, appendMemo: null });
                }
            }
            showAlert('처리 완료', '요청하신 작업이 일괄 처리되었습니다.');
            setSelectedIds([]);
            loadReservations();
        } catch (err) {
            showAlert('일괄 처리 실패: ' + err);
        }
    };

    // --- Single Action Handlers (for Modal) ---
    const handleUpdateStatus = async (id, status) => {
        if (!id) return;

        // Validation Logic
        const target = reservations.find(r => r.reservation_id === id);
        if (!target) return;

        if (status === '예약취소') {
            if (target.status === '체험완료') {
                showAlert('요청 거부', `[${target.guest_name}]님은 이미 체험이 완료되어 예약을 취소할 수 없습니다.`);
                return;
            }
        }

        if (status === '체험완료') {
            if (target.payment_status !== '결제완료') {
                showAlert('요청 거부', `[${target.guest_name}]님은 결제가 완료되지 않아 체험 완료 처리할 수 없습니다.\n먼저 결제 처리를 진행해주세요.`);
                return;
            }
            if (target.status !== '예약완료') {
                showAlert('요청 거부', `[${target.guest_name}]님은 '예약완료' 상태가 아닙니다.\n예약 확정 후 진행해주세요.`);
                return;
            }
        }

        if (status === '예약완료' && target.status === '예약취소') {
            if (!await showConfirm('재확약', '취소된 예약을 다시 확정하시겠습니까?')) return;
        }

        try {
            await invoke('update_experience_status', { reservationId: id, status, appendMemo: null });
            showAlert('완료', `[${status}] 상태로 변경되었습니다.`);
            loadReservations();
            // If inside modal, editingRes might need update if we want to keep modal open, 
            // but usually we close modal or refresh data. 
            // The modal buttons call setEditingRes(null) anyway.
        } catch (err) {
            showAlert('오류', '상태 변경 실패: ' + err);
        }
    };

    const handleUpdatePayment = async (id, status) => {
        if (!id) return;
        try {
            await invoke('update_experience_payment_status', { reservationId: id, paymentStatus: status });
            showAlert('완료', `[${status}] 처리되었습니다.`);
            loadReservations();
        } catch (err) {
            showAlert('오류', '결제 변경 실패: ' + err);
        }
    };

    const handleDelete = async (id) => {
        // If id is passed (single delete), use it. otherwise check batch.
        // But the button calls handleDelete(id).
        let idsToDelete = [];
        if (id && typeof id === 'string') {
            idsToDelete = [id];
        } else if (selectedIds.length > 0) {
            idsToDelete = selectedIds;
        } else {
            return;
        }

        if (!await showConfirm('삭제 확인', `선택한 ${idsToDelete.length}건의 예약 정보를 삭제하시겠습니까?`)) return;

        try {
            for (const tid of idsToDelete) {
                await invoke('delete_experience_reservation', { reservationId: tid });
            }
            showAlert('삭제 완료', '삭제되었습니다.');
            setSelectedIds([]);
            loadReservations();
        } catch (err) {
            showAlert('오류', '삭제 실패: ' + err);
        }
    };
    const handleExportCSV = () => {
        if (reservations.length === 0) { showAlert('알림', '내보낼 데이터가 없습니다.'); return; }

        const headers = ['예약일자', '예약시간', '프로그램', '예약자명', '연락처', '참가인원', '금액', '상태', '결제상태', '비고'];
        const rows = reservations.map(r => [
            r.reservation_date,
            r.reservation_time,
            r.program_name,
            r.guest_name,
            r.guest_contact,
            r.participant_count,
            r.total_amount,
            r.status,
            r.payment_status,
            (r.memo || '').replace(/,/g, ' ')
        ]);

        const csvContent = "\uFEFF" + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `체험예약현황_${new Date().toISOString().slice(0, 10)}.csv`;
        link.click();
    };

    const handlePrint = () => {
        if (reservations.length === 0) { showAlert('알림', '출력할 데이터가 없습니다.'); return; }

        const title = `체험 예약 현황 (${filters.startDate} ~ ${filters.endDate})`;
        const html = `
            <html>
            <head>
                <title>${title}</title>
                <style>
                    @page { size: A4 landscape; margin: 15mm; }
                    body { font-family: 'Malgun Gothic', sans-serif; padding: 20px; }
                    .header { text-align: center; margin-bottom: 30px; }
                    .header h1 { margin: 0; font-size: 24px; }
                    .header p { margin: 5px 0 0; color: #666; font-size: 12px; }
                    table { width: 100%; border-collapse: collapse; font-size: 11px; }
                    th, td { border: 1px solid #ccc; padding: 6px; text-align: center; }
                    th { background: #f0f0f0; font-weight: bold; }
                    .text-left { text-align: left; }
                    .text-right { text-align: right; }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1>체험 예약 현황</h1>
                </div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 10px; font-size: 12px; color: #333;">
                    <span style="font-weight: bold;">조회 기간: ${filters.startDate} ~ ${filters.endDate}</span>
                    <span style="color: #888;">인쇄 일시: ${new Date().toLocaleString()}</span>
                </div>
                <table>
                    <thead>
                        <tr>
                            <th style="width: 40px;">No</th>
                            <th style="width: 80px;">일자</th>
                            <th style="width: 60px;">시간</th>
                            <th>프로그램명</th>
                            <th style="width: 80px;">예약자</th>
                            <th style="width: 100px;">연락처</th>
                            <th style="width: 50px;">인원</th>
                            <th style="width: 80px;">금액</th>
                            <th style="width: 60px;">상태</th>
                            <th style="width: 60px;">결제</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${reservations.map((r, idx) => `
                            <tr>
                                <td>${idx + 1}</td>
                                <td>${r.reservation_date}</td>
                                <td>${r.reservation_time}</td>
                                <td class="text-left">${r.program_name}</td>
                                <td>${r.guest_name}</td>
                                <td>${r.guest_contact}</td>
                                <td>${r.participant_count}</td>
                                <td class="text-right">${formatPrice(r.total_amount)}</td>
                                <td>${r.status}</td>
                                <td>${r.payment_status}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </body>
            </html>
        `;

        const iframe = document.createElement('iframe');
        iframe.style.position = 'absolute';
        iframe.style.width = '0px';
        iframe.style.height = '0px';
        iframe.style.border = 'none';
        document.body.appendChild(iframe);
        const doc = iframe.contentWindow.document;
        doc.open();
        doc.write(html);
        doc.close();
        iframe.contentWindow.focus();
        setTimeout(() => {
            iframe.contentWindow.print();
            setTimeout(() => document.body.removeChild(iframe), 1000);
        }, 500);
    };

    useEffect(() => {
        loadReservations();
    }, [loadReservations]);

    const handleFilterChange = (e) => {
        const { id, value } = e.target;
        setFilters(prev => ({ ...prev, [id]: value }));
    };



    const handleSaveEdit = async (e) => {
        e.preventDefault();
        try {
            await invoke('update_experience_reservation', {
                reservationId: editingRes.reservation_id,
                programId: parseInt(editingRes.program_id), // Ensure integer
                customerId: editingRes.customer_id,
                guestName: editingRes.guest_name,
                guestContact: editingRes.guest_contact,
                reservationDate: editingRes.reservation_date,
                reservationTime: editingRes.reservation_time.substring(0, 5),
                participantCount: parseInt(editingRes.participant_count),
                totalAmount: parseInt(editingRes.total_amount),
                status: editingRes.status,
                paymentStatus: editingRes.payment_status,
                memo: editingRes.memo
            });
            showAlert('예약 정보가 수정되었습니다.');
            setEditingRes(null);
            loadReservations();
        } catch (err) {
            showAlert('수정 실패: ' + err);
        }
    };

    const handleEditChange = (e) => {
        const { id, value } = e.target;
        setEditingRes(prev => {
            const next = { ...prev, [id]: value };

            // Auto-calc amount if program or count changes
            if (id === 'program_id' || id === 'participant_count') {
                const progId = id === 'program_id' ? parseInt(value) : parseInt(prev.program_id);
                const count = id === 'participant_count' ? parseInt(value) : parseInt(prev.participant_count);
                const prog = programs.find(p => p.program_id === progId);
                if (prog) {
                    next.total_amount = prog.price_per_person * (count || 0);
                    // Also update program name for display if program changed
                    if (id === 'program_id') next.program_name = prog.program_name;
                }
            }
            return next;
        });
    };



    const getStatusStyle = (status) => {
        switch (status) {
            case '예약완료': return 'bg-sky-50 text-sky-600 border-sky-200';
            case '체험완료': return 'bg-emerald-50 text-emerald-600 border-emerald-200';
            case '예약취소': return 'bg-rose-50 text-rose-600 border-rose-200';
            default: return 'bg-slate-50 text-slate-500 border-slate-200';
        }
    };

    const getPaymentStyle = (status) => {
        switch (status) {
            case '결제완료': return 'bg-indigo-50 text-indigo-600 border-indigo-200';
            case '환불완료': return 'bg-amber-50 text-amber-600 border-amber-200';
            default: return 'bg-slate-50 text-slate-500 border-slate-200';
        }
    };

    const formatPrice = (price) => new Intl.NumberFormat('ko-KR').format(price);

    return (
        <div className="flex flex-col h-full bg-[#f8fafc] overflow-hidden animate-in fade-in duration-700">
            {/* Top Navigation & Action Header */}
            <div className="px-6 lg:px-8 min-[2000px]:px-12 pt-6 lg:pt-8 min-[2000px]:pt-12 pb-1">
                <div className="flex justify-between items-end mb-4">
                    <div>
                        <div className="flex items-center gap-2 mb-0.5">
                            <span className="w-6 h-1 bg-amber-600 rounded-full"></span>
                            <span className="text-[9px] font-black tracking-[0.2em] text-amber-600 uppercase">Experience Tracking System</span>
                        </div>
                        <h1 className="text-3xl font-black text-slate-600 tracking-tighter" style={{ fontFamily: '"Noto Sans KR", sans-serif' }}>
                            체험 예약 현황 <span className="text-slate-300 font-light ml-1 text-xl">Inquiry</span>
                        </h1>
                    </div>
                    <div className="flex gap-2 pb-1">
                        <button onClick={handleExportCSV} className="h-10 px-5 bg-white text-slate-600 font-bold rounded-xl border border-slate-200 hover:border-indigo-500 hover:text-indigo-600 transition-all flex items-center gap-2 shadow-sm text-xs">
                            <span className="material-symbols-rounded text-lg">download</span> CSV 내보내기
                        </button>
                        <button onClick={handlePrint} className="h-10 px-5 bg-white text-slate-600 font-bold rounded-xl border border-slate-200 hover:border-indigo-500 hover:text-indigo-600 transition-all flex items-center gap-2 shadow-sm text-xs">
                            <span className="material-symbols-rounded text-lg">print</span> 명단 인쇄
                        </button>
                        <button onClick={loadReservations} className="h-10 px-5 bg-slate-900 text-white font-black rounded-xl hover:bg-slate-800 transition-all flex items-center gap-2 shadow-lg shadow-slate-200 text-xs">
                            <span className="material-symbols-rounded text-lg">refresh</span> 새로고침
                        </button>
                    </div>
                </div>

                {/* Filter Section Area - Full Width */}
                <div className="w-full mt-4">
                    <div className="bg-white p-4 lg:p-5 rounded-[1.5rem] shadow-sm border border-slate-200/60 transition-all hover:shadow-md w-full">
                        <div className="flex flex-col lg:flex-row gap-6 items-end w-full">
                            <div className="space-y-1.5 flex-shrink-0">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 block">조회 기간 설정</label>
                                <div className="flex items-center gap-1">
                                    <input
                                        type="date"
                                        id="startDate"
                                        value={filters.startDate}
                                        onChange={handleFilterChange}
                                        className="w-40 h-10 px-3 bg-slate-50 border border-slate-200 rounded-xl font-black text-xs text-slate-800 focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all"
                                    />
                                    <span className="text-slate-300 font-black">~</span>
                                    <input
                                        type="date"
                                        id="endDate"
                                        value={filters.endDate}
                                        onChange={handleFilterChange}
                                        className="w-40 h-10 px-3 bg-slate-50 border border-slate-200 rounded-xl font-black text-xs text-slate-800 focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all"
                                    />
                                </div>
                            </div>
                            <div className="flex-1 space-y-1.5 w-full flex gap-2 items-end">
                                <div className="flex-1 max-w-md">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 block">예약자 / 연락처 검색</label>
                                    <div className="relative group">
                                        {/* Removed Icon */}
                                        <input
                                            type="text"
                                            id="keyword"
                                            value={filters.keyword}
                                            onChange={handleFilterChange}
                                            placeholder="이름 또는 전화번호 뒷자리"
                                            className="w-full h-10 px-4 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all"
                                        />
                                    </div>
                                </div>
                                <button
                                    onClick={loadReservations}
                                    className="h-10 px-6 bg-amber-600 text-white font-black rounded-xl hover:bg-amber-500 transition-all flex items-center justify-center gap-2 shadow-lg shadow-amber-100 text-xs whitespace-nowrap"
                                >
                                    <span className="material-symbols-rounded text-lg">manage_search</span> 조회
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Content (Table) */}
            <div className="flex-1 overflow-hidden bg-slate-50 px-6 lg:px-8 min-[2000px]:px-12 pt-2 pb-6 lg:pb-8 flex flex-col gap-3">
                {/* Batch Action Bar - Smart Logic Implemented */}
                {selectedIds.length > 0 && (
                    <div className="bg-slate-800 text-white p-3 rounded-xl flex items-center justify-between shadow-lg animate-in slide-in-from-top-2 duration-300">
                        <div className="flex items-center gap-3 px-2">
                            <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center text-xs font-black">{selectedIds.length}</div>
                            <span className="text-sm font-bold">건의 항목이 선택되었습니다.</span>
                        </div>
                        <div className="flex items-center gap-2">
                            {/* Logic: Edit - Single Select ONLY, Not Completed */}
                            <button
                                onClick={() => {
                                    const target = reservations.find(r => r.reservation_id === selectedIds[0]);
                                    if (target) setEditingRes(target);
                                }}
                                disabled={selectedIds.length !== 1 || reservations.find(r => r.reservation_id === selectedIds[0])?.status === '체험완료'}
                                className="px-3 py-1.5 bg-indigo-50/80 hover:bg-indigo-100 text-indigo-600 disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed rounded-lg text-xs font-black transition-all flex items-center gap-1"
                            >
                                <span className="material-symbols-rounded text-sm">edit</span> 정보 수정
                            </button>
                            <div className="w-px h-4 bg-white/20 mx-1"></div>

                            {/* Logic: Can switch to 'Confirmed' if not already confirmed/completed/canceled */}
                            <button
                                onClick={() => handleBatchAction('status_confirmed')}
                                disabled={reservations.filter(r => selectedIds.includes(r.reservation_id)).some(r => r.status !== '예약대기')}
                                className="px-3 py-1.5 bg-sky-500/80 hover:bg-sky-500 disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed rounded-lg text-xs font-black transition-all"
                            >
                                예약확정
                            </button>

                            {/* Logic: Can pay if not paid yet. Ignore status for flexibility, or require confirmed? Let's allow paying anytime except canceled */}
                            <button
                                onClick={() => handleBatchAction('payment_paid')}
                                disabled={reservations.filter(r => selectedIds.includes(r.reservation_id)).every(r => r.payment_status === '결제완료')}
                                className="px-3 py-1.5 bg-indigo-500/80 hover:bg-indigo-500 disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed rounded-lg text-xs font-black transition-all"
                            >
                                결제완료 처리
                            </button>

                            {/* Logic: Complete requires 'Confirmed' AND 'Paid'. If any selected item is NOT qualified, disable. */}
                            <button
                                onClick={() => handleBatchAction('status_completed')}
                                disabled={reservations.filter(r => selectedIds.includes(r.reservation_id)).some(r => r.status !== '예약완료' || r.payment_status !== '결제완료')}
                                className="px-3 py-1.5 bg-emerald-500/80 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed rounded-lg text-xs font-black transition-all"
                            >
                                체험완료 처리
                            </button>

                            {/* Logic: Cancel allowed unless already completed */}
                            <button
                                onClick={() => handleBatchAction('status_canceled')}
                                disabled={reservations.filter(r => selectedIds.includes(r.reservation_id)).some(r => r.status === '체험완료')}
                                className="px-3 py-1.5 bg-rose-500/80 hover:bg-rose-500 disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed rounded-lg text-xs font-black transition-all"
                            >
                                예약취소 처리
                            </button>

                            <div className="w-px h-4 bg-white/20 mx-1"></div>
                            <button onClick={() => handleBatchAction('delete')} className="px-3 py-1.5 bg-slate-600 hover:bg-slate-500 rounded-lg text-xs font-black transition-all">선택 삭제</button>
                        </div>
                    </div>
                )}

                <div className="flex-1 bg-white rounded-[1.5rem] shadow-xl border border-slate-200 overflow-hidden flex flex-col relative">
                    <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-amber-500 to-orange-500"></div>
                    <div className="overflow-auto flex-1 custom-gray-scrollbar">
                        <table className="w-full text-left border-collapse">
                            <thead className="sticky top-0 bg-white/95 backdrop-blur-md z-10 border-b border-slate-100">
                                <tr className="bg-slate-50/50">
                                    <th className="px-6 py-4 w-[50px] text-center">
                                        <input type="checkbox" onChange={handleSelectAll} checked={reservations.length > 0 && selectedIds.length === reservations.length} className="w-4 h-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500 cursor-pointer" />
                                    </th>
                                    <th className="px-2 py-4 w-[120px] text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">예약 일시</th>
                                    <th className="px-6 py-4 w-auto text-[10px] font-black text-slate-400 uppercase tracking-widest text-left">프로그램</th>
                                    <th className="px-6 py-4 w-[15%] text-[10px] font-black text-slate-400 uppercase tracking-widest text-left">예약자 / 연락처</th>
                                    <th className="px-6 py-4 w-[12%] text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">금액 (인원)</th>
                                    <th className="px-6 py-4 w-[100px] text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">예약 상태</th>
                                    <th className="px-6 py-4 w-[100px] text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">결제 상태</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {loading ? (
                                    <tr>
                                        <td colSpan="7" className="px-6 py-24 text-center">
                                            <div className="flex flex-col items-center gap-4">
                                                <div className="w-10 h-10 border-4 border-amber-500/20 border-t-amber-500 rounded-full animate-spin"></div>
                                                <p className="text-slate-300 font-black italic text-sm">데이터를 불러오는 중입니다...</p>
                                            </div>
                                        </td>
                                    </tr>
                                ) : reservations.length === 0 ? (
                                    <tr>
                                        <td colSpan="7" className="px-6 py-24 text-center">
                                            <div className="flex flex-col items-center gap-2">
                                                <span className="material-symbols-rounded text-slate-200 text-5xl">folder_off</span>
                                                <p className="text-slate-300 font-black italic text-sm">조회된 예약 내역이 없습니다.</p>
                                            </div>
                                        </td>
                                    </tr>
                                ) : (
                                    reservations.map(r => (
                                        <tr key={r.reservation_id} className={`group hover:bg-slate-50/80 transition-all ${selectedIds.includes(r.reservation_id) ? 'bg-amber-50/30' : ''}`}>
                                            <td className="px-6 py-4 text-center">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedIds.includes(r.reservation_id)}
                                                    onChange={() => handleSelectRow(r.reservation_id)}
                                                    className="w-4 h-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500 cursor-pointer"
                                                />
                                            </td>
                                            <td className="px-2 py-4">
                                                <div className="flex items-center gap-2 font-black text-slate-800 text-sm whitespace-nowrap">
                                                    {r.reservation_date}
                                                    <span className="bg-slate-100 text-slate-500 font-bold px-1.5 py-0.5 rounded text-[10px]">{r.reservation_time}</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className="font-black text-indigo-700 bg-indigo-50 px-2 py-1 rounded-lg text-xs border border-indigo-100/50">{r.program_name}</span>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="font-black text-slate-800 text-sm">{r.guest_name}</div>
                                                <div className="text-[11px] font-black text-slate-400 mt-0.5">{formatPhoneNumber(r.guest_contact)}</div>
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <div className="text-sm font-black text-slate-800">\{formatPrice(r.total_amount)}</div>
                                                <div className="text-[10px] font-bold text-slate-400">{r.participant_count}명</div>
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <span className={`text-[10px] font-black px-2.5 py-1.5 rounded-full border shadow-sm inline-block min-w-[60px] text-center ${getStatusStyle(r.status)}`}>
                                                    {r.status}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <span className={`text-[10px] font-black px-2.5 py-1.5 rounded-full border shadow-sm inline-block min-w-[60px] text-center ${getPaymentStyle(r.payment_status)}`}>
                                                    {r.payment_status}
                                                </span>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Bottom Controls Area - Width Fix (Removed redundant padding) */}
                <div className="w-full">
                    {/* Process Flow Indicator */}
                    <div className="flex items-center gap-4 mb-5 px-2 overflow-x-auto">
                        <span className="text-sm font-black text-slate-400 mr-2 flex-shrink-0">처리 흐름도 :</span>
                        <div className="flex items-center gap-2 opacity-60 grayscale">
                            <span className="w-9 h-9 rounded-full bg-slate-200 text-slate-600 font-black flex items-center justify-center text-sm shadow-sm">1</span>
                            <span className="text-sm font-black text-slate-600">예약 접수(대기)</span>
                        </div>
                        <span className="material-symbols-rounded text-slate-300">arrow_forward</span>
                        <div className="flex items-center gap-2">
                            <span className="w-9 h-9 rounded-full bg-sky-100 text-sky-600 font-black flex items-center justify-center text-sm shadow-sm border border-sky-200">2</span>
                            <span className="text-sm font-black text-sky-700">예약 확정</span>
                        </div>
                        <span className="material-symbols-rounded text-slate-300">arrow_forward</span>
                        <div className="flex items-center gap-2">
                            <span className="w-9 h-9 rounded-full bg-indigo-100 text-indigo-600 font-black flex items-center justify-center text-sm shadow-sm border border-indigo-200">3</span>
                            <span className="text-sm font-black text-indigo-700">결제 완료</span>
                        </div>
                        <span className="material-symbols-rounded text-slate-300">arrow_forward</span>
                        <div className="flex items-center gap-2">
                            <span className="w-9 h-9 rounded-full bg-emerald-100 text-emerald-600 font-black flex items-center justify-center text-sm shadow-sm border border-emerald-200">4</span>
                            <span className="text-sm font-black text-emerald-700">체험 완료</span>
                        </div>

                        {/* Usage Tip Box */}
                        <div className="ml-auto flex items-center gap-2 bg-slate-100 border border-slate-200 text-slate-500 px-4 py-2 rounded-xl text-xs font-black shadow-sm">
                            <span className="material-symbols-rounded text-base text-amber-500">lightbulb</span>
                            <span>리스트의 <span className="text-slate-700">체크박스를 선택</span>하면 상단에 <span className="text-indigo-600">일괄 작업 도구</span>가 나타납니다.</span>
                        </div>
                    </div>

                    {/* Total Aggregate Summary */}
                    <div className="flex items-center bg-slate-100 p-6 rounded-[1.5rem] shadow-md border border-slate-300 w-full">
                        <div className="flex gap-10 px-4 w-full justify-around">
                            <div className="flex flex-col items-center">
                                <span className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-1">총 예약 건수</span>
                                <span className="text-2xl font-black text-slate-700">{reservations.length} <span className="text-base text-slate-400 font-bold">건</span></span>
                            </div>
                            <div className="w-px h-12 bg-slate-200"></div>
                            <div className="flex flex-col items-center">
                                <span className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-1">예약 총 인원</span>
                                <span className="text-2xl font-black text-indigo-600">{reservations.reduce((sum, r) => sum + (r.participant_count || 0), 0)} <span className="text-base text-indigo-300 font-bold">명</span></span>
                            </div>
                            <div className="w-px h-12 bg-slate-200"></div>
                            <div className="flex flex-col items-center">
                                <span className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-1">예상 매출액</span>
                                <span className="text-2xl font-black text-slate-700">\{formatPrice(reservations.reduce((sum, r) => sum + (r.total_amount || 0), 0))}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            {/* Edit Modal Overlay */}
            {editingRes && (

                <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setEditingRes(null)}></div>
                    <div className="relative bg-white w-full max-w-xl rounded-[2rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                            <h3 className="font-black text-lg text-slate-800 flex items-center gap-2">
                                <span className="material-symbols-rounded text-indigo-500">edit_square</span>
                                예약 정보 수정
                            </h3>
                            <button onClick={() => setEditingRes(null)} className="w-8 h-8 flex items-center justify-center text-slate-400 hover:bg-slate-200 rounded-full transition-all">
                                <span className="material-symbols-rounded">close</span>
                            </button>
                        </div>
                        <div className="p-8">
                            <form onSubmit={handleSaveEdit}>
                                <div className="grid grid-cols-2 gap-6">
                                    <div className="space-y-4">
                                        <h4 className="font-bold text-slate-400 text-xs uppercase tracking-wider border-b border-slate-100 pb-2 mb-4">예약 프로그램 정보</h4>

                                        <div>
                                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">프로그램 선택</label>
                                            <select
                                                id="program_id"
                                                value={editingRes.program_id}
                                                onChange={handleEditChange}
                                                className="w-full h-10 px-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm outline-none focus:border-indigo-500"
                                            >
                                                {programs.map(p => (
                                                    <option key={p.program_id} value={p.program_id}>{p.program_name} ({formatPrice(p.price_per_person)}원)</option>
                                                ))}
                                            </select>
                                        </div>

                                        <div className="grid grid-cols-2 gap-3">
                                            <div>
                                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">예약 날짜</label>
                                                <input type="date" id="reservation_date" value={editingRes.reservation_date} onChange={handleEditChange} className="w-full h-10 px-3 bg-white border border-slate-200 rounded-xl font-bold text-sm outline-none focus:border-indigo-500" />
                                            </div>
                                            <div>
                                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">예약 시간</label>
                                                <input type="time" id="reservation_time" value={editingRes.reservation_time} onChange={handleEditChange} className="w-full h-10 px-3 bg-white border border-slate-200 rounded-xl font-bold text-sm outline-none focus:border-indigo-500" />
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-3">
                                            <div>
                                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">참가 인원</label>
                                                <input type="number" id="participant_count" value={editingRes.participant_count} onChange={handleEditChange} className="w-full h-10 px-3 bg-white border border-slate-200 rounded-xl font-bold text-sm text-right outline-none focus:border-indigo-500" />
                                            </div>
                                            <div>
                                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">총 결제금액</label>
                                                <input type="text" value={formatPrice(editingRes.total_amount)} disabled className="w-full h-10 px-3 bg-indigo-50 border border-indigo-100 rounded-xl font-black text-sm text-right text-indigo-700" />
                                            </div>
                                        </div>
                                    </div>

                                    <div className="space-y-4">
                                        <h4 className="font-bold text-slate-400 text-xs uppercase tracking-wider border-b border-slate-100 pb-2 mb-4">고객 및 상태 관리</h4>

                                        <div>
                                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">예약자 성함</label>
                                            <input type="text" id="guest_name" value={editingRes.guest_name} onChange={handleEditChange} className="w-full h-10 px-3 bg-white border border-slate-200 rounded-xl font-bold text-sm outline-none focus:border-indigo-500" />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">연락처</label>
                                            <input type="text" id="guest_contact" value={editingRes.guest_contact} onChange={handleEditChange} className="w-full h-10 px-3 bg-white border border-slate-200 rounded-xl font-bold text-sm outline-none focus:border-indigo-500" />
                                        </div>

                                        <div className="grid grid-cols-2 gap-3">
                                            <div>
                                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">예약 상태</label>
                                                <select id="status" value={editingRes.status} onChange={handleEditChange} className="w-full h-10 px-3 bg-white border border-slate-200 rounded-xl font-bold text-xs outline-none focus:border-indigo-500">
                                                    <option value="예약대기">예약대기</option>
                                                    <option value="예약완료">예약완료</option>
                                                    <option value="체험완료">체험완료</option>
                                                    <option value="예약취소">예약취소</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">결제 상태</label>
                                                <select id="payment_status" value={editingRes.payment_status} onChange={handleEditChange} className="w-full h-10 px-3 bg-white border border-slate-200 rounded-xl font-bold text-xs outline-none focus:border-indigo-500">
                                                    <option value="미결제">미결제</option>
                                                    <option value="결제완료">결제완료</option>
                                                    <option value="일부결제">일부결제</option>
                                                    <option value="환불완료">환불완료</option>
                                                </select>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="mt-4">
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">비고 / 특이사항</label>
                                    <textarea id="memo" rows="3" value={editingRes.memo || ''} onChange={handleEditChange} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs outline-none focus:border-indigo-500 resize-none"></textarea>
                                </div>

                                <div className="mt-8 pt-6 border-t border-slate-100 overflow-x-auto pb-2">
                                    <h4 className="font-bold text-slate-400 text-xs uppercase tracking-wider mb-3">빠른 상태 처리 (Quick Action)</h4>
                                    <div className="flex gap-2">
                                        {/* 1. Edit (This is the modal itself, so save is the edit action) */}
                                        {/* 2. Confirm: Show only if not cancelled and not completed */}
                                        {editingRes.status !== '예약취소' && editingRes.status !== '체험완료' && editingRes.status !== '예약완료' && (
                                            <button type="button" onClick={() => { handleUpdateStatus(editingRes.reservation_id, '예약완료'); setEditingRes(null); }} className="h-10 px-4 bg-sky-50 text-sky-600 font-bold rounded-lg hover:bg-sky-100 transition-all text-xs whitespace-nowrap flex items-center gap-1">
                                                <span className="material-symbols-rounded text-base">check_circle</span> 예약 확정
                                            </button>
                                        )}

                                        {/* 3. Payment: Show only if unpaid */}
                                        {editingRes.payment_status !== '결제완료' && editingRes.status !== '예약취소' && (
                                            <button type="button" onClick={() => { handleUpdatePayment(editingRes.reservation_id, '결제완료'); setEditingRes(null); }} className="h-10 px-4 bg-indigo-50 text-indigo-600 font-bold rounded-lg hover:bg-indigo-100 transition-all text-xs whitespace-nowrap flex items-center gap-1">
                                                <span className="material-symbols-rounded text-base">credit_card</span> 결제 완료 처리
                                            </button>
                                        )}

                                        {/* 4. Cancel: Show if not completed and not cancelled */}
                                        {editingRes.status !== '체험완료' && editingRes.status !== '예약취소' && (
                                            <button type="button" onClick={() => { handleUpdateStatus(editingRes.reservation_id, '예약취소'); setEditingRes(null); }} className="h-10 px-4 bg-orange-50 text-orange-600 font-bold rounded-lg hover:bg-orange-100 transition-all text-xs whitespace-nowrap flex items-center gap-1">
                                                <span className="material-symbols-rounded text-base">cancel</span> 예약 취소
                                            </button>
                                        )}

                                        {/* 5. Delete: Always show */}
                                        <button type="button" onClick={() => { handleDelete(editingRes.reservation_id); setEditingRes(null); }} className="h-10 px-4 bg-rose-50 text-rose-600 font-bold rounded-lg hover:bg-rose-100 transition-all text-xs whitespace-nowrap flex items-center gap-1">
                                            <span className="material-symbols-rounded text-base">delete</span> 예약 삭제
                                        </button>

                                        {/* 6. Complete: Show only if confirmed AND paid */}
                                        {editingRes.status === '예약완료' && editingRes.payment_status === '결제완료' && (
                                            <button type="button" onClick={() => { handleUpdateStatus(editingRes.reservation_id, '체험완료'); setEditingRes(null); }} className="h-10 px-4 bg-emerald-50 text-emerald-600 font-bold rounded-lg hover:bg-emerald-100 transition-all text-xs whitespace-nowrap flex items-center gap-1">
                                                <span className="material-symbols-rounded text-base">task_alt</span> 체험 완료 처리
                                            </button>
                                        )}
                                    </div>
                                </div>

                                <div className="mt-8 flex justify-end gap-3 pt-6 border-t border-slate-100">
                                    <button
                                        type="button"
                                        onClick={() => setEditingRes(null)}
                                        className="px-6 py-3 bg-white text-slate-500 font-black rounded-xl border border-slate-200 hover:bg-slate-50 transition-all text-sm"
                                    >
                                        닫기
                                    </button>
                                    <button
                                        type="submit"
                                        className="px-10 py-3 bg-indigo-600 text-white font-black rounded-xl hover:bg-indigo-500 transition-all shadow-lg text-sm flex items-center gap-2"
                                    >
                                        <span className="material-symbols-rounded">save</span>
                                        설정 내용 저장 (수정)
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}
        </div >
    );
};

export default ExperienceStatus;

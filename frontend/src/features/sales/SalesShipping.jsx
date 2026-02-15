import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { formatCurrency, formatPhoneNumber } from '../../utils/common';
import { handlePrintRaw } from '../../utils/printUtils';
import { useModal } from '../../contexts/ModalContext';
import { callBridge } from '../../utils/apiBridge';

const shippingPrintStyles = `
    @media print {
        @page { size: A4 landscape; margin: 0; }
        html, body { 
            background: white !important; 
            color: black !important;
            color-scheme: light !important;
            margin: 0 !important;
            padding: 0 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
        }
        #printable-shipping-report {
            display: block !important;
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            padding: 10mm !important;
            visibility: visible !important;
            background: white !important;
        }
        #printable-shipping-report * {
            visibility: visible !important;
            border-color: black !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
        }
    }
    .print-report-wrapper { 
        font-family: 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif; 
        color: #000; 
        width: 100%;
    }
    .report-card {
        border: 2px solid #000 !important;
        padding: 30px;
        background: white !important;
    }
    .report-header h1 { 
        margin: 0; 
        font-size: 32px; 
        font-weight: 900; 
        letter-spacing: 0.3em; 
        border-bottom: 5px double #000 !important;
        display: inline-block;
        padding: 0 50px 10px 50px;
    }
    table { 
        width: 100%; 
        border-collapse: collapse !important; 
        font-size: 10px; 
        border: 2px solid #000 !important; 
        table-layout: fixed;
    }
    th, td { 
        border: 1px solid #000 !important; 
        padding: 6px 4px; 
        text-align: center; 
    }
    th { 
        background: #f0f0f0 !important; 
        font-weight: 900; 
        border-bottom: 2px solid #000 !important;
    }
    .bg-row { background: #fafafa !important; }
    .summary-table {
        width: 400px;
        border: 2px solid #000 !important;
    }
    .summary-table th, .summary-table td { border: 1px solid #000 !important; }
`;

/**
 * SalesShipping.jsx
 * 배송/발송 관리 화면 - SalesReception과 동일한 Premium UI 스타일 적용
 */
const SalesShipping = () => {
    const { showAlert, showConfirm } = useModal();
    // --- State ---
    const [statusFilter, setStatusFilter] = useState('전체');
    const [dateRange, setDateRange] = useState({
        start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 1 week ago
        end: new Date().toISOString().split('T')[0]
    });
    const [searchTerm, setSearchTerm] = useState('');
    const [shipments, setShipments] = useState([]);
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [showGuide, setShowGuide] = useState(false);

    // UI Interaction State
    const [isLoading, setIsLoading] = useState(false);
    const [showShippingModal, setShowShippingModal] = useState(false);
    const [printModalOpen, setPrintModalOpen] = useState(false);
    const [shippingItems, setShippingItems] = useState([]);
    const [shippingForm, setShippingForm] = useState({
        date: new Date().toISOString().split('T')[0],
        carrier: 'CJ대한통운',
        trackingMap: {}
    });

    // --- Data Loading ---
    const loadData = useCallback(async () => {
        setIsLoading(true);
        try {
            // 조회할 상태 목록
            const statuses = ['접수', '입금대기', '부분입금', '입금완료', '배송준비', '배송중', '배송완료'];
            let combined = [];

            // 모든 상태에 대해 병렬 호출 또는 순차 호출
            for (const s of statuses) {
                const data = await callBridge('get_shipments_by_status', {
                    status: s,
                    search: searchTerm,
                    startDate: dateRange.start,
                    endDate: dateRange.end
                });

                const rows = Array.isArray(data) ? data : [];
                combined = combined.concat(rows.map(item => ({ ...item, current_status: s })));
            }

            // 최신순 정렬
            combined.sort((a, b) => new Date(b.order_date) - new Date(a.order_date));
            setShipments(combined);
        } catch (e) {
            console.error("Load Error:", e);
            // showAlert('오류', '데이터를 불러오는 중 문제가 발생했습니다.');
        } finally {
            setIsLoading(false);
        }
    }, [dateRange, searchTerm]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    // --- Computed Data ---
    const filteredData = useMemo(() => {
        if (statusFilter === '전체') return shipments;
        return shipments.filter(s => s.current_status === statusFilter);
    }, [shipments, statusFilter]);

    const stats = useMemo(() => ({
        all: shipments.length,
        receipt: shipments.filter(s => s.current_status === '접수').length,
        pending: shipments.filter(s => s.current_status === '입금대기').length,
        paid: shipments.filter(s => ['입금완료', '배송준비'].includes(s.current_status)).length,
        shipping: shipments.filter(s => s.current_status === '배송중').length,
        completed: shipments.filter(s => s.current_status === '배송완료').length
    }), [shipments]);

    // --- Handlers ---
    const handleToggleSelect = (id) => {
        const newSet = new Set(selectedIds);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        setSelectedIds(newSet);
    };

    const handleSelectAll = (checked) => {
        if (checked) {
            // 배송완료가 아닌 항목만 선택
            const selectableIds = new Set(filteredData.filter(d => d.current_status !== '배송완료').map(d => d.sales_id));
            setSelectedIds(selectableIds);
        } else {
            setSelectedIds(new Set());
        }
    };

    const handleAction = async (actionType) => {
        const targets = shipments.filter(s => selectedIds.has(s.sales_id));
        if (targets.length === 0) { showAlert('알림', '선택된 항목이 없습니다.'); return; }

        if (actionType === 'set_pending') {
            if (await showConfirm('입금 대기 전환', `선택한 ${targets.length}건을 '입금대기' 상태로 변경하시겠습니까?`)) {
                try {
                    for (const item of targets) {
                        await callBridge('update_sale_status', { salesId: String(item.sales_id), status: '입금대기' });
                    }
                    showAlert('성공', '처리되었습니다.');
                    loadData();
                    setSelectedIds(new Set());
                } catch (e) { showAlert('오류', `처리 중 오류: ${e}`); }
            }
        } else if (actionType === 'confirm_payment') {
            if (await showConfirm('입금 확인', `선택한 ${targets.length}건을 '입금완료' 처리하시겠습니까?`)) {
                try {
                    for (const item of targets) {
                        await callBridge('update_sale_status', { salesId: String(item.sales_id), status: '입금완료' });
                    }
                    showAlert('성공', '처리되었습니다.');
                    loadData();
                    setSelectedIds(new Set());
                } catch (e) { showAlert('오류', `처리 중 오류: ${e}`); }
            }
        } else if (actionType === 'shipping_process') {
            // Check for unconfirmed payments
            const unconfirmedItems = targets.filter(t => ['접수', '입금대기', '부분입금'].includes(t.current_status));

            const proceedToShipping = () => {
                setShippingItems(targets);
                setShippingForm(prev => ({
                    ...prev,
                    trackingMap: targets.reduce((acc, curr) => ({ ...acc, [curr.sales_id]: '' }), {})
                }));
                setShowShippingModal(true);
            };

            if (unconfirmedItems.length > 0) {
                if (await showConfirm(
                    '결제 미완료 건 포함',
                    `선택하신 항목 중 ${unconfirmedItems.length}건이 아직 입금 확인되지 않은 상태('접수', '입금대기')입니다.\n\n배송 처리 시 해당 금액은 고객의 '미수금'으로 기록됩니다.\n그래도 배송 처리를 진행하시겠습니까?`
                )) {
                    proceedToShipping();
                }
            } else {
                proceedToShipping();
            }

        } else if (actionType === 'delete') {
            if (await showConfirm('삭제', `선택한 ${targets.length}건을 정말 삭제하시겠습니까?`)) {
                // TODO: 삭제 API 구현 필요
                showAlert('알림', '삭제 기능은 아직 구현되지 않았습니다.');
            }
        } else if (actionType === 'complete_delivery') {
            if (await showConfirm('배송 완료 확정', `선택한 ${targets.length}건을 '배송완료' 처리하시겠습니까?\n고객이 상품을 수령한 경우에만 처리해주세요.`)) {
                try {
                    for (const item of targets) {
                        await callBridge('update_sale_status', { salesId: String(item.sales_id), status: '배송완료' });
                    }
                    showAlert('성공', '배송 완료 처리되었습니다.');
                    loadData();
                    setSelectedIds(new Set());
                } catch (e) { showAlert('오류', `처리 중 오류: ${e}`); }
            }
        }
    };

    const submitShipping = async () => {
        try {
            for (const item of shippingItems) {
                const tracking = shippingForm.trackingMap[item.sales_id];
                // carrier가 있으면 택배로 간주
                await callBridge('complete_shipment', {
                    salesId: String(item.sales_id),
                    carrier: shippingForm.carrier,
                    trackingNumber: tracking || null,
                    shippingDate: shippingForm.date,
                    memo: item.memo // 기존 메모 유지
                });
            }
            setShowShippingModal(false);
            showAlert('성공', '배송 처리가 완료되었습니다.');
            loadData();
            setSelectedIds(new Set());
        } catch (e) {
            showAlert('오류', `배송 처리 실패: ${e}`);
        }
    };

    const handleTrackingChange = (id, value) => {
        setShippingForm(prev => ({
            ...prev,
            trackingMap: { ...prev.trackingMap, [id]: value }
        }));
    };

    const handleExportCSV = async () => {
        if (filteredData.length === 0) {
            showAlert('알림', '내보낼 데이터가 없습니다.');
            return;
        }

        const headers = ['주문일자', '상태', '고객명', '연락처', '상품명', '규격', '수량', '주문금액', '택배사', '운송장번호', '메모'];
        const csvContent = [
            headers.join(','),
            ...filteredData.map(row => [
                row.order_date.substring(0, 10),
                row.current_status,
                `"${row.customer_name}"`,
                `"${row.mobile_number}"`,
                `"${row.product_name}"`,
                `"${row.specification}"`,
                row.quantity,
                row.total_amount,
                `"${row.courier_name || ''}"`,
                `"${row.tracking_number || ''}"`,
                `"${row.memo || ''}"`
            ].join(','))
        ].join('\n');

        try {
            // Try Tauri Native Dialog
            if (window.__TAURI__) {
                const filePath = await window.__TAURI__.dialog.save({
                    filters: [{ name: 'CSV', extensions: ['csv'] }],
                    defaultPath: `배송목록_${new Date().toISOString().slice(0, 10)}.csv`
                });

                if (filePath) {
                    await window.__TAURI__.fs.writeTextFile(filePath, '\uFEFF' + csvContent);
                    showAlert('성공', '파일이 저장되었습니다.');
                }
            } else {
                throw new Error("Web Environment: Using browser download");
            }
        } catch (err) {
            console.warn("Native save failed, using fallback:", err);
            // Fallback to browser download
            const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `배송목록_${new Date().toISOString().slice(0, 10)}.csv`;
            link.click();
        }
    };

    const handlePrint = () => {
        const el = document.getElementById('printable-shipping-content');
        if (!el) return;

        const html = `
            <style>
                ${shippingPrintStyles}
                @page { size: A4 landscape; margin: 10mm; }
                body { font-family: 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif; margin: 0; padding: 10mm; }
            </style>
            ${el.outerHTML}
        `;
        handlePrintRaw(html);
    };

    const handleTrackingClick = async (e, row) => {
        e.stopPropagation();
        if (!row.tracking_number) return;

        let url = '';
        const num = row.tracking_number.replace(/[^0-9]/g, '');
        const carrier = row.courier_name || '';

        if (carrier.includes('CJ') || carrier.includes('대한통운')) {
            url = `https://www.cjlogistics.com/ko/tool/parcel/tracking?gnrlCode=${num}`;
        } else if (carrier.includes('우체국')) {
            url = `https://service.epost.go.kr/trace.RetrieveDomRgiTraceList.comm?sid1=${num}`;
        } else if (carrier.includes('롯데')) {
            url = `https://www.lotteglogis.com/home/reservation/tracking/index?InvNo=${num}`;
        } else if (carrier.includes('한진')) {
            url = `https://www.hanjin.com/kor/CMS/DeliveryMgr/WaybillResult.do?mCode=MN038&wblNum=${num}`;
        } else if (carrier.includes('로젠')) {
            url = `https://www.ilogen.com/web/personal/trace/${num}`;
        } else {
            // Fallback to Naver Search or Google
            url = `https://search.naver.com/search.naver?query=${num}`;
        }

        if (url) {
            try {
                if (window.__TAURI__) {
                    await window.__TAURI__.core.invoke('open_external_url', { url });
                } else {
                    window.open(url, '_blank', 'noopener,noreferrer');
                }
            } catch (err) {
                console.error("Failed to open URL", err);
            }
        }
    };

    // --- Render Helpers ---
    const StatusBadge = ({ status }) => {
        const styles = {
            '접수': 'bg-slate-100 text-slate-600 border-slate-200',
            '입금대기': 'bg-rose-50 text-rose-600 border-rose-100',
            '부분입금': 'bg-amber-50 text-amber-600 border-amber-100',
            '입금완료': 'bg-indigo-50 text-indigo-600 border-indigo-100',
            '배송준비': 'bg-blue-50 text-blue-600 border-blue-100',
            '배송중': 'bg-purple-50 text-purple-600 border-purple-100',
            '배송완료': 'bg-emerald-50 text-emerald-600 border-emerald-100'
        };
        const style = styles[status] || styles['접수'];
        return <span className={`px-2 py-0.5 rounded text-[10px] font-black border ${style}`}>{status}</span>;
    };

    return (
        <div id="print-root" className="flex flex-col h-full bg-[#f8fafc] overflow-hidden animate-in fade-in duration-700 relative">
            {/* Print Only Header removed - handled by handlePrintRaw template */}

            {/* Header Area (Screen Only) */}
            <div className="px-6 lg:px-8 min-[2000px]:px-12 pt-6 lg:pt-8 min-[2000px]:pt-12 pb-1 no-print">
                <div className="flex justify-between items-end mb-4">
                    <div>
                        <div className="flex items-center gap-2 mb-0.5">
                            <span className="w-6 h-1 bg-emerald-500 rounded-full"></span>
                            <span className="text-[9px] font-black tracking-[0.2em] text-emerald-600 uppercase">Logistics System</span>
                        </div>
                        <h1 className="text-3xl font-black text-slate-600 tracking-tighter" style={{ fontFamily: '"Noto Sans KR", sans-serif' }}>배송 관리 <span className="text-slate-300 font-light ml-1 text-xl">Shipping</span></h1>
                    </div>
                    <button onClick={() => setShowGuide(!showGuide)} className="no-print flex items-center gap-1 text-slate-400 hover:text-emerald-600 transition-colors text-xs font-bold bg-white px-3 py-1.5 rounded-full border border-slate-100 hover:border-emerald-200 shadow-sm">
                        <span className="material-symbols-rounded text-lg">help</span>
                        <span>상태 도움말</span>
                    </button>
                </div>

                {/* Guide Content */}
                {showGuide && (
                    <div className="mb-4 bg-slate-50 border border-slate-200 rounded-2xl p-4 animate-in fade-in slide-in-from-top-2 duration-300 shadow-sm">
                        <div className="flex flex-col md:flex-row gap-6">
                            <div className="flex-1">
                                <div className="flex items-center gap-2 mb-2">
                                    <span className="px-2 py-0.5 rounded text-[10px] font-black border bg-slate-100 text-slate-600 border-slate-200">접수</span>
                                    <span className="text-sm font-bold text-slate-700">신규 주문 확인 단계</span>
                                </div>
                                <p className="text-xs text-slate-500 leading-relaxed pl-1">
                                    관리자가 내용을 상세히 확인하지 않았거나, 재고 확인 전 단계일 수 있습니다.<br />
                                    주문이 시스템에 최초로 등록된 초기 상태입니다.
                                </p>
                            </div>
                            <div className="hidden md:block w-px bg-slate-200"></div>
                            <div className="flex-1">
                                <div className="flex items-center gap-2 mb-2">
                                    <span className="px-2 py-0.5 rounded text-[10px] font-black border bg-rose-50 text-rose-600 border-rose-100">입금대기</span>
                                    <span className="text-sm font-bold text-slate-700">주문 확정 및 입금 대기</span>
                                </div>
                                <p className="text-xs text-slate-500 leading-relaxed pl-1">
                                    관리자가 <strong>주문을 확인(Confirm)</strong>했고, 고객에게 계좌번호를 안내했거나 입금을 기다리는 명확한 대기 상태입니다.<br />
                                    '접수'된 주문 중 유효한 주문만 골라내어 '입금대기'로 넘기는 용도로 사용할 수 있습니다.
                                </p>
                            </div>
                            <div className="hidden md:block w-px bg-slate-200"></div>
                            <div className="flex-1">
                                <div className="flex items-center gap-2 mb-2">
                                    <span className="px-2 py-0.5 rounded text-[10px] font-black border bg-indigo-50 text-indigo-600 border-indigo-100">동기화</span>
                                    <span className="text-sm font-bold text-slate-700">실시간 배송 추적 연동</span>
                                </div>
                                <p className="text-xs text-slate-500 leading-relaxed pl-1">
                                    <strong>[실시간 배송 추적]</strong> 버튼을 클릭하면 택배사 API(현재 시뮬레이션 모드)와 연동하여 배송 상태를 자동으로 체크합니다.<br />
                                    배송이 완료된 건은 시스템이 자동으로 <strong>'배송완료'</strong> 상태로 변경합니다.
                                </p>
                            </div>
                        </div>
                    </div>
                )}

                {/* Status Cards */}
                <div className="grid grid-cols-6 gap-3 mb-4 no-print">
                    {[
                        { label: '전체', count: stats.all, icon: 'inventory_2', color: 'slate' },
                        { label: '접수', count: stats.receipt, icon: 'receipt_long', color: 'sky' },
                        { label: '입금대기', count: stats.pending, icon: 'payments', color: 'cyan' },
                        { label: '입금완료', count: stats.paid, icon: 'credit_score', color: 'teal' },
                        { label: '배송중', count: stats.shipping, icon: 'local_shipping', color: 'emerald' },
                        { label: '배송완료', count: stats.completed, icon: 'check_circle', color: 'slate' },
                    ].map(s => (
                        <div key={s.label}
                            onClick={() => {
                                setStatusFilter(s.label);
                                setSelectedIds(new Set()); // 필터 변경 시 선택 초기화
                            }}
                            className={`p-3 rounded-[1.5rem] border transition-all cursor-pointer relative overflow-hidden group hover:shadow-md 
                                ${statusFilter === s.label
                                    ? `bg-${s.color}-50 border-${s.color}-600 ring-1 ring-${s.color}-600 shadow-md transform scale-[1.02]`
                                    : `bg-white border-slate-200 hover:border-${s.color}-300 hover:bg-${s.color}-50/30`
                                }
                            `}>
                            <div className={`absolute top-0 right-0 p-3 transition-opacity ${statusFilter === s.label ? 'opacity-20' : 'opacity-10 group-hover:opacity-20'} text-${s.color}-600`}>
                                <span className="material-symbols-rounded text-4xl">{s.icon}</span>
                            </div>
                            <div className={`text-[10px] font-bold uppercase tracking-wider mb-0.5 ${statusFilter === s.label ? `text-${s.color}-900` : 'text-slate-500'}`}>{s.label}</div>
                            <div className={`text-2xl font-black ${statusFilter === s.label ? `text-${s.color}-700` : 'text-slate-700'}`}>{s.count}</div>
                        </div>
                    ))}
                </div>

                {/* Action Toolbar */}
                <div className="flex items-center justify-between gap-3 bg-white p-3 rounded-[1.2rem] border border-slate-200 shadow-sm mb-2 no-print">
                    <div className="flex items-center gap-2">
                        <div className="flex items-center gap-2 pl-2 border-r border-slate-200 pr-4">
                            <span className="text-[10px] font-bold text-slate-400 uppercase">기간 조회</span>
                            <input type="date" value={dateRange.start} onChange={e => setDateRange({ ...dateRange, start: e.target.value })} className="h-8 rounded-lg border-slate-200 text-xs font-bold text-slate-600 focus:ring-emerald-500" />
                            <span className="text-slate-300">~</span>
                            <input type="date" value={dateRange.end} onChange={e => setDateRange({ ...dateRange, end: e.target.value })} className="h-8 rounded-lg border-slate-200 text-xs font-bold text-slate-600 focus:ring-emerald-500" />
                        </div>
                        <div className="relative">
                            <input
                                value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                                placeholder="고객명, 상품명, 수령인..."
                                className="h-8 w-64 rounded-lg border-slate-200 pl-8 text-xs font-bold focus:ring-emerald-500"
                            />
                            <span className="material-symbols-rounded absolute left-2 top-1.5 text-slate-400 text-base">search</span>
                        </div>
                        <button onClick={loadData} className="h-8 w-8 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500">
                            <span className="material-symbols-rounded text-lg">refresh</span>
                        </button>
                        <button
                            onClick={async () => {
                                setIsLoading(true);
                                try {
                                    const result = await callBridge('batch_sync_courier_statuses');
                                    const count = (typeof result === 'object' && result?.count !== undefined) ? result.count : result;
                                    showAlert('동기화 완료', `${count}건의 배송 상태가 최신화되었습니다.`);
                                    loadData();
                                } catch (e) {
                                    showAlert('오류', `동기화 실패: ${e}`);
                                } finally {
                                    setIsLoading(false);
                                }
                            }}
                            className="h-8 px-3 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 font-bold text-[10px] flex items-center gap-1.5 transition-all"
                        >
                            <span className="material-symbols-rounded text-base">sync_alt</span>
                            실시간 배송 추적
                        </button>
                    </div>

                    <div className="flex items-center gap-2">
                        {selectedIds.size > 0 && (() => {
                            const selectedItems = shipments.filter(s => selectedIds.has(s.sales_id));
                            // Show 'Set Pending' if any item is in 'Received' status
                            const canSetPending = selectedItems.some(s => s.current_status === '접수');
                            // Show 'Confirm Payment' if any item is not yet paid (Received, Pending, Partial)
                            const canConfirmPayment = selectedItems.some(s => ['접수', '입금대기', '부분입금'].includes(s.current_status));

                            // Show 'Process Shipping' (Input Tracking) if any item is before shipping stage
                            const canProcessShipping = selectedItems.some(s => ['접수', '입금대기', '부분입금', '입금완료', '배송준비'].includes(s.current_status));
                            // Show 'Complete Delivery' if any item is currently Shipping
                            const canCompleteDelivery = selectedItems.some(s => s.current_status === '배송중');

                            return (
                                <div className="flex gap-2 animate-in fade-in slide-in-from-right-4 duration-300">
                                    {canSetPending && (
                                        <button onClick={() => handleAction('set_pending')} className="h-8 px-3 rounded-lg bg-amber-50 text-amber-600 hover:bg-amber-100 font-bold text-xs flex items-center gap-1">
                                            <span className="material-symbols-rounded text-base">hourglass_top</span> 입금대기
                                        </button>
                                    )}
                                    {canConfirmPayment && (
                                        <button onClick={() => handleAction('confirm_payment')} className="h-8 px-3 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 font-bold text-xs flex items-center gap-1">
                                            <span className="material-symbols-rounded text-base">check_circle</span> 입금확인
                                        </button>
                                    )}
                                    {canProcessShipping && (
                                        <button onClick={() => handleAction('shipping_process')} className="h-8 px-3 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 font-bold text-xs flex items-center gap-1 shadow-sm shadow-emerald-200">
                                            <span className="material-symbols-rounded text-base">local_shipping</span> 배송처리
                                        </button>
                                    )}
                                    {canCompleteDelivery && (
                                        <button onClick={() => handleAction('complete_delivery')} className="h-8 px-3 rounded-lg bg-slate-800 text-white hover:bg-slate-900 font-bold text-xs flex items-center gap-1 shadow-sm">
                                            <span className="material-symbols-rounded text-base">task_alt</span> 배송완료
                                        </button>
                                    )}
                                </div>
                            );
                        })()}
                    </div>
                </div>
            </div>

            {/* Main Table Area (Screen Only) */}
            <div className="flex-1 px-6 lg:px-8 min-[2000px]:px-12 pb-6 lg:pb-8 min-[2000px]:pb-12 overflow-hidden flex flex-col no-print">
                <div className="flex-1 bg-white rounded-[1.5rem] shadow-sm border border-slate-200 relative overflow-hidden flex flex-col">
                    <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 to-teal-400"></div>
                    <div className="flex-1 overflow-auto stylish-scrollbar p-0.5">
                        <table className="w-full text-xs border-separate border-spacing-0">
                            <thead className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur">
                                <tr>
                                    <th className="px-4 py-3 border-b border-slate-100 w-10 text-center">
                                        {filteredData.length > 0 && filteredData.some(d => d.current_status !== '배송완료') && (
                                            <input type="checkbox" onChange={e => handleSelectAll(e.target.checked)} className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500" />
                                        )}
                                    </th>
                                    <th className="px-4 py-3 border-b border-slate-100 text-left font-black text-slate-400 uppercase text-[9px]">주문일자</th>
                                    <th className="px-4 py-3 border-b border-slate-100 text-left font-black text-slate-400 uppercase text-[9px]">상태</th>
                                    <th className="px-4 py-3 border-b border-slate-100 text-left font-black text-slate-400 uppercase text-[9px]">고객정보</th>
                                    <th className="px-4 py-3 border-b border-slate-100 text-left font-black text-slate-400 uppercase text-[9px]">상품/배송정보</th>
                                    <th className="px-4 py-3 border-b border-slate-100 text-right font-black text-slate-400 uppercase text-[9px]">주문금액</th>
                                    <th className="px-4 py-3 border-b border-slate-100 text-center font-black text-slate-400 uppercase text-[9px]">운송장</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {isLoading ? (
                                    <tr><td colSpan="7" className="p-20 text-center text-slate-400 bg-slate-50/30 animate-pulse">데이터를 불러오고 있습니다...</td></tr>
                                ) : filteredData.length === 0 ? (
                                    <tr><td colSpan="7" className="p-20 text-center text-slate-400">조회된 배송 내역이 없습니다.</td></tr>
                                ) : filteredData.map(row => {
                                    const isCompleted = row.current_status === '배송완료';
                                    return (
                                        <tr key={row.sales_id} onClick={() => !isCompleted && handleToggleSelect(row.sales_id)} className={`group hover:bg-slate-50/80 transition-all cursor-pointer ${selectedIds.has(row.sales_id) ? 'bg-emerald-50/30' : ''} ${isCompleted ? 'opacity-70 grayscale' : ''}`}>
                                            <td className="px-4 py-3 text-center border-b border-slate-50" onClick={e => e.stopPropagation()}>
                                                {!isCompleted && (
                                                    <input type="checkbox" checked={selectedIds.has(row.sales_id)} onChange={() => handleToggleSelect(row.sales_id)} className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500" />
                                                )}
                                            </td>
                                            <td className="px-4 py-3 border-b border-slate-50 font-bold text-slate-600">{row.order_date.substring(0, 10)}</td>
                                            <td className="px-4 py-3 border-b border-slate-50"><StatusBadge status={row.current_status} /></td>
                                            <td className="px-4 py-3 border-b border-slate-50">
                                                <div className="font-black text-slate-800 text-sm mb-0.5">{row.customer_name}</div>
                                                <div className="text-[10px] text-slate-400 font-bold">{formatPhoneNumber(row.mobile_number)}</div>
                                            </td>
                                            <td className="px-4 py-3 border-b border-slate-50">
                                                <div className="font-bold text-slate-700 mb-1">{row.product_name} <span className="text-slate-400 font-normal">({row.specification})</span> x {row.quantity}</div>
                                                <div className="flex items-center gap-1 text-[11px] text-slate-500">
                                                    <span className="material-symbols-rounded text-[14px] text-slate-300">local_shipping</span>
                                                    <span className="text-slate-600 truncate max-w-[200px]" title={row.shipping_address_primary}>{row.shipping_address_primary}</span>
                                                    <span className="font-bold text-emerald-600 shrink-0">{row.shipping_name !== row.customer_name ? `(${row.shipping_name})` : ''}</span>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 border-b border-slate-50 text-right font-black text-slate-700">{formatCurrency(row.total_amount)}</td>
                                            <td className="px-4 py-3 border-b border-slate-50 text-center">
                                                {row.tracking_number ? (
                                                    <div
                                                        onClick={(e) => handleTrackingClick(e, row)}
                                                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 border border-slate-200 text-slate-600 cursor-pointer hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200 transition-all group/track"
                                                    >
                                                        <span className="text-[10px] font-bold">{row.courier_name}</span>
                                                        <span className="text-[11px] font-black tracking-wide group-hover/track:underline decoration-emerald-400 decoration-2 underline-offset-2">{row.tracking_number}</span>
                                                        <span className="material-symbols-rounded text-[14px] text-slate-400 group-hover/track:text-emerald-500">open_in_new</span>
                                                    </div>
                                                ) : (
                                                    <span className="text-[11px] text-slate-300 font-medium">-</span>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Hidden Printable Area for Robust Printing */}
            <div id="printable-shipping-report" style={{ display: 'none' }}>
                <div style={{ fontFamily: '"Malgun Gothic", sans-serif', padding: '0', color: '#000', width: '100%' }}>
                    <div style={{ border: '2px solid #000', padding: '30px', backgroundColor: '#fff' }}>
                        <div style={{ textAlign: 'center', marginBottom: '30px' }}>
                            <h1 style={{ margin: '0', fontSize: '32px', fontWeight: '900', letterSpacing: '0.3em', borderBottom: '5px double #000', display: 'inline-block', padding: '0 50px 10px 50px' }}>
                                배송 및 물류 관리 보고서
                            </h1>
                            <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'space-between', fontSize: '14px', fontWeight: 'bold' }}>
                                <span>조회 기간: <strong>{dateRange.start} ~ {dateRange.end}</strong></span>
                                <span>발급 일시: {new Date().toLocaleString()}</span>
                            </div>
                        </div>

                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px', border: '2px solid #000', tableLayout: 'fixed' }}>
                            <thead>
                                <tr style={{ backgroundColor: '#f0f0f0' }}>
                                    <th style={{ border: '1px solid #000', padding: '6px 4px', width: '35px', fontWeight: '900' }}>No</th>
                                    <th style={{ border: '1px solid #000', padding: '6px 4px', width: '80px', fontWeight: '900' }}>주문일자</th>
                                    <th style={{ border: '1px solid #000', padding: '6px 4px', width: '60px', fontWeight: '900' }}>상태</th>
                                    <th style={{ border: '1px solid #000', padding: '6px 4px', width: '80px', fontWeight: '900' }}>고객명</th>
                                    <th style={{ border: '1px solid #000', padding: '6px 4px', textAlign: 'left', paddingLeft: '10px', fontWeight: '900' }}>주문 상품 / 규격</th>
                                    <th style={{ border: '1px solid #000', padding: '6px 4px', width: '40px', fontWeight: '900' }}>수량</th>
                                    <th style={{ border: '1px solid #000', padding: '6px 4px', width: '80px', fontWeight: '900' }}>주문금액</th>
                                    <th style={{ border: '1px solid #000', padding: '6px 4px', textAlign: 'left', paddingLeft: '10px', fontWeight: '900' }}>배송 주소 / 수령인</th>
                                    <th style={{ border: '1px solid #000', padding: '6px 4px', width: '120px', fontWeight: '900' }}>송장 정보</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredData.map((row, idx) => (
                                    <tr key={idx} style={{ backgroundColor: idx % 2 === 1 ? '#fafafa' : '#fff' }}>
                                        <td style={{ border: '1px solid #000', padding: '6px 4px', textAlign: 'center' }}>{idx + 1}</td>
                                        <td style={{ border: '1px solid #000', padding: '6px 4px', textAlign: 'center' }}>{row.order_date.substring(0, 10)}</td>
                                        <td style={{ border: '1px solid #000', padding: '6px 4px', textAlign: 'center', fontWeight: '900' }}>{row.current_status}</td>
                                        <td style={{ border: '1px solid #000', padding: '6px 4px', textAlign: 'center', fontWeight: '900' }}>
                                            {row.customer_name}
                                            <div style={{ fontSize: '8px', fontWeight: 'normal' }}>{formatPhoneNumber(row.mobile_number)}</div>
                                        </td>
                                        <td style={{ border: '1px solid #000', padding: '6px 4px', textAlign: 'left' }}>
                                            <div style={{ fontWeight: '900' }}>{row.product_name}</div>
                                            <div style={{ fontSize: '9px', color: '#555' }}>{row.specification || '-'}</div>
                                        </td>
                                        <td style={{ border: '1px solid #000', padding: '6px 4px', textAlign: 'center', fontWeight: '900' }}>{row.quantity}</td>
                                        <td style={{ border: '1px solid #000', padding: '6px 4px', textAlign: 'right' }}>{row.total_amount.toLocaleString()}</td>
                                        <td style={{ border: '1px solid #000', padding: '6px 4px', textAlign: 'left', fontSize: '9px' }}>
                                            <div>{row.shipping_address_primary} {row.shipping_address_detail || ''}</div>
                                            {row.shipping_name !== row.customer_name && <div style={{ fontWeight: '900', borderTop: '1px dashed #ccc', marginTop: '2px' }}>수령인: {row.shipping_name}</div>}
                                        </td>
                                        <td style={{ border: '1px solid #000', padding: '6px 4px', textAlign: 'center', fontSize: '9px' }}>
                                            {row.courier_name && <div style={{ color: '#666' }}>{row.courier_name}</div>}
                                            <div style={{ fontWeight: '900' }}>{row.tracking_number || '-'}</div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>

                        <div style={{ marginTop: '30px', display: 'flex', justifyContent: 'flex-end' }}>
                            <table style={{ width: '400px', border: '2px solid #000', borderCollapse: 'collapse' }}>
                                <tbody>
                                    <tr>
                                        <th style={{ border: '1px solid #000', padding: '8px 5px', textAlign: 'center', backgroundColor: '#f0f0f0', width: '50%', fontSize: '11px' }}>총 배송(검색) 건수</th>
                                        <td style={{ border: '1px solid #000', padding: '8px 15px', textAlign: 'right', fontSize: '14px', fontWeight: '900' }}>{filteredData.length} 건</td>
                                    </tr>
                                    <tr style={{ backgroundColor: '#f0f0f0' }}>
                                        <th style={{ border: '1px solid #000', padding: '8px 5px', textAlign: 'center', fontSize: '11px' }}>총 주문 합계 금액</th>
                                        <td style={{ border: '1px solid #000', padding: '8px 15px', textAlign: 'right', fontSize: '14px', fontWeight: '900', color: '#d32f2f' }}>￦ {formatCurrency(filteredData.reduce((acc, cur) => acc + cur.total_amount, 0))}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>

                        <div style={{ marginTop: '40px', textAlign: 'center', fontSize: '12px', fontWeight: 'bold', color: '#444' }}>
                            위와 같이 배송 및 물류 현황을 정확히 보고합니다.
                        </div>

                        <div style={{ marginTop: '50px', textAlign: 'center', fontSize: '10px', color: '#999', borderTop: '1px solid #eee', paddingTop: '10px' }}>
                            © Mycelium Smart Farm Integration System - All Rights Reserved.
                        </div>
                    </div>
                </div>
            </div>



            {/* Footer Actions */}
            <div className="px-6 lg:px-8 min-[2000px]:px-12 pb-6 lg:pb-8 min-[2000px]:pb-12 flex justify-end gap-2 animate-in slide-in-from-bottom-2 duration-500 delay-100 no-print">
                <button onClick={() => setPrintModalOpen(true)} className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-600 font-bold text-xs hover:bg-slate-50 hover:border-slate-300 shadow-sm transition-all">
                    <span className="material-symbols-rounded text-lg">print</span>
                    인쇄 미리보기
                </button>
                <button onClick={handleExportCSV} className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-teal-600 text-white font-bold text-xs hover:bg-teal-700 shadow-sm shadow-teal-200 transition-all">
                    <span className="material-symbols-rounded text-lg">download</span>
                    CSV 저장
                </button>
            </div>

            {/* Shipping Process Modal */}
            {
                showShippingModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm animate-in fade-in">
                        <div className="bg-white rounded-[1.5rem] shadow-2xl w-[600px] overflow-hidden animate-in zoom-in-95 duration-300">
                            <div className="p-5 bg-slate-900 text-white flex justify-between items-center">
                                <h3 className="text-lg font-black flex items-center gap-2">
                                    <span className="material-symbols-rounded">local_shipping</span> 배송 처리
                                </h3>
                                <button onClick={() => setShowShippingModal(false)} className="opacity-70 hover:opacity-100 transition-opacity"><span className="material-symbols-rounded">close</span></button>
                            </div>
                            <div className="p-6">
                                <div className="grid grid-cols-2 gap-4 mb-6">
                                    <div>
                                        <label className="text-[11px] font-black text-slate-400 uppercase block mb-1">발송일자</label>
                                        <input type="date" value={shippingForm.date} onChange={e => setShippingForm({ ...shippingForm, date: e.target.value })} className="w-full rounded-xl border-slate-200 font-bold text-sm focus:ring-emerald-500" />
                                    </div>
                                    <div>
                                        <label className="text-[11px] font-black text-slate-400 uppercase block mb-1">택배사</label>
                                        <select value={shippingForm.carrier} onChange={e => setShippingForm({ ...shippingForm, carrier: e.target.value })} className="w-full rounded-xl border-slate-200 font-bold text-sm focus:ring-emerald-500">
                                            <option value="CJ대한통운">CJ대한통운</option>
                                            <option value="우체국택배">우체국택배</option>
                                            <option value="한진택배">한진택배</option>
                                            <option value="롯데택배">롯데택배</option>
                                            <option value="로젠택배">로젠택배</option>
                                            <option value="직접배송">직접배송/방문</option>
                                        </select>
                                    </div>
                                </div>

                                <div className="mb-2 flex justify-between items-end">
                                    <span className="text-xs font-bold text-slate-500">운송장 번호 입력 ({shippingItems.length}건)</span>
                                </div>
                                <div className="max-h-[300px] overflow-y-auto border border-slate-100 rounded-xl bg-slate-50 p-2 stylish-scrollbar">
                                    {shippingItems.map((item, idx) => (
                                        <div key={item.sales_id} className="flex items-center gap-3 p-3 bg-white rounded-lg border border-slate-100 shadow-sm mb-2 last:mb-0">
                                            <div className="w-8 h-8 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600 font-black text-xs">{idx + 1}</div>
                                            <div className="flex-1 min-w-0">
                                                <div className="font-bold text-slate-800 text-sm truncate">{item.customer_name} <span className="text-slate-400 font-normal">→ {item.shipping_name}</span></div>
                                                <div className="text-[11px] text-slate-500 truncate">{item.product_name}</div>
                                            </div>
                                            <div className="w-40">
                                                <input
                                                    autoFocus={idx === 0}
                                                    placeholder="운송장번호"
                                                    value={shippingForm.trackingMap[item.sales_id] || ''}
                                                    onChange={e => handleTrackingChange(item.sales_id, e.target.value)}
                                                    className="w-full h-8 rounded-lg border-slate-200 text-sm font-bold focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 transition-all"
                                                />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-2">
                                <button onClick={() => setShowShippingModal(false)} className="px-5 py-2.5 rounded-xl text-slate-500 font-bold hover:bg-slate-200 transition-all text-xs">취소</button>
                                <button onClick={submitShipping} className="px-6 py-2.5 rounded-xl bg-emerald-600 text-white font-black hover:bg-emerald-700 shadow-lg shadow-emerald-200 transition-all text-xs flex items-center gap-2">
                                    <span className="material-symbols-rounded text-lg">send</span> 배송 처리 완료
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }
            {/* Print Preview Modal - Directly Visible Version */}
            {printModalOpen && (
                <div className="fixed inset-0 z-[300] bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-4">
                    <div className="fixed top-8 right-8 flex flex-col gap-4 z-[310]">
                        <button
                            onClick={() => setPrintModalOpen(false)}
                            className="w-14 h-14 bg-white text-slate-400 rounded-2xl shadow-2xl hover:text-rose-500 hover:scale-110 active:scale-95 transition-all flex items-center justify-center group"
                            title="닫기"
                        >
                            <span className="material-symbols-rounded text-3xl group-hover:rotate-90 transition-transform duration-300">close</span>
                        </button>
                        <div className="h-px bg-white/20 w-full" />
                        <button
                            onClick={handlePrint}
                            className="h-14 px-8 rounded-2xl font-black text-sm bg-indigo-600 text-white shadow-2xl shadow-indigo-500/30 hover:bg-indigo-700 hover:-translate-y-1 active:translate-y-0 transition-all flex items-center gap-3"
                        >
                            <span className="material-symbols-rounded text-xl">print</span> 인쇄하기
                        </button>
                    </div>

                    <div className="w-full max-w-[297mm] h-[210mm] max-h-[90vh] bg-white rounded-[1rem] shadow-2xl overflow-y-auto overflow-x-hidden relative custom-scrollbar">
                        <div id="printable-shipping-content" className="p-[10mm]">
                            <div style={{ fontFamily: '"Malgun Gothic", sans-serif', color: '#000', width: '100%' }}>
                                <div style={{ border: '2px solid #000', padding: '30px', backgroundColor: '#fff' }}>
                                    <div style={{ textAlign: 'center', marginBottom: '30px' }}>
                                        <h1 style={{ margin: '0', fontSize: '32px', fontWeight: '900', letterSpacing: '0.3em', borderBottom: '5px double #000', display: 'inline-block', padding: '0 50px 10px 50px' }}>
                                            배송 관리 현황 보고서
                                        </h1>
                                        <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'space-between', fontSize: '14px', fontWeight: 'bold' }}>
                                            <span>조회 기간: <strong>{dateRange.start} ~ {dateRange.end}</strong></span>
                                            <span>발급 일시: {new Date().toLocaleString()}</span>
                                        </div>
                                    </div>

                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px', border: '2px solid #000', tableLayout: 'fixed' }}>
                                        <thead>
                                            <tr style={{ backgroundColor: '#f0f0f0' }}>
                                                <th style={{ border: '1px solid #000', padding: '6px 4px', width: '35px', fontWeight: '900' }}>No</th>
                                                <th style={{ border: '1px solid #000', padding: '6px 4px', width: '60px', fontWeight: '900' }}>상태</th>
                                                <th style={{ border: '1px solid #000', padding: '6px 4px', width: '70px', fontWeight: '900' }}>주문일자</th>
                                                <th style={{ border: '1px solid #000', padding: '6px 4px', width: '70px', fontWeight: '900' }}>수령인</th>
                                                <th style={{ border: '1px solid #000', padding: '6px 4px', width: '90px', fontWeight: '900' }}>연락처</th>
                                                <th style={{ border: '1px solid #000', padding: '6px 4px', textAlign: 'left', paddingLeft: '10px', fontWeight: '900' }}>배송지 주소</th>
                                                <th style={{ border: '1px solid #000', padding: '6px 4px', textAlign: 'left', paddingLeft: '10px', fontWeight: '900' }}>상품명/규격</th>
                                                <th style={{ border: '1px solid #000', padding: '6px 4px', width: '35px', fontWeight: '900' }}>수량</th>
                                                <th style={{ border: '1px solid #000', padding: '6px 4px', width: '80px', fontWeight: '900' }}>송장번호</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {filteredData.map((s, idx) => (
                                                <tr key={idx} style={{ backgroundColor: idx % 2 === 1 ? '#fafafa' : '#fff' }}>
                                                    <td style={{ border: '1px solid #000', padding: '6px 4px', textAlign: 'center' }}>{idx + 1}</td>
                                                    <td style={{ border: '1px solid #000', padding: '6px 4px', textAlign: 'center', fontWeight: '900' }}>{s.current_status}</td>
                                                    <td style={{ border: '1px solid #000', padding: '6px 4px', textAlign: 'center' }}>{s.order_date.substring(0, 10)}</td>
                                                    <td style={{ border: '1px solid #000', padding: '6px 4px', textAlign: 'center', fontWeight: '900' }}>{s.shipping_name}</td>
                                                    <td style={{ border: '1px solid #000', padding: '6px 4px', textAlign: 'center' }}>{s.shipping_mobile_number ? formatPhoneNumber(s.shipping_mobile_number) : '-'}</td>
                                                    <td style={{ border: '1px solid #000', padding: '6px 4px', textAlign: 'left', fontSize: '9px', lineHeight: '1.2' }}>{s.shipping_address_primary}</td>
                                                    <td style={{ border: '1px solid #000', padding: '6px 4px', textAlign: 'left' }}>
                                                        <div style={{ fontWeight: '900' }}>{s.product_name}</div>
                                                        <div style={{ fontSize: '8px', color: '#555' }}>{s.specification || ''}</div>
                                                    </td>
                                                    <td style={{ border: '1px solid #000', padding: '6px 4px', textAlign: 'center', fontWeight: '900' }}>{s.quantity}</td>
                                                    <td style={{ border: '1px solid #000', padding: '6px 4px', textAlign: 'center', fontSize: '9px' }}>{s.tracking_number || '-'}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>

                                    <div style={{ marginTop: '30px', display: 'flex', justifyContent: 'flex-end' }}>
                                        <table style={{ width: '300px', border: '2px solid #000', borderCollapse: 'collapse' }}>
                                            <tbody>
                                                <tr style={{ backgroundColor: '#f0f0f0' }}>
                                                    <th style={{ border: '1px solid #000', padding: '8px 5px', textAlign: 'center', width: '50%', fontSize: '11px' }}>총 배송 건수</th>
                                                    <td style={{ border: '1px solid #000', padding: '8px 15px', textAlign: 'right', fontSize: '14px', fontWeight: '900' }}>{filteredData.length} 건</td>
                                                </tr>
                                                <tr>
                                                    <th style={{ border: '1px solid #000', padding: '8px 5px', textAlign: 'center', fontSize: '11px' }}>총 배송 수량</th>
                                                    <td style={{ border: '1px solid #000', padding: '8px 15px', textAlign: 'right', fontSize: '14px', fontWeight: '900', color: '#d32f2f' }}>
                                                        {filteredData.reduce((acc, cur) => acc + (cur.quantity || 0), 0).toLocaleString()} 개
                                                    </td>
                                                </tr>
                                            </tbody>
                                        </table>
                                    </div>

                                    <div style={{ marginTop: '40px', textAlign: 'center', fontSize: '12px', fontWeight: 'bold' }}>
                                        위와 같이 배송 현황을 보고합니다.
                                    </div>

                                    <div style={{ marginTop: '50px', textAlign: 'center', fontSize: '10px', color: '#999', borderTop: '1px solid #eee', paddingTop: '10px' }}>
                                        © Mycelium Smart Farm Integration System - All Rights Reserved.
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div >
    );
};

export default SalesShipping;

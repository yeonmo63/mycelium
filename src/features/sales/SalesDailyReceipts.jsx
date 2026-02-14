import React, { useState, useEffect, useMemo, useRef } from 'react';
import { formatCurrency, formatPhoneNumber } from '../../utils/common';
import { handlePrintRaw } from '../../utils/printUtils';
import { useModal } from '../../contexts/ModalContext';

const dailyReceiptStyles = `
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
        #printable-daily-receipts {
            display: block !important;
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            padding: 10mm !important;
            visibility: visible !important;
            background: white !important;
        }
        #printable-daily-receipts * {
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
        font-size: 11px; 
        border: 2px solid #000 !important; 
        table-layout: fixed;
    }
    th, td { 
        border: 1px solid #000 !important; 
        padding: 8px 5px; 
        text-align: center; 
    }
    th { 
        background: #f0f0f0 !important; 
        font-weight: 900; 
        border-bottom: 2px solid #000 !important;
    }
    .bg-row { background: #fafafa !important; }
    .summary-table {
        width: 450px;
        border: 2px solid #000 !important;
    }
    .summary-table th, .summary-table td { border: 1px solid #000 !important; }
`;

const SalesDailyReceipts = () => {
    const { showAlert, showConfirm } = useModal();
    // State
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [receipts, setReceipts] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [printModalOpen, setPrintModalOpen] = useState(false);

    // Refs
    const printRef = useRef(null);

    // Derived Stats
    const stats = useMemo(() => {
        const s = {
            total: { count: 0, qty: 0, amt: 0, supply: 0, vat: 0 },
            gen: { count: 0, qty: 0, amt: 0 },
            mall: { count: 0, qty: 0, amt: 0 },
            status: { receipt: 0, paid: 0, shipped: 0 }
        };

        receipts.forEach(r => {
            const qty = r.quantity || 0;
            const amt = r.total_amount || 0;
            const supply = r.supply_value || 0;
            const vat = r.vat_amount || 0;
            const isMall = (r.memo || '').includes('[쇼핑몰주문]');
            const status = r.status || '접수';

            // Total
            s.total.count++;
            s.total.qty += qty;
            s.total.amt += amt;
            s.total.supply += supply;
            s.total.vat += vat;

            // Type
            if (isMall) {
                s.mall.count++;
                s.mall.qty += qty;
                s.mall.amt += amt;
            } else {
                s.gen.count++;
                s.gen.qty += qty;
                s.gen.amt += amt;
            }

            // Status Breakdown
            if (status === '접수') s.status.receipt++;
            else if (status === '입금완료') s.status.paid++;
            else if (status === '배송완료') s.status.shipped++;
        });
        return s;
    }, [receipts]);

    // Load Data
    useEffect(() => {
        loadData();
    }, [date]);

    const loadData = async () => {
        if (!window.__TAURI__) return;
        setIsLoading(true);
        try {
            const data = await window.__TAURI__.core.invoke('get_daily_receipts', { date });
            setReceipts(data || []);
        } catch (e) {
            console.error(e);
            setReceipts([]);
            showAlert("오류", "데이터 로드 실패: " + e);
        } finally {
            setIsLoading(false);
        }
    };

    // Actions
    const handleDateChange = (val) => {
        const today = new Date().toISOString().split('T')[0];
        if (val > today) {
            showAlert("알림", "미래 날짜는 조회할 수 없습니다.");
            return;
        }
        setDate(val);
    };

    const handlePrevDay = () => {
        const d = new Date(date);
        d.setDate(d.getDate() - 1);
        handleDateChange(d.toISOString().split('T')[0]);
    };

    const handleNextDay = () => {
        const d = new Date(date);
        d.setDate(d.getDate() + 1);
        handleDateChange(d.toISOString().split('T')[0]);
    };

    const handlePrint = () => {
        const el = document.getElementById('printable-daily-content');
        if (!el) return;

        const html = `
            <style>
                ${dailyReceiptStyles}
                @page { size: A4 landscape; margin: 10mm; }
                body { font-family: 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif; margin: 0; padding: 10mm; }
            </style>
            ${el.outerHTML}
        `;
        handlePrintRaw(html);
    };

    const handleExportCsv = async () => {
        if (receipts.length === 0) {
            showAlert("알림", "저장할 데이터가 없습니다.");
            return;
        }

        let csv = '\uFEFFNo,상태,접수일자,고객명,휴대번호,배송처,상품명,규격,수량,공급가액,부가세,합계금액,메모\n';
        receipts.forEach((r, idx) => {
            const row = [
                idx + 1,
                r.status || '접수',
                r.order_date || '-',
                r.customer_name || '비회원',
                r.shipping_mobile_number || '-',
                r.shipping_name || '-',
                r.product_name,
                r.specification || '-',
                r.quantity,
                r.supply_value || r.total_amount,
                r.vat_amount || 0,
                r.total_amount,
                (r.memo || '').replace(/,/g, ' ').replace(/\n/g, ' ')
            ].map(v => `"${v}"`).join(',');
            csv += row + '\n';
        });

        try {
            if (window.__TAURI__) {
                const filePath = await window.__TAURI__.core.invoke('plugin:dialog|save', {
                    options: { defaultPath: `일일접수현황_${date.replace(/-/g, '')}.csv`, filters: [{ name: 'CSV File', extensions: ['csv'] }] }
                });
                if (filePath) {
                    await window.__TAURI__.core.invoke('plugin:fs|write_text_file', { path: filePath, contents: csv });
                    showAlert("성공", "파일이 성공적으로 저장되었습니다.");
                }
            }
        } catch (e) {
            console.error('Failed to save CSV:', e);
            showAlert("오류", "파일 저장 중 오류가 발생했습니다: " + e);
        }
    };

    const isToday = date === new Date().toISOString().split('T')[0];

    return (
        <div className="h-full flex flex-col bg-slate-50 relative overflow-hidden print:bg-white print:h-auto print:overflow-visible print:block" id="sales-daily-receipts-view">

            {/* Header Title (Matches SalesReception Style) */}
            <div className="px-6 lg:px-8 min-[2000px]:px-12 pt-6 lg:pt-8 min-[2000px]:pt-12 pb-1 shrink-0 print:hidden">
                <div className="flex justify-between items-end mb-4">
                    <div>
                        <div className="flex items-center gap-2 mb-0.5">
                            <span className="w-6 h-1 bg-indigo-600 rounded-full"></span>
                            <span className="text-[9px] font-black tracking-[0.2em] text-indigo-600 uppercase">Daily Sales Overview</span>
                        </div>
                        <h1 className="text-3xl font-black text-slate-600 tracking-tighter" style={{ fontFamily: '"Noto Sans KR", sans-serif' }}>
                            일일 접수 현황 <span className="text-slate-300 font-light ml-1 text-xl">Daily Receipts</span>
                        </h1>
                    </div>
                </div>
            </div>


            {/* Main Content Card */}
            <div className="flex-1 flex flex-col min-h-0 px-6 lg:px-8 min-[2000px]:px-12 pb-6 lg:pb-8 min-[2000px]:pb-12 bg-white rounded-[1.5rem] shadow-lg border border-slate-200/60 overflow-hidden print:shadow-none print:border-none print:m-0 print:rounded-none">

                {/* 1. Top Controls & Stats */}
                <div className="shrink-0 flex flex-col border-b border-slate-100 bg-white print:hidden">
                    {/* Filter Bar */}
                    <div className="p-5 flex justify-between items-end border-b border-dashed border-slate-100">
                        <div className="flex gap-4 items-end">
                            <div>
                                <label className="block text-[10.5px] font-bold text-slate-500 uppercase mb-1.5 ml-1">접수 일자 조회</label>
                                <div className="flex items-center gap-2 bg-slate-50 p-1 rounded-2xl border border-slate-200 shadow-sm">
                                    <button onClick={handlePrevDay} className="w-9 h-9 rounded-xl bg-white border border-slate-200 text-slate-500 hover:text-indigo-600 hover:border-indigo-200 shadow-sm flex items-center justify-center transition-all hover:scale-105 active:scale-95">
                                        <span className="material-symbols-rounded text-xl">chevron_left</span>
                                    </button>

                                    <div className="relative group">
                                        <input
                                            type="date"
                                            value={date}
                                            max={new Date().toISOString().split('T')[0]}
                                            onChange={(e) => handleDateChange(e.target.value)}
                                            className="pl-3 pr-3 py-2 bg-transparent border-none text-sm font-black text-slate-700 outline-none w-36 font-mono cursor-pointer focus:bg-white focus:ring-2 focus:ring-indigo-100 rounded-lg transition-all"
                                        />
                                    </div>

                                    <button
                                        onClick={handleNextDay}
                                        disabled={isToday}
                                        className={`w - 9 h - 9 rounded - xl bg - white border border - slate - 200 flex items - center justify - center transition - all shadow - sm
                                            ${isToday ? 'opacity-50 cursor-not-allowed text-slate-300' : 'text-slate-500 hover:text-indigo-600 hover:border-indigo-200 hover:scale-105 active:scale-95'} `}
                                    >
                                        <span className="material-symbols-rounded text-xl">chevron_right</span>
                                    </button>
                                </div>
                            </div>

                            <button onClick={loadData} className="h-[46px] px-6 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-sm shadow-lg shadow-indigo-200 flex items-center gap-2 transition-all hover:scale-[1.02] active:scale-95 mb-0.5">
                                <span className="material-symbols-rounded">search</span> 조회
                            </button>
                        </div>

                        <div className="flex gap-2 mb-0.5">
                            <button onClick={() => setPrintModalOpen(true)} className="h-10 px-5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 font-bold text-xs flex items-center gap-2 shadow-sm transition-all hover:border-indigo-200 hover:text-indigo-600">
                                <span className="material-symbols-rounded filled text-indigo-500">print</span> 리스트 인쇄
                            </button>
                            <button onClick={handleExportCsv} className="h-10 px-5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs shadow-md shadow-emerald-200 flex items-center gap-2 transition-all active:scale-95">
                                <span className="material-symbols-rounded">download</span> 엑셀(CSV) 저장
                            </button>
                        </div>
                    </div>

                    {/* Stats Grid (Moved to Top) */}
                    <div className="p-5 bg-slate-50/50">
                        <div className="grid grid-cols-4 gap-4">
                            {/* Total Stats */}
                            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm relative overflow-hidden group hover:shadow-md transition-all">
                                <div className="absolute right-0 top-0 w-16 h-16 bg-indigo-50 rounded-bl-full -mr-8 -mt-8 transition-transform group-hover:scale-150 group-hover:bg-indigo-100"></div>
                                <div className="flex items-center gap-2 mb-3 text-[11px] font-black text-slate-400 uppercase tracking-wider relative z-10">
                                    <span className="material-symbols-rounded text-lg text-indigo-500">analytics</span> 전체 접수 합계
                                </div>
                                <div className="flex flex-col gap-1 relative z-10">
                                    <div className="flex justify-between items-baseline">
                                        <span className="text-xs font-bold text-slate-500">주문 건수</span>
                                        <span className="text-sm font-black text-slate-800">{stats.total.count.toLocaleString()} <span className="text-[10px] font-normal text-slate-400">건</span></span>
                                    </div>
                                    <div className="flex justify-between items-baseline">
                                        <span className="text-xs font-bold text-slate-500">공급가액</span>
                                        <span className="text-sm font-black text-slate-700">{formatCurrency(stats.total.supply)}원</span>
                                    </div>
                                    <div className="flex justify-between items-baseline border-b border-slate-100 pb-1 mb-1">
                                        <span className="text-xs font-bold text-slate-500">부가세</span>
                                        <span className="text-sm font-black text-slate-700">{formatCurrency(stats.total.vat)}원</span>
                                    </div>
                                    <div className="flex justify-between items-baseline">
                                        <span className="text-xs font-bold text-slate-500">합계</span>
                                        <span className="text-lg font-black text-indigo-600 tracking-tight">{formatCurrency(stats.total.amt)}<span className="text-[10px] font-normal text-slate-400 ml-0.5">원</span></span>
                                    </div>
                                </div>
                            </div>

                            {/* General (Phone) Stats */}
                            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm relative overflow-hidden group hover:shadow-md transition-all">
                                <div className="absolute right-0 top-0 w-16 h-16 bg-emerald-50 rounded-bl-full -mr-8 -mt-8 transition-transform group-hover:scale-150 group-hover:bg-emerald-100"></div>
                                <div className="flex items-center gap-2 mb-3 text-[11px] font-black text-slate-400 uppercase tracking-wider relative z-10">
                                    <span className="material-symbols-rounded text-lg text-emerald-500">phone_in_talk</span> 일반(전화) 접수
                                </div>
                                <div className="flex flex-col gap-1 relative z-10">
                                    <div className="flex justify-between items-baseline">
                                        <span className="text-xs font-bold text-slate-500">주문 건수</span>
                                        <span className="text-sm font-black text-slate-800">{stats.gen.count.toLocaleString()} <span className="text-[10px] font-normal text-slate-400">건</span></span>
                                    </div>
                                    <div className="flex justify-between items-baseline">
                                        <span className="text-xs font-bold text-slate-500">주문 금액</span>
                                        <span className="text-lg font-black text-emerald-600 tracking-tight">{formatCurrency(stats.gen.amt)}<span className="text-[10px] font-normal text-slate-400 ml-0.5">원</span></span>
                                    </div>
                                </div>
                            </div>

                            {/* Mall Stats */}
                            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm relative overflow-hidden group hover:shadow-md transition-all">
                                <div className="absolute right-0 top-0 w-16 h-16 bg-blue-50 rounded-bl-full -mr-8 -mt-8 transition-transform group-hover:scale-150 group-hover:bg-blue-100"></div>
                                <div className="flex items-center gap-2 mb-3 text-[11px] font-black text-slate-400 uppercase tracking-wider relative z-10">
                                    <span className="material-symbols-rounded text-lg text-blue-500">sync_alt</span> 쇼핑몰 연동 접수
                                </div>
                                <div className="flex flex-col gap-1 relative z-10">
                                    <div className="flex justify-between items-baseline">
                                        <span className="text-xs font-bold text-slate-500">주문 건수</span>
                                        <span className="text-sm font-black text-slate-800">{stats.mall.count.toLocaleString()} <span className="text-[10px] font-normal text-slate-400">건</span></span>
                                    </div>
                                    <div className="flex justify-between items-baseline">
                                        <span className="text-xs font-bold text-slate-500">결제 금액</span>
                                        <span className="text-lg font-black text-blue-600 tracking-tight">{formatCurrency(stats.mall.amt)}<span className="text-[10px] font-normal text-slate-400 ml-0.5">원</span></span>
                                    </div>
                                </div>
                            </div>

                            {/* Status Breakdown */}
                            <div className="bg-slate-800 rounded-2xl p-4 text-white border border-slate-700 shadow-lg relative overflow-hidden group hover:shadow-xl transition-all">
                                <div className="absolute right-0 top-0 w-24 h-24 bg-white/5 rounded-full -mr-8 -mt-8 transition-transform group-hover:scale-150"></div>
                                <div className="flex items-center gap-2 mb-3 text-[11px] font-black text-slate-400 uppercase tracking-wider relative z-10">
                                    <span className="material-symbols-rounded text-lg">fact_check</span> 진행 상황 요약
                                </div>
                                <div className="grid grid-cols-3 gap-2 text-center relative z-10 h-full items-center pb-2">
                                    <div className="bg-white/10 rounded-xl p-2 backdrop-blur-sm border border-white/5">
                                        <div className="text-[9px] text-slate-300 mb-0.5 font-bold">입금대기</div>
                                        <div className="text-base font-black text-red-400">{stats.status.receipt.toLocaleString()}</div>
                                    </div>
                                    <div className="bg-white/10 rounded-xl p-2 backdrop-blur-sm border border-white/5">
                                        <div className="text-[9px] text-slate-300 mb-0.5 font-bold">입금완료</div>
                                        <div className="text-base font-black text-amber-400">{stats.status.paid.toLocaleString()}</div>
                                    </div>
                                    <div className="bg-white/10 rounded-xl p-2 backdrop-blur-sm border border-white/5">
                                        <div className="text-[9px] text-slate-300 mb-0.5 font-bold">배송완료</div>
                                        <div className="text-base font-black text-emerald-400">{stats.status.shipped.toLocaleString()}</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* 2. Results Table */}
                <div className="flex-1 overflow-auto bg-white relative stylish-scrollbar print:overflow-visible">
                    <table className="w-full text-xs border-collapse table-fixed">
                        <thead className="sticky top-0 z-10 bg-white/95 backdrop-blur shadow-sm">
                            <tr>
                                <th className="py-3 text-center font-black text-slate-400 uppercase tracking-wider border-b border-slate-100 bg-slate-50/50 w-[5%]">No</th>
                                <th className="py-3 text-center font-black text-slate-400 uppercase tracking-wider border-b border-slate-100 bg-slate-50/50 w-[8%]">배송상태</th>
                                <th className="py-3 text-center font-black text-slate-400 uppercase tracking-wider border-b border-slate-100 bg-slate-50/50 w-[8%]">접수일자</th>
                                <th className="py-3 text-center font-black text-slate-400 uppercase tracking-wider border-b border-slate-100 bg-slate-50/50 w-[8%]">고객명</th>
                                <th className="py-3 text-center font-black text-slate-400 uppercase tracking-wider border-b border-slate-100 bg-slate-50/50 w-[10%]">휴대번호</th>
                                <th className="py-3 text-center font-black text-slate-400 uppercase tracking-wider border-b border-slate-100 bg-slate-50/50 w-[10%]">배송처</th>
                                <th className="py-3 text-left pl-4 font-black text-slate-400 uppercase tracking-wider border-b border-slate-100 bg-slate-50/50 w-[12%]">상품명</th>
                                <th className="py-3 text-center font-black text-slate-400 uppercase tracking-wider border-b border-slate-100 bg-slate-50/50 w-[6%]">규격</th>
                                <th className="py-3 text-center font-black text-slate-400 uppercase tracking-wider border-b border-slate-100 bg-slate-50/50 w-[5%]">수량</th>
                                <th className="py-3 text-right pr-2 font-black text-slate-400 uppercase tracking-wider border-b border-slate-100 bg-slate-50/50 w-[8%]">공급가액</th>
                                <th className="py-3 text-right pr-2 font-black text-slate-400 uppercase tracking-wider border-b border-slate-100 bg-slate-50/50 w-[6%]">부가세</th>
                                <th className="py-3 text-right pr-4 font-black text-slate-400 uppercase tracking-wider border-b border-slate-100 bg-slate-50/50 w-[8%]">합계</th>
                                <th className="py-3 text-left pl-4 font-black text-slate-400 uppercase tracking-wider border-b border-slate-100 bg-slate-50/50 w-[20%]">메모</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {isLoading ? (
                                <tr><td colSpan="11" className="py-32 text-center"><div className="inline-block w-10 h-10 border-4 border-slate-200 border-t-indigo-500 rounded-full animate-spin"></div><div className="mt-4 text-slate-400 font-bold text-sm">데이터를 불러오는 중입니다...</div></td></tr>
                            ) : receipts.length === 0 ? (
                                <tr><td colSpan="11" className="py-32 text-center text-slate-400 font-bold">해당 일자의 접수 내역이 없습니다.</td></tr>
                            ) : (
                                receipts.map((r, idx) => {
                                    const status = r.status || '접수';
                                    let statusBadge;
                                    const badgeClass = "px-2 py-1 rounded-[6px] text-[10px] font-black tracking-tight border";

                                    if (status === '접수') statusBadge = <span className={`${badgeClass} bg - orange - 50 text - orange - 600 border - orange - 100`}>접수</span>;
                                    else if (status === '입금완료') statusBadge = <span className={`${badgeClass} bg - emerald - 50 text - emerald - 600 border - emerald - 100`}>입금완료</span>;
                                    else if (status === '배송완료') statusBadge = <span className={`${badgeClass} bg - blue - 50 text - blue - 600 border - blue - 100`}>배송완료</span>;
                                    else if (status === '취소') statusBadge = <span className={`${badgeClass} bg - red - 50 text - red - 600 border - red - 100 line - through`}>취소</span>;
                                    else statusBadge = <span className={`${badgeClass} bg - slate - 100 text - slate - 600 border - slate - 200`}>{status}</span>;

                                    return (
                                        <tr key={idx} className="hover:bg-slate-50 transition-colors group">
                                            <td className="px-3 py-3 text-center text-slate-400 font-mono text-[10px]">{idx + 1}</td>
                                            <td className="px-3 py-3 text-center">{statusBadge}</td>
                                            <td className="px-3 py-3 text-center text-slate-500 font-mono text-[11px] font-medium">{r.order_date || '-'}</td>
                                            <td className="px-3 py-3 text-center font-bold text-slate-700">
                                                <div className="truncate max-w-[90px] mx-auto" title={r.customer_name}>{r.customer_name || '비회원'}</div>
                                            </td>
                                            <td className="px-3 py-3 text-center text-slate-500 font-mono text-[10px] tracking-tight">{formatPhoneNumber(r.shipping_mobile_number || r.customer_mobile) || '-'}</td>
                                            <td className="px-3 py-3 text-center text-slate-600 font-medium text-[11px]">
                                                <div className="truncate max-w-[90px] mx-auto" title={r.shipping_name || r.customer_name}>{r.shipping_name || r.customer_name || '-'}</div>
                                            </td>
                                            <td className="px-3 py-3 pl-4 font-bold text-slate-700 text-[11px] break-keep leading-tight">
                                                <div className="truncate max-w-[180px]" title={r.product_name}>{r.product_name}</div>
                                            </td>
                                            <td className="px-3 py-3 text-center text-slate-500 text-[11px]">{r.specification || '-'}</td>
                                            <td className="px-3 py-3 text-center font-black text-slate-800 text-[11px]">{r.quantity.toLocaleString()}</td>
                                            <td className="px-2 py-3 text-right font-medium text-slate-600 text-[10.5px]">{formatCurrency(r.supply_value || r.total_amount)}</td>
                                            <td className="px-2 py-3 text-right font-medium text-slate-500 text-[10.5px]">{formatCurrency(r.vat_amount || 0)}</td>
                                            <td className="px-3 py-3 pr-4 text-right font-black text-slate-800 text-[11px] font-mono">{formatCurrency(r.total_amount)}</td>
                                            <td className="px-3 py-3 pl-4 text-slate-400 text-[10px]">
                                                <div className="truncate max-w-[120px]" title={r.memo}>{r.memo || ''}</div>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Footer (Actions moved to top) */}
            </div>

            {/* Footer Actions */}
            <div className="px-6 lg:px-8 min-[2000px]:px-12 pb-6 lg:pb-8 min-[2000px]:pb-12 flex justify-end gap-2 animate-in slide-in-from-bottom-2 duration-500 delay-100 no-print">
                <button onClick={() => setPrintModalOpen(true)} className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-600 font-bold text-xs hover:bg-slate-50 hover:border-slate-300 shadow-sm transition-all">
                    <span className="material-symbols-rounded text-lg">print</span>
                    인쇄 미리보기
                </button>
                <button onClick={handleExportCsv} className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-teal-600 text-white font-bold text-xs hover:bg-teal-700 shadow-sm shadow-teal-200 transition-all">
                    <span className="material-symbols-rounded text-lg">download</span>
                    CSV 저장
                </button>
            </div>

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
                        <div id="printable-daily-content" className="p-[10mm]">
                            <div style={{ fontFamily: '"Malgun Gothic", sans-serif', color: '#000', width: '100%' }}>
                                <div style={{ border: '2px solid #000', padding: '30px', backgroundColor: '#fff' }}>
                                    <div style={{ textAlign: 'center', marginBottom: '30px' }}>
                                        <h1 style={{ margin: '0', fontSize: '32px', fontWeight: '900', letterSpacing: '0.3em', borderBottom: '5px double #000', display: 'inline-block', padding: '0 50px 10px 50px' }}>
                                            일일 접수 현황 보고서
                                        </h1>
                                        <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'space-between', fontSize: '14px', fontWeight: 'bold' }}>
                                            <span>조회 일자: <strong>{date}</strong></span>
                                            <span>발급 일시: {new Date().toLocaleString()}</span>
                                        </div>
                                    </div>

                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', border: '2px solid #000', tableLayout: 'fixed' }}>
                                        <thead>
                                            <tr style={{ backgroundColor: '#f0f0f0' }}>
                                                <th style={{ border: '1px solid #000', padding: '8px 5px', width: '40px', fontWeight: '900' }}>No</th>
                                                <th style={{ border: '1px solid #000', padding: '8px 5px', width: '60px', fontWeight: '900' }}>상태</th>
                                                <th style={{ border: '1px solid #000', padding: '8px 5px', width: '80px', fontWeight: '900' }}>접수일자</th>
                                                <th style={{ border: '1px solid #000', padding: '8px 5px', width: '90px', fontWeight: '900' }}>고객명</th>
                                                <th style={{ border: '1px solid #000', padding: '8px 5px', width: '100px', fontWeight: '900' }}>연락처</th>
                                                <th style={{ border: '1px solid #000', padding: '8px 5px', width: '100px', fontWeight: '900' }}>성명(배송)</th>
                                                <th style={{ border: '1px solid #000', padding: '8px 5px', textAlign: 'left', paddingLeft: '10px', fontWeight: '900' }}>품목명 / 규격</th>
                                                <th style={{ border: '1px solid #000', padding: '8px 5px', width: '50px', fontWeight: '900' }}>수량</th>
                                                <th style={{ border: '1px solid #000', padding: '8px 5px', width: '100px', fontWeight: '900' }}>공급가액</th>
                                                <th style={{ border: '1px solid #000', padding: '8px 5px', width: '90px', fontWeight: '900' }}>부가세</th>
                                                <th style={{ border: '1px solid #000', padding: '8px 5px', width: '110px', fontWeight: '900' }}>합계금액</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {receipts.map((row, idx) => (
                                                <tr key={idx} style={{ backgroundColor: idx % 2 === 1 ? '#fafafa' : '#fff' }}>
                                                    <td style={{ border: '1px solid #000', padding: '8px 5px', textAlign: 'center' }}>{idx + 1}</td>
                                                    <td style={{ border: '1px solid #000', padding: '8px 5px', textAlign: 'center', fontWeight: '900' }}>{row.status || '접수'}</td>
                                                    <td style={{ border: '1px solid #000', padding: '8px 5px', textAlign: 'center' }}>{(row.order_date || '').substring(0, 10)}</td>
                                                    <td style={{ border: '1px solid #000', padding: '8px 5px', textAlign: 'center', fontWeight: '900' }}>{row.customer_name || '비회원'}</td>
                                                    <td style={{ border: '1px solid #000', padding: '8px 5px', textAlign: 'center' }}>{formatPhoneNumber(row.shipping_mobile_number || row.customer_mobile || '')}</td>
                                                    <td style={{ border: '1px solid #000', padding: '8px 5px', textAlign: 'center' }}>{row.shipping_name || row.customer_name || '-'}</td>
                                                    <td style={{ border: '1px solid #000', padding: '8px 5px', textAlign: 'left' }}>
                                                        <div style={{ fontWeight: '900' }}>{row.product_name}</div>
                                                        <div style={{ fontSize: '9px', color: '#555' }}>{row.specification || '-'}</div>
                                                    </td>
                                                    <td style={{ border: '1px solid #000', padding: '8px 5px', textAlign: 'center', fontWeight: '900' }}>{row.quantity.toLocaleString()}</td>
                                                    <td style={{ border: '1px solid #000', padding: '8px 5px', textAlign: 'right' }}>{formatCurrency(row.supply_value || row.total_amount)}</td>
                                                    <td style={{ border: '1px solid #000', padding: '8px 5px', textAlign: 'right' }}>{formatCurrency(row.vat_amount || 0)}</td>
                                                    <td style={{ border: '1px solid #000', padding: '8px 5px', textAlign: 'right', fontWeight: '900', backgroundColor: '#fafafa' }}>{formatCurrency(row.total_amount)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>

                                    <div style={{ marginTop: '30px', display: 'flex', justifyContent: 'flex-end' }}>
                                        <table style={{ width: '450px', border: '2px solid #000', borderCollapse: 'collapse' }}>
                                            <tbody>
                                                <tr>
                                                    <th style={{ border: '1px solid #000', padding: '8px 5px', textAlign: 'center', backgroundColor: '#f0f0f0', width: '40%', fontSize: '12px' }}>총 공급가액 합계</th>
                                                    <td style={{ border: '1px solid #000', padding: '8px 15px', textAlign: 'right', fontSize: '16px', fontWeight: '900' }}>￦ {formatCurrency(stats.total.supply)}</td>
                                                </tr>
                                                <tr>
                                                    <th style={{ border: '1px solid #000', padding: '8px 5px', textAlign: 'center', backgroundColor: '#f0f0f0', fontSize: '12px' }}>총 부가세 합계</th>
                                                    <td style={{ border: '1px solid #000', padding: '8px 15px', textAlign: 'right', fontSize: '16px', fontWeight: '900' }}>￦ {formatCurrency(stats.total.vat)}</td>
                                                </tr>
                                                <tr style={{ backgroundColor: '#f0f0f0' }}>
                                                    <th style={{ border: '1px solid #000', padding: '8px 5px', textAlign: 'center', fontSize: '14px' }}>최종 합계 금액</th>
                                                    <td style={{ border: '1px solid #000', padding: '8px 15px', textAlign: 'right', fontSize: '16px', fontWeight: '900', color: '#d32f2f' }}>￦ {formatCurrency(stats.total.amt)}</td>
                                                </tr>
                                            </tbody>
                                        </table>
                                    </div>

                                    <div style={{ marginTop: '40px', textAlign: 'center', fontSize: '12px', fontWeight: 'bold', color: '#444' }}>
                                        위와 같이 일일 판매 접수 현황을 보고합니다.
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
        </div>
    );
};

export default SalesDailyReceipts;

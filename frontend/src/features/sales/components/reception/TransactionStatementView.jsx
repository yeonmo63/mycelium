import React, { useMemo } from 'react';
import dayjs from 'dayjs';
import { X, Printer, Download, FileText } from 'lucide-react';
import { formatCurrency, formatDate } from '../../../../utils/common';
import { handlePrintRaw } from '../../../../utils/printUtils';

const statementStyles = `
    @media print {
        @page { size: A4; margin: 0; }
        html, body { 
            background: white !important; 
            color: black !important;
            color-scheme: light !important;
            margin: 0 !important;
            padding: 0 !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
        }
        nav, .tauri-drag-region, .print\\:hidden { display: none !important; }
        #root > div:not(.fixed) { display: none !important; }
        #printable-statement {
            display: block !important;
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 10mm !important;
            padding-top: 15mm !important;
            visibility: visible !important;
            background: white !important;
            box-shadow: none !important;
        }
        #printable-statement * {
            visibility: visible !important;
            border-color: black !important;
        }
        .no-break {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
        }
    }
    .custom-scrollbar::-webkit-scrollbar { width: 6px; }
    .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
    .custom-scrollbar::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }
`;

const TransactionStatementView = ({
    isOpen,
    onClose,
    customer,
    salesRows,
    companyInfo,
    orderDate,
    summary,
    onPrint
}) => {
    if (!isOpen || !customer) return null;

    const numberToKorean = (number) => {
        const units = ['', '십', '백', '천'];
        const bigUnits = ['', '만', '억', '조'];
        const digits = ['', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구'];
        if (number === 0) return '영';
        let result = '';
        let unitCount = 0;
        let num = number;
        while (num > 0) {
            let chunk = num % 10000;
            let chunkResult = '';
            for (let i = 0; i < 4; i++) {
                let digit = chunk % 10;
                if (digit > 0) {
                    let digitStr = (digit === 1 && i > 0) ? '' : digits[digit];
                    chunkResult = digitStr + units[i] + chunkResult;
                }
                chunk = Math.floor(chunk / 10);
            }
            if (chunkResult !== '') result = chunkResult + bigUnits[unitCount] + result;
            unitCount++;
            num = Math.floor(num / 10000);
        }
        return result;
    };

    const dateStr = dayjs(orderDate).format('YYYY년 MM월 DD일');
    const displayRows = useMemo(() => {
        const rows = [...salesRows];
        // Ensure at least 12 rows to fill the A4 page height appropriately
        while (rows.length < 12) {
            rows.push(null);
        }
        return rows;
    }, [salesRows]);

    const handlePrintInternal = () => {
        const el = document.getElementById('printable-statement');
        if (!el) return;

        // Wrap with the style tag for handlePrintRaw
        const html = `
            <style>${statementStyles}</style>
            ${el.outerHTML}
        `;
        handlePrintRaw(html);
    };

    return (
        <div className="fixed inset-0 z-[300] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 print:p-0 print:bg-white print:block print:relative print:z-0">

            {/* UI Controls */}
            <div className="fixed top-8 right-8 flex flex-col gap-4 print:hidden z-[310]">
                <button
                    onClick={onClose}
                    className="w-14 h-14 bg-white text-slate-400 rounded-2xl shadow-2xl hover:text-rose-500 hover:scale-110 active:scale-95 transition-all flex items-center justify-center group"
                    title="닫기"
                >
                    <X size={32} className="group-hover:rotate-90 transition-transform duration-300" />
                </button>

                <div className="h-px bg-white/20 w-full" />

                <button
                    onClick={handlePrintInternal}
                    className="h-14 px-8 rounded-2xl font-black text-sm bg-indigo-600 text-white shadow-2xl shadow-indigo-500/30 hover:bg-indigo-700 hover:-translate-y-1 active:translate-y-0 transition-all flex items-center gap-3"
                >
                    <Printer size={20} /> 인쇄 / PDF 저장
                </button>
            </div>

            {/* Paper Container */}
            <div className="w-full max-w-[210mm] max-h-[92vh] bg-white rounded-[2.5rem] shadow-[0_50px_100px_-20px_rgba(0,0,0,0.5)] overflow-y-auto custom-scrollbar print:max-h-none print:shadow-none print:rounded-none print:overflow-visible print:w-full relative">

                {/* A4 Content Area */}
                <div id="printable-statement" className="p-[15mm] bg-white text-slate-900 print:p-[10mm]">

                    <div className="text-center mb-6 relative">
                        <h1 className="text-3xl font-black tracking-[0.5em] underline underline-offset-8 decoration-2 text-slate-800">거 래 명 세 서</h1>
                        <div className="absolute top-0 right-0 text-[10px] font-bold text-slate-400 border border-slate-200 px-2 py-1 rounded">
                            관리번호: {dayjs(orderDate).format('YYYYMMDD')}-{customer.customer_id.toString().slice(-4)}
                        </div>
                    </div>

                    {/* Header Info Section */}
                    <div className="flex gap-4 mb-4 items-stretch">
                        {/* Receiver Side */}
                        <div className="flex-1 flex flex-col">
                            <table className="w-full border-2 border-slate-800 h-full border-collapse">
                                <tbody>
                                    <tr>
                                        <th className="w-20 bg-slate-100 border border-slate-800 p-1.5 text-xs font-black">일 자</th>
                                        <td className="border border-slate-800 p-1.5 text-sm font-bold text-center italic">{dateStr}</td>
                                    </tr>
                                    <tr>
                                        <th className="bg-slate-100 border border-slate-800 p-2 text-xs font-black h-16">받는분</th>
                                        <td className="border border-slate-800 p-2 align-middle">
                                            <div className="text-lg font-black text-center">{customer.customer_name} <span className="text-base font-bold">귀하</span></div>
                                            <div className="text-[9px] text-slate-500 text-center">{customer.mobile_number}</div>
                                        </td>
                                    </tr>
                                    <tr>
                                        <th className="bg-slate-100 border border-slate-800 p-1.5 text-xs font-black">합계금액</th>
                                        <td className="border border-slate-800 p-1.5 bg-slate-50">
                                            <div className="flex justify-between items-center px-2">
                                                <span className="text-sm font-black">￦</span>
                                                <span className="text-base font-black">{formatCurrency(summary.amount)}</span>
                                            </div>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>

                        {/* Provider Side */}
                        <div className="w-[55%] flex flex-col">
                            <table className="w-full border-2 border-slate-800 border-collapse h-full">
                                <tbody>
                                    <tr>
                                        <th rowSpan={4} className="w-8 bg-slate-100 border border-slate-800 text-[10px] leading-tight font-black text-center">공<br />급<br />자</th>
                                        <th className="w-20 bg-slate-100 border border-slate-800 p-1 text-[10px] font-black">등록번호</th>
                                        <td colSpan={3} className="border border-slate-800 p-1 text-center font-black text-sm tracking-widest">
                                            {companyInfo?.business_reg_number || '000-00-00000'}
                                        </td>
                                    </tr>
                                    <tr>
                                        <th className="bg-slate-100 border border-slate-800 p-1 text-[10px] font-black">상 호</th>
                                        <td className="border border-slate-800 p-1 text-xs font-bold text-center">
                                            {companyInfo?.company_name || '(주)강릉명가'}
                                        </td>
                                        <th className="w-12 bg-slate-100 border border-slate-800 p-1 text-[10px] font-black text-center">성 명</th>
                                        <td className="border border-slate-800 p-1 text-xs text-center relative">
                                            <span className="font-bold">{companyInfo?.representative_name || '관리자'}</span>
                                            <div className="absolute top-0 right-1 w-6 h-6 opacity-20 border border-rose-500 rounded-full flex items-center justify-center text-[8px] font-bold text-rose-500">인</div>
                                        </td>
                                    </tr>
                                    <tr>
                                        <th className="bg-slate-100 border border-slate-800 p-1 text-[10px] font-black">주 소</th>
                                        <td colSpan={3} className="border border-slate-800 p-1 text-[9px] leading-tight font-medium">
                                            {companyInfo?.address || '강원특별자치도 강릉시...'}
                                        </td>
                                    </tr>
                                    <tr>
                                        <th className="bg-slate-100 border border-slate-800 p-1 text-[10px] font-black">전 화</th>
                                        <td colSpan={3} className="border border-slate-800 p-1 text-xs font-bold">
                                            {companyInfo?.phone_number || companyInfo?.mobile_number || '-'}
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Amount in Korean */}
                    <div className="border-2 border-slate-800 p-3 mb-4 bg-slate-50 flex justify-between items-center px-8">
                        <div className="flex items-center gap-4">
                            <span className="text-xs font-black text-slate-400">합계금액 (KOR)</span>
                            <span className="text-lg font-black text-slate-800">일금 {numberToKorean(summary.amount)} 원정</span>
                        </div>
                        <div className="text-slate-400 text-sm italic font-medium">
                            ( ￦ {formatCurrency(summary.amount)} )
                        </div>
                    </div>

                    {/* Items Table */}
                    <div className="border-x-2 border-t-2 border-slate-800">
                        <table className="w-full border-collapse table-fixed">
                            <thead className="bg-slate-100 border-b-2 border-slate-800">
                                <tr>
                                    <th className="w-10 p-2 text-[10px] font-black border-r border-slate-800">NO</th>
                                    <th className="w-auto p-2 text-[10px] font-black border-r border-slate-800">품목 및 규격</th>
                                    <th className="w-12 p-2 text-[10px] font-black border-r border-slate-800">단위</th>
                                    <th className="w-12 p-2 text-[10px] font-black border-r border-slate-800">수량</th>
                                    <th className="w-24 p-2 text-[10px] font-black border-r border-slate-800">단가</th>
                                    <th className="w-28 p-2 text-[10px] font-black border-r border-slate-800">공급가액</th>
                                    <th className="w-20 p-2 text-[10px] font-black border-r border-slate-800">세액</th>
                                    <th className="w-24 p-2 text-[10px] font-black">비고</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800">
                                {displayRows.map((row, idx) => (
                                    <tr key={idx} className="h-9 border-b border-slate-800">
                                        <td className="p-1 text-[10px] font-bold text-slate-400 text-center border-r border-slate-800">{idx + 1}</td>
                                        <td className="p-1 px-3 text-xs font-black text-slate-800 border-r border-slate-800 whitespace-nowrap overflow-hidden text-ellipsis">
                                            {row?.product}
                                            {row?.spec && <span className="ml-2 text-[9px] font-normal text-slate-400">({row.spec})</span>}
                                        </td>
                                        <td className="p-1 text-[10px] font-bold text-center border-r border-slate-800">{row ? 'EA' : ''}</td>
                                        <td className="p-1 text-[10px] font-black text-center border-r border-slate-800">{row?.qty}</td>
                                        <td className="p-1 px-2 text-[10px] font-bold text-right border-r border-slate-800">{row ? formatCurrency(row.price) : ''}</td>
                                        <td className="p-1 px-2 text-[10px] font-black text-right border-r border-slate-800 bg-slate-50/30">{row ? formatCurrency(row.supplyValue || row.amount) : ''}</td>
                                        <td className="p-1 px-2 text-[10px] font-bold text-right border-r border-slate-800">{row ? formatCurrency(row.vatAmount || 0) : ''}</td>
                                        <td className="p-1 px-2 text-[9px] text-slate-500 overflow-hidden text-ellipsis whitespace-nowrap">{row?.shipName || ''}</td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot className="bg-slate-50/80 border-t-2 border-slate-800">
                                <tr className="h-8">
                                    <td colSpan={4} className="text-center text-xs font-black border-r border-slate-800">소 계</td>
                                    <td className="border-r border-slate-800"></td>
                                    <td className="p-1 px-2 text-xs font-black text-right border-r border-slate-800">{formatCurrency(summary.supply)}</td>
                                    <td className="p-1 px-2 text-xs font-black text-right border-r border-slate-800">{formatCurrency(summary.vat)}</td>
                                    <td></td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>

                    {/* Totals Summary & Footer wrapped to prevent breaking */}
                    <div className="no-break">
                        <div className="flex mt-2 border-2 border-slate-800 divide-x-2 divide-slate-800 bg-slate-900 text-white rounded-lg overflow-hidden">
                            <div className="flex-1 p-2 flex justify-between items-center px-6">
                                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Total Supply Value</span>
                                <span className="text-sm font-black whitespace-nowrap">￦ {formatCurrency(summary.supply)}</span>
                            </div>
                            <div className="flex-1 p-2 flex justify-between items-center px-6">
                                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Total VAT</span>
                                <span className="text-sm font-black whitespace-nowrap">￦ {formatCurrency(summary.vat)}</span>
                            </div>
                            <div className="flex-[1.2] p-2 flex justify-between items-center px-8 bg-indigo-600">
                                <span className="text-xs font-black uppercase tracking-widest">Grand Total</span>
                                <span className="text-lg font-black whitespace-nowrap">￦ {formatCurrency(summary.amount)}</span>
                            </div>
                        </div>

                        <div className="mt-6 text-center space-y-1">
                            <p className="text-sm font-bold text-slate-700">위와 같이 정히 영수(청구)합니다.</p>
                            <div className="flex items-center justify-center gap-2 text-[10px] font-black text-slate-300 italic pt-4">
                                <FileText size={12} />
                                Generated by Mycelium Smart Farm Integration System v2.0
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <style>
                {statementStyles}
            </style>
        </div>
    );
};

export default TransactionStatementView;

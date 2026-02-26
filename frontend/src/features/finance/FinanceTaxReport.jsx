import React, { useState, useEffect, useMemo } from 'react';
import { formatCurrency, formatDate } from '../../utils/common';
import { useModal } from '../../contexts/ModalContext';
import { invoke } from '../../utils/apiBridge';

const FinanceTaxReport = () => {
    const { showAlert } = useModal();
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

    // Setting up date range (default: current month)
    useEffect(() => {
        const now = new Date();
        const start = new Date(now.getFullYear(), now.getMonth(), 1);
        const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        setStartDate(start.toISOString().split('T')[0]);
        setEndDate(end.toISOString().split('T')[0]);
    }, []);

    const [reportData, setReportData] = useState({
        taxableSales: [],
        exemptSales: [],
        purchases: [],
        summary: {
            taxableSalesAmt: 0, taxableSalesSupply: 0, taxableSalesVat: 0,
            exemptSalesAmt: 0, totalSalesAmt: 0,
            purchaseAmt: 0, purchaseSupply: 0, purchaseVat: 0
        }
    });
    const [isLoading, setIsLoading] = useState(false);

    const loadReport = async () => {
        setIsLoading(true);
        try {
            const data = await invoke('get_tax_report', {
                start_date: startDate,
                end_date: endDate,
            });

            let taxableSales = [];
            let exemptSales = [];
            let purchases = [];

            let sum = {
                taxableSalesAmt: 0, taxableSalesSupply: 0, taxableSalesVat: 0,
                exemptSalesAmt: 0, totalSalesAmt: 0,
                purchaseAmt: 0, purchaseSupply: 0, purchaseVat: 0
            };

            (data || []).forEach(item => {
                const amt = item.total_amount || 0;
                const supply = item.supply_value || 0;
                const vat = item.vat_amount || 0;
                const exemptPart = item.tax_exempt_value || 0;

                if (item.direction === '매출') {
                    sum.totalSalesAmt += amt;
                    if (item.tax_type === '면세') {
                        exemptSales.push(item);
                        sum.exemptSalesAmt += amt;
                    } else if (item.tax_type === '과세' || item.tax_type === '복합') {
                        taxableSales.push(item);
                        sum.taxableSalesAmt += (amt - exemptPart);
                        sum.taxableSalesSupply += supply;
                        sum.taxableSalesVat += vat;
                        if (exemptPart > 0) {
                            exemptSales.push({ ...item, name: `[면세분] ${item.name}`, total_amount: exemptPart });
                            sum.exemptSalesAmt += exemptPart;
                        }
                    }
                } else {
                    // 매입 (Expense/Purchases)
                    purchases.push(item);
                    sum.purchaseAmt += amt;
                    sum.purchaseSupply += supply;
                    sum.purchaseVat += vat;
                }
            });

            setReportData({ taxableSales, exemptSales, purchases, summary: sum });
        } catch (e) {
            console.error(e);
            showAlert("오류", "리포트 로드 실패: " + e);
        } finally {
            setIsLoading(false);
        }
    };

    const handleExportExcel = async () => {
        if (reportData.summary.totalSalesAmt === 0 && reportData.summary.purchaseAmt === 0) {
            showAlert("알림", "저장할 데이터가 없습니다.");
            return;
        }

        let csv = '\uFEFF[종합 세무 신고 지원 자료]\n';
        csv += `조회 기간: ${startDate} ~ ${endDate}\n\n`;

        csv += '[매출 합계 (Output VAT)]\n';
        csv += `과세 공급가액,${reportData.summary.taxableSalesSupply}\n`;
        csv += `과세 부가세,${reportData.summary.taxableSalesVat}\n`;
        csv += `면세 공급가액,${reportData.summary.exemptSalesAmt}\n`;
        csv += `매출 총액,${reportData.summary.totalSalesAmt}\n\n`;

        csv += '[매입 합계 (Input VAT)]\n';
        csv += `매입 공급가액,${reportData.summary.purchaseSupply}\n`;
        csv += `매입 부가세,${reportData.summary.purchaseVat}\n`;
        csv += `매입 총액,${reportData.summary.purchaseAmt}\n\n`;

        csv += '구분,분류,날짜,항목명,공급가액,부가세,합계,비고\n';

        const allData = [...reportData.taxableSales, ...reportData.exemptSales, ...reportData.purchases];
        allData.forEach(r => {
            const row = [
                r.direction,
                r.category,
                r.date,
                r.name,
                r.supply_value,
                r.vat_amount,
                r.total_amount,
                r.memo || '-'
            ].join(',');
            csv += row + '\n';
        });

        // ... CSV construction ...
        // Using Blob for web download
        const fileName = `부가세신고지원_${startDate.replace(/-/g, '')}~${endDate.replace(/-/g, '')}.csv`;
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', fileName);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        showAlert("성공", "파일이 다운로드되었습니다.");
    };

    const handleDownloadPDF = async () => {
        setIsLoading(true);
        try {
            const query = new URLSearchParams({
                start_date: startDate,
                end_date: endDate,
            });

            let baseUrl = localStorage.getItem('API_BASE_URL') || '';
            if (baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);
            const token = localStorage.getItem('token');

            const url = `${baseUrl}/api/finance/report/pdf?${query.toString()}`;
            const response = await fetch(url, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(errorText || `Status: ${response.status}`);
            }

            const blob = await response.blob();
            const downloadUrl = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = downloadUrl;
            a.download = `세무보고서_${startDate.replace(/-/g, '')}_${endDate.replace(/-/g, '')}.pdf`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(downloadUrl);
            document.body.removeChild(a);
        } catch (e) {
            console.error(e);
            showAlert("오류", "PDF 다운로드 실패: " + e.message);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSubmitTaxReport = async () => {
        const allData = [...(reportData.taxableSales || []), ...(reportData.exemptSales || []), ...(reportData.purchases || [])];
        if (allData.length === 0) {
            showAlert("알림", "신고할 데이터가 없습니다. 먼저 조회하기를 눌러주세요.");
            return;
        }

        const confirm = window.confirm(`[세무신고 자동화]\n\n조회된 ${allData.length}건의 자료를 국세청(연동된 API)으로 전송하시겠습니까?\n\n이 작업은 시스템 로그에 기록되며 취소할 수 없습니다.`);
        if (!confirm) return;

        setIsLoading(true);
        try {
            const result = await invoke('submit_tax_report', {
                items: allData,
                start_date: startDate,
                end_date: endDate
            });
            showAlert("전송 성공", result);
        } catch (e) {
            console.error(e);
            showAlert("전송 실패", "세무신고 오류: " + e);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="h-full flex flex-col bg-slate-50 p-6 lg:p-8 overflow-hidden font-sans">
            {/* Header */}
            <div className="mb-8 flex justify-between items-end">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <span className="w-8 h-1 bg-indigo-600 rounded-full"></span>
                        <span className="text-[10px] font-black tracking-[0.2em] text-indigo-600 uppercase">Tax & VAT Report</span>
                    </div>
                    <h1 className="text-3xl font-black text-slate-600 tracking-tighter" style={{ fontFamily: '"Noto Sans KR", sans-serif' }}>세무/부가세 신고 지원 <span className="text-slate-300 font-light ml-1 text-xl">Tax Support</span></h1>
                </div>

                <div className="flex items-center gap-3 bg-white p-2 rounded-2xl shadow-sm border border-slate-200">
                    <div className="flex items-center gap-2 px-3 border-r border-slate-100">
                        <label htmlFor="tax-start-date" className="text-[10px] font-bold text-slate-400 uppercase">시작</label>
                        <input
                            id="tax-start-date"
                            type="date"
                            value={startDate}
                            onChange={e => setStartDate(e.target.value)}
                            className="text-sm font-black text-slate-700 outline-none border-none bg-transparent w-40 font-mono"
                        />
                    </div>
                    <div className="flex items-center gap-2 px-3 border-r border-slate-100">
                        <label htmlFor="tax-end-date" className="text-[10px] font-bold text-slate-400 uppercase">종료</label>
                        <input
                            id="tax-end-date"
                            type="date"
                            value={endDate}
                            onChange={e => setEndDate(e.target.value)}
                            className="text-sm font-black text-slate-700 outline-none border-none bg-transparent w-40 font-mono"
                        />
                    </div>
                    <button
                        onClick={loadReport}
                        disabled={isLoading}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2.5 rounded-xl font-black text-sm transition-all shadow-md shadow-indigo-100 flex items-center gap-2 disabled:opacity-50"
                    >
                        <span className="material-symbols-rounded text-lg">analytics</span>
                        조회하기
                    </button>
                    <button
                        onClick={handleExportExcel}
                        className="bg-emerald-500 hover:bg-emerald-600 text-white px-5 py-2.5 rounded-xl font-black text-sm transition-all shadow-md shadow-emerald-100 flex items-center gap-2"
                    >
                        <span className="material-symbols-rounded text-lg">download</span>
                        신고용 엑셀
                    </button>
                    <button
                        onClick={handleDownloadPDF}
                        className="bg-slate-700 hover:bg-slate-800 text-white px-5 py-2.5 rounded-xl font-black text-sm transition-all shadow-md shadow-slate-100 flex items-center gap-2"
                    >
                        <span className="material-symbols-rounded text-lg">picture_as_pdf</span>
                        PDF 리포트
                    </button>
                    <button
                        onClick={handleSubmitTaxReport}
                        disabled={isLoading}
                        className="bg-violet-600 hover:bg-violet-700 text-white px-5 py-2.5 rounded-xl font-black text-sm transition-all shadow-md shadow-violet-100 flex items-center gap-2 disabled:opacity-50"
                    >
                        <span className="material-symbols-rounded text-lg">rocket_launch</span>
                        자동신고 (API)
                    </button>
                </div>
            </div>

            {/* Summary Grid */}
            <div className="grid grid-cols-3 gap-6 mb-8 shrink-0">
                <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200 relative overflow-hidden group hover:shadow-md transition-all">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-50 rounded-bl-full -mr-16 -mt-16 transition-transform group-hover:scale-110"></div>
                    <div className="relative z-10">
                        <p className="text-[11px] font-black text-indigo-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                            <span className="material-symbols-rounded text-lg">trending_up</span> 매출 합계 (Sales/Revenue)
                        </p>
                        <div className="space-y-3">
                            <div className="flex justify-between items-center text-sm font-bold text-slate-500">
                                <span>공급가액 (과세+면세)</span>
                                <span className="text-slate-700">{formatCurrency(reportData.summary.taxableSalesSupply + reportData.summary.exemptSalesAmt)}원</span>
                            </div>
                            <div className="flex justify-between items-center text-sm font-bold text-slate-500 border-b border-slate-50 pb-2">
                                <span>매출 부가세 (Output VAT)</span>
                                <span className="text-indigo-600">+{formatCurrency(reportData.summary.taxableSalesVat)}원</span>
                            </div>
                            <div className="flex justify-between items-center bg-indigo-50/50 p-2 rounded-lg">
                                <span className="text-xs font-black text-indigo-400">총 매출액</span>
                                <span className="text-xl font-black text-indigo-700 tracking-tight">{formatCurrency(reportData.summary.totalSalesAmt)}원</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200 relative overflow-hidden group hover:shadow-md transition-all">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-rose-50 rounded-bl-full -mr-16 -mt-16 transition-transform group-hover:scale-110"></div>
                    <div className="relative z-10">
                        <p className="text-[11px] font-black text-rose-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                            <span className="material-symbols-rounded text-lg">trending_down</span> 매입/비용 합계 (Expenses)
                        </p>
                        <div className="space-y-3">
                            <div className="flex justify-between items-center text-sm font-bold text-slate-500">
                                <span>공급가액 (Input)</span>
                                <span className="text-slate-700">{formatCurrency(reportData.summary.purchaseSupply)}원</span>
                            </div>
                            <div className="flex justify-between items-center text-sm font-bold text-slate-500 border-b border-slate-50 pb-2">
                                <span>매입 부가세 (Input VAT)</span>
                                <span className="text-rose-600">-{formatCurrency(reportData.summary.purchaseVat)}원</span>
                            </div>
                            <div className="flex justify-between items-center bg-rose-50/50 p-2 rounded-lg">
                                <span className="text-xs font-black text-rose-400">총 매입액</span>
                                <span className="text-xl font-black text-rose-700 tracking-tight">{formatCurrency(reportData.summary.purchaseAmt)}원</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="bg-slate-900 rounded-3xl p-6 shadow-xl relative overflow-hidden group">
                    <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 to-transparent opacity-50"></div>
                    <div className="relative z-10">
                        <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                            <span className="material-symbols-rounded text-lg text-white">account_balance_wallet</span> 납부 예상 세액 (Estimated VAT)
                        </p>
                        <div className="flex flex-col justify-center h-[116px]">
                            <p className="text-xs font-bold text-slate-500 mb-2">매출세 - 매입세</p>
                            <p className="text-3xl font-black text-white tracking-tighter tabular-nums">
                                {formatCurrency(reportData.summary.taxableSalesVat - reportData.summary.purchaseVat)} <span className="text-base font-medium text-slate-500">원</span>
                            </p>
                            <div className="mt-4 flex gap-4">
                                <div className="text-[10px] text-slate-400">데이터: <span className="text-white font-bold">{reportData.taxableSales.length + reportData.exemptSales.length + reportData.purchases.length}건</span></div>
                                <div className="text-[10px] text-slate-400">상태: <span className="text-emerald-400 font-bold">집계완료</span></div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* List Panels */}
            <div className="flex-1 grid grid-cols-2 gap-6 min-h-0">
                {/* Revenue List */}
                <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
                    <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                        <h3 className="text-sm font-black text-slate-700 flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-indigo-500"></span> 매출 내역 (Revenue List)
                        </h3>
                        <span className="text-[10px] font-bold text-slate-400 font-mono">{(reportData.taxableSales?.length || 0) + (reportData.exemptSales?.length || 0)} 건</span>
                    </div>
                    <div className="flex-1 overflow-auto stylish-scrollbar">
                        <table className="w-full text-[11px] border-collapse">
                            <thead className="sticky top-0 bg-white shadow-sm z-10">
                                <tr>
                                    <th className="p-3 text-left font-bold text-slate-400 border-b border-slate-100">분류</th>
                                    <th className="p-3 text-left font-bold text-slate-400 border-b border-slate-100">날짜</th>
                                    <th className="p-3 text-left font-bold text-slate-400 border-b border-slate-100">항목명</th>
                                    <th className="p-3 text-right font-bold text-slate-400 border-b border-slate-100">부가세</th>
                                    <th className="p-3 text-right font-bold text-slate-400 border-b border-slate-100">합계</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {[...(reportData.taxableSales || []), ...(reportData.exemptSales || [])].map((r, i) => (
                                    <tr key={i} className="hover:bg-indigo-50/30 transition-colors group">
                                        <td className="p-3 font-bold text-indigo-400">{r.category}</td>
                                        <td className="p-3 font-mono text-slate-400">{r.date}</td>
                                        <td className="p-3 font-bold text-slate-700 truncate max-w-[120px]" title={r.name}>{r.name}</td>
                                        <td className="p-3 text-right font-black text-indigo-500">{formatCurrency(r.vat_amount)}</td>
                                        <td className="p-3 text-right font-black text-slate-800 tabular-nums">{formatCurrency(r.total_amount)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Expense List */}
                <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
                    <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                        <h3 className="text-sm font-black text-slate-700 flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-rose-500"></span> 매입/지출 내역 (Expense List)
                        </h3>
                        <span className="text-[10px] font-bold text-slate-400 font-mono">{(reportData.purchases?.length || 0)} 건</span>
                    </div>
                    <div className="flex-1 overflow-auto stylish-scrollbar">
                        <table className="w-full text-[11px] border-collapse">
                            <thead className="sticky top-0 bg-white shadow-sm z-10">
                                <tr>
                                    <th className="p-3 text-left font-bold text-slate-400 border-b border-slate-100">분류</th>
                                    <th className="p-3 text-left font-bold text-slate-400 border-b border-slate-100">날짜</th>
                                    <th className="p-3 text-left font-bold text-slate-400 border-b border-slate-100">항목명</th>
                                    <th className="p-3 text-right font-bold text-slate-400 border-b border-slate-100">부가세(공제)</th>
                                    <th className="p-3 text-right font-bold text-slate-400 border-b border-slate-100">합계</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {(reportData.purchases || []).map((r, i) => (
                                    <tr key={i} className="hover:bg-rose-50/30 transition-colors group">
                                        <td className="p-3 font-bold text-rose-400">{r.category}</td>
                                        <td className="p-3 font-mono text-slate-400">{r.date}</td>
                                        <td className="p-3 font-bold text-slate-700 truncate max-w-[120px]" title={r.name}>{r.name}</td>
                                        <td className="p-3 text-right font-black text-rose-500">{formatCurrency(r.vat_amount)}</td>
                                        <td className="p-3 text-right font-black text-slate-800 tabular-nums">{formatCurrency(r.total_amount)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <p className="mt-4 text-[10px] text-slate-400 italic">
                * 위 자료는 국세청 홈택스 직접 신고를 돕기 위한 참고 자료이며, 법적 증빙 자료로 활용 시 국세청에 집계된 카드/현금영수증 내역과 반드시 대조하시기 바랍니다.
            </p>
        </div>
    );
};

export default FinanceTaxReport;

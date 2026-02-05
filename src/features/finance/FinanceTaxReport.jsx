import React, { useState, useEffect, useMemo } from 'react';
import { formatCurrency, formatDate } from '../../utils/common';
import { useModal } from '../../contexts/ModalContext';

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
        taxable: [],
        exempt: [],
        summary: { taxableAmt: 0, taxableSupply: 0, taxableVat: 0, exemptAmt: 0, totalAmt: 0 }
    });
    const [isLoading, setIsLoading] = useState(false);

    const loadReport = async () => {
        if (!window.__TAURI__) return;
        setIsLoading(true);
        try {
            const data = await window.__TAURI__.core.invoke('get_tax_report', { startDate, endDate });

            let taxable = [];
            let exempt = [];
            let sum = { taxableAmt: 0, taxableSupply: 0, taxableVat: 0, exemptAmt: 0, totalAmt: 0 };

            (data || []).forEach(item => {
                const taxType = item.tax_type || '면세';
                const amt = item.total_amount || 0;
                const supply = item.supply_value || 0;
                const vat = item.vat_amount || 0;
                const exemptPart = (item.tax_exempt_value !== undefined && item.tax_exempt_value !== null) ? item.tax_exempt_value : (taxType === '면세' ? amt : 0);
                const taxablePart = (taxType === '과세') ? amt : (supply + vat);

                if (taxType === '복합') {
                    if (taxablePart > 0) {
                        taxable.push({ ...item, display_amount: taxablePart, display_tax_type: '과세(분분)' });
                        sum.taxableAmt += taxablePart;
                        sum.taxableSupply += supply;
                        sum.taxableVat += vat;
                    }
                    if (exemptPart > 0) {
                        exempt.push({ ...item, display_amount: exemptPart, display_tax_type: '면세(분분)' });
                        sum.exemptAmt += exemptPart;
                    }
                } else if (taxType === '과세') {
                    taxable.push(item);
                    sum.taxableAmt += amt;
                    sum.taxableSupply += supply;
                    sum.taxableVat += vat;
                } else {
                    exempt.push(item);
                    sum.exemptAmt += amt;
                }
                sum.totalAmt += amt;
            });

            setReportData({ taxable, exempt, summary: sum });
        } catch (e) {
            console.error(e);
            showAlert("오류", "리포트 로드 실패: " + e);
        } finally {
            setIsLoading(false);
        }
    };

    const handleExportExcel = async () => {
        if (reportData.totalAmt === 0) {
            showAlert("알림", "저장할 데이터가 없습니다.");
            return;
        }

        let csv = '\uFEFF[부가세 신고 지원 자료]\n';
        csv += `조회 기간: ${startDate} ~ ${endDate}\n\n`;

        csv += '[과세 매출 합계]\n';
        csv += `공급가액,${reportData.summary.taxableSupply}\n`;
        csv += `부가세,${reportData.summary.taxableVat}\n`;
        csv += `합계,${reportData.summary.taxableAmt}\n\n`;

        csv += '[면세 매출 합계]\n';
        csv += `합계(공급가액),${reportData.summary.exemptAmt}\n\n`;

        csv += '구분,날짜,상품명,규격,수량,단가,공급가액,부가세,합계\n';

        const allData = [...reportData.taxable, ...reportData.exempt];
        allData.forEach(r => {
            const row = [
                r.tax_type,
                r.order_date,
                r.product_name,
                r.specification || '-',
                r.quantity,
                r.unit_price,
                r.supply_value || r.total_amount,
                r.vat_amount || 0,
                r.total_amount
            ].join(',');
            csv += row + '\n';
        });

        try {
            const fileName = `부가세신고지원_${startDate.replace(/-/g, '')}~${endDate.replace(/-/g, '')}.csv`;
            const filePath = await window.__TAURI__.core.invoke('plugin:dialog|save', {
                options: { defaultPath: fileName, filters: [{ name: 'CSV File', extensions: ['csv'] }] }
            });
            if (filePath) {
                await window.__TAURI__.core.invoke('plugin:fs|write_text_file', { path: filePath, contents: csv });
                showAlert("성공", "파일이 성공적으로 저장되었습니다.");
            }
        } catch (e) {
            showAlert("오류", "파일 저장 실패: " + e);
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
                        <span className="text-[10px] font-bold text-slate-400 uppercase">시작</span>
                        <input
                            type="date"
                            value={startDate}
                            onChange={e => setStartDate(e.target.value)}
                            className="text-sm font-black text-slate-700 outline-none border-none bg-transparent w-40 font-mono"
                        />
                    </div>
                    <div className="flex items-center gap-2 px-3 border-r border-slate-100">
                        <span className="text-[10px] font-bold text-slate-400 uppercase">종료</span>
                        <input
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
                </div>
            </div>

            {/* Summary Grid */}
            <div className="grid grid-cols-3 gap-6 mb-8 shrink-0">
                <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200 relative overflow-hidden group hover:shadow-md transition-all">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-50 rounded-bl-full -mr-16 -mt-16 transition-transform group-hover:scale-110"></div>
                    <div className="relative z-10">
                        <p className="text-[11px] font-black text-indigo-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                            <span className="material-symbols-rounded text-lg">payments</span> 과세 매출 합계 (Taxable)
                        </p>
                        <div className="space-y-3">
                            <div className="flex justify-between items-center text-sm font-bold text-slate-500">
                                <span>공급가액</span>
                                <span className="text-slate-700">{formatCurrency(reportData.summary.taxableSupply)}원</span>
                            </div>
                            <div className="flex justify-between items-center text-sm font-bold text-slate-500 border-b border-slate-50 pb-2">
                                <span>부가세 (VAT)</span>
                                <span className="text-indigo-600">+{formatCurrency(reportData.summary.taxableVat)}원</span>
                            </div>
                            <div className="flex justify-between items-center bg-indigo-50/50 p-2 rounded-lg">
                                <span className="text-xs font-black text-indigo-400">합계</span>
                                <span className="text-xl font-black text-indigo-700 tracking-tight">{formatCurrency(reportData.summary.taxableAmt)}원</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200 relative overflow-hidden group hover:shadow-md transition-all">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-50 rounded-bl-full -mr-16 -mt-16 transition-transform group-hover:scale-110"></div>
                    <div className="relative z-10">
                        <p className="text-[11px] font-black text-emerald-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                            <span className="material-symbols-rounded text-lg">agriculture</span> 면세 매출 합계 (Exempt)
                        </p>
                        <div className="flex flex-col justify-center h-[116px]">
                            <p className="text-xs font-bold text-slate-400 mb-2">총 면세 매출액</p>
                            <p className="text-3xl font-black text-emerald-600 tracking-tighter tabular-nums">
                                {formatCurrency(reportData.summary.exemptAmt)} <span className="text-base font-medium text-slate-400">원</span>
                            </p>
                        </div>
                    </div>
                </div>

                <div className="bg-slate-900 rounded-3xl p-6 shadow-xl relative overflow-hidden group">
                    <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 to-transparent opacity-50"></div>
                    <div className="relative z-10">
                        <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                            <span className="material-symbols-rounded text-lg text-white">calculate</span> 전체 총계 (Total Business)
                        </p>
                        <div className="flex flex-col justify-center h-[116px]">
                            <p className="text-xs font-bold text-slate-500 mb-2">과세 + 면세 총 매출</p>
                            <p className="text-3xl font-black text-white tracking-tighter tabular-nums">
                                {formatCurrency(reportData.summary.totalAmt)} <span className="text-base font-medium text-slate-500">원</span>
                            </p>
                            <div className="mt-4 flex gap-4">
                                <div className="text-[10px] text-slate-400">상품수: <span className="text-white font-bold">{reportData.taxable.length + reportData.exempt.length}건</span></div>
                                <div className="text-[10px] text-slate-400">조회일: <span className="text-white font-bold">{formatDate(new Date())}</span></div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* List Panels */}
            <div className="flex-1 grid grid-cols-2 gap-6 min-h-0">
                {/* Taxable List */}
                <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
                    <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                        <h3 className="text-sm font-black text-slate-700 flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-indigo-500"></span> 과세 매출 상세 (Taxable List)
                        </h3>
                        <span className="text-[10px] font-bold text-slate-400 font-mono">{reportData.taxable.length} Rows</span>
                    </div>
                    <div className="flex-1 overflow-auto stylish-scrollbar">
                        <table className="w-full text-[11px] border-collapse">
                            <thead className="sticky top-0 bg-white shadow-sm z-10">
                                <tr>
                                    <th className="p-3 text-left font-bold text-slate-400 border-b border-slate-100">날짜</th>
                                    <th className="p-3 text-left font-bold text-slate-400 border-b border-slate-100">상품명</th>
                                    <th className="p-3 text-right font-bold text-slate-400 border-b border-slate-100">공급가액</th>
                                    <th className="p-3 text-right font-bold text-slate-400 border-b border-slate-100">부가세</th>
                                    <th className="p-3 text-right font-bold text-slate-400 border-b border-slate-100">합계</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {reportData.taxable.map((r, i) => (
                                    <tr key={i} className="hover:bg-indigo-50/30 transition-colors group">
                                        <td className="p-3 font-mono text-slate-400">{r.order_date}</td>
                                        <td className="p-3 font-bold text-slate-700 truncate max-w-[120px]" title={r.product_name}>{r.product_name}</td>
                                        <td className="p-3 text-right font-black text-slate-600">{formatCurrency(r.supply_value || r.display_amount || r.total_amount)}</td>
                                        <td className="p-3 text-right font-black text-indigo-500">{formatCurrency(r.vat_amount || 0)}</td>
                                        <td className="p-3 text-right font-black text-slate-800 tabular-nums">{formatCurrency(r.display_amount || r.total_amount)}</td>
                                    </tr>
                                ))}
                                {reportData.taxable.length === 0 && (
                                    <tr><td colSpan="5" className="py-20 text-center text-slate-300 font-bold italic">과세 거래 내역이 없습니다.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Exempt List */}
                <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
                    <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                        <h3 className="text-sm font-black text-slate-700 flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-emerald-500"></span> 면세 매출 상세 (Exempt List)
                        </h3>
                        <span className="text-[10px] font-bold text-slate-400 font-mono">{reportData.exempt.length} Rows</span>
                    </div>
                    <div className="flex-1 overflow-auto stylish-scrollbar">
                        <table className="w-full text-[11px] border-collapse">
                            <thead className="sticky top-0 bg-white shadow-sm z-10">
                                <tr>
                                    <th className="p-3 text-left font-bold text-slate-400 border-b border-slate-100">날짜</th>
                                    <th className="p-3 text-left font-bold text-slate-400 border-b border-slate-100">상품명</th>
                                    <th className="p-3 text-right font-bold text-slate-400 border-b border-slate-100">공급가액(면세)</th>
                                    <th className="p-3 text-right font-bold text-slate-400 border-b border-slate-100">합계</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {reportData.exempt.map((r, i) => (
                                    <tr key={i} className="hover:bg-emerald-50/30 transition-colors group">
                                        <td className="p-3 font-mono text-slate-400">{r.order_date}</td>
                                        <td className="p-3 font-bold text-slate-700 truncate max-w-[120px]" title={r.product_name}>{r.product_name}</td>
                                        <td className="p-3 text-right font-black text-slate-600">{formatCurrency(r.display_amount || r.total_amount)}</td>
                                        <td className="p-3 text-right font-black text-emerald-600 tabular-nums">{formatCurrency(r.display_amount || r.total_amount)}</td>
                                    </tr>
                                ))}
                                {reportData.exempt.length === 0 && (
                                    <tr><td colSpan="4" className="py-20 text-center text-slate-300 font-bold italic">면세 거래 내역이 없습니다.</td></tr>
                                )}
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

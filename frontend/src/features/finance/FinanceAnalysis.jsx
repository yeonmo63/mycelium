import React, { useState, useEffect, useRef } from 'react';
import { Chart, registerables } from 'chart.js';
import { formatCurrency } from '../../utils/common';
import { handlePrintRaw } from '../../utils/printUtils';
import { useModal } from '../../contexts/ModalContext';

Chart.register(...registerables);

const financePrintStyles = `
    @media print {
        @page { size: A4 portrait; margin: 15mm; }
        html, body { 
            background: white !important; 
            color: black !important;
            color-scheme: light !important;
            margin: 0 !important;
            padding: 0 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
        }
    }
    .print-report-wrapper { 
        font-family: 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif; 
        padding: 0; 
        color: #000; 
        width: 100%;
        box-sizing: border-box;
    }
    .report-card {
        border: 1px solid #000;
        padding: 30px;
        margin-bottom: 20px;
        position: relative;
    }
    .report-header { 
        text-align: center; 
        margin-bottom: 40px; 
    }
    .report-header h1 { 
        margin: 0; 
        font-size: 32px; 
        font-weight: 900; 
        letter-spacing: 0.2em; 
        text-decoration: underline;
        text-underline-offset: 10px;
    }
    .report-header .info {
        margin-top: 20px;
        display: flex;
        justify-content: space-between;
        font-size: 14px;
        font-weight: bold;
    }
    .stats-grid {
        display: grid;
        grid-template-cols: repeat(3, 1fr);
        gap: 20px;
        margin-bottom: 30px;
    }
    .stat-box {
        border: 2px solid #000;
        padding: 15px;
        text-align: center;
    }
    .stat-box .label { font-size: 12px; color: #555; margin-bottom: 5px; font-weight: bold; }
    .stat-box .value { font-size: 20px; font-weight: 900; }
    
    .section-title {
        font-size: 18px;
        font-weight: 900;
        margin: 30px 0 15px 0;
        padding-left: 10px;
        border-left: 5px solid #000;
    }
    
    table { 
        width: 100%; 
        border-collapse: collapse; 
        font-size: 12px; 
        border: 2px solid #000; 
    }
    th, td { 
        border: 1px solid #000; 
        padding: 8px 10px; 
        text-align: center; 
    }
    th { 
        background: #f0f0f0 !important; 
        font-weight: 900; 
    }
    .text-right { text-align: right; }
    .chart-placeholder {
        width: 100%;
        height: 300px;
        border: 1px dashed #ccc;
        display: flex;
        align-items: center;
        justify-content: center;
        margin: 20px 0;
        background: #fafafa;
    }
`;

/**
 * FinanceAnalysis.jsx
 * 손익/재무 분석
 * MushroomFarm의 기능을 포팅하고 Premium UI를 적용함.
 */
const FinanceAnalysis = () => {
    const { showAlert } = useModal();

    // --- State ---
    const [year, setYear] = useState(new Date().getFullYear());
    const [stats, setStats] = useState({ revenue: 0, cost: 0, profit: 0, margin: 0 });
    const [monthlyData, setMonthlyData] = useState([]);
    const [costBreakdown, setCostBreakdown] = useState([]);
    const [topVendors, setTopVendors] = useState([]);
    const [isLoading, setIsLoading] = useState(false);

    // Refs for Charts
    const monthlyChartRef = useRef(null);
    const costChartRef = useRef(null);
    const monthlyChartInstance = useRef(null);
    const costChartInstance = useRef(null);

    // Year Options (Last 5 Years)
    const currentYear = new Date().getFullYear();
    const years = Array.from({ length: 5 }, (_, i) => currentYear - i);

    // --- Init ---
    useEffect(() => {
        loadData();
    }, [year]);

    // Handle Chart Rendering
    useEffect(() => {
        if (!isLoading && monthlyData.length > 0) {
            renderMonthlyChart();
        }
    }, [monthlyData, isLoading]);

    useEffect(() => {
        if (!isLoading && costBreakdown.length > 0) {
            renderCostChart();
        }
    }, [costBreakdown, isLoading]);

    const loadData = async () => {
        setIsLoading(true);
        try {
            // Parallel Fetch
            const [plRes, costRes, vendorRes] = await Promise.all([
                fetch(`/api/finance/analysis/monthly-pl?year=${year}`),
                fetch(`/api/finance/analysis/cost-breakdown?year=${year}`),
                fetch(`/api/finance/analysis/vendor-ranking?year=${year}`)
            ]);

            const plData = plRes.ok ? await plRes.json() : [];
            const costData = costRes.ok ? await costRes.json() : [];
            const vendorData = vendorRes.ok ? await vendorRes.json() : [];

            // Process Stats
            const totalRev = plData.reduce((sum, d) => sum + d.revenue, 0);
            const totalCost = plData.reduce((sum, d) => sum + d.cost, 0);
            const netProfit = totalRev - totalCost;
            const margin = totalRev > 0 ? ((netProfit / totalRev) * 100).toFixed(1) : 0;

            setStats({ revenue: totalRev, cost: totalCost, profit: netProfit, margin });
            setMonthlyData(plData || []);
            setCostBreakdown(costData || []);
            setTopVendors(vendorData || []);

        } catch (e) {
            console.error("Analysis Load Error:", e);
            showAlert("오류", "데이터 분석 중 문제가 발생했습니다: " + e);
        } finally {
            setIsLoading(false);
        }
    };

    const renderMonthlyChart = () => {
        if (!monthlyChartRef.current) return;
        const ctx = monthlyChartRef.current.getContext('2d');

        if (monthlyChartInstance.current) {
            monthlyChartInstance.current.destroy();
        }

        monthlyChartInstance.current = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: monthlyData.map(d => parseInt(d.month.split('-')[1]) + '월'),
                datasets: [
                    {
                        label: '순이익',
                        type: 'line',
                        data: monthlyData.map(d => d.profit),
                        borderColor: '#10b981',
                        backgroundColor: '#10b981',
                        borderWidth: 3,
                        pointBackgroundColor: '#fff',
                        pointBorderColor: '#10b981',
                        pointRadius: 4,
                        tension: 0.3,
                        order: 0,
                        yAxisID: 'y'
                    },
                    {
                        label: '매출',
                        data: monthlyData.map(d => d.revenue),
                        backgroundColor: 'rgba(59, 130, 246, 0.8)', // blue-500
                        borderRadius: 4,
                        order: 1
                    },
                    {
                        label: '비용',
                        data: monthlyData.map(d => d.cost),
                        backgroundColor: 'rgba(239, 68, 68, 0.8)', // red-500
                        borderRadius: 4,
                        order: 2
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false,
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { borderDash: [4, 4], color: '#f1f5f9' },
                        ticks: {
                            callback: (val) => val >= 1000000 ? (val / 10000) + '만' : val,
                            font: { family: 'Pretendard', size: 11 }
                        }
                    },
                    x: {
                        grid: { display: false },
                        ticks: { font: { family: 'Pretendard', size: 11 } }
                    }
                },
                plugins: {
                    legend: {
                        labels: { usePointStyle: true, font: { family: 'Pretendard', size: 12 } }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(15, 23, 42, 0.9)',
                        padding: 10,
                        callbacks: {
                            label: function (context) {
                                let label = context.dataset.label || '';
                                if (label) label += ': ';
                                if (context.parsed.y !== null) label += formatCurrency(context.parsed.y) + '원';
                                return label;
                            }
                        }
                    }
                }
            }
        });
    };

    const renderCostChart = () => {
        if (!costChartRef.current) return;
        const ctx = costChartRef.current.getContext('2d');

        if (costChartInstance.current) {
            costChartInstance.current.destroy();
        }

        // Colors
        const colors = [
            '#3b82f6', '#ef4444', '#f59e0b', '#10b981', '#8b5cf6',
            '#ec4899', '#6366f1', '#14b8a6', '#f43f5e', '#64748b'
        ];

        costChartInstance.current = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: costBreakdown.map(d => d.category),
                datasets: [{
                    data: costBreakdown.map(d => d.amount),
                    backgroundColor: colors.slice(0, costBreakdown.length),
                    borderWidth: 0,
                    hoverOffset: 10
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '70%',
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: 'rgba(15, 23, 42, 0.9)',
                        callbacks: {
                            label: function (context) {
                                const val = context.parsed;
                                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                const ip = ((val / total) * 100).toFixed(1);
                                return `${context.label}: ${formatCurrency(val)}원 (${ip}%)`;
                            }
                        }
                    }
                }
            }
        });
    };

    const handlePrint = () => {
        if (isLoading) return;

        const monthlyImg = monthlyChartRef.current ? monthlyChartRef.current.toDataURL('image/png') : null;
        const costImg = costChartRef.current ? costChartRef.current.toDataURL('image/png') : null;

        const html = `
            <style>${financePrintStyles}</style>
            <div class="print-report-wrapper">
                <div class="report-card">
                    <div class="report-header">
                        <h1>지능형 경영 분석 리포트</h1>
                        <div class="info">
                            <span>대상 연도: <strong>${year}년</strong></span>
                            <span>출력 일시: <strong>${new Date().toLocaleString()}</strong></span>
                        </div>
                    </div>

                    <div class="section-title">연간 경영 요약 (Annual Summary)</div>
                    <div class="stats-grid">
                        <div class="stat-box">
                            <div class="label">총 매출액 (Revenue)</div>
                            <div class="value" style="color: #2563eb;">￦ ${formatCurrency(stats.revenue)}</div>
                        </div>
                        <div class="stat-box">
                            <div class="label">총 매출비용 (Total Cost)</div>
                            <div class="value" style="color: #dc2626;">￦ ${formatCurrency(stats.cost)}</div>
                        </div>
                        <div class="stat-box">
                            <div class="label">연간 순이익 (Net Profit)</div>
                            <div class="value" style="color: #059669;">￦ ${formatCurrency(stats.profit)} (${stats.margin}%)</div>
                        </div>
                    </div>

                    <div class="section-title">월별 손익 추세 (Monthly Trend)</div>
                    ${monthlyImg ? `<img src="${monthlyImg}" style="width: 100%; height: auto; max-height: 300px; display: block; margin-bottom: 20px;" />` : '<div class="chart-placeholder">차트 로드 실패</div>'}

                    <div class="section-title">월별 손익 상세 내역</div>
                    <table>
                        <thead>
                            <tr>
                                <th>월별</th>
                                <th>매출액(A)</th>
                                <th>발생비용(B)</th>
                                <th>순수익(A-B)</th>
                                <th>이익률(%)</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${monthlyData.map(d => `
                                <tr>
                                    <td>${parseInt(d.month.split('-')[1])}월</td>
                                    <td class="text-right">${formatCurrency(d.revenue)}원</td>
                                    <td class="text-right">${formatCurrency(d.cost)}원</td>
                                    <td class="text-right" style="font-weight: bold;">${formatCurrency(d.profit)}원</td>
                                    <td>${d.revenue > 0 ? ((d.profit / d.revenue) * 100).toFixed(1) : 0}%</td>
                                </tr>
                            `).join('')}
                        </tbody>
                        <tfoot>
                            <tr style="background: #fafafa; font-weight: 900;">
                                <td>연간 합계</td>
                                <td class="text-right">${formatCurrency(stats.revenue)}원</td>
                                <td class="text-right">${formatCurrency(stats.cost)}원</td>
                                <td class="text-right">${formatCurrency(stats.profit)}원</td>
                                <td>${stats.margin}%</td>
                            </tr>
                        </tfoot>
                    </table>

                    <div style="page-break-before: always;"></div>

                    <div class="section-title">지출 항목별 비중 분석</div>
                    <div style="display: flex; gap: 40px; align-items: flex-start;">
                        <div style="flex: 1;">
                            ${costImg ? `<img src="${costImg}" style="width: 100%; max-width: 300px; display: block; margin: 0 auto;" />` : '<div class="chart-placeholder">차트 로드 실패</div>'}
                        </div>
                        <div style="flex: 1.5;">
                            <table>
                                <thead>
                                    <tr>
                                        <th>지출 카테고리</th>
                                        <th>금액</th>
                                        <th>비중(%)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${costBreakdown.map(c => `
                                        <tr>
                                            <td style="text-align: left;">${c.category}</td>
                                            <td class="text-right">${formatCurrency(c.amount)}원</td>
                                            <td class="font-bold">${c.percentage}%</td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div class="section-title">주요 협력업체 매입 순위 (TOP 5)</div>
                    <table>
                        <thead>
                            <tr>
                                <th style="width: 60px;">순위</th>
                                <th style="text-align: left;">거래처명</th>
                                <th style="width: 150px;">매입금액</th>
                                <th style="width: 80px;">거래횟수</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${topVendors.map((v, idx) => `
                                <tr>
                                    <td>${idx + 1}</td>
                                    <td style="text-align: left; font-weight: bold;">${v.vendor_name}</td>
                                    <td class="text-right">${formatCurrency(v.total_amount)}원</td>
                                    <td>${v.purchase_count}회</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>

                    <div style="margin-top: 50px; text-align: center; border-top: 1px solid #eee; pt-20px; font-size: 11px; color: #666;">
                        <p>본 보고서는 Mycelium Enterprise Intelligence 시스템에 의해 자동 분석 및 생성되었습니다.</p>
                        <p>© Mycelium ERP - All Rights Reserved.</p>
                    </div>
                </div>
            </div>
        `;

        handlePrintRaw(html);
    };

    // Helper for cost breakdown legend
    const costColors = [
        'bg-blue-500', 'bg-red-500', 'bg-amber-500', 'bg-emerald-500', 'bg-violet-500',
        'bg-pink-500', 'bg-indigo-500', 'bg-teal-500', 'bg-rose-500', 'bg-slate-500'
    ];

    return (
        <div className="flex flex-col h-full bg-[#f8fafc] overflow-hidden animate-in fade-in duration-700">
            {/* Header Area */}
            <div className="px-6 lg:px-8 pt-6 lg:pt-8 pb-4">
                <div className="flex items-center gap-2 mb-1">
                    <span className="w-6 h-1 bg-violet-600 rounded-full"></span>
                    <span className="text-[9px] font-black tracking-[0.2em] text-violet-600 uppercase">Financial Intelligence</span>
                </div>
                <h1 className="text-3xl font-black text-slate-600 tracking-tighter" style={{ fontFamily: '"Noto Sans KR", sans-serif' }}>
                    손익/재무 분석 <span className="text-slate-300 font-light ml-1 text-xl">Profit & Loss Analysis</span>
                </h1>
                <p className="text-slate-400 text-sm mt-1 flex items-center gap-1">
                    <span className="material-symbols-rounded text-sm">info</span>
                    순이익 = 매출합계 - (매입합계 + 지출합계) ※ 부가세 포함 금액 기준
                </p>
            </div>

            <div className="flex flex-col flex-1 gap-6 px-6 lg:px-8 pb-8 min-h-0 overflow-y-auto custom-scrollbar">

                {/* Top Section: Monthly Trend & Stats */}
                <div className="flex flex-col xl:flex-row gap-6 shrink-0 h-[420px]">
                    {/* Left: Control & Summary Card */}
                    <div className="w-full xl:w-[320px] flex flex-col gap-4">
                        {/* Year Select & Control */}
                        <div className="bg-white rounded-[1.5rem] p-5 border border-slate-200 shadow-sm">
                            <label className="text-xs font-bold text-slate-500 uppercase mb-2 block">분석 연도 (Fiscal Year)</label>
                            <div className="flex gap-2">
                                <select value={year} onChange={e => setYear(Number(e.target.value))}
                                    className="flex-1 h-11 rounded-xl bg-slate-50 border-slate-200 text-slate-700 font-bold focus:ring-2 focus:ring-violet-500 px-3 outline-none transition-all">
                                    {years.map(y => <option key={y} value={y}>{y}년</option>)}
                                </select>
                                <button onClick={loadData} className="w-11 h-11 rounded-xl bg-violet-600 text-white flex items-center justify-center hover:bg-violet-700 shadow-lg shadow-violet-200 transition-all">
                                    <span className="material-symbols-rounded">refresh</span>
                                </button>
                                <button onClick={() => handlePrint()} className="h-11 px-5 rounded-xl bg-white border border-slate-200 text-slate-600 font-bold text-xs flex items-center gap-2 hover:bg-slate-50 transition-all shadow-sm">
                                    <span className="material-symbols-rounded text-violet-500 filled">print</span>
                                    리포트 인쇄
                                </button>
                            </div>
                        </div>

                        {/* Stats Card */}
                        <div className="flex-1 bg-white rounded-[1.5rem] p-6 border border-slate-200 shadow-sm flex flex-col justify-between relative overflow-hidden group">
                            {/* Decorative BG */}
                            <div className="absolute top-0 right-0 w-32 h-full bg-slate-50 -skew-x-12 translate-x-10 transition-transform group-hover:translate-x-4"></div>

                            <div className="relative z-10 space-y-6">
                                <div>
                                    <div className="text-xs font-bold text-slate-400 uppercase mb-1">Total Revenue</div>
                                    <div className="text-2xl font-black text-blue-600 tracking-tight">{formatCurrency(stats.revenue)}원</div>
                                </div>
                                <div>
                                    <div className="text-xs font-bold text-slate-400 uppercase mb-1">Total Cost</div>
                                    <div className="text-2xl font-black text-red-500 tracking-tight">{formatCurrency(stats.cost)}원</div>
                                </div>
                                <div className="pt-4 border-t border-dashed border-slate-200">
                                    <div className="flex items-center justify-between mb-1">
                                        <div className="text-sm font-bold text-slate-700 uppercase">Net Profit</div>
                                        <div className={`text-xs font-bold px-2 py-0.5 rounded-full ${stats.profit >= 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                                            이익률 {stats.margin}%
                                        </div>
                                    </div>
                                    <div className={`text-3xl font-black tracking-tight ${stats.profit >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                                        {formatCurrency(stats.profit)}원
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Right: Monthly Chart */}
                    <div className="flex-1 bg-white rounded-[1.5rem] p-6 border border-slate-200 shadow-sm flex flex-col min-w-0">
                        <h3 className="text-lg font-bold text-slate-700 mb-4 flex items-center gap-2">
                            <span className="material-symbols-rounded text-blue-500">bar_chart</span>
                            월별 손익 추세 분석
                        </h3>
                        <div className="flex-1 relative w-full h-full min-h-0">
                            {isLoading && (
                                <div className="absolute inset-0 flex items-center justify-center bg-white/50 z-10 backdrop-blur-sm">
                                    <span className="material-symbols-rounded animate-spin text-3xl text-violet-500">sync</span>
                                </div>
                            )}
                            <canvas ref={monthlyChartRef}></canvas>
                        </div>
                    </div>
                </div>

                {/* Bottom Section: Cost Breakdown & Top Vendors */}
                <div className="flex flex-col xl:flex-row gap-6 shrink-0 h-[380px]">
                    {/* Cost Breakdown */}
                    <div className="flex-1 bg-white rounded-[1.5rem] p-6 border border-slate-200 shadow-sm flex flex-col">
                        <h3 className="text-lg font-bold text-slate-700 mb-4 flex items-center gap-2">
                            <span className="material-symbols-rounded text-rose-500">pie_chart</span>
                            지출 비중 분석 (Cost Breakdown)
                        </h3>
                        <div className="flex flex-1 items-center gap-8 min-h-0">
                            {/* Chart Area */}
                            <div className="relative w-[240px] h-[240px] shrink-0">
                                <canvas ref={costChartRef}></canvas>
                                {/* Center Text */}
                                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                    <span className="text-xs font-bold text-slate-400">EXPENSES</span>
                                </div>
                            </div>

                            {/* Legend Area */}
                            <div className="flex-1 h-[240px] overflow-y-auto pr-2 custom-scrollbar">
                                {costBreakdown.length === 0 ? (
                                    <div className="h-full flex items-center justify-center text-slate-400 text-sm">데이터 없음</div>
                                ) : (
                                    <div className="grid grid-cols-1 gap-2">
                                        {costBreakdown.map((item, idx) => (
                                            <div key={idx} className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-50 transition-colors">
                                                <div className="flex items-center gap-2">
                                                    <span className={`w-3 h-3 rounded-full ${costColors[idx % costColors.length]}`}></span>
                                                    <span className="text-sm font-bold text-slate-600">{item.category}</span>
                                                </div>
                                                <div className="text-right">
                                                    <div className="text-sm font-black text-slate-800">{item.percentage}%</div>
                                                    <div className="text-[10px] text-slate-400">{formatCurrency(item.amount)}원</div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Top Vendors */}
                    <div className="flex-1 bg-white rounded-[1.5rem] p-6 border border-slate-200 shadow-sm flex flex-col min-w-0">
                        <h3 className="text-lg font-bold text-slate-700 mb-4 flex items-center gap-2">
                            <span className="material-symbols-rounded text-amber-500">trophy</span>
                            매입 상위 거래처 (Top 5)
                        </h3>
                        <div className="flex-1 overflow-hidden flex flex-col">
                            <div className="overflow-y-auto flex-1 custom-scrollbar">
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-slate-50 sticky top-0 z-10">
                                        <tr className="text-slate-500 border-b border-slate-200">
                                            <th className="py-3 px-4 font-bold whitespace-nowrap text-center w-[10%] min-w-[60px]">순위</th>
                                            <th className="py-3 px-4 font-bold whitespace-nowrap w-[40%] min-w-[120px]">거래처명</th>
                                            <th className="py-3 px-4 font-bold whitespace-nowrap text-right w-[30%] min-w-[100px]">매입금액</th>
                                            <th className="py-3 px-4 font-bold whitespace-nowrap text-center w-[20%] min-w-[80px]">거래횟수</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {topVendors.length === 0 ? (
                                            <tr><td colSpan="4" className="py-12 text-center text-slate-400 font-medium">데이터가 없습니다.</td></tr>
                                        ) : (
                                            topVendors.map((v, idx) => (
                                                <tr key={idx} className="hover:bg-slate-50 transition-colors">
                                                    <td className="py-3 px-4 text-center">
                                                        <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${idx < 3 ? 'bg-amber-100 text-amber-700' : 'text-slate-400'}`}>
                                                            {idx + 1}
                                                        </span>
                                                    </td>
                                                    <td className="py-3 px-4 font-bold text-slate-700">{v.vendor_name}</td>
                                                    <td className="py-3 px-4 text-right font-black text-slate-800">{formatCurrency(v.total_amount)}원</td>
                                                    <td className="py-3 px-4 text-center text-slate-500 text-xs">{v.purchase_count}회</td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default FinanceAnalysis;

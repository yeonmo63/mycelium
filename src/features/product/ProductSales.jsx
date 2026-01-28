import React, { useState, useEffect, useRef } from 'react';
import Chart from 'chart.js/auto';
import { useModal } from '../../contexts/ModalContext';
import { formatCurrency } from '../../utils/common';

/**
 * ProductSales.jsx
 * 상품별 판매 현황
 * Ported from MushroomFarm and styled with Premium React UI.
 * Features:
 *  - Product Sales Stats (Table + Chart)
 *  - Profit Analysis (Available for single year view)
 *  - 10-Year Trend Drilldown (Modal)
 *  - Monthly Drilldown (Modal)
 */
const ProductSales = () => {
    const { showAlert } = useModal();

    // --- State ---
    const [years, setYears] = useState([]);
    const [selectedYear, setSelectedYear] = useState('전체조회');
    const [salesData, setSalesData] = useState([]);
    const [profitData, setProfitData] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [loadingText, setLoadingText] = useState('');

    // --- Modal State ---
    const [drilldownProduct, setDrilldownProduct] = useState(null); // For 10yr modal
    const [trendData, setTrendData] = useState([]);
    const [isTrendLoading, setIsTrendLoading] = useState(false);

    const [monthlyData, setMonthlyData] = useState(null); // For monthly modal
    const [monthlyYear, setMonthlyYear] = useState(null);

    // --- Refs ---
    const chartRef = useRef(null);
    const chartInstance = useRef(null);
    const trendChartRef = useRef(null);
    const trendChartInstance = useRef(null);

    // --- Initialization ---
    useEffect(() => {
        const currentYear = new Date().getFullYear();
        const yList = [];
        for (let i = 0; i < 10; i++) yList.push(currentYear - i);
        setYears(yList);

        loadData('전체조회');

        return () => {
            if (chartInstance.current) chartInstance.current.destroy();
            if (trendChartInstance.current) trendChartInstance.current.destroy();
        };
    }, []);

    // --- Data Loading ---
    const loadData = async (year) => {
        setIsLoading(true);
        setLoadingText(year === '전체조회' ? '전체 판매 내역을 분석 중입니다...' : `${year}년 판매 내역을 분석 중입니다...`);
        setSalesData([]);
        setProfitData([]);

        try {
            if (!window.__TAURI__) {
                await new Promise(r => setTimeout(r, 1000));
                // Mock Data
                const mockSales = Array.from({ length: 15 }, (_, i) => ({
                    product_name: `상품 ${i + 1}`,
                    record_count: 100 + i * 10,
                    total_quantity: 500 + i * 50,
                    total_amount: 15000000 + i * 1200000
                })).sort((a, b) => b.total_amount - a.total_amount);
                setSalesData(mockSales);
                renderChart(mockSales);

                if (year !== '전체조회') {
                    setProfitData(mockSales.map(m => ({
                        ...m,
                        total_revenue: m.total_amount,
                        total_cost: m.total_amount * 0.7,
                        net_profit: m.total_amount * 0.3,
                        margin_rate: 30.0
                    })));
                }
                setIsLoading(false);
                return;
            }

            // Real Data
            const data = await window.__TAURI__.core.invoke('get_product_sales_stats', { year: year === '전체조회' ? null : year });
            setSalesData(data || []);
            renderChart(data || []);

            // Profit Analysis (Only for specific year)
            if (year !== '전체조회') {
                const profits = await window.__TAURI__.core.invoke('get_profit_margin_analysis', { year: parseInt(year) });
                setProfitData(profits || []);
            }

        } catch (e) {
            console.error(e);
            showAlert('오류', '데이터 로드 실패: ' + e);
        } finally {
            setIsLoading(false);
        }
    };

    const loadTrendData = async (productName) => {
        setDrilldownProduct(productName);
        setIsTrendLoading(true);
        setTrendData([]);

        try {
            if (!window.__TAURI__) {
                await new Promise(r => setTimeout(r, 800));
                const mockTrend = Array.from({ length: 10 }, (_, i) => ({
                    year: 2024 - i,
                    record_count: 50 + i,
                    total_quantity: 200 + i * 20,
                    total_amount: 5000000 + i * 500000
                })).sort((a, b) => a.year - b.year);
                setTrendData(mockTrend);
                renderTrendChart(mockTrend);
                setIsTrendLoading(false);
                return;
            }

            const data = await window.__TAURI__.core.invoke('get_product_10yr_sales_stats', { productName });
            setTrendData(data || []);
            renderTrendChart(data || []);
        } catch (e) {
            console.error(e);
            showAlert('오류', '추세 데이터 로드 실패');
        } finally {
            setIsTrendLoading(false);
        }
    };

    const loadMonthlyData = async (productName, year) => {
        setMonthlyYear(year);
        // Using a temporary loading state approach or just swift separate modal
        try {
            if (!window.__TAURI__) {
                const mockMonthly = Array.from({ length: 12 }, (_, i) => ({
                    month: i + 1,
                    record_count: 10,
                    total_quantity: 50,
                    total_amount: 1000000
                }));
                setMonthlyData(mockMonthly);
                return;
            }
            const data = await window.__TAURI__.core.invoke('get_product_monthly_analysis', { productName, year: parseInt(year) });
            setMonthlyData(data || []);
        } catch (e) {
            console.error(e);
            showAlert('오류', '월별 데이터 로드 실패');
        }
    };

    // --- Charts ---
    const renderChart = (data) => {
        if (!chartRef.current) return;
        if (chartInstance.current) chartInstance.current.destroy();

        const sorted = [...data].sort((a, b) => b.total_amount - a.total_amount).slice(0, 10);

        chartInstance.current = new Chart(chartRef.current, {
            type: 'bar',
            data: {
                labels: sorted.map(d => d.product_name),
                datasets: [{
                    label: '판매액',
                    data: sorted.map(d => d.total_amount),
                    backgroundColor: 'rgba(99, 102, 241, 0.7)',
                    borderColor: 'rgba(99, 102, 241, 1)',
                    borderWidth: 1,
                    borderRadius: 4
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } }, // tooltip default is fine
                scales: {
                    x: {
                        beginAtZero: true,
                        grid: { display: false }
                    },
                    y: { grid: { display: false } }
                }
            }
        });
    };

    const renderTrendChart = (data) => {
        // Wait for modal render? useRef should be attached when modal is open
        // We might need a small timeout if modal just opened
        setTimeout(() => {
            if (!trendChartRef.current) return;
            if (trendChartInstance.current) trendChartInstance.current.destroy();

            const sorted = [...data].sort((a, b) => a.year - b.year);

            trendChartInstance.current = new Chart(trendChartRef.current, {
                type: 'line',
                data: {
                    labels: sorted.map(d => `${d.year}년`),
                    datasets: [{
                        label: '판매액',
                        data: sorted.map(d => d.total_amount),
                        borderColor: '#10b981',
                        backgroundColor: 'rgba(16, 185, 129, 0.1)',
                        fill: true,
                        tension: 0.3
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                        x: { grid: { display: false } },
                        y: { beginAtZero: true }
                    }
                }
            });
        }, 100);
    };

    // --- Helpers ---
    const getMarginColor = (rate) => {
        if (rate >= 40) return 'text-emerald-600';
        if (rate <= 10) return 'text-red-600';
        return 'text-slate-600';
    };

    const getMarginBadge = (rate) => {
        if (rate >= 40) return <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-700">High</span>
        if (rate <= 10) return <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-700">Low</span>
        return null;
    };

    const getTotalSummary = (data) => {
        const count = data.reduce((acc, cur) => acc + cur.record_count, 0);
        const qty = data.reduce((acc, cur) => acc + cur.total_quantity, 0);
        const amt = data.reduce((acc, cur) => acc + cur.total_amount, 0);
        return { count, qty, amt };
    };

    // --- Render ---
    return (
        <div className="flex flex-col h-full bg-[#f8fafc] overflow-hidden animate-in fade-in duration-700">
            {/* Header */}
            <div className="px-6 lg:px-8 pt-6 lg:pt-8 pb-4 shrink-0">
                <div className="flex items-center gap-2 mb-1">
                    <span className="w-6 h-1 bg-violet-600 rounded-full"></span>
                    <span className="text-[9px] font-black tracking-[0.2em] text-violet-600 uppercase">Sales Analysis</span>
                </div>
                <div className="flex justify-between items-end">
                    <div>
                        <h1 className="text-3xl font-black text-slate-700 tracking-tighter" style={{ fontFamily: '"Noto Sans KR", sans-serif' }}>
                            상품별 판매 현황 <span className="text-slate-300 font-light ml-1 text-xl">Product Sales</span>
                        </h1>
                        <p className="text-slate-400 text-sm mt-1 flex items-center gap-1">
                            <span className="material-symbols-rounded text-sm">inventory_2</span>
                            상품별 판매 실적과 수익성을 다각도로 분석합니다.
                        </p>
                    </div>
                    <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-1 shadow-sm">
                        <span className="text-xs font-bold text-slate-500 uppercase">Year</span>
                        <select
                            value={selectedYear}
                            onChange={(e) => {
                                setSelectedYear(e.target.value);
                                loadData(e.target.value);
                            }}
                            className="bg-transparent text-sm font-bold text-slate-800 outline-none border-none cursor-pointer"
                        >
                            <option value="전체조회">전체 조회</option>
                            {years.map(y => <option key={y} value={y}>{y}년</option>)}
                        </select>
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 overflow-y-auto p-6 lg:p-8 min-h-0 custom-scrollbar flex flex-col gap-6 relative">
                {isLoading && (
                    <div className="absolute inset-0 z-50 bg-white/70 backdrop-blur-sm flex flex-col items-center justify-center">
                        <span className="material-symbols-rounded text-4xl text-violet-500 animate-spin">cyclone</span>
                        <div className="mt-4 text-slate-600 font-bold">{loadingText}</div>
                    </div>
                )}

                {/* Top Section: Chart & Table */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col lg:flex-row min-h-[500px]">
                    {/* Left: Chart */}
                    <div className="lg:w-1/3 p-6 border-b lg:border-b-0 lg:border-r border-slate-100 flex flex-col">
                        <h3 className="text-slate-700 font-bold mb-4 text-sm">판매 상위 품목 (Top 10)</h3>
                        <div className="flex-1 relative">
                            <canvas ref={chartRef}></canvas>
                        </div>
                    </div>

                    {/* Right: Table */}
                    <div className="lg:w-2/3 flex flex-col min-h-0">
                        <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                            <h3 className="font-bold text-slate-700 text-sm">상세 판매 내역</h3>
                            <button className="text-xs text-slate-500 hover:text-indigo-600 underline" onClick={() => window.print()}>보고서 인쇄</button>
                        </div>
                        <div className="flex-1 overflow-y-auto custom-scrollbar">
                            <table className="w-full text-sm text-left whitespace-nowrap">
                                <thead className="sticky top-0 bg-white z-10 shadow-sm text-xs uppercase text-slate-400 font-bold">
                                    <tr>
                                        <th className="py-3 px-4 w-[30%]">상품명</th>
                                        <th className="py-3 px-4 text-right w-[20%]">거래수</th>
                                        <th className="py-3 px-4 text-right w-[20%]">판매량</th>
                                        <th className="py-3 px-4 text-right w-[30%]">판매액</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {salesData.map((row, i) => (
                                        <tr key={i} onClick={() => loadTrendData(row.product_name)} className="hover:bg-violet-50 cursor-pointer transition-colors group">
                                            <td className="py-3 px-4 font-bold text-slate-900 group-hover:text-violet-700">{row.product_name}</td>
                                            <td className="py-3 px-4 text-right text-black">{formatCurrency(row.record_count)}</td>
                                            <td className="py-3 px-4 text-right text-black">{formatCurrency(row.total_quantity)}</td>
                                            <td className="py-3 px-4 text-right font-bold text-slate-900">{formatCurrency(row.total_amount)}</td>
                                        </tr>
                                    ))}
                                    {salesData.length === 0 && !isLoading && (
                                        <tr><td colSpan="4" className="p-8 text-center text-slate-400">데이터가 없습니다.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                        {/* Footer Totals */}
                        <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-6 text-sm font-bold text-slate-700">
                            <div>총 품목: <span className="text-indigo-600">{salesData.length}</span></div>
                            <div>총 거래: <span className="text-indigo-600">{formatCurrency(getTotalSummary(salesData).count)}</span></div>
                            <div>총 판매액: <span className="text-indigo-600">{formatCurrency(getTotalSummary(salesData).amt)}</span></div>
                        </div>
                    </div>
                </div>

                {/* Profit Analysis Section (Conditional) */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                    <h3 className="text-slate-700 font-bold mb-4 flex items-center gap-2">
                        <span className="material-symbols-rounded text-emerald-500">paid</span> 수익성 및 마진 분석 (심화)
                    </h3>

                    {selectedYear === '전체조회' ? (
                        <div className="p-8 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200">
                            <span className="material-symbols-rounded text-4xl text-slate-300 mb-2">dvr</span>
                            <p className="text-slate-500 text-sm">수익성 분석은 <b>특정 연도</b> 조회 시에만 제공됩니다.</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left whitespace-nowrap">
                                <thead className="bg-emerald-50/50 text-xs uppercase text-emerald-800 font-bold border-b border-emerald-100">
                                    <tr>
                                        <th className="py-3 px-4">상품명</th>
                                        <th className="py-3 px-4 text-right">매출액</th>
                                        <th className="py-3 px-4 text-right">원가(추정)</th>
                                        <th className="py-3 px-4 text-right">순이익</th>
                                        <th className="py-3 px-4 text-right">마진율</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {profitData.map((row, i) => (
                                        <tr key={i} className="hover:bg-slate-50">
                                            <td className="py-3 px-4 font-bold text-slate-900">{row.product_name}</td>
                                            <td className="py-3 px-4 text-right text-black">{formatCurrency(row.total_revenue)}</td>
                                            <td className="py-3 px-4 text-right text-black">{formatCurrency(row.total_cost)}</td>
                                            <td className="py-3 px-4 text-right font-bold text-slate-900">{formatCurrency(row.net_profit)}</td>
                                            <td className="py-3 px-4 text-right font-mono font-bold">
                                                <span className={getMarginColor(row.margin_rate)}>{row.margin_rate.toFixed(1)}%</span>
                                                {getMarginBadge(row.margin_rate)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            <p className="mt-2 text-xs text-right text-slate-400">* 원가는 [상품 관리] 메뉴 설정을 따릅니다.</p>
                        </div>
                    )}
                </div>

            </div>

            {/* Drilldown Modal (10 Yr Trend) */}
            {drilldownProduct && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                            <div>
                                <h3 className="text-lg font-black text-slate-800">{drilldownProduct}</h3>
                                <p className="text-sm text-slate-500">최근 10년간 판매 추이 분석</p>
                            </div>
                            <button onClick={() => setDrilldownProduct(null)} className="p-2 rounded-full hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition-colors">
                                <span className="material-symbols-rounded">close</span>
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6 min-h-0 custom-scrollbar relative">
                            {isTrendLoading && (
                                <div className="absolute inset-0 z-10 bg-white/80 flex items-center justify-center">
                                    <span className="material-symbols-rounded animate-spin text-4xl text-emerald-500">sync</span>
                                </div>
                            )}

                            {/* Trend Chart */}
                            <div className="h-64 mb-6 relative">
                                <canvas ref={trendChartRef}></canvas>
                            </div>

                            {/* Trend Table */}
                            <table className="w-full text-sm text-left">
                                <thead className="bg-slate-50 text-xs uppercase text-slate-500 font-bold border-y border-slate-200">
                                    <tr>
                                        <th className="py-3 px-4">연도</th>
                                        <th className="py-3 px-4 text-right">거래수</th>
                                        <th className="py-3 px-4 text-right">판매량</th>
                                        <th className="py-3 px-4 text-right">판매액</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {trendData.map((row, i) => (
                                        <tr key={i} onClick={() => loadMonthlyData(drilldownProduct, row.year)} className="hover:bg-slate-50 cursor-pointer transition-colors">
                                            <td className="py-3 px-4 font-bold text-slate-900">{row.year}년</td>
                                            <td className="py-3 px-4 text-right text-black">{formatCurrency(row.record_count)}</td>
                                            <td className="py-3 px-4 text-right text-black">{formatCurrency(row.total_quantity)}</td>
                                            <td className="py-3 px-4 text-right font-bold text-slate-900">{formatCurrency(row.total_amount)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end">
                            <button onClick={() => setDrilldownProduct(null)} className="px-5 py-2 bg-white border border-slate-200 shadow-sm rounded-lg text-sm font-bold text-slate-600 hover:bg-slate-100">닫기</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Monthly Modal (Nested) */}
            {monthlyData && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/20 backdrop-blur-[1px] animate-in fade-in duration-200">
                    <div className="bg-white rounded-xl w-full max-w-lg shadow-2xl overflow-hidden border border-slate-200">
                        <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-violet-50">
                            <h4 className="font-bold text-violet-900">{monthlyYear}년 월별 상세</h4>
                            <button onClick={() => setMonthlyData(null)} className="text-violet-400 hover:text-violet-700"><span className="material-symbols-rounded">close</span></button>
                        </div>
                        <div className="max-h-[60vh] overflow-y-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-white sticky top-0 border-b border-slate-200 text-xs font-bold text-slate-500">
                                    <tr>
                                        <th className="py-2 px-4">월</th>
                                        <th className="py-2 px-4 text-right">판매량</th>
                                        <th className="py-2 px-4 text-right">판매액</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {monthlyData.map((row, i) => (
                                        <tr key={i}>
                                            <td className="py-2 px-4 font-bold text-slate-900">{row.month}월</td>
                                            <td className="py-2 px-4 text-right text-black">{formatCurrency(row.total_quantity)}</td>
                                            <td className="py-2 px-4 text-right font-bold text-indigo-700">{formatCurrency(row.total_amount)}</td>
                                        </tr>
                                    ))}
                                    {/* Total Row */}
                                    <tr className="bg-slate-50 font-bold border-t border-slate-200">
                                        <td className="py-2 px-4 text-slate-700">합계</td>
                                        <td className="py-2 px-4 text-right">{formatCurrency(monthlyData.reduce((a, c) => a + c.total_quantity, 0))}</td>
                                        <td className="py-2 px-4 text-right">{formatCurrency(monthlyData.reduce((a, c) => a + c.total_amount, 0))}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
};

export default ProductSales;

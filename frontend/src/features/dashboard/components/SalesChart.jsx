import React, { useEffect, useRef } from 'react';
import { Chart, registerables } from 'chart.js';
import { formatCurrency } from '../../../utils/common';

Chart.register(...registerables);

const SalesChart = ({ weeklyData, isChartLoading, navigate }) => {
    const chartRef = useRef(null);
    const chartInstance = useRef(null);

    useEffect(() => {
        if (weeklyData.length > 0 && chartRef.current) {
            const timer = setTimeout(renderChart, 200);
            window.addEventListener('resize', renderChart);
            return () => {
                clearTimeout(timer);
                window.removeEventListener('resize', renderChart);
            };
        }
    }, [weeklyData]);

    const renderChart = () => {
        if (!chartRef.current) return;

        if (chartInstance.current) {
            chartInstance.current.destroy();
        }

        const ctx = chartRef.current.getContext('2d');
        if (!ctx) return;

        const labels = weeklyData.map(d => d.date);
        const values = weeklyData.map(d => d.total);

        const chartHeight = chartRef.current.clientHeight || 300;
        const gradient = ctx.createLinearGradient(0, 0, 0, chartHeight);
        gradient.addColorStop(0, 'rgba(99, 102, 241, 0.2)');
        gradient.addColorStop(1, 'rgba(99, 102, 241, 0)');

        chartInstance.current = new Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets: [{
                    label: '일별 매출',
                    data: values,
                    borderColor: '#6366f1',
                    backgroundColor: gradient,
                    borderWidth: 3,
                    pointBackgroundColor: '#fff',
                    pointBorderColor: '#6366f1',
                    pointBorderWidth: 2,
                    pointRadius: 4,
                    tension: 0.4,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: {
                    duration: 400,
                    easing: 'easeOutQuart'
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: 'rgba(15, 23, 42, 0.9)',
                        padding: 12,
                        titleFont: { size: 14, weight: 'bold' },
                        bodyFont: { size: 13 },
                        callbacks: {
                            label: (context) => `매출: ${formatCurrency(context.raw)}원`
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { color: 'rgba(0,0,0,0.03)' },
                        ticks: {
                            callback: (val) => formatCurrency(val / 10000) + '만원',
                            font: { size: 11, weight: '500' }
                        }
                    },
                    x: {
                        grid: { display: false },
                        ticks: { font: { size: 11, weight: '500' } }
                    }
                },
                onClick: (event, elements) => {
                    if (elements.length > 0) {
                        const index = elements[0].index;
                        const label = labels[index];
                        window.__DAILY_SALES_FILTER_DATE__ = label;
                        navigate('/sales/daily');
                    }
                }
            }
        });
    };

    return (
        <div className="bg-white rounded-[20px] p-5 min-[2000px]:p-8 shadow-sm border border-slate-100 flex flex-col h-full min-h-[200px] min-[2000px]:min-h-[300px] relative overflow-hidden">
            <div className="flex justify-between items-center mb-4 shrink-0">
                <h3 className="text-[1.1rem] font-bold text-slate-800">금주 매출 추이</h3>
                <div className="flex items-center gap-2 text-xs text-slate-400 font-bold">
                    {isChartLoading && <span className="material-symbols-rounded animate-spin text-indigo-500">refresh</span>}
                    <span className="w-3 h-3 rounded-full bg-indigo-500"></span>
                    일별 매출액 추이
                </div>
            </div>
            <div className="flex-1 w-full relative min-h-0 bg-slate-50/30 rounded-xl">
                {isChartLoading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-white/50 z-10">
                        <span className="material-symbols-rounded animate-spin text-4xl text-indigo-500">refresh</span>
                    </div>
                )}
                <canvas ref={chartRef} className="w-full h-full p-2"></canvas>
            </div>
        </div>
    );
};

export default SalesChart;

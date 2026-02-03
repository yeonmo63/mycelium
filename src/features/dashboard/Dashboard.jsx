import React, { useState, useEffect, useRef, useMemo } from 'react';
import { formatCurrency } from '../../utils/common';
import { useModal } from '../../contexts/ModalContext';
import { Chart, registerables } from 'chart.js';
import dayjs from 'dayjs';
import { useNavigate } from 'react-router-dom';
import { invoke } from '@tauri-apps/api/core';
import { invokeAI } from '../../utils/aiErrorHandler';

Chart.register(...registerables);

const Dashboard = () => {
    const { showAlert, showConfirm } = useModal();
    const navigate = useNavigate();
    const [stats, setStats] = useState(null);
    const [weeklyData, setWeeklyData] = useState([]);
    const [top3Products, setTop3Products] = useState([]);
    const [topProfitProducts, setTopProfitProducts] = useState([]);
    const [anniversaries, setAnniversaries] = useState([]);
    const [repurchaseCandidates, setRepurchaseCandidates] = useState([]);
    const [forecastAlerts, setForecastAlerts] = useState([]);
    const [freshnessAlerts, setFreshnessAlerts] = useState([]);
    const [weatherAdvice, setWeatherAdvice] = useState(null);
    const [topMode, setTopMode] = useState('qty'); // 'qty' | 'profit'
    const [isLoading, setIsLoading] = useState(true);
    const [isRankLoading, setIsRankLoading] = useState(true);
    const [isWeatherLoading, setIsWeatherLoading] = useState(true);
    const [isChartLoading, setIsChartLoading] = useState(true);

    // Unified Expanded Section State (Replaces individual Modals)
    const [expandedAlert, setExpandedAlert] = useState(null); // null | 'anniversary' | 'repurchase' | 'inventory'
    const [showLogoutModal, setShowLogoutModal] = useState(false);
    const [aiBriefingContent, setAiBriefingContent] = useState(null);

    // Command Palette / Search State
    const [searchQuery, setSearchQuery] = useState('');
    const [isSearchFocused, setIsSearchFocused] = useState(false);
    const searchRef = useRef(null);

    const chartRef = useRef(null);
    const chartInstance = useRef(null);

    // Sales Trend Calculation
    const getSalesTrend = () => {
        if (!weeklyData || weeklyData.length < 2) return null;

        const todayStr = dayjs().format('MM-DD');
        const yestStr = dayjs().subtract(1, 'day').format('MM-DD');

        const todayData = weeklyData.find(d => d.date === todayStr);
        const yestData = weeklyData.find(d => d.date === yestStr);

        if (!todayData || !yestData || yestData.total === 0) {
            if (todayData && todayData.total > 0 && (!yestData || yestData.total === 0)) {
                return { pct: 100, isUp: true, label: 'New' };
            }
            return null;
        }

        const diff = todayData.total - yestData.total;
        const pct = (diff / yestData.total) * 100;
        return { pct: Math.abs(pct).toFixed(1), isUp: diff >= 0 };
    };

    const salesTrend = getSalesTrend();

    useEffect(() => {
        loadDashboardData();
        const interval = setInterval(loadDashboardData, 300000); // 5 min
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        if (weeklyData.length > 0 && chartRef.current) {
            const timer = setTimeout(renderChart, 200); // Increased delay for layout stability
            window.addEventListener('resize', renderChart);
            return () => {
                clearTimeout(timer);
                window.removeEventListener('resize', renderChart);
            };
        }
    }, [weeklyData]);

    const loadDashboardData = async () => {

        // 1. 핵심 통계
        invoke('get_dashboard_stats').then(res => {
            setStats(res);
            setIsLoading(false);
        }).catch(err => {
            console.error("Dashboard: Stats error", err);
            setIsLoading(false);
        });

        // 2. 모달 관련 데이터들
        invoke('get_upcoming_anniversaries', { days: 3 }).then(res => setAnniversaries(res || [])).catch(e => console.error("Anniv error", e));
        invoke('get_repurchase_candidates').then(res => setRepurchaseCandidates(res || [])).catch(e => console.error("Repurchase error", e));

        Promise.all([
            invoke('get_inventory_forecast_alerts'),
            invoke('get_product_freshness')
        ]).then(([forecast, fresh]) => {
            setForecastAlerts(forecast || []);

            // Process Freshness Alerts (> 7 days)
            const today = new Date();
            const alerts = (fresh || []).filter(item => {
                if (!item.last_in_date) return false;
                if (item.stock_quantity <= 0) return false;
                const lastDate = new Date(item.last_in_date);
                const diffTime = Math.abs(today - lastDate);
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                item.diffDays = diffDays;
                return diffDays > 7; // Alert Threshold
            }).sort((a, b) => b.diffDays - a.diffDays);

            setFreshnessAlerts(alerts);
        }).catch(e => console.error("Inventory/Freshness error", e));

        // 3. 주간 차트 데이터
        invoke('get_weekly_sales_data').then(weeklyRes => {
            setWeeklyData(weeklyRes || []);
            setIsChartLoading(false);
        }).catch(e => {
            console.error("Dashboard: Weekly chart error", e);
            setIsChartLoading(false);
        });

        // 4. 상품 랭킹
        Promise.allSettled([
            invoke('get_top3_products_by_qty'),
            invoke('get_top_profit_products')
        ]).then(([top3, profit]) => {
            if (top3.status === 'fulfilled') setTop3Products(top3.value || []);
            if (profit.status === 'fulfilled') setTopProfitProducts(profit.value || []);
            setIsRankLoading(false);
        }).catch(e => {
            console.error("Dashboard: Ranking error", e);
            setIsRankLoading(false);
        });

        // 5. 날씨 및 마케팅 조언
        invoke('get_weather_marketing_advice').then(weatherRes => {
            setWeatherAdvice(weatherRes);
            setIsWeatherLoading(false);
        }).catch(e => {
            console.error("Dashboard: Weather error", e);
            setIsWeatherLoading(false);
        });
    };

    const renderChart = () => {
        if (!chartRef.current) return;

        if (chartInstance.current) {
            chartInstance.current.destroy();
        }

        const ctx = chartRef.current.getContext('2d');
        if (!ctx) return;

        const labels = weeklyData.map(d => d.date);
        const values = weeklyData.map(d => d.total);

        // 높이를 동적으로 가져와서 그라데이션 생성 (더 안전함)
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
                        // Save selected date for the target page to pick up
                        window.__DAILY_SALES_FILTER_DATE__ = label;
                        navigate('/sales/daily');
                    }
                }
            }
        });
    };

    const handleAIBriefing = async () => {
        try {
            setAiBriefingContent("AI가 어제와 오늘의 운영 데이터를 정밀 분석하여 일일 리포트를 생성하고 있습니다...");
            const content = await invokeAI(showAlert, 'get_morning_briefing');
            setAiBriefingContent(content);
        } catch (e) {
            console.error(e);
            setAiBriefingContent(null);
        }
    };

    const handleConsultationBriefing = async (e) => {
        e.stopPropagation();
        try {
            setAiBriefingContent("미처리 상담 내역을 분석하여 시급도와 대응 전략을 요약하고 있습니다...");
            const summary = await invokeAI(showAlert, 'get_pending_consultations_summary');
            setAiBriefingContent(summary);
        } catch (e) {
            console.error(e);
            setAiBriefingContent(null);
        }
    };

    const generateAIDraft = async (customer) => {
        try {
            const prompt = `당신은 'CS 매니저'의 마케팅 전문가입니다. 
고객: ${customer.customer_name}, 마지막 상품: ${customer.last_product}, 예상 주기 도달.
재구매 유도 문구를 친절하게 작성해주세요.`;
            const draft = await invokeAI(showAlert, 'call_gemini_ai', { prompt });
            const reasoning = "이 추천은 고객의 과거 구매 패턴과 최근 주문 이력을 분석하여 작성되었습니다.";
            if (await showConfirm("AI 추천 문구 (데이터 기반)", draft + `\n\n---\n💡 분석 근거: ${reasoning}\n\n이 문구를 복사하고 전송 화면으로 이동할까요?`)) {
                navigator.clipboard.writeText(draft);
                window.__SMS_DRAFT_CONTENT__ = draft;
                window.__SMS_DRAFT_RECIPIENT__ = customer.mobile_number;
                navigate('/customer/sms');
            }
        } catch (e) {
            // Error already handled by invokeAI if it's a quota error
            if (!e.message?.includes('AI_QUOTA_EXCEEDED')) {
                showAlert("오류", "문구 생성 실패: " + e);
            }
        }
    };

    const getWeatherIcon = (desc) => {
        if (!desc) return 'cloud';
        if (desc.includes('눈')) return 'ac_unit';
        if (desc.includes('비')) return 'umbrella';
        if (desc.includes('맑음')) return 'wb_sunny';
        if (desc.includes('흐림') || desc.includes('구름')) return 'filter_drama';
        return 'cloud';
    };

    const trend = (() => {
        if (weeklyData.length < 2) return null;
        const todayStr = dayjs().format('MM-DD');
        const yesterdayStr = dayjs().subtract(1, 'day').format('MM-DD');
        const todayVal = weeklyData.find(d => d.date === todayStr)?.total || 0;
        const yestVal = weeklyData.find(d => d.date === yesterdayStr)?.total || 0;
        if (yestVal === 0) return todayVal > 0 ? { pct: 100, pos: true } : null;
        const diff = todayVal - yestVal;
        return { pct: (Math.abs(diff) / yestVal) * 100, pos: diff >= 0 };
    })();

    // --- Command Palette Logic ---
    const commands = useMemo(() => [
        { id: 'reception', label: '주문 접수 바로가기', sub: '일반/특판 주문 입력', path: '/sales/reception', icon: 'add_shopping_cart' },
        { id: 'stock', label: '재고 및 수확 관리', sub: '실시간 재고 현황 및 감사 로그', path: '/sales/stock', icon: 'inventory_2' },
        { id: 'customer', label: '고객명부 조회', sub: '회원/비회원 통합 검색', path: '/customer/edit', icon: 'group' },
        { id: 'consult', label: '고객 상담 내역', sub: '미처리 상담 및 대응 기록', path: '/customer/consultation', icon: 'forum' },
        { id: 'ledger', label: '통합 매출 장부', sub: '월간/분기 매출 통계 확인', path: '/sales/ledger', icon: 'menu_book' },
        { id: 'purchase', label: '매입/지축 관리', sub: '자재 매입 및 경비 증빙', path: '/finance/purchase', icon: 'receipt_long' },
        { id: 'exp_status', label: '체험 예약 현황', sub: '오늘과 이번 주 체험 기록', path: '/exp/reservation-status', icon: 'event_available' },
        { id: 'settings', label: '시스템 설정', sub: '사용자 관리 및 DB 백업', path: '/settings/company-info', icon: 'settings' }
    ], []);

    const filteredCommands = useMemo(() => {
        if (!searchQuery) return commands.slice(0, 5); // Show top 5 by default
        const q = searchQuery.toLowerCase();
        return commands.filter(c => c.label.toLowerCase().includes(q) || c.sub.toLowerCase().includes(q));
    }, [searchQuery, commands]);

    const handleCommandClick = (path) => {
        setIsSearchFocused(false);
        setSearchQuery('');
        navigate(path);
    };

    const toggleAlert = (type) => {
        setExpandedAlert(expandedAlert === type ? null : type);
        // Scroll to the area smoothly if opening
        if (expandedAlert !== type) {
            setTimeout(() => {
                document.getElementById('alert-expansion-area')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 100);
        }
    };

    return (
        <div className="dashboard-container p-6 lg:p-8 min-[2000px]:p-12 bg-[#f8fafc] h-full flex flex-col overflow-hidden text-slate-900 font-sans relative">
            {/* Background Decorative Elements */}
            <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-500/5 blur-[120px] rounded-full pointer-events-none"></div>
            <div className="absolute bottom-[-10%] right-[-10%] w-[30%] h-[30%] bg-emerald-500/5 blur-[100px] rounded-full pointer-events-none"></div>

            {/* 1. Global Action Bar (Search & Profile) */}
            <div className="flex items-center justify-between mb-4 gap-8 animate-in fade-in slide-in-from-top-4 duration-500 shrink-0 relative">
                <div className="flex-1 max-w-2xl min-[2000px]:max-w-4xl relative group" ref={searchRef}>
                    <div className={`relative flex items-center bg-white/80 backdrop-blur-xl border border-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] ${isSearchFocused ? 'border-indigo-400 ring-4 ring-indigo-500/5' : ''} rounded-[24px] px-6 py-4 transition-all duration-300`}>
                        <span className={`material-symbols-rounded ${isSearchFocused ? 'text-indigo-500' : 'text-slate-400'} transition-colors text-2xl`}>search</span>
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            onFocus={() => setIsSearchFocused(true)}
                            placeholder="명령어를 입력하거나 메뉴를 검색하세요 (예: '재고', '매출')"
                            className="flex-1 bg-transparent border-none outline-none px-4 text-[15px] font-medium tracking-tight text-slate-700 placeholder:text-slate-300"
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && filteredCommands.length > 0) {
                                    handleCommandClick(filteredCommands[0].path);
                                }
                            }}
                        />
                        <div className="flex items-center gap-2">
                            {searchQuery && (
                                <button onClick={() => setSearchQuery('')} className="p-1.5 hover:bg-slate-100 rounded-full text-slate-400">
                                    <span className="material-symbols-rounded text-lg">close</span>
                                </button>
                            )}
                            <span className="w-px h-4 bg-slate-200 mx-2"></span>
                            <div className="bg-slate-100 px-2 py-1 rounded-md text-[10px] font-black text-slate-400 border border-slate-200">ALT + K</div>
                        </div>
                    </div>

                    {/* Command Palette Dropdown */}
                    {isSearchFocused && (
                        <>
                            <div className="absolute inset-0 bg-transparent z-[99] fixed w-screen h-screen top-0 left-0" onClick={() => setIsSearchFocused(false)}></div>
                            <div className="absolute top-[calc(100%+12px)] left-0 w-full bg-white rounded-[24px] shadow-[0_20px_60px_rgba(0,0,0,0.15)] border border-slate-200 overflow-hidden z-[100] animate-in fade-in slide-in-from-top-4 duration-300">
                                <div className="px-5 py-3 bg-slate-50/50 border-b border-slate-100 flex items-center justify-between">
                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Rapid Navigation & Commands</span>
                                    <span className="text-[10px] text-slate-400 font-bold">{filteredCommands.length} matches</span>
                                </div>
                                <div className="p-2 max-h-[400px] overflow-auto stylish-scrollbar">
                                    {filteredCommands.length > 0 ? filteredCommands.map((cmd) => (
                                        <button
                                            key={cmd.id}
                                            onClick={() => handleCommandClick(cmd.path)}
                                            className="w-full flex items-center gap-4 p-4 hover:bg-indigo-50/50 rounded-2xl transition-all group text-left"
                                        >
                                            <div className="w-10 h-10 rounded-xl bg-slate-100 group-hover:bg-white text-slate-400 group-hover:text-indigo-600 flex items-center justify-center transition-all shadow-sm">
                                                <span className="material-symbols-rounded text-xl">{cmd.icon}</span>
                                            </div>
                                            <div className="flex-1">
                                                <div className="text-sm font-black text-slate-700 group-hover:text-indigo-900 leading-tight">{cmd.label}</div>
                                                <div className="text-[11px] text-slate-400 group-hover:text-indigo-400 font-medium mt-1 uppercase tracking-tight">{cmd.sub}</div>
                                            </div>
                                            <span className="material-symbols-rounded text-slate-200 group-hover:text-indigo-300 text-lg opacity-0 group-hover:opacity-100 -translate-x-2 group-hover:translate-x-0 transition-all">arrow_forward</span>
                                        </button>
                                    )) : (
                                        <div className="py-12 text-center text-slate-400 font-bold italic">
                                            No commands found for "{searchQuery}"
                                        </div>
                                    )}
                                </div>
                                <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-4">
                                    <div className="flex items-center gap-4">
                                        <div className="flex items-center gap-1.5 grayscale opacity-50">
                                            <span className="bg-white px-1.5 py-0.5 rounded border border-slate-300 text-[9px] font-bold">↵</span>
                                            <span className="text-[10px] font-bold">Enter to Select</span>
                                        </div>
                                        <div className="flex items-center gap-1.5 grayscale opacity-50">
                                            <span className="bg-white px-1.5 py-0.5 rounded border border-slate-300 text-[9px] font-bold">ESC</span>
                                            <span className="text-[10px] font-bold">Close</span>
                                        </div>
                                    </div>
                                    <div className="text-[10px] font-black text-indigo-500 bg-indigo-50 px-3 py-1.5 rounded-full border border-indigo-100">
                                        Powered by Mycelium AI
                                    </div>
                                </div>
                            </div>
                        </>
                    )}
                </div>

                <div className="flex items-center gap-4 bg-white p-2.5 pr-6 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all">
                    <div className="w-10 h-10 rounded-xl bg-slate-900 border border-slate-700 flex items-center justify-center text-white shadow-lg overflow-hidden relative group">
                        <span className="material-symbols-rounded text-xl group-hover:scale-110 transition-transform">person</span>
                        <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 border-2 border-slate-900 rounded-full"></div>
                    </div>
                    <div className="flex flex-col mr-6">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.1em] leading-none mb-1">MYCELIUM</span>
                        <span className="text-sm font-black text-slate-800 tracking-tight">{sessionStorage.getItem('username') || '관리자'}님</span>
                    </div>
                    <button
                        onClick={() => setShowLogoutModal(true)}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-50 hover:bg-rose-50 text-slate-500 hover:text-rose-600 font-black text-[11px] transition-all active:scale-95 border border-slate-100 uppercase tracking-widest"
                    >
                        <span className="material-symbols-rounded text-sm">logout</span>
                        Sign Out
                    </button>
                </div>
            </div>



            {/* Main Stats Grid - Flex-Elastic Layout */}
            <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4 min-[2000px]:gap-6 mb-4 min-[2000px]:mb-6 shrink-0">
                {/* Weather & Insight Hero Card */}
                <div className="col-span-full bg-gradient-to-br from-[#1e293b] via-[#0f172a] to-black rounded-[32px] p-8 min-[2000px]:p-10 shadow-2xl relative overflow-hidden h-full min-h-[160px] min-[2000px]:min-h-[220px] flex items-center group transition-all duration-700 hover:shadow-indigo-500/10">
                    {/* Decorative Gradients */}
                    <div className="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-indigo-500/10 to-transparent pointer-events-none"></div>
                    <div className="absolute bottom-[-50%] left-[-10%] w-64 h-64 bg-emerald-500/10 blur-[80px] rounded-full pointer-events-none"></div>

                    <div className="relative z-10 flex items-center gap-8 min-[2000px]:gap-12 w-full">
                        <div className="w-20 h-20 min-[2000px]:w-28 min-[2000px]:h-28 rounded-[28px] bg-white/10 backdrop-blur-2xl border border-white/20 flex items-center justify-center shrink-0 shadow-2xl group-hover:rotate-6 transition-transform duration-500">
                            <span className="material-symbols-rounded text-amber-400 text-5xl min-[2000px]:text-7xl drop-shadow-[0_0_15px_rgba(251,191,36,0.5)]">
                                {getWeatherIcon(weatherAdvice?.weather_desc)}
                            </span>
                        </div>
                        <div className="flex-1">
                            <div className="flex items-center gap-4 mb-2">
                                <h3 className="text-white text-[1.4rem] font-black tracking-tight drop-shadow-sm">Daily Intelligence</h3>
                                {!isWeatherLoading && (
                                    <div className="bg-white/10 backdrop-blur-md px-4 py-1.5 rounded-full text-white/90 text-[0.9rem] font-bold border border-white/10 flex items-center gap-2">
                                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                                        강릉 {weatherAdvice?.temperature?.toFixed(1)}°C · {weatherAdvice?.weather_desc}
                                    </div>
                                )}
                            </div>
                            <p className="text-slate-300 text-[0.95rem] font-medium leading-relaxed max-w-[90%] drop-shadow-sm">
                                {isWeatherLoading ? "인공지능이 오늘의 날씨와 데이터를 통합 분석 중입니다..." : (weatherAdvice?.marketing_advice || "오늘의 최적화된 마케팅 전략을 확인하세요.")}
                            </p>
                            {!isWeatherLoading && (
                                <div className="mt-3 flex items-center gap-2 text-[10px] font-bold text-slate-500 uppercase tracking-tight">
                                    <span className="material-symbols-rounded text-xs">info</span>
                                    이 분석은 최근 3년간의 계절별 판매 기록과 실시간 날씨 데이터를 바탕으로 작성되었습니다.
                                </div>
                            )}
                        </div>
                        <div className="hidden 2xl:block pr-8 shrink-0">
                            <div className="text-right">
                                <div className="text-slate-500 text-[0.7rem] font-black uppercase tracking-[0.3em] mb-1">Last Update</div>
                                <div className="text-white font-mono text-lg font-bold">{dayjs().format('HH:mm:ss')}</div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="bg-white rounded-[28px] py-5 px-6 min-[2000px]:py-8 min-[2000px]:px-8 border border-slate-100 shadow-[0_4px_20px_rgb(0,0,0,0.03)] relative overflow-hidden group hover:border-indigo-200 hover:shadow-[0_20px_40px_rgba(79,70,229,0.08)] transition-all duration-500 h-full min-h-[140px] min-[2000px]:min-h-[180px] flex flex-col justify-between">
                    <div className="flex justify-between items-start">
                        <span className="material-symbols-rounded text-indigo-600 bg-indigo-50 p-2.5 rounded-[16px] text-[20px] min-[2000px]:text-[28px] shadow-sm">payments</span>
                        {!isLoading && salesTrend && (
                            <div className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black ${salesTrend.isUp ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'} shadow-sm`}>
                                <span className="material-symbols-rounded text-[14px]">{salesTrend.isUp ? 'arrow_upward' : 'arrow_downward'}</span>
                                {salesTrend.label || `${salesTrend.pct}%`}
                            </div>
                        )}
                    </div>
                    <div>
                        <h3 className="text-slate-500 text-[0.8rem] font-bold uppercase tracking-wider mb-1">오늘의 매출액</h3>
                        <div className="text-[1.4rem] font-black text-slate-800 tracking-tighter leading-none">
                            {isLoading ? <span className="text-slate-200 animate-pulse">...</span> : (`${formatCurrency(stats?.total_sales_amount || 0)}원`)}
                        </div>
                    </div>
                </div>

                <div className="bg-white rounded-[28px] py-5 px-6 min-[2000px]:py-8 min-[2000px]:px-8 border border-slate-100 shadow-[0_4px_20px_rgb(0,0,0,0.03)] relative overflow-hidden group hover:border-blue-200 hover:shadow-[0_20px_40px_rgba(37,99,235,0.08)] transition-all duration-500 h-full min-h-[140px] min-[2000px]:min-h-[180px] flex flex-col justify-between">
                    <div className="flex justify-between items-start">
                        <span className="material-symbols-rounded text-blue-600 bg-blue-50 p-2.5 rounded-[16px] text-[20px] min-[2000px]:text-[28px] shadow-sm">shopping_cart</span>
                        <div className="text-[10px] min-[2000px]:text-[13px] font-black text-slate-400 uppercase tracking-widest bg-slate-50 px-2 py-1 rounded-md">Orders</div>
                    </div>
                    <div>
                        <h3 className="text-slate-500 text-[0.8rem] font-bold uppercase tracking-wider mb-1">오늘 주문량</h3>
                        <div className="text-[1.4rem] font-black text-slate-800 tracking-tighter leading-none">
                            {isLoading ? <span className="text-slate-200 animate-pulse">...</span> : (`${formatCurrency(stats?.total_orders || 0)}건`)}
                        </div>
                    </div>
                </div>

                <div className="bg-white rounded-[28px] py-5 px-6 min-[2000px]:py-8 min-[2000px]:px-8 border border-slate-100 shadow-[0_4px_20px_rgb(0,0,0,0.03)] relative overflow-hidden group hover:border-indigo-200 hover:shadow-[0_20px_40px_rgba(79,70,229,0.08)] transition-all duration-500 h-full min-h-[140px] min-[2000px]:min-h-[180px] flex flex-col justify-between">
                    <div className="flex justify-between items-start">
                        <span className="material-symbols-rounded text-indigo-600 bg-indigo-50 p-2.5 rounded-[16px] text-[20px] min-[2000px]:text-[28px] shadow-sm">group_add</span>
                        <div className="text-[10px] min-[2000px]:text-[13px] font-black text-slate-400 uppercase tracking-widest bg-slate-50 px-2 py-1 rounded-md">New CRM</div>
                    </div>
                    <div>
                        <h3 className="text-slate-500 text-[0.8rem] font-bold uppercase tracking-wider mb-1">금일 새 고객 / 전체</h3>
                        {isLoading ? (
                            <div className="text-slate-200 animate-pulse text-[1.4rem] font-black">...</div>
                        ) : (
                            <div className="flex flex-col">
                                <div className="text-[1.4rem] font-black text-slate-800 tracking-tighter leading-none">
                                    {formatCurrency(stats?.total_customers || 0)} / {formatCurrency(stats?.total_customers_all_time || 0)}
                                </div>
                                <div className="text-[10px] font-black text-slate-400 mt-1.5 flex items-center gap-2">
                                    <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> 정상 {formatCurrency(stats?.normal_customers_count || 0)}</span>
                                    <span className="w-px h-2 bg-slate-200"></span>
                                    <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-rose-400"></span> 휴면 {formatCurrency(stats?.dormant_customers_count || 0)}</span>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="bg-white rounded-[28px] py-5 px-6 min-[2000px]:py-8 min-[2000px]:px-8 border border-slate-100 shadow-[0_4px_20px_rgb(0,0,0,0.03)] relative overflow-hidden group hover:border-amber-200 hover:shadow-[0_20px_40px_rgba(245,158,11,0.08)] transition-all duration-500 h-full min-h-[140px] min-[2000px]:min-h-[180px] flex flex-col justify-between">
                    <div className="flex justify-between items-start">
                        <span className="material-symbols-rounded text-amber-600 bg-amber-50 p-2.5 rounded-[16px] text-[20px] min-[2000px]:text-[28px] shadow-sm">local_shipping</span>
                        <div className="text-[10px] min-[2000px]:text-[13px] font-black text-slate-400 uppercase tracking-widest bg-slate-50 px-2 py-1 rounded-md">Delivery</div>
                    </div>
                    <div>
                        <h3 className="text-slate-500 text-[0.8rem] font-bold uppercase tracking-wider mb-1">배송 대기</h3>
                        <div className="text-[1.4rem] font-black text-amber-600 tracking-tighter leading-none">
                            {isLoading ? <span className="text-slate-200 animate-pulse">...</span> : (`${formatCurrency(stats?.pending_orders || 0)}건`)}
                        </div>
                    </div>
                </div>

                {/* Second Row */}
                <div onClick={handleAIBriefing} className="bg-white rounded-2xl py-4 px-4 min-[2000px]:py-6 min-[2000px]:px-6 border border-slate-100 shadow-sm relative overflow-hidden group hover:border-[#7c3aed]/50 transition-all cursor-pointer flex flex-col justify-between active:scale-95 h-full min-h-[140px] min-[2000px]:min-h-[180px]">
                    <div>
                        <h3 className="text-slate-500 text-[0.85rem] font-bold flex items-center gap-2 mb-2">
                            <span className="material-symbols-rounded text-[#7c3aed] bg-purple-50 p-1.5 rounded-lg text-lg min-[2000px]:text-2xl">smart_toy</span>
                            AI 일일 브리핑
                        </h3>
                        <div className="text-[#6d28d9] text-[1.1rem] font-bold mt-2 leading-tight">전략 분석 리포트 →</div>
                    </div>
                    <p className="text-[0.75rem] opacity-0 pointer-events-none mt-2">spacer</p>
                </div>

                <div className="bg-white rounded-[28px] py-5 px-6 min-[2000px]:py-8 min-[2000px]:px-8 border border-slate-100 shadow-[0_4px_20px_rgb(0,0,0,0.03)] relative overflow-hidden group hover:border-indigo-200 hover:shadow-[0_20px_40px_rgba(79,70,229,0.08)] transition-all duration-500 h-full min-h-[140px] min-[2000px]:min-h-[180px] flex flex-col justify-between">
                    <div className="flex justify-between items-start">
                        <span className="material-symbols-rounded text-indigo-600 bg-indigo-50 p-2.5 rounded-[16px] text-[20px] min-[2000px]:text-[28px] shadow-sm">calendar_today</span>
                        <div className="text-[10px] min-[2000px]:text-[13px] font-black text-slate-400 uppercase tracking-widest bg-slate-50 px-2 py-1 rounded-md">Schedule</div>
                    </div>
                    <div>
                        <h3 className="text-slate-500 text-[0.8rem] font-bold uppercase tracking-wider mb-1">오늘의 스케줄</h3>
                        <div className="text-[1.4rem] font-black text-slate-800 tracking-tighter leading-none">
                            {isLoading ? <span className="text-slate-200 animate-pulse">...</span> : (`${formatCurrency(stats?.today_schedule_count || 0)}건`)}
                        </div>
                    </div>
                </div>

                <div className="bg-white rounded-[28px] py-5 px-6 min-[2000px]:py-8 min-[2000px]:px-8 border border-slate-100 shadow-[0_4px_20px_rgb(0,0,0,0.03)] relative overflow-hidden group hover:border-teal-200 hover:shadow-[0_20px_40px_rgba(20,184,166,0.08)] transition-all duration-500 h-full min-h-[140px] min-[2000px]:min-h-[180px] flex flex-col justify-between">
                    <div className="flex justify-between items-start">
                        <span className="material-symbols-rounded text-teal-600 bg-teal-50 p-2.5 rounded-[16px] text-[20px] min-[2000px]:text-[28px] shadow-sm">event_available</span>
                        <div className="text-[10px] min-[2000px]:text-[13px] font-black text-slate-400 uppercase tracking-widest bg-slate-50 px-2 py-1 rounded-md">Experi.</div>
                    </div>
                    <div>
                        <h3 className="text-slate-500 text-[0.8rem] font-bold uppercase tracking-wider mb-1">체험 예약 (확정)</h3>
                        <div className="text-[1.4rem] font-black text-slate-800 tracking-tighter leading-none">
                            {isLoading ? <span className="text-slate-200 animate-pulse">...</span> : (`${formatCurrency(stats?.experience_reservation_count || 0)}건`)}
                        </div>
                    </div>
                </div>

                <div onClick={() => toggleAlert('inventory')} className={`bg-white rounded-[28px] py-5 px-6 min-[2000px]:py-8 min-[2000px]:px-8 border border-slate-100 border-l-4 border-l-rose-500 shadow-[0_4px_20px_rgb(0,0,0,0.03)] relative overflow-hidden group hover:border-rose-200 hover:shadow-[0_20px_40px_rgba(244,63,94,0.08)] transition-all duration-500 h-full min-h-[140px] flex flex-col justify-between cursor-pointer ${expandedAlert === 'inventory' ? 'ring-2 ring-rose-500' : ''}`}>
                    <div className="flex justify-between items-start">
                        <span className="material-symbols-rounded text-rose-600 bg-rose-50 p-2.5 rounded-[16px] text-[20px] min-[2000px]:text-[28px] shadow-sm">inventory_2</span>
                        <div className="text-[10px] min-[2000px]:text-[13px] font-black text-slate-400 uppercase tracking-widest bg-slate-50 px-2 py-1 rounded-md">Inventory</div>
                    </div>
                    <div>
                        <h3 className="text-slate-500 text-[0.8rem] font-bold uppercase tracking-wider mb-1">지능형 재고 알림</h3>
                        <div className="text-[1.4rem] font-black text-rose-600 tracking-tighter leading-none">
                            <div className="flex gap-3 items-end">
                                <span>{stats?.total_alert_count || (forecastAlerts.length + freshnessAlerts.length)}건</span>
                                <span className="text-[10px] font-bold text-rose-400 mb-1.5 flex gap-1">
                                    <span>소진:{forecastAlerts.length}</span>
                                    <span>/</span>
                                    <span>신선:{freshnessAlerts.length}</span>
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Third Row (Partial) */}
                <div onClick={() => toggleAlert('anniversary')} className={`bg-white rounded-[28px] py-5 px-6 min-[2000px]:py-8 min-[2000px]:px-8 border border-slate-100 border-l-4 border-l-pink-500 shadow-[0_4px_20px_rgb(0,0,0,0.03)] relative overflow-hidden group hover:border-pink-200 hover:shadow-[0_20px_40px_rgba(236,72,153,0.08)] transition-all duration-500 h-full min-h-[140px] flex flex-col justify-between cursor-pointer ${expandedAlert === 'anniversary' ? 'ring-2 ring-pink-500' : ''}`}>
                    <div className="flex justify-between items-start">
                        <span className="material-symbols-rounded text-pink-600 bg-pink-50 p-2.5 rounded-[16px] text-[20px] min-[2000px]:text-[28px] shadow-sm">cake</span>
                        <div className="text-[10px] min-[2000px]:text-[13px] font-black text-slate-400 uppercase tracking-widest bg-slate-50 px-2 py-1 rounded-md">Event</div>
                    </div>
                    <div>
                        <h3 className="text-slate-500 text-[0.8rem] font-bold uppercase tracking-wider mb-1">기념일 고객 케어</h3>
                        <div className="text-[1.4rem] font-black text-[#be185d] tracking-tighter leading-none">
                            {anniversaries.length}명
                        </div>
                    </div>
                </div>

                <div onClick={() => navigate('/customer/consultation')} className="bg-white rounded-[28px] py-5 px-6 min-[2000px]:py-8 min-[2000px]:px-8 border border-slate-100 border-l-4 border-l-blue-500 shadow-[0_4px_20px_rgb(0,0,0,0.03)] relative overflow-hidden group hover:border-blue-200 hover:shadow-[0_20px_40px_rgba(37,99,235,0.08)] transition-all duration-500 h-full min-h-[140px] min-[2000px]:min-h-[180px] flex flex-col justify-between cursor-pointer">
                    <div className="flex justify-between items-start">
                        <span className="material-symbols-rounded text-blue-600 bg-blue-50 p-2.5 rounded-[16px] text-[20px] shadow-sm">forum</span>
                        <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-50 px-2 py-1 rounded-md">Counsel</div>
                    </div>
                    <div>
                        <h3 className="text-slate-500 text-[0.8rem] font-bold uppercase tracking-wider mb-1">상담 대기</h3>
                        <div className="text-[1.4rem] font-black text-blue-600 tracking-tighter leading-none">
                            {stats?.pending_consultation_count || 0}건
                        </div>
                    </div>
                </div>

                <div onClick={() => toggleAlert('repurchase')} className={`bg-white rounded-[28px] py-5 px-6 min-[2000px]:py-8 min-[2000px]:px-8 border border-slate-100 border-l-4 border-l-indigo-500 shadow-[0_4px_20px_rgb(0,0,0,0.03)] relative overflow-hidden group hover:border-indigo-200 hover:shadow-[0_20px_40px_rgba(79,70,229,0.08)] transition-all duration-500 h-full min-h-[140px] flex flex-col justify-between cursor-pointer ${expandedAlert === 'repurchase' ? 'ring-2 ring-indigo-500' : ''}`}>
                    <div className="flex justify-between items-start">
                        <span className="material-symbols-rounded text-indigo-600 bg-indigo-50 p-2.5 rounded-[16px] text-[20px] shadow-sm">notifications_active</span>
                        <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-50 px-2 py-1 rounded-md">Retarget</div>
                    </div>
                    <div>
                        <h3 className="text-slate-500 text-[0.8rem] font-bold uppercase tracking-wider mb-1">AI 재구매 골든 타임</h3>
                        <div className="text-[1.4rem] font-black text-[#4338ca] tracking-tighter leading-none">
                            {formatCurrency(repurchaseCandidates.length)}건
                        </div>
                    </div>
                </div>
            </div>

            {/* 3. Alert Expansion Area (Accordion Logic) */}
            {expandedAlert && (
                <div id="alert-expansion-area" className="mb-6 animate-in slide-in-from-top-4 duration-500">
                    <div className="bg-white rounded-[32px] border border-slate-200 shadow-2xl overflow-hidden ring-1 ring-black/5">
                        {/* Accordion Header */}
                        <div className={`p-6 flex items-center justify-between text-white ${expandedAlert === 'inventory' ? 'bg-gradient-to-r from-rose-500 to-rose-600' :
                            expandedAlert === 'anniversary' ? 'bg-gradient-to-r from-pink-500 to-pink-600' :
                                'bg-gradient-to-r from-indigo-500 to-indigo-600'
                            }`}>
                            <div className="flex items-center gap-3">
                                <span className="material-symbols-rounded text-2xl">
                                    {expandedAlert === 'inventory' ? 'inventory_2' : expandedAlert === 'anniversary' ? 'cake' : 'notifications_active'}
                                </span>
                                <h3 className="text-xl font-black tracking-tight">
                                    {expandedAlert === 'inventory' ? '지능형 재고 소모 분석 & 알림' : expandedAlert === 'anniversary' ? '다가오는 기념일 고객 케어' : 'AI 재구매 골든 타임 타겟'}
                                </h3>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] font-black uppercase tracking-widest bg-white/20 px-3 py-1 rounded-full border border-white/20">Expanded Insight</span>
                                <button onClick={() => setExpandedAlert(null)} className="w-8 h-8 rounded-full bg-black/10 hover:bg-black/20 flex items-center justify-center transition-colors">
                                    <span className="material-symbols-rounded text-lg">close</span>
                                </button>
                            </div>
                        </div>

                        {/* Accordion Content */}
                        <div className="p-8 max-h-[600px] overflow-auto stylish-scrollbar">
                            {expandedAlert === 'inventory' ? (
                                <div className="space-y-8">
                                    <div>
                                        <h4 className="text-lg font-black text-rose-600 mb-3 flex items-center gap-2">
                                            <span className="material-symbols-rounded">trending_down</span> 재고 소진 임박 (Forecast)
                                        </h4>
                                        <div className="overflow-x-auto rounded-2xl border border-slate-100">
                                            <table className="w-full text-sm">
                                                <thead className="bg-slate-50 text-slate-500 font-bold">
                                                    <tr>
                                                        <th className="p-4 text-left">품목명</th>
                                                        <th className="p-4 text-center">현재고</th>
                                                        <th className="p-4 text-center">평균소모</th>
                                                        <th className="p-4 text-center">예상소진</th>
                                                        <th className="p-4 text-center">태스크</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-100">
                                                    {forecastAlerts.map((item, i) => (
                                                        <tr key={i} className="hover:bg-slate-50 transition-colors">
                                                            <td className="p-4">
                                                                <div className="font-bold text-slate-800">{item.product_name}</div>
                                                                <div className="text-[10px] text-slate-400 font-black uppercase tracking-tight">{item.item_type === 'material' ? '📦 자재' : '🍄 완제품'}</div>
                                                            </td>
                                                            <td className="p-4 text-center font-bold text-slate-700">{item.stock_quantity.toLocaleString()}개</td>
                                                            <td className="p-4 text-center text-slate-500">{item.daily_avg_consumption.toFixed(1)}개/일</td>
                                                            <td className={`p-4 text-center font-black ${item.days_remaining <= 3 ? 'text-rose-500' : 'text-amber-500'}`}>
                                                                {item.days_remaining >= 900 ? '출고 없음' : `${item.days_remaining}일 남음`}
                                                            </td>
                                                            <td className="p-4 text-center">
                                                                <button onClick={() => navigate(item.item_type === 'material' ? '/finance/purchase' : '/sales/stock')} className="bg-slate-900 text-white px-4 py-2 rounded-xl font-bold text-xs hover:bg-slate-800 transition-all">입고등록</button>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                    {forecastAlerts.length === 0 && <tr><td colSpan="5" className="p-12 text-center text-slate-400 font-bold italic underline border-t border-slate-100">소진 임박 품목이 없습니다.</td></tr>}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                    <div className="pt-4 border-t border-slate-100">
                                        <h4 className="text-lg font-black text-amber-600 mb-3 flex items-center gap-2">
                                            <span className="material-symbols-rounded">timer</span> 골든 타임 경과 (Freshness)
                                        </h4>
                                        <div className="overflow-x-auto rounded-2xl border border-slate-100">
                                            <table className="w-full text-sm">
                                                <thead className="bg-slate-50 text-slate-500 font-bold">
                                                    <tr>
                                                        <th className="p-4 text-left">품목명</th>
                                                        <th className="p-4 text-center">현재고</th>
                                                        <th className="p-4 text-center">마지막 입고일</th>
                                                        <th className="p-4 text-center">경과일</th>
                                                        <th className="p-4 text-center">태스크</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-100">
                                                    {freshnessAlerts.map((item, i) => (
                                                        <tr key={i} className="hover:bg-slate-50 transition-colors">
                                                            <td className="p-4 font-bold text-slate-800">{item.product_name}</td>
                                                            <td className="p-4 text-center font-bold text-slate-700">{item.stock_quantity.toLocaleString()}개</td>
                                                            <td className="p-4 text-center text-slate-500">{item.last_in_date ? item.last_in_date.substring(0, 10) : '-'}</td>
                                                            <td className="p-4 text-center font-black text-rose-500">+{item.diffDays}일</td>
                                                            <td className="p-4 text-center">
                                                                <button onClick={() => navigate('/sales/stock')} className="bg-slate-900 text-white px-4 py-2 rounded-xl font-bold text-xs hover:bg-slate-800 transition-all">재고관리</button>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                </div>
                            ) : expandedAlert === 'anniversary' ? (
                                <div className="overflow-x-auto rounded-2xl border border-slate-100">
                                    <table className="w-full text-sm">
                                        <thead className="bg-slate-50 text-slate-500 font-bold">
                                            <tr>
                                                <th className="p-4 text-left">고객명</th>
                                                <th className="p-4 text-left">구분</th>
                                                <th className="p-4 text-center">날짜</th>
                                                <th className="p-4 text-center">관리</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {anniversaries.map((c, i) => (
                                                <tr key={i} className="hover:bg-slate-50 transition-colors">
                                                    <td className="p-4 font-black text-slate-800">{c.customer_name}</td>
                                                    <td className="p-4 text-slate-500 font-bold">{c.anniversary_type}</td>
                                                    <td className="p-4 text-center text-slate-500 font-mono">{c.anniversary_date}</td>
                                                    <td className="p-4 text-center">
                                                        <button onClick={() => navigate('/customer/sms')} className="bg-pink-100 text-pink-600 px-4 py-2 rounded-xl font-bold text-xs hover:bg-pink-200 transition-all border border-pink-200 shadow-sm">문자발송</button>
                                                    </td>
                                                </tr>
                                            ))}
                                            {anniversaries.length === 0 && <tr><td colSpan="4" className="p-12 text-center text-slate-400 font-bold italic">예정된 기념일이 없습니다.</td></tr>}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    <div className="flex items-center gap-4 p-4 bg-indigo-50 rounded-2xl border border-indigo-100 mb-4">
                                        <div className="w-10 h-10 rounded-full bg-indigo-500 flex items-center justify-center text-white shrink-0 shadow-lg">
                                            <span className="material-symbols-rounded">psychology</span>
                                        </div>
                                        <div>
                                            <p className="text-indigo-800 text-[13px] font-bold leading-relaxed line-clamp-2">고객별 과거 구매 주기를 분석하여 재구매 시점이 임박한 분들입니다. 맞춤형 판촉 문자를 발송해 보세요.</p>
                                            <div className="text-[10px] text-indigo-400 font-bold mt-1 flex items-center gap-1">
                                                <span className="material-symbols-rounded text-[12px]">verified</span>
                                                최근 2년간의 주문 데이터 및 SKU별 소모 주기를 기준으로 분석됨
                                            </div>
                                        </div>
                                    </div>
                                    <div className="overflow-x-auto rounded-2xl border border-slate-100">
                                        <table className="w-full text-sm">
                                            <thead className="bg-slate-50 text-slate-500 font-bold">
                                                <tr>
                                                    <th className="p-4 text-left">고객명</th>
                                                    <th className="p-4 text-left">연락처</th>
                                                    <th className="p-4 text-center">마지막 주문</th>
                                                    <th className="p-4 text-center">구매주기</th>
                                                    <th className="p-4 text-center">예측상태</th>
                                                    <th className="p-4 text-center">관리</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {repurchaseCandidates.map((c, i) => {
                                                    const remaining = parseInt(c.predicted_days_remaining);
                                                    const status = remaining === 0 ? "오늘" : (remaining > 0 ? `${remaining}일 남음` : `${Math.abs(remaining)}일 경과`);
                                                    const color = remaining === 0 ? 'text-rose-500' : (remaining > 0 ? 'text-emerald-500' : 'text-amber-500');
                                                    return (
                                                        <tr key={i} className="hover:bg-slate-50 transition-colors">
                                                            <td className="p-4 font-black text-slate-800">{c.customer_name}</td>
                                                            <td className="p-4 text-slate-500 font-mono text-xs">{c.mobile_number}</td>
                                                            <td className="p-4 text-center text-slate-500">{c.last_order_date}</td>
                                                            <td className="p-4 text-center font-black text-slate-700">{c.avg_interval_days}일</td>
                                                            <td className={`p-4 text-center font-black ${color}`}>{status}</td>
                                                            <td className="p-4 text-center">
                                                                <button onClick={() => generateAIDraft(c)} className="bg-indigo-600 text-white px-4 py-2 rounded-xl font-bold text-xs hover:bg-indigo-500 transition-all shadow-lg shadow-indigo-100 italic flex items-center gap-1.5 mx-auto">
                                                                    <span className="material-symbols-rounded text-sm">auto_fix_high</span> AI 추천문구
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                                {repurchaseCandidates.length === 0 && <tr><td colSpan="6" className="p-12 text-center text-slate-400 font-bold italic">재구매 대상 고객이 없습니다.</td></tr>}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Accordion Footer */}
                        <div className="px-8 py-5 bg-slate-50 border-t border-slate-100 flex justify-between items-center text-[11px] font-black text-slate-400 uppercase tracking-widest">
                            <div className="flex items-center gap-4">
                                <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Live Analysis</span>
                                <span className="w-px h-3 bg-slate-200"></span>
                                <span className="flex items-center gap-1.5"><span className="material-symbols-rounded text-xs">history</span> Updated {dayjs().format('HH:mm')}</span>
                            </div>
                            <button onClick={() => setExpandedAlert(null)} className="text-indigo-600 hover:text-indigo-700 flex items-center gap-1">CLOSE INSIGHT <span className="material-symbols-rounded text-xs">expand_less</span></button>
                        </div>
                    </div>
                </div>
            )}

            {/* Bottom Section: Chart & Table - Improved stability */}
            <div className="grid grid-cols-1 xl:grid-cols-[1.5fr_1fr] gap-5 flex-1 min-h-0">
                {/* Weekly Sales Chart */}
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

                {/* Top Products */}
                <div className="bg-white rounded-[20px] p-5 min-[2000px]:p-8 shadow-sm border border-slate-100 flex flex-col h-full min-h-0 relative overflow-hidden">
                    <div className="flex justify-between items-center mb-4 shrink-0">
                        <h3 className="text-[1.1rem] font-bold text-slate-800 flex items-center gap-2">
                            <span className="material-symbols-rounded text-amber-500 bg-amber-50 p-1.5 rounded-lg">emoji_events</span>
                            월간 히트 상품 순위
                        </h3>
                        <div className="flex bg-slate-100 p-1 rounded-full">
                            <button onClick={() => setTopMode('qty')} className={`px-4 py-1.5 rounded-full text-[0.75rem] font-bold transition-all ${topMode === 'qty' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}>판매량</button>
                            <button onClick={() => setTopMode('profit')} className={`px-4 py-1.5 rounded-full text-[0.75rem] font-bold transition-all ${topMode === 'profit' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}>순이익</button>
                        </div>
                    </div>
                    <div className="flex-1 overflow-auto stylish-scrollbar relative min-h-0 border-t border-slate-50">
                        {isRankLoading && (
                            <div className="absolute inset-0 flex items-center justify-center bg-white/50 z-10">
                                <div className="flex flex-col items-center gap-2">
                                    <span className="material-symbols-rounded animate-spin text-3xl text-indigo-500">refresh</span>
                                    <span className="text-[11px] font-bold text-slate-400 uppercase">분석 중...</span>
                                </div>
                            </div>
                        )}
                        <table className="w-full text-sm">
                            <thead className="sticky top-0 bg-white">
                                <tr className="text-slate-400 font-semibold border-b border-slate-100 text-[0.75rem] text-left uppercase tracking-wider">
                                    <th className="py-2.5 w-16 text-center">순위</th>
                                    <th className="py-2.5 px-2">제품명</th>
                                    <th className="py-2.5 text-center">수량</th>
                                    <th className="py-2.5 text-right pr-2">판매금액</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50 border-b border-slate-50">
                                {(topMode === 'qty' ? top3Products : topProfitProducts).map((p, idx) => (
                                    <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                                        <td className="py-1.5 text-center font-bold text-slate-400">
                                            {idx === 0 ? <span className="text-xl">🥇</span> : idx === 1 ? <span className="text-xl">🥈</span> : idx === 2 ? <span className="text-xl">🥉</span> : idx + 1}
                                        </td>
                                        <td className="py-1.5 px-2 font-black text-slate-700 text-xs">{p.product_name}</td>
                                        <td className="py-1.5 text-center">
                                            <span className="bg-slate-100 text-slate-600 px-2.5 py-0.5 rounded-full font-black text-[9px] tracking-tight">{formatCurrency(p.total_quantity)}개</span>
                                        </td>
                                        <td className="py-1.5 text-right font-black text-slate-800 text-xs">
                                            {formatCurrency(topMode === 'qty' ? p.total_amount : p.net_profit)}원
                                            {topMode === 'profit' && p.margin_rate && <div className="text-[9px] text-emerald-500 font-medium">마진 {p.margin_rate.toFixed(1)}%</div>}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>


            {/* Premium Logout Confirmation Modal - Deep Blue Theme */}
            {showLogoutModal && (
                <div className="modal-overlay fixed inset-0 z-[10001] flex items-center justify-center bg-[#0f172a]/80 backdrop-blur-md px-4" onClick={() => setShowLogoutModal(false)}>
                    <div className="bg-white w-full max-w-sm rounded-[32px] overflow-hidden shadow-[0_32px_64px_rgba(0,0,0,0.2)] animate-in zoom-in-95 duration-200 border border-slate-200" onClick={e => e.stopPropagation()}>
                        <div className="bg-gradient-to-br from-[#1e293b] to-[#0f172a] h-28 flex items-center justify-center relative">
                            <div className="w-16 h-16 rounded-2xl bg-white/5 backdrop-blur-xl flex items-center justify-center border border-white/10 shadow-inner">
                                <span className="material-symbols-rounded text-indigo-400 text-3xl drop-shadow-[0_0_10px_rgba(129,140,248,0.3)]">logout</span>
                            </div>
                        </div>
                        <div className="p-8 text-center">
                            <h3 className="text-xl font-black text-slate-800 mb-2">세션을 종료할까요?</h3>
                            <p className="text-slate-500 text-[14px] mb-8 font-medium leading-relaxed uppercase tracking-tight">안전하게 로그아웃 후<br />인증 게이트웨이로 리다이렉트합니다.</p>
                            <div className="flex gap-3">
                                <button
                                    onClick={() => setShowLogoutModal(false)}
                                    className="flex-1 py-3.5 rounded-2xl bg-slate-50 text-slate-500 font-bold text-sm hover:bg-slate-100 transition-all active:scale-95 border border-slate-100"
                                >
                                    돌아가기
                                </button>
                                <button
                                    onClick={() => {
                                        sessionStorage.clear();
                                        window.dispatchEvent(new CustomEvent('app-logout'));
                                    }}
                                    className="flex-1 py-3.5 rounded-2xl bg-[#0f172a] text-white font-bold text-sm hover:bg-slate-800 shadow-xl shadow-slate-200 transition-all active:scale-95"
                                >
                                    로그아웃
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* AI Briefing Modal (Premium Style) */}
            {aiBriefingContent && (
                <div className="modal-overlay fixed inset-0 z-[10000] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm px-4" onClick={() => setAiBriefingContent(null)}>
                    <div className="bg-white w-full max-w-xl rounded-[32px] overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300" onClick={e => e.stopPropagation()}>

                        {/* Header Area */}
                        <div className="bg-gradient-to-br from-amber-300 via-yellow-400 to-amber-500 h-32 flex items-center justify-center relative shadow-sm">
                            <div className="w-20 h-20 rounded-full bg-white/40 backdrop-blur-md flex items-center justify-center border border-white/50 shadow-inner">
                                <span className="material-symbols-rounded text-amber-900 text-5xl drop-shadow-sm">wb_sunny</span>
                            </div>
                            <button onClick={() => setAiBriefingContent(null)} className="absolute top-6 right-6 w-10 h-10 rounded-full bg-black/10 hover:bg-black/20 flex items-center justify-center text-amber-900 transition-colors">
                                <span className="material-symbols-rounded">close</span>
                            </button>
                        </div>

                        {/* Body Area */}
                        <div className="p-10 pt-8">
                            <div className="text-center mb-8">
                                <h2 className="text-2xl font-black text-slate-800 mb-2">AI 오늘의 브리핑</h2>
                                <div className="h-1 w-12 bg-amber-400 mx-auto rounded-full" />
                            </div>

                            <div className="bg-slate-50/80 rounded-[24px] p-6 leading-relaxed whitespace-pre-wrap font-medium text-slate-700 text-[14px] border border-slate-100 shadow-inner max-h-[400px] overflow-auto stylish-scrollbar briefing-rendering-area">
                                {aiBriefingContent.includes('<div') || aiBriefingContent.includes('<p') ? (
                                    <div dangerouslySetInnerHTML={{ __html: aiBriefingContent }} className="prose prose-slate max-w-none" />
                                ) : (
                                    aiBriefingContent
                                )}
                            </div>

                            <div className="mt-4 flex items-center justify-center gap-2 text-[11px] font-bold text-slate-400 opacity-60">
                                <span className="material-symbols-rounded text-sm">history_edu</span>
                                이 분석은 과거 운영 데이터 및 실시간 주문 로그를 바탕으로 작성되었습니다.
                            </div>

                            <div className="mt-10">
                                <button onClick={() => setAiBriefingContent(null)} className="w-full bg-amber-500 hover:bg-amber-600 active:scale-[0.98] text-white font-black py-4 rounded-2xl shadow-lg shadow-amber-200/50 transition-all flex items-center justify-center gap-2 group">
                                    오늘 하루도 힘내자! 💪
                                    <span className="material-symbols-rounded group-hover:translate-x-1 transition-transform">arrow_forward</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Dashboard;

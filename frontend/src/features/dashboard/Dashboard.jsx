import React, { useState, useRef } from 'react';
import { formatCurrency } from '../../utils/common';
import { useModal } from '../../contexts/ModalContext';
import dayjs from 'dayjs';
import { useNavigate } from 'react-router-dom';
import { invoke } from '../../utils/apiBridge';
import { invokeAI } from '../../utils/aiErrorHandler';

// Components
import DashboardActionBar from './components/DashboardActionBar';
import WeatherHero from './components/WeatherHero';
import StatCard from './components/StatCard';
import AlertExpansionArea from './components/AlertExpansionArea';
import SalesChart from './components/SalesChart';
import TopProductsTable from './components/TopProductsTable';
import VirtualIotHub from './components/VirtualIotHub';

// Modals
import LogoutModal from './components/modals/LogoutModal';
import AiBriefingModal from './components/modals/AiBriefingModal';
import BusinessReportModal from './components/modals/BusinessReportModal';

// Hooks
import { useDashboard } from './hooks/useDashboard';

const Dashboard = () => {
    const { showAlert, showConfirm } = useModal();
    const navigate = useNavigate();
    const isLite = sessionStorage.getItem('uiMode') === 'lite';

    // Custom Hook for Data
    const {
        stats,
        weeklyData,
        top3Products,
        topProfitProducts,
        anniversaries,
        repurchaseCandidates,
        forecastAlerts,
        freshnessAlerts,
        weatherAdvice,
        isLoading,
        isRankLoading,
        isWeatherLoading,
        isChartLoading,
        isReportLoading,
        setIsReportLoading,
        salesTrend,
        loadDashboardData
    } = useDashboard(showAlert);

    // Unified Expanded Section State
    const [expandedAlert, setExpandedAlert] = useState(null);
    const [showLogoutModal, setShowLogoutModal] = useState(false);
    const [aiBriefingContent, setAiBriefingContent] = useState(null);
    const [businessReport, setBusinessReport] = useState(null);

    // UI States
    const [searchQuery, setSearchQuery] = useState('');
    const [isSearchFocused, setIsSearchFocused] = useState(false);
    const [topMode, setTopMode] = useState('qty');
    const searchRef = useRef(null);

    // Business Logic Handlers
    const handleAIBriefing = async () => {
        try {
            setIsReportLoading(true);
            setAiBriefingContent("AI가 어제와 오늘의 운영 데이터를 정밀 분석하여 일일 리포트를 생성하고 있습니다...");
            const content = await invokeAI(showAlert, 'get_morning_briefing');
            setAiBriefingContent(content);
        } catch (e) {
            console.error(e);
            setAiBriefingContent(`어제의 데이터를 기반으로 분석을 시도했으나 보조 엔진(AI) 연결이 원활하지 않습니다. 대시보드의 실시간 수치를 참조해 주세요! 오늘 하루도 화이팅입니다. 💪`);
        } finally {
            setIsReportLoading(false);
        }
    };

    const handleBusinessReport = async (type) => {
        let statsData = null;
        try {
            setIsReportLoading(true);
            const typeKo = type === 'weekly' ? '주간' : '월간';
            setBusinessReport({ type, content: "" });
            statsData = await invoke('get_business_report_data', { period: type });

            const dataStr = `분석 시점: ${dayjs().format('YYYY년 MM월 DD일')}\n지난 ${typeKo} 비즈니스 통계:\n- 기간: ${statsData.period_label}\n- 총 매출액: ${statsData.total_sales.toLocaleString()}원\n- 총 주문수: ${statsData.total_orders.toLocaleString()}건\n- 신규 유입 고객: ${statsData.new_customers.toLocaleString()}명\n- 베스트 셀러: ${statsData.top_products.map(p => p.product_name).join(', ')}\n- 효자 품목: ${statsData.top_profitable.map(p => p.product_name).join(', ')}`;
            const prompt = `${dataStr}\n위의 경영 데이터를 기반으로 ${typeKo} 성과 리포트 'Executive Summary'를 작성해주세요. 구체적인 분석과 다음 행동 지침(Action Plan)을 포함하고 HTML 태그를 사용해 전문적인 보고서 형식으로 만들어주세요.`;

            const content = await invokeAI(showAlert, 'call_gemini_ai', { prompt });
            setBusinessReport({ type, content, rawData: statsData });
        } catch (e) {
            console.error(e);
            if (statsData) {
                const fallbackContent = `<div class="bg-amber-50 border-l-4 border-amber-400 p-6 mb-8 rounded-r-2xl"><p class="text-[13px] text-amber-700 font-medium">현재 AI 쿼터 초과로 인해 실제 집계된 통계 데이터를 표시합니다.</p></div><h3 class="text-2xl font-black text-slate-800 mb-6">데이터 기반 성과 요약</h3><div class="grid grid-cols-2 gap-4 mb-10"><div class="bg-white p-6 rounded-[24px] border"><div>총 매출액</div><div class="text-2xl font-black">${statsData.total_sales.toLocaleString()}원</div></div><div><div>총 주문건수</div><div class="text-2xl font-black">${statsData.total_orders.toLocaleString()}건</div></div></div>`;
                setBusinessReport({ type, content: fallbackContent, rawData: statsData });
            } else {
                if (!e.message?.includes('AI_QUOTA_EXCEEDED')) showAlert("보고서 생성 실패", "데이터 분석 중 오류가 발생했습니다: " + e);
                setBusinessReport(null);
            }
        } finally {
            setIsReportLoading(false);
        }
    };

    const generateAIDraft = async (customer) => {
        try {
            const prompt = `당신은 'CS 매니저' 전문가입니다. 고객: ${customer.customer_name}, 마지막 상품: ${customer.last_product}, 예상 주기 도달. 재구매 유도 문구를 친절하게 작성해주세요.`;
            const draft = await invokeAI(showAlert, 'call_gemini_ai', { prompt });
            if (await showConfirm("AI 추천 문구 (데이터 기반)", draft + `\n\n이 문구를 복사하고 전송 화면으로 이동할까요?`)) {
                navigator.clipboard.writeText(draft);
                window.__SMS_DRAFT_CONTENT__ = draft;
                window.__SMS_DRAFT_RECIPIENT__ = customer.mobile_number;
                navigate('/customer/sms');
            }
        } catch (e) {
            console.error(e);
        }
    };

    const toggleAlert = (type) => {
        setExpandedAlert(expandedAlert === type ? null : type);
        if (expandedAlert !== type) {
            setTimeout(() => {
                document.getElementById('alert-expansion-area')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 100);
        }
    };

    return (
        <div className="dashboard-container p-6 lg:p-8 min-[2000px]:p-12 bg-[#f8fafc] h-full flex flex-col overflow-hidden text-slate-900 font-sans relative">
            <div className="dashboard-content-inner no-print flex flex-col h-full flex-1 min-h-0 relative">
                {/* Background Decor */}
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-500/5 blur-[120px] rounded-full pointer-events-none"></div>

                {/* 1. Global Action Bar */}
                <DashboardActionBar
                    searchQuery={searchQuery}
                    setSearchQuery={setSearchQuery}
                    isSearchFocused={isSearchFocused}
                    setIsSearchFocused={setIsSearchFocused}
                    searchRef={searchRef}
                    setShowLogoutModal={setShowLogoutModal}
                />

                {/* 2. Main Analytics Grid */}
                <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4 min-[2000px]:gap-6 mb-4 min-[2000px]:mb-6 shrink-0">
                    <WeatherHero weatherAdvice={weatherAdvice} isWeatherLoading={isWeatherLoading} />

                    <StatCard
                        icon="payments" iconColor="text-indigo-600" iconBg="bg-indigo-50"
                        label="오늘의 매출액" value={`${formatCurrency(stats?.total_sales_amount || 0)}원`}
                        trend={salesTrend} isLoading={isLoading}
                    />

                    <StatCard
                        icon="shopping_cart" iconColor="text-blue-600" iconBg="bg-blue-50"
                        label="오늘 주문량" value={`${formatCurrency(stats?.total_orders || 0)}건`}
                        badge="주문" isLoading={isLoading}
                    />

                    <StatCard
                        icon="group_add" iconColor="text-indigo-600" iconBg="bg-indigo-50"
                        label="금일 새 고객 / 전체" value={`${formatCurrency(stats?.total_customers || 0)} / ${formatCurrency(stats?.total_customers_all_time || 0)}`}
                        badge="신규 고객" isLoading={isLoading}
                        secondaryValue={<><span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> 정상 {formatCurrency(stats?.normal_customers_count || 0)}</span><span className="w-px h-2 bg-slate-200"></span><span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-rose-400"></span> 휴면 {formatCurrency(stats?.dormant_customers_count || 0)}</span></>}
                    />

                    <StatCard
                        icon="local_shipping" iconColor="text-amber-600" iconBg="bg-amber-50"
                        label="배송 대기" value={`${formatCurrency(stats?.pending_orders || 0)}건`}
                        badge="배송" isLoading={isLoading}
                        className="hover:border-amber-200"
                    />

                    <StatCard
                        icon="calendar_today" iconColor="text-indigo-600" iconBg="bg-indigo-50"
                        label="오늘의 스케줄" value={`${formatCurrency(stats?.today_schedule_count || 0)}건`}
                        badge="일정" isLoading={isLoading}
                    />

                    <StatCard
                        icon="event_available" iconColor="text-teal-600" iconBg="bg-teal-50"
                        label="체험 예약 (확정)" value={`${formatCurrency(stats?.experience_reservation_count || 0)}건`}
                        badge="체험" isLoading={isLoading}
                        className="hover:border-teal-200"
                    />

                    <StatCard
                        icon="inventory_2" iconColor="text-rose-600" iconBg="bg-rose-50"
                        label="재고 알림" value={`${stats?.total_alert_count || (forecastAlerts.length + freshnessAlerts.length)}건`}
                        badge="재고" isLoading={isLoading}
                        className={`border-l-4 border-l-rose-500 ${expandedAlert === 'inventory' ? 'ring-2 ring-rose-500' : ''}`}
                        onClick={() => toggleAlert('inventory')}
                        secondaryValue={<span className="text-[10px] font-bold text-rose-400 mb-1.5 flex gap-1"><span>소진:{forecastAlerts.length}</span><span>/</span><span>신선:{freshnessAlerts.length}</span></span>}
                    />

                    <StatCard
                        icon="forum" iconColor="text-blue-600" iconBg="bg-blue-50"
                        label="상담 대기" value={`${stats?.pending_consultation_count || 0}건`}
                        badge="상담" isLoading={isLoading}
                        className="border-l-4 border-l-blue-500"
                        onClick={() => navigate('/customer/consultation')}
                    />

                    {!isLite && (
                        <StatCard
                            icon="notifications_active" iconColor="text-indigo-600" iconBg="bg-indigo-50"
                            label="재구매 예정" value={`${formatCurrency(repurchaseCandidates.length)}건`}
                            badge="재구매" isLoading={isLoading}
                            className={`border-l-4 border-l-indigo-500 ${expandedAlert === 'repurchase' ? 'ring-2 ring-indigo-500' : ''}`}
                            onClick={() => toggleAlert('repurchase')}
                        />
                    )}

                    {!isLite && (
                        <div className="bg-white rounded-[28px] py-5 px-6 border border-slate-100 shadow-[0_4px_20px_rgb(0,0,0,0.03)] flex flex-col justify-between h-full group transition-all duration-500 hover:border-indigo-200">
                            <div className="flex justify-between items-start">
                                <h3 className="text-slate-500 text-[0.8rem] font-bold flex items-center gap-2 uppercase tracking-wider">
                                    <span className="material-symbols-rounded text-indigo-600 bg-indigo-50 p-1.5 rounded-lg text-lg">insights</span>지능형 분석
                                </h3>
                                <span className="bg-indigo-50 text-indigo-500 text-[9px] font-black px-2 py-0.5 rounded-full border border-indigo-100 uppercase tracking-tighter">AI 분석</span>
                            </div>
                            <div className="flex flex-col gap-1 mt-2">
                                <button onClick={handleAIBriefing} className="w-full bg-slate-50 hover:bg-slate-100 p-1.5 rounded-xl text-left transition-all group flex items-center justify-between">
                                    <span className="text-[11px] font-bold text-slate-700 ml-1">일일 브리핑</span>
                                    <span className="material-symbols-rounded text-sm text-slate-300 group-hover:text-indigo-500 transition-colors">arrow_forward</span>
                                </button>
                                <div className="grid grid-cols-2 gap-1">
                                    <button onClick={() => handleBusinessReport('weekly')} className="bg-slate-50 hover:bg-indigo-50 p-1.5 rounded-xl text-center transition-all group">
                                        <span className="text-[11px] font-black text-slate-700 group-hover:text-indigo-600">주간 성과</span>
                                    </button>
                                    <button onClick={() => handleBusinessReport('monthly')} className="bg-slate-50 hover:bg-emerald-50 p-1.5 rounded-xl text-center transition-all group">
                                        <span className="text-[11px] font-black text-slate-700 group-hover:text-emerald-600">월간 분석</span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {!isLite && <VirtualIotHub />}
                </div>

                {/* 3. Alert Expansion Detail */}
                <AlertExpansionArea
                    type={expandedAlert}
                    onClose={() => setExpandedAlert(null)}
                    forecastAlerts={forecastAlerts}
                    freshnessAlerts={freshnessAlerts}
                    anniversaries={anniversaries}
                    repurchaseCandidates={repurchaseCandidates}
                    generateAIDraft={generateAIDraft}
                    navigate={navigate}
                />

                {/* 4. Bottom Data Sections */}
                <div className={`grid grid-cols-1 ${isLite ? '' : 'xl:grid-cols-[1.5fr_1fr]'} gap-5 flex-1 min-h-0`}>
                    {!isLite && <SalesChart weeklyData={weeklyData} isChartLoading={isChartLoading} navigate={navigate} />}
                    <TopProductsTable
                        top3Products={top3Products}
                        topProfitProducts={topProfitProducts}
                        topMode={topMode}
                        setTopMode={setTopMode}
                        isRankLoading={isRankLoading}
                    />
                </div>
            </div>

            {/* Modals */}
            {showLogoutModal && <LogoutModal onClose={() => setShowLogoutModal(false)} />}
            <AiBriefingModal
                content={aiBriefingContent}
                isLoading={isReportLoading}
                onClose={() => setAiBriefingContent(null)}
            />
            <BusinessReportModal
                report={businessReport}
                isLoading={isReportLoading}
                onClose={() => setBusinessReport(null)}
            />
        </div>
    );
};

export default Dashboard;

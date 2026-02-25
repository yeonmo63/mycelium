import React from 'react';
import { formatCurrency } from '../../utils/common';
import { useNavigate } from 'react-router-dom';
import StatCard from './components/StatCard';
import {
    ShoppingCart,
    PlusCircle,
    Search,
    Box,
    Users,
    Calendar,
    Settings,
    MessageSquare,
    TrendingUp,
    Store
} from 'lucide-react';

const DashboardLite = ({
    stats,
    isLoading,
    salesTrend,
    weatherAdvice,
    isWeatherLoading,
    onLogout
}) => {
    const navigate = useNavigate();

    const quickActions = [
        { label: '주문 접수', icon: <ShoppingCart className="text-blue-500" />, path: '/sales/reception', color: 'bg-blue-50' },
        { label: '수확/재고', icon: <Box className="text-emerald-500" />, path: '/sales/stock', color: 'bg-emerald-50' },
        { label: '고객 조회', icon: <Users className="text-indigo-500" />, path: '/customer/edit', color: 'bg-indigo-50' },
        { label: '특판 주문', icon: <Store className="text-purple-500" />, path: '/sales/special', color: 'bg-purple-50' },
        { label: '상담 내역', icon: <MessageSquare className="text-amber-500" />, path: '/customer/consultation', color: 'bg-amber-50' },
        { label: '오늘 스케줄', icon: <Calendar className="text-rose-500" />, path: '/schedule', color: 'bg-rose-50' },
        { label: '체험 설정', icon: <Settings className="text-indigo-400" />, path: '/exp/program-mgmt', color: 'bg-indigo-50' },
        { label: '설정', icon: <Settings className="text-slate-500" />, path: '/settings/company-info', color: 'bg-slate-50' },
    ];

    return (
        <div className="dashboard-lite-container p-6 lg:p-10 bg-[#f8fafc] h-full flex flex-col overflow-auto text-slate-900 font-sans relative">
            {/* Header Area */}
            <div className="flex justify-between items-center mb-10">
                <div>
                    <h1 className="text-3xl font-black text-slate-800 tracking-tight mb-2">
                        안녕하세요, <span className="text-indigo-600">{localStorage.getItem('username') || '관리자'}</span>님
                    </h1>
                    <p className="text-slate-400 font-medium">오늘 농장 경영의 핵심 지표입니다.</p>
                </div>
                <div className="flex gap-3">
                    <button
                        onClick={onLogout}
                        className="px-5 py-2.5 rounded-2xl bg-white border border-slate-100 text-slate-400 hover:text-rose-500 hover:border-rose-100 font-bold text-xs transition-all shadow-sm"
                    >
                        로그아웃
                    </button>
                </div>
            </div>

            {/* Top Grid: Major Stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 mb-10">
                <StatCard
                    label="오늘 매출액"
                    value={`${formatCurrency(stats?.total_sales_amount || 0)}원`}
                    icon="payments"
                    iconColor="text-white"
                    iconBg="bg-indigo-600"
                    trend={salesTrend}
                    isLoading={isLoading}
                    className="!bg-indigo-600 !border-0"
                // Custom text color for the primary card
                />
                <style dangerouslySetInnerHTML={{ __html: `.dashboard-lite-container .bg-indigo-600 h3, .dashboard-lite-container .bg-indigo-600 div { color: white !important; } .dashboard-lite-container .bg-indigo-600 .bg-slate-50 { background-color: rgba(255,255,255,0.1) !important; color: white !important; }` }} />

                <StatCard
                    label="오늘 주문"
                    value={`${formatCurrency(stats?.total_orders || 0)}건`}
                    icon="shopping_cart"
                    iconColor="text-blue-600"
                    iconBg="bg-blue-50"
                    badge="ORDER"
                    isLoading={isLoading}
                />

                <StatCard
                    label="배송 대기"
                    value={`${formatCurrency(stats?.pending_orders || 0)}건`}
                    icon="local_shipping"
                    iconColor="text-amber-600"
                    iconBg="bg-amber-50"
                    badge="DELIVERY"
                    isLoading={isLoading}
                />

                <StatCard
                    label="신규 고객"
                    value={`${formatCurrency(stats?.total_customers || 0)}명`}
                    icon="group_add"
                    iconColor="text-emerald-600"
                    iconBg="bg-emerald-50"
                    badge="CUSTOMERS"
                    isLoading={isLoading}
                />
            </div>

            {/* Quick Actions Panel */}
            <div className="mb-10">
                <div className="flex items-center gap-3 mb-6">
                    <h2 className="text-xl font-black text-slate-800 tracking-tight">빠른 실행 메뉴</h2>
                    <div className="h-px flex-1 bg-slate-100"></div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-4">
                    {quickActions.map((action, idx) => (
                        <button
                            key={idx}
                            onClick={() => navigate(action.path)}
                            className="bg-white border border-slate-100 p-6 rounded-[32px] flex flex-col items-center justify-center gap-4 transition-all hover:scale-[1.05] hover:shadow-xl hover:border-indigo-100 group active:scale-95"
                        >
                            <div className={`w-14 h-14 ${action.color} rounded-2xl flex items-center justify-center transition-transform group-hover:rotate-6 shadow-sm`}>
                                {React.cloneElement(action.icon, { size: 28 })}
                            </div>
                            <span className="text-sm font-black text-slate-600 group-hover:text-indigo-600">{action.label}</span>
                        </button>
                    ))}
                </div>
            </div>

            {/* Bottom Section: Weather & Marketing Advice */}
            <div className="mt-auto">
                <div className={`bg-white rounded-[32px] p-8 border border-slate-100 shadow-sm flex flex-col md:flex-row items-center gap-8 ${isWeatherLoading ? 'opacity-50' : ''}`}>
                    <div className="flex flex-col items-center md:items-start text-center md:text-left shrink-0">
                        <div className="text-5xl mb-2">{isWeatherLoading ? '⏳' : (weatherAdvice?.weather_icon || '🌤️')}</div>
                        <div className="text-xl font-black text-slate-800">{isWeatherLoading ? '날씨 정보 로딩 중...' : weatherAdvice?.current_weather || '분석 중'}</div>
                        <div className="text-sm font-bold text-slate-400 uppercase tracking-widest mt-1">오늘의 조언</div>
                    </div>
                    <div className="h-px w-full md:h-12 md:w-px bg-slate-100"></div>
                    <div className="flex-1">
                        <p className="text-slate-600 font-bold leading-relaxed whitespace-pre-wrap italic">
                            {isWeatherLoading ? '데이터를 분석하여 마케팅 전략을 추천해 드립니다...' : (weatherAdvice?.marketing_advice || '데이터가 충분하지 않아 분석을 준비 중입니다.')}
                        </p>
                    </div>
                    {!isWeatherLoading && (
                        <div className="shrink-0 flex gap-2">
                            <div className="px-4 py-2 bg-indigo-50 rounded-full text-indigo-500 font-black text-[10px] border border-indigo-100 uppercase tracking-tighter">데이터 분석 완료</div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default DashboardLite;

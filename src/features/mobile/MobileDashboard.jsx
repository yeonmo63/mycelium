import React, { useState, useEffect } from 'react';
import { useMobileDashboard } from './hooks/useMobileDashboard';
import { formatCurrency } from '../../utils/common';
import {
    TrendingUp,
    TrendingDown,
    ShoppingCart,
    Users,
    Package,
    RefreshCw,
    Calendar,
    Wallet,
    ClipboardList,
    PlusCircle,
    LayoutDashboard
} from 'lucide-react';
import dayjs from 'dayjs';
import { useNavigate } from 'react-router-dom';

const MobileDashboard = () => {
    const navigate = useNavigate();
    const {
        stats,
        salesTrend,
        isLoading,
        loadData
    } = useMobileDashboard();

    const [lastUpdated, setLastUpdated] = useState(dayjs().format('HH:mm:ss'));

    useEffect(() => {
        if (!isLoading) setLastUpdated(dayjs().format('HH:mm:ss'));
    }, [isLoading]);

    return (
        <div className="mobile-fullscreen bg-slate-50 flex flex-col font-sans overflow-x-hidden">
            {/* Header */}
            <div className="bg-indigo-600 px-6 pt-8 pb-16 rounded-b-[40px] relative shadow-lg shrink-0">
                <div className="relative z-10 flex justify-between items-start mb-6">
                    <div>
                        <h1 className="text-white text-2xl font-black tracking-tight">농장 관리 현황</h1>
                    </div>
                    <button
                        onClick={loadData}
                        disabled={isLoading}
                        className={`w-10 h-10 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center text-white transition-all active:scale-95 ${isLoading ? 'opacity-50' : ''}`}
                    >
                        <RefreshCw size={18} className={isLoading ? 'animate-spin' : ''} />
                    </button>
                </div>

                {/* Main Revenue Card */}
                <div className={`relative z-10 bg-white p-6 rounded-3xl shadow-xl transition-all duration-700 ease-out ${isLoading ? 'opacity-90 scale-[0.98]' : 'opacity-100 scale-100'}`}>
                    <div className="flex justify-between items-center mb-4">
                        <span className="text-slate-400 font-bold text-xs uppercase tracking-tight">오늘의 총 매출액</span>
                        {!isLoading && salesTrend ? (
                            <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-black ${salesTrend.isUp ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                                {salesTrend.isUp ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                                {salesTrend.pct}%
                            </div>
                        ) : <div className="w-12 h-4 bg-slate-50 rounded-full animate-pulse"></div>}
                    </div>
                    <div className="text-3xl font-black text-slate-800 tracking-tight h-10 flex items-center">
                        {isLoading ? (
                            <div className="w-48 h-8 bg-slate-100 rounded-lg animate-pulse"></div>
                        ) : (
                            `${formatCurrency(stats?.total_sales_amount || 0)}원`
                        )}
                    </div>
                    <div className="mt-4 pt-4 border-t border-slate-50 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Calendar size={14} className="text-indigo-400" />
                            <span className="text-[11px] text-slate-400 font-bold">{dayjs().format('YYYY년 MM월 DD일')}</span>
                        </div>
                        <span className="text-[10px] text-slate-300 font-medium tracking-tight whitespace-nowrap">마지막 갱신: {lastUpdated}</span>
                    </div>
                </div>
            </div>

            {/* Scrollable Content Area */}
            <div className="flex-1 overflow-y-auto px-6 -mt-6 relative z-20 space-y-4 pb-32">
                <div className="grid grid-cols-2 gap-4">
                    <div className="bg-white p-5 rounded-3xl shadow-md border border-slate-100 min-h-[140px] flex flex-col justify-between">
                        <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center">
                            <ShoppingCart size={20} />
                        </div>
                        <div>
                            <div className="text-slate-400 font-bold text-xs mb-1">오늘 주문량</div>
                            <div className="text-2xl font-black text-slate-800 h-8 flex items-center">
                                {isLoading ? <div className="w-12 h-6 bg-slate-50 rounded animate-pulse"></div> : `${formatCurrency(stats?.total_orders || 0)}건`}
                            </div>
                        </div>
                    </div>

                    <div className="bg-white p-5 rounded-3xl shadow-md border border-slate-100 min-h-[140px] flex flex-col justify-between">
                        <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center">
                            <Package size={20} />
                        </div>
                        <div>
                            <div className="text-slate-400 font-bold text-xs mb-1">배송 대기</div>
                            <div className="text-2xl font-black text-slate-800 h-8 flex items-center">
                                {isLoading ? <div className="w-12 h-6 bg-slate-50 rounded animate-pulse"></div> : `${formatCurrency(stats?.pending_orders || 0)}건`}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-3xl shadow-md border border-slate-100">
                    <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                                <Users size={20} />
                            </div>
                            <h3 className="font-black text-slate-700">고객 현황</h3>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div className="flex justify-between items-end">
                            <div>
                                <div className="text-[11px] text-slate-400 font-bold uppercase mb-1">오늘 새 고객</div>
                                <div className="text-2xl font-black text-slate-800 h-8 flex items-center">
                                    {isLoading ? <div className="w-16 h-6 bg-slate-50 rounded animate-pulse"></div> : `${formatCurrency(stats?.total_customers || 0)}명`}
                                </div>
                            </div>
                            <div className="text-right">
                                <div className="text-[11px] text-slate-400 font-bold uppercase mb-1">전체 누적</div>
                                <div className="text-lg font-black text-indigo-600 h-7 flex items-center justify-end">
                                    {isLoading ? <div className="w-20 h-5 bg-slate-50 rounded animate-pulse"></div> : `${formatCurrency(stats?.total_customers_all_time || 0)}명`}
                                </div>
                            </div>
                        </div>

                        <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden flex">
                            <div className="h-full bg-indigo-500 transition-all duration-1000" style={{ width: isLoading ? '0%' : '65%' }}></div>
                            <div className="h-full bg-indigo-300 transition-all duration-1000" style={{ width: isLoading ? '0%' : '20%' }}></div>
                        </div>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-3xl shadow-md border border-slate-100">
                    <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-2xl bg-teal-50 text-teal-600 flex items-center justify-center">
                                <Wallet size={20} />
                            </div>
                            <h3 className="font-black text-slate-700">일정 및 스케줄</h3>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-6">
                        <div>
                            <div className="text-[10px] text-slate-400 font-bold uppercase mb-1 tracking-tighter">체험 확정 건</div>
                            <div className="text-xl font-black text-slate-800 h-7 flex items-center">
                                {isLoading ? <div className="w-10 h-6 bg-slate-50 rounded animate-pulse"></div> : `${formatCurrency(stats?.experience_reservation_count || 0)}건`}
                            </div>
                        </div>
                        <div>
                            <div className="text-[10px] text-slate-400 font-bold uppercase mb-1 tracking-tighter">금일 스케줄</div>
                            <div className="text-xl font-black text-slate-800 h-7 flex items-center">
                                {isLoading ? <div className="w-10 h-6 bg-slate-50 rounded animate-pulse"></div> : `${formatCurrency(stats?.today_schedule_count || 0)}건`}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="mt-8 px-4 text-center opacity-30">
                    <p className="text-[10px] text-slate-600 font-bold uppercase tracking-widest leading-relaxed">
                        © 2026 Mycelium Farm OS<br />엔터프라이즈 모바일 관제
                    </p>
                </div>
            </div>

            {/* Bottom Tab Bar */}
            <div className="fixed bottom-0 left-0 right-0 bg-white/80 backdrop-blur-xl border-t border-slate-100 flex items-center justify-around h-[calc(5rem+env(safe-area-inset-bottom))] px-4 pb-[env(safe-area-inset-bottom)] z-50">
                <button onClick={() => navigate('/mobile-dashboard')} className="flex flex-col items-center gap-1 text-indigo-600">
                    <LayoutDashboard size={24} />
                    <span className="text-[10px] font-black">현황판</span>
                </button>
                <button onClick={() => navigate('/mobile-worklog')} className="flex flex-col items-center gap-1 text-slate-400">
                    <ClipboardList size={24} />
                    <span className="text-[10px] font-black">작업일지</span>
                </button>
                <button onClick={() => navigate('/mobile-harvest')} className="flex flex-col items-center gap-1 text-slate-400">
                    <PlusCircle size={24} />
                    <span className="text-[10px] font-black">수확입력</span>
                </button>
            </div>
        </div>
    );
};

export default MobileDashboard;

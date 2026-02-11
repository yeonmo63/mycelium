import { useState, useEffect } from 'react';
import { callBridge } from '../../../utils/apiBridge';
import dayjs from 'dayjs';

export const useMobileDashboard = () => {
    const [stats, setStats] = useState(null);
    const [weeklyData, setWeeklyData] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setIsLoading(true);
        try {
            // 모바일에 꼭 필요한 통계와 주간 차트(트렌드용)만 병렬 호출
            const [pri, sec, weekly] = await Promise.all([
                callBridge('get_dashboard_priority_stats'),
                callBridge('get_dashboard_secondary_stats'),
                callBridge('get_weekly_sales_data')
            ]);

            setStats(prev => {
                const combined = { ...(prev || {}) };
                // Merge Priority Stats (only non-null)
                if (pri) Object.keys(pri).forEach(k => { if (pri[k] !== null) combined[k] = pri[k]; });
                // Merge Secondary Stats (only non-null)
                if (sec) Object.keys(sec).forEach(k => { if (sec[k] !== null) combined[k] = sec[k]; });
                return combined;
            });
            setWeeklyData(weekly || []);
        } catch (err) {
            console.error("Mobile Dashboard Load Error:", err);
        } finally {
            setIsLoading(false);
        }
    };

    // 매출 트렌드 계산 로직 (기존 useDashboard와 동일)
    const salesTrend = (() => {
        if (!weeklyData || weeklyData.length < 2) return null;
        const todayStr = dayjs().format('MM-DD');
        const yestStr = dayjs().subtract(1, 'day').format('MM-DD');
        const todayData = weeklyData.find(d => d.date === todayStr);
        const yestData = weeklyData.find(d => d.date === yestStr);

        if (!todayData || !yestData || yestData.total === 0) {
            if (todayData && todayData.total > 0 && (!yestData || yestData.total === 0)) {
                return { pct: 100, isUp: true };
            }
            return null;
        }

        const diff = todayData.total - yestData.total;
        const pct = (diff / yestData.total) * 100;
        return { pct: Math.abs(pct).toFixed(1), isUp: diff >= 0 };
    })();

    return {
        stats,
        salesTrend,
        isLoading,
        loadData
    };
};

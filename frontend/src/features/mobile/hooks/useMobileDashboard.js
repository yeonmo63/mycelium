import { useState, useEffect, useCallback } from 'react';
import { callBridge } from '../../../utils/apiBridge';
import dayjs from 'dayjs';

export const useMobileDashboard = () => {
    const [stats, setStats] = useState(null);
    const [weeklyData, setWeeklyData] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    const loadData = useCallback(async () => {
        setIsLoading(true);
        try {
            // Use Individual try-catches to ensure one failure doesn't block the rest
            const fetchSafe = async (cmd) => {
                try {
                    return await callBridge(cmd);
                } catch (e) {
                    console.warn(`Dashboard partial load failed (${cmd}):`, e);
                    return null;
                }
            };

            const [pri, sec, weekly] = await Promise.all([
                fetchSafe('get_dashboard_priority_stats'),
                fetchSafe('get_dashboard_secondary_stats'),
                fetchSafe('get_weekly_sales_data')
            ]);

            setStats(prev => {
                const combined = { ...(prev || {}) };
                if (pri) Object.keys(pri).forEach(k => { if (pri[k] !== null && pri[k] !== undefined) combined[k] = pri[k]; });
                if (sec) Object.keys(sec).forEach(k => { if (sec[k] !== null && sec[k] !== undefined) combined[k] = sec[k]; });
                return combined;
            });
            setWeeklyData(weekly || []);
        } catch (err) {
            console.error("Mobile Dashboard Critical Load Error:", err);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        loadData();
    }, [loadData]);

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

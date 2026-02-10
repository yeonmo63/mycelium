import { useState, useEffect } from 'react';
import { callBridge } from '../../../utils/apiBridge';
import dayjs from 'dayjs';

export const useDashboard = (showAlert) => {
    const [stats, setStats] = useState(null);
    const [weeklyData, setWeeklyData] = useState([]);
    const [top3Products, setTop3Products] = useState([]);
    const [topProfitProducts, setTopProfitProducts] = useState([]);
    const [anniversaries, setAnniversaries] = useState([]);
    const [repurchaseCandidates, setRepurchaseCandidates] = useState([]);
    const [forecastAlerts, setForecastAlerts] = useState([]);
    const [freshnessAlerts, setFreshnessAlerts] = useState([]);
    const [weatherAdvice, setWeatherAdvice] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isRankLoading, setIsRankLoading] = useState(true);
    const [isWeatherLoading, setIsWeatherLoading] = useState(true);
    const [isChartLoading, setIsChartLoading] = useState(true);
    const [isReportLoading, setIsReportLoading] = useState(false);

    useEffect(() => {
        loadDashboardData();
        const interval = setInterval(loadDashboardData, 300000); // 5 min
        return () => clearInterval(interval);
    }, []);

    const loadDashboardData = async () => {
        // 1. 핵심 통계 (우선순위 분리 로딩)
        callBridge('get_dashboard_priority_stats').then(res => {
            if (res) {
                setStats(prev => ({ ...(prev || {}), ...(res || {}) }));
            }
            setIsLoading(false);

            // 2. 나머지 통계 (Background)
            callBridge('get_dashboard_secondary_stats').then(secRes => {
                if (!secRes) return;
                setStats(prev => {
                    const next = { ...(prev || {}) };
                    Object.keys(secRes).forEach(key => {
                        if (secRes[key] !== null) next[key] = secRes[key];
                    });
                    return next;
                });
            }).catch(e => console.error("Secondary stats error", e));
        }).catch(err => {
            console.error("Dashboard: Stats error", err);
            setStats({});
            setIsLoading(false);
        });

        // 2. 모달 관련 데이터들 (병렬 처리 - 일부는 아직 브릿지에 없을 수 있음)
        Promise.allSettled([
            callBridge('get_upcoming_anniversaries', { days: 3 }).then(res => res && setAnniversaries(res)),
            callBridge('get_repurchase_candidates').then(res => res && setRepurchaseCandidates(res)),
            callBridge('get_inventory_forecast_alerts').then(res => res && setForecastAlerts(res)),
            callBridge('get_product_freshness').then(res => {
                if (!res) return;
                const today = new Date();
                const alerts = (res || []).filter(item => {
                    if (!item.last_in_date || item.stock_quantity <= 0) return false;
                    const lastDate = new Date(item.last_in_date);
                    const diffDays = Math.ceil(Math.abs(today - lastDate) / (1000 * 60 * 60 * 24));
                    item.diffDays = diffDays;
                    return diffDays > 7;
                }).sort((a, b) => b.diffDays - a.diffDays);
                setFreshnessAlerts(alerts);
            })
        ]).catch(e => console.error("Aux data error", e));

        // 3. 주간 차트 데이터
        callBridge('get_weekly_sales_data').then(weeklyRes => {
            if (weeklyRes) setWeeklyData(weeklyRes);
            setIsChartLoading(false);
        }).catch(e => {
            console.error("Dashboard: Weekly chart error", e);
            setIsChartLoading(false);
        });

        // 4. 상품 랭킹
        Promise.allSettled([
            callBridge('get_top3_products_by_qty').then(res => res && setTop3Products(res)),
            callBridge('get_top_profit_products').then(res => res && setTopProfitProducts(res))
        ]).finally(() => setIsRankLoading(false));

        // 5. 날씨 및 마케팅 조언
        callBridge('get_weather_marketing_advice').then(weatherRes => {
            if (weatherRes) setWeatherAdvice(weatherRes);
            setIsWeatherLoading(false);
        }).catch(e => {
            console.error("Dashboard: Weather error", e);
            setIsWeatherLoading(false);
        });
    };

    const salesTrend = (() => {
        if (!weeklyData || weeklyData.length < 2) return null;
        const todayStr = dayjs().format('MM-DD');
        const yestStr = dayjs().subtract(1, 'day').format('MM-DD');
        const todayData = weeklyData.find(d => d.date === todayStr);
        const yestData = weeklyData.find(d => d.date === yestStr);

        if (!todayData || !yestData || yestData.total === 0) {
            if (todayData && todayData.total > 0 && (!yestData || yestData.total === 0)) {
                return { pct: 100, isUp: true, label: '신규' };
            }
            return null;
        }

        const diff = todayData.total - yestData.total;
        const pct = (diff / yestData.total) * 100;
        return { pct: Math.abs(pct).toFixed(1), isUp: diff >= 0 };
    })();

    return {
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
    };
};

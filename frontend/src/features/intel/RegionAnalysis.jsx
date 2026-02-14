import React, { useState, useEffect, useRef } from 'react';
import * as echarts from 'echarts';
import { useModal } from '../../contexts/ModalContext';
import { formatCurrency } from '../../utils/common';
import { invokeAI } from '../../utils/aiErrorHandler';

/**
 * RegionAnalysis.jsx
 * AI 지능형 지역별 판매 히트맵
 * Ported from MushroomFarm and styled with Premium React UI.
 * Uses ECharts for GeoJSON mapping.
 */
const RegionAnalysis = () => {
    const { showAlert } = useModal();

    // --- State ---
    const [years, setYears] = useState([]);
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
    const [isLoading, setIsLoading] = useState(false);
    const [loadingText, setLoadingText] = useState('');
    const [mapData, setMapData] = useState([]);
    const [aiInsight, setAiInsight] = useState(null);
    const [isAiLoading, setIsAiLoading] = useState(false);

    // --- Refs ---
    const mapContainerRef = useRef(null);
    const chartInstance = useRef(null);

    // --- Initialization ---
    useEffect(() => {
        // Init Years
        const current = new Date().getFullYear();
        const yList = [];
        for (let i = 0; i < 5; i++) yList.push(current - i);
        setYears(yList);

        // Resize Listener
        const handleResize = () => {
            if (chartInstance.current) {
                chartInstance.current.resize();
            }
        };
        window.addEventListener('resize', handleResize);

        // Auto run initial
        runAnalysis(current);

        return () => {
            window.removeEventListener('resize', handleResize);
            if (chartInstance.current) chartInstance.current.dispose();
        };
    }, []);

    // --- Core Logic ---
    const runAnalysis = async (year) => {
        year = year || selectedYear;
        setIsLoading(true);
        setLoadingText(`${year}년도 지역별 매출 데이터를 분석 중입니다...`);
        setAiInsight(null);

        try {
            if (!window.__TAURI__) {
                // Mock for dev
                await new Promise(r => setTimeout(r, 1500));
                const mockData = [
                    { region: '경기도', total_amount: 15400000, total_quantity: 450 },
                    { region: '서울특별시', total_amount: 28900000, total_quantity: 820 },
                    { region: '부산광역시', total_amount: 8500000, total_quantity: 210 },
                    { region: '경상남도', total_amount: 4200000, total_quantity: 120 },
                    { region: '강원도', total_amount: 2100000, total_quantity: 80 },
                ];
                setMapData(mockData);
                initMap(mockData);
                generateAiInsight(mockData, year);
                setIsLoading(false);
                return;
            }

            const data = await window.__TAURI__.core.invoke('get_sales_by_region_analysis', { year: Number(year) });
            setMapData(data || []);

            setLoadingText("지도 데이터를 렌더링 중입니다...");
            await initMap(data || []);

            setIsLoading(false); // Stop main loading before AI starts (async)
            generateAiInsight(data || [], year);

        } catch (e) {
            console.error("Region Analysis Error:", e);
            showAlert("분석 오류", e.toString());
            setIsLoading(false);
        }
    };

    const initMap = async (data) => {
        if (!mapContainerRef.current) return;

        if (chartInstance.current) {
            chartInstance.current.dispose();
        }
        chartInstance.current = echarts.init(mapContainerRef.current);
        chartInstance.current.showLoading({ color: '#6366f1', text: '지도를 불러오는 중...', textColor: '#1e293b' });

        try {
            // Load GeoJSON if not registered
            if (!echarts.getMap('south-korea')) {
                const mapUrl = 'https://raw.githubusercontent.com/southkorea/southkorea-maps/master/kostat/2018/json/skorea-provinces-2018-geo.json';
                const response = await fetch(mapUrl);
                if (!response.ok) throw new Error('지도 서버 연결 실패');
                const koreaJson = await response.json();

                // Fix names to match Typical Korean Address First Word (e.g. "서울특별시" -> "서울특별시")
                // The GeoJSON usually has "서울특별시", "부산광역시" etc. which matches our DB standard normally.
                // Just in case, ensuring compatibility.
                koreaJson.features.forEach(f => {
                    f.properties.name = f.properties.name || f.properties.name_ko;
                });

                echarts.registerMap('south-korea', koreaJson);
            }

            const mapSeriesData = data.map(d => ({
                name: d.region,
                value: d.total_amount
            }));

            const maxVal = Math.max(...data.map(d => d.total_amount), 10000000); // Min 1000만원 standard if empty

            const option = {
                tooltip: {
                    trigger: 'item',
                    formatter: (params) => {
                        const val = params.value ? params.value.toLocaleString() : '0';
                        return `<div class="font-sans text-sm p-1">
                                    <div class="font-bold text-slate-700 mb-1">${params.name}</div>
                                    <div class="text-indigo-600 font-bold">₩${val}</div>
                                </div>`;
                    },
                    backgroundColor: 'rgba(255, 255, 255, 0.95)',
                    borderColor: '#e2e8f0',
                    borderWidth: 1,
                    textStyle: { color: '#334155' }
                },
                visualMap: {
                    min: 0,
                    max: maxVal,
                    left: 'right',
                    bottom: '20',
                    text: ['High Sales', 'Low Sales'],
                    calculable: true,
                    inRange: {
                        color: ['#f5f3ff', '#a5b4fc', '#6366f1', '#4338ca', '#1e1b4b']
                    },
                    orient: 'horizontal',
                    right: 20
                },
                series: [{
                    name: '매출액',
                    type: 'map',
                    map: 'south-korea',
                    roam: true,
                    zoom: 1.2,
                    label: {
                        show: true,
                        fontSize: 10,
                        color: '#64748b'
                    },
                    itemStyle: {
                        areaColor: '#f8fafc',
                        borderColor: '#cbd5e1',
                        borderWidth: 1
                    },
                    emphasis: {
                        label: { show: true, color: '#fff', fontWeight: 'bold' },
                        itemStyle: { areaColor: '#f43f5e' }
                    },
                    select: {
                        itemStyle: { areaColor: '#f43f5e' }
                    },
                    data: mapSeriesData
                }]
            };

            chartInstance.current.hideLoading();
            chartInstance.current.setOption(option);

        } catch (e) {
            console.error(e);
            chartInstance.current.hideLoading();
            mapContainerRef.current.innerHTML = `<div class="h-full flex flex-col items-center justify-center text-slate-400">
                <span class="material-symbols-rounded text-4xl mb-2">broken_image</span>
                <p>지도 데이터를 불러오지 못했습니다.</p>
            </div>`;
        }
    };

    const generateAiInsight = async (data, year) => {
        setIsAiLoading(true);
        try {
            if (!window.__TAURI__) {
                await new Promise(r => setTimeout(r, 2000));
                setAiInsight(`[AI 분석] ${year}년도 데이터 분석 결과, 서울/경기 지역이 전체 매출의 65%를 차지하며 핵심 시장임을 입증했습니다. 특히 강남구와 분당구에서의 재구매율이 높아 프리미엄 라인업 마케팅이 주효했던 것으로 보입니다. 반면, 경상권은 잠재 수요 대비 매출이 저조하여 무료 배송 프로모션 등을 통한 시장 확대 전략이 필요합니다.`);
                setIsAiLoading(false);
                return;
            }

            const topRegions = data.slice(0, 8).map(d => `${d.region}: ${formatCurrency(d.total_amount)} (${d.total_quantity}건)`).join(', ');
            const prompt = `
                당신은 Mycelium 전문 경영 컨설턴트 '제니'입니다.
                ${year}년도 지역별 매출 데이터를 분석하고 있습니다: [${topRegions}].
                
                다음 형식으로 인사이트를 작성해주세요:
                1. **핵심 거점 분석**: 매출 상위 지역의 성공 요인 추측
                2. **성장 잠재 지역**: 매출 순위는 중간이지만 성장 가능성이 보이는 곳 (지방 거점 등)
                3. **마케팅 제안**: 지역 특성에 맞는 구체적인 마케팅 액션 (2-3문장)
                
                어조는 전문적이지만 친절하게(해요체) 작성해주세요.
            `;

            const result = await invokeAI(showAlert, 'call_gemini_ai', { prompt });
            setAiInsight(result);

        } catch (e) {
            console.error("AI Error:", e);
            setAiInsight("AI 분석을 수행할 수 없습니다. (API 연결 확인 필요)");
        } finally {
            setIsAiLoading(false);
        }
    };

    return (
        <div className="flex flex-col h-full bg-[#f8fafc] overflow-hidden animate-in fade-in duration-700">
            {/* Header */}
            <div className="px-6 lg:px-8 pt-6 lg:pt-8 pb-4 shrink-0">
                <div className="flex items-center gap-2 mb-1">
                    <span className="w-6 h-1 bg-indigo-600 rounded-full"></span>
                    <span className="text-[9px] font-black tracking-[0.2em] text-indigo-600 uppercase">Geographical Intelligence</span>
                </div>
                <h1 className="text-3xl font-black text-slate-700 tracking-tighter" style={{ fontFamily: '"Noto Sans KR", sans-serif' }}>
                    AI 지역별 판매 히트맵 <span className="text-slate-300 font-light ml-1 text-xl">Regional Heatmap</span>
                </h1>
                <p className="text-slate-400 text-sm mt-1 flex items-center gap-1">
                    <span className="material-symbols-rounded text-sm">map</span>
                    고객 주소 데이터를 기반으로 지역별 매출 밀도와 성장 잠재력을 시각화합니다.
                </p>
            </div>

            {/* Content Container */}
            <div className="flex-1 overflow-y-auto p-6 lg:p-8 min-h-0 custom-scrollbar flex flex-col gap-6">

                {/* Control Bar */}
                <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm flex flex-col md:flex-row justify-between items-center gap-4">
                    <div className="flex items-center gap-4 w-full md:w-auto">
                        <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1">
                            <span className="text-xs font-bold text-slate-500 uppercase">Analysis Year</span>
                            <select
                                value={selectedYear}
                                onChange={(e) => {
                                    setSelectedYear(e.target.value);
                                    runAnalysis(e.target.value);
                                }}
                                className="bg-transparent text-sm font-bold text-slate-800 outline-none border-none cursor-pointer"
                            >
                                {years.map(y => <option key={y} value={y}>{y}년</option>)}
                            </select>
                        </div>
                        <button
                            onClick={() => runAnalysis(selectedYear)}
                            disabled={isLoading}
                            className="px-5 py-2 bg-indigo-600 text-white text-sm font-bold rounded-lg hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200 flex items-center gap-2 disabled:opacity-50"
                        >
                            <span className={`material-symbols-rounded ${isLoading ? 'animate-spin' : ''}`}>
                                {isLoading ? 'sync' : 'analytics'}
                            </span>
                            {isLoading ? '분석 중...' : '분석 실행'}
                        </button>
                    </div>
                </div>

                {/* Main Grid */}
                <div className="flex flex-col xl:flex-row gap-6 min-h-[600px]">

                    {/* Left: Heatmap Chart */}
                    <div className="flex-[2] bg-white rounded-2xl border border-slate-200 shadow-sm relative flex flex-col overflow-hidden min-h-[500px]">
                        <div className="absolute top-5 left-5 z-10 bg-white/90 backdrop-blur px-3 py-2 rounded-xl border border-slate-100 shadow-sm">
                            <h3 className="text-slate-700 font-bold text-sm">대한민국 전국 판매 분포</h3>
                            <div className="text-xs text-slate-400">데이터 기반 실시간 렌더링</div>
                        </div>

                        <div ref={mapContainerRef} className="flex-1 w-full h-full bg-slate-50/30"></div>

                        {/* Loading Overlay */}
                        {isLoading && (
                            <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center z-20">
                                <span className="material-symbols-rounded text-5xl text-indigo-500 animate-spin mb-4">public</span>
                                <h3 className="font-bold text-slate-700">{loadingText}</h3>
                            </div>
                        )}
                    </div>

                    {/* Right: Insights & Table */}
                    <div className="flex-1 flex flex-col gap-6 w-full xl:w-[450px]">

                        {/* AI Insight Card */}
                        <div className="bg-gradient-to-br from-violet-50 to-white rounded-2xl border-l-[6px] border-violet-500 p-6 shadow-sm relative overflow-hidden group">
                            <div className="absolute right-[-20px] bottom-[-20px] opacity-5 transform rotate-[-15deg] transition-transform group-hover:rotate-0 duration-700">
                                <span className="material-symbols-rounded" style={{ fontSize: '150px' }}>psychology_alt</span>
                            </div>

                            <h3 className="text-violet-700 font-bold mb-3 flex items-center gap-2">
                                <span className="material-symbols-rounded">auto_awesome</span> 제니의 지역 전략 제언
                            </h3>

                            <div className="relative min-h-[100px]">
                                {isAiLoading ? (
                                    <div className="flex items-center gap-3 text-slate-400 py-4">
                                        <span className="material-symbols-rounded animate-spin">smart_toy</span>
                                        <span className="text-sm">AI가 지역별 데이터를 심층 분석 중입니다...</span>
                                    </div>
                                ) : (
                                    <div className="text-sm text-slate-700 leading-relaxed whitespace-pre-line animate-in fade-in">
                                        {aiInsight || "분석 버튼을 눌러 AI 리포트를 받아보세요."}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Top Regions Table */}
                        <div className="flex-1 bg-white rounded-2xl border border-slate-200 flex flex-col min-h-0 overflow-hidden">
                            <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                                <h3 className="font-bold text-slate-700 text-sm">지역별 매출 순위</h3>
                                <span className="text-xs font-bold text-slate-400">TOP 10</span>
                            </div>
                            <div className="flex-1 overflow-y-auto custom-scrollbar">
                                <table className="w-full text-sm text-left">
                                    <thead className="sticky top-0 bg-white z-10 shadow-sm text-xs uppercase text-slate-400 font-bold">
                                        <tr>
                                            <th className="py-3 px-4 text-center w-[15%]">순위</th>
                                            <th className="py-3 px-4 w-[40%]">지역</th>
                                            <th className="py-3 px-4 text-right w-[45%]">매출액</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50">
                                        {mapData.slice(0, 10).map((d, i) => (
                                            <tr key={i} className="hover:bg-slate-50 transition-colors">
                                                <td className="py-3 px-4 text-center font-bold text-slate-400">{i + 1}</td>
                                                <td className="py-3 px-4 font-bold text-slate-700">{d.region}</td>
                                                <td className="py-3 px-4 text-right font-mono font-bold text-indigo-600">{formatCurrency(d.total_amount)}</td>
                                            </tr>
                                        ))}
                                        {mapData.length === 0 && !isLoading && (
                                            <tr><td colSpan="3" className="p-8 text-center text-slate-400">데이터가 없습니다.</td></tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                            {mapData.length > 0 && (
                                <div className="p-4 border-t border-slate-100 bg-slate-50/30 text-xs text-slate-500 text-center">
                                    총 <strong className="text-slate-800">{mapData.length}</strong>개 지역에 배송 이력이 있습니다.
                                </div>
                            )}
                        </div>

                    </div>
                </div>
            </div>
        </div>
    );
};

export default RegionAnalysis;

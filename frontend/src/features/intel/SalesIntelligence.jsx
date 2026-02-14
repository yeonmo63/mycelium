import React, { useState, useEffect, useRef } from 'react';
import { Chart, registerables } from 'chart.js';
import { formatCurrency } from '../../utils/common';
import { useModal } from '../../contexts/ModalContext';
import { handlePrintRaw } from '../../utils/printUtils';
import { invokeAI } from '../../utils/aiErrorHandler';

const intelligencePrintStyles = `
    @media print {
        @page { size: A4 portrait; margin: 15mm; }
        html, body { 
            background: white !important; 
            color: black !important;
            color-scheme: light !important;
            margin: 0 !important;
            padding: 0 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
        }
    }
    .print-report-wrapper { 
        font-family: 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif; 
        padding: 0; 
        color: #000; 
        width: 100%;
    }
    .report-card {
        border: 1px solid #000;
        padding: 30px;
        position: relative;
    }
    .report-header { text-align: center; margin-bottom: 40px; }
    .report-header h1 { 
        margin: 0; 
        font-size: 28px; 
        font-weight: 900; 
        letter-spacing: 0.1em; 
        text-decoration: underline; 
        text-underline-offset: 8px;
    }
    .report-header .meta {
        margin-top: 15px;
        display: flex;
        justify-content: space-between;
        font-size: 13px;
        font-weight: bold;
    }
    .section-title {
        font-size: 18px;
        font-weight: 900;
        margin: 30px 0 15px 0;
        padding-left: 10px;
        border-left: 5px solid #000;
    }
    .summary-box {
        border: 2px solid #000;
        padding: 20px;
        background: #fdfdfd !important;
        margin-bottom: 20px;
    }
    .summary-grid {
        display: grid;
        grid-template-cols: 1fr 1fr;
        gap: 15px;
    }
    .summary-item {
        display: flex;
        justify-content: space-between;
        border-bottom: 1px dashed #ccc;
        padding-bottom: 5px;
    }
    .summary-item .label { font-weight: bold; color: #555; }
    .summary-item .value { font-weight: 900; }
    
    table { width: 100%; border-collapse: collapse; font-size: 12px; border: 2px solid #000; }
    th, td { border: 1px solid #000; padding: 8px; text-align: center; }
    th { background: #f0f0f0 !important; font-weight: 900; }
    .text-right { text-align: right; }
    .advice-content {
        padding: 15px;
        border: 1px solid #eee;
        background: #fafafa;
        font-size: 13px;
        line-height: 1.6;
        white-space: pre-wrap;
    }
`;

Chart.register(...registerables);

/**
 * SalesIntelligence.jsx
 * 지능형 경영 분석 리포트 (Intelligent Business Analysis Report)
 * Ported from MushroomFarm and enhanced with Premium React UI.
 */
const SalesIntelligence = () => {
    const { showAlert } = useModal();
    const [activeTab, setActiveTab] = useState('advice');
    const [isLoading, setIsLoading] = useState(true);
    const [loadingText, setLoadingText] = useState('데이터 분석 중...');
    const [sharedData, setSharedData] = useState({ trend: [], topProducts: [] });
    const [isTabLoading, setIsTabLoading] = useState(false);
    const [isGlobalProcessing, setIsGlobalProcessing] = useState(false);
    const [globalLoadingText, setGlobalLoadingText] = useState('');

    const toggleProcessing = (loading, text = '데이터 분석 중...') => {
        setIsGlobalProcessing(loading);
        setGlobalLoadingText(text);
    };

    const handleTabChange = (tabId) => {
        if (activeTab === tabId) return;
        setIsTabLoading(true);
        // Small delay to allow the spinner to render and the UI thread to breathe
        // tailored to make it feel "responsive" rather than "frozen"
        setTimeout(() => {
            setActiveTab(tabId);
            // Keep spinner for a tiny bit longer to ensure render is done
            setTimeout(() => setIsTabLoading(false), 300);
        }, 50);
    };

    // -- Tabs --
    const tabs = [
        { id: 'advice', label: 'AI 경영 조언', icon: 'psychology', color: 'text-indigo-500' },
        { id: 'summary', label: '종합 요약', icon: 'dashboard', color: 'text-slate-600' },
        { id: 'trend', label: '판매 추이', icon: 'trending_up', color: 'text-blue-500' },
        { id: 'product', label: '상품/지역', icon: 'inventory_2', color: 'text-amber-500' },
        { id: 'forecast', label: 'AI 수요 예측', icon: 'auto_awesome', color: 'text-violet-600' },
        { id: 'profit', label: '수익성 분석', icon: 'account_balance_wallet', color: 'text-emerald-500' },
    ];

    useEffect(() => {
        loadSharedData();
    }, []);

    const loadSharedData = async () => {
        if (!window.__TAURI__) return;
        try {
            const [trendData, topProducts] = await Promise.all([
                window.__TAURI__.core.invoke('get_ten_year_sales_stats'),
                window.__TAURI__.core.invoke('get_top3_products_by_qty')
            ]);
            setSharedData({ trend: trendData || [], topProducts: topProducts || [] });
        } catch (e) {
            console.error("Shared data load failed:", e);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex flex-col h-full bg-[#f8fafc] overflow-hidden animate-in fade-in duration-700 relative">
            {/* Global Loading Overlays */}
            {isLoading && (
                <div className="absolute inset-0 z-[100] bg-white/60 backdrop-blur-sm flex flex-col items-center justify-center">
                    <div className="flex flex-col items-center animate-in zoom-in-95 duration-500">
                        <span className="material-symbols-rounded text-6xl text-indigo-500 animate-spin">cyclone</span>
                        <div className="mt-6 text-xl font-black text-slate-700">{loadingText}</div>
                        <p className="text-slate-400 text-sm mt-2">최적의 비즈니스 전략을 구성하는 중입니다.</p>
                    </div>
                </div>
            )}

            {isGlobalProcessing && (
                <div className="absolute inset-0 z-[90] bg-slate-900/5 backdrop-blur-[1px] flex flex-col items-center justify-center">
                    <div className="flex flex-col items-center gap-4 bg-white/90 backdrop-blur-md p-10 rounded-[2.5rem] shadow-2xl shadow-indigo-200/40 border border-white/50 animate-in zoom-in-95 duration-300">
                        <div className="relative">
                            <span className="material-symbols-rounded text-7xl text-indigo-600 animate-spin">progress_activity</span>
                            <span className="material-symbols-rounded text-3xl text-indigo-300 absolute inset-0 flex items-center justify-center">analytics</span>
                        </div>
                        <div className="flex flex-col items-center text-center">
                            <span className="text-xl font-black text-slate-800">{globalLoadingText}</span>
                            <span className="text-sm text-slate-500 mt-2">안정적인 분석을 위해 잠시만 기다려 주세요.<br />데이터 집계 완료 후 리포트가 갱신됩니다.</span>
                        </div>
                    </div>
                </div>
            )}

            {isTabLoading && (
                <div className="absolute inset-0 z-[80] bg-white/40 backdrop-blur-[1px] flex items-center justify-center">
                    <div className="bg-white/90 backdrop-blur-sm px-6 py-4 rounded-2xl shadow-xl flex items-center gap-4 border border-slate-100">
                        <span className="material-symbols-rounded text-2xl animate-spin text-indigo-600">sync</span>
                        <span className="text-base font-bold text-slate-700">탭 전환 중...</span>
                    </div>
                </div>
            )}

            {/* Header Area */}
            <div className="px-6 lg:px-8 pt-6 lg:pt-8 pb-4 shrink-0">
                <div className="flex justify-between items-end">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <span className="w-6 h-1 bg-indigo-600 rounded-full"></span>
                            <span className="text-[9px] font-black tracking-[0.2em] text-indigo-600 uppercase">Intelligent Report</span>
                        </div>
                        <h1 className="text-3xl font-black text-slate-700 tracking-tighter" style={{ fontFamily: '"Noto Sans KR", sans-serif' }}>
                            지능형 경영 분석 리포트 <span className="text-slate-300 font-light ml-1 text-xl">Sales Intelligence</span>
                        </h1>
                        <p className="text-slate-400 text-sm mt-1 flex items-center gap-1">
                            <span className="material-symbols-rounded text-sm">support_agent</span>
                            과거 데이터를 기반으로 AI가 분석한 판매 트렌드와 수익성 전략을 제안합니다.
                        </p>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={() => window.location.reload()} className="h-10 px-4 rounded-xl bg-white border border-slate-200 text-slate-600 font-bold hover:bg-slate-50 transition-all flex items-center gap-2 text-sm shadow-sm">
                            <span className="material-symbols-rounded text-lg">refresh</span> 새로고침
                        </button>
                        <button
                            onClick={() => {
                                const currentYearData = sharedData.trend?.[sharedData.trend.length - 1] || {};
                                const prevYearData = sharedData.trend?.[sharedData.trend.length - 2] || {};
                                const growth = prevYearData.total_amount > 0
                                    ? ((currentYearData.total_amount - prevYearData.total_amount) / prevYearData.total_amount * 100).toFixed(1)
                                    : '0';

                                const html = `
                                    <style>${intelligencePrintStyles}</style>
                                    <div class="print-report-wrapper">
                                        <div class="report-card">
                                            <div class="report-header">
                                                <h1>지능형 경영 분석 리포트</h1>
                                                <div class="meta">
                                                    <span>분석 대상 기간: <strong>최근 10개년</strong></span>
                                                    <span>출력일시: <strong>${new Date().toLocaleString()}</strong></span>
                                                </div>
                                            </div>

                                            <div class="section-title">주요 도표 및 경영 지표 (Key Metrics)</div>
                                            <div class="summary-box">
                                                <div class="summary-grid">
                                                    <div class="summary-item">
                                                        <span class="label">올해(FY ${new Date().getFullYear()}) 총 매출액</span>
                                                        <span class="value">${formatCurrency(currentYearData.total_amount || 0)}원</span>
                                                    </div>
                                                    <div class="summary-item">
                                                        <span class="label">전년 대비 성장률</span>
                                                        <span class="value" style="color: ${Number(growth) >= 0 ? '#d32f2f' : '#1976d2'}">${growth}%</span>
                                                    </div>
                                                    <div class="summary-item">
                                                        <span class="label">총 판매 수량</span>
                                                        <span class="value">${(currentYearData.total_quantity || 0).toLocaleString()}개</span>
                                                    </div>
                                                    <div class="summary-item">
                                                        <span class="label">객단가(추정)</span>
                                                        <span class="value">${formatCurrency(Math.round((currentYearData.total_amount || 0) / (currentYearData.record_count || 1)))}원</span>
                                                    </div>
                                                </div>
                                            </div>

                                            <div class="section-title">장기 매출 변동 추이 (10-Year Trend)</div>
                                            <table>
                                                <thead>
                                                    <tr>
                                                        <th>연도</th>
                                                        <th>거래건수</th>
                                                        <th>판매량</th>
                                                        <th>총 실적(매출액)</th>
                                                        <th>성장률</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    ${[...sharedData.trend].reverse().map((d, i, arr) => {
                                    const prev = arr[i + 1];
                                    let g = '-';
                                    if (prev && prev.total_amount > 0) {
                                        g = (((d.total_amount - prev.total_amount) / prev.total_amount) * 100).toFixed(1) + '%';
                                    }
                                    return `
                                                            <tr>
                                                                <td>${d.year}년</td>
                                                                <td>${d.record_count.toLocaleString()}건</td>
                                                                <td>${d.total_quantity.toLocaleString()}개</td>
                                                                <td class="text-right" style="font-weight: bold;">${formatCurrency(d.total_amount)}원</td>
                                                                <td style="color: ${g.startsWith('-') ? '#1976d2' : '#d32f2f'}; font-weight: bold;">${g}</td>
                                                            </tr>
                                                        `;
                                }).join('')}
                                                </tbody>
                                            </table>

                                            <div class="section-title">인기 품목 분석 (Top Products)</div>
                                            <table>
                                                <thead>
                                                    <tr>
                                                        <th style="width: 80px;">순위</th>
                                                        <th style="text-align: left;">상품명</th>
                                                        <th>누적 판매량</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    ${sharedData.topProducts.map((p, idx) => `
                                                        <tr>
                                                            <td>제 ${idx + 1}위</td>
                                                            <td style="text-align: left; font-weight: bold;">${p.product_name}</td>
                                                            <td class="text-right">${p.total_quantity.toLocaleString()}개</td>
                                                        </tr>
                                                    `).join('')}
                                                </tbody>
                                            </table>

                                            <div style="margin-top: 40px; text-align: center; border-top: 1px solid #eee; padding-top: 20px; font-size: 11px; color: #999;">
                                                본 리포트는 Mycelium ERP Intelligence 엔진에 의해 실시간 집계된 데이터를 바탕으로 생성되었습니다.
                                            </div>
                                        </div>
                                    </div>
                                `;
                                handlePrintRaw(html);
                            }}
                            className="h-10 px-4 rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-700 transition-all flex items-center gap-2 text-sm shadow-lg shadow-indigo-200"
                        >
                            <span className="material-symbols-rounded text-lg">print</span> 리포트 인쇄
                        </button>
                    </div>
                </div>

                {/* Tab Navigation */}
                <div className="flex items-center gap-1 mt-6 border-b border-slate-200 overflow-x-auto custom-scrollbar">
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => handleTabChange(tab.id)}
                            className={`px-4 py-3 text-sm font-bold flex items-center gap-2 border-b-2 transition-all whitespace-nowrap
                                ${activeTab === tab.id ? `border-indigo-600 text-slate-800 bg-indigo-50/50 rounded-t-lg` : 'border-transparent text-slate-400 hover:text-slate-600 hover:bg-slate-50/50 rounded-t-lg'}
                            `}
                        >
                            <span className={`material-symbols-rounded text-lg ${activeTab === tab.id ? tab.color : 'text-slate-400'}`}>{tab.icon}</span>
                            {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto p-6 lg:p-8 min-h-0 custom-scrollbar">
                <div className={(isTabLoading || isGlobalProcessing || isLoading) ? 'opacity-70 blur-[0.5px] pointer-events-none transition-all duration-300' : 'opacity-100 transition-all duration-300'}>
                    <div style={{ display: activeTab === 'advice' ? 'block' : 'none' }}>
                        <TabAdvice sharedData={sharedData} isVisible={activeTab === 'advice'} showAlert={showAlert} toggleProcessing={toggleProcessing} />
                    </div>
                    <div style={{ display: activeTab === 'summary' ? 'block' : 'none' }}>
                        <TabSummary sharedData={sharedData} isVisible={activeTab === 'summary'} />
                    </div>
                    <div style={{ display: activeTab === 'trend' ? 'block' : 'none' }}>
                        <TabTrend sharedData={sharedData} isVisible={activeTab === 'trend'} />
                    </div>
                    <div style={{ display: activeTab === 'product' ? 'block' : 'none' }}>
                        <TabProductRegion isVisible={activeTab === 'product'} toggleProcessing={toggleProcessing} />
                    </div>
                    <div style={{ display: activeTab === 'forecast' ? 'block' : 'none' }}>
                        <TabForecast isVisible={activeTab === 'forecast'} showAlert={showAlert} toggleProcessing={toggleProcessing} />
                    </div>
                    <div style={{ display: activeTab === 'profit' ? 'block' : 'none' }}>
                        <TabProfit isVisible={activeTab === 'profit'} toggleProcessing={toggleProcessing} />
                    </div>
                </div>
            </div>
        </div>
    );
};

// --- Sub Components ---

const TabAdvice = ({ sharedData, isVisible, showAlert, toggleProcessing }) => {
    const [stats, setStats] = useState({ yearTotal: 0, topItem: '-' });
    const [report, setReport] = useState(null);
    const [selectedTheme, setSelectedTheme] = useState('marketing');
    const [isGenerating, setIsGenerating] = useState(false);

    useEffect(() => {
        if (sharedData?.trend && sharedData?.topProducts) {
            const currentYear = new Date().getFullYear();
            const yearData = sharedData.trend.find(d => Number(d.year) === currentYear) || { total_amount: 0 };
            setStats({
                yearTotal: yearData.total_amount,
                topItem: sharedData.topProducts?.[0]?.product_name || '-'
            });
        }
    }, [sharedData]);

    const handleGenerate = async () => {
        if (!window.__TAURI__) return;
        setIsGenerating(true);
        toggleProcessing(true, 'AI가 경영 데이터를 심층 분석하고 있습니다...');
        setReport(null); // Clear previous

        try {
            const themeLabels = {
                'marketing': '마케팅 효율 극대화',
                'stock': '재고 및 운영 최적화',
                'loyal': '단골 고객 확보'
            };

            // Fetch fresh data
            const [trendData, topProducts] = await Promise.all([
                window.__TAURI__.core.invoke('get_ten_year_sales_stats'),
                window.__TAURI__.core.invoke('get_top3_products_by_qty')
            ]);
            const yearData = trendData.find(d => Number(d.year) === new Date().getFullYear()) || { total_amount: 0 };

            const prompt = `당신은 'Mycelium' 전문 경영 컨설턴트 '제니'입니다. 
다음 데이터와 [${themeLabels[selectedTheme]}] 테마를 중심으로 경영 전략 리포트를 작성해주세요.

[데이터]
- 올해 매출: ${formatCurrency(yearData.total_amount)}원
- 인기 품목: ${topProducts.map(p => p.product_name).join(', ')}

[요청]
1. 현황 진단 (수치 언급 필수)
2. '${themeLabels[selectedTheme]}' 테마에 맞춘 실행 가능한 3가지 액션 플랜
3. 전문적이고 따뜻한 어조, 마크다운 형식 활용 (소제목, 불렛포인트)`;

            const result = await invokeAI(showAlert, 'call_gemini_ai', { prompt });
            setReport(result);
        } catch (e) {
            console.error(e);
        } finally {
            setIsGenerating(false);
            toggleProcessing(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="bg-white rounded-2xl p-8 border-l-[6px] border-indigo-500 shadow-sm flex flex-col md:flex-row gap-6">
                <div className="shrink-0 flex flex-col items-center gap-3">
                    <div className="w-20 h-20 rounded-full bg-indigo-50 border-4 border-indigo-100 overflow-hidden">
                        <img src="https://api.dicebear.com/7.x/bottts/svg?seed=jenny" alt="Jenny AI" className="w-full h-full" />
                    </div>
                </div>
                <div className="flex-1">
                    <h2 className="text-2xl font-black text-slate-800 mb-2">제니의 지능형 경영 컨설팅</h2>
                    <p className="text-slate-500 mb-6">AI가 우리 농장의 데이터를 분석하여 맞춤형 성장 전략을 제안해 드립니다.</p>

                    {!report && !isGenerating && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                            {/* Summary Cards */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 flex items-center gap-4">
                                    <div className="w-12 h-12 bg-white rounded-lg flex items-center justify-center text-indigo-500 shadow-sm">
                                        <span className="material-symbols-rounded">payments</span>
                                    </div>
                                    <div>
                                        <div className="text-xs text-slate-400 font-bold uppercase">Total Revenue</div>
                                        <div className="text-lg font-black text-slate-700">{formatCurrency(stats.yearTotal)}원</div>
                                    </div>
                                </div>
                                <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 flex items-center gap-4">
                                    <div className="w-12 h-12 bg-white rounded-lg flex items-center justify-center text-amber-500 shadow-sm">
                                        <span className="material-symbols-rounded">star</span>
                                    </div>
                                    <div>
                                        <div className="text-xs text-slate-400 font-bold uppercase">Best Seller</div>
                                        <div className="text-lg font-black text-slate-700">{stats.topItem}</div>
                                    </div>
                                </div>
                            </div>

                            {/* Theme Selection */}
                            <div>
                                <h3 className="text-sm font-bold text-slate-500 mb-3 flex items-center gap-2">
                                    <span className="material-symbols-rounded text-indigo-500">list_alt</span> 분석 테마 선택
                                </h3>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                    {[
                                        { id: 'marketing', title: '마케팅 효율 극대화', desc: '매출 성장 전략' },
                                        { id: 'stock', title: '재고 및 운영 최적화', desc: '효율적 매장 관리' },
                                        { id: 'loyal', title: '단골 고객 확보', desc: '재방문 유도 전략' }
                                    ].map(theme => (
                                        <div key={theme.id}
                                            onClick={() => setSelectedTheme(theme.id)}
                                            className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${selectedTheme === theme.id ? 'border-indigo-500 bg-indigo-50' : 'border-slate-100 bg-white hover:border-slate-200'}`}
                                        >
                                            <div className={`font-bold mb-1 ${selectedTheme === theme.id ? 'text-indigo-700' : 'text-slate-700'}`}>{theme.title}</div>
                                            <div className="text-xs text-slate-400">{theme.desc}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <button onClick={handleGenerate} className="w-full py-4 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200 flex items-center justify-center gap-2">
                                <span className="material-symbols-rounded">auto_awesome</span> 지금 전략 분석 리포트 생성하기
                            </button>
                        </div>
                    )}

                    {report && !isGenerating && (
                        <div className="bg-slate-50 rounded-xl p-6 border border-slate-200 animate-in fade-in zoom-in-95 duration-500">
                            <div className="flex justify-between items-center mb-4 pb-4 border-b border-slate-200">
                                <h3 className="font-bold text-lg text-slate-700 flex items-center gap-2">
                                    <span className="material-symbols-rounded text-indigo-500">verified</span> 분석 결과 리포트
                                </h3>
                                <button onClick={() => setReport(null)} className="text-sm text-slate-400 hover:text-slate-600">다시 분석하기</button>
                            </div>
                            <div className="prose prose-indigo prose-sm max-w-none text-slate-600 leading-relaxed whitespace-pre-line">
                                {report}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

const TabSummary = ({ sharedData, isVisible }) => {
    const [data, setData] = useState({ yearTotal: 0, yearGrowth: 0, monthTotal: 0, monthGrowth: 0, topProduct: '-', topQty: 0, forecast: 0 });
    const chartRef = useRef(null);
    const chartInstance = useRef(null);

    useEffect(() => {
        if (isVisible && chartInstance.current) {
            chartInstance.current.resize();
        }
    }, [isVisible]);

    useEffect(() => {
        if (sharedData?.trend) {
            processData(sharedData.trend, sharedData.topProducts);
        }
    }, [sharedData]);

    const processData = (trendData, topProducts) => {
        const currentYear = new Date().getFullYear();
        const yearData = trendData.find(d => Number(d.year) === currentYear) || { total_amount: 0 };
        const prevYearData = trendData.find(d => Number(d.year) === currentYear - 1) || { total_amount: 0 };

        const yearGrowth = prevYearData.total_amount > 0
            ? ((yearData.total_amount - prevYearData.total_amount) / prevYearData.total_amount * 100).toFixed(1)
            : 0;

        setData({
            yearTotal: yearData.total_amount,
            yearGrowth,
            monthTotal: Math.round(yearData.total_amount / 12),
            monthGrowth: 0,
            topProduct: topProducts?.[0]?.product_name || '-',
            topQty: topProducts?.[0]?.total_quantity || 0,
            forecast: Math.round(yearData.total_amount / 12 * 1.05)
        });

        renderChart(trendData.slice(-5));
    };

    const renderChart = (chartData) => {
        if (!chartRef.current) return;
        if (chartInstance.current) chartInstance.current.destroy();

        const ctx = chartRef.current.getContext('2d');
        chartInstance.current = new Chart(ctx, {
            type: 'line',
            data: {
                labels: chartData.map(d => d.year + '년'),
                datasets: [{
                    label: '연간 매출',
                    data: chartData.map(d => d.total_amount),
                    borderColor: '#6366f1',
                    backgroundColor: 'rgba(99, 102, 241, 0.1)',
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: { y: { display: false }, x: { grid: { display: false } } }
            }
        });
    };

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                    { label: '올해 총 판매액', value: formatCurrency(data.yearTotal) + '원', sub: `${data.yearGrowth > 0 ? '+' : ''}${data.yearGrowth}% 대비 작년`, color: data.yearGrowth >= 0 ? 'text-red-500' : 'text-blue-500' },
                    { label: '이번 달 추정', value: formatCurrency(data.monthTotal) + '원', sub: '월 평균 기준', color: 'text-slate-500' },
                    { label: '최다 판매 상품', value: data.topProduct, sub: `${data.topQty}개 판매됨`, color: 'text-emerald-600' },
                    { label: 'AI 다음 달 예상', value: formatCurrency(data.forecast) + '원', sub: '제니의 데이터 분석', color: 'text-violet-600', bg: 'bg-violet-50 border-violet-100' }
                ].map((item, idx) => (
                    <div key={idx} className={`p-5 rounded-2xl border ${item.bg || 'bg-white border-slate-200'} shadow-sm`}>
                        <div className="text-xs font-bold text-slate-500 uppercase mb-2">{item.label}</div>
                        <div className={`text-2xl font-black ${item.bg ? 'text-violet-700' : 'text-slate-800'}`}>{item.value}</div>
                        <div className={`text-xs font-bold mt-1 ${item.color}`}>{item.sub}</div>
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[400px]">
                <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 p-6 flex flex-col">
                    <h3 className="font-bold text-lg text-slate-700 mb-4">연간 매출 성장 추이</h3>
                    <div className="flex-1 min-h-0 relative">
                        <canvas ref={chartRef}></canvas>
                    </div>
                </div>
                <div className="bg-white rounded-2xl border border-slate-200 p-6 flex flex-col">
                    <h3 className="font-bold text-lg text-slate-700 mb-4 flex items-center gap-2"><span className="material-symbols-rounded text-indigo-500">info</span> 오늘의 인사이트</h3>
                    <div className="flex-1 text-sm text-slate-600 leading-relaxed bg-slate-50 rounded-xl p-4">
                        <p className="mb-3">• 올해 매출은 전년 대비 <strong className={data.yearGrowth >= 0 ? "text-red-500" : "text-blue-500"}>{data.yearGrowth}%</strong> {data.yearGrowth >= 0 ? '성장' : '감소'}했습니다.</p>
                        <p className="mb-3">• <strong className="text-slate-800">{data.topProduct}</strong> 품목이 전체 매출을 견인하고 있습니다.</p>
                        <p>• 현재 성장세를 유지한다면 내년에는 약 5~10%의 추가 성장이 기대됩니다.</p>
                    </div>
                </div>
            </div>
        </div>
    );
};

const TabTrend = ({ sharedData, isVisible }) => {
    const [trendData, setTrendData] = useState([]);
    const chartRef = useRef(null);
    const chartInstance = useRef(null);

    useEffect(() => {
        if (isVisible && chartInstance.current) {
            chartInstance.current.resize();
        }
    }, [isVisible]);

    useEffect(() => {
        if (sharedData?.trend) {
            const data = [...sharedData.trend]; // Clone
            setTrendData(data.reverse()); // Used for table (newest first)
            renderChart(data); // RenderChart expects newest first? No, original 'sales.js' passed 'data.reverse()' to chart which means oldest first.
            // Wait, previous code: 'renderChart(data.reverse())'. 'data' was newest first after reverse? 
            // API 'get_ten_year_sales_stats' returns [Oldest ... Newest] usually.
            // Previous code: 'setTrendData(data.reverse())' -> Table gets Newest...Oldest.
            // 'renderChart(data.reverse())' -> Chart gets Oldest...Newest again.
            // Let's replicate exact behavior.
            // sharedData.trend is likely [2014, ... 2024] (Oldest -> Newest).

            // Table needs Newest -> Oldest.
            // Chart needs Oldest -> Newest.

            // If sharedData.trend is Oldest->Newest:
            // Table: [...sharedData.trend].reverse()
            // Chart: sharedData.trend

            // Previous Code Observation: 
            // setTrendData(data.reverse()) -> Table receives reversed.
            // renderChart(data.reverse()) -> Chart receives re-reversed (original order).

            renderChart(data.reverse()); // Restore to Oldest->Newest for chart
        }
    }, [sharedData]);

    const renderChart = (data) => {
        if (!chartRef.current) return;
        if (chartInstance.current) chartInstance.current.destroy();

        const ctx = chartRef.current.getContext('2d');
        chartInstance.current = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: data.map(d => d.year + '년'),
                datasets: [
                    {
                        label: '판매액',
                        data: data.map(d => d.total_amount),
                        backgroundColor: 'rgba(99, 102, 241, 0.6)',
                        order: 1
                    },
                    {
                        label: '판매량',
                        data: data.map(d => d.total_quantity),
                        type: 'line',
                        borderColor: '#fb7185',
                        borderWidth: 2,
                        yAxisID: 'y1',
                        order: 0
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: { beginAtZero: true },
                    y1: { position: 'right', beginAtZero: true, grid: { drawOnChartArea: false } }
                }
            }
        });
    };

    return (
        <div className="space-y-6 h-full flex flex-col">
            <div className="bg-white rounded-2xl border border-slate-200 p-6 h-[350px] shrink-0 flex flex-col">
                <h3 className="font-bold text-lg text-slate-700 mb-4">장기 판매 실적 (10년)</h3>
                <div className="flex-1 min-h-0 relative"><canvas ref={chartRef}></canvas></div>
            </div>

            <div className="flex-1 bg-white rounded-2xl border border-slate-200 overflow-hidden flex flex-col min-h-0">
                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 sticky top-0 z-10">
                            <tr className="text-slate-500 border-b border-slate-200">
                                <th className="py-3 px-4 font-bold text-center w-[15%]">연도</th>
                                <th className="py-3 px-4 font-bold text-right w-[20%]">거래 건수</th>
                                <th className="py-3 px-4 font-bold text-right w-[20%]">판매수량</th>
                                <th className="py-3 px-4 font-bold text-right w-[25%]">총 판매액</th>
                                <th className="py-3 px-4 font-bold text-right w-[20%]">성장률</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {trendData.length === 0 ? <tr><td colSpan="5" className="p-8 text-center text-slate-400">데이터 없음</td></tr> :
                                trendData.map((row, idx) => {
                                    const next = trendData[idx + 1]; // Since data is newest first, next index is previous year
                                    let growth = 0;
                                    if (next && next.total_amount > 0) {
                                        growth = ((row.total_amount - next.total_amount) / next.total_amount * 100).toFixed(1);
                                    }
                                    return (
                                        <tr key={row.year} className="hover:bg-slate-50 transition-colors">
                                            <td className="py-3 px-4 text-center font-bold text-slate-900">{row.year}년</td>
                                            <td className="py-3 px-4 text-right text-black">{row.record_count.toLocaleString()}건</td>
                                            <td className="py-3 px-4 text-right text-black">{row.total_quantity.toLocaleString()}개</td>
                                            <td className="py-3 px-4 text-right font-black text-slate-900">{formatCurrency(row.total_amount)}</td>
                                            <td className={`py-3 px-4 text-right font-bold ${growth >= 0 ? 'text-red-600' : 'text-blue-600'}`}>
                                                {growth > 0 && '+'}{growth}%
                                            </td>
                                        </tr>
                                    );
                                })
                            }
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

const TabProductRegion = ({ isVisible, toggleProcessing }) => {
    const [products, setProducts] = useState([]);
    const [regions, setRegions] = useState([]);
    const [hasLoaded, setHasLoaded] = useState(false);
    const pieRef = useRef(null);
    const barRef = useRef(null);
    const pieInstance = useRef(null);
    const barInstance = useRef(null);

    useEffect(() => {
        if (isVisible) {
            if (pieInstance.current) pieInstance.current.resize();
            if (barInstance.current) barInstance.current.resize();
            if (!hasLoaded) loadData();
        }
    }, [isVisible]);

    const loadData = async () => {
        if (!window.__TAURI__) return;
        toggleProcessing(true, '점포 및 지역별 판매 실적을 집계하고 있습니다...');
        try {
            const year = new Date().getFullYear();
            const [pData, rData] = await Promise.all([
                window.__TAURI__.core.invoke('get_product_sales_stats', { year: year.toString() }),
                window.__TAURI__.core.invoke('get_sales_by_region_analysis', { year })
            ]);
            setProducts(pData || []);
            setRegions(rData || []);
            renderCharts(pData, rData);
            setHasLoaded(true);
        } catch (e) {
            console.error(e);
        } finally {
            toggleProcessing(false);
        }
    };

    const renderCharts = (pData, rData) => {
        if (pieInstance.current) pieInstance.current.destroy();
        if (barInstance.current) barInstance.current.destroy();

        // Pie
        if (pieRef.current && pData.length > 0) {
            const top5 = [...pData].sort((a, b) => b.total_amount - a.total_amount).slice(0, 5);
            pieInstance.current = new Chart(pieRef.current.getContext('2d'), {
                type: 'doughnut',
                data: {
                    labels: top5.map(p => p.product_name),
                    datasets: [{
                        data: top5.map(p => p.total_amount),
                        backgroundColor: ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'],
                        borderWidth: 0
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    layout: { padding: 10 },
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: {
                                boxWidth: 10,
                                font: { size: 10, weight: 'bold' },
                                padding: 15
                            }
                        }
                    }
                }
            });
        }

        // Bar
        if (barRef.current && rData.length > 0) {
            const top8 = rData.slice(0, 8);
            barInstance.current = new Chart(barRef.current.getContext('2d'), {
                type: 'bar',
                data: {
                    labels: top8.map(r => r.region),
                    datasets: [{
                        label: '지역별 매출',
                        data: top8.map(r => r.total_amount),
                        backgroundColor: '#10b981',
                        borderRadius: 4
                    }]
                },
                options: {
                    indexAxis: 'y',
                    responsive: true,
                    maintainAspectRatio: false,
                    layout: { padding: { right: 20, top: 10, bottom: 20 } },
                    plugins: { legend: { display: false } },
                    scales: {
                        x: {
                            ticks: {
                                font: { size: 10 },
                                callback: v => {
                                    if (v >= 1000000) return (v / 1000000).toFixed(1) + '백만';
                                    if (v >= 10000) return (v / 10000).toLocaleString() + '만';
                                    return v.toLocaleString();
                                }
                            }
                        },
                        y: {
                            ticks: {
                                font: { weight: 'bold', size: 11 }
                            }
                        }
                    }
                }
            });
        }
    };

    return (
        <div className="flex flex-col gap-6 h-full relative">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-[400px] shrink-0">
                <div className="bg-white rounded-2xl border border-slate-200 p-6 flex flex-col shadow-sm">
                    <h3 className="font-bold text-lg text-slate-700 mb-2 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
                        상품별 매출 비중 (Top 5)
                    </h3>
                    <div className="flex-1 relative min-h-0"><canvas ref={pieRef}></canvas></div>
                </div>
                <div className="bg-white rounded-2xl border border-slate-200 p-6 flex flex-col shadow-sm">
                    <h3 className="font-bold text-lg text-slate-700 mb-2 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                        지역별 매출 상위
                    </h3>
                    <div className="flex-1 relative min-h-0"><canvas ref={barRef}></canvas></div>
                </div>
            </div>

            <div className="flex-1 bg-white rounded-2xl border border-slate-200 overflow-hidden flex flex-col min-h-0 shadow-sm">
                <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 font-bold text-slate-700 flex items-center gap-2">
                    <span className="material-symbols-rounded text-indigo-500">analytics</span>
                    상세 분석 리스트 (완제품 기준)
                </div>
                <div className="flex-1 flex overflow-hidden">
                    <div className="flex-1 flex flex-col border-r border-slate-100">
                        <div className="p-3 bg-slate-50/50 text-xs font-bold text-slate-500 uppercase text-center border-b border-slate-100 italic">By Product</div>
                        <div className="flex-1 overflow-y-auto custom-scrollbar">
                            <table className="w-full text-sm">
                                <thead className="sticky top-0 bg-white shadow-sm">
                                    <tr className="text-slate-500"><th className="py-2 text-left px-4">품목</th><th className="py-2 text-right px-4">매출</th></tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {products.map(p => (
                                        <tr key={p.product_id} className="hover:bg-indigo-50/30 transition-colors">
                                            <td className="py-2 px-4 text-slate-700 font-bold">{p.product_name}</td>
                                            <td className="py-2 px-4 text-right font-mono text-slate-900 font-bold">{formatCurrency(p.total_amount)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                    <div className="flex-1 flex flex-col">
                        <div className="p-3 bg-slate-50/50 text-xs font-bold text-slate-500 uppercase text-center border-b border-slate-100 italic">By Region</div>
                        <div className="flex-1 overflow-y-auto custom-scrollbar">
                            <table className="w-full text-sm">
                                <thead className="sticky top-0 bg-white shadow-sm">
                                    <tr className="text-slate-500"><th className="py-2 text-left px-4">지역</th><th className="py-2 text-right px-4">매출</th></tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {regions.map((r, i) => (
                                        <tr key={i} className="hover:bg-emerald-50/30 transition-colors">
                                            <td className="py-2 px-4 text-slate-700 font-bold">{r.region}</td>
                                            <td className="py-2 px-4 text-right font-mono text-slate-900 font-bold">{formatCurrency(r.total_amount)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

const TabForecast = ({ isVisible, showAlert, toggleProcessing }) => {
    const [productList, setProductList] = useState([]);
    const [selectedProduct, setSelectedProduct] = useState('ALL');
    const [duration, setDuration] = useState('90');
    const [result, setResult] = useState(null);
    const [isProductLoaded, setIsProductLoaded] = useState(false);
    const chartRef = useRef(null);
    const chartInstance = useRef(null);

    useEffect(() => {
        if (isVisible && chartInstance.current) {
            chartInstance.current.resize();
        }
        if (isVisible && !isProductLoaded) {
            loadProducts();
        }
    }, [isVisible]);

    const loadProducts = async () => {
        if (!window.__TAURI__) return;
        try {
            const list = await window.__TAURI__.core.invoke('get_product_list');
            setProductList(list || []);
            setIsProductLoaded(true);
        } catch (e) { }
    };

    const runForecast = async () => {
        if (!window.__TAURI__) return;
        toggleProcessing(true, 'AI가 향후 수요를 예측하고 최적 재고량을 계산 중입니다...');
        try {
            const res = await invokeAI(showAlert, 'get_ai_demand_forecast', {
                productName: selectedProduct === 'ALL' ? null : selectedProduct,
                forecastDays: Number(duration)
            });
            setResult(res);
            renderChart(res);
        } catch (e) {
            console.error(e);
        } finally {
            toggleProcessing(false);
        }
    };

    const renderChart = (res) => {
        if (!chartRef.current) return;
        if (chartInstance.current) chartInstance.current.destroy();

        const history = res.history;
        const forecast = res.forecast;

        chartInstance.current = new Chart(chartRef.current.getContext('2d'), {
            type: 'line',
            data: {
                labels: [...history.map(h => h.date), ...forecast.map(f => f.date)],
                datasets: [
                    { label: '과거 실적', data: history.map(h => h.count), borderColor: '#94a3b8', fill: false, tension: 0.3 },
                    { label: '추후 예측', data: [...Array(history.length - 1).fill(null), history[history.length - 1].count, ...forecast.map(f => f.count)], borderColor: '#6366f1', borderDash: [5, 5], fill: true, backgroundColor: 'rgba(99,102,241,0.1)', tension: 0.3 }
                ]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top' } } }
        });
    };

    return (
        <div className="space-y-6">
            <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2 text-indigo-500 font-bold px-2">
                    <span className="material-symbols-rounded">analytics</span> 예측 설정
                </div>
                <select value={selectedProduct} onChange={e => setSelectedProduct(e.target.value)} className="h-10 rounded-lg border-slate-200 bg-slate-50 px-3 text-sm font-bold min-w-[200px]">
                    <option value="ALL">전체 상품 합계</option>
                    {productList.map(p => <option key={p.product_id} value={p.product_name}>{p.product_name}</option>)}
                </select>
                <select value={duration} onChange={e => setDuration(e.target.value)} className="h-10 rounded-lg border-slate-200 bg-slate-50 px-3 text-sm font-bold w-[140px]">
                    <option value="30">30일 (단기)</option>
                    <option value="90">90일 (중기)</option>
                    <option value="180">180일 (장기)</option>
                </select>
                <button onClick={runForecast} className="ml-auto h-10 px-6 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold shadow-md shadow-indigo-200 flex items-center gap-2">
                    <span className="material-symbols-rounded">psychology</span> AI 분석 실행
                </button>
            </div>

            {!result ? (
                <div className="h-[400px] border-2 border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center text-slate-400 relative">
                    <span className="material-symbols-rounded text-6xl opacity-30 mb-4">insights</span>
                    <p>조건을 선택하고 'AI 분석 실행' 버튼을 눌러주세요.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 p-6 h-[400px] flex flex-col">
                        <canvas ref={chartRef}></canvas>
                    </div>
                    <div className="space-y-4">
                        <div className="bg-indigo-600 text-white rounded-2xl p-6 shadow-lg shadow-indigo-200">
                            <div className="opacity-80 text-sm mb-1">예상 총 매출액</div>
                            <div className="text-3xl font-black">{formatCurrency(result.expected_total_revenue)}원</div>
                            <div className="mt-2 text-xs opacity-70 bg-indigo-700 inline-block px-2 py-1 rounded">성장 예측: {result.growth_rate}%</div>
                        </div>
                        <div className="bg-amber-50 text-amber-900 rounded-2xl p-6 border border-amber-100">
                            <h4 className="font-bold flex items-center gap-2 mb-2"><span className="material-symbols-rounded">inventory</span> 재고 최적화 팁</h4>
                            <p className="text-sm leading-relaxed">{result.stock_tip}</p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

const TabProfit = ({ isVisible, toggleProcessing }) => {
    const [data, setData] = useState([]);
    const [hasLoaded, setHasLoaded] = useState(false);

    useEffect(() => {
        if (isVisible && !hasLoaded) {
            loadData();
        }
    }, [isVisible]);

    const loadData = async () => {
        if (!window.__TAURI__) return;
        toggleProcessing(true, '품목별 수익 구조 및 마진율을 정밀 분석하고 있습니다...');
        try {
            const res = await window.__TAURI__.core.invoke('get_profit_margin_analysis', { year: new Date().getFullYear() });
            setData(res || []);
            setHasLoaded(true);
        } catch (e) {
            console.error(e);
        } finally {
            toggleProcessing(false);
        }
    };

    const totalRev = data.reduce((s, i) => s + i.total_revenue, 0);
    const totalCost = data.reduce((s, i) => s + i.total_cost, 0);
    const totalProfit = data.reduce((s, i) => s + i.net_profit, 0);
    const avgMargin = totalRev ? (totalProfit / totalRev * 100).toFixed(1) : 0;

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-4 gap-4">
                {[
                    { l: '총 순이익', v: formatCurrency(totalProfit) + '원', c: 'text-emerald-600' },
                    { l: '평균 마진율', v: avgMargin + '%', c: 'text-amber-500' },
                    { l: '최고 수익 품목', v: data.length ? data.sort((a, b) => b.net_profit - a.net_profit)[0].product_name : '-', c: 'text-blue-500' },
                    { l: '총 원가', v: formatCurrency(totalCost) + '원', c: 'text-indigo-500' },
                ].map((s, i) => (
                    <div key={i} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                        <div className="text-xs font-bold text-slate-500 uppercase mb-2">{s.l}</div>
                        <div className={`text-2xl font-black ${s.c}`}>{s.v}</div>
                    </div>
                ))}
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden flex flex-col h-[500px]">
                <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                    <h3 className="font-bold text-slate-700">품목별 수익성 및 마진 분석</h3>
                    <div className="text-xs text-slate-500 px-3 py-1 bg-white rounded-full border border-slate-200">* 올해 누적 기준</div>
                </div>
                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    <table className="w-full text-sm">
                        <thead className="bg-white shadow-sm sticky top-0 z-10">
                            <tr className="text-slate-500 border-b border-slate-100">
                                <th className="py-3 px-4 text-left w-[25%]">품목명</th>
                                <th className="py-3 px-4 text-right w-[20%]">매출액</th>
                                <th className="py-3 px-4 text-right w-[15%]">총 원가</th>
                                <th className="py-3 px-4 text-right w-[15%] text-emerald-600 bg-emerald-50/50">순이익</th>
                                <th className="py-3 px-4 text-center w-[10%]">마진율</th>
                                <th className="py-3 px-4 text-right w-[15%]">수량</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {data.length === 0 ? <tr><td colSpan="6" className="p-8 text-center text-slate-400">데이터 없음</td></tr> :
                                data.map((row, i) => (
                                    <tr key={i} className="hover:bg-slate-50">
                                        <td className="py-3 px-4 font-bold text-slate-700">{row.product_name}</td>
                                        <td className="py-3 px-4 text-right text-slate-600">{formatCurrency(row.total_revenue)}</td>
                                        <td className="py-3 px-4 text-right text-slate-400">{formatCurrency(row.total_cost)}</td>
                                        <td className="py-3 px-4 text-right font-black text-emerald-600 bg-emerald-50/30">{formatCurrency(row.net_profit)}</td>
                                        <td className="py-3 px-4 text-center">
                                            <span className={`font-bold ${row.margin_rate >= 30 ? 'text-emerald-500' : row.margin_rate < 15 ? 'text-red-500' : 'text-amber-500'}`}>{row.margin_rate.toFixed(1)}%</span>
                                        </td>
                                        <td className="py-3 px-4 text-right text-slate-500">{row.total_quantity.toLocaleString()}</td>
                                    </tr>
                                ))
                            }
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default SalesIntelligence;

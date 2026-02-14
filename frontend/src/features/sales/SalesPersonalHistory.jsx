import React, { useState, useEffect, useRef, useMemo } from 'react';
import * as echarts from 'echarts';
import { formatCurrency, copyToClipboard, formatPhoneNumber } from '../../utils/common';
import { useModal } from '../../contexts/ModalContext';
import { handlePrintRaw } from '../../utils/printUtils';

const personalPrintStyles = `
    @media print {
        @page { size: A4 landscape; margin: 0; }
        html, body { 
            background: white !important; 
            color: black !important;
            color-scheme: light !important;
            margin: 0 !important;
            padding: 0 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
        }
        #printable-personal-history {
            display: block !important;
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            padding: 10mm !important;
            visibility: visible !important;
            background: white !important;
        }
        #printable-personal-history * {
            visibility: visible !important;
            border-color: black !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
        }
    }
    .print-report-wrapper { 
        font-family: 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif; 
        color: #000; 
        width: 100%;
    }
    .report-card {
        border: 2px solid #000 !important;
        padding: 30px;
        background: white !important;
    }
    .report-header h1 { 
        margin: 0; 
        font-size: 32px; 
        font-weight: 900; 
        letter-spacing: 0.3em; 
        border-bottom: 5px double #000 !important;
        display: inline-block;
        padding: 0 50px 10px 50px;
    }
    table { 
        width: 100%; 
        border-collapse: collapse !important; 
        font-size: 10px; 
        border: 2px solid #000 !important; 
        table-layout: fixed;
    }
    th, td { 
        border: 1px solid #000 !important; 
        padding: 6px 4px; 
        text-align: center; 
    }
    th { 
        background: #f0f0f0 !important; 
        font-weight: 900; 
        border-bottom: 2px solid #000 !important;
    }
    .bg-row { background: #fafafa !important; }
    .summary-table {
        width: 400px;
        border: 2px solid #000 !important;
    }
    .summary-table th, .summary-table td { border: 1px solid #000 !important; }
`;

const SalesPersonalHistory = () => {
    const { showAlert, showConfirm } = useModal();
    // State
    const [keyword, setKeyword] = useState('');
    const [period, setPeriod] = useState('1year');
    const [sales, setSales] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [loadingText, setLoadingText] = useState('');
    const [showAnalysis, setShowAnalysis] = useState(false);
    const [analysisContent, setAnalysisContent] = useState('');

    // Modal State for Graph
    const [isGraphModalOpen, setIsGraphModalOpen] = useState(false);
    const [printModalOpen, setPrintModalOpen] = useState(false);
    const [graphYear, setGraphYear] = useState(null); // null for yearly overview, 'YYYY' for monthly

    // Refs
    const chartRef = useRef(null);
    const chartInstance = useRef(null);

    // Derived Stats
    const stats = useMemo(() => {
        let count = 0;
        let qty = 0;
        let amt = 0;
        sales.forEach(s => {
            if (s.status !== '취소') {
                count++;
                qty += s.quantity;
                amt += s.total_amount;
            }
        });
        return { count, qty, amt };
    }, [sales]);

    // Cleanup chart on unmount or modal close
    useEffect(() => {
        return () => {
            if (chartInstance.current) {
                chartInstance.current.dispose();
                chartInstance.current = null;
            }
        };
    }, []);

    // Graph Effect
    useEffect(() => {
        if (isGraphModalOpen && chartRef.current) {
            // Slight delay to ensure DOM is ready
            setTimeout(renderChart, 100);
        }
    }, [isGraphModalOpen, graphYear, sales]);

    const handleSearch = async () => {
        if (!keyword.trim()) {
            showAlert("알림", "검색할 고객의 성함이나 연락처를 입력해주세요.");
            return;
        }

        setIsLoading(true);
        setLoadingText("판매 데이터를 정밀 검색 중입니다...");
        setShowAnalysis(false); // Hide analysis on new search

        try {
            if (window.__TAURI__) {
                const results = await window.__TAURI__.core.invoke('search_sales_by_any', { query: keyword.trim(), period });
                setSales(results || []);
            }
        } catch (e) {
            console.error(e);
            setSales([]);
            showAlert("오류", "검색 실패: " + e);
        } finally {
            setIsLoading(false);
        }
    };

    const handleReset = () => {
        setKeyword('');
        setPeriod('1year');
        setSales([]);
        setShowAnalysis(false);
        setAnalysisContent('');
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') handleSearch();
    };

    const runJennyAnalysis = () => {
        if (!sales || sales.length === 0) return;

        setShowAnalysis(true);
        setAnalysisContent('<span class="material-symbols-rounded spin text-base animate-spin">sync</span> 분석 중...');

        setTimeout(() => {
            try {
                const validSales = sales.filter(s => s.status !== '취소');
                if (validSales.length === 0) {
                    setAnalysisContent("분석할 유효한 구매 내역이 없습니다.");
                    return;
                }

                const products = {};
                validSales.forEach(s => {
                    products[s.product_name] = (products[s.product_name] || 0) + s.quantity;
                });

                const topProductEntry = Object.entries(products).sort((a, b) => b[1] - a[1])[0];
                const topProduct = topProductEntry ? topProductEntry[0] : '-';
                const totalAmt = validSales.reduce((acc, s) => acc + s.total_amount, 0);
                const avgAmt = validSales.length > 0 ? totalAmt / validSales.length : 0;

                let insight = "";
                if (validSales.length >= 5) {
                    insight = `단골 고객이시네요! 주로 <b class="text-indigo-600">${topProduct}</b> 상품을 선호하시며, 평균 <b class="text-indigo-600">${formatCurrency(avgAmt)}</b>원씩 구매하십니다. 명절 선물 세트 출시 시 알림을 보내드리면 전환율이 높을 것 같습니다.`;
                } else if (validSales.length >= 2) {
                    insight = `재방문 고객입니다. <b class="text-indigo-600">${topProduct}</b> 외에 연관 상품인 '건표고' 상품을 함께 추천해 보시는 건 어떨까요?`;
                } else {
                    insight = `첫 구매 이후 관리가 필요한 고객입니다. 첫 구매 감사 쿠폰이나 멤버십 혜택을 안내하여 재구매를 유도해 보세요.`;
                }

                setAnalysisContent(insight);
            } catch (e) {
                setAnalysisContent("분석 중 오류가 발생했습니다.");
            }
        }, 800);
    };

    const renderChart = () => {
        const container = chartRef.current;
        if (!container) return;

        if (chartInstance.current) {
            chartInstance.current.dispose();
        }

        const myChart = echarts.init(container);
        chartInstance.current = myChart;

        let labels = [];
        let quantities = [];
        let amounts = [];

        if (graphYear) {
            // Monthly
            const monthlyData = {};
            for (let m = 1; m <= 12; m++) monthlyData[String(m).padStart(2, '0')] = { qty: 0, amt: 0 };

            sales.filter(s => s.status !== '취소' && s.order_date.startsWith(graphYear)).forEach(s => {
                const month = s.order_date.substring(5, 7);
                if (monthlyData[month]) {
                    monthlyData[month].qty += s.quantity;
                    monthlyData[month].amt += s.total_amount;
                }
            });

            labels = Object.keys(monthlyData).sort().map(m => `${m}월`);
            quantities = Object.values(monthlyData).map(d => d.qty);
            amounts = Object.values(monthlyData).map(d => d.amt);
        } else {
            // Yearly
            const yearlyData = {};
            sales.filter(s => s.status !== '취소').forEach(s => {
                const year = s.order_date.substring(0, 4);
                if (!yearlyData[year]) yearlyData[year] = { qty: 0, amt: 0 };
                yearlyData[year].qty += s.quantity;
                yearlyData[year].amt += s.total_amount;
            });
            labels = Object.keys(yearlyData).sort();
            quantities = labels.map(y => yearlyData[y].qty);
            amounts = labels.map(y => yearlyData[y].amt);
        }

        const option = {
            title: {
                text: graphYear ? `${graphYear}년 구매 현황` : '년도별 구매 현황 (클릭 시 월별 조회)',
                left: 'center',
                textStyle: { fontSize: 14, color: '#64748b' }
            },
            tooltip: { trigger: 'axis', axisPointer: { type: 'cross' } },
            legend: { data: ['구매량(건)', '구매액(원)'], bottom: 0 },
            grid: { left: '3%', right: '4%', bottom: '10%', top: '15%', containLabel: true },
            xAxis: { type: 'category', data: labels, axisPointer: { type: 'shadow' } },
            yAxis: [
                { type: 'value', name: '구매량', axisLabel: { formatter: '{value}' } },
                { type: 'value', name: '구매액', axisLabel: { formatter: (val) => (val / 10000).toLocaleString() + '만' } }
            ],
            series: [
                {
                    name: '구매량(건)', type: 'bar', data: quantities,
                    itemStyle: { color: graphYear ? '#60a5fa' : '#fb7185', borderRadius: [4, 4, 0, 0] },
                    barWidth: '40%',
                    emphasis: { itemStyle: { color: graphYear ? '#3b82f6' : '#e11d48' } }
                },
                {
                    name: '구매액(원)', type: 'line', yAxisIndex: 1, data: amounts,
                    itemStyle: { color: '#6366f1' }, lineStyle: { width: 3 }, symbolSize: 8, smooth: true
                }
            ]
        };

        myChart.setOption(option);

        // Drill-down event
        if (!graphYear) {
            myChart.on('click', (params) => {
                if (params.componentType === 'series') {
                    setGraphYear(params.name);
                }
            });
        }

        // Resize handler
        const handleResize = () => myChart.resize();
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    };

    const handlePrint = () => {
        const el = document.getElementById('printable-personal-content');
        if (!el) return;

        const html = `
            <style>
                ${personalPrintStyles}
                @page { size: A4 landscape; margin: 10mm; }
                body { font-family: 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif; margin: 0; padding: 10mm; }
                table { border-collapse: collapse !important; width: 100%; }
                th, td { border: 1px solid #000 !important; }
            </style>
            ${el.outerHTML}
        `;
        handlePrintRaw(html);
    };

    const handleExportCsv = async () => {
        if (sales.length === 0) {
            showAlert("알림", "저장할 데이터가 없습니다.");
            return;
        }

        const rows = [['No', '상태', '구분', '일자', '고객명', '연락처', '배송처', '상품명', '규격', '수량', '금액', '메모']];
        sales.forEach((s, idx) => {
            const type = (s.customer_id && s.customer_id.length >= 10 && s.customer_id.substring(9, 10) === '0') ? '일반' : '특판';
            rows.push([
                idx + 1,
                s.status || '접수',
                type,
                s.order_date,
                s.customer_name || '',
                s.customer_mobile || s.shipping_mobile_number || '', // Fallback to shipping mobile if customer mobile missing? Original just used one.
                s.shipping_name || '',
                s.product_name,
                s.specification || '',
                s.quantity,
                s.total_amount,
                (s.memo || '').replace(/\n/g, ' ')
            ].map(v => `"${v}"`));
        });

        const csvContent = '\uFEFF' + rows.map(r => r.join(',')).join('\n');

        try {
            if (window.__TAURI__) {
                const savePath = await window.__TAURI__.core.invoke('plugin:dialog|save', {
                    options: { filters: [{ name: 'CSV', extensions: ['csv'] }], defaultPath: `개인별판매현황.csv` }
                });
                if (savePath) {
                    await window.__TAURI__.core.invoke('plugin:fs|write_text_file', { path: savePath, contents: csvContent });
                    showAlert("성공", "성공적으로 저장되었습니다.");
                }
            }
        } catch (e) {
            console.error(e);
            showAlert("오류", "저장 실패: " + e);
        }
    };

    const handleCopy = (text) => {
        copyToClipboard(text);
        // Optional: toast or minimal feedback could be added here
    };

    // Print Style Injection (React way is usually CSS, but for specific print layout similar to ref, inline styles/print media query in Global CSS is better, but here we can rely on Tailwind's print modifiers or conditional rendering)
    // The previous component relied on `print:` classes. We will do the same.

    return (
        <div className="h-full flex flex-col bg-slate-50 relative overflow-hidden print:bg-white print:h-auto print:overflow-visible print:block">

            {/* Header Title (Matches SalesReception Style) */}
            <div className="px-6 lg:px-8 min-[2000px]:px-12 pt-6 lg:pt-8 min-[2000px]:pt-12 pb-1 shrink-0 print:hidden">
                <div className="flex justify-between items-end mb-4">
                    <div>
                        <div className="flex items-center gap-2 mb-0.5">
                            <span className="w-6 h-1 bg-indigo-600 rounded-full"></span>
                            <span className="text-[9px] font-black tracking-[0.2em] text-indigo-600 uppercase">Sales Analysis & History</span>
                        </div>
                        <h1 className="text-3xl font-black text-slate-600 tracking-tighter" style={{ fontFamily: '"Noto Sans KR", sans-serif' }}>
                            개인별 판매 현황 <span className="text-slate-300 font-light ml-1 text-xl">Personal History</span>
                        </h1>
                    </div>
                </div>
            </div>

            {/* Print Header */}
            <div className="hidden print:block w-full mb-8 text-center">
                <h1 className="text-3xl font-black text-black mb-4 pb-2 border-b-2 border-black" style={{ fontFamily: '"Malgun Gothic", sans-serif' }}>개인별 판매 현황</h1>
                <div className="flex justify-between items-end text-xs text-slate-600 mb-2">
                    <span>검색어: <span className="font-bold">{keyword}</span> ({period === '1year' ? '최근 1년' : '전체 기간'})</span>
                    <span>출력일시: {new Date().toLocaleString()}</span>
                </div>
            </div>

            {/* Main Card */}
            <div className={`flex-1 flex flex-col min-h-0 px-6 lg:px-8 min-[2000px]:px-12 pb-6 lg:pb-8 min-[2000px]:pb-12 mt-2 bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden print:shadow-none print:border-none print:m-0 print:rounded-none ${isLoading ? 'opacity-80 pointer-events-none' : ''}`}>

                {/* 1. Search Bar */}
                <div className="shrink-0 p-4 border-b border-slate-100 flex gap-3 items-center bg-white rounded-t-2xl shadow-sm z-20 print:hidden justify-between">
                    <div className="flex gap-3 items-center">
                        <div className="relative">
                            <input
                                type="text"
                                value={keyword}
                                onChange={(e) => setKeyword(e.target.value)}
                                onKeyDown={handleKeyDown}
                                className="pl-3 pr-4 h-[42px] w-[280px] bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300 transition-all placeholder:text-slate-400"
                                placeholder="성함 또는 연락처 입력"
                                autoFocus
                            />
                        </div>
                        <div className="relative">
                            <select
                                value={period}
                                onChange={(e) => setPeriod(e.target.value)}
                                className="pl-4 pr-10 h-[42px] w-[140px] bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300 cursor-pointer appearance-none"
                            >
                                <option value="1year">최근 1년</option>
                                <option value="all">전체 기간</option>
                            </select>
                            <span className="material-symbols-rounded absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">expand_more</span>
                        </div>
                        <button onClick={handleSearch} className="h-[42px] px-6 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm shadow-md shadow-indigo-200 flex items-center gap-2 transition-all active:scale-95">
                            <span className="material-symbols-rounded">search</span> 조회
                        </button>
                        <button onClick={handleReset} className="h-[42px] px-5 rounded-xl bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 font-bold text-sm shadow-sm flex items-center gap-2 transition-all active:scale-95">
                            <span className="material-symbols-rounded">refresh</span> 초기화
                        </button>
                    </div>

                    {sales.length > 0 && (
                        <button onClick={runJennyAnalysis} className="h-[42px] px-5 rounded-xl bg-sky-50 hover:bg-sky-100 text-sky-600 border border-sky-100 font-bold text-sm flex items-center gap-1.5 transition-all">
                            <span className="material-symbols-rounded">auto_awesome</span> 분석
                        </button>
                    )}
                </div>

                {/* Loading Overlay */}
                {isLoading && (
                    <div className="absolute inset-0 z-50 bg-white/60 backdrop-blur-[1px] flex flex-col items-center justify-center">
                        <div className="w-10 h-10 border-4 border-slate-200 border-t-indigo-500 rounded-full animate-spin mb-3"></div>
                        <div className="text-sm font-bold text-slate-600">{loadingText}</div>
                    </div>
                )}

                {/* 2. Jenny Analysis Area */}
                {showAnalysis && (
                    <div className="shrink-0 p-5 bg-gradient-to-r from-sky-50 to-white border-b border-sky-100 relative overflow-hidden print:hidden animate-in slide-in-from-top-2 duration-300">
                        <div className="absolute top-[-10px] right-[-10px] opacity-5 pointer-events-none">
                            <span className="material-symbols-rounded text-[120px]">auto_awesome</span>
                        </div>
                        <div className="flex items-start gap-3 relative z-10">
                            <div className="bg-sky-100 p-2.5 rounded-xl text-sky-600 shadow-sm">
                                <span className="material-symbols-rounded">psychology_alt</span>
                            </div>
                            <div>
                                <h4 className="text-sky-700 font-bold text-sm mb-1.5 flex items-center gap-1.5">
                                    Jenny의 AI 분석 리포트
                                </h4>
                                <div className="text-sm text-slate-600 leading-relaxed" dangerouslySetInnerHTML={{ __html: analysisContent }}></div>
                            </div>
                        </div>
                    </div>
                )}

                {/* 3. Table */}
                <div className="flex-1 overflow-auto bg-white relative stylish-scrollbar print:overflow-visible">
                    <table className="w-full text-xs border-collapse table-fixed">
                        <thead className="sticky top-0 z-10 bg-white/95 backdrop-blur shadow-sm">
                            <tr>
                                <th className="py-3 text-center font-black text-slate-400 uppercase tracking-wider border-b border-slate-100 bg-slate-50/50 w-[5%]">No</th>
                                <th className="py-3 text-center font-black text-slate-400 uppercase tracking-wider border-b border-slate-100 bg-slate-50/50 w-[8%]">상태</th>
                                <th className="py-3 text-center font-black text-slate-400 uppercase tracking-wider border-b border-slate-100 bg-slate-50/50 w-[6%]">구분</th>
                                <th className="py-3 text-center font-black text-slate-400 uppercase tracking-wider border-b border-slate-100 bg-slate-50/50 w-[10%]">일자</th>
                                <th className="py-3 text-left pl-4 font-black text-slate-400 uppercase tracking-wider border-b border-slate-100 bg-slate-50/50 w-[12%]">고객 정보</th>
                                <th className="py-3 text-left pl-4 font-black text-slate-400 uppercase tracking-wider border-b border-slate-100 bg-slate-50/50 w-[10%]">배송처</th>
                                <th className="py-3 text-left pl-4 font-black text-slate-400 uppercase tracking-wider border-b border-slate-100 bg-slate-50/50 w-[16%]">상품명</th>
                                <th className="py-3 text-center font-black text-slate-400 uppercase tracking-wider border-b border-slate-100 bg-slate-50/50 w-[8%]">규격</th>
                                <th className="py-3 text-center font-black text-slate-400 uppercase tracking-wider border-b border-slate-100 bg-slate-50/50 w-[6%]">수량</th>
                                <th className="py-3 text-right pr-4 font-black text-slate-400 uppercase tracking-wider border-b border-slate-100 bg-slate-50/50 w-[10%]">금액</th>
                                <th className="py-3 text-left pl-4 font-black text-slate-400 uppercase tracking-wider border-b border-slate-100 bg-slate-50/50 w-[9%]">메모</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {sales.length === 0 ? (
                                <tr>
                                    <td colSpan="11" className="py-20 text-center text-slate-400">
                                        {keyword ? '일치하는 내역이 없습니다.' : '조회할 고객의 성함이나 연락처를 입력하고 [조회] 버튼을 눌러주세요.'}
                                    </td>
                                </tr>
                            ) : (
                                sales.map((s, idx) => {
                                    const status = s.status || '접수';
                                    const isCancel = status === '취소';
                                    const type = (s.customer_id && s.customer_id.length >= 10 && s.customer_id.substring(9, 10) === '0') ? '일반' : '특판';

                                    let statusBadge;
                                    const badgeBase = "px-1.5 py-0.5 rounded text-[10px] font-bold border";
                                    if (isCancel) statusBadge = <span className={`${badgeBase} bg-red-50 text-red-700 border-red-200 line-through`}>취소</span>;
                                    else if (status === '배송완료') statusBadge = <span className={`${badgeBase} bg-blue-50 text-blue-700 border-blue-200`}>완료</span>;
                                    else statusBadge = <span className={`${badgeBase} bg-emerald-50 text-emerald-700 border-emerald-200`}>{status}</span>;

                                    const typeBadge = type === '일반'
                                        ? <span className="font-bold text-indigo-500">일반</span>
                                        : <span className="font-bold text-amber-500">특판</span>;

                                    return (
                                        <tr key={idx} className={`hover:bg-slate-50 transition-colors ${isCancel ? 'text-slate-400' : ''}`}>
                                            <td className="px-3 py-1 text-center text-slate-500">{idx + 1}</td>
                                            <td className="px-3 py-1 text-center">{statusBadge}</td>
                                            <td className="px-3 py-1 text-center text-xs">{typeBadge}</td>
                                            <td className="px-3 py-1 text-center text-slate-600 font-mono text-[11px]">{s.order_date}</td>
                                            <td className="px-3 py-1 text-left">
                                                <div className="flex flex-col">
                                                    <div className="font-bold text-slate-700">{s.customer_name || '-'}</div>
                                                    <div className="text-[11px] text-slate-500 font-mono -mt-0.5">{s.customer_mobile || '-'}</div>
                                                </div>
                                            </td>
                                            <td className="px-3 py-1 text-left">
                                                <div className="flex flex-col">
                                                    <div className="font-medium text-slate-600 truncate max-w-[80px]" title={s.shipping_name}>{s.shipping_name || '-'}</div>
                                                    <div className="text-[11px] text-slate-400 font-mono -mt-0.5">{s.shipping_mobile_number || '-'}</div>
                                                </div>
                                            </td>
                                            <td className="px-3 py-1 font-medium text-slate-700 break-keep">
                                                {s.product_name}
                                            </td>
                                            <td className="px-3 py-1 text-center text-slate-600">{s.specification || '-'}</td>
                                            <td className="px-3 py-1 text-center font-bold text-slate-700">{s.quantity.toLocaleString()}</td>
                                            <td className="px-3 py-1 text-right font-bold text-slate-800">{formatCurrency(s.total_amount)}</td>
                                            <td className="px-3 py-1 text-slate-400 text-[11px]">
                                                <div className="truncate max-w-[120px]" title={s.memo}>{s.memo || ''}</div>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                        {sales.length > 0 && (
                            <tfoot className="bg-slate-50 font-bold border-t border-slate-300 print:table-row-group">
                                <tr>
                                    <td colSpan="8" className="px-4 py-3 text-center text-slate-600">합 계 (종합)</td>
                                    <td className="px-3 py-3 text-center text-indigo-600 font-black">{stats.qty.toLocaleString()}</td>
                                    <td className="px-3 py-3 text-right text-indigo-600 font-black">{formatCurrency(stats.amt)}</td>
                                    <td></td>
                                </tr>
                            </tfoot>
                        )}
                    </table>
                </div>

                {/* 4. Footer & Actions */}
                <div className="shrink-0 p-4 border-t border-slate-100 flex justify-between items-center bg-slate-50 print:hidden">
                    <div className="flex gap-6 text-sm font-bold text-slate-700">
                        <div>검색 건수: <span className="text-indigo-600">{sales.length}</span> 건</div>
                        <div>총 수량: <span className="text-indigo-600">{stats.qty}</span></div>
                        <div>합계 금액: <span className="text-indigo-600">{formatCurrency(stats.amt)}</span> 원</div>
                    </div>
                    <div className="flex items-center gap-3">
                        <span className="text-xs text-slate-400 mr-2">* 최근 300건 조회</span>
                        {sales.length > 0 && (
                            <button onClick={() => { setIsGraphModalOpen(true); setGraphYear(null); }} className="h-9 px-4 rounded-xl bg-pink-50 hover:bg-pink-100 text-pink-600 border border-pink-100 font-bold text-xs flex items-center gap-1.5 transition-all">
                                <span className="material-symbols-rounded">bar_chart</span> 그래프 보기
                            </button>
                        )}
                        <button onClick={() => setPrintModalOpen(true)} className="h-9 px-4 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 font-bold text-xs flex items-center gap-1.5 shadow-sm transition-all">
                            <span className="material-symbols-rounded">print</span> 리스트 인쇄
                        </button>
                        <button onClick={handleExportCsv} className="h-9 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs shadow-md shadow-emerald-200 flex items-center gap-1.5 transition-all active:scale-95">
                            <span className="material-symbols-rounded">download</span> 엑셀(CSV) 저장
                        </button>
                    </div>
                </div>
            </div>

            {/* Print Preview Modal - Directly Visible Version */}
            {printModalOpen && (
                <div className="fixed inset-0 z-[300] bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-4">
                    <div className="fixed top-8 right-8 flex flex-col gap-4 z-[310]">
                        <button
                            onClick={() => setPrintModalOpen(false)}
                            className="w-14 h-14 bg-white text-slate-400 rounded-2xl shadow-2xl hover:text-rose-500 hover:scale-110 active:scale-95 transition-all flex items-center justify-center group"
                            title="닫기"
                        >
                            <span className="material-symbols-rounded text-3xl group-hover:rotate-90 transition-transform duration-300">close</span>
                        </button>
                        <div className="h-px bg-white/20 w-full" />
                        <button
                            onClick={handlePrint}
                            className="h-14 px-8 rounded-2xl font-black text-sm bg-indigo-600 text-white shadow-2xl shadow-indigo-500/30 hover:bg-indigo-700 hover:-translate-y-1 active:translate-y-0 transition-all flex items-center gap-3"
                        >
                            <span className="material-symbols-rounded text-xl">print</span> 인쇄하기
                        </button>
                    </div>

                    <div className="w-full max-w-[297mm] h-[210mm] max-h-[90vh] bg-white rounded-[1rem] shadow-2xl overflow-y-auto overflow-x-hidden relative custom-scrollbar">
                        <div id="printable-personal-content" className="p-[10mm]">
                            <div style={{ fontFamily: '"Malgun Gothic", sans-serif', color: '#000', width: '100%' }}>
                                <div style={{ border: '2px solid #000', padding: '30px', backgroundColor: '#fff' }}>
                                    <div style={{ textAlign: 'center', marginBottom: '30px' }}>
                                        <h1 style={{ margin: '0', fontSize: '32px', fontWeight: '900', letterSpacing: '0.3em', borderBottom: '5px double #000', display: 'inline-block', padding: '0 50px 10px 50px' }}>
                                            개인별 판매 고객 이력 보고서
                                        </h1>
                                        <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'space-between', fontSize: '14px', fontWeight: 'bold' }}>
                                            <span>대상 고객: <strong>{keyword}</strong></span>
                                            <span>발급 일시: {new Date().toLocaleString()}</span>
                                        </div>
                                    </div>

                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px', border: '2px solid #000', tableLayout: 'fixed' }}>
                                        <thead>
                                            <tr style={{ backgroundColor: '#f0f0f0' }}>
                                                <th style={{ border: '1px solid #000', padding: '6px 4px', width: '35px', fontWeight: '900' }}>No</th>
                                                <th style={{ border: '1px solid #000', padding: '6px 4px', width: '60px', fontWeight: '900' }}>상태</th>
                                                <th style={{ border: '1px solid #000', padding: '6px 4px', width: '80px', fontWeight: '900' }}>주문일자</th>
                                                <th style={{ border: '1px solid #000', padding: '6px 4px', width: '80px', fontWeight: '900' }}>고객명</th>
                                                <th style={{ border: '1px solid #000', padding: '6px 4px', width: '100px', fontWeight: '900' }}>연락처</th>
                                                <th style={{ border: '1px solid #000', padding: '6px 4px', width: '80px', fontWeight: '900' }}>수령인</th>
                                                <th style={{ border: '1px solid #000', padding: '6px 4px', textAlign: 'left', paddingLeft: '10px', fontWeight: '900' }}>상품명 / 규격</th>
                                                <th style={{ border: '1px solid #000', padding: '6px 4px', width: '40px', fontWeight: '900' }}>수량</th>
                                                <th style={{ border: '1px solid #000', padding: '6px 4px', width: '80px', fontWeight: '900' }}>결제금액</th>
                                                <th style={{ border: '1px solid #000', padding: '6px 4px', textAlign: 'left', paddingLeft: '10px', fontWeight: '900' }}>관리 메모</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {sales.map((s, idx) => (
                                                <tr key={idx} style={{ backgroundColor: idx % 2 === 1 ? '#fafafa' : '#fff' }}>
                                                    <td style={{ border: '1px solid #000', padding: '6px 4px', textAlign: 'center' }}>{idx + 1}</td>
                                                    <td style={{ border: '1px solid #000', padding: '6px 4px', textAlign: 'center', fontWeight: '900' }}>{s.status || '접수'}</td>
                                                    <td style={{ border: '1px solid #000', padding: '6px 4px', textAlign: 'center' }}>{s.order_date.substring(0, 10)}</td>
                                                    <td style={{ border: '1px solid #000', padding: '6px 4px', textAlign: 'center', fontWeight: '900' }}>{s.customer_name || '-'}</td>
                                                    <td style={{ border: '1px solid #000', padding: '6px 4px', textAlign: 'center' }}>{formatPhoneNumber(s.customer_mobile || s.shipping_mobile_number || '')}</td>
                                                    <td style={{ border: '1px solid #000', padding: '6px 4px', textAlign: 'center' }}>{s.shipping_name || '-'}</td>
                                                    <td style={{ border: '1px solid #000', padding: '6px 4px', textAlign: 'left' }}>
                                                        <div style={{ fontWeight: '900' }}>{s.product_name}</div>
                                                        <div style={{ fontSize: '8px', color: '#555' }}>{s.specification || ''}</div>
                                                    </td>
                                                    <td style={{ border: '1px solid #000', padding: '6px 4px', textAlign: 'center', fontWeight: '900' }}>{s.quantity.toLocaleString()}</td>
                                                    <td style={{ border: '1px solid #000', padding: '6px 4px', textAlign: 'right', fontWeight: '900' }}>{formatCurrency(s.total_amount)}</td>
                                                    <td style={{ border: '1px solid #000', padding: '6px 4px', textAlign: 'left', fontSize: '9px', color: '#666' }}>{s.memo || ''}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>

                                    <div style={{ marginTop: '30px', display: 'flex', justifyContent: 'flex-end' }}>
                                        <table style={{ width: '400px', border: '2px solid #000', borderCollapse: 'collapse' }}>
                                            <tbody>
                                                <tr style={{ backgroundColor: '#f0f0f0' }}>
                                                    <th style={{ border: '1px solid #000', padding: '8px 5px', textAlign: 'center', width: '45%', fontSize: '11px' }}>총 구매 횟수 (Total Orders)</th>
                                                    <td style={{ border: '1px solid #000', padding: '8px 15px', textAlign: 'right', fontSize: '14px', fontWeight: '900' }}>{sales.length} 회</td>
                                                </tr>
                                                <tr>
                                                    <th style={{ border: '1px solid #000', padding: '8px 5px', textAlign: 'center', fontSize: '11px' }}>누적 총 결제 금액</th>
                                                    <td style={{ border: '1px solid #000', padding: '8px 15px', textAlign: 'right', fontSize: '14px', fontWeight: '900', color: '#d32f2f' }}>￦ {formatCurrency(sales.reduce((acc, cur) => acc + cur.total_amount, 0))}</td>
                                                </tr>
                                            </tbody>
                                        </table>
                                    </div>

                                    <div style={{ marginTop: '40px', textAlign: 'center', fontSize: '12px', fontWeight: 'bold' }}>
                                        위와 같이 해당 고객의 정밀 판매 이력을 보고합니다.
                                    </div>

                                    <div style={{ marginTop: '50px', textAlign: 'center', fontSize: '10px', color: '#999', borderTop: '1px solid #eee', paddingTop: '10px' }}>
                                        © Mycelium Smart Farm Integration System - All Rights Reserved.
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SalesPersonalHistory;

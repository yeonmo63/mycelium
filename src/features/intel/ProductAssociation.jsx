import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as d3 from 'd3';
import { useModal } from '../../contexts/ModalContext';

/**
 * ProductAssociation.jsx
 * 상품 연관 분석 (Market Basket Analysis)
 * MushroomFarm의 기능을 포팅하고 Premium UI를 적용함.
 */
const ProductAssociation = () => {
    const { showAlert } = useModal();

    // --- State ---
    const [rules, setRules] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [loadingText, setLoadingText] = useState('');

    // AI Modal State
    const [showStrategyModal, setShowStrategyModal] = useState(false);
    const [isAiLoading, setIsAiLoading] = useState(false);
    const [aiResult, setAiResult] = useState(null);
    const [aiLoadingStep, setAiLoadingStep] = useState('');

    // Detail Modal State
    const [showDetailModal, setShowDetailModal] = useState(false);
    const [detailContent, setDetailContent] = useState(null);
    const [detailTitle, setDetailTitle] = useState('');
    const [detailSubtitle, setDetailSubtitle] = useState('');
    const [isDetailLoading, setIsDetailLoading] = useState(false);

    // Refs
    const graphContainerRef = useRef(null);
    const tooltipRef = useRef(null);

    // --- Initialization ---
    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setIsLoading(true);
        setLoadingText("구매 패턴을 분석 중입니다. 최근 거래 데이터를 스캔하고 있습니다...");
        try {
            if (!window.__TAURI__) {
                // Mock Data for non-Tauri environment (Dev)
                setTimeout(() => {
                    const mockRules = [
                        { product_a: '노루궁뎅이버섯', product_b: '참송이버섯', pair_count: 150, support_percent: 45 },
                        { product_a: '노루궁뎅이버섯', product_b: '건조표고슬라이스', pair_count: 80, support_percent: 25 },
                        { product_a: '표고버섯(생)', product_b: '표고버섯가루', pair_count: 60, support_percent: 70 },
                        { product_a: '참송이버섯', product_b: '표고버섯(생)', pair_count: 40, support_percent: 15 },
                        { product_a: '건조표고슬라이스', product_b: '표고버섯가루', pair_count: 90, support_percent: 88 },
                    ];
                    setRules(mockRules);
                    setIsLoading(false);
                }, 1000);
                return;
            }

            const data = await window.__TAURI__.core.invoke('get_product_associations', {});
            setRules(data || []);
        } catch (e) {
            console.error("Association Analysis Error:", e);
            showAlert("오류", "데이터 분석 중 문제가 발생했습니다: " + e);
        } finally {
            setIsLoading(false);
        }
    };

    // --- D3 Graph Rendering ---
    useEffect(() => {
        if (!rules || rules.length === 0 || !graphContainerRef.current) {
            if (graphContainerRef.current) graphContainerRef.current.innerHTML = '';
            return;
        }

        renderNetworkGraph();
    }, [rules]);

    const renderNetworkGraph = () => {
        const container = graphContainerRef.current;
        const width = container.clientWidth;
        const height = container.clientHeight || 500;

        container.innerHTML = ''; // Clear previous graph

        // Data Preparation
        const nodesMap = new Map();
        const links = [];

        rules.forEach(rule => {
            if (!nodesMap.has(rule.product_a)) {
                nodesMap.set(rule.product_a, { id: rule.product_a, group: 1, value: 0 });
            }
            if (!nodesMap.has(rule.product_b)) {
                nodesMap.set(rule.product_b, { id: rule.product_b, group: 2, value: 0 });
            }
            nodesMap.get(rule.product_a).value++;
            nodesMap.get(rule.product_b).value++;

            links.push({
                source: rule.product_a,
                target: rule.product_b,
                value: rule.pair_count,
                weight: rule.support_percent
            });
        });

        const nodes = Array.from(nodesMap.values());

        // SVG Setup
        const svg = d3.select(container)
            .append("svg")
            .attr("width", width)
            .attr("height", height)
            .style("background", "transparent");

        // Simulation
        const simulation = d3.forceSimulation(nodes)
            .force("link", d3.forceLink(links).id(d => d.id).distance(150))
            .force("charge", d3.forceManyBody().strength(-400))
            .force("center", d3.forceCenter(width / 2, height / 2))
            .force("collide", d3.forceCollide().radius(d => (d.value * 3) + 30));

        // Draw Links
        const link = svg.append("g")
            .attr("stroke", "#94a3b8")
            .attr("stroke-opacity", 0.6)
            .selectAll("line")
            .data(links)
            .join("line")
            .attr("stroke-width", d => Math.max(1, Math.sqrt(d.value)));

        // Drag functions
        const drag = (simulation) => {
            const dragstarted = (event) => {
                if (!event.active) simulation.alphaTarget(0.3).restart();
                event.subject.fx = event.subject.x;
                event.subject.fy = event.subject.y;
            };
            const dragged = (event) => {
                event.subject.fx = event.x;
                event.subject.fy = event.y;
            };
            const dragended = (event) => {
                if (!event.active) simulation.alphaTarget(0);
                event.subject.fx = null;
                event.subject.fy = null;
            };
            return d3.drag()
                .on("start", dragstarted)
                .on("drag", dragged)
                .on("end", dragended);
        };

        // Draw Nodes
        const node = svg.append("g")
            .selectAll("g")
            .data(nodes)
            .join("g")
            .call(drag(simulation));

        // Node Circles
        node.append("circle")
            .attr("r", d => (d.value * 2) + 8)
            .attr("fill", d => d.value > 5 ? "#fbbf24" : "#6366f1") // Gold (Hub) vs Indigo (Normal)
            .attr("stroke", "#fff")
            .attr("stroke-width", 2)
            .style("cursor", "pointer")
            .style("filter", "drop-shadow(0 4px 3px rgb(0 0 0 / 0.07))")
            .on("mouseover", (event, d) => {
                d3.select(event.currentTarget).attr("stroke", "#1e293b").attr("stroke-width", 3);
                showTooltip(event, d, links);
            })
            .on("mouseout", (event) => {
                d3.select(event.currentTarget).attr("stroke", "#fff").attr("stroke-width", 2);
                hideTooltip();
            })
            .on("click", (event, d) => {
                // Find strongest connection
                const strongest = links
                    .filter(l => l.source.id === d.id || l.target.id === d.id)
                    .sort((a, b) => b.weight - a.weight)[0];

                if (strongest) {
                    const partner = strongest.source.id === d.id ? strongest.target.id : strongest.source.id;
                    handleCreatePromo(d.id, partner);
                }
            });

        // Node Labels
        node.append("text")
            .text(d => d.id)
            .attr("x", 14)
            .attr("y", 5)
            .style("font-size", "12px")
            .style("font-weight", "600")
            .style("fill", "#334155")
            .style("pointer-events", "none")
            .style("text-shadow", "2px 2px 0 #fff, -2px -2px 0 #fff, 2px -2px 0 #fff, -2px 2px 0 #fff");

        // Simulation Tick
        simulation.on("tick", () => {
            link
                .attr("x1", d => d.source.x)
                .attr("y1", d => d.source.y)
                .attr("x2", d => d.target.x)
                .attr("y2", d => d.target.y);
            node
                .attr("transform", d => `translate(${d.x},${d.y})`);
        });
    };

    // --- Tooltip ---
    const showTooltip = (event, d, links) => {
        if (!tooltipRef.current) return;
        const connected = links.filter(l => l.source.id === d.id || l.target.id === d.id).length;
        tooltipRef.current.style.display = 'block';
        tooltipRef.current.style.left = (event.nativeEvent.offsetX + 20) + 'px';
        tooltipRef.current.style.top = (event.nativeEvent.offsetY - 20) + 'px';
        tooltipRef.current.innerHTML = `<strong>${d.id}</strong><br>연관 상품: ${connected}개`;
    };

    const hideTooltip = () => {
        if (tooltipRef.current) tooltipRef.current.style.display = 'none';
    };

    // --- AI Logic ---
    const handleCreatePromo = async (p1, p2) => {
        setShowStrategyModal(true);
        setIsAiLoading(true);
        setAiResult(null);
        setAiLoadingStep('거래 데이터베이스 분석 및 연관 관계(Lift & Confidence) 계산 중...');

        try {
            let proposal;
            if (!window.__TAURI__) {
                // Mock
                await new Promise(r => setTimeout(r, 2000));
                proposal = {
                    product_a: p1,
                    product_b: p2,
                    confidence_score: 75.5,
                    lift_score: 3.2,
                    strategies: [
                        { title: '번들 패키지 판매', description: `[${p1}] 구매시 [${p2}] 10% 할인 혜택 제공`, impact: 'Revenue Up' },
                        { title: '건강 레시피 제안', description: '두 버섯을 활용한 "면역력 강화 전골" 레시피 카드 동봉', impact: 'New Trend' }
                    ],
                    ad_copies: [
                        '자연이 준 선물, 두 가지 버섯의 환상적인 조화!',
                        `[${p1}] 좋아하시죠? [${p2}]와(과) 함께라면 맛도 건강도 두 배!`,
                        '이번 주말, 가족을 위한 건강 식탁을 준비해보세요.'
                    ]
                };
            } else {
                setAiLoadingStep('최적의 마케팅 전략 수립 중...');
                proposal = await window.__TAURI__.core.invoke('get_ai_marketing_proposal', { p1, p2 });
            }
            setAiResult(proposal);
        } catch (e) {
            console.error("AI Promo Error:", e);
            if (e.toString().includes('429') || e.toString().includes('Quota')) {
                showAlert("오류", "AI 서버 사용량이 많아 분석을 진행할 수 없습니다. 잠시 후 다시 시도해주세요.");
            } else {
                showAlert("오류", "AI 분석 실패: " + e);
            }
            setShowStrategyModal(false);
        } finally {
            setIsAiLoading(false);
        }
    };

    const handleShowDetailedPlan = async (planType, p1, p2, strategyTitle) => {
        setShowDetailModal(true);
        setIsDetailLoading(true);
        setDetailContent(null);
        setDetailTitle(planType === 'VIRAL' ? '바이럴 마케팅 계획' : '상세 실행 계획(Action Plan)');
        setDetailSubtitle(`${p1} + ${p2} | 전략: ${strategyTitle}`);

        try {
            let detail;
            if (!window.__TAURI__) {
                await new Promise(r => setTimeout(r, 1500));
                detail = "### 1. 목표 설정\n\n이번 캠페인의 목표는...\n\n### 2. 실행 방안\n\n- **소셜 미디어**: 인스타그램 릴스를 활용하여...\n- **매장 디스플레이**: 입구 쪽에 배치하여...\n\n| 구분 | 내용 | 일정 |\n|---|---|---|\n| 기획 | 패키지 디자인 | 1주차 |\n| 실행 | 프로모션 시작 | 2주차 |";
            } else {
                detail = await window.__TAURI__.core.invoke('get_ai_detailed_plan', {
                    planType, p1, p2, strategyTitle
                });
            }
            setDetailContent(parseMarkdown(detail));
        } catch (e) {
            console.error("Detailed Plan Error:", e);
            if (e.toString().includes('429')) {
                setDetailContent(<div className="text-orange-600 font-bold p-4">AI 서버 사용량이 많아 상세 계획을 생성할 수 없습니다.</div>);
            } else {
                setDetailContent(<div className="text-red-600 p-4">분석 실패: {e}</div>);
            }
        } finally {
            setIsDetailLoading(false);
        }
    };

    // Helper for Markdown Parsing (simplified for React)
    const parseMarkdown = (text) => {
        // This is a naive implementation. For production, use a library like react-markdown.
        // We will manually map line by line as in the original JS code.
        const lines = text.split('\n');
        return lines.map((line, idx) => {
            if (line.startsWith('### ')) return <h4 key={idx} className="mt-6 mb-3 text-lg font-bold text-indigo-700 bg-slate-50 p-3 rounded-lg border-l-4 border-indigo-500 text-center">{line.replace('### ', '')}</h4>;
            if (line.startsWith('## ')) return <h3 key={idx} className="mt-8 mb-4 text-xl font-bold text-slate-800 border-b-2 border-slate-200 pb-2 text-center">{line.replace('## ', '')}</h3>;
            if (line.startsWith('- ')) return <div key={idx} className="ml-4 mb-2 flex gap-2 text-slate-600"><span className="text-slate-300">•</span>{line.replace('- ', '').replace(/\*\*(.*?)\*\*/g, '$1')}</div>;
            if (line.match(/^\d+\./)) {
                const parts = line.split(' ');
                const num = parts.shift();
                return <div key={idx} className="mt-4 mb-2 font-bold text-slate-800 flex gap-2"><span className="text-indigo-600">{num}</span>{parts.join(' ')}</div>
            }
            if (line.startsWith('|')) {
                // Skipping table implementation for brevity, or implement simple table
                return <div key={idx} className="overflow-x-auto my-4 text-xs text-slate-500">[표 데이터 생략 - 상세 보기 지원 예정]</div>;
            }
            return <p key={idx} className="mb-2 leading-relaxed text-slate-700">{line.replace(/\*\*(.*?)\*\*/g, '$1')}</p>
        });
    };

    const copyToClipboard = (text) => {
        navigator.clipboard.writeText(text);
        showAlert('알림', '복사되었습니다.');
    };

    return (
        <div className="flex flex-col h-full bg-[#f8fafc] overflow-hidden animate-in fade-in duration-700">
            {/* Header Area */}
            <div className="px-6 lg:px-8 pt-6 lg:pt-8 pb-4">
                <div className="flex items-center gap-2 mb-1">
                    <span className="w-6 h-1 bg-amber-500 rounded-full"></span>
                    <span className="text-[9px] font-black tracking-[0.2em] text-amber-500 uppercase">Market Intelligence</span>
                </div>
                <h1 className="text-3xl font-black text-slate-600 tracking-tighter" style={{ fontFamily: '"Noto Sans KR", sans-serif' }}>
                    상품 연관 분석 <span className="text-slate-300 font-light ml-1 text-xl">Basket Analysis</span>
                </h1>
                <p className="text-slate-400 text-sm mt-1 flex items-center gap-1">
                    <span className="material-symbols-rounded text-sm">hub</span>
                    동시 구매 패턴을 분석하여 최적의 상품 조합과 마케팅 전략을 도출합니다.
                </p>
            </div>

            {/* Main Content */}
            <div className="flex flex-col lg:flex-row flex-1 gap-6 px-6 lg:px-8 pb-8 min-h-0 overflow-hidden">

                {/* Left: Graph Area */}
                <div className="flex-[2] bg-white rounded-[1.5rem] border border-slate-200 shadow-sm relative flex flex-col overflow-hidden">
                    <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-white/50 backdrop-blur-sm z-10">
                        <h3 className="font-bold text-slate-700 flex items-center gap-2">
                            <span className="material-symbols-rounded text-indigo-500">bubble_chart</span>
                            연관성 네트워크 맵
                        </h3>
                        <div className="text-xs font-medium text-slate-400 flex items-center gap-4">
                            <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-400"></span>중심 상품</div>
                            <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-indigo-500"></span>일반 상품</div>
                        </div>
                    </div>

                    <div className="flex-1 relative bg-slate-50/30">
                        {/* D3 Graph Container */}
                        <div className="absolute inset-0 z-0" ref={graphContainerRef}></div>

                        {/* Overlays (React Managed) */}
                        {isLoading && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/80 z-20 backdrop-blur-sm">
                                <span className="material-symbols-rounded animate-spin text-4xl text-indigo-500 mb-4">sync</span>
                                <p className="text-slate-500 font-medium">{loadingText}</p>
                            </div>
                        )}
                        {!isLoading && rules.length === 0 && (
                            <div className="absolute inset-0 flex items-center justify-center text-slate-400 z-10 pointer-events-none">데이터가 충분하지 않습니다.</div>
                        )}

                        {/* Tooltip */}
                        <div ref={tooltipRef} className="absolute hidden bg-slate-900/90 text-white text-xs px-3 py-2 rounded-lg pointer-events-none z-30 shadow-xl backdrop-blur-md border border-slate-700/50"></div>
                    </div>
                </div>

                {/* Right: Insight & Guide */}
                <div className="flex-1 flex flex-col gap-6 min-w-[350px] overflow-y-auto custom-scrollbar">

                    {/* Insight Card */}
                    <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-[1.5rem] p-6 text-white shadow-xl relative overflow-hidden group">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/20 rounded-full blur-3xl -translate-y-10 translate-x-10 group-hover:bg-indigo-500/30 transition-all duration-700"></div>

                        <div className="flex items-center gap-2 mb-6 relative z-10">
                            <span className="material-symbols-rounded text-amber-400 text-2xl animate-pulse">lightbulb</span>
                            <h3 className="text-lg font-bold">In-Depth Insights</h3>
                        </div>

                        <div className="space-y-4 relative z-10">
                            {rules.length > 0 ? (
                                <>
                                    <div className="flex items-center gap-2 text-xs font-bold text-amber-400 mb-2">
                                        <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping"></span>
                                        LIVE AI ANALYSIS
                                    </div>
                                    <p className="text-slate-200 leading-relaxed text-sm">
                                        현재 데이터 흐름상 <strong className="text-white bg-indigo-600/50 px-1 rounded mx-1">{rules[0].product_a}</strong>와
                                        <strong className="text-white bg-indigo-600/50 px-1 rounded mx-1">{rules[0].product_b}</strong>의
                                        동시 구매 가속도가 붙고 있습니다.
                                    </p>
                                    <div className="bg-white/10 border-l-4 border-amber-400 p-4 rounded-r-xl backdrop-blur-md">
                                        <p className="text-sm font-medium text-amber-50 leading-relaxed">
                                            "이 두 제품을 결합한 <strong className="text-white">주말 한정 패키지</strong>를 기획하면 매출이 크게 상승할 것으로 예측됩니다."
                                        </p>
                                    </div>
                                </>
                            ) : (
                                <p className="text-slate-400 text-sm">패턴 분석을 위한 데이터가 수집되고 있습니다.</p>
                            )}
                        </div>

                        <div className="mt-8 pt-6 border-t border-white/10">
                            <h4 className="text-xs font-bold text-slate-400 mb-3 uppercase tracking-wider">Strategic Recommendations</h4>
                            <ul className="space-y-3 text-sm text-slate-300">
                                <li className="flex items-start gap-2">
                                    <span className="material-symbols-rounded text-indigo-400 text-lg">check_circle</span>
                                    <span>연관 상품을 <strong className="text-white">묶음 상품</strong>으로 구성하세요.</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <span className="material-symbols-rounded text-indigo-400 text-lg">check_circle</span>
                                    <span>상세 페이지 하단에 <strong className="text-white">함께 구매하면 좋은 상품</strong>으로 노출하세요.</span>
                                </li>
                            </ul>
                        </div>
                    </div>

                    {/* Stats Info */}
                    <div className="bg-white rounded-[1.5rem] p-6 border border-slate-200 shadow-sm">
                        <h4 className="text-sm font-bold text-slate-500 mb-4">ANALYSIS SUMMARY</h4>
                        <div className="space-y-4">
                            <div className="flex justify-between items-center p-3 rounded-xl bg-slate-50">
                                <span className="text-sm text-slate-500 font-medium">분석 트랜잭션</span>
                                <span className="text-sm font-black text-slate-800">{isLoading ? 'Loading...' : 'Complete'}</span>
                            </div>
                            <div className="flex justify-between items-center p-3 rounded-xl bg-slate-50">
                                <span className="text-sm text-slate-500 font-medium">최소 동시 구매</span>
                                <span className="text-sm font-black text-slate-800">2건 이상</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* --- Modals --- */}

            {/* Strategy Modal */}
            {showStrategyModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
                        <div className="bg-gradient-to-r from-indigo-600 to-violet-600 p-8 text-white relative flex-shrink-0">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center backdrop-blur-md">
                                    <span className="material-symbols-rounded text-3xl">psychology</span>
                                </div>
                                <div>
                                    <h2 className="text-2xl font-black tracking-tight">Jenny's AI Marketing Lab</h2>
                                    <p className="text-indigo-100 text-sm mt-1">데이터 패턴에 기반한 실시간 맞춤 기획안을 생성합니다.</p>
                                </div>
                            </div>
                            <button onClick={() => setShowStrategyModal(false)} className="absolute top-6 right-6 p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors">
                                <span className="material-symbols-rounded text-white">close</span>
                            </button>
                        </div>

                        <div className="p-8 overflow-y-auto custom-scrollbar flex-1 relative">
                            {isAiLoading ? (
                                <div className="flex flex-col items-center justify-center py-20 text-center">
                                    <span className="material-symbols-rounded text-6xl text-indigo-500 animate-pulse mb-6">auto_awesome</span>
                                    <h3 className="text-xl font-bold text-slate-800 mb-2">AI가 데이터를 정밀 분석 중입니다...</h3>
                                    <p className="text-slate-500">{aiLoadingStep}</p>
                                </div>
                            ) : aiResult ? (
                                <div className="space-y-8">
                                    {/* Insights Grid */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="bg-indigo-50 rounded-2xl p-5 border-l-4 border-indigo-500">
                                            <h4 className="text-xs font-bold text-indigo-400 uppercase tracking-widest mb-2">Confidence Score</h4>
                                            <p className="text-slate-800 font-medium leading-relaxed">
                                                <strong className="text-indigo-700">{aiResult.product_a}</strong> 고객의 <strong className="text-indigo-700">{aiResult.confidence_score}%</strong>가 <strong className="text-indigo-700">{aiResult.product_b}</strong>를 함께 구매합니다.
                                            </p>
                                        </div>
                                        <div className="bg-pink-50 rounded-2xl p-5 border-l-4 border-pink-500">
                                            <h4 className="text-xs font-bold text-pink-400 uppercase tracking-widest mb-2">Lift Score</h4>
                                            <p className="text-slate-800 font-medium leading-relaxed">
                                                연관 강도(Lift)가 <strong className="text-pink-600">{aiResult.lift_score}</strong>로 일반 조합 대비 매우 유의미한 수치를 보입니다.
                                            </p>
                                        </div>
                                    </div>

                                    {/* Strategies */}
                                    <div>
                                        <h3 className="flex items-center gap-2 text-lg font-bold text-slate-800 mb-4">
                                            <span className="material-symbols-rounded text-indigo-500">campaign</span>
                                            전략적 캠페인 제안
                                        </h3>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            {aiResult.strategies.map((strategy, idx) => (
                                                <div key={idx} className="bg-white border border-slate-200 rounded-2xl p-6 hover:shadow-lg hover:border-indigo-400 transition-all group">
                                                    <div className="flex justify-between items-start mb-3">
                                                        <span className={`px-2 py-1 rounded-lg text-[10px] font-black uppercase ${idx === 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                                                            {strategy.impact}
                                                        </span>
                                                    </div>
                                                    <h4 className="font-bold text-slate-800 mb-2 group-hover:text-indigo-600 transition-colors">{strategy.title}</h4>
                                                    <p className="text-sm text-slate-500 leading-relaxed mb-4">{strategy.description}</p>
                                                    <div className="pt-4 border-t border-slate-100 flex gap-2">
                                                        <button
                                                            onClick={() => handleShowDetailedPlan(idx === 0 ? 'ACTION' : 'VIRAL', aiResult.product_a, aiResult.product_b, strategy.title)}
                                                            className="flex-1 py-2 rounded-xl bg-slate-800 text-white text-xs font-bold hover:bg-indigo-600 transition-colors">
                                                            실행 계획 보기
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Copywriting */}
                                    <div className="bg-orange-50 rounded-2xl p-6 border border-orange-100">
                                        <h4 className="flex items-center gap-2 text-sm font-bold text-orange-700 mb-4">
                                            <span className="material-symbols-rounded">magic_button</span> AI 카피라이팅 추천
                                        </h4>
                                        <ul className="space-y-3">
                                            {aiResult.ad_copies.map((copy, i) => (
                                                <li key={i} className="flex gap-3 text-sm text-orange-900 font-medium">
                                                    <span className="text-orange-400">•</span>
                                                    {copy}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                </div>
                            ) : null}
                        </div>
                    </div>
                </div>
            )}

            {/* Detail Plan Modal */}
            {showDetailModal && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-white/95 backdrop-blur-md animate-in zoom-in-95 duration-200">
                    <div className="w-full max-w-5xl h-full max-h-screen flex flex-col p-8 overflow-hidden">
                        <div className="flex justify-between items-start mb-8 pb-6 border-b border-slate-200 shrink-0">
                            <div>
                                <h1 className="text-3xl font-black text-slate-800">{detailTitle}</h1>
                                <p className="text-slate-500 mt-2 font-medium">{detailSubtitle}</p>
                            </div>
                            <button onClick={() => setShowDetailModal(false)} className="w-10 h-10 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-colors">
                                <span className="material-symbols-rounded text-slate-600">close</span>
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto custom-scrollbar px-4">
                            {isDetailLoading ? (
                                <div className="h-full flex flex-col items-center justify-center text-slate-400">
                                    <span className="material-symbols-rounded animate-spin text-4xl mb-4 text-indigo-300">sync</span>
                                    <p>상세 계획을 수립하고 있습니다...</p>
                                </div>
                            ) : (
                                <div className="max-w-4xl mx-auto bg-white p-10 shadow-sm border border-slate-100 rounded-2xl">
                                    {detailContent}
                                </div>
                            )}
                        </div>

                        <div className="shrink-0 pt-6 mt-4 border-t border-slate-100 flex justify-center gap-4">
                            <button className="h-12 px-8 rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-all flex items-center gap-2">
                                <span className="material-symbols-rounded">print</span> 출력 / PDF 저장
                            </button>
                            <button onClick={() => setShowDetailModal(false)} className="h-12 px-8 rounded-xl bg-slate-200 text-slate-700 font-bold hover:bg-slate-300 transition-all">
                                닫기
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ProductAssociation;

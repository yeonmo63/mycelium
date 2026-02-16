import React, { useState, useEffect, useRef } from 'react';
import { useModal } from '../../contexts/ModalContext';
import { invokeAI } from '../../utils/aiErrorHandler';
import { invoke } from '../../utils/apiBridge';
import { handlePrintRaw } from '../../utils/printUtils';

/**
 * OnlineReputation.jsx
 * 온라인 AI 평판 분석 (ORM)
 * Ported from MushroomFarm 'orm.js' to React/Tailwind.
 */
const OnlineReputation = () => {
    const { showAlert, showConfirm } = useModal();

    // --- State ---
    const [companyInfo, setCompanyInfo] = useState({ name: '업체 정보 로딩 중...', products: '' });
    const [isLoading, setIsLoading] = useState(false);
    const [loadingStep, setLoadingStep] = useState('');
    const [analysisResult, setAnalysisResult] = useState(null);
    const [mentions, setMentions] = useState([]);
    const [hasRun, setHasRun] = useState(false);

    // --- Mock Data Constants (Fallback) ---
    const MOCK_KEYWORDS = [
        { text: "배송빠름", weight: 9, type: 'pos' },
        { text: "신선해요", weight: 8, type: 'pos' },
        { text: "포장꼼꼼", weight: 7, type: 'pos' },
        { text: "재구매", weight: 7, type: 'pos' },
        { text: "선물용", weight: 6, type: 'pos' },
        { text: "가격착함", weight: 5, type: 'pos' },
        { text: "맛있음", weight: 8, type: 'pos' },
        { text: "택배지연", weight: 4, type: 'neg' },
        { text: "문의응답느림", weight: 2, type: 'neg' },
        { text: "가성비", weight: 6, type: 'pos' }
    ];

    const MOCK_MENTIONS = [
        { date: '2024-01-28', channel: 'Instagram', text: '부모님 선물로 보내드렸는데 너무 좋아하시네요! #스마트농장 #표고버섯', sentiment: 'pos', score: 95, link: '#' },
        { date: '2024-01-28', channel: 'Naver Blog', text: '요즘 핫하다는 버섯 농장. 배송은 하루만에 왔고 상태 굿.', sentiment: 'pos', score: 88, link: '#' },
        { date: '2024-01-27', channel: 'Twitter', text: '저번에 시킨거랑 다르게 이번엔 약간 크기가 작은듯? 그래도 맛은 있음.', sentiment: 'neu', score: 50, link: '#' },
        { date: '2024-01-26', channel: 'Naver Cafe', text: '택배 박스가 좀 찌그러져서 왔어요 ㅠㅠ 내용물은 괜찮은데 선물용이라 속상..', sentiment: 'neg', score: 30, link: '#' },
        { date: '2024-01-25', channel: 'Instagram', text: '버섯 탕수육 해먹었는데 진짜 고기맛 남 ㅋㅋ 대박', sentiment: 'pos', score: 92, link: '#' }
    ];

    // --- Initialization ---
    useEffect(() => {
        loadCompanyInfo();
    }, []);

    const loadCompanyInfo = async () => {
        try {
            const info = await invoke('get_company_info', {});
            setCompanyInfo({
                name: info?.company_name || '설정된 업체명 없음',
                products: '(주력 분석: 업체 관련 키워드)'
            });
        } catch (e) {
            console.error(e);
            setCompanyInfo({ name: '업체 정보 로드 실패', products: '' });
        }
    };

    // --- Logic ---
    const runAnalysis = async () => {
        setIsLoading(true);
        setHasRun(false);
        setAnalysisResult(null);
        setMentions([]);

        try {
            // 1. Naver Search
            setLoadingStep("네이버 실시간 소셜 데이터를 수집 중입니다...");
            const query = companyInfo.name === '업체 정보 로딩 중...' || !companyInfo.name ? "버섯농장" : companyInfo.name;
            const searchResults = await invoke('fetch_naver_search', { query });

            // 2. Preprocess
            setLoadingStep("수집된 데이터를 전처리하고 있습니다...");
            const mentionsForAi = searchResults.map(item => ({
                source: "Naver Blog",
                text: item.title.replace(/<[^>]*>?/gm, '') + " " + item.description.replace(/<[^>]*>?/gm, ''),
                date: item.postdate || new Date().toISOString().slice(0, 10),
                link: item.link
            }));

            // 3. AI Analysis
            setLoadingStep("Gemini AI가 소셜 평판과 키워드를 분석 중입니다...");
            const analysis = await invokeAI(showAlert, 'analyze_online_sentiment', { mentions: mentionsForAi });

            // Process Result
            const processedMentions = (analysis.analyzed_mentions || []).map((am, idx) => {
                const original = mentionsForAi[idx];
                return {
                    date: original ? original.date : new Date().toISOString().slice(0, 10),
                    channel: 'Naver Blog',
                    text: am.original_text,
                    sentiment: am.sentiment_label,
                    score: am.sentiment_score,
                    link: original ? original.link : '#'
                };
            });

            setAnalysisResult({
                totalScore: analysis.total_score,
                verdict: analysis.verdict,
                summary: analysis.summary,
                keywords: analysis.keywords || []
            });
            setMentions(processedMentions);
            setHasRun(true);

        } catch (e) {
            console.error("Analysis Error:", e);
            const errorMsg = typeof e === 'string' ? e : e.message || String(e);
            if (errorMsg !== 'AI_QUOTA_EXCEEDED') {
                showAlert('분석 실패', `평판 분석 중 오류가 발생했습니다: ${errorMsg}`);
            }
        } finally {
            setIsLoading(false);
        }
    };

    const handlePrint = () => {
        if (!analysisResult) {
            showAlert('알림', '인쇄할 데이터가 없습니다. 먼저 분석을 실행해 주세요.');
            return;
        }

        const title = `온라인 평판 분석 보고서 - ${companyInfo.name}`;
        const html = `
            <style>
                @page { size: A4; margin: 20mm; }
                .report-print-wrapper { font-family: 'Pretendard', sans-serif; padding: 20px; color: #334155; line-height: 1.6; }
                .report-print-wrapper .header { text-align: center; margin-bottom: 40px; border-bottom: 3px solid #7c3aed; padding-bottom: 20px; }
                .report-print-wrapper .header h1 { margin: 0; font-size: 28px; font-weight: 900; color: #1e1b4b; }
                .report-print-wrapper .header p { margin: 10px 0 0; font-weight: bold; font-size: 14px; color: #64748b; }
                .report-print-wrapper .score-section { display: flex; justify-content: space-around; align-items: center; margin-bottom: 40px; background: #f5f3ff; padding: 30px; rounded: 20px; border: 1px solid #ddd6fe; }
                .report-print-wrapper .score-box { text-align: center; }
                .report-print-wrapper .score-label { font-size: 12px; font-weight: 800; color: #7c3aed; text-transform: uppercase; letter-spacing: 0.1em; }
                .report-print-wrapper .score-value { font-size: 48px; font-weight: 900; color: #1e1b4b; }
                .report-print-wrapper .verdict { font-size: 18px; font-weight: 800; color: #7c3aed; }
                .report-print-wrapper .section-title { font-size: 18px; font-weight: 900; color: #1e1b4b; margin-bottom: 15px; border-left: 5px solid #7c3aed; padding-left: 12px; }
                .report-print-wrapper .content-box { background: #fff; border: 1px solid #e2e8f0; padding: 20px; border-radius: 12px; margin-bottom: 30px; }
                .report-print-wrapper .summary { font-size: 14px; white-space: pre-wrap; }
                .report-print-wrapper .keyword-tag { display: inline-block; padding: 4px 12px; background: #ede9fe; color: #6d28d9; border-radius: 20px; font-size: 12px; font-weight: bold; margin: 4px; }
                .report-print-wrapper table { width: 100%; border-collapse: collapse; font-size: 11px; margin-top: 20px; }
                .report-print-wrapper th, .report-print-wrapper td { border-bottom: 1px solid #e2e8f0; padding: 12px 8px; text-align: left; }
                .report-print-wrapper th { color: #64748b; font-weight: 800; text-transform: uppercase; font-size: 10px; }
                .report-print-wrapper .sentiment-pos { color: #059669; font-weight: bold; }
                .report-print-wrapper .sentiment-neg { color: #dc2626; font-weight: bold; }
                .footer { text-align: center; margin-top: 50px; font-size: 10px; color: #94a3b8; border-top: 1px solid #f1f5f9; padding-top: 20px; }
            </style>
            <div class="report-print-wrapper">
                    <div class="header">
                        <h1>온라인 AI 평판 분석 보고서</h1>
                        <p>분석 대상: ${companyInfo.name} | 출력일시: ${new Date().toLocaleString()}</p>
                    </div>
                    
                    <div class="score-section">
                        <div class="score-box">
                            <div class="score-label">Sentiment Score</div>
                            <div class="score-value">${analysisResult.totalScore}점</div>
                            <div class="verdict">${analysisResult.verdict}</div>
                        </div>
                    </div>

                    <div class="section-title">주요 언급 키워드</div>
                    <div class="content-box">
                        ${analysisResult.keywords.map(kw => `<span class="keyword-tag">#${kw.text}</span>`).join('')}
                    </div>

                    <div class="section-title">AI 종합 분석 요약</div>
                    <div class="content-box summary">
                        <strong>[제니의 진단]</strong><br/>
                        ${analysisResult.summary}
                    </div>

                    <div class="section-title">최근 소셜 미디어 언급 (Top 10)</div>
                    <table>
                        <thead>
                            <tr>
                                <th>날짜</th>
                                <th>채널</th>
                                <th>내용 요약</th>
                                <th>감성</th>
                                <th>영향력</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${mentions.slice(0, 10).map(m => `
                                <tr>
                                    <td>${m.date}</td>
                                    <td style="font-weight:bold;">${m.channel}</td>
                                    <td>${m.text}</td>
                                    <td class="${m.sentiment === 'pos' ? 'sentiment-pos' : m.sentiment === 'neg' ? 'sentiment-neg' : ''}">
                                        ${m.sentiment === 'pos' ? '긍정' : m.sentiment === 'neg' ? '부정' : '중립'}
                                    </td>
                                    <td>${m.score}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>

                    <div class="footer">본 보고서는 Mycelium Social Intelligence 엔진에 의해 자동 생성되었습니다.</div>
                </div>
        `;

        handlePrintRaw(html);
    };

    const handlePdfExport = async () => {
        showAlert('알림', 'PDF 저장 기능은 현재 인쇄 기능(Ctrl+P)을 통해 "PDF로 저장"을 선택하여 이용하실 수 있습니다.');
    };

    // --- Helpers ---
    const getSentimentColor = (type) => {
        if (type === 'pos') return { bg: 'bg-emerald-100', text: 'text-emerald-700' };
        if (type === 'neg') return { bg: 'bg-red-100', text: 'text-red-700' };
        return { bg: 'bg-slate-100', text: 'text-slate-600' };
    };

    const getScoreColor = (score) => {
        if (score >= 80) return 'text-emerald-600';
        if (score >= 50) return 'text-amber-500';
        return 'text-red-600';
    };

    return (
        <div className="flex flex-col h-full bg-[#f8fafc] overflow-hidden animate-in fade-in duration-700">
            {/* Header */}
            <div className="px-6 lg:px-8 pt-6 lg:pt-8 pb-4 shrink-0">
                <div className="flex items-center gap-2 mb-1">
                    <span className="w-6 h-1 bg-violet-500 rounded-full"></span>
                    <span className="text-[9px] font-black tracking-[0.2em] text-violet-500 uppercase">AI Reputation Management</span>
                </div>
                <h1 className="text-3xl font-black text-slate-700 tracking-tighter" style={{ fontFamily: '"Noto Sans KR", sans-serif' }}>
                    온라인 AI 평판 분석 <span className="text-slate-300 font-light ml-1 text-xl">ORM Analysis</span>
                </h1>
                <p className="text-slate-400 text-sm mt-1 flex items-center gap-1">
                    <span className="material-symbols-rounded text-sm">public</span>
                    온라인상의 고객 반응을 실시간으로 수집하고 AI 감성 분석을 통해 평판을 관리합니다.
                </p>
            </div>

            {/* Content Container */}
            <div className="flex-1 overflow-y-auto p-6 lg:p-8 min-h-0 custom-scrollbar flex flex-col gap-6">

                {/* Target & Action Card */}
                <div className="bg-white rounded-2xl p-6 border-l-4 border-violet-500 shadow-sm flex flex-col md:flex-row justify-between items-center gap-4">
                    <div>
                        <h4 className="text-xs font-bold text-slate-400 uppercase mb-1">분석 대상 (Target)</h4>
                        <div className="flex items-baseline gap-2">
                            <h2 className="text-2xl font-black text-slate-800">{companyInfo.name}</h2>
                            <span className="text-sm text-slate-500">{companyInfo.products}</span>
                        </div>
                    </div>
                    <button
                        onClick={runAnalysis}
                        disabled={isLoading}
                        className="px-6 py-3 bg-violet-600 text-white rounded-xl font-bold hover:bg-violet-700 transition-all shadow-lg shadow-violet-200 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                        {isLoading ? (
                            <span className="material-symbols-rounded animate-spin">sync</span>
                        ) : (
                            <span className="material-symbols-rounded">youtube_searched_for</span>
                        )}
                        {isLoading ? '분석 진행 중...' : '실시간 평판 분석 실행'}
                    </button>
                </div>

                {/* Loading UI */}
                {isLoading && (
                    <div className="flex-1 flex flex-col items-center justify-center min-h-[400px]">
                        <div className="relative mb-6">
                            <div className="absolute inset-0 bg-violet-500 opacity-20 blur-xl rounded-full animate-pulse"></div>
                            <span className="material-symbols-rounded text-7xl text-violet-600 relative z-10 animate-bounce">satellite_alt</span>
                        </div>
                        <h3 className="text-xl font-bold text-slate-700 mb-2">AI가 온라인 평판 데이터를 수집하고 있습니다...</h3>
                        <p className="text-slate-500 font-medium animate-pulse">{loadingStep}</p>
                    </div>
                )}

                {/* Results UI */}
                {!isLoading && hasRun && analysisResult && (
                    <div className="flex flex-col gap-6 animate-in slide-in-from-bottom-5 duration-700">
                        {/* Top Row: Gauge & WordCloud */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {/* Sentiment Gauge */}
                            <div className="bg-white rounded-2xl p-8 border border-slate-200 shadow-sm flex flex-col items-center justify-center relative overflow-hidden">
                                <h3 className="text-slate-500 font-bold mb-6 text-sm">전체 평판 점수 (Sentiment Score)</h3>

                                <div className="relative w-48 h-24 overflow-hidden mb-4">
                                    <div className="w-full h-full bg-slate-100 rounded-t-full"></div>
                                    <div
                                        className="absolute bottom-0 left-0 w-full h-full rounded-t-full origin-bottom transition-transform duration-1000 ease-out"
                                        style={{
                                            background: 'linear-gradient(90deg, #ef4444 0%, #f59e0b 50%, #10b981 100%)',
                                            transform: `rotate(${(analysisResult.totalScore / 100 * 180) - 180}deg)`
                                        }}
                                    ></div>
                                </div>
                                <div className={`text-4xl font-black ${getScoreColor(analysisResult.totalScore)}`}>{analysisResult.totalScore}점</div>
                                <div className="text-slate-400 font-bold mt-2">{analysisResult.verdict}</div>
                            </div>

                            {/* Word Cloud */}
                            <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm flex flex-col">
                                <h3 className="text-slate-500 font-bold mb-4 text-sm flex items-center gap-2">
                                    <span className="material-symbols-rounded text-violet-500">tag</span> 주요 언급 키워드
                                </h3>
                                <div className="flex-1 bg-slate-50 rounded-xl p-4 flex flex-wrap items-center justify-center gap-3 relative min-h-[200px]">
                                    {analysisResult.keywords.length === 0 && <span className="text-slate-400">키워드 데이터가 없습니다.</span>}
                                    {analysisResult.keywords.map((kw, i) => {
                                        const style = getSentimentColor(kw.type || kw.sentiment_type);
                                        const size = 0.8 + (kw.weight * 0.1);
                                        return (
                                            <span key={i} className={`px-3 py-1.5 rounded-full font-bold ${style.bg} ${style.text} hover:scale-110 transition-transform cursor-default`} style={{ fontSize: `${size}rem` }}>
                                                #{kw.text}
                                            </span>
                                        )
                                    })}
                                </div>
                            </div>
                        </div>

                        <div className="flex flex-col lg:flex-row gap-6">
                            {/* Left: Table */}
                            <div className="flex-[3] bg-white rounded-2xl border border-slate-200 p-6 flex flex-col">
                                <h3 className="text-slate-700 font-bold mb-4 flex items-center gap-2">
                                    <span className="material-symbols-rounded text-slate-400">list_alt</span> 실시간 소셜 미디어 언급
                                </h3>
                                <div className="flex-1 overflow-x-auto">
                                    <table className="w-full text-sm text-left whitespace-nowrap">
                                        <thead>
                                            <tr className="border-b border-slate-100 text-slate-500">
                                                <th className="py-3 px-2 w-[15%]">날짜</th>
                                                <th className="py-3 px-2 w-[15%]">채널</th>
                                                <th className="py-3 px-2">내용 요약</th>
                                                <th className="py-3 px-2 text-center w-[10%]">감성</th>
                                                <th className="py-3 px-2 text-center w-[10%]">영향력</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-50">
                                            {mentions.length === 0 ? (
                                                <tr><td colSpan="5" className="p-8 text-center text-slate-400">데이터가 없습니다.</td></tr>
                                            ) : (
                                                mentions.map((m, i) => (
                                                    <tr key={i} className="hover:bg-slate-50 transition-colors">
                                                        <td className="py-3 px-2 text-slate-500 text-xs">{m.date}</td>
                                                        <td className="py-3 px-2 font-bold text-slate-600">{m.channel}</td>
                                                        <td className="py-3 px-2 max-w-[300px] truncate text-slate-700">
                                                            <a href={m.link} target="_blank" rel="noopener noreferrer" className="hover:text-violet-600 hover:underline">{m.text}</a>
                                                        </td>
                                                        <td className="py-3 px-2 text-center">
                                                            <span className={`px-2 py-1 rounded text-xs font-bold ${getSentimentColor(m.sentiment).bg} ${getSentimentColor(m.sentiment).text}`}>
                                                                {m.sentiment === 'pos' ? '긍정' : m.sentiment === 'neg' ? '부정' : '중립'}
                                                            </span>
                                                        </td>
                                                        <td className="py-3 px-2 text-center text-slate-600 font-mono">{m.score}</td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {/* Right: AI Insight */}
                            <div className="flex-[2] bg-white rounded-2xl border-l-4 border-violet-500 p-6 shadow-sm flex flex-col justify-between">
                                <div>
                                    <div className="flex items-center gap-3 mb-4">
                                        <div className="w-10 h-10 rounded-lg bg-violet-100 flex items-center justify-center text-violet-600">
                                            <span className="material-symbols-rounded">psychology_alt</span>
                                        </div>
                                        <h3 className="font-bold text-slate-800">제니의 평판 분석 및 조언</h3>
                                    </div>
                                    <div className="prose prose-sm text-slate-600 leading-relaxed mb-6">
                                        <p className="mb-4"><strong className="text-violet-700">[종합 진단]</strong> {analysisResult.summary}</p>
                                        <div className="bg-orange-50 border-l-4 border-orange-400 p-4 rounded-r-lg text-orange-900 text-xs font-medium">
                                            <strong className="block mb-1 text-orange-700">📋 AI Insight</strong>
                                            상위 키워드와 감성 분석 결과를 통해 <span className="underline decoration-orange-300 decoration-2">{analysisResult.verdict}</span> 상태로 판단됩니다.
                                        </div>
                                    </div>
                                </div>
                                <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                                    <button onClick={handlePrint} className="px-4 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 font-bold text-sm flex items-center gap-2">
                                        <span className="material-symbols-rounded text-lg">print</span> 인쇄
                                    </button>
                                    <button onClick={handlePdfExport} className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-900 text-white font-bold text-sm flex items-center gap-2">
                                        <span className="material-symbols-rounded text-lg">picture_as_pdf</span> PDF 보고서
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Footer Guide */}
                <div className="mt-8 border-t border-slate-200 pt-8 grid grid-cols-1 md:grid-cols-2 gap-8 text-sm text-slate-500">
                    <div>
                        <h4 className="font-bold text-slate-700 mb-2 flex items-center gap-2">
                            <span className="material-symbols-rounded text-blue-500">info</span> 이 서비스는 무엇을 분석하나요?
                        </h4>
                        <ul className="list-disc pl-5 space-y-1">
                            <li><strong>실시간 트렌드 파악:</strong> 네이버 블로그 데이터를 필터링하여 브랜드의 최신 온라인 반응을 수집합니다.</li>
                            <li><strong>감성 및 평판 진단:</strong> 소비자들의 호감도와 불만 사항을 정량화된 점수로 제공합니다.</li>
                            <li><strong>전략적 대응 지원:</strong> 평판 리스크를 조기 발견하고 마케팅 활용 방안을 제안합니다.</li>
                        </ul>
                    </div>
                    <div>
                        <h4 className="font-bold text-slate-700 mb-2 flex items-center gap-2">
                            <span className="material-symbols-rounded text-emerald-500">settings</span> 준비 사항: 정보 입력 가이드
                        </h4>
                        <p className="leading-relaxed">
                            정확한 분석을 위해 <strong>[설정 및 관리 {'>'} 업체 정보]</strong> 메뉴에서 <strong>'업체명'</strong>을 반드시 입력해 주세요.
                            제니 AI는 등록된 업체명을 검색어로 사용하여 온라인상의 흔적을 정밀하게 추적합니다.
                        </p>
                    </div>
                </div>

                <div className="mt-4 text-center">
                    <p className="text-indigo-500 font-medium italic text-sm">
                        "사장님의 진심이 온라인에서 어떤 감동으로 피어나는지 매 순간 지켜보고 있어요. <br />
                        작은 칭찬은 전략으로, 아쉬운 한마디는 혁신의 기회로 바꾸어 드릴게요! - Jenny"
                    </p>
                </div>
            </div>
        </div>
    );
};

export default OnlineReputation;

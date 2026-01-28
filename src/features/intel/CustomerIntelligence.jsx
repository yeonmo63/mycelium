import React, { useState, useEffect, useRef } from 'react';
import { Chart, registerables } from 'chart.js';
import { formatCurrency } from '../../utils/common';
import { useModal } from '../../contexts/ModalContext';

Chart.register(...registerables);

const CustomerIntelligence = () => {
    const { showAlert } = useModal();
    const [activeTab, setActiveTab] = useState('rfm');
    const [isLoading, setIsLoading] = useState(true);
    const [loadingText, setLoadingText] = useState('고객 데이터를 분석 중입니다...');

    // Shared Data
    const [rfmData, setRfmData] = useState([]);
    const [membershipData, setMembershipData] = useState([]);

    const tabs = [
        { id: 'rfm', label: '생애주기(RFM) 분석', icon: 'group_work', color: 'text-indigo-500' },
        { id: 'repurchase', label: 'AI 재구매 제안', icon: 'notifications_active', color: 'text-rose-500' },
        { id: 'membership', label: '멤버십 가치 분석', icon: 'loyalty', color: 'text-amber-500' },
    ];

    useEffect(() => {
        loadSharedData();
    }, []);

    const loadSharedData = async () => {
        if (!window.__TAURI__) return;
        try {
            const year = new Date().getFullYear();
            const [rfm, member] = await Promise.all([
                window.__TAURI__.core.invoke('get_rfm_analysis', {}),
                window.__TAURI__.core.invoke('get_membership_sales_analysis', { year })
            ]);
            setRfmData(rfm || []);
            setMembershipData(member || []);
        } catch (e) {
            console.error("Shared data load failed:", e);
        } finally {
            setIsLoading(false);
        }
    };

    const handleRefresh = async () => {
        setIsLoading(true);
        await loadSharedData();
    };

    return (
        <div className="flex flex-col h-full bg-[#f8fafc] overflow-hidden animate-in fade-in duration-700">
            {/* Header Area */}
            <div className="px-6 lg:px-8 pt-6 lg:pt-8 pb-4 shrink-0">
                <div className="flex justify-between items-end">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <span className="w-6 h-1 bg-rose-500 rounded-full"></span>
                            <span className="text-[9px] font-black tracking-[0.2em] text-rose-500 uppercase">AI Customer Center</span>
                        </div>
                        <h1 className="text-3xl font-black text-slate-700 tracking-tighter" style={{ fontFamily: '"Noto Sans KR", sans-serif' }}>
                            AI 고객 성장 센터 <span className="text-slate-300 font-light ml-1 text-xl">Customer Intelligence</span>
                        </h1>
                        <p className="text-slate-400 text-sm mt-1 flex items-center gap-1">
                            <span className="material-symbols-rounded text-sm">support_agent</span>
                            AI가 고객의 생애 주기를 분석하고 맞춤형 성장 전략을 제안합니다.
                        </p>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={() => window.location.reload()} className="h-10 px-4 rounded-xl bg-white border border-slate-200 text-slate-600 font-bold hover:bg-slate-50 transition-all flex items-center gap-2 text-sm shadow-sm">
                            <span className="material-symbols-rounded text-lg">refresh</span> 새로고침
                        </button>
                    </div>
                </div>

                {/* Tab Navigation */}
                <div className="flex items-center gap-1 mt-6 border-b border-slate-200 overflow-x-auto custom-scrollbar">
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`px-4 py-3 text-sm font-bold flex items-center gap-2 border-b-2 transition-all whitespace-nowrap
                                ${activeTab === tab.id ? `border-rose-500 text-slate-800 bg-rose-50/50 rounded-t-lg` : 'border-transparent text-slate-400 hover:text-slate-600 hover:bg-slate-50/50 rounded-t-lg'}
                            `}
                        >
                            <span className={`material-symbols-rounded text-lg ${activeTab === tab.id ? tab.color : 'text-slate-400'}`}>{tab.icon}</span>
                            {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto p-6 lg:p-8 min-h-0 custom-scrollbar relative">
                {isLoading && (
                    <div className="absolute inset-0 z-50 bg-white/70 backdrop-blur-sm flex flex-col items-center justify-center">
                        <span className="material-symbols-rounded text-4xl text-rose-500 animate-spin">cyclone</span>
                        <div className="mt-4 text-slate-600 font-bold">{loadingText}</div>
                    </div>
                )}

                <div style={{ display: activeTab === 'rfm' ? 'block' : 'none' }}>
                    <TabRfm data={rfmData} onRefresh={handleRefresh} isVisible={activeTab === 'rfm'} showAlert={showAlert} />
                </div>
                <div style={{ display: activeTab === 'repurchase' ? 'block' : 'none' }}>
                    <TabRepurchase isVisible={activeTab === 'repurchase'} showAlert={showAlert} />
                </div>
                <div style={{ display: activeTab === 'membership' ? 'block' : 'none' }}>
                    <TabMembership data={membershipData} isVisible={activeTab === 'membership'} />
                </div>
            </div>
        </div>
    );
};

// --- Sub Components ---

const TabRfm = ({ data, onRefresh, isVisible, showAlert }) => {
    const [filteredData, setFilteredData] = useState([]);
    const [filter, setFilter] = useState('all');
    // Stats
    const [stats, setStats] = useState({ champion: 0, loyal: 0, risky: 0, new: 0 });

    useEffect(() => {
        if (data) {
            setFilteredData(filter === 'all' ? data : data.filter(c => c.rfm_segment === filter));
            setStats({
                champion: data.filter(c => c.rfm_segment === 'Champions').length,
                loyal: data.filter(c => c.rfm_segment === 'Loyal').length,
                risky: data.filter(c => c.rfm_segment === 'At Risk').length,
                new: data.filter(c => c.rfm_segment === 'New / Potential').length
            });
        }
    }, [data, filter]);

    const handleLevelChange = async (customerId, newLevel) => {
        if (!window.__TAURI__) return;
        try {
            await window.__TAURI__.core.invoke('update_customer_level', { customerId, newLevel });
            showAlert('변경 완료', `고객 등급이 ${newLevel}(으)로 변경되었습니다.`, 'success');
            onRefresh(); // Trigger parent refresh
        } catch (e) {
            console.error(e);
            showAlert('오류', '등급 변경 실패: ' + e);
        }
    };

    return (
        <div className="space-y-6">
            {/* Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                    { label: '챔피언 (최우수)', value: stats.champion, icon: '🏆', bg: 'bg-amber-50 border-amber-200', text: 'text-amber-800' },
                    { label: '충성 고객', value: stats.loyal, icon: '💙', bg: 'bg-blue-50 border-blue-200', text: 'text-blue-800' },
                    { label: '이탈 위험', value: stats.risky, icon: '🚨', bg: 'bg-red-50 border-red-200', text: 'text-red-800' },
                    { label: '신규/잠재', value: stats.new, icon: '🌱', bg: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-800' },
                ].map((card, idx) => (
                    <div key={idx} className={`p-4 rounded-2xl border ${card.bg} flex flex-col items-center justify-center text-center shadow-sm`}>
                        <div className="text-3xl mb-2">{card.icon}</div>
                        <div className="text-xs font-bold opacity-60 uppercase mb-1">{card.label}</div>
                        <div className={`text-2xl font-black ${card.text}`}>{card.value}명</div>
                    </div>
                ))}
            </div>

            {/* Table */}
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden flex flex-col h-[600px]">
                <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center shrink-0">
                    <h3 className="font-bold text-slate-700">등급별 타겟 리스트</h3>
                    <select value={filter} onChange={e => setFilter(e.target.value)} className="h-9 px-3 text-sm font-bold text-slate-600 bg-white border border-slate-200 rounded-lg">
                        <option value="all">전체 고객</option>
                        <option value="Champions">🏆 챔피언</option>
                        <option value="Loyal">💙 충성 고객</option>
                        <option value="At Risk">🚨 이탈 위험</option>
                        <option value="New / Potential">🌱 신규/잠재</option>
                    </select>
                </div>
                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-white shadow-sm sticky top-0 z-10">
                            <tr className="text-slate-500 border-b border-slate-100">
                                <th className="py-3 px-4 w-[15%]">고객명</th>
                                <th className="py-3 px-4 w-[15%]">연락처</th>
                                <th className="py-3 px-4 w-[10%] text-center">최근구매</th>
                                <th className="py-3 px-4 w-[10%] text-center">건수</th>
                                <th className="py-3 px-4 w-[15%] text-right">총 거래액</th>
                                <th className="py-3 px-4 w-[10%] text-center">현 등급</th>
                                <th className="py-3 px-4 w-[10%] text-center">RFM</th>
                                <th className="py-3 px-4 w-[15%] text-center">등급 변경</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {filteredData.length === 0 ? <tr><td colSpan="8" className="p-8 text-center text-slate-400">데이터가 없습니다.</td></tr> :
                                filteredData.map(c => (
                                    <tr key={c.customer_id} className="hover:bg-slate-50">
                                        <td className="py-3 px-4 font-bold text-slate-700">{c.customer_name}</td>
                                        <td className="py-3 px-4 text-slate-500 font-mono text-xs">{c.mobile_number}</td>
                                        <td className="py-3 px-4 text-center text-slate-600 text-xs">{c.last_order_date}</td>
                                        <td className="py-3 px-4 text-center text-slate-600">{c.total_orders.toLocaleString()}</td>
                                        <td className="py-3 px-4 text-right font-black text-slate-700">{formatCurrency(c.total_amount)}</td>
                                        <td className="py-3 px-4 text-center font-bold text-indigo-500">{c.membership_level || '일반'}</td>
                                        <td className="py-3 px-4 text-center">
                                            <span className={`px-2 py-1 rounded text-xs font-bold 
                                                ${c.rfm_segment === 'Champions' ? 'bg-amber-100 text-amber-600' :
                                                    c.rfm_segment === 'Loyal' ? 'bg-blue-100 text-blue-600' :
                                                        c.rfm_segment === 'At Risk' ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-600'
                                                }`}>
                                                {c.rfm_segment}
                                            </span>
                                        </td>
                                        <td className="py-3 px-4 text-center">
                                            <select
                                                className="bg-slate-50 border border-slate-200 text-slate-600 text-xs rounded px-2 py-1"
                                                defaultValue=""
                                                onChange={(e) => handleLevelChange(c.customer_id, e.target.value)}
                                            >
                                                <option value="" disabled>변경</option>
                                                <option value="일반">일반</option>
                                                <option value="VIP">VIP</option>
                                                <option value="VVP">VVP</option>
                                            </select>
                                        </td>
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

const TabRepurchase = ({ isVisible, showAlert }) => {
    const [result, setResult] = useState([]);
    const [hasRun, setHasRun] = useState(false);
    const [isAnalyzing, setIsAnalyzing] = useState(false);

    const runAnalysis = async () => {
        if (!window.__TAURI__) return;
        setIsAnalyzing(true);
        try {
            await new Promise(r => setTimeout(r, 1000)); // Fake nice delay
            const res = await window.__TAURI__.core.invoke('get_ai_repurchase_analysis', {});
            setResult(res?.candidates || []);
            setHasRun(true);
        } catch (e) {
            console.error(e);
            showAlert('분석 실패', e.toString());
        } finally {
            setIsAnalyzing(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="bg-white rounded-2xl p-6 border-l-[6px] border-rose-500 shadow-sm flex flex-col md:flex-row gap-6">
                <div className="shrink-0 relative">
                    {isAnalyzing && (
                        <div className="absolute inset-0 bg-white/70 rounded-full flex items-center justify-center z-10">
                            <span className="material-symbols-rounded text-rose-500 animate-spin">refresh</span>
                        </div>
                    )}
                    <div className="w-16 h-16 rounded-full bg-rose-50 border-2 border-rose-100 overflow-hidden">
                        <img src="https://api.dicebear.com/7.x/bottts/svg?seed=jenny" alt="AI" className="w-full h-full" />
                    </div>
                </div>
                <div className="flex-1">
                    <h2 className="text-xl font-black text-slate-800 mb-1">제니의 구매주기 엔진 (Alpha)</h2>
                    <p className="text-sm text-slate-500 mb-4 leading-relaxed">
                        과거 구매 패턴을 딥러닝으로 분석하여, 이번 주에 재구매할 가능성이 높은 고객을 선별해 드립니다.<br />
                        <span className="text-xs text-rose-400 font-bold">* 분석 모델은 데이터가 많을수록 정확해집니다.</span>
                    </p>
                    <button onClick={runAnalysis} className="px-6 py-2 bg-rose-500 text-white font-bold rounded-lg hover:bg-rose-600 transition-colors shadow-lg shadow-rose-200 flex items-center gap-2">
                        <span className="material-symbols-rounded">auto_awesome</span> AI 분석 리스트 생성하기
                    </button>
                </div>
            </div>

            {hasRun && (
                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden flex flex-col h-[500px] animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="p-4 bg-slate-50 border-b border-slate-200 font-bold text-slate-700 flex items-center gap-2">
                        <span className="material-symbols-rounded text-rose-500">recommend</span> 이번 주 타겟 제안
                    </div>
                    <div className="flex-1 overflow-y-auto custom-scrollbar">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-white shadow-sm sticky top-0 z-10">
                                <tr className="text-slate-500 border-b border-slate-100">
                                    <th className="py-3 px-4 w-[15%]">고객명</th>
                                    <th className="py-3 px-4 w-[15%]">연락처</th>
                                    <th className="py-3 px-4 w-[20%]">최근 구매 상품</th>
                                    <th className="py-3 px-4 w-[10%] text-center">평균주기</th>
                                    <th className="py-3 px-4 w-[10%] text-center">마지막구매</th>
                                    <th className="py-3 px-4 w-[15%] text-center">제안 사유</th>
                                    <th className="py-3 px-4 w-[15%] text-center">관리</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {result.length === 0 ? <tr><td colSpan="7" className="p-8 text-center text-slate-400">추천할 고객이 없습니다.</td></tr> :
                                    result.map((r, i) => (
                                        <tr key={i} className="hover:bg-slate-50">
                                            <td className="py-3 px-4 font-bold text-slate-700">{r.customer_name}</td>
                                            <td className="py-3 px-4 text-slate-500 font-mono text-xs">{r.mobile_number}</td>
                                            <td className="py-3 px-4 text-slate-600">{r.last_product || '-'}</td>
                                            <td className="py-3 px-4 text-center text-slate-500">{r.avg_interval_days}일</td>
                                            <td className="py-3 px-4 text-center text-slate-500 text-xs">{r.last_order_date}</td>
                                            <td className="py-3 px-4 text-center font-bold text-rose-500">
                                                {r.predicted_days_remaining === 0 ? '오늘 예상' : r.predicted_days_remaining > 0 ? `${r.predicted_days_remaining}일 후` : `${Math.abs(r.predicted_days_remaining)}일 지남`}
                                            </td>
                                            <td className="py-3 px-4 text-center">
                                                <div className="flex justify-center gap-1">
                                                    <button className="w-8 h-8 rounded bg-rose-50 text-rose-600 flex items-center justify-center hover:bg-rose-100 transition-colors" title="SMS">
                                                        <span className="material-symbols-rounded text-sm">sms</span>
                                                    </button>
                                                    <button className="w-8 h-8 rounded bg-yellow-100 text-yellow-800 flex items-center justify-center hover:bg-yellow-200 transition-colors" title="Kakao">
                                                        <span className="material-symbols-rounded text-sm">chat</span>
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                }
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
};

const TabMembership = ({ data, isVisible }) => {
    const chartRef = useRef(null);
    const chartInstance = useRef(null);

    useEffect(() => {
        if (isVisible && chartInstance.current) {
            chartInstance.current.resize();
        }
    }, [isVisible]);

    useEffect(() => {
        if (data && chartRef.current) {
            renderChart(data);
        }
    }, [data, isVisible]); // Add isVisible to ensure render if canvas wasn't ready

    const renderChart = (data) => {
        if (!chartRef.current) return;
        if (chartInstance.current) chartInstance.current.destroy();

        const ctx = chartRef.current.getContext('2d');
        chartInstance.current = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: data.map(d => d.membership_level),
                datasets: [{
                    data: data.map(d => d.total_amount),
                    backgroundColor: ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#64748b'],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { position: 'bottom' } }
            }
        });
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-full">
            <div className="bg-white rounded-2xl border border-slate-200 p-6 flex flex-col h-[500px]">
                <h3 className="font-bold text-lg text-slate-700 mb-4">멤버십 등급별 매출 기여도</h3>
                <div className="flex-1 relative min-h-0">
                    <canvas ref={chartRef}></canvas>
                </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden flex flex-col h-[500px]">
                <div className="p-4 bg-slate-50 border-b border-slate-200 font-bold text-slate-700">연간 멤버십 통계 리포트</div>
                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-white shadow-sm sticky top-0 z-10">
                            <tr className="text-slate-500 border-b border-slate-100">
                                <th className="py-3 px-4 w-[25%] font-bold">등급</th>
                                <th className="py-3 px-4 w-[25%] text-right font-bold">판매액</th>
                                <th className="py-3 px-4 w-[25%] text-right font-bold">고객수</th>
                                <th className="py-3 px-4 w-[25%] text-right font-bold">객단가 (LTV)</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {data.length === 0 ? <tr><td colSpan="4" className="p-8 text-center text-slate-400">데이터 없음</td></tr> :
                                data.map((d, i) => (
                                    <tr key={i} className="hover:bg-slate-50">
                                        <td className="py-3 px-4 font-bold text-slate-800">{d.membership_level}</td>
                                        <td className="py-3 px-4 text-right text-slate-600">{formatCurrency(d.total_amount)}</td>
                                        <td className="py-3 px-4 text-right text-slate-600">{d.customer_count.toLocaleString()}명</td>
                                        <td className="py-3 px-4 text-right font-black text-indigo-500">
                                            {formatCurrency(d.customer_count > 0 ? Math.floor(d.total_amount / d.customer_count) : 0)}
                                        </td>
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

export default CustomerIntelligence;

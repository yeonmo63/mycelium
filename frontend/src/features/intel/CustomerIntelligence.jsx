import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Chart, registerables } from 'chart.js';
import { formatCurrency } from '../../utils/common';
import { useModal } from '../../contexts/ModalContext';

Chart.register(...registerables);

const CustomerIntelligence = () => {
    const { showAlert } = useModal();
    const [activeTab, setActiveTab] = useState('rfm');
    const [isLoading, setIsLoading] = useState(true);
    const [loadingText, setLoadingText] = useState('고객 데이터를 분석 중입니다...');
    const [isGlobalProcessing, setIsGlobalProcessing] = useState(false);
    const [globalLoadingText, setGlobalLoadingText] = useState('');

    const toggleProcessing = (loading, text = '분석 수행 중...') => {
        setIsGlobalProcessing(loading);
        setGlobalLoadingText(text);
    };

    // Shared Data
    const [rfmData, setRfmData] = useState([]);
    const [membershipData, setMembershipData] = useState([]);
    const [isTabLoading, setIsTabLoading] = useState(false);

    // Modal State
    const [smsModal, setSmsModal] = useState({ isOpen: false, targetCustomers: [], mode: 'sms' });
    const [batchMemoModal, setBatchMemoModal] = useState({ isOpen: false, targetCustomers: [] });

    // Summary Modal State
    const [summaryId, setSummaryId] = useState(null);
    const openSummaryModal = useCallback((id) => setSummaryId(id), []);
    const closeSummaryModal = useCallback(() => setSummaryId(null), []);

    const tabs = [
        { id: 'rfm', label: '생애주기(RFM) 분석', icon: 'group_work', color: 'text-indigo-500' },
        { id: 'repurchase', label: 'AI 재구매 제안', icon: 'notifications_active', color: 'text-rose-500' },
        { id: 'behavior', label: '로그 심층 분석', icon: 'history_edu', color: 'text-teal-500' },
        { id: 'membership', label: '멤버십 가치 분석', icon: 'loyalty', color: 'text-amber-500' },
    ];

    const handleTabChange = useCallback((tabId) => {
        if (activeTab === tabId) return;
        setIsTabLoading(true);
        // Short delay to show spinner for better perceived responsiveness
        setTimeout(() => {
            setActiveTab(tabId);
            setTimeout(() => setIsTabLoading(false), 200);
        }, 50);
    }, [activeTab]);

    const loadSharedData = useCallback(async () => {
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
    }, []);

    const openSmsModal = useCallback((customers, mode = 'sms') => {
        const targetCustomers = Array.isArray(customers) ? customers : [customers];
        setSmsModal({ isOpen: true, targetCustomers, mode });
    }, []);

    const closeSmsModal = useCallback(() => {
        setSmsModal(prev => ({ ...prev, isOpen: false }));
    }, []);

    const openBatchMemoModal = useCallback((customers) => {
        setBatchMemoModal({ isOpen: true, targetCustomers: Array.isArray(customers) ? customers : [customers] });
    }, []);

    const closeBatchMemoModal = useCallback(() => {
        setBatchMemoModal(prev => ({ ...prev, isOpen: false }));
    }, []);

    useEffect(() => {
        loadSharedData();
    }, [loadSharedData]);

    const handleRefresh = useCallback(async () => {
        setIsLoading(true);
        await loadSharedData();
    }, [loadSharedData]);

    return (
        <div className="flex flex-col h-full bg-[#f8fafc] overflow-hidden animate-in fade-in duration-700 relative">
            {/* Global Loading Overlays */}
            {isLoading && (
                <div className="absolute inset-0 z-[100] bg-white/60 backdrop-blur-sm flex flex-col items-center justify-center">
                    <div className="flex flex-col items-center animate-in zoom-in-95 duration-500 text-center px-6">
                        <span className="material-symbols-rounded text-6xl text-rose-500 animate-spin">cyclone</span>
                        <div className="mt-6 text-xl font-black text-slate-700">{loadingText}</div>
                        <p className="text-slate-400 text-sm mt-2">고객 집단별 최적의 커뮤니케이션 전략을 수립 중입니다.</p>
                    </div>
                </div>
            )}

            {isGlobalProcessing && (
                <div className="absolute inset-0 z-[90] bg-slate-900/5 backdrop-blur-[1px] flex flex-col items-center justify-center">
                    <div className="flex flex-col items-center gap-4 bg-white/90 backdrop-blur-md p-10 rounded-[2.5rem] shadow-2xl shadow-rose-200/40 border border-white/50 animate-in zoom-in-95 duration-300">
                        <div className="relative">
                            <span className="material-symbols-rounded text-7xl text-rose-500 animate-spin">progress_activity</span>
                            <span className="material-symbols-rounded text-3xl text-rose-300 absolute inset-0 flex items-center justify-center">psychology</span>
                        </div>
                        <div className="flex flex-col items-center text-center">
                            <span className="text-xl font-black text-slate-800">{globalLoadingText}</span>
                            <span className="text-sm text-slate-500 mt-2">안전한 데이터 처리를 위해 잠시만 기다려 주세요.<br />분석이 완료되면 리스트가 자동으로 업데이트됩니다.</span>
                        </div>
                    </div>
                </div>
            )}

            {isTabLoading && (
                <div className="absolute inset-0 z-[80] bg-white/40 backdrop-blur-[1px] flex items-center justify-center">
                    <div className="bg-white/90 backdrop-blur-sm px-6 py-4 rounded-2xl shadow-xl flex items-center gap-4 border border-slate-100">
                        <span className="material-symbols-rounded text-2xl animate-spin text-rose-500">sync</span>
                        <span className="text-base font-bold text-slate-700">분석 화면 전환 중...</span>
                    </div>
                </div>
            )}

            <div className={(isLoading || isGlobalProcessing || isTabLoading) ? 'opacity-70 blur-[0.5px] pointer-events-none transition-all duration-300 flex flex-col h-full' : 'flex flex-col h-full transition-all duration-300'}>
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
                                onClick={() => handleTabChange(tab.id)}
                                className={`px-5 py-3 text-sm font-bold flex items-center gap-2 border-b-2 transition-all whitespace-nowrap rounded-t-lg
                                ${activeTab === tab.id
                                        ? `border-current ${tab.color.replace('text-', 'border-')} ${tab.color} bg-white shadow-sm`
                                        : 'border-transparent text-slate-400 hover:text-slate-600 hover:bg-slate-50'
                                    }
                            `}
                            >
                                <span className={`material-symbols-rounded text-lg`}>{tab.icon}</span>
                                {tab.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Content Area */}
                <div className="flex-1 overflow-y-auto p-6 lg:p-8 min-h-0 custom-scrollbar relative">
                    <div>
                        <div style={{ display: activeTab === 'rfm' ? 'block' : 'none' }}>
                            <TabRfm
                                data={rfmData}
                                isLoading={isLoading}
                                onRefresh={handleRefresh}
                                isVisible={activeTab === 'rfm'}
                                showAlert={showAlert}
                                openSmsModal={openSmsModal}
                                openBatchMemoModal={openBatchMemoModal}
                                openSummaryModal={openSummaryModal}
                            />
                        </div>
                        <div style={{ display: activeTab === 'repurchase' ? 'block' : 'none' }}>
                            <TabRepurchase isVisible={activeTab === 'repurchase'} showAlert={showAlert} toggleProcessing={toggleProcessing} openSmsModal={openSmsModal} openBatchMemoModal={openBatchMemoModal} />
                        </div>
                        <div style={{ display: activeTab === 'behavior' ? 'block' : 'none' }}>
                            <TabBehavior isVisible={activeTab === 'behavior'} showAlert={showAlert} toggleProcessing={toggleProcessing} />
                        </div>
                        <div style={{ display: activeTab === 'membership' ? 'block' : 'none' }}>
                            <TabMembership data={membershipData} isVisible={activeTab === 'membership'} />
                        </div>
                    </div>
                </div>
            </div>

            {smsModal.isOpen && (
                <SmsSendModal
                    customers={smsModal.targetCustomers}
                    mode={smsModal.mode}
                    onClose={closeSmsModal}
                    showAlert={showAlert}
                />
            )}

            {batchMemoModal.isOpen && (
                <BatchMemoModal
                    customers={batchMemoModal.targetCustomers}
                    onClose={closeBatchMemoModal}
                    showAlert={showAlert}
                    onSuccess={handleRefresh}
                />
            )}

            {/* Customer Detail Modal (Global) */}
            {summaryId && (
                <CustomerSummaryModal
                    customerId={summaryId}
                    onClose={closeSummaryModal}
                />
            )}
        </div>
    );
};

// --- Sub Components ---

const TabRfm = React.memo(({ data, isLoading, onRefresh, isVisible, showAlert, openSmsModal, openBatchMemoModal, openSummaryModal }) => {
    const navigate = useNavigate();
    const [filter, setFilter] = useState('all');
    const [isFiltering, setIsFiltering] = useState(false);
    const [selectedIds, setSelectedIds] = useState(new Set());

    const setFilterValue = useCallback((newFilter) => {
        if (filter === newFilter) return;
        setIsFiltering(true);
        setSelectedIds(new Set()); // Reset selection on filter change
        setTimeout(() => {
            setFilter(newFilter);
            setIsFiltering(false);
        }, 300);
    }, [filter]);

    const handleFilterChange = (e) => setFilterValue(e.target.value);

    const filteredData = useMemo(() => {
        if (!data) return [];
        if (filter === 'all') return data;
        // Use includes because backend returns "Korean (English)" format
        return data.filter(c => c.rfm_segment.includes(filter));
    }, [data, filter]);

    const stats = useMemo(() => {
        if (!data) return { champion: 0, promising: 0, atRisk: 0, hibernating: 0, attention: 0 };
        return {
            champion: data.filter(c => c.rfm_segment.includes('Champions')).length,
            promising: data.filter(c => c.rfm_segment.includes('Promising')).length,
            atRisk: data.filter(c => c.rfm_segment.includes('At Risk')).length,
            hibernating: data.filter(c => c.rfm_segment.includes('Hibernating')).length,
            attention: data.filter(c => c.rfm_segment.includes('Need Attention')).length
        };
    }, [data]);

    const handleViewDetail = (id) => openSummaryModal(id);
    const handleSms = (c) => openSmsModal(c, 'sms');
    const handleKakao = (c) => openSmsModal(c, 'kakao');

    const toggleSelectAll = () => {
        if (selectedIds.size === filteredData.length && filteredData.length > 0) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(filteredData.map(c => c.customer_id)));
        }
    };

    const toggleSelect = (id) => {
        const next = new Set(selectedIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelectedIds(next);
    };

    const handleBatchSms = () => {
        if (selectedIds.size === 0) return showAlert('알림', '선택된 고객이 없습니다.');
        const targets = data.filter(c => selectedIds.has(c.customer_id));
        openSmsModal(targets, 'sms');
    };

    const handleBatchKakao = () => {
        if (selectedIds.size === 0) return showAlert('알림', '선택된 고객이 없습니다.');
        const targets = data.filter(c => selectedIds.has(c.customer_id));
        openSmsModal(targets, 'kakao');
    };

    const handleBatchMemo = () => {
        if (selectedIds.size === 0) return showAlert('알림', '선택된 고객이 없습니다.');
        const targets = data.filter(c => selectedIds.has(c.customer_id));
        openBatchMemoModal(targets);
    };

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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                {[
                    { key: 'Champions', label: '챔피언 (최우수)', value: stats.champion, icon: '🏆', bg: 'bg-amber-50 border-amber-200', activeBg: 'bg-amber-500 border-amber-600 text-white', text: 'text-amber-800' },
                    { key: 'Promising', label: '잠재 우수 (Promising)', value: stats.promising, icon: '💙', bg: 'bg-blue-50 border-blue-200', activeBg: 'bg-blue-500 border-blue-600 text-white', text: 'text-blue-800' },
                    { key: 'At Risk', label: '이탈 위험 (At Risk)', value: stats.atRisk, icon: '🚨', bg: 'bg-rose-50 border-rose-200', activeBg: 'bg-rose-500 border-rose-600 text-white', text: 'text-rose-800' },
                    { key: 'Hibernating', label: '휴면 고객 (Hibernating)', value: stats.hibernating, icon: 'zzz', bg: 'bg-slate-100 border-slate-300', activeBg: 'bg-slate-700 border-slate-800 text-white', text: 'text-slate-800' },
                    { key: 'Need Attention', label: '일반 / 관심필요', value: stats.attention, icon: '🌱', bg: 'bg-emerald-50 border-emerald-200', activeBg: 'bg-emerald-500 border-emerald-600 text-white', text: 'text-emerald-800' },
                ].map((card, idx) => {
                    const isActive = filter === card.key;
                    return (
                        <button
                            key={idx}
                            onClick={() => setFilterValue(isActive ? 'all' : card.key)}
                            className={`p-4 rounded-2xl border transition-all flex flex-col items-center justify-center text-center shadow-sm relative group overflow-hidden
                                ${isActive ? card.activeBg : `${card.bg} hover:shadow-md hover:scale-[1.02] active:scale-[0.98]`}
                                ${card.key === 'At Risk' ? 'ring-2 ring-rose-300 ring-offset-2 animate-soft-pulse' : ''}`}
                        >
                            <div className={`text-3xl mb-2 transition-transform group-hover:scale-110 ${isActive ? 'brightness-0 invert opacity-80' : ''}`}>
                                {card.icon === 'zzz' ? <span className={`material-symbols-rounded ${isActive ? 'text-white' : 'text-slate-400'}`}>snooze</span> : card.icon}
                            </div>
                            <div className={`text-[10px] font-bold uppercase mb-1 ${isActive ? 'text-white/80' : 'opacity-60'}`}>{card.label}</div>
                            <div className={`text-xl font-black ${isActive ? 'text-white' : card.text}`}>{card.value.toLocaleString()}명</div>

                            {card.key === 'At Risk' && card.value > 0 && (
                                <div className="absolute top-1 left-2">
                                    <span className="flex h-2 w-2 rounded-full bg-rose-500 ring-2 ring-white"></span>
                                </div>
                            )}

                            {isActive && (
                                <div className="absolute top-2 right-2 flex items-center justify-center">
                                    <span className="material-symbols-rounded text-base animate-in zoom-in-50 duration-300">check_circle</span>
                                </div>
                            )}
                        </button>
                    );
                })}
            </div>

            {/* Table */}
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden flex flex-col h-[600px] relative">
                <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center shrink-0">
                    <div className="flex items-center gap-4">
                        <h3 className="font-bold text-slate-700">등급별 타겟 리스트</h3>
                        <div className="h-6 w-[1px] bg-slate-200"></div>
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-400">선택 {selectedIds.size}명</span>
                            <button
                                onClick={handleBatchSms}
                                disabled={selectedIds.size === 0}
                                className="h-8 px-3 rounded-lg bg-indigo-50 text-indigo-600 font-bold hover:bg-indigo-100 disabled:opacity-30 transition-all flex items-center gap-1.5 text-[11px] border border-indigo-100"
                            >
                                <span className="material-symbols-rounded text-base">sms</span> 선택 SMS 발송
                            </button>
                            <button
                                onClick={handleBatchKakao}
                                disabled={selectedIds.size === 0}
                                className="h-8 px-3 rounded-lg bg-yellow-100 text-yellow-800 font-bold hover:bg-yellow-200 disabled:opacity-30 transition-all flex items-center gap-1.5 text-[11px] border border-yellow-200 shadow-sm"
                            >
                                <span className="material-symbols-rounded text-base">chat</span> 선택 알림톡 발송
                            </button>
                            <button
                                onClick={handleBatchMemo}
                                disabled={selectedIds.size === 0}
                                className="h-8 px-3 rounded-lg bg-slate-100 text-slate-700 font-bold hover:bg-slate-200 disabled:opacity-30 transition-all flex items-center gap-1.5 text-[11px] border border-slate-200"
                            >
                                <span className="material-symbols-rounded text-base">edit_note</span> 선택 메모 일괄 등록
                            </button>
                        </div>
                    </div>
                    <select
                        value={filter}
                        onChange={handleFilterChange}
                        className="h-10 px-4 text-base font-bold text-slate-700 bg-white border border-slate-300 rounded-xl shadow-sm hover:border-indigo-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 transition-all outline-none"
                    >
                        <option value="all">전체 고객 보기</option>
                        <option value="Champions">🏆 챔피언 (최우수)</option>
                        <option value="Promising">💙 잠재 우수</option>
                        <option value="At Risk">🚨 이탈 위험</option>
                        <option value="Hibernating">💤 휴면 고객</option>
                        <option value="Need Attention">🌱 일반/관심필요</option>
                    </select>
                </div>
                <div className="flex-1 overflow-y-auto custom-scrollbar relative">
                    {isFiltering && (
                        <div className="absolute inset-0 z-20 bg-white/60 backdrop-blur-[1px] flex items-center justify-center animate-in fade-in duration-200">
                            <div className="flex flex-col items-center gap-2">
                                <span className="material-symbols-rounded text-3xl text-indigo-500 animate-spin">sync</span>
                                <span className="text-xs font-bold text-slate-500">리스트 필터링 중...</span>
                            </div>
                        </div>
                    )}
                    <table className="w-full text-sm text-left">
                        <thead className="bg-white shadow-sm sticky top-0 z-10">
                            <tr className="text-slate-500 border-b border-slate-100">
                                <th className="py-3 px-4 w-[40px]">
                                    <input
                                        type="checkbox"
                                        className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                        checked={filteredData.length > 0 && selectedIds.size === filteredData.length}
                                        onChange={toggleSelectAll}
                                    />
                                </th>
                                <th className="py-3 px-4 w-[12%]">고객명</th>
                                <th className="py-3 px-4 w-[15%]">연락처</th>
                                <th className="py-3 px-4 w-[10%] text-center">최근구매</th>
                                <th className="py-3 px-4 w-[8%] text-center">건수</th>
                                <th className="py-3 px-4 w-[12%] text-right">총 거래액</th>
                                <th className="py-3 px-4 w-[10%] text-center">현 등급</th>
                                <th className="py-3 px-4 w-[10%] text-center">RFM</th>
                                <th className="py-3 px-4 w-[8%] text-center">등급 변경</th>
                                <th className="py-3 px-4 w-[10%] text-center">관리</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {isLoading ? (
                                <tr>
                                    <td colSpan="9" className="h-64 text-center">
                                        <div className="flex flex-col items-center justify-center text-slate-400">
                                            <span className="material-symbols-rounded text-4xl text-indigo-400 animate-spin mb-3">cyclone</span>
                                            <span className="font-bold text-sm">데이터를 불러오는 중입니다...</span>
                                        </div>
                                    </td>
                                </tr>
                            ) : filteredData.length === 0 ? (
                                <tr><td colSpan="10" className="p-12 text-center text-slate-400 font-bold">데이터가 없습니다.</td></tr>
                            ) : (
                                filteredData.map(c => (
                                    <tr key={c.customer_id} className={`hover:bg-slate-50 transition-colors ${selectedIds.has(c.customer_id) ? 'bg-indigo-50/30' : ''}`}>
                                        <td className="py-3 px-4">
                                            <input
                                                type="checkbox"
                                                className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                                checked={selectedIds.has(c.customer_id)}
                                                onChange={() => toggleSelect(c.customer_id)}
                                            />
                                        </td>
                                        <td className="py-3 px-4 font-bold text-slate-700">{c.customer_name}</td>
                                        <td className="py-3 px-4 text-slate-500 font-mono text-xs">{c.mobile_number}</td>
                                        <td className="py-3 px-4 text-center text-slate-600 text-xs">{c.last_order_date}</td>
                                        <td className="py-3 px-4 text-center text-slate-600">{c.total_orders.toLocaleString()}</td>
                                        <td className="py-3 px-4 text-right font-black text-slate-700">{formatCurrency(c.total_amount)}</td>
                                        <td className="py-3 px-4 text-center font-bold text-indigo-500">{c.membership_level || '일반'}</td>
                                        <td className="py-3 px-4 text-center">
                                            <span className={`px-2 py-1 rounded text-xs font-bold 
                                                ${c.rfm_segment.includes('Champions') ? 'bg-amber-100 text-amber-600' :
                                                    c.rfm_segment.includes('Promising') ? 'bg-blue-100 text-blue-600' :
                                                        (c.rfm_segment.includes('At Risk') || c.rfm_segment.includes('Hibernating')) ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-600'
                                                }`}>
                                                {c.rfm_segment.split('(')[0]}
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
                                        <td className="py-3 px-4 text-center">
                                            <div className="flex justify-center gap-1">
                                                <button onClick={() => handleViewDetail(c.customer_id)} className="w-8 h-8 rounded bg-white border border-slate-200 text-indigo-500 hover:bg-slate-50 flex items-center justify-center transition-colors shadow-sm" title="상세보기">
                                                    <span className="material-symbols-rounded text-sm">visibility</span>
                                                </button>
                                                <button onClick={() => handleSms(c)} className="w-8 h-8 rounded bg-slate-50 border border-slate-200 text-slate-500 hover:bg-slate-100 flex items-center justify-center transition-colors shadow-sm" title="SMS 발송">
                                                    <span className="material-symbols-rounded text-sm">sms</span>
                                                </button>
                                                <button onClick={() => handleKakao(c)} className="w-8 h-8 rounded bg-yellow-100 border border-yellow-200 text-yellow-800 hover:bg-yellow-200 flex items-center justify-center transition-colors shadow-sm" title="카카오톡 발송">
                                                    <span className="material-symbols-rounded text-sm">chat</span>
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
});

const TabRepurchase = ({ isVisible, showAlert, toggleProcessing, openSmsModal, openBatchMemoModal }) => {
    const [result, setResult] = useState([]);
    const [hasRun, setHasRun] = useState(false);
    const [selectedIds, setSelectedIds] = useState(new Set());

    const runAnalysis = async () => {
        if (!window.__TAURI__) return;
        toggleProcessing(true, 'AI가 고객 구매 패턴과 재구매 주기를 심층 분석 중입니다...');
        setSelectedIds(new Set());
        try {
            await new Promise(r => setTimeout(r, 1000)); // Fake nice delay
            const res = await window.__TAURI__.core.invoke('get_ai_repurchase_analysis', {});
            setResult(res?.candidates || []);
            setHasRun(true);
        } catch (e) {
            console.error(e);
            showAlert('분석 실패', e.toString());
        } finally {
            toggleProcessing(false);
        }
    };

    const toggleSelectAll = () => {
        if (selectedIds.size === result.length && result.length > 0) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(result.map((_, i) => i))); // Index based for result list since it's from AI
        }
    };

    const toggleSelect = (idx) => {
        const next = new Set(selectedIds);
        if (next.has(idx)) next.delete(idx);
        else next.add(idx);
        setSelectedIds(next);
    };

    const handleBatchSms = () => {
        if (selectedIds.size === 0) return showAlert('알림', '선택된 고객이 없습니다.');
        const targets = result.filter((_, i) => selectedIds.has(i));
        openSmsModal(targets, 'sms');
    };

    const handleBatchKakao = () => {
        if (selectedIds.size === 0) return showAlert('알림', '선택된 고객이 없습니다.');
        const targets = result.filter((_, i) => selectedIds.has(i));
        openSmsModal(targets, 'kakao');
    };

    const handleBatchMemo = () => {
        if (selectedIds.size === 0) return showAlert('알림', '선택된 고객이 없습니다.');
        const targets = result.filter((_, i) => selectedIds.has(i));
        openBatchMemoModal(targets);
    };

    return (
        <div className="space-y-6">
            <div className="bg-white rounded-2xl p-6 border-l-[6px] border-rose-500 shadow-sm flex flex-col md:flex-row gap-6">
                <div className="shrink-0 relative">
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
                    <div className="p-4 bg-slate-50 border-b border-slate-200 font-bold text-slate-700 flex justify-between items-center">
                        <div className="flex items-center gap-2">
                            <span className="material-symbols-rounded text-rose-500">recommend</span> 이번 주 타겟 제안
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-400 mr-2">선택 {selectedIds.size}명</span>
                            <button
                                onClick={handleBatchSms}
                                disabled={selectedIds.size === 0}
                                className="h-8 px-3 rounded-lg bg-rose-50 text-rose-600 font-bold hover:bg-rose-100 disabled:opacity-30 transition-all flex items-center gap-1.5 text-[11px] border border-rose-100"
                            >
                                <span className="material-symbols-rounded text-base">sms</span> 선택 SMS
                            </button>
                            <button
                                onClick={handleBatchKakao}
                                disabled={selectedIds.size === 0}
                                className="h-8 px-3 rounded-lg bg-yellow-100 text-yellow-800 font-bold hover:bg-yellow-200 disabled:opacity-30 transition-all flex items-center gap-1.5 text-[11px] border border-yellow-200"
                            >
                                <span className="material-symbols-rounded text-base">chat</span> 선택 알림톡
                            </button>
                            <button
                                onClick={handleBatchMemo}
                                disabled={selectedIds.size === 0}
                                className="h-8 px-3 rounded-lg bg-slate-100 text-slate-700 font-bold hover:bg-slate-200 disabled:opacity-30 transition-all flex items-center gap-1.5 text-[11px] border border-slate-200"
                            >
                                <span className="material-symbols-rounded text-base">edit_note</span> 메모 등록
                            </button>
                        </div>
                    </div>
                    <div className="flex-1 overflow-y-auto custom-scrollbar">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-white shadow-sm sticky top-0 z-10">
                                <tr className="text-slate-500 border-b border-slate-100">
                                    <th className="py-3 px-4 w-[40px]">
                                        <input
                                            type="checkbox"
                                            className="w-4 h-4 rounded border-slate-300 text-rose-600 focus:ring-rose-500"
                                            checked={result.length > 0 && selectedIds.size === result.length}
                                            onChange={toggleSelectAll}
                                        />
                                    </th>
                                    <th className="py-3 px-4 w-[12%]">고객명</th>
                                    <th className="py-3 px-4 w-[15%]">연락처</th>
                                    <th className="py-3 px-4 w-[18%]">최근 구매 상품</th>
                                    <th className="py-3 px-4 w-[10%] text-center">평균주기</th>
                                    <th className="py-3 px-4 w-[10%] text-center">마지막구매</th>
                                    <th className="py-3 px-4 w-[15%] text-center">제안 사유</th>
                                    <th className="py-3 px-4 w-[10%] text-center">관리</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {result.length === 0 ? <tr><td colSpan="7" className="p-8 text-center text-slate-400">추천할 고객이 없습니다.</td></tr> :
                                    result.map((r, i) => (
                                        <tr key={i} className={`hover:bg-slate-50 transition-colors ${selectedIds.has(i) ? 'bg-rose-50/30' : ''}`}>
                                            <td className="py-3 px-4">
                                                <input
                                                    type="checkbox"
                                                    className="w-4 h-4 rounded border-slate-300 text-rose-600 focus:ring-rose-500"
                                                    checked={selectedIds.has(i)}
                                                    onChange={() => toggleSelect(i)}
                                                />
                                            </td>
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
                                                    <button onClick={() => openSmsModal(r, 'sms')} className="w-8 h-8 rounded bg-rose-50 text-rose-600 flex items-center justify-center hover:bg-rose-100 transition-colors shadow-sm" title="SMS">
                                                        <span className="material-symbols-rounded text-sm">sms</span>
                                                    </button>
                                                    <button onClick={() => openSmsModal(r, 'kakao')} className="w-8 h-8 rounded bg-yellow-100 text-yellow-800 flex items-center justify-center hover:bg-yellow-200 transition-colors shadow-sm" title="Kakao">
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

const TabBehavior = ({ isVisible, showAlert, toggleProcessing }) => {
    const [result, setResult] = useState(null);
    const [hasRun, setHasRun] = useState(false);

    const runAnalysis = async () => {
        if (!window.__TAURI__) return;
        toggleProcessing(true, 'AI가 최근 발생한 모든 로그를 대조하여 패턴을 읽고 있습니다...');
        try {
            await new Promise(r => setTimeout(r, 1200));
            const res = await window.__TAURI__.core.invoke('get_ai_behavior_strategy', {});
            setResult(res);
            setHasRun(true);
        } catch (e) {
            console.error(e);
            showAlert('분석 실패', e.toString());
        } finally {
            toggleProcessing(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="bg-white rounded-2xl p-6 border-l-[6px] border-teal-500 shadow-sm flex flex-col md:flex-row gap-6">
                <div className="shrink-0">
                    <div className="w-16 h-16 rounded-full bg-teal-50 border-2 border-teal-100 flex items-center justify-center">
                        <span className="material-symbols-rounded text-4xl text-teal-600 animate-pulse">analytics</span>
                    </div>
                </div>
                <div className="flex-1">
                    <h2 className="text-xl font-black text-slate-800 mb-1">로그 기반 AI 정밀 진단 (Enterprise)</h2>
                    <p className="text-sm text-slate-500 mb-4 leading-relaxed">
                        최근 발생한 고객 상태 변경, 등급 변동, 재고 조정 및 데이터 삭제 이력을 종합 분석합니다.<br />
                        단순한 통계를 넘어 시스템 전반의 핵심적인 변화와 리스크를 조기에 발견할 수 있습니다.
                    </p>
                    <button onClick={runAnalysis} className="px-6 py-2 bg-teal-600 text-white font-bold rounded-lg hover:bg-teal-700 transition-colors shadow-lg shadow-teal-200 flex items-center gap-2">
                        <span className="material-symbols-rounded">psychology_alt</span> AI 정밀 로그 분석 시작
                    </button>
                </div>
            </div>

            {hasRun && result && (
                <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
                    {/* Summary & Health */}
                    <div className="xl:col-span-2 space-y-6">
                        <div className="bg-white rounded-3xl p-8 border border-slate-100 shadow-sm relative overflow-hidden">
                            <div className="absolute top-0 right-0 p-8">
                                <div className="text-right">
                                    <div className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1">Business Health</div>
                                    <div className={`text-5xl font-black ${result.overall_health_score > 70 ? 'text-emerald-500' : result.overall_health_score > 40 ? 'text-amber-500' : 'text-rose-500'}`}>
                                        {result.overall_health_score}<span className="text-xl ml-1 text-slate-300">/ 100</span>
                                    </div>
                                </div>
                            </div>

                            <h3 className="text-2xl font-black text-slate-800 mb-6 flex items-center gap-3">
                                <span className="w-2 h-8 bg-teal-500 rounded-full"></span>
                                종합 진단 결과
                            </h3>
                            <p className="text-lg text-slate-600 leading-relaxed font-medium mb-8 pr-32">
                                {result.summary}
                            </p>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100 hover:border-teal-200 transition-colors">
                                    <div className="flex items-center gap-2 mb-3 text-teal-600">
                                        <span className="material-symbols-rounded">trending_up</span>
                                        <span className="font-black text-sm uppercase">Behavioral Trends</span>
                                    </div>
                                    <ul className="space-y-2">
                                        {result.behavioral_trends?.map((t, i) => (
                                            <li key={i} className="text-sm text-slate-600 flex gap-2">
                                                <span className="text-teal-400">•</span> {t}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                                <div className="p-5 bg-rose-50/30 rounded-2xl border border-rose-100 hover:border-rose-200 transition-colors">
                                    <div className="flex items-center gap-2 mb-3 text-rose-600">
                                        <span className="material-symbols-rounded">warning</span>
                                        <span className="font-black text-sm uppercase">Critical Signals</span>
                                    </div>
                                    <ul className="space-y-2">
                                        {result.warning_signals?.map((s, i) => (
                                            <li key={i} className="text-sm text-slate-600 flex gap-2">
                                                <span className="text-rose-400">•</span> {s}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Marketing Strategy */}
                    <div className="xl:col-span-1">
                        <div className="bg-slate-900 rounded-3xl p-8 text-white shadow-2xl shadow-slate-200 h-full flex flex-col">
                            <div className="w-14 h-14 bg-indigo-500 rounded-2xl flex items-center justify-center mb-6 shadow-lg shadow-indigo-500/30">
                                <span className="material-symbols-rounded text-white text-3xl">lightbulb</span>
                            </div>
                            <h3 className="text-xl font-black mb-4">AI 마케팅 전략 제안</h3>
                            <div className="flex-1 text-slate-300 leading-relaxed font-medium text-base whitespace-pre-wrap italic">
                                "{result.strategic_advice}"
                            </div>
                            <div className="mt-8 pt-6 border-t border-white/10 text-xs text-slate-500 font-bold flex items-center justify-between">
                                <span>Powered by Gemini 1.5 Pro</span>
                                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500"></span> Real-time Analysis</span>
                            </div>
                        </div>
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
                labels: (data || []).map(d => d.membership_level),
                datasets: [{
                    data: (data || []).map(d => d.total_amount),
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
                            {!data || data.length === 0 ? <tr><td colSpan="4" className="p-8 text-center text-slate-400">데이터 없음</td></tr> :
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

const CustomerSummaryModal = ({ customerId, onClose }) => {
    const [customer, setCustomer] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const load = async () => {
            if (!window.__TAURI__) {
                await new Promise(r => setTimeout(r, 500));
                setCustomer({
                    customer_name: '홍길동',
                    membership_level: 'VIP',
                    customer_id: customerId,
                    mobile_number: '010-1234-5678',
                    join_date: '2023-01-01',
                    address_primary: '서울시 강남구 테헤란로',
                    address_detail: '123번지',
                    zip_code: '06234',
                    memo: 'VIP 고객입니다. 특별 관리 요망.'
                });
                setLoading(false);
                return;
            }
            try {
                const c = await window.__TAURI__.core.invoke('get_customer', { customerId });
                setCustomer(c);
            } catch (e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [customerId]);

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="p-5 border-b border-slate-100 flex justify-between items-start bg-slate-50/50">
                    <h3 className="font-bold text-slate-800 text-lg">고객 상세 정보</h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 rounded-full p-1 hover:bg-slate-100 transition-colors">
                        <span className="material-symbols-rounded">close</span>
                    </button>
                </div>

                <div className="p-6">
                    {loading ? (
                        <div className="py-10 flex flex-col items-center justify-center text-slate-400 gap-3">
                            <span className="material-symbols-rounded animate-spin text-3xl text-indigo-500">sync</span>
                            <span className="text-xs font-bold">정보를 불러오는 중...</span>
                        </div>
                    ) : customer ? (
                        <div className="space-y-4">
                            <div className="flex items-center gap-4 pb-4 border-b border-slate-100">
                                <div className="w-14 h-14 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-black text-xl border-2 border-white shadow-sm">
                                    {customer.customer_name?.[0]}
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h4 className="font-black text-xl text-slate-800">{customer.customer_name}</h4>
                                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-600 border border-indigo-100">{customer.membership_level}</span>
                                    </div>
                                    <p className="text-sm text-slate-500 font-mono mt-0.5">ID: {customer.customer_id}</p>
                                </div>
                            </div>

                            <div className="space-y-3 text-sm">
                                <div className="flex gap-3">
                                    <span className="w-20 text-slate-400 font-bold shrink-0">연락처</span>
                                    <span className="text-slate-700 font-medium font-mono">{customer.mobile_number || '-'}</span>
                                </div>
                                <div className="flex gap-3">
                                    <span className="w-20 text-slate-400 font-bold shrink-0">가입일</span>
                                    <span className="text-slate-700 font-medium">{customer.join_date || '-'}</span>
                                </div>
                                <div className="flex gap-3">
                                    <span className="w-20 text-slate-400 font-bold shrink-0">주소</span>
                                    <div className="flex-1 text-slate-700 font-medium">
                                        {customer.zip_code && <span className="text-xs bg-slate-100 px-1.5 py-0.5 rounded text-slate-500 mr-1">{customer.zip_code}</span>}
                                        {customer.address_primary} {customer.address_detail}
                                    </div>
                                </div>
                                <div className="pt-2">
                                    <span className="text-xs font-bold text-slate-400 block mb-1">메모</span>
                                    <div className="bg-amber-50 rounded-lg p-3 text-amber-900 text-xs leading-relaxed border border-amber-100">
                                        {customer.memo || '기록된 메모가 없습니다.'}
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="text-center py-10 text-slate-400">정보를 찾을 수 없습니다.</div>
                    )}
                </div>

                <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end">
                    <button onClick={onClose} className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-bold shadow-sm shadow-indigo-200 transition-colors">확인</button>
                </div>
            </div>
        </div>
    );
};

const SmsSendModal = ({ customers, mode: initialMode, onClose, showAlert }) => {
    const [mode, setMode] = useState(initialMode); // 'sms' | 'kakao'
    const [message, setMessage] = useState('');
    const [isSending, setIsSending] = useState(false);
    const [showTemplates, setShowTemplates] = useState(false);

    const isBatch = customers.length > 1;
    const firstCustomer = customers[0];

    // Templates with placeholders
    const templates = [
        { id: 1, label: '감사 인사 (기본)', content: `[고객명]님, 이용해 주셔서 감사합니다. 더 좋은 서비스로 보답하겠습니다.` },
        { id: 2, label: '생일 축하', content: `[고객명]님, 생일을 진심으로 축하드립니다! 🎉 행복한 하루 되세요.` },
        { id: 3, label: '신상품 입고', content: `[고객명]님, 기다리시던 신상품이 입고되었습니다. 매장에 들러 확인해보세요!` },
        { id: 4, label: '휴면 고객 케어', content: `[고객명]님, 오랫동안 뵙지 못해 그립습니다. 방문해주시면 작은 선물을 드릴게요.` },
    ];

    // Initial message set
    useEffect(() => {
        if (customers.length === 0) return;
        if (!message) {
            setDefaultMessage(mode);
        }
    }, [customers]);

    const setDefaultMessage = (m) => {
        if (m === 'kakao') {
            setMessage(`[고객명]님 안녕하세요.\n저희 매장을 이용해 주셔서 진심으로 감사드립니다.\n\n(내용을 입력하세요)`);
        } else {
            setMessage(`[고객명]님 감사합니다. (내용 입력)`);
        }
    };

    const handleSend = async () => {
        if (!message.trim()) return showAlert('입력 오류', '메시지 내용을 입력해주세요.');

        setIsSending(true);
        // Simulate progress per recipient if batch
        const delay = isBatch ? 2000 : 1000;
        await new Promise(r => setTimeout(r, delay));

        if (window.__TAURI__) {
            // Logic for internal processing would go here
            // Each name is replaced: message.replace(/\[고객명\]/g, customer.name)
        }

        setIsSending(false);
        const targetDesc = isBatch ? `${customers.length}명의 고객에게` : '고객님께';
        showAlert('발송 완료', `${targetDesc} ${mode === 'kakao' ? '알림톡' : '문자'}이 전송되었습니다.`, 'success');
        onClose();
    };

    const applyTemplate = (content) => {
        setMessage(content);
        setShowTemplates(false);
    };

    return (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl w-full max-w-4xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex h-[700px] max-h-[90vh]">

                {/* Left Side: Message Editor */}
                <div className="flex-1 flex flex-col min-w-0 bg-white">
                    {/* Header */}
                    <div className="p-5 border-b border-slate-100 flex justify-between items-center shrink-0">
                        <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-xl ${mode === 'kakao' ? 'bg-yellow-100 text-yellow-800' : 'bg-indigo-100 text-indigo-600'}`}>
                                <span className="material-symbols-rounded text-xl">{mode === 'kakao' ? 'chat' : 'sms'}</span>
                            </div>
                            <h3 className="font-bold text-lg text-slate-800">{isBatch ? '단체 메시지 발송' : '메시지 전송'}</h3>
                        </div>
                        <button onClick={onClose} className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors">
                            <span className="material-symbols-rounded">close</span>
                        </button>
                    </div>

                    {/* Usage Guide Banner */}
                    <div className="px-6 py-3 bg-indigo-600 text-white flex items-center justify-between shrink-0">
                        <div className="flex items-center gap-3">
                            <span className="material-symbols-rounded animate-pulse">info</span>
                            <div className="text-xs leading-relaxed">
                                <span className="font-black underline decoration-white/50 underline-offset-2 text-[13px] mr-2">사용 팁</span>
                                본문에 <span className="bg-white/20 px-1.5 py-0.5 rounded font-black text-white ml-0.5 mr-0.5">[고객명]</span> 이라고 입력하면, 발송 시 각 고객의 성함으로 자동 변경됩니다.
                            </div>
                        </div>
                        <div className="text-[10px] font-bold py-1 px-2 bg-white/20 rounded uppercase tracking-tighter">smart logic</div>
                    </div>

                    {/* Mode Tabs */}
                    <div className="px-6 pt-5">
                        <div className="bg-slate-100 p-1 rounded-xl flex font-bold text-sm">
                            <button
                                onClick={() => { setMode('sms'); if (!message) setDefaultMessage('sms'); }}
                                className={`flex-1 py-2 rounded-lg flex items-center justify-center gap-2 transition-all ${mode === 'sms' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                <span className="material-symbols-rounded text-lg">sms</span> 문자 메시지
                            </button>
                            <button
                                onClick={() => { setMode('kakao'); if (!message) setDefaultMessage('kakao'); }}
                                className={`flex-1 py-2 rounded-lg flex items-center justify-center gap-2 transition-all ${mode === 'kakao' ? 'bg-yellow-400 text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                <span className="material-symbols-rounded text-lg">chat</span> 카카오 알림톡
                            </button>
                        </div>
                    </div>

                    <div className="p-6 flex-1 overflow-y-auto flex flex-col">
                        {/* Recipient Info */}
                        <div className={`mb-6 rounded-xl p-4 border flex items-center justify-between transition-colors ${isBatch ? 'bg-indigo-50 border-indigo-100 shadow-sm shadow-indigo-100/50' : 'bg-slate-50 border-slate-200'}`}>
                            <div className="flex items-center gap-3">
                                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${isBatch ? 'bg-indigo-600 text-white shadow-inner' : 'bg-white border border-slate-200 text-slate-400'}`}>
                                    <span className="material-symbols-rounded">{isBatch ? 'groups' : 'person'}</span>
                                </div>
                                <div>
                                    <div className="text-xs font-bold text-slate-400 uppercase tracking-widest">{isBatch ? 'Recipient Group' : 'Recipient'}</div>
                                    <div className="font-bold text-slate-700 flex items-center gap-2">
                                        {isBatch ? (
                                            <span className="text-indigo-600 font-black">총 {customers.length}명 대량 발송</span>
                                        ) : (
                                            <>
                                                <span className="text-slate-800">{firstCustomer?.customer_name}</span>
                                                <span className="text-slate-400 font-normal font-mono text-sm">{firstCustomer?.mobile_number}</span>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>
                            <div className="flex flex-col items-end gap-1">
                                <div className="text-[10px] font-black px-2 py-0.5 rounded bg-white border border-slate-200 text-slate-500 uppercase tracking-tighter">
                                    {mode === 'kakao' ? 'KakaoTalk' : 'SMS/LMS'}
                                </div>
                                {isBatch && <span className="text-[10px] font-bold text-rose-500 animate-pulse flex items-center gap-1"><span className="w-1.5 h-1.5 bg-rose-500 rounded-full"></span> LIVE BATCH MODE</span>}
                            </div>
                        </div>

                        {/* Editor */}
                        <div className="flex-1 flex flex-col">
                            <div className="flex justify-between items-end mb-2">
                                <label className="text-sm font-black text-slate-700 flex items-center gap-2">
                                    <span className="w-1 h-3.5 bg-indigo-600 rounded-full"></span>
                                    메시지 본문 작성
                                </label>
                                <button onClick={() => setShowTemplates(!showTemplates)} className="text-xs font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 transition-colors border border-indigo-100 shadow-sm">
                                    <span className="material-symbols-rounded text-sm">auto_stories</span>
                                    {showTemplates ? '템플릿 닫기' : '템플릿 불러오기'}
                                </button>
                            </div>
                            <div className={`relative flex-1 rounded-2xl border transition-all flex flex-col shadow-inner
                                ${mode === 'kakao' ? 'bg-yellow-50/20 border-yellow-200 focus-within:border-yellow-400 focus-within:ring-4 focus-within:ring-yellow-400/10' : 'bg-white border-slate-300 focus-within:border-indigo-500 focus-within:ring-4 focus-within:ring-indigo-500/10'}
                            `}>
                                <textarea
                                    value={message}
                                    onChange={e => setMessage(e.target.value)}
                                    className="w-full h-full p-6 bg-transparent border-none outline-none resize-none font-sans text-slate-700 leading-relaxed text-[16px] custom-scrollbar placeholder:text-slate-300"
                                    placeholder="여기에 발송할 내용을 입력하세요.&#10;[고객명] 을 입력하면 이름이 자동으로 바뀝니다."
                                ></textarea>

                                {/* Bottom Info Panel inside editor */}
                                <div className="p-3 border-t border-black/5 flex justify-between items-center bg-slate-50/80 rounded-b-xl backdrop-blur-sm">
                                    <div className="flex items-center gap-4">
                                        <div className={`text-[11px] font-bold px-2 py-1 rounded flex items-center gap-1.5 ${message.length > 80 ? 'bg-amber-100 text-amber-700' : 'bg-indigo-50 text-indigo-600'}`}>
                                            <span className="material-symbols-rounded text-sm">equalizer</span>
                                            {new Blob([message]).size} BYTES
                                            {message.length > 80 && mode === 'sms' && <span className="ml-1 opacity-70 underline decoration-amber-300">LMS 전환</span>}
                                        </div>
                                        <div className="text-[11px] font-bold text-slate-400 flex items-center gap-1">
                                            <span className="material-symbols-rounded text-sm">person_pin</span>
                                            치환자 사용됨: {message.includes('[고객명]') ? 'YES (활성)' : 'NO (일반)'}
                                        </div>
                                    </div>
                                    <button onClick={() => setMessage('')} className="text-[11px] text-slate-400 hover:text-rose-500 font-bold flex items-center gap-1 transition-colors">
                                        <span className="material-symbols-rounded text-sm">delete_sweep</span> 전역 초기화
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="p-5 border-t border-slate-100 flex justify-end gap-3 bg-slate-50/50">
                        <button onClick={onClose} className="px-6 py-3 bg-white border border-slate-300 text-slate-600 rounded-xl font-bold hover:bg-slate-50 transition-colors shadow-sm text-sm">
                            닫기
                        </button>
                        <button
                            onClick={handleSend}
                            disabled={isSending}
                            className={`px-8 py-3 rounded-xl font-black text-sm text-white shadow-xl transition-all flex items-center gap-3
                                ${isSending ? 'opacity-70 cursor-wait' : 'hover:scale-[1.02] active:scale-95'}
                                ${mode === 'kakao' ? 'bg-[#FAE100] hover:bg-[#FDD835] text-[#371D1E] shadow-yellow-200' : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-200'}
                            `}
                        >
                            {isSending ? <span className="material-symbols-rounded animate-spin">progress_activity</span> : <span className="material-symbols-rounded">rocket_launch</span>}
                            {isSending ? '작업 중...' : `${mode === 'kakao' ? '카카오 알림톡' : '문자 메시지'} ${isBatch ? '단체 ' : ''}발송 시작`}
                        </button>
                    </div>
                </div>

                {/* Right Side: Templates (Conditional) */}
                <div className={`${showTemplates ? 'w-80 border-l border-slate-200' : 'w-0'} bg-slate-50 transition-all duration-300 ease-in-out overflow-hidden flex flex-col`}>
                    <div className="p-5 border-b border-slate-200 bg-white">
                        <h4 className="font-black text-slate-700 flex items-center gap-2 text-sm">
                            <span className="material-symbols-rounded text-indigo-500">auto_awesome</span>
                            스마트 템플릿
                        </h4>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                        <div className="p-3 bg-amber-50 rounded-xl border border-amber-100 text-[11px] text-amber-800 font-bold mb-4">
                            템플릿을 클릭하면 본문에 즉시 적용됩니다. [고객명] 치환자가 이미 포함되어 있습니다.
                        </div>
                        {templates.map(t => (
                            <button
                                key={t.id}
                                onClick={() => applyTemplate(t.content)}
                                className="w-full text-left bg-white p-4 rounded-xl border border-slate-200 hover:border-indigo-400 hover:shadow-lg transition-all group relative overflow-hidden"
                            >
                                <div className="absolute top-0 right-0 p-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <span className="material-symbols-rounded text-indigo-400 text-sm">add_circle</span>
                                </div>
                                <div className="font-black text-slate-800 text-xs mb-1.5 group-hover:text-indigo-600">{t.label}</div>
                                <div className="text-[11px] text-slate-400 line-clamp-3 leading-relaxed font-medium">{t.content}</div>
                            </button>
                        ))}
                    </div>
                    <div className="p-4 border-t border-slate-200 bg-white">
                        <button className="w-full py-3 rounded-xl border-2 border-dashed border-slate-300 text-slate-500 font-black text-xs hover:bg-indigo-50 hover:border-indigo-300 hover:text-indigo-600 transition-all flex items-center justify-center gap-2">
                            <span className="material-symbols-rounded text-lg">edit_note</span> 템플릿 커스텀 설정
                        </button>
                    </div>
                </div>

            </div>
        </div>
    );
};

const BatchMemoModal = ({ customers, onClose, showAlert, onSuccess }) => {
    const [memo, setMemo] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [append, setAppend] = useState(true);

    const handleSubmit = async () => {
        if (!memo.trim()) return showAlert('알림', '메모 내용을 입력해 주세요.');
        if (!window.__TAURI__) return;

        setIsSubmitting(true);
        try {
            const customerIds = customers.map(c => c.customer_id);
            await window.__TAURI__.core.invoke('update_customer_memo_batch', {
                customerIds,
                newMemo: memo.trim(),
                append
            });
            showAlert('완료', `${customers.length}명의 고객 메모를 일괄 처리했습니다.`, 'success');
            onSuccess && onSuccess();
            onClose();
        } catch (e) {
            console.error(e);
            showAlert('오류', '메모 일괄 등록 실패: ' + e);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[150] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-300">
            <div className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 slide-in-from-bottom-8 duration-500">
                <div className="px-8 pt-8 pb-4 flex justify-between items-start">
                    <div>
                        <h3 className="text-2xl font-black text-slate-800 flex items-center gap-3">
                            <span className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                                <span className="material-symbols-rounded">edit_note</span>
                            </span>
                            고객 메모 일괄 등록
                        </h3>
                        <p className="text-sm text-slate-500 mt-2 font-medium">선택한 <span className="text-indigo-600 font-black">{customers.length}명</span>의 고객 카드에 공통 메모를 남깁니다.</p>
                    </div>
                    <button onClick={onClose} className="w-10 h-10 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-100 transition-colors">
                        <span className="material-symbols-rounded">close</span>
                    </button>
                </div>

                <div className="p-8 space-y-6">
                    <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
                        <div className="flex items-center gap-1.5 mb-3">
                            <span className="material-symbols-rounded text-base text-indigo-500">groups</span>
                            <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Targets</span>
                        </div>
                        <div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto custom-scrollbar pr-2">
                            {customers.map(c => (
                                <span key={c.customer_id} className="px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-600">
                                    {c.customer_name}
                                </span>
                            ))}
                        </div>
                    </div>

                    <div className="space-y-3">
                        <label className="text-sm font-black text-slate-700 flex items-center gap-2">
                            <span className="w-1 h-3.5 bg-indigo-600 rounded-full"></span>
                            메모 내용
                        </label>
                        <textarea
                            value={memo}
                            onChange={e => setMemo(e.target.value)}
                            className="w-full h-40 p-5 rounded-3xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all resize-none shadow-inner text-slate-700 leading-relaxed font-medium"
                            placeholder="예: [이탈위험] 특별 관리 대상 / 판촉 행사 안내 필요"
                        ></textarea>
                    </div>

                    <div className="flex items-center justify-between p-4 bg-indigo-50/50 rounded-2xl border border-indigo-100">
                        <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${append ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-400'}`}>
                                <span className="material-symbols-rounded">{append ? 'add_to_photos' : 'edit_square'}</span>
                            </div>
                            <div>
                                <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Update Mode</div>
                                <div className="text-sm font-black text-slate-700">{append ? '기존 메모에 추가' : '기존 메모 덮어쓰기'}</div>
                            </div>
                        </div>
                        <button
                            onClick={() => setAppend(!append)}
                            className={`px-4 py-2 rounded-xl text-xs font-black border transition-all ${append ? 'border-indigo-200 bg-white text-indigo-600 hover:bg-indigo-50' : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'}`}
                        >
                            모드 전환
                        </button>
                    </div>
                </div>

                <div className="p-8 border-t border-slate-100 flex gap-3 bg-slate-50/50">
                    <button onClick={onClose} className="flex-1 py-4 rounded-2xl bg-white border border-slate-300 text-slate-600 font-bold hover:bg-slate-50 transition-all text-sm">
                        취소
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={isSubmitting || !memo.trim()}
                        className="flex-[2] py-4 rounded-2xl bg-indigo-600 text-white font-black hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-xl shadow-indigo-100 text-sm flex items-center justify-center gap-2"
                    >
                        {isSubmitting ? <span className="material-symbols-rounded animate-spin">progress_activity</span> : <span className="material-symbols-rounded">save</span>}
                        {isSubmitting ? '처리 중...' : '메모 등록 완료'}
                    </button>
                </div>
            </div>
        </div>
    );
};

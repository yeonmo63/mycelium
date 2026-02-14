import React, { useState, useEffect } from 'react';
import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import { appDataDir, join } from '@tauri-apps/api/path';
import { save } from '@tauri-apps/plugin-dialog';
import { useModal } from '../../contexts/ModalContext';
import {
    LayoutDashboard,
    Warehouse,
    FlaskConical,
    History,
    Boxes,
    Search,
    Filter,
    Calendar,
    ChevronRight,
    ClipboardList,
    AlertCircle,
    Thermometer,
    Droplets,
    User,
    CheckCircle2,
    Clock,
    Activity,
    Eye,
    Download
} from 'lucide-react';
import dayjs from 'dayjs';

// --- Sub-components ---
import ProductionSpaces from './components/ProductionSpaces';
import ProductionBatches from './components/ProductionBatches';
import ProductionLogs from './components/ProductionLogs';
import HarvestRecords from './components/HarvestRecords';
import FarmingReportView from './components/FarmingReportView';


const ProductionManager = ({ initialTab = 'dashboard' }) => {
    const [activeTab, setActiveTab] = useState(initialTab);
    const { showAlert, showConfirm } = useModal();
    const [isPreviewOpen, setIsPreviewOpen] = useState(false);
    const [stats, setStats] = useState({
        activeBatches: 0,
        todayLogs: 0,
        harvestThisMonth: 0,
        monthlyYield: 0,
        pendingActions: 0
    });
    const [recentLogs, setRecentLogs] = useState([]);
    const [spaces, setSpaces] = useState([]);

    const [isGenerating, setIsGenerating] = useState(false);

    const [includeAttachments, setIncludeAttachments] = useState(true);
    const [includeApproval, setIncludeApproval] = useState(true);
    const [reportType, setReportType] = useState('all'); // 'all', 'chemical', 'sanitation', 'harvest', 'education'
    const [reportPeriod, setReportPeriod] = useState({
        start: dayjs().startOf('month').format('YYYY-MM-DD'),
        end: dayjs().endOf('month').format('YYYY-MM-DD')
    });

    const loadDashboardData = async () => {
        try {
            const [batches, logs, harvests, spacesData] = await Promise.all([
                invoke('get_production_batches'),
                invoke('get_farming_logs', {
                    batchId: null,
                    spaceId: null,
                    startDate: null,
                    endDate: null
                }),
                invoke('get_harvest_records', { batchId: null }),
                invoke('get_production_spaces')
            ]);

            setSpaces(spacesData);
            setRecentLogs(logs.slice(0, 5));

            const today = dayjs().format('YYYY-MM-DD');
            const thisMonth = dayjs().format('YYYY-MM');

            const monthlyHarvests = harvests.filter(h => h.harvest_date.startsWith(thisMonth));
            const totalGood = monthlyHarvests.reduce((sum, h) => sum + (parseFloat(h.quantity) || 0), 0);
            const totalDefective = monthlyHarvests.reduce((sum, h) => sum + (parseFloat(h.defective_quantity) || 0), 0);
            const totalLoss = monthlyHarvests.reduce((sum, h) => sum + (parseFloat(h.loss_quantity) || 0), 0);
            const totalProduction = totalGood + totalDefective + totalLoss;

            setStats({
                activeBatches: batches.filter(b => b.status === 'active' || b.status === 'growing').length,
                todayLogs: logs.filter(l => l.log_date === today).length,
                harvestThisMonth: totalGood,
                monthlyYield: totalProduction > 0 ? ((totalGood / totalProduction) * 100).toFixed(1) : 100,
                pendingActions: batches.filter(b => b.status === 'growing' && dayjs(b.expected_harvest_date).isBefore(dayjs().add(2, 'day'))).length
            });
        } catch (err) {
            console.error("Dashboard data load failed:", err);
        }
    };

    useEffect(() => {
        setActiveTab(initialTab);
    }, [initialTab]);

    useEffect(() => {
        if (activeTab === 'dashboard') {
            loadDashboardData();
        }
    }, [activeTab]);

    const tabs = [
        { id: 'dashboard', label: '생산 현황판', icon: LayoutDashboard },
        { id: 'spaces', label: '시설/필지 관리', icon: Warehouse },
        { id: 'batches', label: '배치/작업실 관리', icon: FlaskConical },
        { id: 'logs', label: '영농일지(GAP/HACCP)', icon: History },
        { id: 'harvest', label: '수확 및 이력 관리', icon: Boxes },
    ];

    const renderContent = () => {
        switch (activeTab) {
            case 'spaces': return <ProductionSpaces />;
            case 'batches': return <ProductionBatches />;
            case 'logs': return <ProductionLogs />;
            case 'harvest': return <HarvestRecords />;
            default: return <ProductionDashboard stats={stats} recentLogs={recentLogs} spaces={spaces} />;
        }
    };

    return (
        <div className="flex flex-col h-full bg-slate-50/50">
            {/* Header / Navigation Bar */}
            <div className="bg-white border-b border-slate-200 px-8 pt-2 shadow-sm relative z-10">
                {/* Line 1: Title */}
                <div className="flex justify-between items-baseline mb-1">
                    <div className="flex items-center gap-3">
                        <div className="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center shadow-lg shadow-indigo-100">
                            <Activity size={16} />
                        </div>
                        <h1 className="text-lg font-black text-slate-800 tracking-tight">GAP/HACCP 인증센터</h1>
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest opacity-60">Certification Management System</p>
                    </div>
                </div>

                {/* Line 2: Controls (Aligned Right) */}
                <div className="flex justify-end items-center gap-3 mb-1">
                    <div className="flex items-center gap-2 px-3 py-1 bg-slate-50 rounded-xl border border-slate-100">
                        <Calendar size={12} className="text-slate-400" />
                        <input
                            type="date"
                            value={reportPeriod.start}
                            onChange={e => setReportPeriod(prev => ({ ...prev, start: e.target.value }))}
                            className="bg-transparent border-none text-[11px] font-black text-slate-600 focus:ring-0 p-0 w-36"
                        />
                        <span className="text-slate-300 font-bold text-[10px]">~</span>
                        <input
                            type="date"
                            value={reportPeriod.end}
                            onChange={e => setReportPeriod(prev => ({ ...prev, end: e.target.value }))}
                            className="bg-transparent border-none text-[11px] font-black text-slate-600 focus:ring-0 p-0 w-36"
                        />
                    </div>

                    <div className="flex items-center gap-3 ml-2">
                        <label className="flex items-center gap-2 cursor-pointer group">
                            <input
                                type="checkbox"
                                checked={includeAttachments}
                                onChange={e => setIncludeAttachments(e.target.checked)}
                                className="w-3 h-3 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                            />
                            <span className="text-[10px] font-black text-slate-500 group-hover:text-indigo-600 transition-colors uppercase tracking-wider whitespace-nowrap">첨부</span>
                        </label>

                        <label className="flex items-center gap-2 cursor-pointer group">
                            <input
                                type="checkbox"
                                checked={includeApproval}
                                onChange={e => setIncludeApproval(e.target.checked)}
                                className="w-3 h-3 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                            />
                            <span className="text-[10px] font-black text-slate-500 group-hover:text-indigo-600 transition-colors uppercase tracking-wider whitespace-nowrap">결재란</span>
                        </label>
                    </div>

                    <div className="h-5 w-px bg-slate-200 mx-1" />

                    <div className="flex items-center gap-2">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider whitespace-nowrap">양식</span>
                        <select
                            value={reportType}
                            onChange={e => setReportType(e.target.value)}
                            className="bg-slate-50 border-slate-200 text-[11px] font-black text-slate-700 rounded-xl focus:ring-indigo-500 py-0.5 min-w-[130px]"
                        >
                            <option value="all">통합 영농일지</option>
                            <option value="chemical">농약 및 시비 기록부</option>
                            <option value="sanitation">위생 및 점검표</option>
                            <option value="harvest">수확 및 생산 대장</option>
                            <option value="education">교육 훈련 기록부</option>
                        </select>
                    </div>

                    <button
                        onClick={() => setIsPreviewOpen(true)}
                        className="px-4 py-1.5 rounded-xl font-black text-[11px] bg-indigo-600 text-white hover:bg-indigo-700 shadow-lg shadow-indigo-100 transition-all flex items-center gap-2"
                    >
                        <Eye size={14} /> 리포트 미리보기
                    </button>
                </div>

                {/* Line 3: Tabs */}
                <div className="flex gap-1">
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`
                                flex items-center gap-2 px-5 py-1.5 rounded-t-lg font-bold text-xs transition-all
                                ${activeTab === tab.id
                                    ? 'bg-slate-50 text-indigo-600 border-t-2 border-indigo-600 -mb-[1px]'
                                    : 'text-slate-400 hover:bg-slate-50 hover:text-slate-600'}
                            `}
                        >
                            <tab.icon size={14} />
                            {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                {renderContent()}
            </div>

            {/* Global Generation Spinner */}
            {isGenerating && (
                <div className="fixed inset-0 z-[999999] bg-slate-900/60 backdrop-blur-sm flex flex-col items-center justify-center animate-in fade-in duration-300">
                    <div className="bg-white p-10 rounded-[3rem] shadow-2xl flex flex-col items-center gap-6">
                        <div className="relative">
                            <div className="w-20 h-20 border-4 border-indigo-100 rounded-full"></div>
                            <div className="absolute top-0 left-0 w-20 h-20 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                        </div>
                        <div className="text-center">
                            <h3 className="text-xl font-black text-slate-800 mb-1">리포트 생성 중...</h3>
                            <p className="text-xs font-bold text-slate-400 px-4">
                                방대한 데이터를 분석하고 고화질 증빙 사진을 결합하고 있습니다.<br />
                                잠시만 기다려 주세요.
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* Farming Report Preview Modal */}
            {isPreviewOpen && (
                <FarmingReportView
                    startDate={reportPeriod.start}
                    endDate={reportPeriod.end}
                    includeAttachments={includeAttachments}
                    includeApproval={includeApproval}
                    reportType={reportType}
                    onClose={() => setIsPreviewOpen(false)}
                />
            )}
        </div>
    );
};

const ProductionDashboard = ({ stats, recentLogs = [], spaces = [] }) => {
    const workTypes = {
        plant: { label: '식재/종균접종', color: 'emerald' },
        water: { label: '관수/영양제', color: 'blue' },
        fertilize: { label: '비료/시비', color: 'purple' },
        pesticide: { label: '방제/약제', color: 'red' },
        harvest: { label: '수확/채취', color: 'teal' },
        process: { label: '가공/포장', color: 'indigo' },
        clean: { label: '청소/소독', color: 'indigo' },
        inspect: { label: '점검/예찰', color: 'amber' },
        education: { label: '교육/훈련', color: 'slate' },
    };

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* Quick Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                {[
                    { label: '활성 배치', value: `${stats.activeBatches}개`, icon: FlaskConical, color: 'blue' },
                    { label: '금일 작성 일지', value: `${stats.todayLogs}건`, icon: ClipboardList, color: 'indigo' },
                    { label: '이달의 수율', value: `${stats.monthlyYield}% (${stats.harvestThisMonth}kg)`, icon: Boxes, color: 'teal' },
                    { label: '임박한 작업', value: `${stats.pendingActions}건`, icon: AlertCircle, color: 'amber' },
                ].map((item, i) => (
                    <div key={i} className="bg-white p-6 rounded-[2rem] shadow-xl shadow-slate-200/50 border border-slate-100 flex items-center gap-5">
                        <div className={`w-14 h-14 rounded-2xl bg-${item.color}-50 text-${item.color}-600 flex items-center justify-center`}>
                            <item.icon size={28} />
                        </div>
                        <div>
                            <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-1">{item.label}</p>
                            <p className="text-2xl font-black text-slate-700">{item.value}</p>
                        </div>
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Recent Logs Section */}
                <div className="lg:col-span-2 bg-white rounded-[2.5rem] shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden">
                    <div className="p-8 border-b border-slate-50 flex justify-between items-center">
                        <h3 className="text-lg font-black text-slate-700 flex items-center gap-2">
                            <History className="text-indigo-500" size={20} /> 최근 영농일지 내역
                        </h3>
                    </div>
                    <div className="divide-y divide-slate-50">
                        {recentLogs.map(log => {
                            const space = spaces.find(s => s.space_id === log.space_id);
                            const workType = workTypes[log.work_type] || workTypes.plant;
                            return (
                                <div key={log.log_id} className="p-6 flex items-start gap-4 hover:bg-slate-50/80 transition-colors">
                                    <div className="w-12 h-12 rounded-xl bg-slate-100 flex flex-col items-center justify-center shrink-0">
                                        <span className="text-[10px] font-black text-slate-400 uppercase">{dayjs(log.log_date).format('MMM')}</span>
                                        <span className="text-lg font-black text-slate-700 mt-[-4px]">{dayjs(log.log_date).format('DD')}</span>
                                    </div>
                                    <div className="flex-1">
                                        <div className="flex justify-between mb-1">
                                            <h4 className="font-bold text-slate-700 text-sm">{workType.label}</h4>
                                            <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-600 text-[10px] font-bold">{space?.space_name || '시설 미정'}</span>
                                        </div>
                                        <p className="text-xs text-slate-500 line-clamp-1">{log.work_content}</p>
                                        <div className="flex items-center gap-3 mt-2 text-[10px] font-bold text-slate-400">
                                            <span className="flex items-center gap-1"><User size={10} /> {log.worker_name}</span>
                                            {log.env_data?.temp && <span className="flex items-center gap-1"><Thermometer size={10} /> {log.env_data.temp}°C</span>}
                                            {log.env_data?.humidity && <span className="flex items-center gap-1"><Droplets size={10} /> {log.env_data.humidity}%</span>}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                        {recentLogs.length === 0 && (
                            <div className="p-20 text-center">
                                <p className="text-slate-400 font-bold">최근 작성된 일지가 없습니다.</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Status List / Alerts */}
                <div className="space-y-6">
                    <div className="bg-slate-900 rounded-[2.5rem] p-8 text-white shadow-2xl shadow-slate-900/30 relative overflow-hidden">
                        <div className="absolute top-[-10%] right-[-10%] w-32 h-32 bg-indigo-500/20 blur-3xl rounded-full"></div>
                        <h3 className="text-lg font-black mb-6 flex items-center gap-2">
                            <Calendar size={20} className="text-indigo-400" /> 공지 및 알림
                        </h3>
                        <div className="space-y-5">
                            <div className="flex gap-4">
                                <div className="w-1 h-12 rounded-full bg-teal-500"></div>
                                <div>
                                    <p className="text-[10px] font-black text-teal-400 uppercase tracking-widest">시스템</p>
                                    <p className="font-bold text-sm">GAP/HACCP 연동 완료</p>
                                </div>
                            </div>
                            <div className="flex gap-4">
                                <div className="w-1 h-12 rounded-full bg-amber-500"></div>
                                <div>
                                    <p className="text-[10px] font-black text-amber-400 uppercase tracking-widest">알림</p>
                                    <p className="font-bold text-sm">오늘 작성할 일지가 {stats.todayLogs === 0 ? '있습니다' : '완료되었습니다'}</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white rounded-[2.5rem] p-8 shadow-xl shadow-slate-200/50 border border-slate-100">
                        <h3 className="text-lg font-black text-slate-700 mb-6 flex items-center gap-2">
                            <Activity size={20} className="text-teal-500" /> 공정 현황 (HACCP)
                        </h3>
                        <div className="space-y-4">
                            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
                                <div className="flex justify-between items-center mb-2">
                                    <span className="text-[11px] font-black text-slate-500">모니터링 상태</span>
                                    <span className="text-[11px] font-black text-teal-600">정상 작동 중</span>
                                </div>
                                <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                                    <div className="bg-teal-500 h-full w-[100%]"></div>
                                </div>
                            </div>
                            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
                                <div className="flex justify-between items-center mb-2">
                                    <span className="text-[11px] font-black text-slate-500">데이터 정합성</span>
                                    <span className="text-[11px] font-black text-indigo-600">최적</span>
                                </div>
                                <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                                    <div className="bg-indigo-500 h-full w-[100%]"></div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ProductionManager;

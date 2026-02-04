import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useModal } from '../../contexts/ModalContext';
import {
    LayoutDashboard,
    Warehouse,
    FlaskConical,
    History,
    Boxes,
    Plus,
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
    Activity
} from 'lucide-react';
import dayjs from 'dayjs';

// --- Sub-components (could be moved to separate files later) ---
import ProductionSpaces from './components/ProductionSpaces';
import ProductionBatches from './components/ProductionBatches';
import ProductionLogs from './components/ProductionLogs';
import HarvestRecords from './components/HarvestRecords';
import GapReportView from './components/GapReportView';

const ProductionManager = ({ initialTab = 'dashboard' }) => {
    const [activeTab, setActiveTab] = useState(initialTab);
    const { showAlert, showConfirm } = useModal();
    const [stats, setStats] = useState({
        activeBatches: 0,
        todayLogs: 0,
        harvestThisMonth: 0,
        pendingActions: 0
    });
    const [recentLogs, setRecentLogs] = useState([]);
    const [spaces, setSpaces] = useState([]);
    const [reportData, setReportData] = useState({ logs: [], company: {} });

    const loadDashboardData = async () => {
        try {
            const [batches, logs, harvests, spacesData] = await Promise.all([
                invoke('get_production_batches'),
                invoke('get_farming_logs', { batchId: null, spaceId: null }),
                invoke('get_harvest_records', { batchId: null }),
                invoke('get_production_spaces')
            ]);

            setSpaces(spacesData);
            setRecentLogs(logs.slice(0, 5));

            const today = dayjs().format('YYYY-MM-DD');
            const thisMonth = dayjs().format('YYYY-MM');

            setStats({
                activeBatches: batches.filter(b => b.status === 'active' || b.status === 'growing').length,
                todayLogs: logs.filter(l => l.log_date === today).length,
                harvestThisMonth: harvests
                    .filter(h => h.harvest_date.startsWith(thisMonth))
                    .reduce((sum, h) => sum + (parseFloat(h.quantity) || 0), 0),
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
            <div className="bg-white border-b border-slate-200 px-8 py-4 shadow-sm relative z-10">
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <h1 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-lg shadow-indigo-100">
                                <Activity size={24} />
                            </div>
                            생산 및 현장 관리
                        </h1>
                        <p className="text-xs font-bold text-slate-400 mt-1 ml-13 uppercase tracking-widest">
                            General Production & GAP/HACCP Management System
                        </p>
                    </div>

                    <div className="flex gap-3">
                        <button
                            onClick={async () => {
                                try {
                                    // Fetch data for report
                                    const logs = await invoke('get_farming_logs', { batchId: null, spaceId: null });
                                    const company = await invoke('get_company_info');
                                    setReportData({ logs, company: company || {} });

                                    const confirmed = await showConfirm(
                                        "GAP/HACCP 리포트 출력",
                                        `${logs.length}건의 데이터를 기반으로 심사용 PDF 리포트를 생성했습니다. 출력하시겠습니까?`
                                    );

                                    if (confirmed) {
                                        setTimeout(() => window.print(), 500);
                                    }
                                } catch (err) {
                                    showAlert("오류", "일지 데이터를 불러오는데 실패했습니다.");
                                }
                            }}
                            className="bg-white border-2 border-slate-200 text-slate-700 px-5 py-2.5 rounded-2xl font-black text-sm hover:border-indigo-600 hover:text-indigo-600 transition-all flex items-center gap-2 shadow-sm"
                        >
                            <History size={18} />
                            GAP/HACCP 리포트 출력
                        </button>
                    </div>
                </div>

                <div className="flex gap-2">
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`
                                flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all
                                ${activeTab === tab.id
                                    ? 'bg-slate-900 text-white shadow-lg shadow-slate-200 translate-y-[-2px]'
                                    : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'}
                            `}
                        >
                            <tab.icon size={18} />
                            {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                {renderContent()}
            </div>

            {/* Hidden Print View */}
            <GapReportView logs={reportData.logs} companyInfo={reportData.company} />
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
                    { label: '이달의 수확량', value: `${stats.harvestThisMonth.toLocaleString()}kg`, icon: Boxes, color: 'teal' },
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

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { invoke } from '@tauri-apps/api/core';
import { useModal } from '../../contexts/ModalContext';
import { useAdminGuard } from '../../hooks/useAdminGuard';
import {
    MessageSquare,
    Lock,
    Plus,
    Trash2,
    Save,
    RotateCcw,
    History,
    ChevronRight,
    Type,
    Sparkles,
    Trash,
    Megaphone,
    ShieldAlert,
    Clock,
    CheckCircle2,
    Package
} from 'lucide-react';

const SCENARIOS = [
    { id: 'default', name: '일반/기본 홍보', icon: 'Campaign', title: '일반/기본 홍보 문구' },
    { id: 'repurchase', name: '재구매 유도', icon: 'RotateCcw', title: '재구매 유도 문구' },
    { id: 'churn', name: '이탈 위험 관리', icon: 'Shield', title: '이탈 위험 고객 관리 문구' },
    { id: 'shipping_receipt', name: '배송: 접수 안내', icon: 'Clock', title: '배송 접수 안내 문구' },
    { id: 'shipping_paid', name: '배송: 입금 확인', icon: 'CheckCircle2', title: '입금 확인 완료 문구' },
    { id: 'shipping_done', name: '배송: 발송 완료', icon: 'Package', title: '배송 완료/출고 안내 문구' }
];

// Map icon names to components
const IconMap = {
    Campaign: Megaphone,
    RotateCcw: RotateCcw,
    Shield: ShieldAlert,
    Clock: Clock,
    CheckCircle2: CheckCircle2,
    Package: Package
};

const SettingsTemplate = () => {
    const navigate = useNavigate();
    const { showAlert, showConfirm } = useModal();
    const { isAuthorized, checkAdmin, isVerifying } = useAdminGuard();
    const [isLoading, setIsLoading] = useState(false);
    const [activeScenario, setActiveScenario] = useState('default');
    const [templates, setTemplates] = useState({});

    // --- Admin Guard Check ---
    const checkRunComp = React.useRef(false);
    useEffect(() => {
        if (checkRunComp.current) return;
        checkRunComp.current = true;

        const init = async () => {
            const ok = await checkAdmin();
            if (!ok) navigate('/');
        };
        init();
    }, []);

    // --- Data Loading ---
    useEffect(() => {
        if (isAuthorized) {
            loadTemplates();
        }
    }, [isAuthorized]);

    const loadTemplates = async () => {
        try {
            const data = await invoke('get_message_templates');
            setTemplates(data || {});
        } catch (err) {
            console.error("Failed to load templates:", err);
            // Fallback templates
            const fallback = {
                default: ["안녕하세요, ${name}님! Mycelium입니다. ✨"],
                repurchase: ["${name}님, 버섯 떨어질 때 되지 않으셨나요? 😉"],
                churn: ["${name}님, 오랜만이에요! 많이 기다렸답니다. 🍄"],
                shipping_receipt: ["배송 접수가 완료되었습니다. 입금 확인 후 발송해 드릴게요! 🚚"],
                shipping_paid: ["입금 확인되었습니다. 곧 발송해 드리겠습니다. 😊"],
                shipping_done: ["발송 완료되었습니다! 맛있게 드세요. 🍄"]
            };
            setTemplates(fallback);
        }
    };

    const handleSave = async () => {
        const ok = await showConfirm('저장 확인', '메시지 템플릿 변경사항을 저장하시겠습니까?');
        if (!ok) return;

        setIsLoading(true);
        try {
            await invoke('save_message_templates', { templates });
            await showAlert('저장 완료', '메시지 템플릿이 성공적으로 저장되었습니다.');
        } catch (err) {
            showAlert('저장 실패', err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleReset = async () => {
        const ok = await showConfirm('초기화 확인', '모든 문구를 초기 설정으로 되돌리시겠습니까? 직접 수정한 내용은 사라집니다.');
        if (!ok) return;

        setIsLoading(true);
        try {
            const data = await invoke('reset_message_templates');
            setTemplates(data);
            showAlert('초기화 완료', '기본 템플릿으로 복원되었습니다.');
        } catch (err) {
            showAlert('초기화 실패', err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleAddTemplate = () => {
        const newTemplates = { ...templates };
        if (!newTemplates[activeScenario]) {
            newTemplates[activeScenario] = [];
        }
        newTemplates[activeScenario].push("${name}님, 안녕하세요! Mycelium입니다.");
        setTemplates(newTemplates);
    };

    const handleRemoveTemplate = (index) => {
        const newTemplates = { ...templates };
        newTemplates[activeScenario].splice(index, 1);
        setTemplates(newTemplates);
    };

    const handleTextChange = (index, value) => {
        const newTemplates = { ...templates };
        newTemplates[activeScenario][index] = value;
        setTemplates(newTemplates);
    };

    const currentScenarioData = SCENARIOS.find(s => s.id === activeScenario);
    const currentItems = templates[activeScenario] || [];

    if (!isAuthorized) {
        return (
            <div className="flex h-full items-center justify-center bg-[#f8fafc]">
                <div className="text-center animate-pulse">
                    {isVerifying ? (
                        <div className="w-12 h-12 border-4 border-slate-200 border-t-indigo-500 rounded-full animate-spin mx-auto mb-4" />
                    ) : (
                        <Lock size={48} className="mx-auto text-slate-300 mb-4" />
                    )}
                    <p className="text-slate-400 font-bold">
                        {isVerifying ? '인증 확인 중...' : '인증 대기 중...'}
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-[#f8fafc] overflow-hidden animate-in fade-in duration-700 relative">
            <div className="flex-1 px-6 lg:px-8 min-[2000px]:px-12 pt-8 pb-8 overflow-hidden">
                <div className="max-w-6xl mx-auto h-full flex flex-col">
                    {/* Local Header Row */}
                    <div className="flex gap-6 items-end mb-4">
                        {/* Title Above Scenario List */}
                        <div className="w-72 px-4 text-left">
                            <div className="flex items-center gap-2 mb-1">
                                <span className="w-6 h-1 bg-indigo-600 rounded-full"></span>
                                <span className="text-[9px] font-black tracking-[0.2em] text-indigo-600 uppercase">Messaging</span>
                            </div>
                            <h1 className="text-3xl font-black text-slate-600 tracking-tighter" style={{ fontFamily: '"Noto Sans KR", sans-serif' }}>
                                메시지 템플릿
                            </h1>
                        </div>

                        {/* Buttons Above Editor */}
                        <div className="flex-1 flex justify-end gap-3 px-2">
                            <button
                                onClick={handleReset}
                                className="h-10 px-5 bg-white border border-slate-200 text-slate-500 hover:text-slate-700 hover:bg-slate-50 rounded-xl font-black text-xs flex items-center gap-2 transition-all active:scale-[0.95] shadow-sm"
                            >
                                <History size={15} /> 초기화
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={isLoading}
                                className="h-10 px-5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-black text-xs flex items-center gap-2 shadow-lg shadow-indigo-100 transition-all active:scale-[0.95]"
                            >
                                <Save size={15} /> 변경사항 저장
                            </button>
                        </div>
                    </div>

                    <div className="flex-1 flex gap-6 overflow-hidden">
                        {/* Sidebar: Scenarios */}
                        <div className="w-72 bg-white rounded-[2rem] border border-slate-200 shadow-xl shadow-slate-200/50 p-6 flex flex-col ring-1 ring-slate-900/5">
                            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6 px-2 text-left">발송 시나리오</h4>
                            <div className="space-y-1.5 overflow-y-auto custom-scrollbar pr-1">
                                {SCENARIOS.map(scenario => {
                                    const Icon = IconMap[scenario.icon] || MessageSquare;
                                    const isActive = activeScenario === scenario.id;
                                    return (
                                        <button
                                            key={scenario.id}
                                            onClick={() => setActiveScenario(scenario.id)}
                                            className={`w-full group flex items-center gap-3 px-4 py-3.5 rounded-2xl transition-all text-left ${isActive
                                                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100'
                                                : 'bg-transparent text-slate-500 hover:bg-slate-50 hover:text-indigo-600'
                                                }`}
                                        >
                                            <div className={`p-2 rounded-xl transition-all ${isActive ? 'bg-white/20' : 'bg-slate-50 group-hover:bg-indigo-50'
                                                }`}>
                                                <Icon size={18} />
                                            </div>
                                            <span className="font-bold text-sm tracking-tight flex-1">{scenario.name}</span>
                                            <ChevronRight size={14} className={`opacity-0 group-hover:opacity-40 transition-opacity ${isActive && 'hidden'}`} />
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Main Content: Template Editor */}
                        <div className="flex-1 bg-white rounded-[2rem] border border-slate-200 shadow-xl shadow-slate-200/50 flex flex-col ring-1 ring-slate-900/5 overflow-hidden">
                            <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/40">
                                <div className="flex flex-col text-left">
                                    <h3 className="text-xl font-black text-slate-700 tracking-tight">
                                        {currentScenarioData?.title}
                                    </h3>
                                    <p className="text-[11px] font-bold text-slate-400 mt-0.5">자유롭게 편집하고 ${"{name}"} 변수를 활용하세요.</p>
                                </div>
                                <button
                                    onClick={handleAddTemplate}
                                    className="h-10 px-5 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 rounded-xl font-black text-[11px] flex items-center gap-2 transition-all active:scale-[0.95]"
                                >
                                    <Plus size={16} /> 문구 추가
                                </button>
                            </div>

                            <div className="flex-1 p-8 overflow-y-auto custom-scrollbar space-y-6">
                                {currentItems.length > 0 ? (
                                    currentItems.map((text, index) => (
                                        <div key={index} className="group relative bg-slate-50/50 border border-slate-200 rounded-3xl p-6 transition-all hover:bg-white hover:shadow-xl hover:shadow-slate-200/30 hover:-translate-y-0.5">
                                            <button
                                                onClick={() => handleRemoveTemplate(index)}
                                                className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-rose-500 text-white shadow-lg opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center hover:bg-rose-600 transform hover:scale-110 active:scale-90 z-10"
                                            >
                                                <Trash2 size={14} />
                                            </button>

                                            <div className="relative">
                                                <textarea
                                                    value={text}
                                                    onChange={(e) => handleTextChange(index, e.target.value)}
                                                    className="w-full min-h-[120px] bg-transparent border-none p-0 focus:ring-0 font-bold text-slate-600 leading-relaxed text-base resize-none"
                                                    placeholder="메시지 내용을 입력하세요... (고객명 자리에 ${name} 입력)"
                                                />
                                            </div>

                                            <div className="mt-4 pt-4 border-t border-slate-100 flex justify-between items-center">
                                                <div className="flex items-center gap-2 text-[10px] font-black text-slate-300 uppercase tracking-widest">
                                                    <Type size={12} />
                                                    Template Item #{index + 1}
                                                </div>
                                                <div className="px-3 py-1 bg-white rounded-lg border border-slate-200 shadow-sm">
                                                    <span className="text-[10px] font-black text-slate-400 mr-1.5 uppercase tracking-widest text-[9px]">Characters</span>
                                                    <span className={`text-xs font-black ${text.length > 80 ? 'text-orange-500' : 'text-indigo-600'}`}>
                                                        {text.length}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <div className="h-full flex flex-col items-center justify-center py-20 opacity-40">
                                        <div className="w-20 h-20 bg-slate-100 rounded-[2rem] flex items-center justify-center mb-6">
                                            <MessageSquare size={32} />
                                        </div>
                                        <p className="font-black text-slate-400 text-sm">등록된 문구가 없습니다.</p>
                                        <p className="text-xs font-bold text-slate-300 mt-1">상단 [문구 추가] 버튼을 눌러 메시지를 작성해보세요.</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <style>{`
                .custom-scrollbar::-webkit-scrollbar {
                    width: 6px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: transparent;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: #e2e8f0;
                    border-radius: 10px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                    background: #cbd5e1;
                }
            `}</style>
        </div>
    );
};

export default SettingsTemplate;

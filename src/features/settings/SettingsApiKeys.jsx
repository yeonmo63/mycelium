import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useModal } from '../../contexts/ModalContext';
import { useAdminGuard } from '../../hooks/useAdminGuard';
import {
    Cpu,
    Save,
    Lock,
    Key,
    Phone,
    Shield,
    Globe,
    MessageSquare,
    Eye,
    EyeOff
} from 'lucide-react';

const SettingsApiKeys = () => {
    const { showAlert } = useModal();
    const { isAuthorized, checkAdmin } = useAdminGuard();

    // --- State Management ---
    const [isLoading, setIsLoading] = useState(false);
    const [showKeys, setShowKeys] = useState({
        gemini: false,
        sms: false,
        naver: false
    });

    const [formData, setFormData] = useState({
        gemini_api_key: '',
        sms_api_key: '',
        sms_sender_number: '',
        sms_provider: 'aligo', // default
        naver_client_id: '',
        naver_client_secret: ''
    });

    // --- Admin Guard Check ---
    useEffect(() => {
        const init = async () => {
            const ok = await checkAdmin();
            if (!ok) window.history.back();
        };
        init();
    }, []);

    // --- Data Loading ---
    useEffect(() => {
        if (isAuthorized) {
            const loadConfigs = async () => {
                try {
                    const geminiKey = await invoke('get_gemini_api_key_for_ui');
                    const smsConfig = await invoke('get_sms_config_for_ui');
                    const naverId = await invoke('get_naver_client_id_for_ui');

                    setFormData(prev => ({
                        ...prev,
                        gemini_api_key: geminiKey || '',
                        sms_api_key: smsConfig?.api_key || '',
                        sms_sender_number: smsConfig?.sender_number || '',
                        sms_provider: smsConfig?.provider || 'aligo',
                        naver_client_id: naverId || ''
                    }));
                } catch (err) {
                    console.error("Failed to load configs:", err);
                }
            };
            loadConfigs();
        }
    }, [isAuthorized]);

    // --- Handlers ---
    const handleSaveGemini = async () => {
        setIsLoading(true);
        try {
            await invoke('save_gemini_api_key', { key: formData.gemini_api_key });
            await showAlert('저장 완료', 'Gemini API 키가 저장되었습니다.');
        } catch (err) {
            showAlert('저장 실패', err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSaveSms = async () => {
        setIsLoading(true);
        try {
            await invoke('save_sms_config', {
                apiKey: formData.sms_api_key,
                senderNumber: formData.sms_sender_number,
                provider: formData.sms_provider
            });
            await showAlert('저장 완료', 'SMS 설정이 저장되었습니다.');
        } catch (err) {
            showAlert('저장 실패', err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSaveNaver = async () => {
        setIsLoading(true);
        try {
            await invoke('save_naver_keys', {
                clientId: formData.naver_client_id,
                clientSecret: formData.naver_client_secret
            });
            await showAlert('저장 완료', 'Naver API 키가 저장되었습니다.');
        } catch (err) {
            showAlert('저장 실패', err);
        } finally {
            setIsLoading(false);
        }
    };

    const toggleKeyVisibility = (key) => {
        setShowKeys(prev => ({ ...prev, [key]: !prev[key] }));
    };

    if (!isAuthorized) {
        return (
            <div className="flex h-screen items-center justify-center bg-[#f8fafc]">
                <div className="text-center animate-pulse">
                    <Lock size={48} className="mx-auto text-slate-300 mb-4" />
                    <p className="text-slate-400 font-bold">인증 대기 중...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-screen bg-[#f8fafc] overflow-hidden animate-in fade-in duration-700">
            {/* Header */}
            <div className="px-6 lg:px-8 min-[2000px]:px-12 pt-6 lg:pt-8 min-[2000px]:pt-12 pb-4">
                <div className="flex justify-between items-end">
                    <div>
                        <div className="flex items-center gap-2 mb-0.5">
                            <span className="w-6 h-1 bg-indigo-600 rounded-full"></span>
                            <span className="text-[9px] font-black tracking-[0.2em] text-indigo-600 uppercase">External Services</span>
                        </div>
                        <h1 className="text-3xl font-black text-slate-600 tracking-tighter" style={{ fontFamily: '"Noto Sans KR", sans-serif' }}>
                            외부 서비스 연동 <span className="text-slate-300 font-light ml-1 text-xl">API Integrations</span>
                        </h1>
                    </div>
                </div>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 px-6 lg:px-8 min-[2000px]:px-12 pb-8 overflow-auto custom-scrollbar">
                <div className="max-w-4xl mx-auto py-6 space-y-8">

                    {/* Gemini API Card */}
                    <div className="bg-white rounded-[2.5rem] shadow-xl shadow-slate-200/50 border border-slate-200 overflow-hidden ring-1 ring-slate-900/5 p-10 text-left">
                        <div className="flex justify-between items-center mb-8">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                                    <Cpu size={24} />
                                </div>
                                <div>
                                    <h2 className="text-xl font-black text-slate-700 tracking-tight">Google Gemini AI</h2>
                                    <p className="text-xs font-bold text-slate-400">데이터 분석 및 마케팅 제안 AI 엔진</p>
                                </div>
                            </div>
                            <button
                                onClick={handleSaveGemini}
                                disabled={isLoading}
                                className="h-12 px-6 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-black text-xs flex items-center gap-2 shadow-lg shadow-indigo-100 transition-all active:scale-[0.95]"
                            >
                                <Save size={16} /> 저장
                            </button>
                        </div>

                        <div className="space-y-4">
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Gemini API Key</label>
                            <div className="relative group">
                                <Key className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-indigo-500 transition-colors" size={18} />
                                <input
                                    type={showKeys.gemini ? "text" : "password"}
                                    value={formData.gemini_api_key}
                                    onChange={e => setFormData({ ...formData, gemini_api_key: e.target.value })}
                                    className="w-full h-14 pl-12 pr-12 bg-slate-50 border-none rounded-2xl font-bold text-base focus:ring-4 focus:ring-indigo-500/10 focus:bg-white transition-all ring-1 ring-inset ring-slate-200"
                                    placeholder="AI 분석 기능을 사용하려면 키를 입력하세요"
                                />
                                <button
                                    type="button"
                                    onClick={() => toggleKeyVisibility('gemini')}
                                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                                >
                                    {showKeys.gemini ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* SMS / Messaging Card */}
                    <div className="bg-white rounded-[2.5rem] shadow-xl shadow-slate-200/50 border border-slate-200 overflow-hidden ring-1 ring-slate-900/5 p-10 text-left">
                        <div className="flex justify-between items-center mb-8">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-2xl bg-orange-50 text-orange-600 flex items-center justify-center">
                                    <MessageSquare size={24} />
                                </div>
                                <div>
                                    <h2 className="text-xl font-black text-slate-700 tracking-tight">SMS & Messaging</h2>
                                    <p className="text-xs font-bold text-slate-400">문자 및 카카오 알림톡 발송 설정</p>
                                </div>
                            </div>
                            <button
                                onClick={handleSaveSms}
                                disabled={isLoading}
                                className="h-12 px-6 bg-orange-600 hover:bg-orange-500 text-white rounded-xl font-black text-xs flex items-center gap-2 shadow-lg shadow-orange-100 transition-all active:scale-[0.95]"
                            >
                                <Save size={16} /> 저장
                            </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            <div className="space-y-4">
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">SMS API Key</label>
                                <div className="relative group">
                                    <Key className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-orange-500 transition-colors" size={18} />
                                    <input
                                        type={showKeys.sms ? "text" : "password"}
                                        value={formData.sms_api_key}
                                        onChange={e => setFormData({ ...formData, sms_api_key: e.target.value })}
                                        className="w-full h-14 pl-12 pr-12 bg-slate-50 border-none rounded-2xl font-bold text-base focus:ring-4 focus:ring-orange-500/10 focus:bg-white transition-all ring-1 ring-inset ring-slate-200"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => toggleKeyVisibility('sms')}
                                        className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                                    >
                                        {showKeys.sms ? <EyeOff size={18} /> : <Eye size={18} />}
                                    </button>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Sender Number</label>
                                <div className="relative group">
                                    <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-orange-500 transition-colors" size={18} />
                                    <input
                                        type="tel"
                                        value={formData.sms_sender_number}
                                        onChange={e => setFormData({ ...formData, sms_sender_number: e.target.value })}
                                        className="w-full h-14 pl-12 pr-6 bg-slate-50 border-none rounded-2xl font-bold text-base focus:ring-4 focus:ring-orange-500/10 focus:bg-white transition-all ring-1 ring-inset ring-slate-200"
                                        placeholder="010-0000-0000"
                                    />
                                </div>
                            </div>

                            <div className="space-y-4 col-span-1 md:col-span-2">
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Provider Service</label>
                                <div className="grid grid-cols-3 gap-4">
                                    {['aligo', 'coolsms', 'solapi'].map(provider => (
                                        <button
                                            key={provider}
                                            type="button"
                                            onClick={() => setFormData({ ...formData, sms_provider: provider })}
                                            className={`h-14 rounded-2xl border-2 font-black text-sm capitalize transition-all
                                                ${formData.sms_provider === provider
                                                    ? 'bg-orange-50 border-orange-500 text-orange-600 shadow-md transform -translate-y-1'
                                                    : 'bg-white border-slate-100 text-slate-400 hover:border-slate-200'}
                                            `}
                                        >
                                            {provider}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Naver Search API Card */}
                    <div className="bg-white rounded-[2.5rem] shadow-xl shadow-slate-200/50 border border-slate-200 overflow-hidden ring-1 ring-slate-900/5 p-10 text-left">
                        <div className="flex justify-between items-center mb-8">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-2xl bg-green-50 text-green-600 flex items-center justify-center">
                                    <Globe size={24} />
                                </div>
                                <div>
                                    <h2 className="text-xl font-black text-slate-700 tracking-tight">Naver Search & Trends</h2>
                                    <p className="text-xs font-bold text-slate-400">네이버 블로그/카페 검색 및 트렌드 분석 연동</p>
                                </div>
                            </div>
                            <button
                                onClick={handleSaveNaver}
                                disabled={isLoading}
                                className="h-12 px-6 bg-green-600 hover:bg-green-500 text-white rounded-xl font-black text-xs flex items-center gap-2 shadow-lg shadow-green-100 transition-all active:scale-[0.95]"
                            >
                                <Save size={16} /> 저장
                            </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            <div className="space-y-4">
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Client ID</label>
                                <input
                                    type="text"
                                    value={formData.naver_client_id}
                                    onChange={e => setFormData({ ...formData, naver_client_id: e.target.value })}
                                    className="w-full h-14 px-6 bg-slate-50 border-none rounded-2xl font-bold text-base focus:ring-4 focus:ring-green-500/10 focus:bg-white transition-all ring-1 ring-inset ring-slate-200"
                                />
                            </div>

                            <div className="space-y-4">
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Client Secret</label>
                                <div className="relative group">
                                    <Key className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-green-500 transition-colors" size={18} />
                                    <input
                                        type={showKeys.naver ? "text" : "password"}
                                        value={formData.naver_client_secret}
                                        onChange={e => setFormData({ ...formData, naver_client_secret: e.target.value })}
                                        className="w-full h-14 pl-12 pr-12 bg-slate-50 border-none rounded-2xl font-bold text-base focus:ring-4 focus:ring-green-500/10 focus:bg-white transition-all ring-1 ring-inset ring-slate-200"
                                        placeholder="Secret을 입력하세요"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => toggleKeyVisibility('naver')}
                                        className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                                    >
                                        {showKeys.naver ? <EyeOff size={18} /> : <Eye size={18} />}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SettingsApiKeys;

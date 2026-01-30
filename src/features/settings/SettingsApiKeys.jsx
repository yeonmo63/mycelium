import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { invoke } from '@tauri-apps/api/core';
import { useModal } from '../../contexts/ModalContext';
import { invokeAI } from '../../utils/aiErrorHandler';
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
    EyeOff,
    ExternalLink
} from 'lucide-react';

const SettingsApiKeys = () => {
    const navigate = useNavigate();
    const { showAlert } = useModal();
    const { isAuthorized, checkAdmin, isVerifying } = useAdminGuard();

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

    const handleTestGemini = async () => {
        if (!formData.gemini_api_key) {
            showAlert('알림', '테스트할 API 키를 먼저 입력해주세요.');
            return;
        }
        setIsLoading(true);
        try {
            const res = await invokeAI(showAlert, 'test_gemini_connection', { key: formData.gemini_api_key });
            if (res === 'OK') {
                showAlert('성공', 'Gemini AI 연결에 성공했습니다!');
            } else {
                showAlert('결과', `응답: ${res}`);
            }
        } catch (err) {
            console.error(err);
            // invokeAI handles the quota error alert
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
            {/* Local Modal Root */}
            <div id="local-modal-root" className="absolute inset-0 z-[9999] pointer-events-none" />

            {/* Main Content Area */}
            <div className="flex-1 px-6 lg:px-8 min-[2000px]:px-12 pb-8 overflow-auto custom-scrollbar">
                <div className="max-w-4xl mx-auto py-8 space-y-6">

                    {/* Integrated Header - Moved inside for better layout flow */}
                    <div className="mb-2 px-4 text-left">
                        <div className="flex items-center gap-2 mb-1">
                            <span className="w-6 h-1 bg-indigo-600 rounded-full"></span>
                            <span className="text-[9px] font-black tracking-[0.2em] text-indigo-600 uppercase">External Services</span>
                        </div>
                        <h1 className="text-3xl font-black text-slate-600 tracking-tighter" style={{ fontFamily: '"Noto Sans KR", sans-serif' }}>
                            외부 서비스 연동 <span className="text-slate-300 font-light ml-1 text-xl">API Integrations</span>
                        </h1>
                    </div>

                    {/* Gemini API Card */}
                    <div className="bg-white rounded-[2rem] shadow-xl shadow-slate-200/50 border border-slate-200 overflow-hidden ring-1 ring-slate-900/5 p-8 text-left transition-all">
                        <div className="flex justify-between items-center mb-6">
                            <div className="flex items-center gap-4">
                                <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                                    <Cpu size={20} />
                                </div>
                                <div className="flex flex-col">
                                    <div className="flex items-center gap-3">
                                        <h2 className="text-lg font-black text-slate-700 tracking-tight">Google Gemini AI</h2>
                                        <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-600 text-[10px] font-black hover:bg-indigo-100 transition-colors">
                                            <ExternalLink size={10} /> API 키 발급
                                        </a>
                                    </div>
                                    <p className="text-[11px] font-bold text-slate-400">데이터 분석 및 마케팅 제안 AI 엔진</p>
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={handleTestGemini}
                                    disabled={isLoading}
                                    className="h-10 px-5 bg-white border border-indigo-200 text-indigo-600 rounded-xl font-black text-xs flex items-center gap-2 transition-all active:scale-[0.95]"
                                >
                                    <span className="material-symbols-rounded text-sm">check_circle</span> 연결 테스트
                                </button>
                                <button
                                    onClick={handleSaveGemini}
                                    disabled={isLoading}
                                    className="h-10 px-5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-black text-xs flex items-center gap-2 shadow-lg shadow-indigo-100 transition-all active:scale-[0.95]"
                                >
                                    <Save size={14} /> 저장
                                </button>
                            </div>
                        </div>

                        <div className="space-y-3">
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 text-left">Gemini API 키</label>
                            <div className="relative group">
                                <input
                                    type={showKeys.gemini ? "text" : "password"}
                                    value={formData.gemini_api_key}
                                    onChange={e => setFormData({ ...formData, gemini_api_key: e.target.value })}
                                    className="w-full h-12 px-5 pr-12 bg-slate-50 border-none rounded-xl font-bold text-sm focus:ring-4 focus:ring-indigo-500/10 focus:bg-white transition-all ring-1 ring-inset ring-slate-200"
                                    placeholder="AI 분석 기능을 사용하려면 키를 입력하세요"
                                />
                                <button
                                    type="button"
                                    onClick={() => toggleKeyVisibility('gemini')}
                                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                                >
                                    {showKeys.gemini ? <EyeOff size={16} /> : <Eye size={16} />}
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* SMS / Messaging Card */}
                    <div className="bg-white rounded-[2rem] shadow-xl shadow-slate-200/50 border border-slate-200 overflow-hidden ring-1 ring-slate-900/5 p-8 text-left transition-all">
                        <div className="flex justify-between items-center mb-6">
                            <div className="flex items-center gap-4">
                                <div className="w-10 h-10 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center">
                                    <MessageSquare size={20} />
                                </div>
                                <div className="flex flex-col">
                                    <div className="flex items-center gap-3">
                                        <h2 className="text-lg font-black text-slate-700 tracking-tight">SMS & Messaging</h2>
                                        <a href="https://aligo.in/" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-orange-50 text-orange-600 text-[10px] font-black hover:bg-orange-100 transition-colors">
                                            <ExternalLink size={10} /> 서비스 센터
                                        </a>
                                    </div>
                                    <p className="text-[11px] font-bold text-slate-400">문자 및 카카오 알림톡 발송 설정</p>
                                </div>
                            </div>
                            <button
                                onClick={handleSaveSms}
                                disabled={isLoading}
                                className="h-10 px-5 bg-orange-600 hover:bg-orange-500 text-white rounded-xl font-black text-xs flex items-center gap-2 shadow-lg shadow-orange-100 transition-all active:scale-[0.95]"
                            >
                                <Save size={14} /> 저장
                            </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-3">
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 text-left">SMS API 키</label>
                                <div className="relative group">
                                    <input
                                        type={showKeys.sms ? "text" : "password"}
                                        value={formData.sms_api_key}
                                        onChange={e => setFormData({ ...formData, sms_api_key: e.target.value })}
                                        className="w-full h-12 px-5 pr-12 bg-slate-50 border-none rounded-xl font-bold text-sm focus:ring-4 focus:ring-orange-500/10 focus:bg-white transition-all ring-1 ring-inset ring-slate-200"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => toggleKeyVisibility('sms')}
                                        className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                                    >
                                        {showKeys.sms ? <EyeOff size={16} /> : <Eye size={16} />}
                                    </button>
                                </div>
                            </div>

                            <div className="space-y-3">
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 text-left">발신 번호 (Sender Number)</label>
                                <div className="relative group">
                                    <input
                                        type="tel"
                                        value={formData.sms_sender_number}
                                        onChange={e => setFormData({ ...formData, sms_sender_number: e.target.value })}
                                        className="w-full h-12 px-5 bg-slate-50 border-none rounded-xl font-bold text-sm focus:ring-4 focus:ring-orange-500/10 focus:bg-white transition-all ring-1 ring-inset ring-slate-200"
                                        placeholder="010-0000-0000"
                                    />
                                </div>
                            </div>

                            <div className="space-y-3 col-span-1 md:col-span-2">
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">발송 서비스 선택</label>
                                <div className="grid grid-cols-3 gap-3">
                                    {['aligo', 'coolsms', 'solapi'].map(provider => (
                                        <button
                                            key={provider}
                                            type="button"
                                            onClick={() => setFormData({ ...formData, sms_provider: provider })}
                                            className={`h-12 rounded-xl border-2 font-black text-[11px] capitalize transition-all
                                                ${formData.sms_provider === provider
                                                    ? 'bg-orange-50 border-orange-500 text-orange-600 shadow-md transform -translate-y-0.5'
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
                    <div className="bg-white rounded-[2rem] shadow-xl shadow-slate-200/50 border border-slate-200 overflow-hidden ring-1 ring-slate-900/5 p-8 text-left transition-all">
                        <div className="flex justify-between items-center mb-6">
                            <div className="flex items-center gap-4">
                                <div className="w-10 h-10 rounded-xl bg-green-50 text-green-600 flex items-center justify-center">
                                    <Globe size={20} />
                                </div>
                                <div className="flex flex-col">
                                    <div className="flex items-center gap-3">
                                        <h2 className="text-lg font-black text-slate-700 tracking-tight">Naver Search & Trends</h2>
                                        <a href="https://developers.naver.com/apps/" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-green-50 text-green-600 text-[10px] font-black hover:bg-green-100 transition-colors">
                                            <ExternalLink size={10} /> 개발자 센터
                                        </a>
                                    </div>
                                    <p className="text-[11px] font-bold text-slate-400">네이버 블로그/카페 검색 및 트렌드 분석 연동</p>
                                </div>
                            </div>
                            <button
                                onClick={handleSaveNaver}
                                disabled={isLoading}
                                className="h-10 px-5 bg-green-600 hover:bg-green-500 text-white rounded-xl font-black text-xs flex items-center gap-2 shadow-lg shadow-green-100 transition-all active:scale-[0.95]"
                            >
                                <Save size={14} /> 저장
                            </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-3">
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 text-left">네이버 클라이언트 ID</label>
                                <input
                                    type="text"
                                    value={formData.naver_client_id}
                                    onChange={e => setFormData({ ...formData, naver_client_id: e.target.value })}
                                    className="w-full h-12 px-5 bg-slate-50 border-none rounded-xl font-bold text-sm focus:ring-4 focus:ring-green-500/10 focus:bg-white transition-all ring-1 ring-inset ring-slate-200"
                                />
                            </div>

                            <div className="space-y-3 text-left">
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">네이버 클라이언트 Secret</label>
                                <div className="relative group">
                                    <input
                                        type={showKeys.naver ? "text" : "password"}
                                        value={formData.naver_client_secret}
                                        onChange={e => setFormData({ ...formData, naver_client_secret: e.target.value })}
                                        className="w-full h-12 px-5 pr-12 bg-slate-50 border-none rounded-xl font-bold text-sm focus:ring-4 focus:ring-green-500/10 focus:bg-white transition-all ring-1 ring-inset ring-slate-200"
                                        placeholder="Secret을 입력하세요"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => toggleKeyVisibility('naver')}
                                        className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                                    >
                                        {showKeys.naver ? <EyeOff size={16} /> : <Eye size={16} />}
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

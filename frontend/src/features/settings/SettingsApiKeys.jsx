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
    ExternalLink,
    ShoppingBag,
    Truck
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
        naver: false,
        naver_commerce_id: false,
        naver_commerce_secret: false,
        coupang_access_key: false,
        sabangnet: false,
        playauto: false,
        courier: false,
        tax: false
    });

    const [formData, setFormData] = useState({
        gemini_api_key: '',
        sms_api_key: '',
        sms_sender_number: '',
        sms_provider: 'aligo', // default
        naver_client_id: '',
        naver_client_secret: '',
        // Mall Commerce
        naver_commerce_id: '',
        naver_commerce_secret: '',
        coupang_access_key: '',
        coupang_secret_key: '',
        coupang_vendor_id: '',
        // Aggregators
        sabangnet_api_key: '',
        sabangnet_id: '',
        playauto_api_key: '',
        playauto_id: '',
        // Courier
        courier_provider: 'sweettracker',
        courier_api_key: '',
        courier_client_id: '',
        // Tax
        tax_provider: 'sim_hometax',
        tax_api_key: '',
        tax_client_id: ''
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
                    const mallConfig = await invoke('get_mall_config_for_ui');
                    const courierConfig = await invoke('get_courier_config_for_ui');
                    const taxConfig = await invoke('get_tax_filing_config_for_ui');

                    setFormData(prev => ({
                        ...prev,
                        gemini_api_key: geminiKey || '',
                        sms_api_key: smsConfig?.api_key || '',
                        sms_sender_number: smsConfig?.sender_number || '',
                        sms_provider: smsConfig?.provider || 'aligo',
                        naver_client_id: naverId || '',
                        naver_commerce_id: mallConfig?.naver_commerce_id || '',
                        naver_commerce_secret: mallConfig?.naver_commerce_secret || '',
                        coupang_access_key: mallConfig?.coupang_access_key || '',
                        coupang_secret_key: mallConfig?.coupang_secret_key || '',
                        coupang_vendor_id: mallConfig?.coupang_vendor_id || '',
                        sabangnet_api_key: mallConfig?.sabangnet_api_key || '',
                        sabangnet_id: mallConfig?.sabangnet_id || '',
                        playauto_api_key: mallConfig?.playauto_api_key || '',
                        playauto_id: mallConfig?.playauto_id || '',
                        courier_provider: courierConfig?.provider || 'sweettracker',
                        courier_api_key: courierConfig?.api_key || '',
                        courier_client_id: courierConfig?.client_id || '',
                        tax_provider: taxConfig?.provider || 'sim_hometax',
                        tax_api_key: taxConfig?.api_key || '',
                        tax_client_id: taxConfig?.client_id || ''
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
                showAlert('성공', 'Gemini AI 연결에 성공했습니다! 키가 정상적으로 작동합니다.');
            } else {
                showAlert('결과', `응답: ${res}`);
            }
        } catch (err) {
            console.error(err);
            // invokeAI handles the quota error alert via modal
            if (!err.message?.includes('AI_QUOTA_EXCEEDED')) {
                showAlert('연결 실패', `오류 상세: ${err}`);
            }
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

    const handleSaveMall = async () => {
        setIsLoading(true);
        try {
            await invoke('save_mall_keys', {
                config: {
                    naver_commerce_id: formData.naver_commerce_id,
                    naver_commerce_secret: formData.naver_commerce_secret,
                    coupang_access_key: formData.coupang_access_key,
                    coupang_secret_key: formData.coupang_secret_key,
                    coupang_vendor_id: formData.coupang_vendor_id,
                    sabangnet_api_key: formData.sabangnet_api_key,
                    sabangnet_id: formData.sabangnet_id,
                    playauto_api_key: formData.playauto_api_key,
                    playauto_id: formData.playauto_id
                }
            });
            await showAlert('저장 완료', '쇼핑몰 연동 키가 저장되었습니다.');
        } catch (err) {
            showAlert('저장 실패', err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSaveCourier = async () => {
        setIsLoading(true);
        try {
            await invoke('save_courier_config', {
                config: {
                    provider: formData.courier_provider,
                    api_key: formData.courier_api_key,
                    client_id: formData.courier_client_id
                }
            });
            await showAlert('저장 완료', '택배 연동 설정이 저장되었습니다.');
        } catch (err) {
            showAlert('저장 실패', err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSaveTax = async () => {
        setIsLoading(true);
        try {
            await invoke('save_tax_filing_config', {
                config: {
                    provider: formData.tax_provider,
                    api_key: formData.tax_api_key,
                    client_id: formData.tax_client_id
                }
            });
            await showAlert('저장 완료', '세무신고 API 설정이 저장되었습니다.');
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

                    {/* Integrated Header */}
                    <div className="mb-2 px-4 text-left">
                        <div className="flex items-center gap-2 mb-1">
                            <span className="w-12 h-1.5 bg-indigo-600 rounded-full"></span>
                            <span className="text-[10px] font-black tracking-[0.25em] text-indigo-600 uppercase">Integrations</span>
                        </div>
                        <h1 className="text-4xl font-black text-slate-800 tracking-tighter" style={{ fontFamily: '"Noto Sans KR", sans-serif' }}>
                            외부 서비스 연동 <span className="text-slate-300 font-light ml-2 text-2xl tracking-normal">API & Service Node</span>
                        </h1>
                        <p className="mt-2 text-slate-400 font-medium text-sm">시스템의 인공지능 분석, 문자 발송 및 이커머스 채널 동기화를 위한 핵심 정보를 설정합니다.</p>
                    </div>

                    <div className="grid grid-cols-1 gap-8">

                        {/* Gemini API Card */}
                        <div className="bg-white rounded-[2.5rem] shadow-2xl shadow-slate-200/40 border border-slate-100 overflow-hidden group hover:border-indigo-200 transition-all duration-500">
                            <div className="p-8 lg:p-10">
                                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
                                    <div className="flex items-center gap-5">
                                        <div className="w-14 h-14 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center shadow-inner group-hover:scale-110 transition-transform duration-500">
                                            <Cpu size={28} strokeWidth={2.5} />
                                        </div>
                                        <div className="flex flex-col">
                                            <div className="flex items-center gap-3">
                                                <h2 className="text-xl font-black text-slate-800 tracking-tight">Google Gemini AI</h2>
                                                {formData.gemini_api_key ? (
                                                    <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-600 text-[9px] font-black uppercase tracking-wider border border-emerald-100">Set</span>
                                                ) : (
                                                    <span className="px-2 py-0.5 rounded-md bg-slate-50 text-slate-400 text-[9px] font-black uppercase tracking-wider border border-slate-100">Empty</span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <p className="text-[12px] font-bold text-slate-400">데이터 분석 및 마케팅 제안 AI 엔진</p>
                                                <span className="w-1 h-1 rounded-full bg-slate-200"></span>
                                                <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="text-indigo-500 hover:text-indigo-700 text-[11px] font-black flex items-center gap-1 transition-colors">
                                                    API 키 발급 <ExternalLink size={10} />
                                                </a>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex gap-2 w-full md:w-auto">
                                        <button
                                            onClick={handleTestGemini}
                                            disabled={isLoading}
                                            className="flex-1 md:flex-none h-11 px-6 bg-white border border-indigo-100 text-indigo-600 rounded-2xl font-black text-xs flex items-center justify-center gap-2 hover:bg-indigo-50/50 hover:border-indigo-200 transition-all active:scale-[0.97]"
                                        >
                                            <span className="material-symbols-rounded text-sm">check_circle</span> 연결 테스트
                                        </button>
                                        <button
                                            onClick={handleSaveGemini}
                                            disabled={isLoading}
                                            className="flex-1 md:flex-none h-11 px-6 bg-slate-900 border border-slate-900 text-white rounded-2xl font-black text-xs flex items-center justify-center gap-2 shadow-lg shadow-slate-200 hover:bg-slate-800 transition-all active:scale-[0.97]"
                                        >
                                            <Save size={16} /> 저장하기
                                        </button>
                                    </div>
                                </div>

                                <div className="space-y-3">
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Gemini Project API Key</label>
                                    <div className="relative">
                                        <input
                                            type={showKeys.gemini ? "text" : "password"}
                                            value={formData.gemini_api_key}
                                            onChange={e => setFormData({ ...formData, gemini_api_key: e.target.value })}
                                            className="w-full h-14 px-6 pr-14 bg-slate-50/50 border border-slate-100 rounded-[1.25rem] font-bold text-[15px] focus:ring-4 focus:ring-indigo-500/5 focus:bg-white focus:border-indigo-200 transition-all"
                                            placeholder="AI 분석 기능을 사용하려면 키를 입력하세요"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => toggleKeyVisibility('gemini')}
                                            className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500 transition-colors"
                                        >
                                            {showKeys.gemini ? <EyeOff size={20} /> : <Eye size={20} />}
                                        </button>
                                    </div>
                                    <p className="ml-1 text-[11px] text-slate-400 font-medium">※ 입력하신 키는 로컬 설정 파일에 안전하게 암호화되어 보관됩니다.</p>
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

                        {/* Mall Integration Card */}
                        <div className="bg-white rounded-[2rem] shadow-xl shadow-slate-200/50 border border-slate-200 overflow-hidden ring-1 ring-slate-900/5 p-8 text-left transition-all">
                            <div className="flex justify-between items-center mb-6">
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center">
                                        <ShoppingBag size={20} />
                                    </div>
                                    <div className="flex flex-col">
                                        <div className="flex items-center gap-3">
                                            <h2 className="text-lg font-black text-slate-700 tracking-tight">E-commerce & Mall Sync</h2>
                                            <div className="flex gap-2">
                                                <a href="https://apicenter.commerce.naver.com/" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-teal-50 text-teal-600 text-[10px] font-black hover:bg-teal-100 transition-colors">
                                                    네이버 커머스
                                                </a>
                                                <a href="https://wing.coupang.com/" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-teal-50 text-teal-600 text-[10px] font-black hover:bg-teal-100 transition-colors">
                                                    쿠팡 윙
                                                </a>
                                            </div>
                                        </div>
                                        <p className="text-[11px] font-bold text-slate-400">쇼핑몰 주문 자동 수집 및 재고 동기화 연동</p>
                                    </div>
                                </div>
                                <button
                                    onClick={handleSaveMall}
                                    disabled={isLoading}
                                    className="h-10 px-5 bg-teal-600 hover:bg-teal-500 text-white rounded-xl font-black text-xs flex items-center gap-2 shadow-lg shadow-teal-100 transition-all active:scale-[0.95]"
                                >
                                    <Save size={14} /> 저장
                                </button>
                            </div>

                            <div className="space-y-8">
                                {/* Naver Commerce */}
                                <div className="space-y-4">
                                    <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest border-l-4 border-teal-500 pl-2">Mall Integration Aggregators (Best for Multi-Channel)</h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-2">
                                        {/* Sabangnet */}
                                        <div className="bg-slate-50/50 p-6 rounded-3xl border border-slate-100 space-y-4">
                                            <div className="flex items-center gap-2 mb-2">
                                                <div className="w-8 h-8 rounded-lg bg-teal-500 text-white flex items-center justify-center font-black text-xs">S</div>
                                                <h4 className="font-black text-slate-700">사방넷 (Sabangnet)</h4>
                                            </div>
                                            <div className="space-y-2">
                                                <label className="block text-[10px] font-black text-slate-500 ml-1">인증코드 (API Key)</label>
                                                <div className="relative">
                                                    <input
                                                        type={showKeys.sabangnet ? "text" : "password"}
                                                        value={formData.sabangnet_api_key}
                                                        onChange={e => setFormData({ ...formData, sabangnet_api_key: e.target.value })}
                                                        className="w-full h-11 px-4 pr-10 bg-white border border-slate-200 rounded-xl font-bold text-sm focus:ring-4 focus:ring-teal-500/10 transition-all"
                                                        placeholder="Sabangnet API Key"
                                                    />
                                                    <button onClick={() => toggleKeyVisibility('sabangnet')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                                                        {showKeys.sabangnet ? <EyeOff size={14} /> : <Eye size={14} />}
                                                    </button>
                                                </div>
                                            </div>
                                            <div className="space-y-2">
                                                <label className="block text-[10px] font-black text-slate-500 ml-1">회사 아이디 (Company ID)</label>
                                                <input
                                                    type="text"
                                                    value={formData.sabangnet_id}
                                                    onChange={e => setFormData({ ...formData, sabangnet_id: e.target.value })}
                                                    className="w-full h-11 px-4 bg-white border border-slate-200 rounded-xl font-bold text-sm focus:ring-4 focus:ring-teal-500/10 transition-all"
                                                    placeholder="Company ID"
                                                />
                                            </div>
                                        </div>

                                        {/* PlayAuto */}
                                        <div className="bg-slate-50/50 p-6 rounded-3xl border border-slate-100 space-y-4">
                                            <div className="flex items-center gap-2 mb-2">
                                                <div className="w-8 h-8 rounded-lg bg-orange-500 text-white flex items-center justify-center font-black text-xs">P</div>
                                                <h4 className="font-black text-slate-700">플레이오토 (PlayAuto)</h4>
                                            </div>
                                            <div className="space-y-2">
                                                <label className="block text-[10px] font-black text-slate-500 ml-1">연동 대행사 키 (API Key)</label>
                                                <div className="relative">
                                                    <input
                                                        type={showKeys.playauto ? "text" : "password"}
                                                        value={formData.playauto_api_key}
                                                        onChange={e => setFormData({ ...formData, playauto_api_key: e.target.value })}
                                                        className="w-full h-11 px-4 pr-10 bg-white border border-slate-200 rounded-xl font-bold text-sm focus:ring-4 focus:ring-teal-500/10 transition-all"
                                                        placeholder="PlayAuto API Key"
                                                    />
                                                    <button onClick={() => toggleKeyVisibility('playauto')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                                                        {showKeys.playauto ? <EyeOff size={14} /> : <Eye size={14} />}
                                                    </button>
                                                </div>
                                            </div>
                                            <div className="space-y-2">
                                                <label className="block text-[10px] font-black text-slate-500 ml-1">계정 아이디 (Member ID)</label>
                                                <input
                                                    type="text"
                                                    value={formData.playauto_id}
                                                    onChange={e => setFormData({ ...formData, playauto_id: e.target.value })}
                                                    className="w-full h-11 px-4 bg-white border border-slate-200 rounded-xl font-bold text-sm focus:ring-4 focus:ring-teal-500/10 transition-all"
                                                    placeholder="Member ID"
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Existing direct mall options as legacy/advanced */}
                                    <div className="pt-6 border-t border-slate-100">
                                        <h3 className="text-[10px] font-black text-slate-300 uppercase tracking-[0.2em] mb-4">Advanced: Direct Mall Connectivity</h3>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 opacity-60 hover:opacity-100 transition-opacity">
                                            {/* Naver Commerce */}
                                            <div className="space-y-3">
                                                <h4 className="text-[11px] font-black text-slate-400 pl-1">Naver SmartStore</h4>
                                                <div className="space-y-2">
                                                    <input
                                                        type="text"
                                                        value={formData.naver_commerce_id}
                                                        onChange={e => setFormData({ ...formData, naver_commerce_id: e.target.value })}
                                                        className="w-full h-10 px-4 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs"
                                                        placeholder="Client ID"
                                                    />
                                                    <input
                                                        type="password"
                                                        value={formData.naver_commerce_secret}
                                                        onChange={e => setFormData({ ...formData, naver_commerce_secret: e.target.value })}
                                                        className="w-full h-10 px-4 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs"
                                                        placeholder="Client Secret"
                                                    />
                                                </div>
                                            </div>
                                            {/* Coupang */}
                                            <div className="space-y-3">
                                                <h4 className="text-[11px] font-black text-slate-400 pl-1">Coupang Marketplace</h4>
                                                <div className="space-y-2">
                                                    <input
                                                        type="text"
                                                        value={formData.coupang_access_key}
                                                        onChange={e => setFormData({ ...formData, coupang_access_key: e.target.value })}
                                                        className="w-full h-10 px-4 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs"
                                                        placeholder="Access Key"
                                                    />
                                                    <input
                                                        type="password"
                                                        value={formData.coupang_secret_key}
                                                        onChange={e => setFormData({ ...formData, coupang_secret_key: e.target.value })}
                                                        className="w-full h-10 px-4 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs"
                                                        placeholder="Secret Key"
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Courier Integration Card */}
                        <div className="bg-white rounded-[2rem] shadow-xl shadow-slate-200/50 border border-slate-200 overflow-hidden ring-1 ring-slate-900/5 p-8 text-left transition-all">
                            <div className="flex justify-between items-center mb-6">
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                                        <Truck size={20} />
                                    </div>
                                    <div className="flex flex-col">
                                        <div className="flex items-center gap-3">
                                            <h2 className="text-lg font-black text-slate-700 tracking-tight">Courier Service Integration</h2>
                                            <a href="https://www.sweettracker.co.kr/" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-50 text-blue-600 text-[10px] font-black hover:bg-blue-100 transition-colors">
                                                <ExternalLink size={10} /> 서비스 센터
                                            </a>
                                        </div>
                                        <p className="text-[11px] font-bold text-slate-400">송장 번호 자동 생성 및 배송 추적 서비스 연동</p>
                                    </div>
                                </div>
                                <button
                                    onClick={handleSaveCourier}
                                    disabled={isLoading}
                                    className="h-10 px-5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-black text-xs flex items-center gap-2 shadow-lg shadow-blue-100 transition-all active:scale-[0.95]"
                                >
                                    <Save size={14} /> 저장
                                </button>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-3 col-span-1 md:col-span-2">
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">연동 서비스 선택</label>
                                    <div className="grid grid-cols-3 gap-3">
                                        {['sweettracker', 'smartparcel', 'delivery'].map(provider => (
                                            <button
                                                key={provider}
                                                type="button"
                                                onClick={() => setFormData({ ...formData, courier_provider: provider })}
                                                className={`h-12 rounded-xl border-2 font-black text-[11px] capitalize transition-all
                                                ${formData.courier_provider === provider
                                                        ? 'bg-blue-50 border-blue-500 text-blue-600 shadow-md transform -translate-y-0.5'
                                                        : 'bg-white border-slate-100 text-slate-400 hover:border-slate-200'}
                                            `}
                                            >
                                                {provider === 'sweettracker' ? '스윗트래커' : provider === 'smartparcel' ? '스마트택배' : '기타 API'}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="space-y-3">
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 text-left">API 키 (API Key)</label>
                                    <div className="relative group">
                                        <input
                                            type={showKeys.courier ? "text" : "password"}
                                            value={formData.courier_api_key}
                                            onChange={e => setFormData({ ...formData, courier_api_key: e.target.value })}
                                            className="w-full h-12 px-5 pr-12 bg-slate-50 border-none rounded-xl font-bold text-sm focus:ring-4 focus:ring-blue-500/10 focus:bg-white transition-all ring-1 ring-inset ring-slate-200"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => toggleKeyVisibility('courier')}
                                            className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                                        >
                                            {showKeys.courier ? <EyeOff size={16} /> : <Eye size={16} />}
                                        </button>
                                    </div>
                                </div>

                                <div className="space-y-3">
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 text-left">사용자 ID / 업체코드</label>
                                    <input
                                        type="text"
                                        value={formData.courier_client_id}
                                        onChange={e => setFormData({ ...formData, courier_client_id: e.target.value })}
                                        className="w-full h-12 px-5 bg-slate-50 border-none rounded-xl font-bold text-sm focus:ring-4 focus:ring-blue-500/10 focus:bg-white transition-all ring-1 ring-inset ring-slate-200"
                                        placeholder="Client ID 또는 업체코드"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Tax Filing API Card */}
                        <div className="bg-white rounded-[2rem] shadow-xl shadow-slate-200/50 border border-slate-200 overflow-hidden ring-1 ring-slate-900/5 p-8 text-left transition-all">
                            <div className="flex justify-between items-center mb-6">
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center">
                                        <Shield size={20} />
                                    </div>
                                    <div className="flex flex-col">
                                        <div className="flex items-center gap-3">
                                            <h2 className="text-lg font-black text-slate-700 tracking-tight">Tax Filing API (Hometax Integration)</h2>
                                            <a href="https://www.hometax.go.kr/" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-violet-50 text-violet-600 text-[10px] font-black hover:bg-violet-100 transition-colors">
                                                <ExternalLink size={10} /> 홈택스 바로가기
                                            </a>
                                        </div>
                                        <p className="text-[11px] font-bold text-slate-400">부가가치세 및 종합소득세 신고 자동화 연동</p>
                                    </div>
                                </div>
                                <button
                                    onClick={handleSaveTax}
                                    disabled={isLoading}
                                    className="h-10 px-5 bg-violet-600 hover:bg-violet-500 text-white rounded-xl font-black text-xs flex items-center gap-2 shadow-lg shadow-violet-100 transition-all active:scale-[0.95]"
                                >
                                    <Save size={14} /> 저장
                                </button>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-3 col-span-1 md:col-span-2">
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 text-left">연동 서비스 (Tax Provider)</label>
                                    <div className="grid grid-cols-3 gap-3">
                                        {[
                                            { id: 'sim_hometax', name: '모의 신고 (Sim)' },
                                            { id: 'popbill', name: '팝빌 (Popbill)' },
                                            { id: 'smartbill', name: '스마트빌 (Smart)' }
                                        ].map(item => (
                                            <button
                                                key={item.id}
                                                type="button"
                                                onClick={() => setFormData({ ...formData, tax_provider: item.id })}
                                                className={`h-12 rounded-xl border-2 font-black text-[11px] transition-all
                                                ${formData.tax_provider === item.id
                                                        ? 'bg-violet-50 border-violet-500 text-violet-600 shadow-md transform -translate-y-0.5'
                                                        : 'bg-white border-slate-100 text-slate-400 hover:border-slate-200'}
                                            `}
                                            >
                                                {item.name}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="space-y-3">
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 text-left">API 인증키 (Secret Key)</label>
                                    <div className="relative group">
                                        <input
                                            type={showKeys.tax ? "text" : "password"}
                                            value={formData.tax_api_key}
                                            onChange={e => setFormData({ ...formData, tax_api_key: e.target.value })}
                                            className="w-full h-12 px-5 pr-12 bg-slate-50 border-none rounded-xl font-bold text-sm focus:ring-4 focus:ring-violet-500/10 focus:bg-white transition-all ring-1 ring-inset ring-slate-200"
                                            placeholder="연동 서비스의 API Key를 입력하세요"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => toggleKeyVisibility('tax')}
                                            className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                                        >
                                            {showKeys.tax ? <EyeOff size={16} /> : <Eye size={16} />}
                                        </button>
                                    </div>
                                </div>

                                <div className="space-y-3">
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 text-left">사업자번호 / 아이디</label>
                                    <input
                                        type="text"
                                        value={formData.tax_client_id}
                                        onChange={e => setFormData({ ...formData, tax_client_id: e.target.value })}
                                        className="w-full h-12 px-5 bg-slate-50 border-none rounded-xl font-bold text-sm focus:ring-4 focus:ring-violet-500/10 focus:bg-white transition-all ring-1 ring-inset ring-slate-200"
                                        placeholder="등록된 사업자 번호를 입력하세요"
                                    />
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

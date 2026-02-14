import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { invoke } from '@tauri-apps/api/core';
import { useModal } from '../../contexts/ModalContext';
import { useAdminGuard } from '../../hooks/useAdminGuard';
import {
    Building2,
    Save,
    Lock,
    Phone,
    FileText
} from 'lucide-react';

const SettingsCompany = () => {
    const navigate = useNavigate();
    const { showAlert } = useModal();
    const { isAuthorized, checkAdmin, isVerifying } = useAdminGuard();

    // --- State Management ---
    const [isLoading, setIsLoading] = useState(false);
    const [formData, setFormData] = useState({
        company_name: '',
        representative_name: '',
        phone_number: '',
        mobile_number: '',
        business_reg_number: '',
        registration_date: '',
        address: '',
        business_type: '',
        item: '',
        memo: '',
        certification_info: { gap: '', haccp: '', organic: '' }
    });

    // --- Admin Guard Check ---
    const checkRun = React.useRef(false);
    useEffect(() => {
        if (checkRun.current) return;
        checkRun.current = true;

        const init = async () => {
            const ok = await checkAdmin();
            if (!ok) {
                navigate('/');
            }
        }; init();
    }, []);

    // --- Data Loading ---
    useEffect(() => {
        if (isAuthorized) {
            const loadInfo = async () => {
                try {
                    const info = await invoke('get_company_info');
                    if (info) {
                        setFormData({
                            company_name: info.company_name || '',
                            representative_name: info.representative_name || '',
                            phone_number: info.phone_number || '',
                            mobile_number: info.mobile_number || '',
                            business_reg_number: info.business_reg_number || '',
                            registration_date: info.registration_date ? info.registration_date.substring(0, 10) : '',
                            address: info.address || '',
                            business_type: info.business_type || '',
                            item: info.item || '',
                            memo: info.memo || '',
                            certification_info: info.certification_info || { gap: '', haccp: '', organic: '' }
                        });
                    }
                } catch (err) {
                    console.error("Failed to load company info:", err);
                }
            };
            loadInfo();
        }
    }, [isAuthorized]);

    const handleSave = async (e) => {
        e.preventDefault();
        if (!formData.company_name.trim()) {
            showAlert('필수 입력', '업체명을 입력해주세요.');
            return;
        }

        setIsLoading(true);
        try {
            await invoke('save_company_info', {
                companyName: formData.company_name,
                representativeName: formData.representative_name || null,
                phoneNumber: formData.phone_number || null,
                mobileNumber: formData.mobile_number || null,
                businessRegNumber: formData.business_reg_number || null,
                registrationDate: formData.registration_date || null,
                address: formData.address || null,
                businessType: formData.business_type || null,
                item: formData.item || null,
                memo: formData.memo || null,
                certificationInfo: formData.certification_info
            });
            window.dispatchEvent(new Event('company-info-changed'));
            await showAlert('저장 완료', '업체 정보가 저장되었습니다.');
        } catch (err) {
            showAlert('저장 실패', '오류가 발생했습니다: ' + err);
        } finally {
            setIsLoading(false);
        }
    };

    if (!isAuthorized) {
        return (
            <div className="flex h-screen items-center justify-center bg-[#f8fafc]">
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
        <div className="flex flex-col h-full bg-[#f8fafc] overflow-hidden animate-in fade-in duration-700 relative text-left">
            {/* Local Modal Root */}
            <div id="local-modal-root" className="absolute inset-0 z-[9999] pointer-events-none" />

            {/* Main Content Area */}
            <div className="flex-1 px-6 lg:px-8 min-[2000px]:px-12 py-6 overflow-auto custom-scrollbar">
                <form onSubmit={handleSave} className="max-w-4xl mx-auto">
                    <div className="bg-white rounded-[2rem] shadow-xl shadow-slate-200/50 border border-slate-200 overflow-hidden ring-1 ring-slate-900/5 transition-all">

                        {/* Header Inside Card - Updated Title Style */}
                        <div className="px-8 py-6 border-b border-slate-50 bg-slate-50/30 flex justify-between items-center">
                            <div>
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="w-6 h-1 bg-indigo-600 rounded-full"></span>
                                    <span className="text-[9px] font-black tracking-[0.2em] text-indigo-600 uppercase">System Identity</span>
                                </div>
                                <h1 className="text-3xl font-black text-slate-600 tracking-tighter" style={{ fontFamily: '"Noto Sans KR", sans-serif' }}>
                                    업체 정보 관리 <span className="text-slate-300 font-light ml-1 text-xl">Management</span>
                                </h1>
                            </div>
                            <button
                                type="submit"
                                disabled={isLoading}
                                className="h-10 px-6 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-black text-xs flex items-center gap-2 shadow-lg shadow-indigo-200 transition-all active:scale-[0.98] disabled:opacity-50"
                            >
                                <Save size={16} /> {isLoading ? '저장 중...' : '설정 저장'}
                            </button>
                        </div>

                        {/* Section 1: Basic Info - Compact, No Icons in Inputs, Korean Labels */}
                        <div className="p-6 border-b border-slate-50">
                            <div className="flex items-center gap-2 mb-4">
                                <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                                    <Building2 size={16} />
                                </div>
                                <h2 className="text-lg font-black text-slate-700 tracking-tight">기본 사업자 정보</h2>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-left">
                                <div className="space-y-1">
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">업체명 (상호) <span className="text-rose-500">*</span></label>
                                    <input
                                        type="text"
                                        value={formData.company_name}
                                        onChange={e => setFormData({ ...formData, company_name: e.target.value })}
                                        className="w-full h-11 px-4 bg-slate-50 border-none rounded-xl font-bold text-sm text-slate-900 focus:ring-4 focus:ring-indigo-500/10 focus:bg-white transition-all ring-1 ring-inset ring-slate-200"
                                        placeholder="업체명을 입력하세요"
                                        required
                                    />
                                </div>

                                <div className="space-y-1">
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">대표자명</label>
                                    <input
                                        type="text"
                                        value={formData.representative_name}
                                        onChange={e => setFormData({ ...formData, representative_name: e.target.value })}
                                        className="w-full h-11 px-4 bg-slate-50 border-none rounded-xl font-bold text-sm text-slate-900 focus:ring-4 focus:ring-indigo-500/10 focus:bg-white transition-all ring-1 ring-inset ring-slate-200"
                                        placeholder="대표자 성함"
                                    />
                                </div>

                                <div className="space-y-1">
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">사업자등록번호</label>
                                    <input
                                        type="text"
                                        value={formData.business_reg_number}
                                        onChange={e => setFormData({ ...formData, business_reg_number: e.target.value })}
                                        className="w-full h-11 px-4 bg-slate-50 border-none rounded-xl font-bold text-sm text-slate-900 focus:ring-4 focus:ring-indigo-500/10 focus:bg-white transition-all ring-1 ring-inset ring-slate-200"
                                        placeholder="000-00-00000"
                                    />
                                </div>

                                <div className="space-y-1">
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">사업자 등록일 (개업연월일)</label>
                                    <input
                                        type="date"
                                        value={formData.registration_date}
                                        onChange={e => setFormData({ ...formData, registration_date: e.target.value })}
                                        className="w-full h-11 px-4 bg-slate-50 border-none rounded-xl font-bold text-sm text-slate-900 focus:ring-4 focus:ring-indigo-500/10 focus:bg-white transition-all ring-1 ring-inset ring-slate-200"
                                    />
                                </div>

                                <div className="space-y-1 col-span-1 md:col-span-2">
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">사업장 주소</label>
                                    <input
                                        type="text"
                                        value={formData.address}
                                        onChange={e => setFormData({ ...formData, address: e.target.value })}
                                        className="w-full h-11 px-4 bg-slate-50 border-none rounded-xl font-bold text-sm text-slate-900 focus:ring-4 focus:ring-indigo-500/10 focus:bg-white transition-all ring-1 ring-inset ring-slate-200"
                                        placeholder="사업장 소재지를 입력하세요"
                                    />
                                </div>

                                <div className="space-y-1">
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">업태</label>
                                    <input
                                        type="text"
                                        value={formData.business_type}
                                        onChange={e => setFormData({ ...formData, business_type: e.target.value })}
                                        className="w-full h-11 px-4 bg-slate-50 border-none rounded-xl font-bold text-sm text-slate-900 focus:ring-4 focus:ring-indigo-500/10 focus:bg-white transition-all ring-1 ring-inset ring-slate-200"
                                        placeholder="예: 도소매업, 농업"
                                    />
                                </div>

                                <div className="space-y-1">
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">종목</label>
                                    <input
                                        type="text"
                                        value={formData.item}
                                        onChange={e => setFormData({ ...formData, item: e.target.value })}
                                        className="w-full h-11 px-4 bg-slate-50 border-none rounded-xl font-bold text-sm text-slate-900 focus:ring-4 focus:ring-indigo-500/10 focus:bg-white transition-all ring-1 ring-inset ring-slate-200"
                                        placeholder="예: 버섯, 농산물"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Section 2: Contact Info - Compact, No Icons in Inputs, Korean Labels */}
                        <div className="p-6 bg-slate-50/30 border-b border-slate-50 text-left">
                            <div className="flex items-center gap-2 mb-4">
                                <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                                    <Phone size={16} />
                                </div>
                                <h2 className="text-lg font-black text-slate-700 tracking-tight">연락처 정보</h2>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">대표 전화번호</label>
                                    <input
                                        type="tel"
                                        value={formData.phone_number}
                                        onChange={e => setFormData({ ...formData, phone_number: e.target.value })}
                                        className="w-full h-11 px-4 bg-white border-none rounded-xl font-bold text-sm text-slate-900 focus:ring-4 focus:ring-indigo-500/10 transition-all ring-1 ring-inset ring-slate-200"
                                        placeholder="02-000-0000"
                                    />
                                </div>

                                <div className="space-y-1">
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">휴대전화번호</label>
                                    <input
                                        type="tel"
                                        value={formData.mobile_number}
                                        onChange={e => setFormData({ ...formData, mobile_number: e.target.value })}
                                        className="w-full h-11 px-4 bg-white border-none rounded-xl font-bold text-sm text-slate-900 focus:ring-4 focus:ring-indigo-500/10 transition-all ring-1 ring-inset ring-slate-200"
                                        placeholder="010-0000-0000"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Section 2.5: Certification Info - GAP/HACCP */}
                        <div className="p-6 bg-white border-b border-slate-50 text-left">
                            <div className="flex items-center gap-2 mb-4">
                                <div className="w-8 h-8 rounded-lg bg-teal-50 text-teal-600 flex items-center justify-center">
                                    <CheckCircle size={16} />
                                </div>
                                <h2 className="text-lg font-black text-slate-700 tracking-tight">인증 및 품질 관리 정보</h2>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="space-y-1">
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 text-teal-600">GAP 인증번호</label>
                                    <input
                                        type="text"
                                        value={formData.certification_info.gap}
                                        onChange={e => setFormData({ ...formData, certification_info: { ...formData.certification_info, gap: e.target.value } })}
                                        className="w-full h-11 px-4 bg-slate-50 border-none rounded-xl font-bold text-sm text-slate-900 focus:ring-4 focus:ring-teal-500/10 transition-all ring-1 ring-inset ring-slate-200"
                                        placeholder="GAP 인증번호 입력"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 text-teal-600">HACCP 인증번호</label>
                                    <input
                                        type="text"
                                        value={formData.certification_info.haccp}
                                        onChange={e => setFormData({ ...formData, certification_info: { ...formData.certification_info, haccp: e.target.value } })}
                                        className="w-full h-11 px-4 bg-slate-50 border-none rounded-xl font-bold text-sm text-slate-900 focus:ring-4 focus:ring-teal-500/10 transition-all ring-1 ring-inset ring-slate-200"
                                        placeholder="HACCP 인증번호 입력"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 text-teal-600">친환경/무농약 인증번호</label>
                                    <input
                                        type="text"
                                        value={formData.certification_info.organic}
                                        onChange={e => setFormData({ ...formData, certification_info: { ...formData.certification_info, organic: e.target.value } })}
                                        className="w-full h-11 px-4 bg-slate-50 border-none rounded-xl font-bold text-sm text-slate-900 focus:ring-4 focus:ring-teal-500/10 transition-all ring-1 ring-inset ring-slate-200"
                                        placeholder="인증번호 입력"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Section 3: Additional Info - Compact, Korean Labels */}
                        <div className="p-6 text-left">
                            <div className="flex items-center gap-2 mb-4">
                                <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                                    <FileText size={16} />
                                </div>
                                <h2 className="text-lg font-black text-slate-700 tracking-tight">기타 메모</h2>
                            </div>

                            <div className="space-y-1">
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">업체 설명 / 메모</label>
                                <textarea
                                    value={formData.memo}
                                    onChange={e => setFormData({ ...formData, memo: e.target.value })}
                                    className="w-full p-4 bg-slate-50 border-none rounded-2xl font-bold text-sm text-slate-900 focus:ring-4 focus:ring-indigo-500/10 focus:bg-white transition-all ring-1 ring-inset ring-slate-200 resize-none custom-scrollbar min-h-[100px]"
                                    placeholder="업체에 대한 추가 정보나 메모를 입력하세요"
                                ></textarea>
                            </div>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default SettingsCompany;

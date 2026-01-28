import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useModal } from '../../contexts/ModalContext';
import { useAdminGuard } from '../../hooks/useAdminGuard';
import {
    Building2,
    Save,
    Lock,
    Phone,
    Smartphone,
    User,
    CreditCard,
    Calendar,
    FileText
} from 'lucide-react';

const SettingsCompany = () => {
    const { showAlert } = useModal();
    const { isAuthorized, checkAdmin } = useAdminGuard();

    // --- State Management ---
    const [isLoading, setIsLoading] = useState(false);
    const [formData, setFormData] = useState({
        company_name: '',
        representative_name: '',
        phone_number: '',
        mobile_number: '',
        business_reg_number: '',
        registration_date: '',
        memo: ''
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
                            memo: info.memo || ''
                        });
                    }
                } catch (err) {
                    console.error("Failed to load company info:", err);
                }
            };
            loadInfo();
        }
    }, [isAuthorized]);

    // --- Handlers ---
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
                memo: formData.memo || null
            });
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
                            <span className="text-[9px] font-black tracking-[0.2em] text-indigo-600 uppercase">System Identity</span>
                        </div>
                        <h1 className="text-3xl font-black text-slate-600 tracking-tighter" style={{ fontFamily: '"Noto Sans KR", sans-serif' }}>
                            업체 정보 설정 <span className="text-slate-300 font-light ml-1 text-xl">Company Profile</span>
                        </h1>
                    </div>
                </div>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 px-6 lg:px-8 min-[2000px]:px-12 pb-8 overflow-auto custom-scrollbar">
                <form onSubmit={handleSave} className="max-w-4xl mx-auto py-6">
                    <div className="bg-white rounded-[2.5rem] shadow-xl shadow-slate-200/50 border border-slate-200 overflow-hidden ring-1 ring-slate-900/5 transition-all">

                        {/* Section 1: Basic Info */}
                        <div className="p-10 border-b border-slate-50">
                            <div className="flex items-center gap-3 mb-8">
                                <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                                    <Building2 size={20} />
                                </div>
                                <h2 className="text-xl font-black text-slate-700 tracking-tight">기본 사업자 정보</h2>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-left">
                                <div className="space-y-2">
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Company Name <span className="text-rose-500">*</span></label>
                                    <div className="relative group">
                                        <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-indigo-500 transition-colors" size={18} />
                                        <input
                                            type="text"
                                            value={formData.company_name}
                                            onChange={e => setFormData({ ...formData, company_name: e.target.value })}
                                            className="w-full h-14 pl-12 pr-6 bg-slate-50 border-none rounded-2xl font-bold text-base focus:ring-4 focus:ring-indigo-500/10 focus:bg-white transition-all ring-1 ring-inset ring-slate-200"
                                            placeholder="업체명을 입력하세요"
                                            required
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Representative</label>
                                    <div className="relative group">
                                        <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-indigo-500 transition-colors" size={18} />
                                        <input
                                            type="text"
                                            value={formData.representative_name}
                                            onChange={e => setFormData({ ...formData, representative_name: e.target.value })}
                                            className="w-full h-14 pl-12 pr-6 bg-slate-50 border-none rounded-2xl font-bold text-base focus:ring-4 focus:ring-indigo-500/10 focus:bg-white transition-all ring-1 ring-inset ring-slate-200"
                                            placeholder="대표자 성함"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Business Reg No.</label>
                                    <div className="relative group">
                                        <CreditCard className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-indigo-500 transition-colors" size={18} />
                                        <input
                                            type="text"
                                            value={formData.business_reg_number}
                                            onChange={e => setFormData({ ...formData, business_reg_number: e.target.value })}
                                            className="w-full h-14 pl-12 pr-6 bg-slate-50 border-none rounded-2xl font-bold text-base focus:ring-4 focus:ring-indigo-500/10 focus:bg-white transition-all ring-1 ring-inset ring-slate-200"
                                            placeholder="000-00-00000"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Registration Date</label>
                                    <div className="relative group">
                                        <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-indigo-500 transition-colors" size={18} />
                                        <input
                                            type="date"
                                            value={formData.registration_date}
                                            onChange={e => setFormData({ ...formData, registration_date: e.target.value })}
                                            className="w-full h-14 pl-12 pr-6 bg-slate-50 border-none rounded-2xl font-bold text-base focus:ring-4 focus:ring-indigo-500/10 focus:bg-white transition-all ring-1 ring-inset ring-slate-200"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Section 2: Contact Info */}
                        <div className="p-10 bg-slate-50/30 border-b border-slate-50 text-left">
                            <div className="flex items-center gap-3 mb-8">
                                <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                                    <Phone size={20} />
                                </div>
                                <h2 className="text-xl font-black text-slate-700 tracking-tight">연락처 정보</h2>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div className="space-y-2">
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Office Phone</label>
                                    <div className="relative group">
                                        <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-indigo-500 transition-colors" size={18} />
                                        <input
                                            type="tel"
                                            value={formData.phone_number}
                                            onChange={e => setFormData({ ...formData, phone_number: e.target.value })}
                                            className="w-full h-14 pl-12 pr-6 bg-white border-none rounded-2xl font-bold text-base focus:ring-4 focus:ring-indigo-500/10 transition-all ring-1 ring-inset ring-slate-200"
                                            placeholder="02-000-0000"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Mobile Phone</label>
                                    <div className="relative group">
                                        <Smartphone className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-indigo-500 transition-colors" size={18} />
                                        <input
                                            type="tel"
                                            value={formData.mobile_number}
                                            onChange={e => setFormData({ ...formData, mobile_number: e.target.value })}
                                            className="w-full h-14 pl-12 pr-6 bg-white border-none rounded-2xl font-bold text-base focus:ring-4 focus:ring-indigo-500/10 transition-all ring-1 ring-inset ring-slate-200"
                                            placeholder="010-0000-0000"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Section 3: Additional Info */}
                        <div className="p-10 text-left">
                            <div className="flex items-center gap-3 mb-8">
                                <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                                    <FileText size={20} />
                                </div>
                                <h2 className="text-xl font-black text-slate-700 tracking-tight">기타 메모</h2>
                            </div>

                            <div className="space-y-2">
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Company Description / Memo</label>
                                <textarea
                                    rows="4"
                                    value={formData.memo}
                                    onChange={e => setFormData({ ...formData, memo: e.target.value })}
                                    className="w-full p-6 bg-slate-50 border-none rounded-[2rem] font-bold text-base focus:ring-4 focus:ring-indigo-500/10 focus:bg-white transition-all ring-1 ring-inset ring-slate-200 resize-none custom-scrollbar"
                                    placeholder="업체에 대한 추가 정보나 메모를 입력하세요"
                                ></textarea>
                            </div>
                        </div>

                        {/* Footer Action */}
                        <div className="px-10 py-8 bg-slate-50/50 border-t border-slate-100 flex justify-end">
                            <button
                                type="submit"
                                disabled={isLoading}
                                className="h-16 px-12 bg-indigo-600 hover:bg-indigo-500 text-white rounded-[1.25rem] font-black text-lg flex items-center gap-3 shadow-xl shadow-indigo-200 transition-all active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100"
                            >
                                <Save size={24} /> {isLoading ? '저장 중...' : '설정 저장하기'}
                            </button>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default SettingsCompany;

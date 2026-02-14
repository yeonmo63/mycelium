import React, { useState, useEffect, useRef, useCallback } from 'react';
import { formatPhoneNumber, formatCurrency } from '../../utils/common';
import { useModal } from '../../contexts/ModalContext';
import { invokeAI } from '../../utils/aiErrorHandler';

/**
 * CustomerList.jsx
 * "고객 조회/수정/휴면" - 프리미엄 UI 및 강화된 CRM 기능
 */
const CustomerList = () => {
    const { showAlert, showConfirm } = useModal();

    // --- State Management ---
    const initialFormState = {
        id: '',
        name: '',
        level: '일반',
        joinDate: '',
        email: '',
        zip: '',
        addr1: '',
        addr2: '',
        phone: '',
        mobile: '',
        marketingConsent: false,
        anniversaryDate: '',
        anniversaryType: '',
        acquisition: '',
        purchaseCycle: '',
        prefProduct: '',
        prefPackage: '',
        subInterest: false,
        familyType: '',
        healthConcern: '',
        memo: '',
        status: '정상'
    };

    const [mode, setMode] = useState('view'); // 'view' | 'edit'
    const [searchTerm, setSearchTerm] = useState('');
    const [customer, setCustomer] = useState(null);
    const [isProcessing, setIsProcessing] = useState(false);

    // Form State
    const [formData, setFormData] = useState(initialFormState);
    const [addresses, setAddresses] = useState([]);
    const [salesHistory, setSalesHistory] = useState([]);

    // UI States
    const [isSalesModalOpen, setIsSalesModalOpen] = useState(false);
    const [isAiModalOpen, setIsAiModalOpen] = useState(false);
    const [aiInsight, setAiInsight] = useState(null);
    const [showAddrLayer, setShowAddrLayer] = useState(false);
    const [isAddressModalOpen, setIsAddressModalOpen] = useState(false);
    const [isLogsModalOpen, setIsLogsModalOpen] = useState(false);
    const [customerLogs, setCustomerLogs] = useState([]);

    // Search Results Selection
    const [searchResults, setSearchResults] = useState([]);
    const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);

    const searchInputRef = useRef(null);

    useEffect(() => {
        if (searchInputRef.current) searchInputRef.current.focus();
    }, []);

    // --- Logic: Search ---
    const handleSearch = async (e) => {
        e?.preventDefault();
        if (!searchTerm) {
            await showAlert("알림", "이름 또는 전화번호를 입력해주세요.");
            return;
        }

        setIsProcessing(true);
        try {
            const invoke = window.__TAURI__.core.invoke;
            let results = [];
            if (/[0-9]/.test(searchTerm)) {
                results = await invoke('search_customers_by_mobile', { mobile: searchTerm });
            }
            if (results.length === 0) {
                results = await invoke('search_customers_by_name', { name: searchTerm });
            }

            if (results.length === 0) {
                await showAlert("결과 없음", "검색 결과가 없습니다.");
            } else if (results.length === 1) {
                loadCustomer(results[0]);
            } else {
                setSearchResults(results);
                setIsSearchModalOpen(true);
            }
        } catch (err) {
            await showAlert("오류", "조회 실패: " + err);
        } finally {
            setIsProcessing(false);
        }
    };

    const loadAddresses = async (cid) => {
        try {
            const list = await window.__TAURI__.core.invoke('get_customer_addresses', { customerId: cid });
            setAddresses(list || []);
        } catch (e) { console.error(e); }
    };

    const loadCustomerLogs = async (cid) => {
        if (!cid) return;
        try {
            const logs = await window.__TAURI__.core.invoke('get_customer_logs', { customerId: cid });
            setCustomerLogs(logs);
            setIsLogsModalOpen(true);
        } catch (e) {
            console.error(e);
            showAlert("오류", "변경 이력을 불러오지 못했습니다.");
        }
    };

    const loadCustomer = useCallback(async (c) => {
        setCustomer(c);
        setMode('view');
        setFormData({
            id: c.customer_id,
            name: c.customer_name,
            level: c.membership_level,
            joinDate: c.join_date,
            email: c.email || '',
            zip: c.zip_code || '',
            addr1: c.address_primary || '',
            addr2: c.address_detail || '',
            phone: c.phone_number || '',
            mobile: c.mobile_number || '',
            marketingConsent: c.marketing_consent === true || c.marketing_consent === 'true',
            anniversaryDate: c.anniversary_date || '',
            anniversaryType: c.anniversary_type || '',
            acquisition: c.acquisition_channel || '',
            purchaseCycle: c.purchase_cycle || '',
            prefProduct: c.pref_product_type || '',
            prefPackage: c.pref_package_type || '',
            subInterest: c.sub_interest === true || c.sub_interest === 'true',
            familyType: c.family_type || '',
            healthConcern: c.health_concern || '',
            memo: c.memo || '',
            status: c.status || '정상'
        });
        loadAddresses(c.customer_id);
    }, []);

    const handleUpdate = async (e) => {
        if (e) e.preventDefault();
        if (!customer) {
            await showAlert("알림", "먼저 고객을 조회해주세요.");
            return;
        }
        if (mode === 'view') {
            setMode('edit');
            return;
        }
        if (!await showConfirm("수정", "정말로 저장하시겠습니까?")) return;
        setIsProcessing(true);
        try {
            const payload = {
                customerId: formData.id,
                customerName: formData.name,
                mobileNumber: formData.mobile,
                membershipLevel: formData.level,
                phoneNumber: formData.phone || null,
                email: formData.email || null,
                zipCode: formData.zip || null,
                addressPrimary: formData.addr1 || null,
                addressDetail: formData.addr2 || null,
                memo: formData.memo || null,
                anniversaryDate: formData.anniversaryDate || null,
                anniversaryType: formData.anniversaryType || null,
                marketingConsent: formData.marketingConsent,
                acquisitionChannel: formData.acquisition || null,
                status: formData.status
            };
            await window.__TAURI__.core.invoke('update_customer', payload);
            await showAlert("성공", "수정되었습니다.");
            setMode('view');
            const fresh = await window.__TAURI__.core.invoke('get_customer', { customerId: formData.id });
            if (fresh) loadCustomer(fresh);
        } catch (err) { await showAlert("오류", "수정 실패: " + err); } finally { setIsProcessing(false); }
    };

    const handleDelete = async () => {
        if (!customer) {
            await showAlert("알림", "휴면 처리할 고객이 조회되지 않았습니다.");
            return;
        }
        if (!await showConfirm("휴면 전환", "정말로 이 고객을 휴면 고객으로 전환하시겠습니까?\n고객 정보는 보관되지만, '정상' 고객 검색 결과에서 제외됩니다.")) return;
        setIsProcessing(true);
        try {
            await window.__TAURI__.core.invoke('delete_customer', { customerId: customer.customer_id });
            await showAlert("성공", "휴면 고객으로 전환되었습니다.");
            handleReset();
        } catch (err) { await showAlert("오류", "휴면 전환 실패: " + err); } finally { setIsProcessing(false); }
    };

    const handleReactivate = async () => {
        if (!customer) return;
        if (!await showConfirm("정상 전환", "이 고객을 다시 '정상' 고객으로 전환하시겠습니까?")) return;
        setIsProcessing(true);
        try {
            await window.__TAURI__.core.invoke('reactivate_customer', { customerId: customer.customer_id });
            await showAlert("성공", "정상 고객으로 전환되었습니다.");
            const fresh = await window.__TAURI__.core.invoke('get_customer', { customerId: customer.customer_id });
            if (fresh) loadCustomer(fresh);
        } catch (err) { await showAlert("오류", "전환 실패: " + err); } finally { setIsProcessing(false); }
    };

    const handleReset = () => {
        setCustomer(null);
        setFormData(initialFormState);
        setSearchTerm('');
        setAddresses([]);
        setSalesHistory([]);
        setMode('view');
        if (searchInputRef.current) searchInputRef.current.focus();
    };

    const handleAddressSync = () => {
        if (mode === 'view') return;
        setShowAddrLayer(true);
        setTimeout(() => {
            new window.daum.Postcode({
                oncomplete: (data) => {
                    setFormData(prev => ({ ...prev, zip: data.zonecode, addr1: data.address }));
                    setShowAddrLayer(false);
                },
                width: '100%', height: '100%'
            }).embed(document.getElementById('addr-layer-list-edit'));
        }, 100);
    };

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        let val = type === 'checkbox' ? checked : value;
        if (name === 'mobile' || name === 'phone') val = formatPhoneNumber(val);
        setFormData(prev => ({ ...prev, [name]: val }));
    };

    const handleModalAddressSearch = () => {
        setShowAddrLayer(true);
        setTimeout(() => {
            new window.daum.Postcode({
                oncomplete: (data) => {
                    setEditingAddress(prev => ({ ...prev, zip_code: data.zonecode, address_primary: data.address }));
                    setShowAddrLayer(false);
                },
                width: '100%', height: '100%'
            }).embed(document.getElementById('addr-layer-list-edit'));
        }, 100);
    };

    return (
        <div className="flex flex-col h-full bg-[#f8fafc] overflow-hidden animate-in fade-in duration-700">
            {/* Header Area - Fixed */}
            <div className="px-6 lg:px-8 pt-6 pb-2 shrink-0">
                <div className="flex items-center gap-2 mb-0.5">
                    <span className="w-6 h-1 bg-indigo-600 rounded-full"></span>
                    <span className="text-xs font-black tracking-[0.2em] text-indigo-600 uppercase">Customer Relationship Management</span>
                </div>
                <h1 className="text-3xl font-black text-slate-600 tracking-tighter mb-4" style={{ fontFamily: '"Noto Sans KR", sans-serif' }}>
                    조회/수정/휴면 관리 <span className="text-slate-400 font-light ml-2 text-xl">Inquiry & Management</span>
                </h1>

                <div className="flex justify-between items-center">
                    <form onSubmit={handleSearch} className="flex gap-2">
                        <input
                            ref={searchInputRef}
                            type="text"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            placeholder="이름 또는 전화번호 입력 후 Enter"
                            className="w-80 h-10 px-4 rounded-xl bg-white border border-slate-300 focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all font-bold text-slate-800 shadow-sm text-sm"
                        />
                        <button type="submit" disabled={isProcessing} className="h-10 px-6 rounded-xl bg-indigo-600 text-white font-black hover:bg-indigo-500 transition-all shadow-lg shadow-indigo-200 flex items-center gap-2">
                            {isProcessing ? <span className="material-symbols-rounded animate-spin">refresh</span> : <span className="material-symbols-rounded">person_search</span>}
                            조회하기
                        </button>
                    </form>

                    <div className={`px-4 py-1.5 rounded-full border font-black text-xs shadow-sm flex items-center gap-2 transition-all ${mode === 'view' ? 'bg-slate-100 border-slate-200 text-slate-500' : 'bg-amber-50 border-amber-200 text-amber-600 shadow-amber-100'}`}>
                        <span className={`material-symbols-rounded text-base ${mode === 'view' ? 'text-slate-400' : 'text-amber-500'}`}>{mode === 'view' ? 'visibility' : 'edit_square'}</span>
                        {mode === 'view' ? '조회 모드' : '수정 모드'}
                    </div>
                </div>
            </div>

            {/* 4. Main Content Area - Width synced with Header/Footer */}
            <div className="flex-1 overflow-hidden bg-slate-50 px-6 lg:px-8 py-4 flex flex-col">
                <div className="space-y-4 overflow-y-auto custom-gray-scrollbar flex-1 p-1">
                    {/* 1. 기본 인적 사항 */}
                    <div className={`bg-white rounded-2xl p-4 shadow-sm border transition-all ${mode === 'edit' ? 'border-indigo-500 shadow-lg' : 'border-slate-100'}`}>
                        <h3 className="text-sm font-black text-slate-800 mb-3 flex items-center gap-2">
                            <span className="w-1.5 h-3.5 bg-indigo-600 rounded-full"></span>
                            기본 인적 사항
                            {mode === 'edit' && <span className="text-amber-500 text-[10px] uppercase ml-2 px-1.5 py-0.5 bg-amber-50 rounded-full font-black">Edit</span>}
                            {formData.status === '말소' && <span className="text-rose-600 text-[10px] uppercase ml-2 px-2 py-0.5 bg-rose-50 rounded-full font-black flex items-center gap-1 border border-rose-100 animate-pulse"><span className="material-symbols-rounded text-xs">block</span> 휴면 고객</span>}
                        </h3>
                        <div className="grid grid-cols-12 gap-2.5">
                            <div className="col-span-2 space-y-0.5">
                                <label className="text-xs font-black text-slate-500 uppercase ml-1">성함</label>
                                <input name="name" value={formData.name || ''} onChange={handleChange} readOnly={mode === 'view'}
                                    className={`w-full h-11 rounded-lg font-bold px-3 text-sm transition-all border text-black bg-white ${mode === 'view' ? 'border-slate-300' : 'border-slate-400 focus:ring-2 focus:ring-indigo-500 shadow-sm'}`} />
                            </div>
                            <div className="col-span-2 space-y-0.5">
                                <label className="text-xs font-black text-slate-500 uppercase ml-1">회원 등급</label>
                                <select name="level" value={formData.level || '일반'} onChange={handleChange} disabled={mode === 'view'}
                                    className={`w-full h-11 rounded-lg font-bold px-3 text-sm border text-black bg-white ${mode === 'view' ? 'border-slate-300' : 'border-slate-400 focus:ring-2 focus:ring-indigo-500 shadow-sm'}`}>
                                    <option value="일반">일반</option><option value="VIP">VIP</option><option value="VVIP">VVIP</option><option value="법인/단체">법인/단체</option>
                                </select>
                            </div>
                            <div className="col-span-6 space-y-0.5">
                                <label className="text-xs font-black text-slate-500 uppercase ml-1">이메일</label>
                                <input type="email" name="email" value={formData.email || ''} onChange={handleChange} readOnly={mode === 'view'}
                                    className={`w-full h-11 rounded-lg font-bold px-3 text-sm border text-black bg-white ${mode === 'view' ? 'border-slate-300' : 'border-slate-400'}`} />
                            </div>
                            <div className="col-span-2 flex items-end">
                                <label className={`flex items-center gap-2 px-3 h-11 rounded-lg w-full border transition-all ${formData.marketingConsent ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-slate-50 border-slate-200 text-slate-400'}`}>
                                    <input type="checkbox" name="marketingConsent" checked={formData.marketingConsent || false} onChange={handleChange} disabled={mode === 'view'} className="w-4 h-4 rounded text-indigo-600" />
                                    <span className="text-xs font-black">수신동의</span>
                                </label>
                            </div>
                        </div>
                        <div className="grid grid-cols-12 gap-2.5 mt-2">
                            <div className="col-span-2 space-y-0.5">
                                <label className="text-xs font-black text-slate-500 uppercase ml-1">우편번호</label>
                                <input value={formData.zip || ''} readOnly onClick={handleAddressSync}
                                    className={`w-full h-11 rounded-lg font-black text-center text-sm border text-black bg-white shadow-sm ${mode === 'view' ? 'border-slate-300' : 'border-slate-400 cursor-pointer'}`} />
                            </div>
                            <div className="col-span-5 space-y-0.5">
                                <label className="text-xs font-black text-slate-500 uppercase ml-1">기본 주소</label>
                                <input value={formData.addr1 || ''} readOnly onClick={handleAddressSync}
                                    className={`w-full h-11 rounded-lg font-bold px-3 text-sm border text-black bg-white shadow-sm ${mode === 'view' ? 'border-slate-300' : 'border-slate-400 cursor-pointer'}`} />
                            </div>
                            <div className="col-span-5 space-y-0.5">
                                <label className="text-xs font-black text-slate-500 uppercase ml-1">상세 주소</label>
                                <input name="addr2" value={formData.addr2 || ''} onChange={handleChange} readOnly={mode === 'view'}
                                    className={`w-full h-11 rounded-lg font-bold px-3 text-sm border text-black bg-white ${mode === 'view' ? 'border-slate-300' : 'border-slate-400 focus:ring-2 focus:ring-indigo-500 shadow-sm'}`} />
                            </div>
                        </div>
                        <div className="grid grid-cols-12 gap-2.5 mt-2">
                            <div className="col-span-3 space-y-0.5">
                                <label className="text-xs font-black text-slate-500 uppercase ml-1">휴대 전화</label>
                                <input name="mobile" value={formData.mobile || ''} onChange={handleChange} readOnly={mode === 'view'}
                                    className={`w-full h-11 rounded-lg font-black px-3 text-sm border text-black bg-white ${mode === 'view' ? 'border-slate-300' : 'border-slate-400 focus:ring-2 focus:ring-indigo-500 shadow-sm'}`} />
                            </div>
                            <div className="col-span-3 space-y-0.5">
                                <label className="text-xs font-black text-slate-500 uppercase ml-1">일반 전화</label>
                                <input name="phone" value={formData.phone || ''} onChange={handleChange} readOnly={mode === 'view'}
                                    className={`w-full h-11 rounded-lg font-bold px-3 text-sm border text-black bg-white ${mode === 'view' ? 'border-slate-300' : 'border-slate-400'}`} />
                            </div>
                        </div>
                    </div>

                    {/* 2. CRM 및 고객 취향 정보 */}
                    <div className={`bg-white rounded-2xl p-4 shadow-sm border transition-all ${mode === 'edit' ? 'border-indigo-500 shadow-lg' : 'border-slate-100'}`}>
                        <h3 className="text-sm font-black text-slate-800 mb-3 flex items-center gap-2">
                            <span className="w-1.5 h-3.5 bg-indigo-600 rounded-full"></span>
                            CRM 및 고객 취향 정보
                        </h3>
                        <div className="grid grid-cols-4 gap-2.5">
                            <div className="space-y-0.5">
                                <label className="text-xs font-black text-slate-500 uppercase ml-1">주요 기념일</label>
                                <input type="date" name="anniversaryDate" value={formData.anniversaryDate || ''} onChange={handleChange} readOnly={mode === 'view'}
                                    className={`w-full h-11 rounded-lg font-bold px-3 text-sm border text-black bg-white ${mode === 'view' ? 'border-slate-300' : 'border-slate-400'}`} />
                            </div>
                            <div className="space-y-0.5">
                                <label className="text-xs font-black text-slate-500 uppercase ml-1">기념일 종류</label>
                                <select name="anniversaryType" value={formData.anniversaryType || ''} onChange={handleChange} disabled={mode === 'view'}
                                    className={`w-full h-11 rounded-lg font-bold px-3 text-sm border text-black bg-white ${mode === 'view' ? 'border-slate-300' : 'border-slate-400'}`}>
                                    <option value="">안함</option><option value="생일">생일</option><option value="결혼기념일">결혼기념일</option><option value="기타">기타</option>
                                </select>
                            </div>
                            <div className="space-y-0.5">
                                <label className="text-xs font-black text-slate-500 uppercase ml-1">선호 상품군</label>
                                <select name="prefProduct" value={formData.prefProduct || ''} onChange={handleChange} disabled={mode === 'view'}
                                    className={`w-full h-11 rounded-lg font-bold px-3 text-sm border text-black bg-white ${mode === 'view' ? 'border-slate-300' : 'border-slate-400'}`}>
                                    <option value="">안함</option><option value="생버섯">생버섯</option><option value="건버섯">건버섯</option><option value="가공품">가공품</option><option value="체험 프로그램">체험 프로그램</option>
                                </select>
                            </div>
                            <div className="flex items-end">
                                <label className={`flex items-center gap-2 px-3 h-11 rounded-lg w-full border transition-all ${formData.subInterest ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-slate-50 border-slate-200 text-slate-400'}`}>
                                    <input type="checkbox" name="subInterest" checked={formData.subInterest || false} onChange={handleChange} disabled={mode === 'view'} className="w-4 h-4 rounded text-indigo-600" />
                                    <span className="text-xs font-black">정기 서비스 관심</span>
                                </label>
                            </div>
                        </div>
                    </div>

                    {/* 3. 추가 배송지 관리 */}
                    <div className={`bg-white rounded-2xl p-4 shadow-sm border transition-all overflow-hidden ${mode === 'edit' ? 'border-indigo-500 shadow-lg' : 'border-slate-100'}`}>
                        <div className="flex justify-between items-center mb-3">
                            <h3 className="text-sm font-black text-black flex items-center gap-2">
                                <span className="w-1.5 h-3.5 bg-indigo-600 rounded-full"></span>
                                추가 배송지 관리
                            </h3>
                            <button type="button" disabled={mode === 'view' || !customer} onClick={() => { setEditingAddress({}); setIsAddressModalOpen(true); }} className="h-7 px-3 rounded-lg bg-indigo-50 text-indigo-600 font-bold hover:bg-indigo-100 transition-all flex items-center gap-1.5 text-[10px] border border-indigo-100 disabled:opacity-30">
                                <span className="material-symbols-rounded text-base">add_location</span> 배송지 추가
                            </button>
                        </div>
                        <div className="overflow-x-auto border border-slate-200 rounded-xl">
                            <table className="w-full text-left text-sm">
                                <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                                    <tr>
                                        <th className="px-4 py-2.5 font-black uppercase text-xs">구분</th>
                                        <th className="px-4 py-2.5 font-black uppercase text-xs">수령인</th>
                                        <th className="px-4 py-2.5 font-black uppercase text-xs">연락처</th>
                                        <th className="px-4 py-2.5 font-black uppercase text-xs">주소 정보</th>
                                        <th className="px-4 py-2.5 font-black uppercase text-xs text-center">기본</th>
                                        <th className="px-4 py-2.5 font-black uppercase text-xs text-center">작업</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {addresses.map((addr) => (
                                        <tr key={addr.address_id} className="hover:bg-slate-50 transition-colors">
                                            <td className="px-4 py-2.5"><span className={`px-2 py-0.5 rounded text-[10px] font-black ${addr.address_alias === '기본' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'}`}>{addr.address_alias}</span></td>
                                            <td className="px-4 py-2.5 font-black text-slate-700">{addr.recipient_name}</td>
                                            <td className="px-4 py-2.5 font-bold text-slate-500">{addr.mobile_number}</td>
                                            <td className="px-4 py-2.5 text-slate-500">({addr.zip_code}) {addr.address_primary}</td>
                                            <td className="px-4 py-2.5 text-center">
                                                <input type="radio" checked={addr.is_default} onChange={async () => {
                                                    if (mode === 'view' || !customer) return;
                                                    try {
                                                        await window.__TAURI__.core.invoke('set_default_customer_address', { customerId: customer.customer_id, addressId: addr.address_id });
                                                        loadAddresses(customer.customer_id);
                                                        const fresh = await window.__TAURI__.core.invoke('get_customer', { customerId: customer.customer_id });
                                                        if (fresh) loadCustomer(fresh);
                                                    } catch (e) { showAlert("오류", "설정 실패"); }
                                                }} disabled={mode === 'view' || !customer} className="w-3.5 h-3.5 text-indigo-600" />
                                            </td>
                                            <td className="px-4 py-2 text-center">
                                                <div className="flex justify-center gap-1">
                                                    <button type="button" disabled={mode === 'view' || addr.address_alias === '기본'} onClick={() => { setEditingAddress(addr); setIsAddressModalOpen(true); }} className="w-7 h-7 rounded bg-white border border-slate-200 text-slate-400 hover:text-indigo-600 disabled:opacity-20"><span className="material-symbols-rounded text-sm">edit</span></button>
                                                    <button type="button" disabled={mode === 'view' || addr.address_alias === '기본'} onClick={async () => { if (await showConfirm("삭제", "정말 삭제하시겠습니까?")) { await window.__TAURI__.core.invoke('delete_customer_address', { addressId: addr.address_id }); loadAddresses(customer.customer_id); } }} className="w-7 h-7 rounded bg-white border border-slate-200 text-slate-400 hover:text-rose-600 disabled:opacity-20"><span className="material-symbols-rounded text-sm">delete</span></button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                    {addresses.length === 0 && (
                                        <tr><td colSpan="6" className="px-4 py-5 text-center text-slate-300 font-bold italic">정보 없음</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* 4. 고객 상세 메모 (특이사항) */}
                    <div className={`bg-white rounded-2xl p-4 shadow-sm border transition-all ${mode === 'edit' ? 'border-indigo-500 shadow-lg' : 'border-slate-100'}`}>
                        <h3 className="text-sm font-black text-slate-800 mb-3 flex items-center gap-2">
                            <span className="w-1.5 h-3.5 bg-indigo-600 rounded-full"></span>
                            고객 상세 메모 (특이사항)
                        </h3>
                        <textarea name="memo" value={formData.memo || ''} onChange={handleChange} readOnly={mode === 'view'} rows="2"
                            placeholder="상담 내용을 입력하세요."
                            className={`w-full rounded-xl font-bold p-3 transition-all resize-none shadow-inner h-24 text-sm border text-black bg-white ${mode === 'view' ? 'border-slate-300' : 'border-slate-400 focus:ring-2 focus:ring-indigo-500'}`} />
                    </div>
                </div>
            </div>

            {/* Fixed Footer Actions */}
            <div className="px-6 lg:px-8 py-4 border-t border-slate-100 bg-white/95 backdrop-blur-sm shrink-0 flex justify-between items-center">
                <div className="flex gap-2">
                    <button type="button" onClick={handleReset} className="h-10 px-6 rounded-xl bg-white border border-slate-200 text-slate-500 font-black hover:bg-slate-50 transition-all flex items-center gap-2 shadow-sm text-sm">
                        <span className="material-symbols-rounded text-lg">refresh</span> 화면 초기화
                    </button>

                    <div className="w-[1px] h-6 bg-slate-200 mx-1 self-center" />

                    <button type="button"
                        onClick={async () => {
                            if (!customer) return;
                            setIsProcessing(true);
                            try {
                                const res = await invokeAI(showAlert, 'get_customer_ai_insight', { customerId: customer.customer_id });
                                setAiInsight(res); setIsAiModalOpen(true);
                            } catch (e) {
                                if (e.message !== 'AI_QUOTA_EXCEEDED') {
                                    showAlert("오류", "AI 분석 실패: " + e);
                                }
                            }
                            finally { setIsProcessing(false); }
                        }}
                        disabled={!customer || isProcessing}
                        className={`h-10 px-4 rounded-xl font-bold text-xs flex items-center gap-2 border transition-all ${!customer ? 'bg-slate-50 border-slate-100 text-slate-200 cursor-not-allowed' : 'bg-indigo-50 text-indigo-600 border-indigo-100 hover:bg-indigo-100 shadow-sm'}`}>
                        <span className="material-symbols-rounded text-lg">psychology</span> AI 정밀 분석
                    </button>

                    <button type="button"
                        onClick={() => loadCustomerLogs(customer?.customer_id)}
                        disabled={!customer}
                        className="h-10 px-6 rounded-xl bg-white border border-slate-200 text-slate-600 font-black hover:bg-slate-50 transition-all flex items-center gap-2 shadow-sm text-sm disabled:opacity-50">
                        <span className="material-symbols-rounded text-lg">history</span> 변경 이력
                    </button>

                    <button type="button"
                        onClick={async () => {
                            if (!customer) return;
                            setIsProcessing(true);
                            try {
                                const res = await window.__TAURI__.core.invoke('get_sales_by_customer_id', { customerId: customer.customer_id });
                                setSalesHistory(res); setIsSalesModalOpen(true);
                            } catch (e) { showAlert("오류", "이력 조회 실패"); }
                            finally { setIsProcessing(false); }
                        }}
                        disabled={!customer || isProcessing}
                        className={`h-10 px-4 rounded-xl font-bold text-xs flex items-center gap-2 border transition-all ${!customer ? 'bg-slate-50 border-slate-100 text-slate-200 cursor-not-allowed' : 'bg-emerald-50 text-emerald-600 border-emerald-100 hover:bg-emerald-100 shadow-sm'}`}>
                        <span className="material-symbols-rounded text-lg">history</span> 주문 내역
                    </button>
                </div>

                <div className="flex gap-2">
                    <button type="button"
                        onClick={handleUpdate}
                        disabled={isProcessing}
                        className={`h-10 px-10 rounded-xl font-black transition-all shadow-md flex items-center gap-2 text-sm ${!customer ? 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none' : (mode === 'view' ? 'bg-amber-500 text-white hover:bg-amber-400 shadow-amber-200' : 'bg-indigo-600 text-white hover:bg-indigo-500 shadow-indigo-200')}`}>
                        <span className="material-symbols-rounded text-lg">{mode === 'view' ? 'edit' : (isProcessing ? 'sync' : 'save')}</span>
                        {mode === 'view' ? '고객 수정 모드' : '고객 정보 저장'}
                    </button>
                    <button type="button"
                        onClick={handleDelete}
                        disabled={!customer || mode !== 'edit' || isProcessing || formData.status === '말소'}
                        className={`h-10 px-6 rounded-xl font-black transition-all flex items-center gap-2 shadow-sm text-sm ${(!customer || mode !== 'edit' || formData.status === '말소') ? 'bg-slate-50 border-slate-100 text-slate-200 cursor-not-allowed shadow-none' : 'bg-white border-rose-200 text-rose-500 hover:bg-rose-50'}`}>
                        <span className="material-symbols-rounded text-lg">person_off</span> 휴면 고객 전환
                    </button>

                    {formData.status === '말소' && (
                        <button type="button"
                            onClick={handleReactivate}
                            disabled={isProcessing}
                            className="h-10 px-6 rounded-xl font-black transition-all flex items-center gap-2 shadow-lg bg-emerald-600 text-white hover:bg-emerald-500 shadow-emerald-200 text-sm animate-bounce">
                            <span className="material-symbols-rounded text-lg">person_check</span> 정상 고객 복구
                        </button>
                    )}
                </div>
            </div>

            {/* AI Insight Modal */}
            {
                isAiModalOpen && aiInsight && (
                    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 backdrop-blur-md bg-slate-900/40 animate-in fade-in duration-300">
                        <div className="relative w-full max-w-xl bg-white rounded-[2rem] shadow-2xl overflow-hidden animate-in zoom-in-95 text-left">
                            <div className="px-6 py-5 bg-indigo-600 text-white flex justify-between items-center relative overflow-hidden">
                                <h3 className="text-lg font-black flex items-center gap-3"><span className="material-symbols-rounded">auto_awesome</span> AI 고객 프로파일링</h3>
                                <button onClick={() => setIsAiModalOpen(false)} className="w-8 h-8 rounded-full hover:bg-white/10 flex items-center justify-center transition-colors"><span className="material-symbols-rounded">close</span></button>
                            </div>
                            <div className="p-6 space-y-4">
                                <div className="bg-indigo-50/50 p-4 rounded-2xl border border-indigo-100">
                                    <label className="text-[9px] font-black text-indigo-400 uppercase tracking-widest block mb-2 italic">Profile Keywords</label>
                                    <div className="flex flex-wrap gap-1.5">{aiInsight.keywords?.map((k, i) => (<span key={i} className="px-3 py-1 bg-white text-indigo-700 rounded-lg font-black text-[10px] shadow-sm shadow-indigo-100">{k}</span>))}</div>
                                </div>
                                <div className="space-y-3">
                                    <div className="p-4 bg-slate-50/80 rounded-2xl border border-slate-100"><p className="font-black text-slate-800 text-xs mb-2 flex items-center gap-2">추천 대화 주제</p><p className="text-slate-600 text-[13px] leading-relaxed font-bold">{aiInsight.ice_breaking || "분석 데이터 부족"}</p></div>
                                    <div className="p-4 bg-slate-50/80 rounded-2xl border border-slate-100"><p className="font-black text-slate-800 text-xs mb-2 flex items-center gap-2">제안 및 판매 전략</p><p className="text-slate-600 text-[13px] leading-relaxed font-bold">{aiInsight.sales_tip || "분석 데이터 부족"}</p></div>
                                </div>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Order History Modal */}
            {
                isSalesModalOpen && (
                    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 backdrop-blur-md bg-slate-900/40 h-full">
                        <div className="relative w-full max-w-4xl bg-white rounded-[2rem] shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 max-h-[80vh] text-left">
                            <div className="px-6 py-5 bg-slate-950 text-white flex justify-between items-center shrink-0">
                                <h3 className="text-lg font-black flex items-center gap-3"><span className="material-symbols-rounded text-emerald-400">history</span> {formData.name} 고객 주문 내역</h3>
                                <button onClick={() => setIsSalesModalOpen(false)} className="w-8 h-8 rounded-full hover:bg-white/10 flex items-center justify-center"><span className="material-symbols-rounded">close</span></button>
                            </div>
                            <div className="flex-1 overflow-y-auto bg-white custom-scrollbar">
                                <table className="w-full text-left text-sm">
                                    <thead className="sticky top-0 bg-slate-50 z-20 border-b border-slate-200 shadow-sm">
                                        <tr>
                                            <th className="px-6 py-3 font-black text-slate-500 text-xs uppercase">일자</th>
                                            <th className="px-6 py-3 font-black text-slate-500 text-xs uppercase">상품</th>
                                            <th className="px-6 py-3 font-black text-slate-500 text-xs uppercase text-right">수량</th>
                                            <th className="px-6 py-3 font-black text-slate-500 text-xs uppercase text-right">금액</th>
                                            <th className="px-6 py-3 font-black text-slate-500 text-xs uppercase text-center">상태</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50">
                                        {salesHistory.length > 0 ? salesHistory.map((s, idx) => (
                                            <tr key={idx} className="hover:bg-slate-50/80"><td className="px-6 py-3 font-bold text-slate-400">{s.order_date?.split('T')[0]}</td><td className="px-6 py-3 font-black text-slate-900">{s.product_name}</td><td className="px-6 py-3 text-right font-black text-slate-600">{s.quantity}개</td><td className="px-6 py-3 text-right font-black text-indigo-600">{formatCurrency(s.total_amount)}원</td><td className="px-6 py-3 text-center"><span className={`px-2 py-0.5 rounded text-[8px] font-black ${s.status === '완료' ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'}`}>{s.status}</span></td></tr>
                                        )) : (<tr><td colSpan="5" className="px-6 py-20 text-center text-slate-300 font-black italic">기록 없음</td></tr>)}
                                    </tbody>
                                </table>
                            </div>
                            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end shrink-0"><button onClick={() => setIsSalesModalOpen(false)} className="px-6 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl font-black text-xs">닫기</button></div>
                        </div>
                    </div>
                )
            }

            {/* Daum Postcode Layer */}
            {
                showAddrLayer && (
                    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 backdrop-blur-sm bg-slate-900/60">
                        <div className="relative w-full max-w-[450px] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden h-[550px]">
                            <div className="px-5 py-3 bg-slate-900 text-white flex justify-between items-center"><h3 className="font-black text-sm">주소 검색</h3><button onClick={() => setShowAddrLayer(false)} className="w-7 h-7 rounded-full hover:bg-white/10 flex items-center justify-center transition-colors"><span className="material-symbols-rounded">close</span></button></div>
                            <div id="addr-layer-list-edit" className="flex-1 w-full" />
                        </div>
                    </div>
                )
            }

            {/* Address Edit Modal */}
            {
                isAddressModalOpen && (
                    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 backdrop-blur-sm bg-slate-950/40 text-left">
                        <div className="relative w-full max-w-lg bg-white rounded-[2rem] shadow-2xl overflow-hidden animate-in zoom-in-95">
                            <div className="px-6 py-5 bg-indigo-600 text-white flex justify-between items-center"><h3 className="text-lg font-black">배송지 설정</h3><button onClick={() => setIsAddressModalOpen(false)} className="w-8 h-8 rounded-full hover:bg-white/10 flex items-center justify-center"><span className="material-symbols-rounded">close</span></button></div>
                            <div className="p-6">
                                <form onSubmit={async (e) => {
                                    e.preventDefault();
                                    const p = {
                                        customer_id: customer.customer_id,
                                        alias: e.target.alias.value,
                                        recipient: e.target.recipient.value,
                                        mobile: e.target.mobile.value,
                                        zip: e.target.zip.value || null,
                                        addr1: e.target.addr1.value,
                                        addr2: e.target.addr2.value || null,
                                        is_default: e.target.isDefault.checked,
                                        memo: e.target.memo.value || null
                                    };
                                    try {
                                        if (editingAddress.address_id) {
                                            const updateP = { ...p, address_id: editingAddress.address_id };
                                            await window.__TAURI__.core.invoke('update_customer_address', updateP);
                                        }
                                        else {
                                            await window.__TAURI__.core.invoke('create_customer_address', p);
                                        }
                                        loadAddresses(customer.customer_id); setIsAddressModalOpen(false);
                                    } catch (err) { showAlert("오류", "저장 실패: " + err); }
                                }} className="space-y-3">
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="space-y-0.5"><label className="text-xs font-black text-slate-600 ml-1">배송지명</label><input name="alias" value={editingAddress?.address_alias || ''} onChange={(e) => setEditingAddress(prev => ({ ...prev, address_alias: e.target.value }))} required className="w-full h-11 px-3 rounded-lg bg-white border border-slate-400 font-bold text-sm text-black" /></div>
                                        <div className="space-y-0.5"><label className="text-xs font-black text-slate-600 ml-1">수령인</label><input name="recipient" value={editingAddress?.recipient_name || ''} onChange={(e) => setEditingAddress(prev => ({ ...prev, recipient_name: e.target.value }))} required className="w-full h-11 px-3 rounded-lg bg-white border border-slate-400 font-bold text-sm text-black" /></div>
                                    </div>
                                    <div className="space-y-0.5"><label className="text-xs font-black text-slate-600 ml-1">연락처</label><input name="mobile" value={editingAddress?.mobile_number || ''} onChange={(e) => setEditingAddress(prev => ({ ...prev, mobile_number: formatPhoneNumber(e.target.value) }))} required className="w-full h-11 px-3 rounded-lg bg-white border border-slate-400 font-bold text-sm text-black" /></div>
                                    <div className="grid grid-cols-4 gap-2">
                                        <div className="col-span-1 space-y-0.5"><label className="text-xs font-black text-slate-600 ml-1">우편번호</label><input name="zip" value={editingAddress?.zip_code || ''} readOnly onClick={handleModalAddressSearch} className="w-full h-11 px-3 rounded-lg bg-white border border-slate-400 font-black text-center text-sm cursor-pointer text-black" /></div>
                                        <div className="col-span-3 space-y-0.5"><label className="text-xs font-black text-slate-600 ml-1">주소</label><input name="addr1" value={editingAddress?.address_primary || ''} readOnly onClick={handleModalAddressSearch} className="w-full h-11 px-3 rounded-lg bg-white border border-slate-400 font-bold text-sm px-3 cursor-pointer text-black" /></div>
                                    </div>
                                    <div className="space-y-0.5"><label className="text-xs font-black text-slate-600 ml-1">상세 주소</label><input name="addr2" value={editingAddress?.address_detail || ''} onChange={(e) => setEditingAddress(prev => ({ ...prev, address_detail: e.target.value }))} className="w-full h-11 px-3 rounded-lg bg-white border border-slate-400 font-bold text-sm text-black" /></div>
                                    <div className="space-y-0.5"><label className="text-xs font-black text-slate-600 ml-1">배송 메모</label><input name="memo" value={editingAddress?.shipping_memo || ''} onChange={(e) => setEditingAddress(prev => ({ ...prev, shipping_memo: e.target.value }))} className="w-full h-11 px-3 rounded-lg bg-white border border-slate-400 font-bold text-sm text-black" /></div>
                                    <div className="flex items-center gap-2 pt-1"><input type="checkbox" name="isDefault" defaultChecked={editingAddress.is_default} className="w-4 h-4 rounded text-indigo-600" /><span className="text-xs font-black text-slate-500">기본 배송지로 설정</span></div>
                                    <div className="flex justify-end pt-4"><button type="submit" className="h-10 px-10 bg-indigo-600 text-white rounded-xl font-black shadow-lg shadow-indigo-600/20 hover:bg-indigo-500 transition-all text-xs">저장하기</button></div>
                                </form>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Search Results Selection Modal */}
            {
                isSearchModalOpen && (
                    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 backdrop-blur-md bg-slate-900/40 animate-in fade-in duration-300">
                        <div className="relative w-full max-w-4xl bg-white rounded-[2rem] shadow-2xl overflow-hidden animate-in zoom-in-95 flex flex-col max-h-[70vh]">
                            <div className="px-6 py-5 bg-slate-800 text-white flex justify-between items-center shrink-0">
                                <h3 className="text-lg font-black flex items-center gap-3">
                                    <span className="material-symbols-rounded text-indigo-400">group</span>
                                    검색 결과 선택 <span className="text-slate-400 font-light text-sm">총 {searchResults.length}명이 검색되었습니다.</span>
                                </h3>
                                <button onClick={() => setIsSearchModalOpen(false)} className="w-8 h-8 rounded-full hover:bg-white/10 flex items-center justify-center transition-colors"><span className="material-symbols-rounded">close</span></button>
                            </div>
                            <div className="flex-1 overflow-y-auto custom-scrollbar">
                                <table className="w-full text-left text-sm">
                                    <thead className="sticky top-0 bg-slate-50 z-20 border-b border-slate-200">
                                        <tr>
                                            <th className="px-6 py-3 font-black text-slate-500 text-xs uppercase">성함</th>
                                            <th className="px-6 py-3 font-black text-slate-500 text-xs uppercase">휴대폰</th>
                                            <th className="px-6 py-3 font-black text-slate-500 text-xs uppercase">주소</th>
                                            <th className="px-6 py-3 font-black text-slate-500 text-xs uppercase text-center">상태</th>
                                            <th className="px-6 py-3 font-black text-slate-500 text-xs uppercase text-center">선택</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50">
                                        {searchResults.map((c) => (
                                            <tr key={c.customer_id} className="hover:bg-indigo-50/50 transition-colors cursor-pointer group" onClick={() => { loadCustomer(c); setIsSearchModalOpen(false); }}>
                                                <td className="px-6 py-4 font-black text-slate-800">{c.customer_name}</td>
                                                <td className="px-6 py-4 font-bold text-slate-600">{formatPhoneNumber(c.mobile_number)}</td>
                                                <td className="px-6 py-4 text-slate-500 text-xs break-all">{c.address_primary}</td>
                                                <td className="px-6 py-4 text-center">
                                                    <span className={`px-2 py-0.5 rounded text-[10px] font-black ${(c.status || '정상') === '정상' ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'}`}>
                                                        {(c.status || '정상') === '정상' ? '정상' : '휴면'}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 text-center">
                                                    <button className="px-4 py-1.5 rounded-lg bg-white border border-slate-200 text-indigo-600 font-black text-xs group-hover:bg-indigo-600 group-hover:text-white group-hover:border-indigo-600 transition-all">불러오기</button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end shrink-0">
                                <button onClick={() => setIsSearchModalOpen(false)} className="px-6 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl font-black text-xs hover:bg-slate-100 transition-all">닫기</button>
                            </div>
                        </div>
                    </div>
                )}

            {/* 6. Customer History Modal */}
            {isLogsModalOpen && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden border border-white/20 scale-in-center">
                        <div className="px-6 py-5 bg-slate-800 text-white flex justify-between items-center shrink-0">
                            <h3 className="text-lg font-black flex items-center gap-3">
                                <span className="material-symbols-rounded text-indigo-400">history</span>
                                정보 변경 이력 <span className="text-slate-400 font-light text-sm">{customer?.customer_name} 고객님</span>
                            </h3>
                            <button onClick={() => setIsLogsModalOpen(false)} className="w-8 h-8 rounded-full hover:bg-white/10 flex items-center justify-center transition-colors"><span className="material-symbols-rounded">close</span></button>
                        </div>
                        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 bg-slate-50/10">
                            {customerLogs.length === 0 ? (
                                <div className="h-40 flex flex-col items-center justify-center text-slate-400 italic font-bold">
                                    <span className="material-symbols-rounded text-4xl mb-2 opacity-20">history</span>
                                    기록된 변경 이력이 없습니다.
                                </div>
                            ) : (
                                <div className="relative">
                                    <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-slate-200/50"></div>
                                    <div className="space-y-6 relative">
                                        {customerLogs.map((log) => (
                                            <div key={log.log_id} className="relative pl-10">
                                                <div className="absolute left-3 w-2.5 h-2.5 rounded-full bg-indigo-500 border-2 border-white translate-x-[-1px] z-10"></div>
                                                <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100/50">
                                                    <div className="flex justify-between items-start mb-2">
                                                        <span className="text-[10px] font-black px-2 py-0.5 bg-slate-100 text-slate-500 rounded-full uppercase tracking-wider">{log.field_name} 변경</span>
                                                        <span className="text-[10px] font-bold text-slate-400 flex items-center gap-1">
                                                            <span className="material-symbols-rounded text-xs">schedule</span>
                                                            {log.changed_at ? new Date(log.changed_at).toLocaleString() : '정보 없음'}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center gap-3 text-sm font-bold">
                                                        <div className="flex-1 p-2.5 bg-rose-50/50 rounded-xl border border-rose-100/30">
                                                            <div className="text-[9px] font-black text-rose-300 uppercase mb-0.5">이전 정보</div>
                                                            <div className="text-rose-600 truncate">{log.old_value || '(비어있음)'}</div>
                                                        </div>
                                                        <span className="material-symbols-rounded text-slate-300 transform transition-transform">arrow_right_alt</span>
                                                        <div className="flex-1 p-2.5 bg-emerald-50/50 rounded-xl border border-emerald-100/30">
                                                            <div className="text-[9px] font-black text-emerald-300 uppercase mb-0.5">변경된 정보</div>
                                                            <div className="text-emerald-600 truncate">{log.new_value || '(비어있음)'}</div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="px-6 py-4 bg-white border-t border-slate-100 flex justify-end">
                            <button onClick={() => setIsLogsModalOpen(false)} className="px-6 h-10 rounded-xl bg-slate-800 text-white font-black text-sm hover:bg-slate-700 transition-all">확인</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CustomerList;

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useModal } from '../../contexts/ModalContext';
import { formatPhoneNumber } from '../../utils/common';

const ExperienceReservation = () => {
    const { showAlert, showConfirm } = useModal();
    const [programs, setPrograms] = useState([]);
    const [formData, setFormData] = useState({
        program_id: '',
        reservation_date: new Date().toISOString().split('T')[0],
        reservation_time: '10:00',
        participant_count: 1,
        total_amount: 0,
        guest_name: '',
        guest_contact: '',
        status: '예약완료',
        payment_status: '미결제',
        memo: '',
        customer_id: null
    });

    const [unitPrice, setUnitPrice] = useState(0);
    const [loading, setLoading] = useState(false);

    // Customer Search State
    const [showSearchModal, setShowSearchModal] = useState(false);
    const [searchResults, setSearchResults] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');

    const loadPrograms = useCallback(async () => {
        try {
            const data = await invoke('get_experience_programs');
            setPrograms(data.filter(p => p.is_active));
        } catch (err) {
            console.error('Failed to load programs:', err);
        }
    }, []);

    useEffect(() => {
        loadPrograms();
    }, [loadPrograms]);

    // Calculate total amount when program or count changes
    useEffect(() => {
        const program = programs.find(p => p.program_id === parseInt(formData.program_id));
        if (program) {
            setUnitPrice(program.price_per_person);
            setFormData(prev => ({
                ...prev,
                total_amount: program.price_per_person * prev.participant_count
            }));
        } else {
            setUnitPrice(0);
            setFormData(prev => ({ ...prev, total_amount: 0 }));
        }
    }, [formData.program_id, formData.participant_count, programs]);

    const handleInputChange = (e) => {
        const { id, value } = e.target;
        setFormData(prev => ({ ...prev, [id]: value }));
    };

    const handleSearchCustomer = async (e) => {
        e?.preventDefault();
        if (!searchQuery.trim()) return;
        try {
            let results = [];
            if (/[0-9]/.test(searchQuery)) {
                results = await invoke('search_customers_by_mobile', { mobile: searchQuery });
            }
            if (results.length === 0) {
                results = await invoke('search_customers_by_name', { name: searchQuery });
            }
            setSearchResults(results);
        } catch (err) {
            showAlert('고객 검색 실패: ' + err);
        }
    };

    const selectCustomer = (c) => {
        setFormData(prev => ({
            ...prev,
            customer_id: c.customer_id,
            guest_name: c.customer_name,
            guest_contact: c.mobile_number || c.phone_number || ''
        }));
        setShowSearchModal(false);
        setSearchQuery('');
        setSearchResults([]);
    };

    const handleReset = () => {
        setFormData({
            program_id: '',
            reservation_date: new Date().toISOString().split('T')[0],
            reservation_time: '10:00',
            participant_count: 1,
            total_amount: 0,
            guest_name: '',
            guest_contact: '',
            status: '예약완료',
            payment_status: '미결제',
            memo: '',
            customer_id: null
        });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!formData.program_id) {
            showAlert('프로그램을 선택해주세요.');
            return;
        }

        setLoading(true);
        try {
            await invoke('create_experience_reservation', {
                programId: parseInt(formData.program_id),
                customerId: formData.customer_id,
                guestName: formData.guest_name,
                guestContact: formData.guest_contact,
                reservationDate: formData.reservation_date,
                reservationTime: formData.reservation_time,
                participantCount: parseInt(formData.participant_count),
                totalAmount: formData.total_amount,
                status: formData.status,
                paymentStatus: formData.payment_status,
                memo: formData.memo || null
            });
            showAlert('예약이 접수되었습니다.');
            handleReset();
        } catch (err) {
            console.error('Reservation error:', err);
            showAlert('예약 저장 실패: ' + err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex flex-col h-full bg-[#f8fafc] overflow-hidden animate-in fade-in duration-700">
            {/* Top Navigation & Action Header */}
            <div className="px-6 lg:px-8 min-[2000px]:px-12 pt-6 lg:pt-8 min-[2000px]:pt-12 pb-1">
                <div className="flex justify-between items-end mb-4">
                    <div>
                        <div className="flex items-center gap-2 mb-0.5">
                            <span className="w-6 h-1 bg-indigo-600 rounded-full"></span>
                            <span className="text-[9px] font-black tracking-[0.2em] text-indigo-600 uppercase">Experience Management System</span>
                        </div>
                        <h1 className="text-3xl font-black text-slate-600 tracking-tighter" style={{ fontFamily: '"Noto Sans KR", sans-serif' }}>
                            체험 예약 접수 <span className="text-slate-300 font-light ml-1 text-xl">Reservation Entry</span>
                        </h1>
                    </div>
                </div>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 overflow-hidden bg-slate-50 px-6 lg:px-8 py-4 flex flex-col">
                <div className="flex-1 overflow-y-auto custom-gray-scrollbar p-1">
                    {/* Full Width Form Card */}
                    <div className="w-full h-full">
                        <div className="bg-white rounded-[2rem] shadow-xl shadow-slate-200/60 border border-slate-200/50 overflow-hidden">
                            <form onSubmit={handleSubmit}>
                                <div className="p-8 lg:p-10">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                        {/* Left Section: Program & Schedule */}
                                        <div className="space-y-6">
                                            <div className="space-y-5 bg-slate-50/50 p-6 rounded-2xl border border-slate-100">
                                                <h3 className="text-sm font-black text-indigo-600 flex items-center gap-2">
                                                    <span className="material-symbols-rounded text-lg">calendar_today</span>
                                                    예약 및 일정 정보
                                                </h3>

                                                <div className="space-y-4">
                                                    <div>
                                                        <label className="block text-[11px] font-black text-slate-500 uppercase ml-1 mb-1">프로그램 선택 <span className="text-rose-500">*</span></label>
                                                        <select
                                                            id="program_id"
                                                            value={formData.program_id}
                                                            onChange={handleInputChange}
                                                            required
                                                            className="w-full px-4 h-11 bg-white border border-slate-200 rounded-xl font-bold focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all text-sm"
                                                        >
                                                            <option value="">프로그램을 선택하세요</option>
                                                            {programs.map(p => (
                                                                <option key={p.program_id} value={p.program_id}>
                                                                    {p.program_name} (\{new Intl.NumberFormat('ko-KR').format(p.price_per_person)})
                                                                </option>
                                                            ))}
                                                        </select>
                                                    </div>

                                                    <div className="grid grid-cols-2 gap-4">
                                                        <div>
                                                            <label className="block text-[11px] font-black text-slate-500 uppercase ml-1 mb-1">예약 날짜</label>
                                                            <input
                                                                type="date"
                                                                id="reservation_date"
                                                                value={formData.reservation_date}
                                                                onChange={handleInputChange}
                                                                required
                                                                className="w-full px-4 h-11 bg-white border border-slate-200 rounded-xl font-black focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all text-sm"
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="block text-[11px] font-black text-slate-500 uppercase ml-1 mb-1">예약 시간</label>
                                                            <input
                                                                type="time"
                                                                id="reservation_time"
                                                                value={formData.reservation_time}
                                                                onChange={handleInputChange}
                                                                required
                                                                className="w-full px-4 h-11 bg-white border border-slate-200 rounded-xl font-black focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all text-sm"
                                                            />
                                                        </div>
                                                    </div>

                                                    <div className="grid grid-cols-2 gap-4">
                                                        <div>
                                                            <label className="block text-[11px] font-black text-slate-500 uppercase ml-1 mb-1">참가 인원</label>
                                                            <input
                                                                type="number"
                                                                id="participant_count"
                                                                value={formData.participant_count}
                                                                onChange={handleInputChange}
                                                                min="1"
                                                                required
                                                                className="w-full px-4 h-11 bg-white border border-slate-200 rounded-xl font-black focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all text-right text-sm"
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="block text-[11px] font-black text-indigo-500 uppercase ml-1 mb-1">총 결제 금액</label>
                                                            <div className="px-4 h-11 flex items-center justify-end bg-indigo-50 border border-indigo-100 rounded-xl text-right font-black text-indigo-700 text-base">
                                                                \{new Intl.NumberFormat('ko-KR').format(formData.total_amount)}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Right Section: Guest Info */}
                                        <div className="space-y-6">
                                            <div className="space-y-5 bg-slate-50/50 p-6 rounded-2xl border border-slate-100">
                                                <div className="flex items-center justify-between">
                                                    <h3 className="text-sm font-black text-indigo-600 flex items-center gap-2">
                                                        <span className="material-symbols-rounded text-lg">person</span>
                                                        예약자 정보
                                                    </h3>
                                                    <button
                                                        type="button"
                                                        onClick={() => setShowSearchModal(true)}
                                                        className="h-7 px-3 rounded-lg bg-slate-900 text-white font-black hover:bg-indigo-600 transition-all flex items-center gap-1.5 text-[10px] shadow-sm"
                                                    >
                                                        <span className="material-symbols-rounded text-sm">search</span>
                                                        기존 고객 검색
                                                    </button>
                                                </div>

                                                <div className="space-y-4">
                                                    <div>
                                                        <label className="block text-[11px] font-black text-slate-500 uppercase ml-1 mb-1">성명 / 단체명 <span className="text-rose-500">*</span></label>
                                                        <input
                                                            type="text"
                                                            id="guest_name"
                                                            value={formData.guest_name}
                                                            onChange={handleInputChange}
                                                            placeholder="예약자 성함"
                                                            required
                                                            className="w-full px-4 h-11 bg-white border border-slate-200 rounded-xl font-bold focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all text-sm"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-[11px] font-black text-slate-500 uppercase ml-1 mb-1">연락처 <span className="text-rose-500">*</span></label>
                                                        <input
                                                            type="text"
                                                            id="guest_contact"
                                                            value={formData.guest_contact}
                                                            onChange={handleInputChange}
                                                            placeholder="010-0000-0000"
                                                            required
                                                            className="w-full px-4 h-11 bg-white border border-slate-200 rounded-xl font-black focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all text-sm"
                                                        />
                                                    </div>

                                                    <div className="grid grid-cols-2 gap-4">
                                                        <div>
                                                            <label className="block text-[11px] font-black text-slate-500 uppercase ml-1 mb-1">예약 상태</label>
                                                            <select
                                                                id="status"
                                                                value={formData.status}
                                                                onChange={handleInputChange}
                                                                className="w-full px-4 h-11 bg-white border border-slate-200 rounded-xl font-bold focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all text-xs"
                                                            >
                                                                <option value="예약완료">예약완료</option>
                                                                <option value="예약대기">예약대기</option>
                                                            </select>
                                                        </div>
                                                        <div>
                                                            <label className="block text-[11px] font-black text-slate-500 uppercase ml-1 mb-1">결제 상태</label>
                                                            <select
                                                                id="payment_status"
                                                                value={formData.payment_status}
                                                                onChange={handleInputChange}
                                                                className="w-full px-4 h-11 bg-white border border-slate-200 rounded-xl font-bold focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all text-xs"
                                                            >
                                                                <option value="미결제">미결제</option>
                                                                <option value="결제완료">결제완료</option>
                                                                <option value="일부결제">일부결제</option>
                                                            </select>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Full Width Memo Style Sync */}
                                    <div className="mt-6">
                                        <label className="block text-[11px] font-black text-slate-500 uppercase ml-1 mb-1">비고 / 특이사항</label>
                                        <textarea
                                            id="memo"
                                            value={formData.memo}
                                            onChange={handleInputChange}
                                            rows="3"
                                            placeholder="기타 참고할 사항을 입력하세요."
                                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all resize-none text-sm"
                                        ></textarea>
                                    </div>
                                </div>

                                {/* Form Footer Style Sync with SalesReception */}
                                <div className="px-8 py-5 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-3 rounded-b-[2rem]">
                                    <button
                                        type="button"
                                        onClick={handleReset}
                                        className="h-11 px-6 bg-white text-slate-600 font-black rounded-xl border border-slate-200 hover:bg-slate-50 transition-all shadow-sm text-xs"
                                    >
                                        초기화
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={loading}
                                        className="h-11 px-10 bg-indigo-600 text-white font-black rounded-xl hover:bg-indigo-500 shadow-xl shadow-indigo-100 transition-all flex items-center gap-2 disabled:opacity-50 text-sm"
                                    >
                                        {loading ? (
                                            <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                                        ) : (
                                            <span className="material-symbols-rounded text-lg">check_circle</span>
                                        )}
                                        예약 정보 저장
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            </div>

            {/* Customer Search Modal */}
            {showSearchModal && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
                    <div
                        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity"
                        onClick={() => setShowSearchModal(false)}
                    ></div>
                    <div className="relative bg-white w-full max-w-lg rounded-[2rem] shadow-2xl border border-white/20 overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                            <h3 className="font-black text-lg text-slate-800 flex items-center gap-2">
                                <span className="material-symbols-rounded text-indigo-500">person_search</span>
                                고객 검색
                            </h3>
                            <button
                                onClick={() => setShowSearchModal(false)}
                                className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-full transition-all"
                            >
                                <span className="material-symbols-rounded">close</span>
                            </button>
                        </div>
                        <div className="p-6">
                            <form onSubmit={handleSearchCustomer} className="flex gap-2 mb-6">
                                <div className="relative flex-1 group">
                                    <input
                                        type="text"
                                        autoFocus
                                        placeholder="성함 또는 번호 입력 후 엔터"
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="w-full px-4 h-12 bg-slate-50 border border-slate-200 rounded-xl font-black focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all text-sm"
                                    />
                                </div>
                                <button className="h-12 px-6 bg-slate-900 text-white font-black rounded-xl hover:bg-indigo-600 transition-all shadow-lg shadow-slate-200 text-sm">
                                    검색
                                </button>
                            </form>

                            <div className="max-h-[350px] overflow-y-auto space-y-2 pr-1 custom-gray-scrollbar">
                                {searchResults.length === 0 ? (
                                    <div className="text-center py-12 text-slate-300 font-bold italic text-sm">
                                        검색 결과가 없습니다.
                                    </div>
                                ) : (
                                    searchResults.map(c => (
                                        <button
                                            key={c.customer_id}
                                            onClick={() => selectCustomer(c)}
                                            className="w-full p-4 flex items-center justify-between hover:bg-indigo-50 border border-slate-50 hover:border-indigo-100 rounded-2xl transition-all text-left group"
                                        >
                                            <div>
                                                <div className="font-black text-slate-900 group-hover:text-indigo-700">{c.customer_name}</div>
                                                <div className="text-[11px] font-black text-slate-400 mt-0.5">{formatPhoneNumber(c.mobile_number || c.phone_number)}</div>
                                            </div>
                                            <span className="material-symbols-rounded text-indigo-200 group-hover:text-indigo-500 group-hover:translate-x-1 transition-all">chevron_right</span>
                                        </button>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ExperienceReservation;

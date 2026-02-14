import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { formatPhoneNumber, formatCurrency } from '../utils/common';
import { useModal } from '../contexts/ModalContext';

const CustomerDetailModal = ({ customerId, onClose }) => {
    const { showAlert } = useModal();
    const [customer, setCustomer] = useState(null);
    const [addresses, setAddresses] = useState([]);
    const [salesHistory, setSalesHistory] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('info'); // 'info' | 'history' | 'addresses'

    useEffect(() => {
        if (customerId) {
            loadData();
        }
    }, [customerId]);

    const loadData = async () => {
        setIsLoading(true);
        try {
            const [c, addr, sales] = await Promise.all([
                invoke('get_customer', { customerId }),
                invoke('get_customer_addresses', { customerId }),
                invoke('get_sales_by_customer_id', { customerId })
            ]);
            setCustomer(c);
            setAddresses(addr || []);
            setSalesHistory(sales || []);
        } catch (err) {
            console.error(err);
            showAlert("오류", "고객 정보를 불러오는데 실패했습니다.");
            onClose();
        } finally {
            setIsLoading(false);
        }
    };

    if (!customerId) return null;

    return (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 backdrop-blur-md bg-slate-900/60 animate-in fade-in duration-300" onClick={onClose}>
            <div className="relative w-full max-w-4xl bg-white rounded-[2rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="px-6 py-5 bg-gradient-to-r from-slate-900 to-slate-800 text-white flex justify-between items-center shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-indigo-500 flex items-center justify-center">
                            <span className="material-symbols-rounded text-white">person</span>
                        </div>
                        <div>
                            <h3 className="text-lg font-black">{customer?.customer_name || '로딩 중...'}</h3>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{customer?.membership_level || '일반'} GRADE CUSTOMER</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="w-10 h-10 rounded-full hover:bg-white/10 flex items-center justify-center transition-colors">
                        <span className="material-symbols-rounded">close</span>
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex px-6 bg-slate-50 border-b border-slate-200 shrink-0">
                    <button onClick={() => setActiveTab('info')} className={`px-5 py-4 text-xs font-black transition-all border-b-2 ${activeTab === 'info' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>기본 정보</button>
                    <button onClick={() => setActiveTab('history')} className={`px-5 py-4 text-xs font-black transition-all border-b-2 ${activeTab === 'history' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>주문 이력 ({salesHistory.length})</button>
                    <button onClick={() => setActiveTab('addresses')} className={`px-5 py-4 text-xs font-black transition-all border-b-2 ${activeTab === 'addresses' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>배송지 목록 ({addresses.length})</button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 stylish-scrollbar bg-white">
                    {isLoading ? (
                        <div className="h-64 flex flex-col items-center justify-center gap-4 text-slate-400">
                            <span className="material-symbols-rounded animate-spin text-4xl text-indigo-500">refresh</span>
                            <span className="font-bold text-sm">고객 데이터를 분석하고 있습니다...</span>
                        </div>
                    ) : (
                        <>
                            {activeTab === 'info' && (
                                <div className="space-y-6 animate-in slide-in-from-bottom-2 duration-300">
                                    <div className="grid grid-cols-2 gap-6">
                                        <div className="space-y-4">
                                            <h4 className="text-[10px] font-black text-indigo-500 uppercase tracking-widest flex items-center gap-2">
                                                <span className="w-1 h-3 bg-indigo-500 rounded-full"></span> Contact Details
                                            </h4>
                                            <div className="bg-slate-50 rounded-2xl p-4 space-y-3">
                                                <div className="flex justify-between items-center">
                                                    <span className="text-[11px] font-bold text-slate-400">휴대폰</span>
                                                    <span className="text-sm font-black text-slate-700 font-mono">{formatPhoneNumber(customer?.mobile_number)}</span>
                                                </div>
                                                <div className="flex justify-between items-center border-t border-slate-200/50 pt-3">
                                                    <span className="text-[11px] font-bold text-slate-400">일반전화</span>
                                                    <span className="text-sm font-bold text-slate-600">{formatPhoneNumber(customer?.phone_number) || '-'}</span>
                                                </div>
                                                <div className="flex justify-between items-center border-t border-slate-200/50 pt-3">
                                                    <span className="text-[11px] font-bold text-slate-400">이메일</span>
                                                    <span className="text-sm font-bold text-slate-600">{customer?.email || '-'}</span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="space-y-4">
                                            <h4 className="text-[10px] font-black text-teal-500 uppercase tracking-widest flex items-center gap-2">
                                                <span className="w-1 h-3 bg-teal-500 rounded-full"></span> CRM Insight
                                            </h4>
                                            <div className="bg-teal-50/30 rounded-2xl p-4 space-y-3 border border-teal-100/50">
                                                <div className="flex justify-between items-center">
                                                    <span className="text-[11px] font-bold text-teal-600/70">가입일</span>
                                                    <span className="text-sm font-black text-teal-700">{customer?.join_date || '-'}</span>
                                                </div>
                                                <div className="flex justify-between items-center border-t border-teal-200/20 pt-3">
                                                    <span className="text-[11px] font-bold text-teal-600/70">마케팅 동의</span>
                                                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${customer?.marketing_consent ? 'bg-teal-100 text-teal-700' : 'bg-slate-200 text-slate-500'}`}>
                                                        {customer?.marketing_consent ? 'CONSENTED' : 'REFUSED'}
                                                    </span>
                                                </div>
                                                <div className="flex justify-between items-center border-t border-teal-200/20 pt-3">
                                                    <span className="text-[11px] font-bold text-teal-600/70">주요 기념일</span>
                                                    <span className="text-sm font-bold text-teal-700">{customer?.anniversary_date ? `${customer.anniversary_date} (${customer.anniversary_type})` : '-'}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="space-y-4">
                                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                            <span className="w-1 h-3 bg-slate-300 rounded-full"></span> Primary Address
                                        </h4>
                                        <div className="bg-slate-50 rounded-2xl p-4 flex gap-4 items-start">
                                            <span className="material-symbols-rounded text-slate-300 mt-1">location_on</span>
                                            <div>
                                                <p className="text-sm font-black text-slate-700">({customer?.zip_code}) {customer?.address_primary}</p>
                                                <p className="text-sm font-medium text-slate-500 mt-1">{customer?.address_detail}</p>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="space-y-4">
                                        <h4 className="text-[10px] font-black text-indigo-500 uppercase tracking-widest flex items-center gap-2">
                                            <span className="w-1 h-3 bg-indigo-300 rounded-full"></span> Customer Memo
                                        </h4>
                                        <div className="bg-indigo-50/50 rounded-2xl p-4 min-h-[100px] border border-indigo-100/50">
                                            <p className="text-sm text-slate-600 leading-relaxed italic font-medium">
                                                {customer?.memo || "등록된 특이사항이나 메모가 없습니다."}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {activeTab === 'history' && (
                                <div className="animate-in slide-in-from-right-2 duration-300">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">
                                                <th className="py-3 text-left">주문일자</th>
                                                <th className="py-3 text-left">상품명</th>
                                                <th className="py-3 text-right">수량</th>
                                                <th className="py-3 text-right">총 금액</th>
                                                <th className="py-3 text-center">상태</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-50">
                                            {salesHistory.map((s, i) => (
                                                <tr key={i} className="hover:bg-slate-50 transition-colors">
                                                    <td className="py-4 text-slate-400 font-bold">{s.order_date}</td>
                                                    <td className="py-4 font-black text-slate-700">{s.product_name}</td>
                                                    <td className="py-4 text-right font-black text-slate-500">{s.quantity}개</td>
                                                    <td className="py-4 text-right font-black text-indigo-600">{formatCurrency(s.total_amount)}원</td>
                                                    <td className="py-4 text-center">
                                                        <span className={`text-[9px] font-black px-2 py-1 rounded-full ${s.status === '완료' ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'}`}>
                                                            {s.status}
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))}
                                            {salesHistory.length === 0 && (
                                                <tr><td colSpan="5" className="py-20 text-center text-slate-300 font-bold italic">주문 내역이 존재하지 않습니다.</td></tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {activeTab === 'addresses' && (
                                <div className="grid grid-cols-2 gap-4 animate-in slide-in-from-right-2 duration-300">
                                    {addresses.map((a, i) => (
                                        <div key={i} className={`p-5 rounded-3xl border transition-all ${a.is_default ? 'bg-indigo-50 border-indigo-200 shadow-sm shadow-indigo-100' : 'bg-slate-50 border-slate-200'}`}>
                                            <div className="flex justify-between items-start mb-3">
                                                <span className={`px-2 py-0.5 rounded text-[10px] font-black ${a.is_default ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-500'}`}>
                                                    {a.address_alias} {a.is_default && 'DEFAULT'}
                                                </span>
                                                <span className="text-xs font-black text-slate-700">{a.recipient_name}</span>
                                            </div>
                                            <p className="text-[11px] font-bold text-slate-400 mb-2">{formatPhoneNumber(a.mobile_number)}</p>
                                            <p className="text-xs font-bold text-slate-600 leading-normal">
                                                ({a.zip_code}) {a.address_primary} {a.address_detail}
                                            </p>
                                            {a.shipping_memo && (
                                                <div className="mt-3 pt-3 border-t border-slate-200/50 flex gap-2">
                                                    <span className="material-symbols-rounded text-slate-300 text-sm">sticky_note_2</span>
                                                    <p className="text-[10px] text-slate-400 font-medium italic">{a.shipping_memo}</p>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                    {addresses.length === 0 && (
                                        <div className="col-span-2 py-20 text-center text-slate-300 font-bold italic">등록된 추가 배송지가 없습니다.</div>
                                    )}
                                </div>
                            )}
                        </>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end shrink-0">
                    <button onClick={onClose} className="px-8 py-2.5 bg-white border border-slate-200 text-slate-600 rounded-xl font-black text-xs hover:bg-slate-100 transition-all shadow-sm">
                        확인 및 닫기
                    </button>
                </div>
            </div>
        </div>
    );
};

export default CustomerDetailModal;

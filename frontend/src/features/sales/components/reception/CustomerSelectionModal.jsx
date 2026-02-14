import React from 'react';

const CustomerSelectionModal = ({ isOpen, onClose, searchResults, selectCustomer, setQuickRegisterName, setShowRegisterModal, custSearchRef }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={onClose}></div>
            <div className="bg-white rounded-3xl w-full max-w-4xl shadow-2xl relative overflow-hidden animate-in zoom-in-95 duration-200 text-slate-900 text-left">
                <div className="bg-indigo-600 p-6 text-white flex justify-between items-center">
                    <h3 className="text-xl font-bold">고객 선택</h3>
                    <button onClick={onClose} className="hover:bg-white/10 rounded-lg p-1">
                        <span className="material-symbols-rounded">close</span>
                    </button>
                </div>
                <div className="p-6">
                    <p className="text-slate-500 text-sm mb-4">검색 결과가 여러 명입니다. 정확한 고객을 선택해주세요.</p>
                    <div className="max-h-[400px] overflow-y-auto pr-2 stylish-scrollbar">
                        <table className="w-full text-sm">
                            <thead className="sticky top-0 bg-white">
                                <tr className="text-slate-400 text-[10px] uppercase font-black border-b border-slate-100">
                                    <th className="py-2 text-left">이름</th>
                                    <th className="py-2 text-left">연락처</th>
                                    <th className="py-2 text-left">주소</th>
                                    <th className="py-2 text-center">선택</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {searchResults.map(c => (
                                    <tr key={c.customer_id} onClick={() => { selectCustomer(c); onClose(); }} className="hover:bg-slate-50/80 group transition-colors cursor-pointer border-b border-slate-50 last:border-0">
                                        <td className="py-3 px-2 font-bold text-slate-800 group-hover:text-indigo-700 transition-colors">{c.customer_name}</td>
                                        <td className="py-3 px-2 text-slate-600 font-medium">{c.mobile_number}</td>
                                        <td className="py-3 px-2 text-slate-400 text-xs truncate max-w-[180px]">{c.address_primary}</td>
                                        <td className="py-3 px-2 text-center">
                                            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-slate-100 text-slate-400 group-hover:bg-indigo-600 group-hover:text-white transition-all shadow-sm">
                                                <span className="material-symbols-rounded text-sm">check</span>
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
                <div className="bg-slate-50 p-4 flex justify-between items-center text-left">
                    <span className="text-xs text-slate-400">찾으시는 고객이 없나요?</span>
                    <button onClick={() => { onClose(); setQuickRegisterName(custSearchRef.current?.value); setShowRegisterModal(true); }} className="px-4 py-2 bg-slate-900 text-white rounded-xl font-bold text-sm hover:bg-slate-800 transition-all flex items-center gap-2">
                        <span className="material-symbols-rounded text-lg">person_add</span> 신규 고객으로 등록
                    </button>
                </div>
            </div>
        </div>
    );
};

export default CustomerSelectionModal;

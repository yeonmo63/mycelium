import React from 'react';
import { X as XIcon, UserPlus } from 'lucide-react';

const EventRegistrationModal = ({
    show,
    onClose,
    newCustomer,
    setNewCustomer,
    onRegister,
    formatPhoneNumber
}) => {
    if (!show) return null;

    return (
        <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-end animate-in fade-in duration-300">
            <div className="w-full bg-white rounded-t-[3rem] p-8 pb-12 shadow-2xl animate-in slide-in-from-bottom-full duration-500">
                <div className="flex justify-between items-center mb-8">
                    <div>
                        <h2 className="text-2xl font-black text-slate-900">신규 고객 등록</h2>
                        <p className="text-xs font-bold text-slate-400 mt-1 uppercase tracking-widest">Quick Registration</p>
                    </div>
                    <button onClick={onClose} className="p-3 bg-slate-50 text-slate-400 rounded-2xl">
                        <XIcon size={20} />
                    </button>
                </div>

                <div className="space-y-6">
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-tighter ml-1">고객 이름</label>
                        <input
                            type="text"
                            className="w-full h-14 bg-slate-50 border-none rounded-2xl px-5 text-sm font-black focus:ring-2 focus:ring-indigo-500 transition-all text-slate-700"
                            value={newCustomer.name}
                            onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })}
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-tighter ml-1">연락처</label>
                        <input
                            type="tel"
                            className="w-full h-14 bg-slate-50 border-none rounded-2xl px-5 text-sm font-black focus:ring-2 focus:ring-indigo-500 transition-all text-slate-700"
                            value={newCustomer.mobile}
                            onChange={(e) => setNewCustomer({ ...newCustomer, mobile: formatPhoneNumber(e.target.value) })}
                            placeholder="010-0000-0000"
                        />
                    </div>

                    <button
                        onClick={onRegister}
                        className="w-full h-16 bg-indigo-600 text-white rounded-3xl font-black text-lg shadow-xl shadow-indigo-100 active:scale-[0.98] transition-all flex items-center justify-center gap-3 mt-4"
                    >
                        <UserPlus size={20} />
                        등록 후 선택하기
                    </button>
                </div>
            </div>
        </div>
    );
};

export default EventRegistrationModal;

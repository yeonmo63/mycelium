import React from 'react';
import { CreditCard, ClipboardList, Save } from 'lucide-react';

const EventCheckoutSummary = ({
    paymentMethod,
    setPaymentMethod,
    memo,
    setMemo,
    totalAmount,
    onCheckout,
    cartLength
}) => {
    return (
        <>
            <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 space-y-4">
                <div className="space-y-2">
                    <div className="flex items-center gap-2 text-slate-800 font-black text-sm pl-1">
                        <CreditCard size={16} className="text-indigo-500" />
                        <span>결제 수단</span>
                    </div>
                    <div className="flex gap-2">
                        {['현금', '카드', '계좌이체'].map(m => (
                            <button
                                key={m}
                                onClick={() => setPaymentMethod(m)}
                                className={`flex-1 h-12 rounded-xl font-black text-sm transition-all ${paymentMethod === m ? 'bg-indigo-600 text-white shadow-md' : 'bg-slate-50 text-slate-400'}`}
                            >
                                {m}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="space-y-2">
                    <div className="flex items-center gap-2 text-slate-800 font-black text-sm pl-1">
                        <ClipboardList size={16} className="text-indigo-500" />
                        <span>특이사항 메모 (선택)</span>
                    </div>
                    <input
                        type="text"
                        placeholder="빨간 모자 손님, 대량 구매 등"
                        className="w-full h-12 bg-slate-50 border-none rounded-2xl px-4 text-sm font-bold text-slate-700 placeholder:text-slate-300"
                        value={memo}
                        onChange={(e) => setMemo(e.target.value)}
                    />
                </div>
            </div>

            <div className="mt-8 mb-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="bg-white border border-slate-100 p-5 rounded-[2rem] shadow-xl">
                    <div className="flex gap-4 items-center">
                        <div className="flex-1 flex flex-col justify-center px-4 h-14 bg-slate-50 rounded-[1.5rem]">
                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">최종 결제 금액</span>
                            <span className="text-lg font-black text-indigo-600 leading-none">{totalAmount.toLocaleString()}원</span>
                        </div>
                        <button
                            onClick={onCheckout}
                            disabled={cartLength === 0}
                            className={`w-20 h-14 bg-indigo-600 text-white rounded-[1.5rem] flex items-center justify-center shadow-lg shadow-indigo-100 active:scale-[0.95] transition-all ${cartLength === 0 ? 'opacity-50' : ''}`}
                        >
                            <Save size={24} />
                        </button>
                    </div>
                </div>
            </div>
        </>
    );
};

export default EventCheckoutSummary;

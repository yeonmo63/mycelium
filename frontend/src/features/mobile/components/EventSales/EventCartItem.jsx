import React from 'react';

const EventCartItem = ({ item, discountRate, updateQuantity }) => {
    return (
        <div className="bg-white px-5 py-3 rounded-[1.5rem] border border-slate-100 shadow-sm flex items-center gap-4 animate-in fade-in slide-in-from-left-2 transition-all">
            <div className="flex-1 min-w-0 pr-4">
                <div className="text-sm font-black text-slate-800 truncate">{item.product_name}</div>
                {item.specification && <div className="text-[10px] text-slate-400 font-bold mt-0.5">{item.specification}</div>}
                <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] text-slate-400 font-bold line-through">{item.unit_price.toLocaleString()}원</span>
                    <span className="text-[10px] text-indigo-600 font-black">
                        {Math.round(item.unit_price * (1 - discountRate / 100)).toLocaleString()}원
                    </span>
                </div>
            </div>
            <div className="flex items-center gap-2 bg-slate-50 p-1.5 rounded-xl border border-slate-100 scale-95 origin-right">
                <button
                    type="button"
                    onClick={() => updateQuantity(item.product_id, -1)}
                    className="w-7 h-7 rounded-lg bg-white shadow-sm border border-slate-200 flex items-center justify-center text-slate-700 active:scale-90"
                ><span className="text-xl font-black leading-none select-none">-</span></button>
                <span className="text-sm font-black text-slate-800 min-w-[20px] text-center">{item.quantity}</span>
                <button
                    type="button"
                    onClick={() => updateQuantity(item.product_id, 1)}
                    className="w-7 h-7 rounded-lg bg-indigo-600 shadow-sm flex items-center justify-center text-white active:scale-90"
                ><span className="text-xl font-black leading-none select-none">+</span></button>
            </div>
        </div>
    );
};

export default EventCartItem;

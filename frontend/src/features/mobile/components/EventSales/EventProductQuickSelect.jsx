import React from 'react';
import { Plus } from 'lucide-react';

const EventProductQuickSelect = ({ products, onSelectProduct, formatCurrency }) => {
    return (
        <div className="space-y-3">
            <div className="flex items-center gap-2 text-slate-400 font-black text-xs uppercase tracking-widest pl-1">
                <Plus size={12} className="text-indigo-500" />
                <span>품목 퀵 선택</span>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
                {products.map(p => (
                    <button
                        key={p.product_id}
                        onClick={() => onSelectProduct(p.product_name)}
                        className="bg-white px-5 py-3 rounded-2xl shadow-sm border border-slate-100 whitespace-nowrap active:scale-95 transition-all flex flex-col items-center min-w-[120px] max-w-[200px] shrink-0"
                    >
                        <div className="text-sm font-black text-slate-700 w-full truncate text-center">{p.product_name}</div>
                        {p.specification && <div className="text-[10px] text-slate-400 font-bold mb-1">{p.specification}</div>}
                        <div className="text-[10px] text-indigo-500 font-black">{formatCurrency(p.unit_price)}원</div>
                    </button>
                ))}
            </div>
        </div>
    );
};

export default EventProductQuickSelect;

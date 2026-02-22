import React from 'react';
import { ShoppingCart, Plus } from 'lucide-react';

const EventProductInputSection = ({
    show,
    products,
    inputState,
    handleInputChange,
    onAdd,
    qtyInputRef,
    formatCurrency,
    selectedEventId
}) => {
    if (!show) return null;

    return (
        <div className={`bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-xl space-y-5 animate-in slide-in-from-top-4 duration-300 transition-opacity ${!selectedEventId ? 'opacity-30 pointer-events-none' : ''}`}>
            <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-tighter ml-1 mb-1.5 block">상품 선택</label>
                <select
                    name="product"
                    className="w-full h-12 bg-slate-50 border-none rounded-2xl px-5 text-[11px] font-black focus:ring-2 focus:ring-indigo-500 transition-all appearance-none"
                    value={inputState.product}
                    onChange={handleInputChange}
                >
                    <option value="" className="text-[11px]">품목을 선택하세요</option>
                    {products.map(p => (
                        <option key={p.product_id} value={p.product_name} className="text-[11px]">
                            {p.product_name} ({p.specification || '규격 없음'}) - {formatCurrency(p.unit_price)}원
                        </option>
                    ))}
                </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-tighter ml-1 mb-1.5 block">단가</label>
                    <input
                        name="price"
                        className="w-full h-12 bg-slate-50 border-none rounded-2xl text-sm font-black focus:ring-2 focus:ring-indigo-500 transition-all text-right px-4"
                        value={formatCurrency(inputState.price)}
                        onChange={(e) => handleInputChange({ target: { name: 'price', value: e.target.value.replace(/[^0-9]/g, '') } })}
                        placeholder="0"
                    />
                </div>
                <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-tighter ml-1 mb-1.5 block">수량</label>
                    <div className="h-12 bg-slate-50 rounded-2xl flex items-center px-1 border border-slate-100 overflow-hidden">
                        <button
                            type="button"
                            onClick={() => handleInputChange({ target: { name: 'qty', value: Math.max(1, Number(inputState.qty) - 1) } })}
                            className="w-10 h-10 shrink-0 flex items-center justify-center bg-white rounded-xl shadow-sm border border-slate-200 text-slate-700 active:scale-90 transition-all"
                        >
                            <span className="text-2xl font-black leading-none select-none">-</span>
                        </button>
                        <input
                            ref={qtyInputRef}
                            type="number"
                            name="qty"
                            className="flex-1 w-full bg-transparent border-none text-center font-black text-lg text-slate-800 focus:ring-0 p-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            value={inputState.qty}
                            onChange={handleInputChange}
                            inputMode="numeric"
                        />
                        <button
                            type="button"
                            onClick={() => handleInputChange({ target: { name: 'qty', value: Number(inputState.qty) + 1 } })}
                            className="w-10 h-10 shrink-0 flex items-center justify-center bg-indigo-600 rounded-xl shadow-sm text-white active:scale-90 transition-all"
                        >
                            <span className="text-2xl font-black leading-none select-none">+</span>
                        </button>
                    </div>
                </div>
            </div>

            <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-tighter ml-1 mb-1.5 block">합계 금액</label>
                <div className="h-12 bg-indigo-50/50 rounded-2xl flex items-center px-4 justify-between border border-indigo-100/50">
                    <ShoppingCart size={18} className="text-indigo-300" />
                    <span className="text-lg font-black text-indigo-600">{formatCurrency(inputState.amount)}원</span>
                </div>
            </div>

            <button
                onClick={onAdd}
                className="w-full h-14 bg-indigo-600 text-white rounded-2xl font-black shadow-lg shadow-indigo-100 flex items-center justify-center gap-3 active:scale-[0.98] transition-all"
            >
                <Plus size={20} />
                담기
            </button>
        </div>
    );
};

export default EventProductInputSection;

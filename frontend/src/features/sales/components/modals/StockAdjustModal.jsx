import React from 'react';
import { formatCurrency } from '../../../../utils/common';

const StockAdjustModal = ({ isOpen, onClose, product, val, setVal, reason, setReason, memo, setMemo, handleAdjustStock }) => {
    if (!isOpen) return null;
    const currentQty = product?.stock_quantity || 0;
    const afterQty = currentQty + (Number(val) || 0);

    return (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md transition-opacity" onClick={onClose}></div>
            <div className="bg-white rounded-[2rem] w-full max-w-[400px] shadow-2xl relative overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="bg-gradient-to-r from-orange-500 to-amber-600 p-6 text-white relative">
                    <span className="material-symbols-rounded absolute -right-6 -top-6 text-[120px] text-white/10 pointer-events-none">edit_note</span>
                    <h3 className="text-xl font-black flex items-center gap-2 relative z-10"><span className="material-symbols-rounded">edit_note</span> 재고 직접 조정</h3>
                    <p className="text-xs text-white/80 mt-1 relative z-10 font-bold">[{product?.product_name}] 수량을 수정합니다.</p>
                </div>
                <div className="p-8">
                    <div className="flex justify-between items-center mb-6 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                        <div className="text-center flex-1">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">현재고</p>
                            <p className="text-xl font-black text-slate-700">{formatCurrency(currentQty)}</p>
                        </div>
                        <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-sm"><span className="material-symbols-rounded text-slate-300">double_arrow</span></div>
                        <div className="text-center flex-1">
                            <p className="text-[10px] font-black text-orange-500 uppercase tracking-widest mb-1">조정 후</p>
                            <p className="text-xl font-black text-orange-600">{formatCurrency(afterQty)}</p>
                        </div>
                    </div>
                    <div className="space-y-5">
                        <div>
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block ml-1">조정 수량 (+입고, -출고)</label>
                            <div className="relative">
                                <input type="number" className="w-full h-14 rounded-2xl border-2 border-slate-200 bg-white text-center font-black text-2xl text-slate-700 outline-none focus:border-orange-500 transition-all placeholder:text-slate-200" value={val} onChange={e => setVal(e.target.value)} placeholder="0" autoFocus />
                                <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">{product?.specification || '단위'}</div>
                            </div>
                        </div>
                        <div>
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block ml-1">조정 사유 (Category)</label>
                            <div className="relative">
                                <select className="w-full h-12 pl-4 pr-10 rounded-xl border border-slate-200 bg-white font-bold text-sm text-slate-700 outline-none focus:ring-2 focus:ring-orange-100 focus:border-orange-400 appearance-none transition-all" value={reason} onChange={e => setReason(e.target.value)}>
                                    <option value="">일반 조정</option><option value="폐기손실">폐기(손실)</option><option value="마케팅증정">증정(마케팅)</option><option value="재고입고">입고(구매)</option><option value="자가소비">자가소비</option><option value="상품생산">완제품생산용</option>
                                </select>
                                <span className="material-symbols-rounded absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">expand_more</span>
                            </div>
                        </div>
                        <div>
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block ml-1">상세 비고 (Memo)</label>
                            <textarea className="w-full h-20 p-4 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-600 outline-none focus:ring-2 focus:ring-orange-100 focus:border-orange-400 transition-all resize-none" value={memo} onChange={e => setMemo(e.target.value)} placeholder="상세 내용을 입력하세요." />
                        </div>
                    </div>
                    <div className="flex gap-3 mt-8">
                        <button onClick={onClose} className="flex-1 h-14 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-500 font-black text-sm transition-colors">취소</button>
                        <button onClick={handleAdjustStock} className="flex-1 h-14 rounded-2xl bg-orange-500 hover:bg-orange-600 text-white font-black text-sm shadow-lg shadow-orange-200 transition-all hover:scale-[1.02] active:scale-95">저장 완료</button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default StockAdjustModal;

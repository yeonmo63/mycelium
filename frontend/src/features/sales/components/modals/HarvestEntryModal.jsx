import React from 'react';

const HarvestEntryModal = ({ isOpen, onClose, harvestModal, setHarvestModal, products, handleHarvest }) => {
    if (!isOpen) return null;

    const addHarvestItem = () => {
        const targets = products.filter(p => p.item_type === 'harvest_item' && p.status !== '단종상품');
        setHarvestModal(prev => ({
            ...prev,
            items: [...prev.items, { id: Date.now(), targetId: targets[0]?.product_id || '', qty: '', grade: 'A' }]
        }));
    };

    const removeHarvestItem = (id) => {
        if (harvestModal.items.length <= 1) return;
        setHarvestModal(prev => ({
            ...prev,
            items: prev.items.filter(item => item.id !== id)
        }));
    };

    const updateHarvestItem = (id, field, value) => {
        setHarvestModal(prev => ({
            ...prev,
            items: prev.items.map(item => item.id === id ? { ...item, [field]: value } : item)
        }));
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md transition-opacity" onClick={onClose}></div>
            <div className="bg-white rounded-2xl w-full max-w-[650px] shadow-2xl relative overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
                <div className="bg-gradient-to-r from-emerald-500 to-teal-600 p-6 text-white relative overflow-hidden shrink-0">
                    <span className="material-symbols-rounded absolute -right-6 -top-6 text-[120px] text-white/10 pointer-events-none">spa</span>
                    <h3 className="text-lg font-black flex items-center gap-2 relative z-10"><span className="material-symbols-rounded">spa</span> 농산물 수확 입고</h3>
                    <p className="text-xs text-white/80 mt-1 relative z-10 font-medium">당일 수확한 품목들을 한 번에 등록합니다.</p>
                </div>
                <div className="p-6 overflow-y-auto stylish-scrollbar flex-1">
                    <div className="space-y-4">
                        {harvestModal.items.map((item, idx) => (
                            <div key={item.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-200 relative group animate-in slide-in-from-top-2 duration-200">
                                <div className="grid grid-cols-12 gap-3 items-end">
                                    <div className="col-span-12 md:col-span-5">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block ml-1">수확 품목 {idx + 1}</label>
                                        <div className="relative">
                                            <select className="w-full h-11 pl-3 pr-8 rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-emerald-100 focus:border-emerald-300 appearance-none transition-all" value={item.targetId} onChange={e => updateHarvestItem(item.id, 'targetId', e.target.value)}>
                                                {products.filter(p => p.item_type === 'harvest_item' && p.status !== '단종상품').map(p => (<option key={p.product_id} value={p.product_id}>📦 {p.product_name}</option>))}
                                            </select>
                                            <span className="material-symbols-rounded absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">expand_more</span>
                                        </div>
                                    </div>
                                    <div className="col-span-7 md:col-span-4">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block ml-1">품질 등급</label>
                                        <div className="relative">
                                            <select className="w-full h-11 pl-3 pr-8 rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-600 outline-none focus:ring-2 focus:ring-emerald-100 focus:border-emerald-300 appearance-none transition-all" value={item.grade} onChange={e => updateHarvestItem(item.id, 'grade', e.target.value)}>
                                                <option value="A">A등급 (특상)</option><option value="B">B등급 (상)</option><option value="C">C등급 (보통)</option><option value="S">S등급 (가공)</option>
                                            </select>
                                            <span className="material-symbols-rounded absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">expand_more</span>
                                        </div>
                                    </div>
                                    <div className="col-span-5 md:col-span-3 flex items-center gap-2">
                                        <div className="flex-1">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block ml-1 text-right">수량</label>
                                            <div className="relative">
                                                <input type="number" min="0" step="any" className="w-full h-11 rounded-xl border border-slate-200 bg-white text-right font-black text-lg text-emerald-600 pr-8 outline-none focus:ring-2 focus:ring-emerald-100 focus:border-emerald-300 transition-all placeholder:text-slate-200" value={item.qty} onChange={e => updateHarvestItem(item.id, 'qty', e.target.value)} placeholder="0" />
                                                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] font-bold text-slate-400">kg</span>
                                            </div>
                                        </div>
                                        {harvestModal.items.length > 1 && (
                                            <button onClick={() => removeHarvestItem(item.id)} className="mt-6 h-11 w-11 rounded-xl bg-slate-100 text-slate-400 hover:bg-rose-50 hover:text-rose-500 transition-all flex items-center justify-center shrink-0"><span className="material-symbols-rounded text-lg">delete</span></button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                        <button onClick={addHarvestItem} className="w-full py-3 rounded-xl border-2 border-dashed border-slate-200 text-slate-400 font-bold text-xs flex items-center justify-center gap-2 hover:bg-slate-50 hover:border-emerald-200 hover:text-emerald-500 transition-all"><span className="material-symbols-rounded text-base">add_circle</span> 수확 품목 추가</button>
                    </div>
                    <div className="mt-8">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block ml-1 italic">수확 비고 (Harvest Memo)</label>
                        <textarea className="w-full h-20 p-3 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold text-slate-600 outline-none focus:ring-2 focus:ring-emerald-100 focus:border-emerald-300 transition-all resize-none" value={harvestModal.memo} onChange={e => setHarvestModal(prev => ({ ...prev, memo: e.target.value }))} placeholder="상세 내용을 기록하세요." />
                    </div>
                </div>
                <div className="p-6 bg-slate-50 border-t border-slate-100 shrink-0">
                    <div className="flex gap-3">
                        <button onClick={onClose} className="flex-1 h-12 rounded-xl bg-white border border-slate-200 text-slate-500 font-bold text-sm hover:bg-slate-100 transition-colors">취소</button>
                        <button onClick={handleHarvest} className="flex-1 h-12 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm shadow-lg shadow-emerald-200 transition-all flex items-center justify-center">수확 입고 완료</button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default HarvestEntryModal;

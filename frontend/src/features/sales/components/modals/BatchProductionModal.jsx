import React, { useEffect } from 'react';
import { formatCurrency } from '../../../../utils/common';

const BatchProductionModal = ({ isOpen, onClose, convertModal, setConvertModal, products, handleBatchConvert }) => {
    if (!isOpen) return null;

    const updateConvertTarget = (id, field, value) => {
        setConvertModal(prev => ({
            ...prev,
            targets: prev.targets.map(t => t.id === id ? { ...t, [field]: value } : t)
        }));
    };

    const handleDeductionQtyChange = (id, val) => {
        const newVal = Number(val);
        setConvertModal(prev => {
            const targetMaterial = prev.deductions.find(d => d.id === id);
            if (!targetMaterial) return prev;
            if (prev.primaryMaterialId && targetMaterial.materialId === Number(prev.primaryMaterialId)) {
                if (targetMaterial.tQty > 0 && newVal > 0) {
                    const scaleFactor = newVal / targetMaterial.tQty;
                    if (isFinite(scaleFactor) && Math.abs(scaleFactor - 1) > 0.001) {
                        const newTargets = prev.targets.map(t => ({
                            ...t,
                            qty: Math.max(1, Math.round(t.qty * scaleFactor))
                        }));
                        return { ...prev, targets: newTargets };
                    }
                }
            }
            return {
                ...prev,
                deductions: prev.deductions.map(d => d.id === id ? { ...d, rQty: newVal } : d)
            };
        });
    };

    // Load and Aggregate BOMs
    useEffect(() => {
        if (!isOpen) return;
        const syncBOMs = async () => {
            setConvertModal(prev => ({ ...prev, loading: true }));
            try {
                const targetIds = convertModal.targets.filter(t => t.productId).map(t => Number(t.productId));
                if (targetIds.length === 0) {
                    setConvertModal(prev => ({ ...prev, loading: false }));
                    return;
                }
                const uniqueIds = [...new Set(targetIds)];
                const bomMap = {};
                for (const pid of uniqueIds) {
                    if (window.__TAURI__) {
                        const boms = await window.__TAURI__.core.invoke('get_product_bom', { productId: pid });
                        bomMap[pid] = boms || [];
                    }
                }
                const aggregation = {};
                convertModal.targets.forEach(target => {
                    const pid = Number(target.productId);
                    const qty = Number(target.qty) || 0;
                    if (!pid) return;
                    const boms = bomMap[pid] || [];
                    boms.forEach(b => {
                        if (!aggregation[b.material_id]) {
                            aggregation[b.material_id] = {
                                materialId: b.material_id,
                                name: b.product_name,
                                stock: b.stock_quantity,
                                tQty: 0,
                                ratio: b.ratio,
                                type: b.item_type === 'harvest_item' ? 'raw' :
                                    (b.item_type === 'aux_material' || b.item_type === 'raw_material' || b.item_type === 'material') ? 'aux' : 'prod'
                            };
                        }
                        aggregation[b.material_id].tQty += Math.ceil(qty * b.ratio);
                    });
                });
                setConvertModal(prev => {
                    const aggList = Object.values(aggregation);
                    let autoPrimaryId = prev.primaryMaterialId;
                    let needsScaling = false;
                    let scaleFactor = 1;
                    const nextDeductions = aggList.map(agg => {
                        const existing = prev.deductions.find(d => d.materialId === agg.materialId);
                        let finalRQty = agg.tQty;
                        if (existing) {
                            if (autoPrimaryId && existing.materialId === Number(autoPrimaryId) && existing.tQty === 0 && existing.rQty > 0) {
                                if (agg.tQty > 0) {
                                    scaleFactor = existing.rQty / agg.tQty;
                                    if (isFinite(scaleFactor) && scaleFactor > 0.001) {
                                        needsScaling = true;
                                        finalRQty = existing.rQty;
                                    }
                                }
                            } else {
                                finalRQty = (existing.tQty === agg.tQty) ? existing.rQty : agg.tQty;
                            }
                        }
                        return { id: existing?.id || (Date.now() + Math.random()), materialId: agg.materialId, name: agg.name, stock: agg.stock, tQty: agg.tQty, ratio: agg.ratio, rQty: finalRQty, type: agg.type };
                    });
                    if (!autoPrimaryId && aggList.length > 0) {
                        const rawItem = aggList.find(a => a.type === 'raw');
                        autoPrimaryId = rawItem ? String(rawItem.materialId) : String(aggList[0].materialId);
                    }
                    if (needsScaling) {
                        const newTargets = prev.targets.map(t => ({ ...t, qty: Math.max(1, Math.round(t.qty * scaleFactor)) }));
                        return { ...prev, deductions: nextDeductions, targets: newTargets, primaryMaterialId: autoPrimaryId, loading: false };
                    }
                    return { ...prev, deductions: nextDeductions, primaryMaterialId: autoPrimaryId, loading: false };
                });
            } catch (e) {
                console.error(e);
                setConvertModal(prev => ({ ...prev, loading: false }));
            }
        };
        syncBOMs();
    }, [JSON.stringify(convertModal.targets.map(t => ({ p: t.productId, q: t.qty })))]);

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md transition-opacity" onClick={onClose}></div>
            <div className="bg-white rounded-[2.5rem] w-full max-w-[850px] shadow-2xl relative overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
                <div className="bg-gradient-to-br from-indigo-600 via-indigo-700 to-purple-800 p-8 text-white relative">
                    <div className="flex justify-between items-start relative z-10">
                        <div><div className="flex items-center gap-3 mb-2"><div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center border border-white/30 shadow-inner"><span className="material-symbols-rounded text-3xl">inventory_2</span></div><div><h3 className="text-2xl font-black tracking-tight" style={{ fontFamily: '"Noto Sans KR", sans-serif' }}>통합 상품화 처리</h3></div></div></div>
                        <button onClick={onClose} className="w-10 h-10 rounded-full hover:bg-white/10 flex items-center justify-center transition-colors group"><span className="material-symbols-rounded text-white/50 group-hover:text-white">close</span></button>
                    </div>
                    <div className="flex gap-4 mt-6">
                        <div className="px-4 py-2 bg-white/10 rounded-2xl border border-white/10 backdrop-blur-sm"><p className="text-[10px] font-black text-indigo-200 uppercase mb-0.5">생산 대상</p><p className="text-lg font-black">{convertModal.targets.filter(t => t.productId).length}종류</p></div>
                        <div className="px-4 py-2 bg-white/10 rounded-2xl border border-white/10 backdrop-blur-sm"><p className="text-[10px] font-black text-indigo-200 uppercase mb-0.5">사용 자재</p><p className="text-lg font-black">{convertModal.deductions.length}종류</p></div>
                    </div>
                    <span className="material-symbols-rounded absolute -right-12 -top-12 text-[240px] text-white/5 pointer-events-none rotate-12">conveyor_belt</span>
                </div>
                <div className="flex-1 overflow-hidden flex flex-col bg-slate-50/50">
                    <div className="flex-1 overflow-y-auto stylish-scrollbar p-8">
                        <div className="grid grid-cols-12 gap-10">
                            <div className="col-span-12 lg:col-span-7">
                                <div className="mb-10"><h4 className="text-sm font-black text-slate-800 flex items-center gap-2 mb-4"><span className="w-6 h-6 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center text-xs">01</span> 생산 상품명</h4>
                                    <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2 stylish-scrollbar">
                                        {convertModal.targets.map((target) => (
                                            <div key={target.id} className="p-4 bg-white rounded-2xl border border-slate-200 shadow-sm relative group animate-in slide-in-from-left-4 duration-300">
                                                <div className="grid grid-cols-12 gap-4 items-end">
                                                    <div className="col-span-7"><label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block ml-1">생산 품목 선택</label>
                                                        <div className="relative">
                                                            <select className="w-full h-11 pl-3 pr-8 rounded-xl border border-slate-100 bg-slate-50 text-sm font-bold text-slate-700 outline-none focus:ring-4 focus:ring-indigo-50 focus:border-indigo-300 appearance-none transition-all" value={target.productId} onChange={e => updateConvertTarget(target.id, 'productId', e.target.value)}>
                                                                <option value="">-- 생산 품목 선택 --</option>
                                                                {products.filter(p => (!p.item_type || p.item_type === 'product') && p.status !== '단종상품').map(p => {
                                                                    const isRecommended = convertModal.primaryMaterialId && (p.product_name.includes(products.find(x => x.product_id === Number(convertModal.primaryMaterialId))?.product_name?.split(' ')[0]));
                                                                    return (<option key={p.product_id} value={p.product_id}>{isRecommended ? '⭐ ' : ''}{p.product_name} ({p.specification || '규격없음'})</option>);
                                                                })}
                                                            </select>
                                                            <span className="material-symbols-rounded absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">expand_more</span>
                                                        </div>
                                                    </div>
                                                    <div className="col-span-4"><label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block ml-1">생산 수량</label>
                                                        <div className="relative group/field"><input type="number" className="w-full h-11 rounded-xl border-2 border-indigo-200 bg-white text-right font-black text-lg text-indigo-700 pr-10 outline-none focus:ring-4 focus:ring-indigo-50 focus:border-indigo-400 transition-all shadow-sm" value={target.qty} onChange={e => updateConvertTarget(target.id, 'qty', e.target.value)} /><span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">{products.find(p => p.product_id === Number(target.productId))?.specification?.replace(/\d/g, '').replace('g', '') || '개'}</span></div>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                <div className="mb-10"><h4 className="text-sm font-black text-slate-800 flex items-center gap-2 mb-4"><span className="w-6 h-6 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center text-xs">02</span> 투입 농산물 (원물)</h4>
                                    <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 stylish-scrollbar">
                                        {convertModal.deductions.filter(d => d.type === 'raw').length === 0 ? (<div className="p-8 bg-slate-50 border border-dashed border-slate-200 rounded-2xl text-center text-[11px] font-bold text-slate-400">선택된 농산물이 없습니다. 생산 상품의 레시피를 확인하세요.</div>) : (
                                            convertModal.deductions.filter(d => d.type === 'raw').map((d) => {
                                                const isPrimary = String(d.materialId) === convertModal.primaryMaterialId;
                                                const specStr = products.find(p => p.product_id === d.materialId)?.specification || 'kg';
                                                const unit = specStr.replace(/[0-9.]/g, '').trim();
                                                return (
                                                    <div key={d.id} className={`p-4 rounded-2xl border transition-all shadow-sm flex items-center gap-4 ${isPrimary ? 'bg-emerald-50/30 border-emerald-200 ring-1 ring-emerald-100' : 'bg-white border-slate-200'}`}>
                                                        <div className="flex-1 min-w-0"><div className="flex items-center gap-2 mb-1"><span className={`material-symbols-rounded text-lg ${isPrimary ? 'text-emerald-500' : 'text-slate-400'}`}>{isPrimary ? 'stars' : 'spa'}</span><span className="text-xs font-black text-slate-700 truncate">{d.name}</span>{isPrimary && <span className="text-[9px] font-black bg-emerald-500 text-white px-1.5 py-0.5 rounded uppercase tracking-tighter">기준</span>}</div><div className="flex items-center gap-2"><span className="text-[10px] font-bold text-slate-400 italic">재고: {d.stock?.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}{unit}</span><span className="text-[10px] font-bold text-emerald-600/60 transition-opacity">, 레시피 비율: {d.ratio?.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}{unit}<span className="ml-1 opacity-60">(총 필요량: {d.tQty?.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}{unit})</span></span></div></div>
                                                        <div className="w-32 relative shrink-0"><input type="number" className={`w-full h-11 rounded-xl border-2 text-right font-black text-lg pr-10 outline-none transition-all shadow-sm ${isPrimary ? 'border-emerald-400 bg-white text-emerald-700 focus:ring-4 focus:ring-emerald-100' : 'border-slate-200 bg-slate-50 focus:bg-white focus:border-indigo-300'}`} value={d.rQty} onChange={e => handleDeductionQtyChange(d.id, e.target.value)} /><span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">{unit}</span></div>
                                                        {!isPrimary && (<button onClick={() => setConvertModal(prev => ({ ...prev, primaryMaterialId: String(d.materialId) }))} className="h-11 px-3 rounded-xl border border-slate-200 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-all active:scale-95" title="기준 품목으로 설정"><span className="material-symbols-rounded text-lg">star_rate</span></button>)}
                                                    </div>
                                                );
                                            })
                                        )}
                                    </div>
                                    {convertModal.deductions.some(d => d.type === 'raw') && (<div className="mt-3 text-[10px] font-bold text-slate-400 ml-1 flex items-center gap-1.5"><span className="material-symbols-rounded text-sm text-emerald-500">info</span>기준 품목의 수량을 변경하면 생산 상품과 나머지 자재 수량이 연동됩니다. (레시피 기준)</div>)}
                                </div>
                                <div className="mt-8"><label className="text-sm font-black text-slate-800 flex items-center gap-2 mb-4"><span className="w-6 h-6 rounded-lg bg-slate-200 text-slate-600 flex items-center justify-center text-xs">03</span> 일지 및 비고 (Memo)</label><textarea className="w-full h-24 p-4 rounded-[1.5rem] border border-slate-200 bg-white shadow-sm text-sm font-medium text-slate-600 outline-none focus:ring-4 focus:ring-indigo-50 focus:border-indigo-300 transition-all resize-none placeholder:text-slate-300" placeholder="상세 내용을 기록하세요." value={convertModal.memo} onChange={e => setConvertModal(prev => ({ ...prev, memo: e.target.value }))} /></div>
                            </div>
                            <div className="col-span-12 lg:col-span-5 border-l border-slate-200 pl-4 lg:pl-10">
                                <div className="flex justify-between items-center mb-6"><div><h4 className="text-sm font-black text-slate-800 flex items-center gap-2"><span className="w-6 h-6 rounded-lg bg-amber-100 text-amber-600 flex items-center justify-center text-xs">04</span> 기타 자재 차감 요약</h4><p className="text-[10px] text-slate-400 mt-1 font-bold">부자재 소모량입니다.</p></div>{convertModal.loading && <span className="text-[10px] text-indigo-500 animate-pulse font-black uppercase tracking-tighter">Recalculating...</span>}</div>
                                <div className="bg-slate-100/50 rounded-[2.5rem] border border-slate-200 p-6 flex flex-col min-h-[400px]">
                                    {convertModal.deductions.filter(d => d.type !== 'raw').length === 0 && !convertModal.loading ? (<div className="flex-1 flex flex-col items-center justify-center p-10 text-center opacity-40"><span className="material-symbols-rounded text-5xl mb-4 text-slate-300">fact_check</span><p className="text-xs font-black text-slate-500">BOM 자재가 없습니다.</p></div>) : (
                                        <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2 stylish-scrollbar"><div className="grid grid-cols-1 gap-2">
                                            {convertModal.deductions.filter(d => d.type !== 'raw').map((d) => {
                                                const isShort = d.stock < d.rQty;
                                                return (
                                                    <div key={d.id} className={`flex items-center justify-between p-3 rounded-2xl border bg-white shadow-sm hover:border-indigo-200 transition-all ${isShort ? 'border-rose-200 bg-rose-50/30' : 'border-slate-100'}`}>
                                                        <div className="flex items-center gap-2"><div className={`w-8 h-8 rounded-lg flex items-center justify-center ${d.type === 'aux' ? 'bg-orange-50 text-orange-500' : d.type === 'prod' ? 'bg-indigo-50 text-indigo-500' : 'bg-emerald-50 text-emerald-500'}`}><span className="material-symbols-rounded text-base">{d.type === 'aux' ? 'package_2' : d.type === 'prod' ? 'box' : 'spa'}</span></div><div><p className="text-[11px] font-black text-slate-700">{d.name}</p><p className={`text-[9px] font-bold ${isShort ? 'text-rose-500' : 'text-slate-400'}`}>재고: {formatCurrency(d.stock)} {isShort && '(부족)'}</p></div></div>
                                                        <div className="text-right"><span className="text-sm font-black text-slate-600">-{formatCurrency(d.rQty)}</span></div>
                                                    </div>
                                                );
                                            })}
                                        </div></div>
                                    )}
                                    <div className="mt-6 flex flex-col items-center"><div className="px-4 py-2 bg-white/50 border border-dashed border-slate-300 rounded-2xl text-[10px] font-bold text-slate-400 flex items-center gap-2"><span className="material-symbols-rounded text-sm">info</span>레시피 기준 자동 산출됨</div></div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <div className="p-8 bg-white border-t border-slate-100 flex gap-4 shrink-0 shadow-[0_-10px_20px_-15px_rgba(0,0,0,0.1)]">
                    <button onClick={onClose} className="px-8 h-14 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-600 font-black text-sm transition-all">취소</button>
                    <button onClick={handleBatchConvert} className="flex-1 h-14 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-lg shadow-lg shadow-indigo-200 transition-all hover:scale-[1.01] active:scale-95 flex items-center justify-center gap-3 group"><span className="material-symbols-rounded group-hover:animate-bounce">conveyor_belt</span>통합 상품화 완료</button>
                </div>
            </div>
        </div>
    );
};

export default BatchProductionModal;

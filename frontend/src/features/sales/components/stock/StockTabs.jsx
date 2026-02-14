import React from 'react';

const StockTabs = ({ tab, setTab, openHarvestModal, openConvertModal, auxSubTab, setAuxSubTab, searchQuery, setSearchQuery }) => {
    return (
        <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-white z-10">
            <div className="flex gap-2">
                <div className="flex bg-slate-100 p-1 rounded-xl">
                    <button onClick={() => setTab('product')} className={`px-4 py-3 rounded-lg text-sm font-black flex items-center gap-2 transition-all ${tab === 'product' ? 'bg-white text-indigo-600 shadow-sm scale-[1.02]' : 'text-slate-500 hover:text-slate-700'}`}>
                        <span className="material-symbols-rounded text-xl">potted_plant</span> 완제품
                    </button>
                    <button onClick={() => setTab('harvest_item')} className={`px-4 py-3 rounded-lg text-sm font-black flex items-center gap-2 transition-all ${tab === 'harvest_item' ? 'bg-white text-emerald-600 shadow-sm scale-[1.02]' : 'text-slate-500 hover:text-slate-700'}`}>
                        <span className="material-symbols-rounded text-xl">spa</span> 농산물 (수확물)
                    </button>
                    <button onClick={() => setTab('aux_material')} className={`px-4 py-3 rounded-lg text-sm font-black flex items-center gap-2 transition-all ${tab === 'aux_material' ? 'bg-white text-orange-600 shadow-sm scale-[1.02]' : 'text-slate-500 hover:text-slate-700'}`}>
                        <span className="material-symbols-rounded text-xl">layers</span> 부자재 (포장재)
                    </button>
                </div>

                <div className="flex gap-2">
                    {tab === 'harvest_item' && (
                        <button onClick={openHarvestModal} className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm shadow-lg shadow-emerald-100 flex items-center gap-2 transition-all hover:scale-[1.02] active:scale-95 animate-in fade-in zoom-in duration-300">
                            <span className="material-symbols-rounded text-lg">spa</span> 수확 입고
                        </button>
                    )}
                    {(tab === 'product' || tab === 'harvest_item') && (
                        <button onClick={openConvertModal} className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-sm shadow-lg shadow-indigo-100 flex items-center gap-2 transition-all hover:scale-[1.02] active:scale-95 animate-in fade-in zoom-in duration-300">
                            <span className="material-symbols-rounded text-lg">inventory_2</span> 통합 상품화
                        </button>
                    )}
                </div>
            </div>

            <div className="flex items-center gap-4">
                {tab === 'aux_material' && (
                    <div className="flex bg-slate-50 p-1 rounded-xl border border-slate-200 animate-in slide-in-from-right-4 duration-300">
                        {[
                            { id: 'ALL', label: '전체' },
                            { id: '박스/포장', label: '📦 박스' },
                            { id: '라벨/스티커', label: '🏷️ 라벨' },
                            { id: '생산재', label: '🧪 생산재' },
                            { id: '기타 소모품', label: '🔧 기타' }
                        ].map(sub => (
                            <button
                                key={sub.id}
                                onClick={() => setAuxSubTab(sub.id)}
                                className={`px-3 py-1.5 rounded-lg text-[11px] font-black transition-all ${auxSubTab === sub.id ? 'bg-white text-orange-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                            >
                                {sub.label}
                            </button>
                        ))}
                    </div>
                )}
                <div className="relative group w-64">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 material-symbols-rounded text-lg group-focus-within:text-indigo-500 transition-colors">search</span>
                    <input
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="pl-10 pr-4 h-10 w-full bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:bg-white focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300 transition-all placeholder:text-slate-400"
                        placeholder="품목명 검색..."
                    />
                </div>
            </div>
        </div>
    );
};

export default StockTabs;

import React from 'react';

const InventoryQuickInfo = () => {
    return (
        <div className="mb-6 flex flex-wrap gap-4 px-6 lg:px-8 min-[2000px]:px-12 pt-1 pb-1 shrink-0">
            <div className="flex-1 min-w-[200px] bg-indigo-50/50 border border-indigo-100 p-3 rounded-2xl flex items-center gap-3">
                <span className="material-symbols-rounded text-indigo-600 bg-white p-1.5 rounded-xl text-lg shadow-sm">potted_plant</span>
                <div>
                    <p className="text-[10px] font-black text-indigo-900 uppercase">완제품</p>
                    <p className="text-[9px] text-indigo-500 font-bold leading-tight uppercase">최종 상품 (Final Products)</p>
                </div>
            </div>
            <div className="flex-1 min-w-[200px] bg-emerald-50/50 border border-emerald-100 p-3 rounded-2xl flex items-center gap-3">
                <span className="material-symbols-rounded text-emerald-600 bg-white p-1.5 rounded-xl text-lg shadow-sm">spa</span>
                <div>
                    <p className="text-[10px] font-black text-emerald-900 uppercase">농산물</p>
                    <p className="text-[9px] text-emerald-500 font-bold leading-tight uppercase">수확 원물 (Raw Materials)</p>
                </div>
            </div>
            <div className="flex-1 min-w-[200px] bg-orange-50/50 border border-orange-100 p-3 rounded-2xl flex items-center gap-3">
                <span className="material-symbols-rounded text-orange-600 bg-white p-1.5 rounded-xl text-lg shadow-sm">layers</span>
                <div>
                    <p className="text-[10px] font-black text-orange-900 uppercase">부자재</p>
                    <p className="text-[9px] text-orange-500 font-bold leading-tight uppercase">포장 및 소모품 (Aux Materials)</p>
                </div>
            </div>
        </div>
    );
};

export default InventoryQuickInfo;

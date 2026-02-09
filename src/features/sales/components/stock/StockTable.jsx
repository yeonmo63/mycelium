import React from 'react';
import { formatCurrency, formatDateTime } from '../../../../utils/common';

const StockTable = ({ products, tab, getFreshnessInfo, openAdjustModal, openHarvestModal, openConvertModal, openBomModal }) => {
    const getSubTag = (product) => {
        if (product.item_type !== 'aux_material' && product.item_type !== 'raw_material' && product.item_type !== 'material') return null;
        if (product.category) {
            const cat = product.category;
            if (cat === '박스/포장') return { label: '박스', color: 'bg-orange-100 text-orange-700 border-orange-200' };
            if (cat === '라벨/스티커') return { label: '라벨', color: 'bg-blue-100 text-blue-700 border-blue-200' };
            if (cat === '비닐/봉투') return { label: '봉투', color: 'bg-emerald-100 text-emerald-700 border-emerald-200' };
            if (cat === '생산재') return { label: '생산재', color: 'bg-purple-100 text-purple-700 border-purple-200' };
            return { label: cat.replace(' 기타', ''), color: 'bg-slate-100 text-slate-700 border-slate-200' };
        }
        const name = product.product_name;
        if (name.includes('박스') || name.includes('상자')) return { label: '박스', color: 'bg-orange-100 text-orange-700 border-orange-200' };
        if (name.includes('스티커') || name.includes('라벨')) return { label: '라벨', color: 'bg-blue-100 text-blue-700 border-blue-200' };
        if (name.includes('비닐') || name.includes('봉투')) return { label: '봉투', color: 'bg-emerald-100 text-emerald-700 border-emerald-200' };
        if (name.includes('배지') || name.includes('종균')) return { label: '생산재', color: 'bg-purple-100 text-purple-700 border-purple-200' };
        if (name.includes('테이프') || name.includes('끈')) return { label: '기타', color: 'bg-slate-100 text-slate-700 border-slate-200' };
        return { label: '자재', color: 'bg-amber-100 text-amber-700 border-amber-200' };
    };

    return (
        <div className="flex-1 overflow-auto stylish-scrollbar relative">
            <table className="w-full text-xs text-left border-collapse table-fixed">
                <thead className="sticky top-0 bg-slate-50/95 backdrop-blur z-10 shadow-sm text-slate-500 uppercase font-bold tracking-wider">
                    <tr>
                        <th className="px-2 py-3 text-center w-[5%] border-b border-slate-100">No</th>
                        <th className="px-2 py-3 w-[25%] border-b border-slate-100">
                            {tab === 'raw_material' ? '품목명 (원물)' : tab === 'aux_material' ? '자재명 (부자재)' : '상품명 (완제품)'}
                        </th>
                        <th className="px-2 py-3 text-center w-[12%] border-b border-slate-100">규격</th>
                        <th className="px-2 py-3 text-right w-[15%] border-b border-slate-100 bg-indigo-50/30 text-indigo-900">현재고</th>
                        <th className="px-2 py-3 text-center w-[15%] border-b border-slate-100 italic text-slate-400">최근 입출고일</th>
                        <th className="px-2 py-3 text-center w-[13%] border-b border-slate-100">작업</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                    {products.map((p, idx) => {
                        const current = p.stock_quantity || 0;
                        const isLow = current <= (p.safety_stock || 10);
                        const freshInfo = getFreshnessInfo(p.product_id);
                        let freshBadge = null;
                        const isMaterial = p.item_type === 'raw_material' || p.item_type === 'material';
                        const isProduct = !p.item_type || p.item_type === 'product';

                        if (current > 0 && freshInfo && (isMaterial || isProduct)) {
                            const d = freshInfo.diffDays - 1;
                            const displayDays = d < 0 ? 0 : d;
                            if (d >= 7) {
                                freshBadge = (
                                    <div className="flex items-center gap-1.5 mt-0.5">
                                        <div className="flex-1 h-1 bg-red-100 rounded-full overflow-hidden"><div className="h-full bg-red-500 w-full animate-pulse"></div></div>
                                        <span className="shrink-0 text-[10px] font-black text-red-600 bg-red-50 px-1 rounded border border-red-100">경과 {d}일</span>
                                    </div>
                                );
                            } else if (d >= 3) {
                                const pct = Math.min((d / 7) * 100, 100);
                                freshBadge = (
                                    <div className="flex items-center gap-1.5 mt-0.5">
                                        <div className="flex-1 h-1 bg-orange-100 rounded-full overflow-hidden"><div className="h-full bg-orange-500" style={{ width: `${pct}%` }}></div></div>
                                        <span className="shrink-0 text-[10px] font-black text-orange-600 bg-orange-50 px-1 rounded border border-orange-100">판매권장 ({d}일)</span>
                                    </div>
                                );
                            } else {
                                freshBadge = (
                                    <div className="flex items-center gap-1.5 mt-0.5">
                                        <div className="flex-1 h-1 bg-emerald-100 rounded-full overflow-hidden"><div className="h-full bg-emerald-500" style={{ width: '20%' }}></div></div>
                                        <span className="shrink-0 text-[10px] font-black text-emerald-600 bg-emerald-50 px-1 rounded border border-emerald-100">신선 ({d}일)</span>
                                    </div>
                                );
                            }
                        }

                        return (
                            <tr key={p.product_id} className="hover:bg-slate-50/80 transition-colors group">
                                <td className="px-2 py-3 text-center text-slate-400 font-mono text-[10px]">{idx + 1}</td>
                                <td className="px-2 py-3">
                                    <div className="flex flex-col justify-center h-full">
                                        <div className="flex items-center gap-2 mb-0.5">
                                            <span className="font-bold text-slate-700 truncate" title={p.product_name}>{p.product_name}</span>
                                            {tab === 'aux_material' && getSubTag(p) && (
                                                <span className={`px-1.5 py-0.5 rounded text-[9px] font-black border uppercase shrink-0 ${getSubTag(p).color}`}>{getSubTag(p).label}</span>
                                            )}
                                        </div>
                                        {freshBadge}
                                    </div>
                                </td>
                                <td className="px-2 py-3 text-center text-slate-500 truncate">{p.specification || '-'}</td>
                                <td className={`px-2 py-3 text-right font-black text-sm bg-indigo-50/5 ${isLow ? 'text-red-500' : 'text-slate-700'}`}>
                                    {formatCurrency(current)}
                                    {isLow && <span className="material-symbols-rounded text-sm align-middle ml-1 text-red-500 animate-pulse" title="안전재고 부족">error</span>}
                                </td>
                                <td className="px-2 py-3 text-center text-slate-400 text-[10px] font-medium">{freshInfo?.dateStr ? formatDateTime(freshInfo.dateStr).split(' ')[0] : '-'}</td>
                                <td className="px-2 py-3 text-center">
                                    <div className="flex items-center justify-center gap-1.5">
                                        {(tab === 'harvest_item' || tab === 'product') && (
                                            <>
                                                {tab === 'harvest_item' && (
                                                    <button onClick={() => openHarvestModal(p.product_id)} className="inline-flex items-center justify-center p-2 rounded-xl bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-all active:scale-95 shadow-sm border border-emerald-100" title="수확 입고">
                                                        <span className="material-symbols-rounded text-base">spa</span>
                                                    </button>
                                                )}
                                                <button onClick={() => openConvertModal(p.product_id)} className="inline-flex items-center justify-center p-2 rounded-xl bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-all active:scale-95 shadow-sm border border-indigo-100" title={tab === 'product' ? '세트 구성/생산' : '상품화 (포장)'}>
                                                    <span className="material-symbols-rounded text-base">inventory_2</span>
                                                </button>
                                            </>
                                        )}
                                        <button onClick={() => openAdjustModal(p)} className="inline-flex items-center justify-center p-2 rounded-xl bg-orange-50 text-orange-600 hover:bg-orange-100 transition-all active:scale-95 shadow-sm border border-orange-100" title="재고 조정">
                                            <span className="material-symbols-rounded text-base">edit_note</span>
                                        </button>
                                        {tab === 'product' && (
                                            <button onClick={() => openBomModal(p)} className="inline-flex items-center justify-center p-2 rounded-xl bg-violet-50 text-violet-600 hover:bg-violet-100 transition-all active:scale-95 shadow-sm border border-violet-100" title="구성 자재 관리 (BOM)">
                                                <span className="material-symbols-rounded text-base">account_tree</span>
                                            </button>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        );
                    })}
                    {products.length === 0 && (
                        <tr><td colSpan="8" className="py-20 text-center text-slate-400 font-medium">검색 결과가 없습니다.</td></tr>
                    )}
                </tbody>
            </table>
        </div>
    );
};

export default StockTable;

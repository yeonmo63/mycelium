import React, { useState, useEffect, useCallback } from 'react';
import { useModal } from '../../../../contexts/ModalContext';

const BomManagementModal = ({ isOpen, onClose, product, allProducts }) => {
    const { showAlert, showConfirm } = useModal();
    const [bomList, setBomList] = useState([]);
    const [loading, setLoading] = useState(false);

    // Form State
    const [selectedMaterial, setSelectedMaterial] = useState('');
    const [ratio, setRatio] = useState(1);

    const loadBom = useCallback(async () => {
        if (!product?.product_id) return;
        setLoading(true);
        try {
            if (window.__TAURI__) {
                const list = await window.__TAURI__.core.invoke('get_product_bom', { productId: product.product_id });
                setBomList(list || []);
            }
        } catch (e) {
            console.error(e);
            showAlert('오류', '자재 명세서를 불러오는데 실패했습니다.');
        } finally {
            setLoading(false);
        }
    }, [product, showAlert]);

    useEffect(() => {
        if (isOpen && product) {
            loadBom();
            setSelectedMaterial('');
            setRatio(1);
        }
    }, [isOpen, product, loadBom]);

    const handleAdd = async () => {
        if (!selectedMaterial) {
            showAlert('알림', '자재를 선택해주세요.');
            return;
        }
        if (ratio <= 0) {
            showAlert('알림', '수량은 0보다 커야 합니다.');
            return;
        }

        try {
            if (window.__TAURI__) {
                await window.__TAURI__.core.invoke('add_bom_item', {
                    productId: product.product_id,
                    materialId: Number(selectedMaterial),
                    ratio: Number(ratio)
                });
                await loadBom();
                setSelectedMaterial('');
                setRatio(1);
            }
        } catch (e) {
            console.error(e);
            showAlert('오류', '자재 추가 중 오류가 발생했습니다. (이미 존재하는 자재일 수 있습니다)');
        }
    };

    const handleDelete = async (materialId) => {
        if (!await showConfirm('삭제 확인', '이 자재를 구성 목록에서 제거하시겠습니까?')) return;
        try {
            if (window.__TAURI__) {
                await window.__TAURI__.core.invoke('remove_bom_item', {
                    productId: product.product_id,
                    materialId
                });
                await loadBom();
            }
        } catch (e) {
            console.error(e);
            showAlert('오류', '자재 삭제 중 오류가 발생했습니다.');
        }
    };

    if (!isOpen || !product) return null;

    // Filter materials (exclude self and already added)
    const materials = allProducts.filter(p =>
        p.product_id !== product.product_id &&
        (p.item_type === 'material' || p.item_type === 'aux_material' || p.item_type === 'raw_material') &&
        !bomList.some(b => b.material_id === p.product_id)
    );

    return (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={onClose}></div>
            <div className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl relative overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[85vh]">

                {/* Header */}
                <div className="bg-slate-900 px-6 py-4 flex justify-between items-center relative overflow-hidden">
                    <div className="absolute inset-0 opacity-10 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-teal-400 via-slate-900 to-slate-900 pointer-events-none"></div>

                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-teal-400"></span>
                            <span className="text-[10px] font-black text-teal-400 tracking-[0.2em] uppercase">Bill of Materials</span>
                        </div>
                        <h3 className="text-white font-bold text-xl flex items-center gap-2">
                            구성 자재 관리 <span className="text-slate-500 font-light text-base">| {product.product_name}</span>
                        </h3>
                    </div>
                    <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-slate-400 hover:bg-white/20 hover:text-white transition-all">
                        <span className="material-symbols-rounded">close</span>
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-auto p-6 bg-slate-50 space-y-6">

                    {/* Input Area */}
                    <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-teal-50 rounded-full blur-3xl -z-10 translate-x-10 -translate-y-10"></div>

                        <h4 className="text-sm font-black text-slate-800 mb-3 flex items-center gap-1.5">
                            <span className="material-symbols-rounded text-teal-500 text-lg">add_circle</span>
                            자재 추가
                        </h4>

                        <div className="flex gap-3 items-end">
                            <div className="flex-1">
                                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1 ml-1">자재 선택</label>
                                <select
                                    className="w-full h-11 px-3 rounded-xl bg-slate-50 border border-slate-200 text-sm font-bold text-slate-600 focus:outline-none focus:ring-2 focus:ring-teal-500/50"
                                    value={selectedMaterial}
                                    onChange={e => setSelectedMaterial(e.target.value)}
                                >
                                    <option value="">자재를 선택하세요...</option>
                                    {materials.map(m => (
                                        <option key={m.product_id} value={m.product_id}>
                                            {m.product_name} ({m.specification || '-'}) - 재고: {m.stock_quantity || 0}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className="w-32">
                                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1 ml-1">소요 수량</label>
                                <div className="relative">
                                    <input
                                        type="number"
                                        step="0.1"
                                        className="w-full h-11 pl-3 pr-8 rounded-xl bg-slate-50 border border-slate-200 text-sm font-bold text-right text-slate-600 focus:outline-none focus:ring-2 focus:ring-teal-500/50"
                                        value={ratio}
                                        onChange={e => setRatio(e.target.value)}
                                    />
                                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">개</span>
                                </div>
                            </div>
                            <button
                                onClick={handleAdd}
                                className="h-11 px-5 rounded-xl bg-teal-600 text-white font-bold text-sm shadow-lg shadow-teal-200 hover:bg-teal-500 active:scale-95 transition-all flex items-center gap-1 shrink-0"
                            >
                                <span className="material-symbols-rounded text-lg">add</span>
                                추가
                            </button>
                        </div>
                    </div>

                    {/* Checkbox Warning */}
                    <div className="flex items-start gap-3 p-4 bg-orange-50/50 rounded-xl border border-orange-100 text-orange-800 text-xs">
                        <span className="material-symbols-rounded text-orange-500 mt-0.5 shrink-0">info</span>
                        <div>
                            <p className="font-bold">자동 차감 안내</p>
                            <p className="mt-1 opacity-80 leading-relaxed">
                                이 상품({product.product_name})이 판매될 때, 등록된 자재들이 설정된 수량만큼 <span className="underline decoration-orange-400 decoration-2 underline-offset-2">자동으로 재고에서 차감</span>됩니다.
                            </p>
                        </div>
                    </div>

                    {/* BOM List */}
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                        <table className="w-full text-xs text-left">
                            <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 font-bold uppercase">
                                <tr>
                                    <th className="px-4 py-3 w-[60%]">자재명 (규격)</th>
                                    <th className="px-4 py-3 text-right w-[20%]">소요 수량</th>
                                    <th className="px-4 py-3 text-center w-[20%]">관리</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {loading ? (
                                    <tr><td colSpan="3" className="py-10 text-center text-slate-400">Loading...</td></tr>
                                ) : bomList.length === 0 ? (
                                    <tr><td colSpan="3" className="py-10 text-center text-slate-400 flex flex-col items-center gap-2">
                                        <span className="material-symbols-rounded text-4xl text-slate-200">playlist_add</span>
                                        <span>등록된 구성 자재가 없습니다.</span>
                                    </td></tr>
                                ) : (
                                    bomList.map(bom => (
                                        <tr key={bom.material_id} className="hover:bg-slate-50 transition-colors group">
                                            <td className="px-4 py-3">
                                                <div className="font-bold text-slate-700">{bom.product_name}</div>
                                                <div className="text-[10px] text-slate-400">{bom.specification} | 현재고: {bom.stock_quantity}</div>
                                            </td>
                                            <td className="px-4 py-3 text-right font-bold text-slate-600">
                                                {bom.ratio} <span className="text-[10px] font-normal text-slate-400">EA</span>
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <button
                                                    onClick={() => handleDelete(bom.material_id)}
                                                    className="w-8 h-8 rounded-lg bg-slate-100 text-slate-400 hover:bg-red-50 hover:text-red-500 transition-all flex items-center justify-center mx-auto"
                                                    title="목록에서 제거"
                                                >
                                                    <span className="material-symbols-rounded text-base">delete</span>
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>

                </div>

                {/* Footer */}
                <div className="p-4 bg-white border-t border-slate-100 flex justify-end">
                    <button onClick={onClose} className="px-6 py-2.5 rounded-xl bg-slate-100 text-slate-600 font-bold text-sm hover:bg-slate-200 transition-colors">
                        닫기
                    </button>
                </div>
            </div>
        </div>
    );
};

export default BomManagementModal;

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { invoke } from '@tauri-apps/api/core';
import { useModal } from '../../contexts/ModalContext';
import { useAdminGuard } from '../../hooks/useAdminGuard';
import {
    Search,
    Plus,
    Edit2,
    Trash2,
    AlertTriangle,
    Package,
    Layers,
    X,
    CheckCircle2,
    Lock
} from 'lucide-react';
import { formatCurrency } from '../../utils/common';

const SettingsProduct = () => {
    const navigate = useNavigate();
    const { showAlert, showConfirm } = useModal();
    const { isAuthorized, checkAdmin, isVerifying } = useAdminGuard();

    // --- State Management ---
    const [allProducts, setAllProducts] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [tabMode, setTabMode] = useState('product'); // 'product' | 'material'
    const [isLoading, setIsLoading] = useState(false);

    // Modal State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingProduct, setEditingProduct] = useState(null);
    const [formData, setFormData] = useState({
        name: '',
        spec: '',
        price: 0,
        cost: 0,
        safety: 10,
        type: 'product',
        materialId: null,
        materialRatio: 1.0
    });

    // --- Admin Guard Check ---
    const checkRunComp = React.useRef(false);
    useEffect(() => {
        if (checkRunComp.current) return;
        checkRunComp.current = true;

        const init = async () => {
            const ok = await checkAdmin();
            if (!ok) {
                // Return to dashboard or previous page if cancelled or failed
                navigate('/');
            }
        };
        init();
    }, []);

    // --- Data Loading ---
    const loadProducts = useCallback(async () => {
        setIsLoading(true);
        try {
            const list = await invoke('get_product_list');
            setAllProducts(list || []);
        } catch (err) {
            console.error("Failed to load products:", err);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        if (isAuthorized) {
            loadProducts();
        }
    }, [isAuthorized, loadProducts]);

    // --- Handlers ---
    const openModal = (product = null) => {
        if (product) {
            setEditingProduct(product);
            setFormData({
                name: product.product_name,
                spec: product.specification || '',
                price: product.unit_price,
                cost: product.cost_price || 0,
                safety: product.safety_stock || 10,
                type: product.item_type || 'product',
                materialId: product.material_id || null,
                materialRatio: product.material_ratio || 1.0
            });
        } else {
            setEditingProduct(null);
            setFormData({
                name: '',
                spec: '',
                price: 0,
                cost: 0,
                safety: 10,
                type: tabMode,
                materialId: null,
                materialRatio: 1.0
            });
        }
        setIsModalOpen(true);
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setEditingProduct(null);
    };

    const handleSave = async (e) => {
        e.preventDefault();
        if (!formData.name.trim()) {
            showAlert('필수 입력', '상품명을 입력해주세요.');
            return;
        }

        try {
            const payload = {
                productName: formData.name,
                specification: formData.spec || null,
                unitPrice: formData.price,
                safetyStock: formData.safety,
                costPrice: formData.cost,
                materialId: formData.materialId,
                materialRatio: formData.materialRatio,
                itemType: formData.type
            };

            if (editingProduct) {
                await invoke('update_product', {
                    productId: editingProduct.product_id,
                    ...payload,
                    stockQuantity: null // Keep existing stock
                });
            } else {
                await invoke('create_product', {
                    ...payload,
                    stockQuantity: 0
                });
            }

            closeModal();
            loadProducts();
            window.dispatchEvent(new Event('product-data-changed'));
        } catch (err) {
            showAlert('저장 실패', '오류가 발생했습니다: ' + err);
        }
    };

    const handleDelete = async (p) => {
        if (!await showConfirm('삭제 확인', `[${p.product_name}] 항목을 정말 삭제하시겠습니까?`)) return;
        try {
            await invoke('delete_product', { productId: p.product_id });
            loadProducts();
            window.dispatchEvent(new Event('product-data-changed'));
        } catch (err) {
            showAlert('삭제 실패', '오류가 발생했습니다: ' + err);
        }
    };

    // --- Memoized Values ---
    const filteredProducts = useMemo(() => {
        let filtered = allProducts;

        // Tab filter
        if (tabMode === 'material') {
            filtered = filtered.filter(p => p.item_type === 'material');
        } else {
            filtered = filtered.filter(p => !p.item_type || p.item_type === 'product');
        }

        // Search filter
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            filtered = filtered.filter(p => p.product_name.toLowerCase().includes(q));
        }

        return filtered;
    }, [allProducts, tabMode, searchQuery]);

    const materials = useMemo(() => allProducts.filter(p => p.item_type === 'material'), [allProducts]);

    if (!isAuthorized) {
        return (
            <div className="flex h-full items-center justify-center bg-[#f8fafc]">
                <div className="text-center animate-pulse">
                    {isVerifying ? (
                        <div className="w-12 h-12 border-4 border-slate-200 border-t-indigo-500 rounded-full animate-spin mx-auto mb-4" />
                    ) : (
                        <Lock size={48} className="mx-auto text-slate-300 mb-4" />
                    )}
                    <p className="text-slate-400 font-bold">
                        {isVerifying ? '인증 확인 중...' : '인증 대기 중...'}
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-[#f8fafc] overflow-hidden animate-in fade-in duration-700 relative">
            {/* Local Modal Root for scoped modals */}
            <div id="local-modal-root" className="absolute inset-0 z-[9999] pointer-events-none" />

            {/* Header */}
            <div className="px-6 lg:px-8 min-[2000px]:px-12 pt-6 lg:pt-8 min-[2000px]:pt-12 pb-4">
                <div className="flex justify-between items-end">
                    <div>
                        <div className="flex items-center gap-2 mb-0.5">
                            <span className="w-6 h-1 bg-indigo-600 rounded-full"></span>
                            <span className="text-[9px] font-black tracking-[0.2em] text-indigo-600 uppercase">System Settings</span>
                        </div>
                        <h1 className="text-3xl font-black text-slate-600 tracking-tighter" style={{ fontFamily: '"Noto Sans KR", sans-serif' }}>
                            상품/자재 마스터 <span className="text-slate-300 font-light ml-1 text-xl">Product & Material Master</span>
                        </h1>
                    </div>
                </div>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 px-6 lg:px-8 min-[2000px]:px-12 pb-8 overflow-hidden">
                <div className="flex flex-col gap-6 h-full">

                    {/* Toolbar Card */}
                    <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-200 p-6 ring-1 ring-slate-900/5">
                        <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
                            {/* Segmented Control */}
                            <div className="flex p-1 bg-slate-100 rounded-2xl w-full md:w-auto">
                                <button
                                    onClick={() => setTabMode('product')}
                                    className={`flex-1 md:flex-none px-8 py-2.5 rounded-[1.25rem] font-black text-xs transition-all flex items-center justify-center gap-2
                                        ${tabMode === 'product' ? 'bg-white text-indigo-600 shadow-lg shadow-indigo-500/10' : 'text-slate-400 hover:text-slate-600'}
                                    `}
                                >
                                    <Package size={16} /> 완제품 (Product)
                                </button>
                                <button
                                    onClick={() => setTabMode('material')}
                                    className={`flex-1 md:flex-none px-8 py-2.5 rounded-[1.25rem] font-black text-xs transition-all flex items-center justify-center gap-2
                                        ${tabMode === 'material' ? 'bg-white text-orange-600 shadow-lg shadow-orange-500/10' : 'text-slate-400 hover:text-slate-600'}
                                    `}
                                >
                                    <Layers size={16} /> 자재/부원료 (Material)
                                </button>
                            </div>

                            {/* Search & Add */}
                            <div className="flex items-center gap-3 w-full md:w-auto">
                                <div className="relative flex-1 md:w-80 group text-left">
                                    <input
                                        type="text"
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        placeholder="이름으로 검색하세요"
                                        className="w-full h-12 px-6 bg-slate-50 border-none rounded-2xl font-bold text-sm focus:ring-4 focus:ring-indigo-500/10 focus:bg-white transition-all ring-1 ring-inset ring-slate-200 focus:ring-indigo-500/20"
                                    />
                                </div>
                                <button
                                    onClick={() => openModal()}
                                    className={`h-12 px-6 rounded-2xl font-black text-sm flex items-center gap-2 text-white shadow-lg transition-all active:scale-[0.98]
                                        ${tabMode === 'product' ? 'bg-indigo-600 hover:bg-indigo-500 shadow-indigo-200' : 'bg-orange-500 hover:bg-orange-400 shadow-orange-200'}
                                    `}
                                >
                                    <Plus size={20} /> 새 항목 추가
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Table Card */}
                    <div className="flex-1 bg-white rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-200 overflow-hidden ring-1 ring-slate-900/5 flex flex-col">
                        <div className="flex-1 overflow-auto custom-scrollbar">
                            <table className="w-full text-left border-collapse">
                                <thead className="sticky top-0 z-10 bg-slate-50/80 backdrop-blur-md border-b border-slate-100">
                                    <tr>
                                        <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center w-[5%] min-w-[50px]">No.</th>
                                        <th className="px-4 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest w-[8%] min-w-[70px] text-center">유형</th>
                                        <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-left w-[30%] min-w-[200px]">항목명</th>
                                        <th className="px-4 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center w-[12%] min-w-[100px]">규격</th>
                                        <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right w-[15%] min-w-[120px]">판매가격</th>
                                        <th className="px-4 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right w-[10%] min-w-[80px]">안전재고</th>
                                        <th className="px-4 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right w-[10%] min-w-[80px]">현재재고</th>
                                        <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center w-[10%] min-w-[100px]">관리</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {filteredProducts.length === 0 ? (
                                        <tr>
                                            <td colSpan="8" className="py-32 text-center">
                                                <div className="flex flex-col items-center justify-center gap-3">
                                                    <div className="w-16 h-16 bg-slate-50 rounded-3xl flex items-center justify-center text-slate-200">
                                                        <Search size={32} />
                                                    </div>
                                                    <p className="text-slate-400 font-bold tracking-tight">검색 결과가 없습니다</p>
                                                </div>
                                            </td>
                                        </tr>
                                    ) : (
                                        filteredProducts.map((p, idx) => {
                                            const isLow = (p.stock_quantity || 0) <= (p.safety_stock || 10);
                                            return (
                                                <tr key={p.product_id} className="group hover:bg-slate-50/50 transition-all">
                                                    <td className="px-8 py-4 text-center text-xs font-black text-slate-300 group-hover:text-slate-400">{idx + 1}</td>
                                                    <td className="px-6 py-4">
                                                        <span className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border
                                                            ${p.item_type === 'material' ? 'bg-orange-50 text-orange-600 border-orange-100' : 'bg-indigo-50 text-indigo-600 border-indigo-100'}
                                                        `}>
                                                            {p.item_type === 'material' ? '자재' : '상품'}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4 font-black text-sm text-slate-700">{p.product_name}</td>
                                                    <td className="px-6 py-4 text-center text-xs font-bold text-slate-400 bg-slate-50/30">{p.specification || '-'}</td>
                                                    <td className="px-6 py-4 text-right font-black text-sm text-slate-800 tabular-nums">{formatCurrency(p.unit_price)}</td>
                                                    <td className="px-6 py-4 text-right text-xs font-bold text-slate-400">{p.safety_stock || 10}</td>
                                                    <td className="px-6 py-4 text-right">
                                                        <div className="flex items-center justify-end gap-1.5">
                                                            {isLow && <AlertTriangle size={14} className="text-rose-500" />}
                                                            <span className={`font-black text-sm tabular-nums ${isLow ? 'text-rose-600 underline underline-offset-4 decoration-rose-200' : 'text-slate-600'}`}>
                                                                {p.stock_quantity || 0}
                                                            </span>
                                                        </div>
                                                    </td>
                                                    <td className="px-8 py-4">
                                                        <div className="flex items-center justify-center gap-2">
                                                            <button
                                                                onClick={() => openModal(p)}
                                                                className="w-10 h-10 rounded-xl bg-slate-100 text-slate-500 hover:bg-indigo-50 hover:text-indigo-600 transition-all shadow-sm flex items-center justify-center"
                                                            >
                                                                <span className="material-symbols-rounded text-[20px]">edit</span>
                                                            </button>
                                                            <button
                                                                onClick={() => handleDelete(p)}
                                                                className="w-10 h-10 rounded-xl bg-slate-100 text-slate-500 hover:bg-rose-50 hover:text-rose-600 transition-all shadow-sm flex items-center justify-center"
                                                            >
                                                                <span className="material-symbols-rounded text-[20px]">delete</span>
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>

            {/* Modal */}
            {isModalOpen && (
                <div className="absolute inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300" onClick={closeModal}></div>
                    <div className="relative bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 ring-1 ring-slate-900/10">
                        {/* Modal Header */}
                        <div className="px-10 py-8 bg-slate-50/50 border-b border-slate-100 flex items-center justify-between">
                            <div>
                                <div className="flex items-center gap-2 mb-1">
                                    <span className={`w-4 h-1 rounded-full ${formData.type === 'material' ? 'bg-orange-500' : 'bg-indigo-600'}`}></span>
                                    <span className={`text-[10px] font-black uppercase tracking-widest ${formData.type === 'material' ? 'text-orange-500' : 'text-indigo-600'}`}>
                                        {editingProduct ? 'Update Item' : 'Register New'}
                                    </span>
                                </div>
                                <h3 className="text-2xl font-black text-slate-800 tracking-tight">
                                    {editingProduct ? '정보 수정' : `${formData.type === 'material' ? '자재' : '상품'} 등록`}
                                </h3>
                            </div>
                            <button onClick={closeModal} className="w-10 h-10 rounded-2xl bg-white border border-slate-200 text-slate-400 flex items-center justify-center hover:bg-slate-100 hover:text-slate-600 transition-all shadow-sm">
                                <X size={20} />
                            </button>
                        </div>

                        {/* Modal Body */}
                        <form onSubmit={handleSave} className="p-10 space-y-6">
                            <div>
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-2">항목명 (Item Name)</label>
                                <input
                                    type="text"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    placeholder="상품 또는 자재 이름을 입력하세요"
                                    className="w-full h-12 px-5 bg-slate-50 border-none rounded-xl font-bold text-sm focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:bg-white transition-all ring-1 ring-inset ring-slate-200"
                                    required
                                    autoFocus
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-2">규격 (Specification)</label>
                                    <input
                                        type="text"
                                        value={formData.spec}
                                        onChange={(e) => setFormData({ ...formData, spec: e.target.value })}
                                        placeholder="ex) 1kg, 20봉"
                                        className="w-full h-12 px-5 bg-slate-50 border-none rounded-xl font-bold text-sm focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:bg-white transition-all ring-1 ring-inset ring-slate-200"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-2">안전 재고</label>
                                    <input
                                        type="number"
                                        value={formData.safety}
                                        onChange={(e) => setFormData({ ...formData, safety: parseInt(e.target.value) })}
                                        className="w-full h-12 px-5 bg-slate-50 border-none rounded-xl font-bold text-sm focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:bg-white transition-all ring-1 ring-inset ring-slate-200 text-right"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-2">판매 가격</label>
                                    <input
                                        type="number"
                                        value={formData.price}
                                        onChange={(e) => setFormData({ ...formData, price: parseInt(e.target.value) })}
                                        className="w-full h-12 px-5 bg-slate-50 border-none rounded-xl font-bold font-mono text-sm focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:bg-white transition-all ring-1 ring-inset ring-slate-200 text-right"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-2">원가 (Cost Price)</label>
                                    <input
                                        type="number"
                                        value={formData.cost}
                                        onChange={(e) => setFormData({ ...formData, cost: parseInt(e.target.value) })}
                                        className="w-full h-12 px-5 bg-slate-50 border-none rounded-xl font-bold font-mono text-sm focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:bg-white transition-all ring-1 ring-inset ring-slate-200 text-right"
                                    />
                                </div>
                            </div>

                            {formData.type === 'product' && (
                                <div className="p-6 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 ml-2">연계 자재 (Inventory Link)</label>
                                    <div className="grid grid-cols-3 gap-3">
                                        <div className="col-span-2">
                                            <select
                                                value={formData.materialId || ''}
                                                onChange={e => setFormData({ ...formData, materialId: e.target.value ? Number(e.target.value) : null })}
                                                className="w-full h-11 px-4 bg-white border-none rounded-xl font-bold text-xs focus:ring-2 focus:ring-indigo-500 transition-all ring-1 ring-inset ring-slate-200"
                                            >
                                                <option value="">연동 안함</option>
                                                {materials.map(m => <option key={m.product_id} value={m.product_id}>{m.product_name} {m.specification && `(${m.specification})`}</option>)}
                                            </select>
                                        </div>
                                        <div className="relative">
                                            <input
                                                type="number"
                                                step="0.1"
                                                value={formData.materialRatio}
                                                onChange={e => setFormData({ ...formData, materialRatio: parseFloat(e.target.value) })}
                                                placeholder="비율"
                                                className="w-full h-11 px-4 bg-white border-none rounded-xl font-bold text-xs focus:ring-2 focus:ring-indigo-500 transition-all ring-1 ring-inset ring-slate-200 text-right"
                                            />
                                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-slate-300 font-bold">배</span>
                                        </div>
                                    </div>
                                    <p className="text-[10px] font-bold text-slate-400 mt-3 flex items-center gap-1">
                                        <AlertTriangle size={12} className="text-amber-500" />
                                        상품 1개 판매 시 차감될 자재의 배수를 입력하세요
                                    </p>
                                </div>
                            )}

                            {/* Footer Buttons */}
                            <div className="pt-6 flex gap-3 border-t border-slate-100">
                                <div className="flex-1"></div>
                                <button
                                    type="button"
                                    onClick={closeModal}
                                    className="h-12 px-8 bg-slate-100 text-slate-600 rounded-xl font-black text-xs hover:bg-slate-200 transition-all"
                                >
                                    취소
                                </button>
                                <button
                                    type="submit"
                                    className={`h-12 px-10 text-white rounded-xl font-black text-xs shadow-lg transition-all flex items-center gap-2
                                        ${formData.type === 'material' ? 'bg-orange-500 hover:bg-orange-400 shadow-orange-200' : 'bg-indigo-600 hover:bg-indigo-500 shadow-indigo-200'}
                                    `}
                                >
                                    <CheckCircle2 size={16} /> {editingProduct ? '수정 사항 저장' : '등록 완료'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SettingsProduct;

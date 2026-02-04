import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { invoke } from '@tauri-apps/api/core';
import { formatCurrency, formatDateTime } from '../../utils/common';
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
    Lock,
    History,
    TrendingUp,
    ArrowRight
} from 'lucide-react';

const SettingsProduct = () => {
    const navigate = useNavigate();
    const { showAlert, showConfirm } = useModal();
    const { isAuthorized, checkAdmin, isVerifying } = useAdminGuard();

    // --- State Management ---
    const [allProducts, setAllProducts] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [tabMode, setTabMode] = useState('product'); // 'product' | 'material'
    const [showDiscontinued, setShowDiscontinued] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    // Price History State
    const [showHistoryModal, setShowHistoryModal] = useState(false);
    const [priceHistory, setPriceHistory] = useState([]);
    const [historyLoading, setHistoryLoading] = useState(false);

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
        bomList: [], // Array of { materialId, ratio, type: 'raw'|'aux' (ui only), key: rand }
        sync: false
    });

    // --- Recipe Import State ---
    const [isImportOpen, setIsImportOpen] = useState(false);
    const [importSourceId, setImportSourceId] = useState('');
    const [sourceBoms, setSourceBoms] = useState([]);
    const [selectedImports, setSelectedImports] = useState([]); // Array of materialIds to import

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
    const openModal = async (product = null, isClone = false) => {
        setIsLoading(true); // Show loading while fetching BOM
        try {
            let initialBoms = [];
            let initialFormData = {
                name: '',
                spec: '',
                price: 0,
                cost: 0,
                safety: 10,
                type: tabMode,
                bomList: [],
                sync: false
            };

            if (product) {
                if (!isClone) setEditingProduct(product);
                else setEditingProduct(null);

                // Fetch real BOM list from backend
                try {
                    const boms = await invoke('get_product_bom', { productId: product.product_id });
                    if (boms && boms.length > 0) {
                        initialBoms = boms.map(b => ({
                            materialId: b.material_id,
                            ratio: b.ratio,
                            type: b.item_type === 'aux_material' ? 'aux' : 'raw',
                            key: Math.random().toString(36).substr(2, 9)
                        }));
                    } else {
                        // Fallback to legacy fields if BOM is empty
                        if (product.material_id) {
                            initialBoms.push({
                                materialId: product.material_id,
                                ratio: product.material_ratio || 1.0,
                                type: 'raw',
                                key: Math.random().toString(36).substr(2, 9)
                            });
                        }
                        if (product.aux_material_id) {
                            initialBoms.push({
                                materialId: product.aux_material_id,
                                ratio: product.aux_material_ratio || 1.0,
                                type: 'aux',
                                key: Math.random().toString(36).substr(2, 9)
                            });
                        }
                    }
                } catch (e) {
                    console.error("Failed to fetch BOM:", e);
                }

                initialFormData = {
                    name: isClone ? `${product.product_name} (복사)` : product.product_name,
                    spec: product.specification || '',
                    price: product.unit_price,
                    cost: product.cost_price || 0,
                    safety: product.safety_stock || 10,
                    type: product.item_type || 'product',
                    bomList: initialBoms,
                    sync: false
                };
            }

            setFormData(initialFormData);
            setIsModalOpen(true);
        } finally {
            setIsLoading(false);
        }
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setEditingProduct(null);
        setIsImportOpen(false);
        setImportSourceId('');
        setSourceBoms([]);
    };

    const handleAddBom = (type) => {
        setFormData(prev => ({
            ...prev,
            bomList: [...prev.bomList, { materialId: '', ratio: 1.0, type, key: Math.random().toString(36).substr(2, 9) }]
        }));
    };

    const handleRemoveBom = (key) => {
        setFormData(prev => ({
            ...prev,
            bomList: prev.bomList.filter(item => item.key !== key)
        }));
    };

    const handleBomChange = (key, field, value) => {
        setFormData(prev => ({
            ...prev,
            bomList: prev.bomList.map(item => item.key === key ? { ...item, [field]: value } : item)
        }));
    };

    const handleSyncChange = (checked) => {
        setFormData(prev => ({ ...prev, sync: checked }));
    };

    // --- BOM Import Handlers ---
    const handleLoadSourceBom = async (sourceId) => {
        if (!sourceId) return;
        setImportSourceId(sourceId);
        try {
            const boms = await invoke('get_product_bom', { productId: Number(sourceId) });
            setSourceBoms(boms || []);
            // Default all selected
            setSelectedImports(boms.map(b => b.material_id));
        } catch (err) {
            showAlert('조회 실패', '레시피를 가져오지 못했습니다: ' + err);
        }
    };

    const toggleImportSelection = (id) => {
        setSelectedImports(prev =>
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        );
    };

    const confirmImport = () => {
        if (selectedImports.length === 0) {
            setIsImportOpen(false);
            return;
        }

        const itemsToAdd = sourceBoms
            .filter(b => selectedImports.includes(b.material_id))
            .map(b => {
                const material = allProducts.find(p => p.product_id === b.material_id);
                const type = (material?.item_type === 'raw_material' || material?.item_type === 'material' || material?.item_type === 'harvest_item') ? 'raw' : 'aux';
                return {
                    materialId: b.material_id,
                    ratio: b.ratio,
                    type,
                    key: Math.random()
                };
            });

        setFormData(prev => ({
            ...prev,
            bomList: [...prev.bomList, ...itemsToAdd]
        }));

        setIsImportOpen(false);
        setSourceBoms([]);
        setImportSourceId('');
    };

    const handleSave = async (e) => {
        e.preventDefault();
        if (!formData.name.trim()) {
            showAlert('필수 입력', '상품명을 입력해주세요.');
            return;
        }

        setIsLoading(true); // Start loading

        try {
            // For legacy columns, pick the first RAW and first AUX
            const firstRaw = formData.bomList.find(b => b.type === 'raw' && b.materialId);
            const firstAux = formData.bomList.find(b => b.type === 'aux' && b.materialId);

            const payload = {
                productName: formData.name,
                specification: formData.spec || null,
                unitPrice: formData.type === 'product' ? formData.price : 0, // Materials have no selling price
                safetyStock: formData.safety,
                costPrice: formData.cost,
                // Legacy fields for compatibility
                materialId: firstRaw ? Number(firstRaw.materialId) : null,
                materialRatio: firstRaw ? Number(firstRaw.ratio) : 1.0,
                auxMaterialId: firstAux ? Number(firstAux.materialId) : null,
                auxMaterialRatio: firstAux ? Number(firstAux.ratio) : 1.0,
                itemType: formData.type
            };

            let productId;
            if (editingProduct) {
                productId = editingProduct.product_id;
                await invoke('update_product', {
                    productId,
                    ...payload,
                    stockQuantity: null,
                    syncSalesNames: formData.sync || false
                });
            } else {
                productId = await invoke('create_product', {
                    ...payload,
                    stockQuantity: 0
                });
            }

            // Save BOM
            const validBoms = formData.bomList
                .filter(b => b.materialId && Number(b.materialId) > 0)
                .map(b => ({ material_id: Number(b.materialId), ratio: Number(b.ratio) }));

            await invoke('save_product_bom', { productId, bomList: validBoms });

            closeModal();
            loadProducts();
            window.dispatchEvent(new Event('product-data-changed'));
        } catch (err) {
            showAlert('저장 실패', '오류가 발생했습니다: ' + err);
        } finally {
            setIsLoading(false); // End loading
        }
    };

    const handleDelete = async (p) => {
        if (!await showConfirm('삭제 확인', `[${p.product_name}] 항목을 정말 삭제하시겠습니까?`)) return;
        try {
            await invoke('delete_product', { productId: p.product_id });
            loadProducts();
            window.dispatchEvent(new Event('product-data-changed'));
        } catch (err) {
            if (err.toString().includes('HAS_HISTORY')) {
                const confirmed = await showConfirm(
                    '삭제 불가',
                    `[${p.product_name}] 항목은 거래 이력이 있어 삭제할 수 없습니다.\n대신 '단종(숨김)' 처리하시겠습니까?`
                );

                if (confirmed) {
                    try {
                        await invoke('discontinue_product', { productId: p.product_id });
                        showAlert('처리 완료', '해당 상품이 단종 처리되었습니다.');
                        loadProducts();
                        window.dispatchEvent(new Event('product-data-changed'));
                    } catch (dErr) {
                        showAlert('단종 처리 실패', '오류가 발생했습니다: ' + dErr);
                    }
                }
            } else if (err.toString().includes('USED_AS_BOM')) {
                showAlert('삭제 불가', `[${p.product_name}] 항목은 다른 완제품의 레시피(재료)로 사용 중입니다.\n먼저 해당 완제품의 레시피에서 이 재료를 제거해야 합니다.`);
            } else {
                showAlert('삭제 실패', '오류가 발생했습니다: ' + err);
            }
        }
    };

    const loadPriceHistory = async (productId) => {
        setHistoryLoading(true);
        try {
            const data = await invoke('get_product_history', { productId });
            setPriceHistory(data || []);
            setShowHistoryModal(true);
        } catch (err) {
            showAlert('이력 조회 실패', '오류가 발생했습니다: ' + err);
        } finally {
            setHistoryLoading(false);
        }
    };

    // --- Memoized Values ---
    const filteredProducts = useMemo(() => {
        let filtered = allProducts;

        // Tab filter
        if (tabMode === 'harvest_item') {
            filtered = filtered.filter(p => p.item_type === 'harvest_item');
        } else if (tabMode === 'aux_material') {
            // 부자재 탭에는 원자재와 부자재 모두 포함
            filtered = filtered.filter(p => p.item_type === 'aux_material' || p.item_type === 'raw_material' || p.item_type === 'material');
        } else {
            // product
            filtered = filtered.filter(p => !p.item_type || p.item_type === 'product');
        }

        // Status filter (Discontinued)
        if (!showDiscontinued) {
            filtered = filtered.filter(p => p.status !== '단종상품');
        }

        // Search filter
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            filtered = filtered.filter(p => p.product_name.toLowerCase().includes(q));
        }

        return filtered;
    }, [allProducts, tabMode, searchQuery, showDiscontinued]);

    const rawMaterials = useMemo(() => allProducts.filter(p => p.item_type === 'material' || p.item_type === 'raw_material' || p.item_type === 'harvest_item'), [allProducts]);
    const auxMaterials = useMemo(() => allProducts.filter(p => p.item_type === 'aux_material'), [allProducts]);

    const suggestedRecipeSource = useMemo(() => {
        if (editingProduct || !formData.name || formData.name.length < 2 || formData.bomList.length > 0) return null;
        // Find products with similar names that have BOMs
        const match = allProducts.find(p =>
            p.product_id !== editingProduct?.product_id &&
            (p.item_type === 'product' || !p.item_type) &&
            formData.name.split(' ').some(word => word.length > 1 && p.product_name.includes(word))
        );
        return match;
    }, [formData.name, formData.bomList.length, allProducts, editingProduct]);

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

                {/* Definition Guide Section */}
                <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-indigo-50/50 border border-indigo-100 p-4 rounded-2xl flex items-start gap-3">
                        <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-lg shadow-indigo-100">
                            <Package size={16} />
                        </div>
                        <div>
                            <h4 className="text-xs font-black text-indigo-900 mb-0.5">완제품</h4>
                            <p className="text-[10px] text-indigo-600 font-bold leading-relaxed">판매 주력 결과물입니다.<br />(선물세트, 1kg 박스 등)</p>
                        </div>
                    </div>
                    <div className="bg-emerald-50/50 border border-emerald-100 p-4 rounded-2xl flex items-start gap-3">
                        <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-lg shadow-emerald-100">
                            <TrendingUp size={16} />
                        </div>
                        <div>
                            <h4 className="text-xs font-black text-emerald-900 mb-0.5">농산물 (수확물)</h4>
                            <p className="text-[10px] text-emerald-600 font-bold leading-relaxed">수확하는 버섯 그 자체입니다.<br />(수확 입고의 대상입니다)</p>
                        </div>
                    </div>
                    <div className="bg-orange-50/50 border border-orange-100 p-4 rounded-2xl flex items-start gap-3">
                        <div className="w-8 h-8 rounded-xl bg-orange-600 text-white flex items-center justify-center shrink-0 shadow-lg shadow-orange-100">
                            <Layers size={16} />
                        </div>
                        <div>
                            <h4 className="text-xs font-black text-orange-900 mb-0.5">부자재 (포장재)</h4>
                            <p className="text-[10px] text-orange-600 font-bold leading-relaxed">종균/배지부터 박스/라벨까지<br />모든 자재를 통합 관리합니다</p>
                        </div>
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
                                    className={`flex-1 md:flex-none px-4 py-2.5 rounded-[1.25rem] font-black text-xs transition-all flex items-center justify-center gap-2
                                        ${tabMode === 'product' ? 'bg-white text-indigo-600 shadow-lg shadow-indigo-500/10' : 'text-slate-400 hover:text-slate-600'}
                                    `}
                                >
                                    <Package size={14} /> 완제품
                                </button>
                                <button
                                    onClick={() => setTabMode('harvest_item')}
                                    className={`flex-1 md:flex-none px-4 py-2.5 rounded-[1.25rem] font-black text-xs transition-all flex items-center justify-center gap-2
                                        ${tabMode === 'harvest_item' ? 'bg-white text-emerald-600 shadow-lg shadow-emerald-500/10' : 'text-slate-400 hover:text-slate-600'}
                                    `}
                                >
                                    <TrendingUp size={14} /> 농산물 (수확물)
                                </button>
                                <button
                                    onClick={() => setTabMode('aux_material')}
                                    className={`flex-1 md:flex-none px-4 py-2.5 rounded-[1.25rem] font-black text-xs transition-all flex items-center justify-center gap-2
                                        ${tabMode === 'aux_material' ? 'bg-white text-orange-600 shadow-lg shadow-orange-500/10' : 'text-slate-400 hover:text-slate-600'}
                                    `}
                                >
                                    <Layers size={14} /> 부자재 (포장재)
                                </button>
                            </div>

                            {/* Search & Add */}
                            <div className="flex items-center gap-3 w-full md:w-auto">
                                <label className="flex items-center gap-2 cursor-pointer px-3 py-2 rounded-xl hover:bg-slate-100 transition-colors">
                                    <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${showDiscontinued ? 'bg-slate-600 border-slate-600' : 'bg-white border-slate-300'}`}>
                                        {showDiscontinued && <CheckCircle2 size={12} className="text-white" />}
                                    </div>
                                    <input
                                        type="checkbox"
                                        checked={showDiscontinued}
                                        onChange={e => setShowDiscontinued(e.target.checked)}
                                        className="hidden"
                                    />
                                    <span className="text-xs font-bold text-slate-500">단종포함</span>
                                </label>
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
                                        ${tabMode === 'product' ? 'bg-indigo-600 hover:bg-indigo-500 shadow-indigo-200' :
                                            tabMode === 'raw_material' ? 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-200' :
                                                'bg-orange-500 hover:bg-orange-400 shadow-orange-200'}
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
                                        {tabMode === 'product' && (
                                            <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right w-[15%] min-w-[120px]">판매가격</th>
                                        )}
                                        <th className="px-4 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right w-[10%] min-w-[80px]">안전재고</th>
                                        <th className="px-4 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right w-[10%] min-w-[80px]">현재재고</th>
                                        <th className="px-4 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center w-[8%] min-w-[70px]">상태</th>
                                        <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center w-[10%] min-w-[160px]">관리</th>
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
                                                    <td className="px-6 py-4 text-center">
                                                        <span className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border
                                                            ${p.item_type === 'raw_material' || p.item_type === 'material' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                                                                p.item_type === 'aux_material' ? 'bg-orange-50 text-orange-600 border-orange-100' :
                                                                    'bg-indigo-50 text-indigo-600 border-indigo-100'}
                                                        `}>
                                                            {p.item_type === 'raw_material' || p.item_type === 'material' ? '원물' :
                                                                p.item_type === 'aux_material' ? '부자재' : '완제품'}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4 font-black text-sm text-slate-700">{p.product_name}</td>
                                                    <td className="px-6 py-4 text-center text-xs font-bold text-slate-400 bg-slate-50/30">{p.specification || '-'}</td>
                                                    {tabMode === 'product' && (
                                                        <td className="px-6 py-4 text-right font-black text-sm text-slate-800 tabular-nums">{formatCurrency(p.unit_price)}</td>
                                                    )}
                                                    <td className="px-6 py-4 text-right text-xs font-bold text-slate-400">{p.safety_stock ? p.safety_stock.toLocaleString() : 10}</td>
                                                    <td className="px-6 py-4 text-right">
                                                        <div className="flex items-center justify-end gap-1.5">
                                                            {isLow && <AlertTriangle size={14} className="text-rose-500" />}
                                                            <span className={`font-black text-sm tabular-nums ${isLow ? 'text-rose-600 underline underline-offset-4 decoration-rose-200' : 'text-slate-600'}`}>
                                                                {(p.stock_quantity || 0).toLocaleString()}
                                                            </span>
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-4 text-center">
                                                        <span className={`px-2 py-1 rounded text-[10px] font-black ${p.status === '단종상품' ? 'bg-slate-100 text-slate-400' : 'bg-green-50 text-green-600'}`}>
                                                            {p.status || '판매중'}
                                                        </span>
                                                    </td>
                                                    <td className="px-8 py-4">
                                                        <div className="flex items-center justify-center gap-2">
                                                            <button
                                                                onClick={() => openModal(p)}
                                                                className="w-9 h-9 rounded-xl bg-slate-100 text-slate-500 hover:bg-indigo-50 hover:text-indigo-600 transition-all shadow-sm flex items-center justify-center"
                                                                title="수정"
                                                            >
                                                                <span className="material-symbols-rounded text-[18px]">edit</span>
                                                            </button>
                                                            <button
                                                                onClick={() => openModal(p, true)}
                                                                className="w-9 h-9 rounded-xl bg-slate-100 text-slate-500 hover:bg-emerald-50 hover:text-emerald-600 transition-all shadow-sm flex items-center justify-center border border-transparent hover:border-emerald-100"
                                                                title="레시피 복제 (Clone)"
                                                            >
                                                                <span className="material-symbols-rounded text-[18px]">content_copy</span>
                                                            </button>
                                                            <button
                                                                onClick={() => loadPriceHistory(p.product_id)}
                                                                className="w-9 h-9 rounded-xl bg-slate-100 text-slate-400 hover:bg-slate-200 hover:text-indigo-600 transition-all shadow-sm flex items-center justify-center"
                                                                title="관리 이력"
                                                            >
                                                                <span className="material-symbols-rounded text-[18px]">history</span>
                                                            </button>
                                                            <button
                                                                onClick={() => handleDelete(p)}
                                                                className="w-9 h-9 rounded-xl bg-slate-100 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition-all shadow-sm flex items-center justify-center"
                                                                title="삭제"
                                                            >
                                                                <span className="material-symbols-rounded text-[18px]">delete</span>
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
                    <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300" onClick={!isLoading ? closeModal : undefined}></div>
                    <div className="relative bg-white w-[560px] rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 ring-1 ring-slate-900/10">
                        {/* Loading Overlay */}
                        {isLoading && (
                            <div className="absolute inset-0 z-50 bg-white/80 backdrop-blur-[2px] flex flex-col items-center justify-center animate-in fade-in duration-200">
                                <div className="w-12 h-12 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin mb-4 shadow-lg shadow-indigo-200"></div>
                                <p className="text-sm font-black text-slate-700 animate-pulse">
                                    {editingProduct && formData.sync ? '과거 데이터 동기화 중...' : '저장 중입니다...'}
                                </p>
                                {editingProduct && formData.sync && (
                                    <p className="text-[10px] font-bold text-slate-400 mt-1">
                                        데이터 양에 따라 시간이 소요될 수 있습니다
                                    </p>
                                )}
                            </div>
                        )}

                        {/* Modal Header */}
                        <div className="px-8 py-6 bg-slate-50/50 border-b border-slate-100 flex items-center justify-between">
                            <div>
                                <div className="flex items-center gap-2 mb-1">
                                    <span className={`w-4 h-1 rounded-full ${formData.type === 'product' ? 'bg-indigo-600' : formData.type === 'aux_material' ? 'bg-orange-500' : 'bg-emerald-500'}`}></span>
                                    <span className={`text-[10px] font-black uppercase tracking-widest ${formData.type === 'product' ? 'text-indigo-600' : formData.type === 'aux_material' ? 'text-orange-500' : 'text-emerald-600'}`}>
                                        {editingProduct ? 'Update Item' : 'Register New'}
                                    </span>
                                </div>
                                <h3 className="text-2xl font-black text-slate-800 tracking-tight">
                                    {editingProduct ? '정보 수정' : `${formData.type === 'raw_material' ? '원자재(구매)' : formData.type === 'aux_material' ? '부자재(포장재)' : formData.type === 'harvest_item' ? '농산물(수확)' : '완제품'} 등록`}
                                </h3>
                            </div>
                            <button onClick={closeModal} disabled={isLoading} className="w-10 h-10 rounded-2xl bg-white border border-slate-200 text-slate-400 flex items-center justify-center hover:bg-slate-100 hover:text-slate-600 transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed">
                                <X size={20} />
                            </button>
                        </div>

                        {/* Modal Body */}
                        <form onSubmit={handleSave} className="flex flex-col max-h-[75vh]">
                            <div className="p-8 space-y-4 overflow-y-auto custom-scrollbar flex-1 min-h-0">
                                <div>
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-2">항목명 (Item Name)</label>
                                    <input
                                        type="text"
                                        value={formData.name}
                                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                        placeholder="상품 또는 자재 이름을 입력하세요"
                                        className="w-full h-12 px-5 bg-slate-50 border-none rounded-xl font-bold text-sm focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:bg-white transition-all ring-1 ring-inset ring-slate-200 disabled:opacity-70"
                                        required
                                        autoFocus
                                        disabled={isLoading}
                                    />
                                    {editingProduct && (
                                        <div className="mt-2 ml-1">
                                            <label className={`flex items-start gap-2 cursor-pointer group ${isLoading ? 'pointer-events-none opacity-50' : ''}`}>
                                                <div className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center transition-colors ${formData.sync ? 'bg-indigo-600 border-indigo-600' : 'bg-white border-slate-300 group-hover:border-indigo-400'}`}>
                                                    {formData.sync && <CheckCircle2 size={12} className="text-white" />}
                                                </div>
                                                <input
                                                    type="checkbox"
                                                    checked={formData.sync || false}
                                                    onChange={e => handleSyncChange(e.target.checked)}
                                                    className="hidden"
                                                    disabled={isLoading}
                                                />
                                                <div className="flex-1">
                                                    <span className="text-xs font-bold text-slate-700 block group-hover:text-indigo-600 transition-colors">과거 기록도 함께 수정 (동기화)</span>
                                                    <p className="text-[10px] text-slate-400 mt-0.5 leading-tight">
                                                        체크 시, 기존에 판매된 내역과 재고 로그의 상품명/규격도 현재 입력한 값으로 일괄 변경됩니다. (단순 오타 수정 시 권장)
                                                    </p>
                                                </div>
                                            </label>
                                        </div>
                                    )}
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-2">규격 (Specification)</label>
                                        <input
                                            type="text"
                                            value={formData.spec}
                                            onChange={(e) => setFormData({ ...formData, spec: e.target.value })}
                                            placeholder="ex) 1kg, 20봉"
                                            className="w-full h-12 px-5 bg-slate-50 border-none rounded-xl font-bold text-sm focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:bg-white transition-all ring-1 ring-inset ring-slate-200 disabled:opacity-70"
                                            disabled={isLoading}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-2">안전 재고</label>
                                        <input
                                            type="number"
                                            value={formData.safety}
                                            onChange={(e) => setFormData({ ...formData, safety: parseInt(e.target.value) })}
                                            className="w-full h-12 px-5 bg-slate-50 border-none rounded-xl font-bold text-sm focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:bg-white transition-all ring-1 ring-inset ring-slate-200 text-right disabled:opacity-70"
                                            disabled={isLoading}
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    {formData.type === 'product' ? (
                                        <>
                                            <div>
                                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-2">원가 (Cost Price)</label>
                                                <input
                                                    type="text"
                                                    value={formData.cost.toLocaleString()}
                                                    onChange={(e) => {
                                                        const val = parseInt(e.target.value.replace(/,/g, '')) || 0;
                                                        setFormData({ ...formData, cost: val });
                                                    }}
                                                    className="w-full h-12 px-5 bg-slate-50 border-none rounded-xl font-bold font-mono text-sm focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:bg-white transition-all ring-1 ring-inset ring-slate-200 text-right disabled:opacity-70"
                                                    disabled={isLoading}
                                                />
                                            </div>
                                            <div>
                                                <div className="flex justify-between items-center mb-1.5 ml-2">
                                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">판매 가격</label>
                                                </div>
                                                <input
                                                    type="text"
                                                    value={formData.price.toLocaleString()}
                                                    onChange={(e) => {
                                                        const val = parseInt(e.target.value.replace(/,/g, '')) || 0;
                                                        setFormData({ ...formData, price: val });
                                                    }}
                                                    className="w-full h-12 px-5 bg-slate-50 border-none rounded-xl font-bold font-mono text-sm focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:bg-white transition-all ring-1 ring-inset ring-slate-200 text-right disabled:opacity-70"
                                                    disabled={isLoading}
                                                />
                                            </div>
                                        </>
                                    ) : (
                                        <div className="col-span-2">
                                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-2">
                                                {(formData.type === 'raw_material' || formData.type === 'material') ? '생산 원가 (Production Cost)' : '구입 단가 (Purchase Price)'}
                                            </label>
                                            <input
                                                type="text"
                                                value={formData.cost.toLocaleString()}
                                                onChange={(e) => {
                                                    const val = parseInt(e.target.value.replace(/,/g, '')) || 0;
                                                    setFormData({ ...formData, cost: val });
                                                }}
                                                placeholder={(formData.type === 'raw_material' || formData.type === 'material') ? "단위 생산 원가를 입력하세요" : "매입 단가를 입력하세요"}
                                                className="w-full h-12 px-5 bg-slate-50 border-none rounded-xl font-bold font-mono text-sm focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:bg-white transition-all ring-1 ring-inset ring-slate-200 text-right disabled:opacity-70"
                                                disabled={isLoading}
                                            />
                                        </div>
                                    )}
                                </div>

                                {formData.type === 'product' && (
                                    <div className="space-y-3">
                                        <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                                레시피 구성 (Bill of Materials)
                                            </label>
                                            <div className="flex items-center gap-2">
                                                {suggestedRecipeSource && (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleLoadSourceBom(suggestedRecipeSource.product_id).then(() => confirmImport())}
                                                        className="text-[10px] font-black flex items-center gap-1.5 text-emerald-600 hover:text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-lg transition-all border border-emerald-100 shadow-sm animate-bounce-short"
                                                    >
                                                        <CheckCircle2 size={14} /> 유사 상품 [{suggestedRecipeSource.product_name}] 레시피 자동 적용
                                                    </button>
                                                )}
                                                <button
                                                    type="button"
                                                    onClick={() => setIsImportOpen(!isImportOpen)}
                                                    disabled={isLoading}
                                                    className="text-[10px] font-black flex items-center gap-1.5 text-indigo-600 hover:text-indigo-700 bg-indigo-50 px-3 py-1.5 rounded-lg transition-colors border border-indigo-100 shadow-sm"
                                                >
                                                    <TrendingUp size={14} /> 다른 상품 레시피 불러오기
                                                </button>
                                            </div>
                                        </div>

                                        {/* Recipe Import UI */}
                                        {isImportOpen && (
                                            <div className="p-5 bg-indigo-50/50 rounded-2xl border border-indigo-100 animate-in slide-in-from-top-4 duration-300">
                                                <div className="flex justify-between items-center mb-4">
                                                    <h4 className="text-xs font-black text-indigo-800">기존 상품 레시피 가져오기</h4>
                                                    <button type="button" onClick={() => setIsImportOpen(false)} className="text-indigo-400 hover:text-indigo-600">
                                                        <X size={16} />
                                                    </button>
                                                </div>
                                                <div className="space-y-4">
                                                    <select
                                                        value={importSourceId}
                                                        onChange={e => handleLoadSourceBom(e.target.value)}
                                                        className="w-full h-10 px-3 bg-white border-none rounded-xl font-bold text-xs focus:ring-2 focus:ring-indigo-500 transition-all ring-1 ring-inset ring-indigo-200"
                                                    >
                                                        <option value="">복사할 원본 상품 선택...</option>
                                                        {allProducts
                                                            .filter(p => p.product_id !== editingProduct?.product_id && (p.item_type === 'product' || !p.item_type))
                                                            .map(p => <option key={p.product_id} value={p.product_id}>{p.product_name} {p.specification && `(${p.specification})`}</option>)
                                                        }
                                                    </select>

                                                    {sourceBoms.length > 0 && (
                                                        <div className="bg-white rounded-xl border border-indigo-100 overflow-hidden">
                                                            <div className="px-4 py-2 bg-indigo-50/30 border-b border-indigo-100 text-[9px] font-black text-indigo-400 uppercase tracking-widest">
                                                                체크하여 선택 (Check to Import)
                                                            </div>
                                                            <div className="max-h-40 overflow-y-auto divide-y divide-slate-50">
                                                                {sourceBoms.map(b => {
                                                                    const mat = allProducts.find(p => p.product_id === b.material_id);
                                                                    return (
                                                                        <label key={b.material_id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 cursor-pointer transition-colors">
                                                                            <div className={`w-4 h-4 rounded-md border flex items-center justify-center transition-colors ${selectedImports.includes(b.material_id) ? 'bg-indigo-600 border-indigo-600' : 'bg-white border-slate-300'}`}>
                                                                                {selectedImports.includes(b.material_id) && <CheckCircle2 size={10} className="text-white" />}
                                                                            </div>
                                                                            <input
                                                                                type="checkbox"
                                                                                className="hidden"
                                                                                checked={selectedImports.includes(b.material_id)}
                                                                                onChange={() => toggleImportSelection(b.material_id)}
                                                                            />
                                                                            <div className="flex-1">
                                                                                <span className="text-xs font-bold text-slate-700">{mat?.product_name || '알 수 없는 품목'}</span>
                                                                                <span className="text-[10px] text-slate-400 ml-2 font-mono">x {b.ratio}</span>
                                                                            </div>
                                                                            <span className={`text-[8px] font-black px-1.5 py-0.5 rounded border ${mat?.item_type === 'raw_material' || mat?.item_type === 'material' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-orange-50 text-orange-600 border-orange-100'}`}>
                                                                                {mat?.item_type === 'harvest_item' ? '농산물' : (mat?.item_type === 'raw_material' || mat?.item_type === 'material' ? '원자재' : '부자재')}
                                                                            </span>
                                                                        </label>
                                                                    );
                                                                })}
                                                            </div>
                                                            <div className="p-3 bg-slate-50 border-t border-indigo-100">
                                                                <button
                                                                    type="button"
                                                                    onClick={confirmImport}
                                                                    className="w-full py-2 bg-indigo-600 text-white rounded-lg font-black text-[11px] shadow-sm hover:bg-indigo-700 transition-all flex items-center justify-center gap-2"
                                                                >
                                                                    <Plus size={14} /> 선택한 {selectedImports.length}개 항목 추가하기
                                                                </button>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        )}

                                        {/* Raw Materials Section */}
                                        <div className="bg-emerald-50/50 rounded-2xl border border-emerald-100/50 p-4">
                                            <div className="flex justify-between items-center mb-2">
                                                <span className="text-xs font-bold text-emerald-800 flex items-center gap-1.5">
                                                    <Layers size={14} /> 필요 원재료 (농산물/자재)
                                                </span>
                                                <button type="button" onClick={() => handleAddBom('raw')} disabled={isLoading} className="text-[10px] font-black bg-white border border-emerald-200 text-emerald-600 px-3 py-1.5 rounded-lg hover:bg-emerald-50 transition-colors shadow-sm disabled:opacity-50">
                                                    + 원물 추가
                                                </button>
                                            </div>
                                            <div className="space-y-2">
                                                {formData.bomList.filter(b => b.type === 'raw').length === 0 && (
                                                    <div className="text-center py-4 bg-white/50 rounded-xl border border-dashed border-emerald-200/50 text-xs text-emerald-400">
                                                        연결된 원물이 없습니다.
                                                    </div>
                                                )}
                                                {formData.bomList.filter(b => b.type === 'raw').map(bom => (
                                                    <div key={bom.key} className="flex gap-2 items-center animate-in slide-in-from-left-2 duration-200">
                                                        <div className="flex-1">
                                                            <select
                                                                value={bom.materialId}
                                                                onChange={e => handleBomChange(bom.key, 'materialId', e.target.value)}
                                                                className="w-full h-10 px-3 bg-white border-none rounded-xl font-bold text-xs focus:ring-2 focus:ring-emerald-500 transition-all ring-1 ring-inset ring-emerald-200 disabled:opacity-70"
                                                                disabled={isLoading}
                                                            >
                                                                <option value="">원재료 선택...</option>
                                                                {rawMaterials.map(m => <option key={m.product_id} value={m.product_id}>{m.product_name} {m.specification && `(${m.specification})`}</option>)}
                                                            </select>
                                                        </div>
                                                        <div className="w-24 relative">
                                                            <input
                                                                type="number"
                                                                step="0.1"
                                                                value={bom.ratio}
                                                                onChange={e => handleBomChange(bom.key, 'ratio', e.target.value)}
                                                                className="w-full h-10 px-3 bg-white border-none rounded-xl font-bold text-xs focus:ring-2 focus:ring-emerald-500 transition-all ring-1 ring-inset ring-emerald-200 text-right pr-8 disabled:opacity-70"
                                                                disabled={isLoading}
                                                            />
                                                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-emerald-300 font-bold">배</span>
                                                        </div>
                                                        <button type="button" onClick={() => handleRemoveBom(bom.key)} disabled={isLoading} className="w-10 h-10 flex items-center justify-center text-emerald-300 hover:text-rose-500 transition-colors disabled:opacity-50">
                                                            <Trash2 size={16} />
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Aux Materials Section */}
                                        <div className="bg-orange-50/50 rounded-2xl border border-orange-100/50 p-4">
                                            <div className="flex justify-between items-center mb-2">
                                                <span className="text-xs font-bold text-orange-800 flex items-center gap-1.5">
                                                    <Package size={14} /> 필요 부자재 (포장재)
                                                </span>
                                                <button type="button" onClick={() => handleAddBom('aux')} disabled={isLoading} className="text-[10px] font-black bg-white border border-orange-200 text-orange-600 px-3 py-1.5 rounded-lg hover:bg-orange-50 transition-colors shadow-sm disabled:opacity-50">
                                                    + 부자재 추가
                                                </button>
                                            </div>
                                            <div className="space-y-2">
                                                {formData.bomList.filter(b => b.type === 'aux').length === 0 && (
                                                    <div className="text-center py-4 bg-white/50 rounded-xl border border-dashed border-orange-200/50 text-xs text-orange-400">
                                                        연결된 부자재가 없습니다.
                                                    </div>
                                                )}
                                                {formData.bomList.filter(b => b.type === 'aux').map(bom => (
                                                    <div key={bom.key} className="flex gap-2 items-center animate-in slide-in-from-left-2 duration-200">
                                                        <div className="flex-1">
                                                            <select
                                                                value={bom.materialId}
                                                                onChange={e => handleBomChange(bom.key, 'materialId', e.target.value)}
                                                                className="w-full h-10 px-3 bg-white border-none rounded-xl font-bold text-xs focus:ring-2 focus:ring-orange-500 transition-all ring-1 ring-inset ring-orange-200 disabled:opacity-70"
                                                                disabled={isLoading}
                                                            >
                                                                <option value="">부자재 선택...</option>
                                                                {auxMaterials.map(m => <option key={m.product_id} value={m.product_id}>{m.product_name} {m.specification && `(${m.specification})`}</option>)}
                                                            </select>
                                                        </div>
                                                        <div className="w-24 relative">
                                                            <input
                                                                type="number"
                                                                step="0.1"
                                                                value={bom.ratio}
                                                                onChange={e => handleBomChange(bom.key, 'ratio', e.target.value)}
                                                                className="w-full h-10 px-3 bg-white border-none rounded-xl font-bold text-xs focus:ring-2 focus:ring-orange-500 transition-all ring-1 ring-inset ring-orange-200 text-right pr-8 disabled:opacity-70"
                                                                disabled={isLoading}
                                                            />
                                                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-orange-300 font-bold">배</span>
                                                        </div>
                                                        <button type="button" onClick={() => handleRemoveBom(bom.key)} disabled={isLoading} className="w-10 h-10 flex items-center justify-center text-orange-300 hover:text-rose-500 transition-colors disabled:opacity-50">
                                                            <Trash2 size={16} />
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Footer Buttons */}
                            <div className="px-8 py-5 flex gap-3 border-t border-slate-100 bg-slate-50/30">
                                <div className="flex-1"></div>
                                <button
                                    type="button"
                                    onClick={closeModal}
                                    disabled={isLoading}
                                    className="h-12 px-8 bg-slate-100 text-slate-600 rounded-xl font-black text-xs hover:bg-slate-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    취소
                                </button>
                                <button
                                    type="submit"
                                    disabled={isLoading}
                                    className={`h-12 px-10 text-white rounded-xl font-black text-xs shadow-lg transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed
                                        ${formData.type === 'product' ? 'bg-indigo-600 hover:bg-indigo-500 shadow-indigo-200' :
                                            formData.type === 'raw_material' ? 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-200' :
                                                'bg-orange-500 hover:bg-orange-400 shadow-orange-200'}
                                    `}
                                >
                                    <CheckCircle2 size={16} /> {editingProduct ? '수정 사항 저장' : '등록 완료'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )
            }

            {/* Product History Modal (Unified) */}
            {
                showHistoryModal && (
                    <div className="absolute inset-0 z-[110] flex items-center justify-center p-4">
                        <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300" onClick={() => setShowHistoryModal(false)}></div>
                        <div className="relative bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 ring-1 ring-slate-900/10">
                            <div className="px-8 py-6 bg-slate-50/50 border-b border-slate-100 flex items-center justify-between">
                                <h3 className="text-xl font-black text-slate-800 tracking-tight flex items-center gap-2">
                                    <History size={20} className="text-indigo-600" /> 상품 관리 이력
                                </h3>
                                <button onClick={() => setShowHistoryModal(false)} className="w-8 h-8 rounded-xl bg-white border border-slate-200 text-slate-400 flex items-center justify-center hover:bg-slate-100 hover:text-slate-600 transition-all shadow-sm">
                                    <X size={16} />
                                </button>
                            </div>
                            <div className="p-0 max-h-[60vh] overflow-y-auto custom-scrollbar">
                                {priceHistory.length === 0 ? (
                                    <div className="p-10 text-center">
                                        <p className="text-slate-400 font-bold text-sm">기록된 관리 이력이 없습니다.</p>
                                    </div>
                                ) : (
                                    <div className="divide-y divide-slate-100">
                                        {priceHistory.map((h, idx) => {
                                            // h: { history_type, date, title, description, old_value, new_value, change_amount }
                                            const isPrice = h.history_type === '가격변경';

                                            return (
                                                <div key={idx} className="p-6 hover:bg-slate-50 transition-colors">
                                                    <div className="flex justify-between items-start mb-2">
                                                        <span className="text-[10px] font-black text-slate-400 tracking-wider uppercase">{formatDateTime(h.date)}</span>
                                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${isPrice ? 'bg-indigo-50 text-indigo-600 border-indigo-100' :
                                                            h.history_type === '상품등록' ? 'bg-green-50 text-green-600 border-green-100' :
                                                                'bg-slate-100 text-slate-500 border-slate-200'
                                                            }`}>
                                                            {h.title}
                                                        </span>
                                                    </div>

                                                    {/* Content based on type */}
                                                    {isPrice ? (
                                                        <div className="flex items-center gap-3">
                                                            <span className="text-sm font-bold text-slate-400 decoration-slate-300 line-through tabular-nums decoration-2">
                                                                {parseInt(h.old_value || '0').toLocaleString()}
                                                            </span>
                                                            <ArrowRight size={14} className="text-slate-300" />
                                                            <span className="text-lg font-black text-slate-700 tabular-nums">
                                                                {parseInt(h.new_value || '0').toLocaleString()}
                                                            </span>
                                                        </div>
                                                    ) : (
                                                        <div className="text-sm font-bold text-slate-700">
                                                            {h.description}
                                                        </div>
                                                    )}

                                                    {/* Extra context for non-price items if needed */}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                            <div className="p-4 bg-slate-50/50 border-t border-slate-100 flex justify-center">
                                <button
                                    onClick={() => setShowHistoryModal(false)}
                                    className="w-full py-3 bg-white border border-slate-200 rounded-xl text-slate-600 font-bold text-sm hover:bg-slate-50 transition-colors shadow-sm"
                                >
                                    확인 (닫기)
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }
        </div >
    );
};

export default SettingsProduct;

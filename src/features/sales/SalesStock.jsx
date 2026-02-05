import React, { useState, useEffect, useMemo } from 'react';
import { formatCurrency, formatDateTime } from '../../utils/common';
import { useModal } from '../../contexts/ModalContext';

const SalesStock = () => {
    const { showAlert, showConfirm } = useModal();
    // --- State ---
    const [tab, setTab] = useState('product'); // 'product' | 'harvest_item' | 'aux_material'
    const [products, setProducts] = useState([]);
    const [logs, setLogs] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [logSearchQuery, setLogSearchQuery] = useState('');
    const [hideAutoLogs, setHideAutoLogs] = useState(true);
    const [auxSubTab, setAuxSubTab] = useState('ALL'); // 'ALL' | '박스/포장' | '라벨/스티커' | '생산재' | '기타 소모품'

    // Stock Conversion State (Batch Production)
    const [convertModal, setConvertModal] = useState({
        open: false,
        primaryMaterialId: '', // Driving material if any
        targets: [{ id: Date.now(), productId: '', qty: 1 }],
        deductions: [], // Array of { id, materialId, name, stock, tQty (theory), rQty (real), type }
        memo: '',
        loading: false
    });
    // Harvest State (Raw Material / Product In)
    const [harvestModal, setHarvestModal] = useState({
        open: false,
        items: [{ id: Date.now(), targetId: '', qty: '' }],
        memo: ''
    });

    // Manual Adjustment Modal
    const [adjustModal, setAdjustModal] = useState({
        open: false,
        product: null,
        val: '',
        reason: '',
        memo: ''
    });

    const [freshnessMap, setFreshnessMap] = useState({}); // { [productId]: '2023-10-01T...' }

    // --- Effects ---
    useEffect(() => {
        loadData();
    }, [tab]);

    const loadData = async () => {
        if (!window.__TAURI__) return;
        try {
            // 1. Load Products (Wait for init schema if needed, but assuming init done)
            const list = await window.__TAURI__.core.invoke('get_product_list');
            setProducts(list || []);

            // 2. Load Freshness Data
            const freshData = await window.__TAURI__.core.invoke('get_product_freshness');
            // Convert to map
            const fMap = {};
            if (freshData) {
                freshData.forEach(item => {
                    fMap[item.product_id] = item.last_in_date;
                });
            }
            setFreshnessMap(fMap);

            // 3. Load Logs
            const logData = await window.__TAURI__.core.invoke('get_inventory_logs', {
                limit: 100,
                itemType: tab
            });
            setLogs(logData || []);
        } catch (e) {
            console.error(e);
        }
    };

    // ... (rest of code)

    // Helper to calc days
    const getFreshnessInfo = (pid) => {
        const dateStr = freshnessMap[pid];
        if (!dateStr) return null;

        const lastDate = new Date(dateStr);
        const today = new Date();
        const diffTime = Math.abs(today - lastDate);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        return { diffDays, dateStr };
    };

    const getSubTag = (product) => {
        if (product.item_type !== 'aux_material' && product.item_type !== 'raw_material' && product.item_type !== 'material') return null;

        // 1. If explicit category exists, use it
        if (product.category) {
            const cat = product.category;
            if (cat === '박스/포장') return { label: '박스', color: 'bg-orange-100 text-orange-700 border-orange-200' };
            if (cat === '라벨/스티커') return { label: '라벨', color: 'bg-blue-100 text-blue-700 border-blue-200' };
            if (cat === '비닐/봉투') return { label: '봉투', color: 'bg-emerald-100 text-emerald-700 border-emerald-200' };
            if (cat === '생산재') return { label: '생산재', color: 'bg-purple-100 text-purple-700 border-purple-200' };
            return { label: cat.replace(' 기타', ''), color: 'bg-slate-100 text-slate-700 border-slate-200' };
        }

        // 2. Fallback to name-based matching
        const name = product.product_name;
        if (name.includes('박스') || name.includes('상자')) return { label: '박스', color: 'bg-orange-100 text-orange-700 border-orange-200' };
        if (name.includes('스티커') || name.includes('라벨')) return { label: '라벨', color: 'bg-blue-100 text-blue-700 border-blue-200' };
        if (name.includes('비닐') || name.includes('봉투')) return { label: '봉투', color: 'bg-emerald-100 text-emerald-700 border-emerald-200' };
        if (name.includes('배지') || name.includes('종균')) return { label: '생산재', color: 'bg-purple-100 text-purple-700 border-purple-200' };
        if (name.includes('테이프') || name.includes('끈')) return { label: '기타', color: 'bg-slate-100 text-slate-700 border-slate-200' };
        return { label: '자재', color: 'bg-amber-100 text-amber-700 border-amber-200' };
    };

    // ... (inside render)

    // --- Actions ---
    const openAdjustModal = (product) => {
        setAdjustModal({
            open: true,
            product,
            val: '',
            reason: '',
            memo: ''
        });
    };

    const handleAdjustStock = async () => {
        const { product, val, reason, memo } = adjustModal;
        const changeQty = Number(val);
        if (!product || changeQty === 0) return;

        try {
            if (window.__TAURI__) {
                const memoText = changeQty > 0 ? '재고 입고(수동)' : '재고 조정(수동)';
                const fullMemo = memo ? `${memoText} - ${memo}` : (reason ? `${memoText} - ${reason}` : memoText);

                await window.__TAURI__.core.invoke('adjust_product_stock', {
                    productId: product.product_id,
                    changeQty,
                    memo: fullMemo,
                    reasonCategory: reason || null
                });

                setAdjustModal({ ...adjustModal, open: false });
                await loadData();
            }
        } catch (e) {
            showAlert("오류", "저장 실패: " + e);
        }
    };

    // --- Harvest Logic (Multi-Item) ---
    const openHarvestModal = (specificId) => {
        // Filter items that are either Products OR Raw Materials (Exclude Aux Materials)
        const targets = products.filter(p => p.item_type === 'harvest_item' && p.status !== '단종상품');
        if (targets.length === 0) {
            showAlert("알림", "등록된 품목이 없습니다.\n[환경 설정]에서 먼저 상품이나 원물을 등록해주세요.");
            return;
        }

        const initialTargetId = (typeof specificId === 'number' || typeof specificId === 'string')
            ? Number(specificId)
            : targets[0].product_id;

        setHarvestModal({
            open: true,
            items: [{ id: Date.now(), targetId: initialTargetId, qty: '', grade: 'A' }],
            memo: ''
        });
    };

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

    const handleHarvest = async () => {
        const { items, memo } = harvestModal;

        // Validation
        const validItems = items.filter(i => i.targetId && Number(i.qty) > 0);
        if (validItems.length === 0) {
            return showAlert("알림", "정확한 수확 품목과 수량을 입력해주세요.");
        }

        try {
            if (window.__TAURI__) {
                await Promise.all(validItems.map(item =>
                    window.__TAURI__.core.invoke('adjust_product_stock', {
                        productId: Number(item.targetId),
                        changeQty: Number(item.qty),
                        memo: `수확 입고 [${item.grade}등급]${memo ? ' - ' + memo : ''}`,
                        reasonCategory: '수확'
                    })
                ));

                await showAlert("완료", `${validItems.length}건의 수확 입고 처리가 완료되었습니다.`);
                setHarvestModal({ ...harvestModal, open: false });
                loadData();
            }
        } catch (e) {
            showAlert("오류", "처리 실패: " + e);
        }
    };


    // --- Conversion Logic (Batch / Multi-Target) ---
    const openConvertModal = (initialSourceId = '') => {
        const sid = initialSourceId ? String(initialSourceId) : '';
        let initialDeductions = [];

        if (sid) {
            const prod = products.find(p => p.product_id === Number(sid));
            if (prod) {
                initialDeductions = [{
                    id: Date.now(),
                    materialId: Number(sid),
                    name: prod.product_name,
                    stock: prod.inventory_count || 0,
                    tQty: 0,
                    rQty: 1, // Start with 1, user can edit
                    type: 'raw'
                }];
            }
        }

        setConvertModal({
            open: true,
            primaryMaterialId: sid,
            targets: [{ id: Date.now(), productId: '', qty: 1 }],
            deductions: initialDeductions,
            memo: '',
            loading: false
        });
    };

    const addConvertTarget = () => {
        setConvertModal(prev => ({
            ...prev,
            targets: [...prev.targets, { id: Date.now(), productId: '', qty: 1 }]
        }));
    };

    const removeConvertTarget = (id) => {
        setConvertModal(prev => ({
            ...prev,
            targets: prev.targets.filter(t => t.id !== id)
        }));
    };

    const updateConvertTarget = (id, field, value) => {
        setConvertModal(prev => {
            const nextTargets = prev.targets.map(t => t.id === id ? { ...t, [field]: value } : t);

            // If quantity changed, we don't need to do anything here because 
            // the useEffect [JSON.stringify(targets...)] will trigger syncBOMs 
            // which calculates required materials based on these new quantities.
            return { ...prev, targets: nextTargets };
        });
    };

    const addConvertMaterial = (materialId) => {
        const mat = products.find(p => p.product_id === Number(materialId));
        if (!mat) return;
        if (convertModal.deductions.find(d => d.materialId === mat.product_id)) return;

        setConvertModal(prev => ({
            ...prev,
            deductions: [...prev.deductions, {
                id: Date.now(),
                materialId: mat.product_id,
                name: mat.product_name,
                stock: mat.stock_quantity || 0,
                tQty: 0,
                rQty: 0,
                type: mat.item_type === 'aux_material' ? 'aux' : 'raw'
            }]
        }));
    };

    const removeConvertDeduction = (id) => {
        setConvertModal(prev => ({
            ...prev,
            deductions: prev.deductions.filter(d => d.id !== id)
        }));
    };

    // Load and Aggregate BOMs whenever targets change
    useEffect(() => {
        if (!convertModal.open) return;

        const syncBOMs = async () => {
            setConvertModal(prev => ({ ...prev, loading: true }));
            try {
                const targetIds = convertModal.targets.filter(t => t.productId).map(t => Number(t.productId));
                if (targetIds.length === 0) {
                    setConvertModal(prev => ({ ...prev, loading: false }));
                    return;
                }

                // Fetch all unique BOMs
                const uniqueIds = [...new Set(targetIds)];
                const bomMap = {};
                for (const pid of uniqueIds) {
                    if (window.__TAURI__) {
                        const boms = await window.__TAURI__.core.invoke('get_product_bom', { productId: pid });
                        bomMap[pid] = boms || [];
                    }
                }

                // Aggregate
                const aggregation = {}; // materialId -> { name, stock, tQty, type }

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
                                type: b.item_type === 'product' ? 'prod' : (b.item_type === 'aux_material' ? 'aux' : 'raw')
                            };
                        }
                        aggregation[b.material_id].tQty += Math.ceil(qty * b.ratio);
                    });
                });

                // Update deductions while preserving manual rQty entries if they existed
                setConvertModal(prev => {
                    const newDeductions = [...prev.deductions];
                    let autoPrimaryId = prev.primaryMaterialId;
                    let needsScaling = false;
                    let scaleFactor = 1;

                    // 1. Update/Add deductions from BOM
                    const aggList = Object.values(aggregation);
                    aggList.forEach(agg => {
                        const existingIdx = newDeductions.findIndex(d => d.materialId === agg.materialId);
                        if (existingIdx >= 0) {
                            const old = newDeductions[existingIdx];

                            if (autoPrimaryId && old.materialId === Number(autoPrimaryId) && old.tQty === 0 && old.rQty > 0) {
                                scaleFactor = old.rQty / agg.tQty;
                                if (isFinite(scaleFactor) && scaleFactor > 0.001) {
                                    needsScaling = true;
                                }
                            }

                            newDeductions[existingIdx] = {
                                ...old,
                                stock: agg.stock,
                                tQty: agg.tQty,
                                rQty: needsScaling ? old.rQty : agg.tQty
                            };
                        } else {
                            newDeductions.push({
                                id: Date.now() + Math.random(),
                                materialId: agg.materialId,
                                name: agg.name,
                                stock: agg.stock,
                                tQty: agg.tQty,
                                rQty: agg.tQty,
                                type: agg.type
                            });
                        }
                    });

                    // 2. Auto-assign primary material if not set or lost
                    if (!autoPrimaryId && aggList.length > 0) {
                        // First preference: any item with type 'raw'
                        const rawItem = aggList.find(a => a.type === 'raw');
                        if (rawItem) {
                            autoPrimaryId = String(rawItem.materialId);
                        } else {
                            // Fallback: just pick the first thing in the BOM
                            autoPrimaryId = String(aggList[0].materialId);
                        }
                    }

                    // 2. If we found a scaling requirement (User typed Qty first, then selected Product)
                    if (needsScaling) {
                        const newTargets = prev.targets.map(t => ({
                            ...t,
                            qty: Math.max(1, Math.round(t.qty * scaleFactor))
                        }));
                        return { ...prev, deductions: newDeductions, targets: newTargets, primaryMaterialId: autoPrimaryId, loading: false };
                    }

                    return { ...prev, deductions: newDeductions, primaryMaterialId: autoPrimaryId, loading: false };
                });

            } catch (e) {
                console.error(e);
                setConvertModal(prev => ({ ...prev, loading: false }));
            }
        };

        syncBOMs();
    }, [JSON.stringify(convertModal.targets.map(t => ({ p: t.productId, q: t.qty })))]);

    const handleDeductionQtyChange = (id, val) => {
        const newVal = Number(val);
        setConvertModal(prev => {
            const targetMaterial = prev.deductions.find(d => d.id === id);
            if (!targetMaterial) return prev;

            // Fulfill "Input Source -> Estimate Target Product"
            if (prev.primaryMaterialId && targetMaterial.materialId === Number(prev.primaryMaterialId)) {
                // Determine the base ratio. 
                // We want to know how much 1 unit of product uses this material on average across all targets.
                // Simplified: use scaling factor relative to theoretical required.
                if (targetMaterial.tQty > 0 && newVal > 0) {
                    const scaleFactor = newVal / targetMaterial.tQty;
                    if (isFinite(scaleFactor) && Math.abs(scaleFactor - 1) > 0.001) {
                        const newTargets = prev.targets.map(t => ({
                            ...t,
                            qty: Math.max(1, Math.round(t.qty * scaleFactor))
                        }));
                        // We update targets, which triggers useEffect to sync all other deductions.
                        return { ...prev, targets: newTargets };
                    }
                }
            }

            // Normal update for manual adjustments/aux materials
            return {
                ...prev,
                deductions: prev.deductions.map(d => d.id === id ? { ...d, rQty: newVal } : d)
            };
        });
    };

    const handleBatchConvert = async () => {
        const { targets, deductions, memo } = convertModal;
        const validTargets = targets.filter(t => t.productId && Number(t.qty) > 0);
        const validDeductions = deductions.filter(d => d.materialId && Number(d.rQty) > 0);

        if (validTargets.length === 0) return showAlert("알림", "생산할 품목을 1개 이상 선택해주세요.");

        // Check Stock
        for (const d of validDeductions) {
            if (d.stock < d.rQty) {
                if (!await showConfirm("재고 부족", `${d.name} 재고가 부족합니다. (필요: ${d.rQty}, 보유: ${d.stock})\n그래도 강행하시겠습니까?`)) return;
            }
        }

        try {
            if (window.__TAURI__) {
                await window.__TAURI__.core.invoke('batch_convert_stock', {
                    targets: validTargets.map(t => ({ product_id: Number(t.productId), quantity: Number(t.qty) })),
                    deductions: validDeductions.map(d => ({ material_id: d.materialId, quantity: Number(d.rQty) })),
                    memo: memo || '통합 상품화 처리'
                });
                await showAlert("완료", "통합 상품화 처리가 완료되었습니다.");
                setConvertModal({ ...convertModal, open: false });
                loadData();
            }
        } catch (e) {
            showAlert("오류", "처리 실패: " + e);
        }
    };

    // --- Derived ---
    const filteredProducts = useMemo(() => {
        let list = products;
        if (tab === 'harvest_item') {
            list = list.filter(p => p.item_type === 'harvest_item');
        } else if (tab === 'aux_material') {
            list = list.filter(p => p.item_type === 'aux_material' || p.item_type === 'raw_material' || p.item_type === 'material');
            if (auxSubTab !== 'ALL') {
                list = list.filter(p => {
                    if (auxSubTab === '박스/포장') return p.category === '박스/포장' || p.product_name.includes('박스') || p.product_name.includes('상자');
                    if (auxSubTab === '라벨/스티커') return p.category === '라벨/스티커' || p.product_name.includes('스티커') || p.product_name.includes('라벨');
                    if (auxSubTab === '생산재') return p.category === '생산재' || p.product_name.includes('배지') || p.product_name.includes('종균');
                    if (auxSubTab === '기타 소모품') return p.category === '기타 소모품' || (!p.category && !p.product_name.includes('박스') && !p.product_name.includes('스티커') && !p.product_name.includes('배지'));
                    return true;
                });
            }
        } else {
            // product
            list = list.filter(p => !p.item_type || p.item_type === 'product');
        }

        if (searchQuery) list = list.filter(p => p.product_name.toLowerCase().includes(searchQuery.toLowerCase()));
        return list;
    }, [products, tab, searchQuery, auxSubTab]);

    const filteredLogs = useMemo(() => {
        let list = logs;
        if (hideAutoLogs) {
            list = list.filter(l => l.reference_id === 'MANUAL' || (l.change_type !== '출고' && l.change_type !== '취소반품' && l.change_type !== '생산출고'));
        }
        if (logSearchQuery) {
            const q = logSearchQuery.toLowerCase();
            list = list.filter(l =>
                l.product_name.toLowerCase().includes(q) ||
                (l.memo && l.memo.toLowerCase().includes(q)) ||
                l.change_type.toLowerCase().includes(q)
            );
        }
        return list;
    }, [logs, hideAutoLogs, logSearchQuery]);

    const groupedLogs = useMemo(() => {
        const groups = {};
        filteredLogs.forEach(log => {
            // Backend strings without Z/+ are treated as UTC
            const isoStr = (typeof log.created_at === 'string' && !log.created_at.includes('Z') && !log.created_at.includes('+'))
                ? `${log.created_at.replace(' ', 'T')}Z`
                : log.created_at;
            const d = new Date(isoStr);
            if (isNaN(d.getTime())) {
                const parts = log.created_at.split(' ');
                const fallbackDate = parts[0];
                if (!groups[fallbackDate]) groups[fallbackDate] = [];
                groups[fallbackDate].push({ ...log, _localTime: parts[1]?.substring(0, 5) || '' });
                return;
            }

            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            const date = `${year}-${month}-${day}`;

            const hours = String(d.getHours()).padStart(2, '0');
            const minutes = String(d.getMinutes()).padStart(2, '0');
            const time = `${hours}:${minutes}`;

            if (!groups[date]) groups[date] = [];
            groups[date].push({ ...log, _localDate: date, _localTime: time });
        });
        return groups;
    }, [filteredLogs]);

    const logStats = useMemo(() => {
        const plus = filteredLogs.filter(l => l.change_quantity > 0).reduce((a, b) => a + b.change_quantity, 0);
        const minus = filteredLogs.filter(l => l.change_quantity < 0).reduce((a, b) => a + b.change_quantity, 0);
        return { plus, minus };
    }, [filteredLogs]);

    return (
        <div className="h-full flex flex-col bg-slate-50 relative overflow-hidden">
            {/* Header (Matches SalesReception Style) */}
            <div className="px-6 lg:px-8 min-[2000px]:px-12 pt-6 lg:pt-8 min-[2000px]:pt-12 pb-1 shrink-0">
                <div className="flex justify-between items-end mb-4">
                    <div>
                        <div className="flex items-center gap-2 mb-0.5">
                            <span className="w-6 h-1 bg-indigo-600 rounded-full"></span>
                            <span className="text-[9px] font-black tracking-[0.2em] text-indigo-600 uppercase">Inventory Management</span>
                        </div>
                        <h1 className="text-3xl font-black text-slate-600 tracking-tighter" style={{ fontFamily: '"Noto Sans KR", sans-serif' }}>
                            재고/생산 관리 <span className="text-slate-300 font-light ml-1 text-xl">Stock & Production</span>
                        </h1>
                    </div>
                </div>

                {/* Quick Info Box */}
                <div className="mb-6 flex flex-wrap gap-4">
                    <div className="flex-1 min-w-[200px] bg-indigo-50/50 border border-indigo-100 p-3 rounded-2xl flex items-center gap-3">
                        <span className="material-symbols-rounded text-indigo-600 bg-white p-1.5 rounded-xl text-lg shadow-sm">potted_plant</span>
                        <div>
                            <p className="text-[10px] font-black text-indigo-900">완제품</p>
                            <p className="text-[9px] text-indigo-500 font-bold leading-tight">포장이 완료되어 판매 대기 중인 최종 상품</p>
                        </div>
                    </div>
                    <div className="flex-1 min-w-[200px] bg-emerald-50/50 border border-emerald-100 p-3 rounded-2xl flex items-center gap-3">
                        <span className="material-symbols-rounded text-emerald-600 bg-white p-1.5 rounded-xl text-lg shadow-sm">spa</span>
                        <div>
                            <p className="text-[10px] font-black text-emerald-900">농산물 (수확물)</p>
                            <p className="text-[9px] text-emerald-500 font-bold leading-tight">송고버섯 등 현장에서 직접 수확한 원물</p>
                        </div>
                    </div>
                    <div className="flex-1 min-w-[200px] bg-orange-50/50 border border-orange-100 p-3 rounded-2xl flex items-center gap-3">
                        <span className="material-symbols-rounded text-orange-600 bg-white p-1.5 rounded-xl text-lg shadow-sm">layers</span>
                        <div>
                            <p className="text-[10px] font-black text-orange-900">부자재 (포장재)</p>
                            <p className="text-[9px] text-orange-500 font-bold leading-tight">박스, 라벨 및 종균/배지 등 각종 자재</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Layout Grid */}
            <div className="flex-1 flex gap-5 px-6 lg:px-8 min-[2000px]:px-12 pb-6 lg:pb-8 min-[2000px]:pb-12 min-h-0">

                {/* LEFT: Current Stock Panel */}
                <div className="flex-1 flex flex-col bg-white rounded-[1.5rem] shadow-sm border border-slate-200 overflow-hidden relative">

                    {/* Toolbar */}
                    <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-white z-10">
                        {/* Tabs */}
                        {/* Tabs */}
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

                            {/* Action Buttons based on Tab */}
                            <div className="flex gap-2">
                                {tab === 'harvest_item' && (
                                    <>
                                        <button onClick={openHarvestModal} className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm shadow-lg shadow-emerald-100 flex items-center gap-2 transition-all hover:scale-[1.02] active:scale-95 animate-in fade-in zoom-in duration-300">
                                            <span className="material-symbols-rounded text-lg">spa</span> 수확 입고
                                        </button>
                                        <button onClick={openConvertModal} className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-sm shadow-lg shadow-indigo-100 flex items-center gap-2 transition-all hover:scale-[1.02] active:scale-95 animate-in fade-in zoom-in duration-300">
                                            <span className="material-symbols-rounded text-lg">inventory_2</span> 통합 상품화
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>

                        {/* Search */}
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

                    {/* Table Area */}
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
                                {filteredProducts.map((p, idx) => {
                                    const current = p.stock_quantity || 0;
                                    const isLow = current <= (p.safety_stock || 10);

                                    // Freshness Logic (Only for products and raw materials)
                                    const freshInfo = getFreshnessInfo(p.product_id);
                                    let freshBadge = null;
                                    const isMaterial = p.item_type === 'raw_material' || p.item_type === 'material';
                                    const isProduct = !p.item_type || p.item_type === 'product';

                                    if (current > 0 && freshInfo && (isMaterial || isProduct)) {
                                        const d = freshInfo.diffDays - 1; // Adjust displayed day count if needed, but keeping it consistent
                                        const displayDays = d < 0 ? 0 : d;

                                        if (d >= 7) {
                                            freshBadge = (
                                                <div className="flex items-center gap-1.5 mt-0.5">
                                                    <div className="flex-1 h-1 bg-red-100 rounded-full overflow-hidden">
                                                        <div className="h-full bg-red-500 w-full animate-pulse"></div>
                                                    </div>
                                                    <span className="shrink-0 text-[10px] font-black text-red-600 bg-red-50 px-1 rounded border border-red-100">경과 {d}일</span>
                                                </div>
                                            );
                                        } else if (d >= 3) {
                                            const pct = Math.min((d / 7) * 100, 100);
                                            freshBadge = (
                                                <div className="flex items-center gap-1.5 mt-0.5">
                                                    <div className="flex-1 h-1 bg-orange-100 rounded-full overflow-hidden">
                                                        <div className="h-full bg-orange-500" style={{ width: `${pct}%` }}></div>
                                                    </div>
                                                    <span className="shrink-0 text-[10px] font-black text-orange-600 bg-orange-50 px-1 rounded border border-orange-100">판매권장 ({d}일)</span>
                                                </div>
                                            );
                                        } else {
                                            freshBadge = (
                                                <div className="flex items-center gap-1.5 mt-0.5">
                                                    <div className="flex-1 h-1 bg-emerald-100 rounded-full overflow-hidden">
                                                        <div className="h-full bg-emerald-500" style={{ width: '20%' }}></div>
                                                    </div>
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
                                                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-black border uppercase shrink-0 ${getSubTag(p).color}`}>
                                                                {getSubTag(p).label}
                                                            </span>
                                                        )}
                                                    </div>
                                                    {freshBadge}
                                                </div>
                                            </td>
                                            <td className="px-2 py-3 text-center text-slate-500 truncate">{p.specification || '-'}</td>

                                            {/* Current Stock */}
                                            <td className={`px-2 py-3 text-right font-black text-sm bg-indigo-50/5 ${isLow ? 'text-red-500' : 'text-slate-700'}`}>
                                                {formatCurrency(current)}
                                                {isLow && <span className="material-symbols-rounded text-sm align-middle ml-1 text-red-500 animate-pulse" title="안전재고 부족">error</span>}
                                            </td>

                                            {/* Last Date */}
                                            <td className="px-2 py-3 text-center text-slate-400 text-[10px] font-medium">
                                                {freshInfo?.dateStr ? formatDateTime(freshInfo.dateStr).split(' ')[0] : '-'}
                                            </td>

                                            {/* Action Btn */}
                                            <td className="px-2 py-3 text-center">
                                                <div className="flex items-center justify-center gap-1.5">
                                                    {(tab === 'harvest_item' || tab === 'product') && (
                                                        <>
                                                            {tab === 'harvest_item' && (
                                                                <button
                                                                    onClick={() => openHarvestModal(p.product_id)}
                                                                    className="inline-flex items-center justify-center p-2 rounded-xl bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-all active:scale-95 shadow-sm border border-emerald-100"
                                                                    title="수확 입고"
                                                                >
                                                                    <span className="material-symbols-rounded text-base">spa</span>
                                                                </button>
                                                            )}
                                                            <button
                                                                onClick={() => openConvertModal(p.product_id)}
                                                                className="inline-flex items-center justify-center p-2 rounded-xl bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-all active:scale-95 shadow-sm border border-indigo-100"
                                                                title={tab === 'product' ? '세트 구성/생산' : '상품화 (포장)'}
                                                            >
                                                                <span className="material-symbols-rounded text-base">inventory_2</span>
                                                            </button>
                                                        </>
                                                    )}
                                                    <button
                                                        onClick={() => openAdjustModal(p)}
                                                        className="inline-flex items-center justify-center p-2 rounded-xl bg-orange-50 text-orange-600 hover:bg-orange-100 transition-all active:scale-95 shadow-sm border border-orange-100"
                                                        title="재고 조정"
                                                    >
                                                        <span className="material-symbols-rounded text-base">edit_note</span>
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                                {filteredProducts.length === 0 && (
                                    <tr><td colSpan="8" className="py-20 text-center text-slate-400 font-medium">검색 결과가 없습니다.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* RIGHT: History Logs Panel */}
                <div className="w-[420px] flex flex-col bg-white rounded-[1.5rem] shadow-sm border border-slate-200 overflow-hidden">
                    <div className="p-5 border-b border-slate-100 bg-slate-50/80">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="font-black text-slate-800 text-sm flex items-center gap-2">
                                <span className="w-8 h-8 rounded-lg bg-amber-100 text-amber-600 flex items-center justify-center">
                                    <span className="material-symbols-rounded text-xl">history</span>
                                </span>
                                재고 감사 로그 (Audit Trail)
                            </h3>
                            <button onClick={loadData} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-200 text-slate-400 hover:text-indigo-600 transition-all">
                                <span className="material-symbols-rounded text-lg">refresh</span>
                            </button>
                        </div>

                        {/* Log Search & Filter */}
                        <div className="space-y-3">
                            <div className="relative group">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 material-symbols-rounded text-lg group-focus-within:text-orange-500 transition-colors">search</span>
                                <input
                                    value={logSearchQuery}
                                    onChange={e => setLogSearchQuery(e.target.value)}
                                    className="pl-10 pr-4 h-9 w-full bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-4 focus:ring-orange-100 focus:border-orange-300 transition-all placeholder:text-slate-400"
                                    placeholder="로그 내역 검색 (품목, 메모, 상태...)"
                                />
                            </div>
                            <div className="flex justify-between items-center">
                                <label className="flex items-center gap-2 cursor-pointer group">
                                    <div className={`w-8 h-4 rounded-full relative transition-colors ${hideAutoLogs ? 'bg-indigo-600' : 'bg-slate-300'}`}>
                                        <input type="checkbox" className="hidden" checked={hideAutoLogs} onChange={e => setHideAutoLogs(e.target.checked)} />
                                        <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${hideAutoLogs ? 'left-[18px]' : 'left-0.5'}`} />
                                    </div>
                                    <span className="text-[10px] font-black text-slate-500 group-hover:text-indigo-600 tracking-tighter uppercase transition-colors">시스템 자동로그 숨김</span>
                                </label>
                                <div className="flex gap-2">
                                    <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-600 text-[10px] font-black">+{formatCurrency(logStats.plus)}</span>
                                    <span className="px-2 py-0.5 rounded bg-rose-50 text-rose-600 text-[10px] font-black">{formatCurrency(logStats.minus)}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="flex-1 overflow-auto stylish-scrollbar scroll-smooth bg-slate-50/30">
                        {filteredLogs.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-3 p-10">
                                <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center">
                                    <span className="material-symbols-rounded text-4xl text-slate-300">history_toggle_off</span>
                                </div>
                                <div className="text-center">
                                    <div className="text-xs font-black text-slate-500 mb-1">매칭되는 로그가 없습니다</div>
                                    <div className="text-[10px] text-slate-400">검색어나 필터를 조정해 보세요.</div>
                                </div>
                            </div>
                        ) : (
                            <div className="p-4 space-y-6">
                                {Object.entries(groupedLogs).sort((a, b) => b[0].localeCompare(a[0])).map(([date, items]) => (
                                    <div key={date} className="relative">
                                        <div className="sticky top-0 z-10 py-2 mb-3">
                                            <div className="bg-white/80 backdrop-blur inline-flex items-center gap-2 px-3 py-1 rounded-full border border-slate-200 shadow-sm">
                                                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
                                                <span className="text-[10px] font-black text-slate-700">{date}</span>
                                                <span className="text-[10px] text-slate-400 font-bold ml-1">{items.length}건</span>
                                            </div>
                                        </div>

                                        <div className="space-y-3 ml-2 border-l-2 border-slate-100 pl-4">
                                            {items.map((log, idx) => {
                                                const isPlus = log.change_quantity > 0;
                                                const isMinus = log.change_quantity < 0;

                                                // Determine Type Style
                                                let typeColor = "bg-slate-100 text-slate-500 border-slate-200";
                                                let typeIcon = "sync_alt";

                                                if (log.change_type === '입고') { typeColor = "bg-blue-50 text-blue-600 border-blue-100"; typeIcon = "login"; }
                                                else if (log.change_type === '출고') { typeColor = "bg-rose-50 text-rose-600 border-rose-100"; typeIcon = "logout"; }
                                                else if (log.change_type === '수확' || log.change_type === '생산입고') { typeColor = "bg-emerald-50 text-emerald-600 border-emerald-100"; typeIcon = "spa"; }
                                                else if (log.change_type === '취소반품') { typeColor = "bg-green-50 text-green-600 border-green-100"; typeIcon = "keyboard_return"; }
                                                else if (log.change_type === '상품생산') { typeColor = "bg-purple-50 text-purple-600 border-purple-100"; typeIcon = "inventory_2"; }
                                                else if (log.change_type === '조정') { typeColor = "bg-amber-50 text-amber-600 border-amber-100"; typeIcon = "edit_note"; }

                                                return (
                                                    <div key={idx} className="group relative bg-white p-3 rounded-xl border border-slate-100 shadow-sm hover:shadow-md hover:border-indigo-200 transition-all">
                                                        <div className="flex justify-between items-start gap-4">
                                                            <div className="flex-1 min-w-0">
                                                                <div className="flex items-center gap-2 mb-1">
                                                                    <div className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase border shrink-0 ${typeColor}`}>
                                                                        {log.change_type}
                                                                    </div>
                                                                    <span className="text-[11px] font-black text-slate-800 truncate leading-tight">{log.product_name}</span>
                                                                </div>
                                                                <div className="flex items-center gap-2 text-[10px] text-slate-400 font-mono mb-2">
                                                                    <span>{log._localTime}</span>
                                                                    <span className="w-px h-2 bg-slate-200"></span>
                                                                    <span className="font-bold text-slate-500">잔액: {formatCurrency(log.current_stock)}</span>
                                                                </div>
                                                            </div>
                                                            <div className={`text-sm font-black text-right shrink-0 ${isPlus ? 'text-blue-600' : 'text-rose-500'}`}>
                                                                {isPlus ? '+' : ''}{formatCurrency(log.change_quantity)}
                                                            </div>
                                                        </div>

                                                        {log.memo && (
                                                            <div className="relative mt-1 pl-3 py-1.5 border-l-2 border-indigo-100 bg-indigo-50/30 rounded-r-md">
                                                                <span className="material-symbols-rounded text-[12px] absolute left-[-7px] top-1/2 -translate-y-1/2 bg-white text-indigo-400 rounded-full h-4 w-4 flex items-center justify-center border border-indigo-100">chat_bubble</span>
                                                                <p className="text-[10px] text-slate-600 font-medium leading-relaxed italic">{log.memo}</p>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Conversion Modal (Batch/Multi-Production) */}
            {convertModal.open && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md transition-opacity"></div>
                    <div className="bg-white rounded-[2.5rem] w-full max-w-[850px] shadow-2xl relative overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
                        {/* Modal Header */}
                        <div className="bg-gradient-to-br from-indigo-600 via-indigo-700 to-purple-800 p-8 text-white relative">
                            <div className="flex justify-between items-start relative z-10">
                                <div>
                                    <div className="flex items-center gap-3 mb-2">
                                        <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center border border-white/30 shadow-inner">
                                            <span className="material-symbols-rounded text-3xl">inventory_2</span>
                                        </div>
                                        <div>
                                            <h3 className="text-2xl font-black tracking-tight" style={{ fontFamily: '"Noto Sans KR", sans-serif' }}>통합 상품화 처리</h3>
                                        </div>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setConvertModal({ ...convertModal, open: false })}
                                    className="w-10 h-10 rounded-full hover:bg-white/10 flex items-center justify-center transition-colors group"
                                >
                                    <span className="material-symbols-rounded text-white/50 group-hover:text-white">close</span>
                                </button>
                            </div>
                            {/* Stats/Badges */}
                            <div className="flex gap-4 mt-6">
                                <div className="px-4 py-2 bg-white/10 rounded-2xl border border-white/10 backdrop-blur-sm">
                                    <p className="text-[10px] font-black text-indigo-200 uppercase mb-0.5">생산 대상</p>
                                    <p className="text-lg font-black">{convertModal.targets.filter(t => t.productId).length}종류</p>
                                </div>
                                <div className="px-4 py-2 bg-white/10 rounded-2xl border border-white/10 backdrop-blur-sm">
                                    <p className="text-[10px] font-black text-indigo-200 uppercase mb-0.5">사용 자재</p>
                                    <p className="text-lg font-black">{convertModal.deductions.length}종류</p>
                                </div>
                            </div>
                            <span className="material-symbols-rounded absolute -right-12 -top-12 text-[240px] text-white/5 pointer-events-none rotate-12">conveyor_belt</span>
                        </div>

                        <div className="flex-1 overflow-hidden flex flex-col bg-slate-50/50">
                            <div className="flex-1 overflow-y-auto stylish-scrollbar p-8">
                                <div className="grid grid-cols-12 gap-10">

                                    {/* Left Column: Source & Targets */}
                                    <div className="col-span-12 lg:col-span-7">

                                        {/* Step 1: Produce Targets (Now Step 01) */}
                                        <div className="mb-10">
                                            <div className="flex justify-between items-center mb-4">
                                                <h4 className="text-sm font-black text-slate-800 flex items-center gap-2">
                                                    <span className="w-6 h-6 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center text-xs">01</span>
                                                    생산 상품명
                                                </h4>
                                            </div>

                                            <div className="space-y-3">
                                                {convertModal.targets.map((target, idx) => (
                                                    <div key={target.id} className="p-4 bg-white rounded-2xl border border-slate-200 shadow-sm relative group animate-in slide-in-from-left-4 duration-300">
                                                        <div className="grid grid-cols-12 gap-4 items-end">
                                                            <div className="col-span-7">
                                                                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block ml-1">생산 품목 선택</label>
                                                                <div className="relative">
                                                                    <select
                                                                        className="w-full h-11 pl-3 pr-8 rounded-xl border border-slate-100 bg-slate-50 text-sm font-bold text-slate-700 outline-none focus:ring-4 focus:ring-indigo-50 focus:border-indigo-300 appearance-none transition-all"
                                                                        value={target.productId}
                                                                        onChange={e => updateConvertTarget(target.id, 'productId', e.target.value)}
                                                                    >
                                                                        <option value="">-- 생산 품목 선택 --</option>
                                                                        {products
                                                                            .filter(p => (!p.item_type || p.item_type === 'product') && p.status !== '단종상품')
                                                                            .map(p => {
                                                                                const isRecommended = convertModal.primaryMaterialId && (
                                                                                    p.product_name.includes(products.find(x => x.product_id === Number(convertModal.primaryMaterialId))?.product_name?.split(' ')[0])
                                                                                );
                                                                                return (
                                                                                    <option key={p.product_id} value={p.product_id}>
                                                                                        {isRecommended ? '⭐ ' : ''}{p.product_name} ({p.specification || '규격없음'})
                                                                                    </option>
                                                                                );
                                                                            })
                                                                        }
                                                                    </select>
                                                                    <span className="material-symbols-rounded absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">expand_more</span>
                                                                </div>
                                                            </div>
                                                            <div className="col-span-4">
                                                                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block ml-1">생산 수량</label>
                                                                <div className="relative group/field">
                                                                    <input
                                                                        type="number"
                                                                        className="w-full h-11 rounded-xl border-2 border-indigo-200 bg-white text-right font-black text-lg text-indigo-700 pr-10 outline-none focus:ring-4 focus:ring-indigo-50 focus:border-indigo-400 transition-all shadow-sm"
                                                                        value={target.qty}
                                                                        onChange={e => updateConvertTarget(target.id, 'qty', e.target.value)}
                                                                    />
                                                                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">{products.find(p => p.product_id === Number(target.productId))?.specification?.replace(/\d/g, '').replace('g', '') || '개'}</span>
                                                                </div>
                                                            </div>
                                                            <div className="col-span-1">
                                                                {/* Item removal disabled */}
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Step 2: Source Material */}
                                        <div className="mb-10">
                                            <h4 className="text-sm font-black text-slate-800 flex items-center gap-2 mb-4">
                                                <span className="w-6 h-6 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center text-xs">02</span>
                                                투입 농산물
                                            </h4>

                                            <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-sm relative group animate-in slide-in-from-left-4 duration-300">
                                                <div className="grid grid-cols-12 gap-4 items-end">
                                                    <div className="col-span-7">
                                                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block ml-1">투입 농산물 선택</label>
                                                        <div className="relative">
                                                            <select
                                                                className="w-full h-11 pl-3 pr-8 rounded-xl border border-slate-100 bg-slate-50 text-sm font-bold text-slate-700 outline-none focus:ring-4 focus:ring-emerald-50 focus:border-emerald-300 appearance-none transition-all"
                                                                value={convertModal.primaryMaterialId || ''}
                                                                onChange={e => {
                                                                    if (e.target.value) {
                                                                        const val = e.target.value;
                                                                        const prod = products.find(p => p.product_id === Number(val));
                                                                        setConvertModal(prev => ({
                                                                            ...prev,
                                                                            primaryMaterialId: val,
                                                                            deductions: prev.deductions.some(d => d.materialId === Number(val))
                                                                                ? prev.deductions
                                                                                : [...prev.deductions, {
                                                                                    id: Date.now(),
                                                                                    materialId: Number(val),
                                                                                    name: prod?.product_name || '원물',
                                                                                    stock: prod?.inventory_count || 0,
                                                                                    tQty: 0,
                                                                                    rQty: 1,
                                                                                    type: 'raw'
                                                                                }]
                                                                        }));
                                                                    } else {
                                                                        setConvertModal(prev => ({ ...prev, primaryMaterialId: '' }));
                                                                    }
                                                                }}
                                                            >
                                                                <option value="">-- 투입 품목 선택 --</option>
                                                                {products.filter(p => (p.item_type === 'harvest_item' || p.item_type === 'raw_material' || p.item_type === 'material') && p.status !== '단종상품').map(p => (
                                                                    <option key={p.product_id} value={p.product_id}>{p.product_name} ({p.specification || '원본'})</option>
                                                                ))}
                                                            </select>
                                                            <span className="material-symbols-rounded absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">expand_more</span>
                                                        </div>
                                                    </div>
                                                    <div className="col-span-4">
                                                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block ml-1">
                                                            투입 수량 {(() => {
                                                                const primaryItem = convertModal.deductions.find(d => d.materialId === Number(convertModal.primaryMaterialId));
                                                                return primaryItem ? `(추정: ${formatCurrency(primaryItem.tQty)})` : '';
                                                            })()}
                                                        </label>
                                                        <div className="relative group/field">
                                                            <input
                                                                type="number"
                                                                className="w-full h-11 rounded-xl border-2 border-emerald-200 bg-white text-right font-black text-lg text-emerald-700 pr-10 outline-none focus:ring-4 focus:ring-emerald-50 focus:border-emerald-300 transition-all shadow-sm"
                                                                value={(() => {
                                                                    const primaryItem = convertModal.deductions.find(d => d.materialId === Number(convertModal.primaryMaterialId));
                                                                    return primaryItem ? primaryItem.rQty : '';
                                                                })()}
                                                                onChange={e => {
                                                                    const primaryItem = convertModal.deductions.find(d => d.materialId === Number(convertModal.primaryMaterialId));
                                                                    if (primaryItem) handleDeductionQtyChange(primaryItem.id, e.target.value);
                                                                }}
                                                            />
                                                            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">
                                                                {products.find(p => p.product_id === Number(convertModal.primaryMaterialId))?.specification || '단위'}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="mt-2 text-[10px] font-bold text-emerald-600/60 ml-1">
                                                    생산 상품의 레시피에 따라 자동으로 계산된 권장 투입량입니다.
                                                </div>
                                            </div>
                                        </div>

                                        <div className="mt-8">
                                            <label className="text-sm font-black text-slate-800 flex items-center gap-2 mb-4">
                                                <span className="w-6 h-6 rounded-lg bg-slate-200 text-slate-600 flex items-center justify-center text-xs">03</span>
                                                일지 및 비고 (Memo)
                                            </label>
                                            <textarea
                                                className="w-full h-24 p-4 rounded-[1.5rem] border border-slate-200 bg-white shadow-sm text-sm font-medium text-slate-600 outline-none focus:ring-4 focus:ring-indigo-50 focus:border-indigo-300 transition-all resize-none placeholder:text-slate-300"
                                                placeholder="오늘 생산 작업의 특이사항을 기록하세요. (예: 저온 창고 입고 완료, 라벨 교체 등)"
                                                value={convertModal.memo}
                                                onChange={e => setConvertModal({ ...convertModal, memo: e.target.value })}
                                            />
                                        </div>
                                    </div>

                                    {/* Right Column: Deduction Summary (Automated) */}
                                    <div className="col-span-12 lg:col-span-5 border-l border-slate-200 pl-4 lg:pl-10">
                                        <div className="flex justify-between items-center mb-6">
                                            <div>
                                                <h4 className="text-sm font-black text-slate-800 flex items-center gap-2">
                                                    <span className="w-6 h-6 rounded-lg bg-amber-100 text-amber-600 flex items-center justify-center text-xs">04</span>
                                                    기타 자재 차감 요약
                                                </h4>
                                                <p className="text-[10px] text-slate-400 mt-1 font-bold">라벨, 포장재 등 부자재 소모량입니다.</p>
                                            </div>
                                            {convertModal.loading && <span className="text-[10px] text-indigo-500 animate-pulse font-black uppercase tracking-tighter">Recalculating...</span>}
                                        </div>

                                        <div className="bg-slate-100/50 rounded-[2.5rem] border border-slate-200 p-6 min-h-[400px]">
                                            {convertModal.deductions.length <= 1 && !convertModal.loading ? (
                                                <div className="h-full flex flex-col items-center justify-center p-10 text-center opacity-40">
                                                    <span className="material-symbols-rounded text-5xl mb-4 text-slate-300">fact_check</span>
                                                    <p className="text-xs font-black text-slate-500">BOM에 등록된 부자재가 없거나<br />생산 품목을 선택하지 않았습니다.</p>
                                                </div>
                                            ) : (
                                                <div className="space-y-3">
                                                    {/* Secondary Materials Only (Primary is on the left) */}
                                                    <div className="grid grid-cols-1 gap-2">
                                                        {convertModal.deductions.filter(d => d.materialId !== Number(convertModal.primaryMaterialId)).map((d) => {
                                                            const isShort = d.stock < d.rQty;
                                                            return (
                                                                <div key={d.id} className={`flex items-center justify-between p-3 rounded-2xl border bg-white shadow-sm hover:border-indigo-200 transition-all ${isShort ? 'border-rose-200 bg-rose-50/30' : 'border-slate-100'}`}>
                                                                    <div className="flex items-center gap-2">
                                                                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${d.type === 'aux' ? 'bg-orange-50 text-orange-500' : d.type === 'prod' ? 'bg-indigo-50 text-indigo-500' : 'bg-emerald-50 text-emerald-500'}`}>
                                                                            <span className="material-symbols-rounded text-base">
                                                                                {d.type === 'aux' ? 'package_2' : d.type === 'prod' ? 'box' : 'spa'}
                                                                            </span>
                                                                        </div>
                                                                        <div>
                                                                            <p className="text-[11px] font-black text-slate-700">{d.name}</p>
                                                                            <p className={`text-[9px] font-bold ${isShort ? 'text-rose-500' : 'text-slate-400'}`}>
                                                                                재고: {formatCurrency(d.stock)} {isShort && '(부족)'}
                                                                            </p>
                                                                        </div>
                                                                    </div>
                                                                    <div className="text-right">
                                                                        <span className="text-sm font-black text-slate-600">-{formatCurrency(d.rQty)}</span>
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            )}

                                            <div className="mt-6 flex flex-col items-center">
                                                <div className="px-4 py-2 bg-white/50 border border-dashed border-slate-300 rounded-2xl text-[10px] font-bold text-slate-400 flex items-center gap-2">
                                                    <span className="material-symbols-rounded text-sm">info</span>
                                                    레시피 기준 자동 산출됨
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Modal Footer */}
                        <div className="p-8 bg-white border-t border-slate-100 flex gap-4 shrink-0 shadow-[0_-10px_20px_-15px_rgba(0,0,0,0.1)]">
                            <button
                                onClick={() => setConvertModal({ ...convertModal, open: false })}
                                className="px-8 h-14 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-600 font-black text-sm transition-all"
                            >
                                취소
                            </button>
                            <button
                                onClick={handleBatchConvert}
                                className="flex-1 h-14 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-lg shadow-lg shadow-indigo-200 transition-all hover:scale-[1.01] active:scale-95 flex items-center justify-center gap-3 group"
                            >
                                <span className="material-symbols-rounded group-hover:animate-bounce">conveyor_belt</span>
                                통합 상품화 완료
                            </button>
                        </div>
                    </div>
                </div>
            )}


            {/* Harvest Modal (Material / Product Tab) */}
            {harvestModal.open && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md transition-opacity"></div>
                    <div className="bg-white rounded-2xl w-full max-w-[650px] shadow-2xl relative overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
                        <div className="bg-gradient-to-r from-emerald-500 to-teal-600 p-6 text-white relative overflow-hidden shrink-0">
                            <span className="material-symbols-rounded absolute -right-6 -top-6 text-[120px] text-white/10 pointer-events-none">spa</span>
                            <h3 className="text-lg font-black flex items-center gap-2 relative z-10">
                                <span className="material-symbols-rounded">spa</span> 농산물 수확 입고 (Multi-Entry)
                            </h3>
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
                                                    <select
                                                        className="w-full h-11 pl-3 pr-8 rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-emerald-100 focus:border-emerald-300 appearance-none transition-all"
                                                        value={item.targetId}
                                                        onChange={e => updateHarvestItem(item.id, 'targetId', e.target.value)}
                                                    >
                                                        {products.filter(p => p.item_type === 'harvest_item' && p.status !== '단종상품').map(p => (
                                                            <option key={p.product_id} value={p.product_id}>
                                                                📦 {p.product_name}
                                                            </option>
                                                        ))}
                                                    </select>
                                                    <span className="material-symbols-rounded absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">expand_more</span>
                                                </div>
                                            </div>
                                            <div className="col-span-7 md:col-span-4">
                                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block ml-1">품질 등급</label>
                                                <div className="relative">
                                                    <select
                                                        className="w-full h-11 pl-3 pr-8 rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-600 outline-none focus:ring-2 focus:ring-emerald-100 focus:border-emerald-300 appearance-none transition-all"
                                                        value={item.grade}
                                                        onChange={e => updateHarvestItem(item.id, 'grade', e.target.value)}
                                                    >
                                                        <option value="A">A등급 (특상)</option>
                                                        <option value="B">B등급 (상)</option>
                                                        <option value="C">C등급 (보통)</option>
                                                        <option value="S">S등급 (가공)</option>
                                                    </select>
                                                    <span className="material-symbols-rounded absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">expand_more</span>
                                                </div>
                                            </div>
                                            <div className="col-span-5 md:col-span-3 flex items-center gap-2">
                                                <div className="flex-1">
                                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block ml-1 text-right">수량</label>
                                                    <div className="relative">
                                                        <input
                                                            type="number"
                                                            min="0"
                                                            step="any"
                                                            className="w-full h-11 rounded-xl border border-slate-200 bg-white text-right font-black text-lg text-emerald-600 pr-8 outline-none focus:ring-2 focus:ring-emerald-100 focus:border-emerald-300 transition-all placeholder:text-slate-200"
                                                            value={item.qty}
                                                            onChange={e => updateHarvestItem(item.id, 'qty', e.target.value)}
                                                            placeholder="0"
                                                        />
                                                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] font-bold text-slate-400">
                                                            kg
                                                        </span>
                                                    </div>
                                                </div>
                                                {harvestModal.items.length > 1 && (
                                                    <button
                                                        onClick={() => removeHarvestItem(item.id)}
                                                        className="mt-6 h-11 w-11 rounded-xl bg-slate-100 text-slate-400 hover:bg-rose-50 hover:text-rose-500 transition-all flex items-center justify-center shrink-0"
                                                    >
                                                        <span className="material-symbols-rounded text-lg">delete</span>
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))}

                                <button
                                    onClick={addHarvestItem}
                                    className="w-full py-3 rounded-xl border-2 border-dashed border-slate-200 text-slate-400 font-bold text-xs flex items-center justify-center gap-2 hover:bg-slate-50 hover:border-emerald-200 hover:text-emerald-500 transition-all"
                                >
                                    <span className="material-symbols-rounded text-base">add_circle</span> 수확 품목 추가
                                </button>
                            </div>

                            <div className="mt-8">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block ml-1 italic">수확 비고 (Harvest Memo)</label>
                                <textarea
                                    className="w-full h-20 p-3 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold text-slate-600 outline-none focus:ring-2 focus:ring-emerald-100 focus:border-emerald-300 transition-all resize-none"
                                    value={harvestModal.memo}
                                    onChange={e => setHarvestModal({ ...harvestModal, memo: e.target.value })}
                                    placeholder="상세 내용을 기록하세요."
                                />
                            </div>
                        </div>

                        <div className="p-6 bg-slate-50 border-t border-slate-100 shrink-0">
                            <div className="flex gap-3">
                                <button onClick={() => setHarvestModal({ ...harvestModal, open: false })} className="flex-1 h-12 rounded-xl bg-white border border-slate-200 text-slate-500 font-bold text-sm hover:bg-slate-100 transition-colors">취소</button>
                                <button onClick={handleHarvest} className="flex-1 h-12 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm shadow-lg shadow-emerald-200 transition-all flex items-center justify-center">
                                    수확 입고 완료
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Manual Adjust Modal */}
            {adjustModal.open && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md transition-opacity"></div>
                    <div className="bg-white rounded-[2rem] w-full max-w-[400px] shadow-2xl relative overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="bg-gradient-to-r from-orange-500 to-amber-600 p-6 text-white relative">
                            <span className="material-symbols-rounded absolute -right-6 -top-6 text-[120px] text-white/10 pointer-events-none">edit_note</span>
                            <h3 className="text-xl font-black flex items-center gap-2 relative z-10">
                                <span className="material-symbols-rounded">edit_note</span> 재고 직접 조정
                            </h3>
                            <p className="text-xs text-white/80 mt-1 relative z-10 font-bold">[{adjustModal.product?.product_name}] 수량을 수정합니다.</p>
                        </div>

                        <div className="p-8">
                            <div className="flex justify-between items-center mb-6 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                                <div className="text-center flex-1">
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">현재고</p>
                                    <p className="text-xl font-black text-slate-700">{formatCurrency(adjustModal.product?.stock_quantity || 0)}</p>
                                </div>
                                <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-sm">
                                    <span className="material-symbols-rounded text-slate-300">double_arrow</span>
                                </div>
                                <div className="text-center flex-1">
                                    <p className="text-[10px] font-black text-orange-500 uppercase tracking-widest mb-1">조정 후</p>
                                    <p className="text-xl font-black text-orange-600">{formatCurrency((adjustModal.product?.stock_quantity || 0) + (Number(adjustModal.val) || 0))}</p>
                                </div>
                            </div>

                            <div className="space-y-5">
                                <div>
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block ml-1">조정 수량 (+입고, -출고)</label>
                                    <div className="relative">
                                        <input
                                            type="number"
                                            className="w-full h-14 rounded-2xl border-2 border-slate-200 bg-white text-center font-black text-2xl text-slate-700 outline-none focus:border-orange-500 transition-all placeholder:text-slate-200"
                                            value={adjustModal.val}
                                            onChange={e => setAdjustModal({ ...adjustModal, val: e.target.value })}
                                            placeholder="0"
                                            autoFocus
                                        />
                                        <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">
                                            {adjustModal.product?.specification || '단위'}
                                        </div>
                                    </div>
                                </div>

                                <div>
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block ml-1">조정 사유 (Category)</label>
                                    <div className="relative">
                                        <select
                                            className="w-full h-12 pl-4 pr-10 rounded-xl border border-slate-200 bg-white font-bold text-sm text-slate-700 outline-none focus:ring-2 focus:ring-orange-100 focus:border-orange-400 appearance-none transition-all"
                                            value={adjustModal.reason}
                                            onChange={e => setAdjustModal({ ...adjustModal, reason: e.target.value })}
                                        >
                                            <option value="">일반 조정</option>
                                            <option value="폐기손실">폐기(손실)</option>
                                            <option value="마케팅증정">증정(마케팅)</option>
                                            <option value="재고입고">입고(구매)</option>
                                            <option value="자가소비">자가소비</option>
                                            <option value="상품생산">완제품생산용</option>
                                        </select>
                                        <span className="material-symbols-rounded absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">expand_more</span>
                                    </div>
                                </div>

                                <div>
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block ml-1">상세 비고 (Memo)</label>
                                    <textarea
                                        className="w-full h-20 p-4 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-600 outline-none focus:ring-2 focus:ring-orange-100 focus:border-orange-400 transition-all resize-none"
                                        value={adjustModal.memo}
                                        onChange={e => setAdjustModal({ ...adjustModal, memo: e.target.value })}
                                        placeholder="상세 내용을 입력하세요."
                                    />
                                </div>
                            </div>

                            <div className="flex gap-3 mt-8">
                                <button onClick={() => setAdjustModal({ ...adjustModal, open: false })} className="flex-1 h-14 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-500 font-black text-sm transition-colors">취소</button>
                                <button onClick={handleAdjustStock} className="flex-1 h-14 rounded-2xl bg-orange-500 hover:bg-orange-600 text-white font-black text-sm shadow-lg shadow-orange-200 transition-all hover:scale-[1.02] active:scale-95">저장 완료</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
};

export default SalesStock;

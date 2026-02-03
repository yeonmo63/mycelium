import React, { useState, useEffect, useMemo } from 'react';
import { formatCurrency, formatDateTime } from '../../utils/common';
import { useModal } from '../../contexts/ModalContext';

const SalesStock = () => {
    const { showAlert, showConfirm } = useModal();
    // --- State ---
    const [tab, setTab] = useState('product'); // 'product' | 'raw_material' | 'aux_material'
    const [products, setProducts] = useState([]);
    const [logs, setLogs] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [logSearchQuery, setLogSearchQuery] = useState('');
    const [hideAutoLogs, setHideAutoLogs] = useState(true);

    // Stock Conversion State (Processing/Packaging)
    const [convertModal, setConvertModal] = useState({
        open: false,
        sourceMaterialId: '', // Filter source
        targetId: '',
        qty: 1,
        deductions: [], // Array of { materialId, name, ratio, stock, tQty (theory), rQty (real), type }
        loading: false
    });
    // Harvest State (Raw Material In)
    const [harvestModal, setHarvestModal] = useState({ open: false, targetId: '', qty: '', memo: '' });

    const [freshnessMap, setFreshnessMap] = useState({}); // { [productId]: '2023-10-01T...' }
    const [pendingChanges, setPendingChanges] = useState({});

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

    // ... (inside render)

    // --- Actions ---
    const handleAddStockInput = (pid, val) => {
        setPendingChanges(prev => ({ ...prev, [pid]: { ...prev[pid], val } }));
    };

    const handleReasonChange = (pid, reason) => {
        setPendingChanges(prev => ({ ...prev, [pid]: { ...prev[pid], reason } }));
    };

    const handleSaveStock = async (product) => {
        const change = pendingChanges[product.product_id];
        const val = Number(change?.val);
        if (!change || val === 0) return;

        try {
            if (window.__TAURI__) {
                const memoText = val > 0 ? '재고 입고(수동)' : '재고 조정(수동)';
                const reason = change.reason || '';
                const fullMemo = reason ? `${memoText} - ${reason}` : memoText;

                await window.__TAURI__.core.invoke('adjust_product_stock', {
                    productId: product.product_id,
                    changeQty: val,
                    memo: fullMemo,
                    reasonCategory: reason || null
                });

                // Success Feedback
                // Clear input
                setPendingChanges(prev => {
                    const next = { ...prev };
                    delete next[product.product_id];
                    return next;
                });

                await loadData();
            }
        } catch (e) {
            showAlert("오류", "저장 실패: " + e);
        }
    };

    // --- Harvest Logic (New) ---
    const openHarvestModal = () => {
        // Filter only materials (raw or legacy material)
        const materials = products.filter(p => p.item_type === 'raw_material' || p.item_type === 'material');
        if (materials.length === 0) {
            showAlert("알림", "등록된 농산물(원물)이 없습니다.\n[환경 설정 > 상품 관리]에서 '원물(농산물)' 타입으로 품목을 등록해주세요.");
            return;
        }
        setHarvestModal({ open: true, targetId: materials[0].product_id, qty: '', memo: '' });
    };

    const handleHarvest = async () => {
        const { targetId, qty, memo } = harvestModal;
        if (!targetId) return showAlert("알림", "수확한 품목을 선택해주세요.");
        if (Number(qty) <= 0) return showAlert("알림", "수확량을 0보다 크게 입력해주세요.");

        try {
            if (window.__TAURI__) {
                await window.__TAURI__.core.invoke('adjust_product_stock', {
                    productId: Number(targetId),
                    changeQty: Number(qty),
                    memo: memo ? `수확 입고 - ${memo}` : '수확 입고',
                    reasonCategory: '수확'
                });
                await showAlert("완료", "수확 입고 처리가 완료되었습니다.");
                setHarvestModal({ ...harvestModal, open: false });
                loadData();
            }
        } catch (e) {
            showAlert("오류", "처리 실패: " + e);
        }
    };


    // --- Conversion Logic ---
    // --- Conversion Logic ---
    const openConvertModal = () => {
        // Show modal reset
        setConvertModal({ open: true, sourceMaterialId: '', targetId: '', qty: 1, deductions: [], loading: false });
    };

    // Load BOM when target changes
    useEffect(() => {
        if (!convertModal.open || !convertModal.targetId) return;

        const loadBOM = async () => {
            setConvertModal(prev => ({ ...prev, loading: true }));
            try {
                const targetId = Number(convertModal.targetId);
                let bomList = [];

                // 1. Try Fetch BOM
                if (window.__TAURI__) {
                    const boms = await window.__TAURI__.core.invoke('get_product_bom', { productId: targetId });
                    if (boms && boms.length > 0) {
                        bomList = boms.map(b => ({
                            materialId: b.material_id,
                            name: b.product_name,
                            ratio: b.ratio,
                            stock: b.stock_quantity,
                            type: b.item_type === 'aux_material' ? 'aux' : 'raw'
                        }));
                    }
                }

                // 2. Legacy Fallback
                if (bomList.length === 0) {
                    const product = products.find(p => p.product_id === targetId);
                    if (product) {
                        if (product.material_id) {
                            const m = products.find(x => x.product_id === product.material_id);
                            if (m) {
                                bomList.push({
                                    materialId: product.material_id,
                                    name: m.product_name,
                                    ratio: product.material_ratio || 1.0,
                                    stock: m.stock_quantity || 0,
                                    type: 'raw' // legacy default
                                });
                            }
                        }
                        if (product.aux_material_id) {
                            const a = products.find(x => x.product_id === product.aux_material_id);
                            if (a) {
                                bomList.push({
                                    materialId: product.aux_material_id,
                                    name: a.product_name,
                                    ratio: product.aux_material_ratio || 1.0,
                                    stock: a.stock_quantity || 0,
                                    type: 'aux'
                                });
                            }
                        }
                    }
                }

                // 3. Force include Source Material if selected in Step 1 but not in BOM
                if (convertModal.sourceMaterialId) {
                    const sid = Number(convertModal.sourceMaterialId);
                    if (!bomList.find(b => b.materialId === sid)) {
                        const smat = products.find(p => p.product_id === sid);
                        if (smat) {
                            bomList.push({
                                materialId: sid,
                                name: smat.product_name,
                                ratio: 0, // No default ratio known
                                stock: smat.stock_quantity || 0,
                                type: 'raw'
                            });
                        }
                    }
                }

                // 4. Init Deductions based on Qty 1
                const qty = Number(convertModal.qty) || 1;
                const deductions = bomList.map(b => ({
                    ...b,
                    tQty: Math.ceil(qty * b.ratio),
                    rQty: Math.ceil(qty * b.ratio)
                }));

                setConvertModal(prev => ({ ...prev, deductions, loading: false }));
            } catch (e) {
                console.error(e);
                setConvertModal(prev => ({ ...prev, loading: false }));
            }
        };
        loadBOM();
    }, [convertModal.targetId, convertModal.open]);

    // Recalculate when Qty changes
    const handleQtyChange = (newQty) => {
        const qty = Number(newQty);
        setConvertModal(prev => ({
            ...prev,
            qty: newQty,
            deductions: prev.deductions.map(d => {
                const needs = Math.ceil(qty * d.ratio);
                const isPrimarySource = prev.sourceMaterialId && d.materialId === Number(prev.sourceMaterialId);
                // If it's the primary source but has no ratio (forced), keep current rQty to prevent it becoming 0
                return {
                    ...d,
                    tQty: needs,
                    rQty: (isPrimarySource && (d.ratio || 0) <= 0) ? d.rQty : needs
                };
            })
        }));
    };

    const handleDeductionChange = (idx, val) => {
        setConvertModal(prev => {
            const next = [...prev.deductions];
            const newVal = Number(val);
            next[idx].rQty = newVal;

            // If this is the primary source material, update produce qty
            if (prev.sourceMaterialId && next[idx].materialId === Number(prev.sourceMaterialId)) {
                const ratio = next[idx].ratio || 1;
                const newProduceQty = ratio > 0 ? Math.floor(newVal / ratio) : prev.qty;

                // Update all other deductions based on new produce qty
                const updatedDeductions = next.map((d, i) => {
                    const needs = Math.ceil(newProduceQty * d.ratio);
                    return { ...d, tQty: needs, rQty: i === idx ? newVal : needs };
                });

                return { ...prev, qty: newProduceQty, deductions: updatedDeductions };
            }

            return { ...prev, deductions: next };
        });
    };

    const handleSourceQtySub = (val) => {
        const sourceQty = Number(val);
        const sourceMaterial = convertModal.deductions.find(d => d.materialId === Number(convertModal.sourceMaterialId));
        if (!sourceMaterial) return;

        const ratio = sourceMaterial.ratio || 1;
        const newProduceQty = ratio > 0 ? Math.floor(sourceQty / ratio) : convertModal.qty;

        setConvertModal(prev => ({
            ...prev,
            qty: newProduceQty,
            deductions: prev.deductions.map(d => {
                const needs = Math.ceil(newProduceQty * d.ratio);
                // Keep the manually entered source qty for the source material
                return {
                    ...d,
                    tQty: needs,
                    rQty: d.materialId === Number(prev.sourceMaterialId) ? sourceQty : needs
                };
            })
        }));
    };

    const handleConvert = async () => {
        const { targetId, qty, deductions } = convertModal;
        if (!targetId) return showAlert("알림", "생산할 품목을 선택해주세요.");
        if (Number(qty) <= 0) return showAlert("알림", "수량을 1개 이상 입력해주세요.");

        // Check Stock
        for (const d of deductions) {
            if (d.stock < d.rQty) {
                if (!await showConfirm("재고 부족", `${d.name} 재고가 부족합니다. (필요: ${d.rQty}, 보유: ${d.stock})\n그래도 진행하시겠습니까?`)) return;
            }
        }

        try {
            if (window.__TAURI__) {
                const deductInputs = deductions.map(d => ({
                    material_id: d.materialId,
                    quantity: d.rQty
                }));

                await window.__TAURI__.core.invoke('convert_stock_bom', {
                    productId: Number(targetId),
                    produceQty: Number(qty),
                    deductions: deductInputs,
                    memo: '완제품 전환 생산'
                });
                await showAlert("완료", "상품화(포장) 처리가 완료되었습니다.");
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
        if (tab === 'raw_material') {
            list = list.filter(p => p.item_type === 'raw_material' || p.item_type === 'material');
        } else if (tab === 'aux_material') {
            list = list.filter(p => p.item_type === 'aux_material');
        } else {
            // product
            list = list.filter(p => !p.item_type || p.item_type === 'product');
        }

        if (searchQuery) list = list.filter(p => p.product_name.toLowerCase().includes(searchQuery.toLowerCase()));
        return list;
    }, [products, tab, searchQuery]);

    const filteredLogs = useMemo(() => {
        let list = logs;
        if (hideAutoLogs) {
            list = list.filter(l => l.reference_id === 'MANUAL' || (l.change_type !== '출고' && l.change_type !== '취소반품'));
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
                            재고 관리 & Farm <span className="text-slate-300 font-light ml-1 text-xl">Stock Control</span>
                        </h1>
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
                                <button onClick={() => setTab('product')} className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${tab === 'product' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                                    <span className="material-symbols-rounded text-base">potted_plant</span> 완제품 (Product)
                                </button>
                                <button onClick={() => setTab('raw_material')} className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${tab === 'raw_material' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                                    <span className="material-symbols-rounded text-base">spa</span> 원물 (농산물)
                                </button>
                                <button onClick={() => setTab('aux_material')} className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${tab === 'aux_material' ? 'bg-white text-orange-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                                    <span className="material-symbols-rounded text-base">layers</span> 부자재 (포장재)
                                </button>
                            </div>

                            {/* Action Buttons based on Tab */}
                            <div className="flex gap-2">
                                {(tab === 'product' || tab === 'raw_material') && (
                                    <button onClick={openConvertModal} className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-md shadow-indigo-200 flex items-center gap-1.5 transition-all hover:scale-[1.02] active:scale-95 animate-in fade-in zoom-in duration-300">
                                        <span className="material-symbols-rounded text-base">inventory_2</span> 상품화 (포장/소분)
                                    </button>
                                )}
                                {tab === 'raw_material' && (
                                    <button onClick={openHarvestModal} className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md shadow-emerald-200 flex items-center gap-1.5 transition-all hover:scale-[1.02] active:scale-95 animate-in fade-in zoom-in duration-300">
                                        <span className="material-symbols-rounded text-base">spa</span> 수확 입고 (농산물)
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Search */}
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
                                    <th className="px-2 py-3 text-right w-[13%] border-b border-slate-100 bg-indigo-50/30 text-indigo-900">현재고</th>
                                    <th className="px-2 py-3 w-[12%] border-b border-slate-100 bg-orange-50/30 text-orange-900 border-l border-orange-100/50">수량 조정</th>
                                    <th className="px-2 py-3 w-[20%] border-b border-slate-100 bg-orange-50/30 text-orange-900">사유</th>
                                    <th className="px-2 py-3 text-right w-[12%] border-b border-slate-100 bg-emerald-50/30 text-emerald-900 border-l border-emerald-100/50">예상재고</th>
                                    <th className="px-2 py-3 text-center w-[6%] border-b border-slate-100">저장</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {filteredProducts.map((p, idx) => {
                                    const current = p.stock_quantity || 0;
                                    const change = pendingChanges[p.product_id] || { val: '', reason: '' };
                                    const changeVal = Number(change.val) || 0;
                                    const after = current + changeVal;
                                    const isLow = current <= (p.safety_stock || 10);
                                    const hasChange = changeVal !== 0;

                                    // Freshness Logic (Only for products and raw materials)
                                    const freshInfo = getFreshnessInfo(p.product_id);
                                    let freshBadge = null;
                                    const isMaterial = p.item_type === 'raw_material' || p.item_type === 'material';
                                    const isProduct = !p.item_type || p.item_type === 'product';

                                    if (current > 0 && freshInfo && (isMaterial || isProduct)) {
                                        const d = freshInfo.diffDays - 1; // Adjust displayed day count if needed, but keeping it consistent
                                        const displayDays = d < 0 ? 0 : d;

                                        if (d > 7) freshBadge = <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-black bg-red-100 text-red-600 animate-pulse">{isMaterial ? '수확' : '생산'} 후 {d}일 경과</span>;
                                        else if (d > 3) freshBadge = <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-black bg-orange-100 text-orange-600">판매 권장 ({d}일)</span>;
                                        else freshBadge = <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-black bg-emerald-100 text-emerald-600">신선 ({d}일)</span>;
                                    }

                                    return (
                                        <tr key={p.product_id} className="hover:bg-slate-50/80 transition-colors group">
                                            <td className="px-2 py-3 text-center text-slate-400 font-mono text-[10px]">{idx + 1}</td>
                                            <td className="px-2 py-3">
                                                <div className="flex flex-col justify-center h-full">
                                                    <div className="font-bold text-slate-700 truncate mb-0.5" title={p.product_name}>{p.product_name}</div>
                                                    {freshBadge}
                                                </div>
                                            </td>
                                            <td className="px-2 py-3 text-center text-slate-500 truncate">{p.specification || '-'}</td>

                                            {/* Current Stock */}
                                            <td className={`px-2 py-3 text-right font-black text-sm bg-indigo-50/10 ${isLow ? 'text-red-500' : 'text-slate-700'}`}>
                                                {formatCurrency(current)}
                                                {isLow && <span className="material-symbols-rounded text-sm align-middle ml-1 text-red-500 animate-pulse" title="안전재고 부족">error</span>}
                                            </td>

                                            {/* Adjust Input */}
                                            <td className="px-2 py-2 bg-orange-50/10 border-l border-orange-50">
                                                <input
                                                    type="number"
                                                    className={`w-full h-10 px-2 rounded-lg border text-right font-bold outline-none transition-all ${hasChange ? 'border-orange-300 bg-white ring-2 ring-orange-100' : 'border-slate-200 bg-white/50 focus:bg-white focus:border-orange-300'}`}
                                                    placeholder="0"
                                                    value={change.val || ''}
                                                    onChange={e => handleAddStockInput(p.product_id, e.target.value)}
                                                    onKeyDown={e => e.key === 'Enter' && handleSaveStock(p)}
                                                />
                                            </td>
                                            {/* Reason Select */}
                                            <td className="px-2 py-2 bg-orange-50/10">
                                                <select
                                                    className="w-full h-10 pl-1 pr-8 rounded-lg border border-slate-200 bg-white/50 text-xs text-slate-600 outline-none focus:border-orange-300 focus:bg-white cursor-pointer appearance-none bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIGZpbGw9Im5vbmUiIHZpZXdCb3g9IjAgMCAyNCAyNCIgc3Ryb2tlLXdpZHRoPSIxLjUiIHN0cm9rZT0iIzY0NzQ4YiIgY2xhc3M9InNpemUtNiI+PHBhdGggc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIiBkPSJtMTkuNSA4LjI1LTcuNSA3LjUtNy41LTcuNSIgLz48L3N2Zz4=')] bg-[length:16px_16px] bg-[right_8px_center] bg-no-repeat"
                                                    value={change.reason || ''}
                                                    onChange={e => handleReasonChange(p.product_id, e.target.value)}
                                                >
                                                    <option value="">일반조정</option>
                                                    <option value="상품생산">완제품생산</option>
                                                    <option value="폐기손실">폐기(손실)</option>
                                                    <option value="마케팅증정">증정(마케팅)</option>
                                                    <option value="재고입고">입고(구매)</option>
                                                    <option value="자가소비">자가소비</option>
                                                </select>
                                            </td>

                                            {/* After Stock */}
                                            <td className="px-2 py-3 text-right font-black text-sm text-emerald-600 bg-emerald-50/10 border-l border-emerald-50">
                                                {formatCurrency(after)}
                                            </td>
                                            {/* Save Btn */}
                                            <td className="px-2 py-2 text-center">
                                                <button
                                                    onClick={() => handleSaveStock(p)}
                                                    disabled={!hasChange}
                                                    className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${hasChange ? 'bg-indigo-600 text-white shadow-md hover:bg-indigo-700 hover:scale-105' : 'text-slate-200 bg-slate-100 cursor-not-allowed'}`}
                                                >
                                                    <span className="material-symbols-rounded text-lg">save</span>
                                                </button>
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
                                                else if (log.change_type === '수확') { typeColor = "bg-emerald-50 text-emerald-600 border-emerald-100"; typeIcon = "spa"; }
                                                else if (log.change_type === '취소반품') { typeColor = "bg-green-50 text-green-600 border-green-100"; typeIcon = "keyboard_return"; }
                                                else if (log.change_type === '상품생산') { typeColor = "bg-purple-50 text-purple-600 border-purple-100"; typeIcon = "inventory_2"; }

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

            {/* Conversion Modal (Product Tab) */}
            {convertModal.open && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity" onClick={() => setConvertModal({ ...convertModal, open: false })}></div>
                    <div className="bg-white rounded-2xl w-full max-w-[400px] shadow-2xl relative overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="bg-gradient-to-r from-indigo-500 to-purple-600 p-6 text-white relative overflow-hidden">
                            <span className="material-symbols-rounded absolute -right-6 -top-6 text-[120px] text-white/10 pointer-events-none">inventory_2</span>
                            <h3 className="text-lg font-black flex items-center gap-2 relative z-10">
                                <span className="material-symbols-rounded">inventory_2</span> 상품화 (포장/소분)
                            </h3>
                            <p className="text-xs text-white/80 mt-1 relative z-10 font-medium">농산물(원물) 및 부자재를 소모하여 완제품을 생산합니다.</p>
                        </div>

                        <div className="p-6">
                            <div className="mb-4">
                                <label className="text-xs font-bold text-slate-500 block mb-1.5 ml-1 italic text-emerald-600">Step 1. 사용될 원재료 (Source Material)</label>
                                <div className="relative">
                                    <select
                                        className="w-full h-11 pl-3 pr-8 rounded-xl border border-emerald-200 bg-emerald-50/30 text-sm font-bold text-emerald-700 outline-none focus:ring-2 focus:ring-emerald-100 focus:border-emerald-300 appearance-none transition-all"
                                        value={convertModal.sourceMaterialId}
                                        onChange={e => {
                                            const sid = e.target.value;
                                            setConvertModal(prev => ({
                                                ...prev,
                                                sourceMaterialId: sid,
                                                targetId: '', // Reset target when source changes
                                                deductions: []
                                            }));
                                        }}
                                    >
                                        <option value="">-- 원재료를 선택하세요 --</option>
                                        {products
                                            .filter(p => p.item_type === 'raw_material' || p.item_type === 'material')
                                            .map(p => (
                                                <option key={p.product_id} value={p.product_id}>{p.product_name} ({p.specification || '원본'})</option>
                                            ))
                                        }
                                    </select>
                                    <span className="material-symbols-rounded absolute right-3 top-1/2 -translate-y-1/2 text-emerald-400 pointer-events-none">spa</span>
                                </div>
                            </div>

                            <div className="mb-5">
                                <label className="text-xs font-bold text-slate-500 block mb-1.5 ml-1 italic text-indigo-600">Step 2. 생산할 품목 (Final Product)</label>
                                <div className="relative">
                                    <select
                                        className="w-full h-11 pl-3 pr-8 rounded-xl border border-indigo-200 bg-indigo-50/30 text-sm font-bold text-indigo-700 outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300 appearance-none transition-all"
                                        value={convertModal.targetId}
                                        onChange={e => setConvertModal({ ...convertModal, targetId: e.target.value })}
                                        disabled={!convertModal.sourceMaterialId}
                                    >
                                        <option value="">-- 완제품을 선택하세요 --</option>
                                        {products
                                            .filter(p => !p.item_type || p.item_type === 'product') // Only products
                                            .map(p => (
                                                <option key={p.product_id} value={p.product_id}>{p.product_name} ({p.specification})</option>
                                            ))
                                        }
                                    </select>
                                    <span className="material-symbols-rounded absolute right-3 top-1/2 -translate-y-1/2 text-indigo-400 pointer-events-none">inventory_2</span>
                                </div>
                                {!convertModal.sourceMaterialId && <p className="text-[10px] text-slate-400 mt-1 ml-1">* 원재료를 먼저 선택해 주세요.</p>}
                            </div>

                            {convertModal.targetId && (
                                <div className="mt-4 mb-6">
                                    <div className="flex items-center justify-between mb-2">
                                        <label className="text-xs font-bold text-slate-500">
                                            자재 소모 및 생산 설정
                                        </label>
                                        {convertModal.loading && <span className="text-[10px] text-indigo-500 animate-pulse">로딩중...</span>}
                                    </div>

                                    {/* Primary Source Input */}
                                    {convertModal.sourceMaterialId && convertModal.deductions.find(d => d.materialId === Number(convertModal.sourceMaterialId)) && (
                                        <div className="mb-4 p-4 bg-emerald-50 rounded-xl border border-emerald-100 shadow-inner">
                                            <div className="flex justify-between items-center mb-2">
                                                <label className="text-[10px] font-black text-emerald-700 uppercase tracking-wider italic">Step 3. 투입할 원물 수량</label>
                                                <span className="text-[10px] font-bold text-emerald-600">현재고: {formatCurrency(convertModal.deductions.find(d => d.materialId === Number(convertModal.sourceMaterialId))?.stock || 0)}</span>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <input
                                                    type="number"
                                                    className="flex-1 h-12 bg-white rounded-lg border-2 border-emerald-200 text-center font-black text-xl text-emerald-700 outline-none focus:border-emerald-500 transition-all"
                                                    value={convertModal.deductions.find(d => d.materialId === Number(convertModal.sourceMaterialId))?.rQty || ''}
                                                    onChange={e => handleSourceQtySub(e.target.value)}
                                                    placeholder="0"
                                                />
                                                <span className="text-sm font-black text-emerald-600">{products.find(p => p.product_id === Number(convertModal.sourceMaterialId))?.specification || '단위'}</span>
                                            </div>
                                            <p className="text-[9px] text-emerald-500 mt-2 ml-1">* 원물을 투입한 만큼 완제품 생산량이 자동 계산됩니다.</p>
                                        </div>
                                    )}

                                    <div className="bg-slate-50 rounded-xl border border-slate-200 overflow-hidden">
                                        {convertModal.deductions.length === 0 ? (
                                            <div className="p-4 text-center text-xs text-slate-400">
                                                연결된 자재(레시피)가 없습니다.
                                            </div>
                                        ) : (
                                            <div className="divide-y divide-slate-100">
                                                {convertModal.deductions.map((d, idx) => {
                                                    // Hide the primary source from this list as it's shown above? 
                                                    // No, let's keep it but maybe it's cleaner to show other materials here.
                                                    const isPrimarySource = d.materialId === Number(convertModal.sourceMaterialId);
                                                    const diff = d.rQty - d.tQty;
                                                    const isShort = d.stock < d.rQty;

                                                    if (isPrimarySource) return null; // Already shown in the highlight box

                                                    return (
                                                        <div key={idx} className="p-3">
                                                            <div className="flex justify-between items-start mb-2">
                                                                <div className="flex items-center gap-1.5">
                                                                    <span className={`w-2 h-2 rounded-full ${d.type === 'aux' ? 'bg-orange-400' : 'bg-emerald-500'}`}></span>
                                                                    <span className="text-xs font-black text-slate-700">{d.name}</span>
                                                                    <span className="text-[10px] text-slate-400">({d.ratio}배)</span>
                                                                </div>
                                                                <span className={`text-[10px] font-bold ${isShort ? 'text-red-500' : 'text-blue-600'}`}>
                                                                    보유: {formatCurrency(d.stock)}
                                                                </span>
                                                            </div>

                                                            <div className="flex items-center gap-3">
                                                                <div className="flex-1 flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-2 h-9">
                                                                    <span className="text-[10px] text-slate-400 shrink-0">소모</span>
                                                                    <input
                                                                        type="number"
                                                                        className="w-full text-right font-bold text-sm outline-none text-slate-700"
                                                                        value={d.rQty}
                                                                        onChange={e => handleDeductionChange(idx, e.target.value)}
                                                                    />
                                                                </div>
                                                                {diff !== 0 && (
                                                                    <div className={`text-[10px] font-bold px-2 py-1 rounded-full ${diff > 0 ? 'bg-red-50 text-red-500' : 'bg-blue-50 text-blue-600'}`}>
                                                                        {diff > 0 ? `+${diff} Loss` : `${diff} Save`}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            <div className="mb-6">
                                <label className="text-xs font-bold text-slate-500 block mb-1.5 ml-1 italic text-indigo-600">Step 4. 결과 완제품 생산량</label>
                                <div className="relative">
                                    <div className="flex gap-4">
                                        <div className="flex-1">
                                            <input
                                                type="number"
                                                min="1"
                                                className="w-full h-14 rounded-xl border-2 border-indigo-200 bg-white text-center font-black text-2xl text-indigo-600 outline-none focus:ring-4 focus:ring-indigo-50 focus:border-indigo-500 transition-all placeholder:text-slate-200"
                                                value={convertModal.qty}
                                                onChange={e => handleQtyChange(e.target.value)}
                                            />
                                        </div>
                                    </div>
                                    <p className="text-[9px] text-indigo-400 mt-2 ml-1 text-center">* 생산량을 직접 입력하면 그에 필요한 자재량이 자동 계산됩니다.</p>
                                </div>
                            </div>

                            <div className="flex gap-3">
                                <button onClick={() => setConvertModal({ ...convertModal, open: false })} className="flex-1 h-12 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-sm transition-colors">취소</button>
                                <button onClick={handleConvert} className="flex-1 h-12 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm shadow-lg shadow-indigo-200 transition-all hover:scale-[1.02] active:scale-95">생산 (포장) 완료</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Harvest Modal (Material Tab) */}
            {harvestModal.open && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity" onClick={() => setHarvestModal({ ...harvestModal, open: false })}></div>
                    <div className="bg-white rounded-2xl w-full max-w-[400px] shadow-2xl relative overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="bg-gradient-to-r from-emerald-500 to-teal-600 p-6 text-white relative overflow-hidden">
                            <span className="material-symbols-rounded absolute -right-6 -top-6 text-[120px] text-white/10 pointer-events-none">spa</span>
                            <h3 className="text-lg font-black flex items-center gap-2 relative z-10">
                                <span className="material-symbols-rounded">spa</span> 농산물 수확 (입고)
                            </h3>
                            <p className="text-xs text-white/80 mt-1 relative z-10 font-medium">당일 수확한 농산물을 원자재 창고에 등록합니다.</p>
                        </div>

                        <div className="p-6">
                            <div className="mb-5">
                                <label className="text-xs font-bold text-slate-500 block mb-1.5 ml-1">수확 품목 (원물)</label>
                                <div className="relative">
                                    <select
                                        className="w-full h-11 pl-3 pr-8 rounded-xl border border-slate-200 bg-slate-50 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-emerald-100 focus:border-emerald-300 appearance-none transition-all"
                                        value={harvestModal.targetId}
                                        onChange={e => setHarvestModal({ ...harvestModal, targetId: e.target.value })}
                                    >
                                        {products.filter(p => p.item_type === 'raw_material' || p.item_type === 'material').map(p => (
                                            <option key={p.product_id} value={p.product_id}>{p.product_name} ({p.specification || '규격없음'})</option>
                                        ))}
                                    </select>
                                    <span className="material-symbols-rounded absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">expand_more</span>
                                </div>
                            </div>

                            <div className="mb-5">
                                <label className="text-xs font-bold text-slate-500 block mb-1.5 ml-1">수확량 ({harvestModal.targetId && products.find(p => p.product_id === Number(harvestModal.targetId))?.specification || 'kg'})</label>
                                <div className="relative">
                                    <input
                                        type="number"
                                        min="1"
                                        className="w-full h-14 rounded-xl border border-slate-200 text-center font-black text-2xl text-emerald-600 outline-none focus:ring-4 focus:ring-emerald-50 focus:border-emerald-300 transition-all placeholder:text-slate-200"
                                        value={harvestModal.qty}
                                        onChange={e => setHarvestModal({ ...harvestModal, qty: e.target.value })}
                                        placeholder="0"
                                    />
                                </div>
                            </div>

                            <div className="mb-6">
                                <label className="text-xs font-bold text-slate-500 block mb-1.5 ml-1">메모 (선택)</label>
                                <input
                                    type="text"
                                    className="w-full h-11 px-3 rounded-xl border border-slate-200 text-sm font-medium outline-none focus:ring-2 focus:ring-emerald-100 focus:border-emerald-300 transition-all placeholder:text-slate-400"
                                    placeholder="예: 오전 수확분, 상태 최상 등"
                                    value={harvestModal.memo}
                                    onChange={e => setHarvestModal({ ...harvestModal, memo: e.target.value })}
                                />
                            </div>

                            <div className="flex gap-3">
                                <button onClick={() => setHarvestModal({ ...harvestModal, open: false })} className="flex-1 h-12 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-sm transition-colors">취소</button>
                                <button onClick={handleHarvest} className="flex-1 h-12 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm shadow-lg shadow-emerald-200 transition-all hover:scale-[1.02] active:scale-95">수확 등록</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
};

export default SalesStock;

import React, { useState, useEffect, useMemo } from 'react';
import { formatCurrency } from '../../utils/common';
import { useModal } from '../../contexts/ModalContext';

const SalesStock = () => {
    const { showAlert, showConfirm } = useModal();
    // --- State ---
    const [tab, setTab] = useState('product'); // 'product' | 'material'
    const [products, setProducts] = useState([]);
    const [logs, setLogs] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [hideAutoLogs, setHideAutoLogs] = useState(true);

    // Stock Conversion State (Processing/Packaging)
    const [convertModal, setConvertModal] = useState({ open: false, targetId: '', qty: 1 });
    // Harvest State (Raw Material In)
    const [harvestModal, setHarvestModal] = useState({ open: false, targetId: '', qty: '', memo: '' });

    const [pendingChanges, setPendingChanges] = useState({}); // { [productId]: value }

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

            // 2. Load Logs
            const logData = await window.__TAURI__.core.invoke('get_inventory_logs', {
                limit: 100,
                itemType: tab
            });
            setLogs(logData || []);
        } catch (e) {
            console.error(e);
        }
    };

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
        // Filter only materials
        const materials = products.filter(p => (p.item_type || 'product') === 'material');
        if (materials.length === 0) {
            showAlert("알림", "등록된 농산물(원물)이 없습니다.\n[환경 설정 > 상품 관리]에서 '원자재' 타입으로 품목을 등록해주세요.");
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
    const openConvertModal = () => {
        const targets = products.filter(p => p.material_id);
        if (targets.length === 0) {
            showAlert("알림", "자재가 연결된 완제품이 없습니다.\n[환경 설정 > 상품 관리]에서 자재를 먼저 연결해주세요.");
            return;
        }
        setConvertModal({ open: true, targetId: '', qty: 1 });
    };

    const handleConvert = async () => {
        const { targetId, qty } = convertModal;
        if (!targetId) return showAlert("알림", "생산할 품목을 선택해주세요.");
        if (qty <= 0) return showAlert("알림", "수량을 1개 이상 입력해주세요.");

        const product = products.find(p => p.product_id === Number(targetId));
        const material = products.find(p => p.product_id === product?.material_id);

        if (!material) {
            return showAlert("오류", "이 완제품에 연결된 자재 정보가 올바르지 않습니다.");
        }

        const needed = Math.ceil(qty * (product.material_ratio || 1.0));
        if (material.stock_quantity < needed) {
            if (!await showConfirm("재고 부족", `자재(${material.product_name})가 부족합니다. (필요: ${needed}, 현재: ${material.stock_quantity})\n그래도 진행하시겠습니까?`)) return;
        }

        try {
            if (window.__TAURI__) {
                await window.__TAURI__.core.invoke('convert_stock', {
                    materialId: material.product_id,
                    productId: Number(targetId),
                    convertQty: Number(qty),
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
        let list = products.filter(p => (p.item_type || 'product') === tab);
        if (searchQuery) list = list.filter(p => p.product_name.toLowerCase().includes(searchQuery.toLowerCase()));
        return list;
    }, [products, tab, searchQuery]);

    const filteredLogs = useMemo(() => {
        if (!hideAutoLogs) return logs;
        return logs.filter(l => l.reference_id === 'MANUAL' || (l.change_type !== '출고' && l.change_type !== '취소반품'));
    }, [logs, hideAutoLogs]);

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
                        <div className="flex gap-2">
                            <div className="flex bg-slate-100 p-1 rounded-xl">
                                <button onClick={() => setTab('product')} className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${tab === 'product' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                                    <span className="material-symbols-rounded text-base">potted_plant</span> 판매 상품(완제품)
                                </button>
                                <button onClick={() => setTab('material')} className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${tab === 'material' ? 'bg-white text-amber-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                                    <span className="material-symbols-rounded text-base">compost</span> 농산물(원물)
                                </button>
                            </div>

                            {/* Action Buttons based on Tab */}
                            {tab === 'product' && (
                                <button onClick={openConvertModal} className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-md shadow-indigo-200 flex items-center gap-1.5 transition-all hover:scale-[1.02] active:scale-95 animate-in fade-in zoom-in duration-300">
                                    <span className="material-symbols-rounded text-base">inventory_2</span> 상품화 (포장/소분)
                                </button>
                            )}
                            {tab === 'material' && (
                                <button onClick={openHarvestModal} className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md shadow-emerald-200 flex items-center gap-1.5 transition-all hover:scale-[1.02] active:scale-95 animate-in fade-in zoom-in duration-300">
                                    <span className="material-symbols-rounded text-base">spa</span> 수확 입고 (Harvest)
                                </button>
                            )}
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
                                    <th className="px-2 py-3 w-[20%] border-b border-slate-100">{tab === 'material' ? '농산물명' : '상품명'}</th>
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

                                    return (
                                        <tr key={p.product_id} className="hover:bg-slate-50/80 transition-colors group">
                                            <td className="px-2 py-3 text-center text-slate-400 font-mono text-[10px]">{idx + 1}</td>
                                            <td className="px-2 py-3 font-bold text-slate-700 truncate" title={p.product_name}>{p.product_name}</td>
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
                <div className="w-[380px] flex flex-col bg-white rounded-[1.5rem] shadow-sm border border-slate-200 overflow-hidden">
                    <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                        <h3 className="font-bold text-slate-700 text-sm flex items-center gap-2">
                            <span className="material-symbols-rounded text-base text-amber-500">history</span>
                            최근 {tab === 'material' ? '농산물 ' : '상품 '} 변동
                        </h3>
                        <div className="flex items-center gap-2">
                            <label className="flex items-center gap-1.5 cursor-pointer group">
                                <input type="checkbox" checked={hideAutoLogs} onChange={e => setHideAutoLogs(e.target.checked)} className="accent-indigo-600 w-3.5 h-3.5" />
                                <span className="text-[10px] font-bold text-slate-400 group-hover:text-slate-600 transition-colors">시스템 로그 숨김</span>
                            </label>
                            <button onClick={loadData} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-200 text-slate-400 hover:text-indigo-600 transition-all">
                                <span className="material-symbols-rounded text-lg">refresh</span>
                            </button>
                        </div>
                    </div>

                    <div className="flex-1 overflow-auto stylish-scrollbar p-0">
                        {filteredLogs.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-2">
                                <span className="material-symbols-rounded text-4xl text-slate-200">history_toggle_off</span>
                                <span className="text-xs font-medium">변동 내역이 없습니다.</span>
                            </div>
                        ) : (
                            <div className="divide-y divide-slate-100">
                                {filteredLogs.map((log, idx) => {
                                    const isPlus = log.change_quantity > 0;
                                    const isMinus = log.change_quantity < 0;
                                    const dateStr = log.created_at ? log.created_at.substring(5, 16).replace('T', ' ') : '-';

                                    return (
                                        <div key={idx} className="p-3 hover:bg-slate-50 transition-colors flex gap-3 items-start">
                                            <div className={`mt-0.5 w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${log.change_type === '입고' ? 'bg-blue-50 text-blue-600' :
                                                log.change_type === '출고' ? 'bg-red-50 text-red-600' :
                                                    log.change_type === '수확' ? 'bg-emerald-50 text-emerald-600' :
                                                        log.change_type === '취소반품' ? 'bg-green-50 text-green-600' :
                                                            'bg-slate-100 text-slate-500'
                                                }`}>
                                                <span className="material-symbols-rounded text-lg">
                                                    {log.change_type === '입고' ? 'login' :
                                                        log.change_type === '출고' ? 'logout' :
                                                            log.change_type === '수확' ? 'spa' : // Icon for Harvest
                                                                'sync_alt'}
                                                </span>
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex justify-between items-start">
                                                    <span className="text-xs font-bold text-slate-700 truncate">{log.product_name}</span>
                                                    <span className={`text-xs font-black ${isPlus ? 'text-blue-600' : 'text-red-500'}`}>
                                                        {isPlus ? '+' : ''}{formatCurrency(log.change_quantity)}
                                                    </span>
                                                </div>
                                                <div className="flex justify-between items-center mt-0.5">
                                                    <span className="text-[10px] text-slate-400 font-mono">{dateStr}</span>
                                                    <span className="text-[10px] text-slate-500 font-mono">재고: {formatCurrency(log.current_stock)}</span>
                                                </div>
                                                {log.memo && (
                                                    <div className="mt-1 text-[10px] text-slate-500 bg-slate-50 p-1 rounded border border-slate-100 truncate">
                                                        {log.memo}
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
                            <p className="text-xs text-white/80 mt-1 relative z-10 font-medium">농산물(원물)을 차감하고 완제품 재고를 생성합니다.</p>
                        </div>

                        <div className="p-6">
                            <div className="mb-5">
                                <label className="text-xs font-bold text-slate-500 block mb-1.5 ml-1">생산할 품목 (완제품)</label>
                                <div className="relative">
                                    <select
                                        className="w-full h-11 pl-3 pr-8 rounded-xl border border-slate-200 bg-slate-50 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300 appearance-none transition-all"
                                        value={convertModal.targetId}
                                        onChange={e => setConvertModal({ ...convertModal, targetId: e.target.value })}
                                    >
                                        <option value="">-- 품목을 선택해주세요 --</option>
                                        {products.filter(p => p.material_id).map(p => (
                                            <option key={p.product_id} value={p.product_id}>{p.product_name} ({p.specification})</option>
                                        ))}
                                    </select>
                                    <span className="material-symbols-rounded absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">expand_more</span>
                                </div>
                            </div>

                            {convertModal.targetId && (() => {
                                const p = products.find(x => x.product_id === Number(convertModal.targetId));
                                const m = products.find(x => x.product_id === p?.material_id);
                                return m ? (
                                    <div className="bg-slate-50 p-4 rounded-xl mb-5 border border-slate-200">
                                        <div className="flex justify-between items-center mb-1">
                                            <span className="text-xs font-bold text-slate-500">필요 농산물(원물)</span>
                                            <span className="text-xs font-black text-slate-700">{m.product_name} <span className="text-slate-400 font-normal">({p.material_ratio}개/EA)</span></span>
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <span className="text-xs font-bold text-slate-500">현재 원물 재고</span>
                                            <span className={`text-sm font-black ${m.stock_quantity <= 0 ? 'text-red-500' : 'text-blue-600'}`}>{formatCurrency(m.stock_quantity)}개 보유</span>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="bg-red-50 p-3 rounded-xl mb-5 text-xs text-red-500 font-bold text-center border border-red-100">
                                        연결된 원자재 정보가 없습니다.
                                    </div>
                                );
                            })()}

                            <div className="mb-6">
                                <label className="text-xs font-bold text-slate-500 block mb-1.5 ml-1">생산 수량 ({convertModal.targetId && products.find(p => p.product_id === Number(convertModal.targetId))?.specification || 'EA'})</label>
                                <div className="relative">
                                    <input
                                        type="number"
                                        min="1"
                                        className="w-full h-14 rounded-xl border border-slate-200 text-center font-black text-2xl text-indigo-600 outline-none focus:ring-4 focus:ring-indigo-50 focus:border-indigo-300 transition-all placeholder:text-slate-200"
                                        value={convertModal.qty}
                                        onChange={e => setConvertModal({ ...convertModal, qty: e.target.value })}
                                    />
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
                                        {products.filter(p => (p.item_type || 'product') === 'material').map(p => (
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

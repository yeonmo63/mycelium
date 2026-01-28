import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useModal } from '../../contexts/ModalContext';
import { formatCurrency, parseNumber } from '../../utils/common';

/**
 * FinancePurchase.jsx
 * 매입 등록 및 내역 관리
 * MushroomFarm의 기능을 포팅하고 CSI-Manager의 SalesReception 스타일을 적용함.
 */
const FinancePurchase = () => {
    // --- Custom Hooks ---
    const { showAlert, showConfirm } = useModal();

    // --- State Management ---
    const [purchases, setPurchases] = useState([]);
    const [products, setProducts] = useState([]);
    const [vendors, setVendors] = useState([]);

    // Filters
    const [filterStart, setFilterStart] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]);
    const [filterEnd, setFilterEnd] = useState(new Date().toISOString().split('T')[0]);
    const [filterVendor, setFilterVendor] = useState('');

    // Form Stats
    const initialFormState = {
        purchaseId: null, // null for new
        date: new Date().toISOString().split('T')[0],
        vendorId: '',
        itemName: '',
        spec: '',
        qty: 1,
        price: 0,
        total: 0,
        paymentStatus: '계좌이체',
        memo: '',

        // Inventory Logic
        linkProductId: '', // If set, inventory_synced is likely true
        isInventoryMode: false, // Toggle UI for inventory

        // Sync Manufacturing Logic
        isSyncMode: false,
        syncItems: [] // { product_id, quantity, product_name }
    };
    const [formState, setFormState] = useState(initialFormState);
    const [syncSearchQuery, setSyncSearchQuery] = useState('');
    const [suggestedProducts, setSuggestedProducts] = useState([]);

    // --- Data Loading ---
    const loadProducts = useCallback(async () => {
        try {
            if (!window.__TAURI__) return;
            // init_db_schema might be needed if it's the very first run, but usually main.rs handles it.
            // keeping it safe if mushroomfarm logic relied on it explicitly.
            const list = await window.__TAURI__.core.invoke('get_product_list');
            setProducts(list || []);
        } catch (e) {
            console.error("Product load error:", e);
        }
    }, []);

    const loadVendors = useCallback(async () => {
        try {
            if (!window.__TAURI__) return;
            const list = await window.__TAURI__.core.invoke('get_vendor_list');
            setVendors(list || []);
        } catch (e) {
            console.error("Vendor load error:", e);
        }
    }, []);

    const loadPurchases = useCallback(async () => {
        try {
            if (!window.__TAURI__) return;
            const list = await window.__TAURI__.core.invoke('get_purchase_list', {
                startDate: filterStart,
                endDate: filterEnd,
                vendorId: filterVendor ? parseInt(filterVendor) : null
            });
            setPurchases(list || []);
        } catch (e) {
            console.error("Purchase list load error:", e);
        }
    }, [filterStart, filterEnd, filterVendor]);

    useEffect(() => {
        loadProducts();
        loadVendors();
        loadPurchases();
    }, [loadProducts, loadVendors, loadPurchases]);

    // --- Handlers ---
    const handleFormChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormState(prev => {
            const next = { ...prev, [name]: type === 'checkbox' ? checked : value };

            // Auto Calculation
            if (name === 'qty' || name === 'price') {
                const q = name === 'qty' ? parseNumber(value) : prev.qty;
                const p = name === 'price' ? parseNumber(value) : prev.price;
                next.total = q * p;

                // Allow empty string for UX
                if (name === 'qty' && value === '') next.qty = '';
                if (name === 'price' && value === '') next.price = '';
            }

            // Inventory Mode Logic
            if (name === 'isInventoryMode' && !checked) {
                // If turning off inventory mode, clear related fields
                next.linkProductId = '';
                next.isSyncMode = false;
                next.syncItems = [];
            }

            // Sync Mode Logic
            if (name === 'isSyncMode') {
                if (checked && !prev.linkProductId) {
                    showAlert('알림', '먼저 "재고 입고 대상 품목"을 선택해주세요.');
                    return prev;
                }
                if (!checked) {
                    next.syncItems = [];
                } else {
                    // Try to suggest products based on item name
                    updateSuggestions(prev.itemName);
                }
            }

            // Link Product Logic
            if (name === 'linkProductId') {
                if (!value) {
                    next.isSyncMode = false;
                    next.syncItems = [];
                } else {
                    // Auto-fill item name if empty
                    if (!prev.itemName) {
                        const p = products.find(prod => String(prod.product_id) === String(value));
                        if (p) next.itemName = p.product_name;
                    }
                }
            }

            // Item Name Change -> Updates Suggestions if in sync mode
            if (name === 'itemName' && prev.isSyncMode) {
                updateSuggestions(value);
            }

            return next;
        });
    };

    const updateSuggestions = (keyword) => {
        if (!keyword) return;
        const regex = /(\d+\s*(kg|g|호|세트|종|입))/i;
        const match = keyword.match(regex);
        const searchKey = match ? match[0].toLowerCase() : keyword.toLowerCase();

        if (searchKey.length < 2) {
            setSuggestedProducts([]);
            return;
        }

        const filtered = products.filter(p =>
            (p.item_type === 'product') && (
                p.product_name.toLowerCase().includes(searchKey) ||
                (p.specification && p.specification.toLowerCase().includes(searchKey))
            )
        ).slice(0, 20);
        setSuggestedProducts(filtered);
    };

    const handleSyncSearch = (e) => {
        const val = e.target.value;
        setSyncSearchQuery(val);
        updateSuggestions(val);
    };

    const handleAddSyncItem = (product, qty) => {
        setFormState(prev => {
            const existing = prev.syncItems.find(item => item.product_id === product.product_id);
            if (existing) {
                return {
                    ...prev,
                    syncItems: prev.syncItems.map(item =>
                        item.product_id === product.product_id ? { ...item, quantity: qty } : item
                    )
                };
            } else {
                return {
                    ...prev,
                    syncItems: [...prev.syncItems, { product_id: product.product_id, quantity: qty, product_name: product.product_name }]
                };
            }
        });
    };

    const handleSave = async () => {
        if (!formState.itemName) { showAlert('알림', '품목명을 입력해주세요.'); return; }
        if (!formState.vendorId) { showAlert('알림', '공급처(거래처)를 선택해주세요.'); return; }

        try {
            const purchasePayload = {
                purchase_id: formState.purchaseId,
                vendor_id: parseInt(formState.vendorId),
                purchase_date: formState.date,
                item_name: formState.itemName,
                specification: formState.spec,
                quantity: Number(formState.qty) || 0,
                unit_price: Number(formState.price) || 0,
                total_amount: Number(formState.total) || 0,
                payment_status: formState.paymentStatus,
                memo: formState.memo,
                inventory_synced: formState.linkProductId ? true : false, // Logic from mushroomfarm
                material_item_id: formState.linkProductId ? parseInt(formState.linkProductId) : null
            };

            // inventorySyncData: Array of { product_id, quantity }
            let inventorySyncData = null;
            if (formState.isSyncMode && formState.syncItems.some(i => i.quantity > 0)) {
                inventorySyncData = formState.syncItems
                    .filter(i => i.quantity > 0)
                    .map(i => ({ product_id: i.product_id, quantity: Number(i.quantity) }));
            }

            await window.__TAURI__.core.invoke('save_purchase', {
                purchase: purchasePayload,
                inventorySyncData
            });

            await showAlert('성공', '매입 내역이 저장되었습니다.');
            handleReset();
            loadPurchases();
            loadProducts(); // Stock might have changed
        } catch (e) {
            showAlert('오류', `저장 실패: ${e}`);
        }
    };

    const handleReset = () => {
        setFormState(initialFormState);
        setSuggestedProducts([]);
        setSyncSearchQuery('');
    };

    const handleEdit = (p) => {
        setFormState({
            purchaseId: p.purchase_id,
            date: p.purchase_date,
            vendorId: p.vendor_id || '',
            itemName: p.item_name,
            spec: p.specification || '',
            qty: p.quantity,
            price: p.unit_price,
            total: p.total_amount,
            paymentStatus: p.payment_status,
            memo: p.memo || '',

            // Inventory Logic Restoration
            isInventoryMode: !!p.material_item_id,
            linkProductId: p.material_item_id || '',
            isSyncMode: false, // Reset sync mode on edit as per original logic (complex to restore fully without extra data)
            syncItems: []
        });
    };

    const handleDelete = async (id) => {
        if (await showConfirm('삭제', '이 매입 내역을 정말 삭제하시겠습니까?')) {
            try {
                await window.__TAURI__.core.invoke('delete_purchase', { id });
                loadPurchases();
            } catch (e) {
                showAlert('오류', `삭제 실패: ${e}`);
            }
        }
    };

    // Summary calculation
    const summary = useMemo(() => {
        const total = purchases.reduce((sum, p) => sum + p.total_amount, 0);
        const unpaid = purchases.filter(p => p.payment_status === '미지급').reduce((sum, p) => sum + p.total_amount, 0);
        return { total, unpaid };
    }, [purchases]);

    return (
        <div className="flex flex-col h-full bg-[#f8fafc] overflow-hidden animate-in fade-in duration-700">
            {/* Header Area */}
            <div className="px-6 lg:px-8 pt-6 lg:pt-8 pb-4">
                <div className="flex items-center gap-2 mb-1">
                    <span className="w-6 h-1 bg-violet-600 rounded-full"></span>
                    <span className="text-[9px] font-black tracking-[0.2em] text-violet-600 uppercase">Start Your Business</span>
                </div>
                <h1 className="text-3xl font-black text-slate-600 tracking-tighter" style={{ fontFamily: '"Noto Sans KR", sans-serif' }}>
                    매입 등록/내역 <span className="text-slate-300 font-light ml-1 text-xl">Purchase History</span>
                </h1>
            </div>

            <div className="flex flex-1 gap-6 px-6 lg:px-8 pb-6 min-h-0">
                {/* Left: Input Form */}
                <div className="w-[360px] flex flex-col gap-4 h-full">
                    <div className="bg-white rounded-[1.5rem] p-5 border border-slate-200 shadow-sm relative group overflow-hidden flex flex-col flex-1 h-full">
                        <div className="absolute top-0 right-0 w-24 h-full bg-violet-50/50 -skew-x-12 translate-x-12 transition-transform group-hover:translate-x-6" />

                        <div className="flex items-center gap-2 mb-4 relative z-10 shrink-0">
                            <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center text-violet-600">
                                <span className="material-symbols-rounded">edit_square</span>
                            </div>
                            <h3 className="text-lg font-bold text-slate-700">매입 정보 입력</h3>
                        </div>

                        <div className="flex flex-col gap-3 relative z-10 overflow-y-auto flex-1 px-1 custom-scrollbar">
                            <div>
                                <label className="text-[11px] font-bold text-slate-500 uppercase ml-1 mb-1 block">매입 일자</label>
                                <input type="date" name="date" value={formState.date} onChange={handleFormChange}
                                    className="w-full h-10 rounded-xl bg-slate-50 border-slate-200 text-slate-800 font-bold focus:ring-2 focus:ring-violet-500 transition-all px-3" />
                            </div>

                            <div>
                                <label className="text-[11px] font-bold text-slate-500 uppercase ml-1 mb-1 block">공급처 (거래처)</label>
                                <div className="relative">
                                    <select name="vendorId" value={formState.vendorId} onChange={handleFormChange}
                                        className="w-full h-10 rounded-xl bg-white border-slate-200 text-slate-800 font-bold focus:ring-2 focus:ring-violet-500 transition-all px-3 appearance-none">
                                        <option value="">거래처 선택</option>
                                        {vendors.map(v => <option key={v.vendor_id} value={v.vendor_id}>{v.vendor_name}</option>)}
                                    </select>
                                    <span className="material-symbols-rounded absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">unfold_more</span>
                                </div>
                            </div>

                            <div>
                                <label className="text-[11px] font-bold text-slate-500 uppercase ml-1 mb-1 block">품목명 (지출 항목)</label>
                                <input type="text" name="itemName" value={formState.itemName} onChange={handleFormChange} placeholder="예: 택배 박스 5kg용"
                                    className="w-full h-10 rounded-xl bg-white border-slate-200 text-slate-800 font-bold focus:ring-2 focus:ring-violet-500 transition-all px-3" />
                            </div>

                            <div>
                                <label className="text-[11px] font-bold text-slate-500 uppercase ml-1 mb-1 block">규격 (선택)</label>
                                <input type="text" name="spec" value={formState.spec} onChange={handleFormChange}
                                    className="w-full h-10 rounded-xl bg-white border-slate-200 text-slate-800 font-bold focus:ring-2 focus:ring-violet-500 transition-all px-3" />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-[11px] font-bold text-slate-500 uppercase ml-1 mb-1 block">수량</label>
                                    <input type="text" name="qty" value={formatCurrency(formState.qty)} onChange={handleFormChange}
                                        className="w-full h-10 rounded-xl bg-white border-slate-200 text-slate-800 font-bold text-right focus:ring-2 focus:ring-violet-500 transition-all px-3" />
                                </div>
                                <div>
                                    <label className="text-[11px] font-bold text-slate-500 uppercase ml-1 mb-1 block">단가</label>
                                    <input type="text" name="price" value={formatCurrency(formState.price)} onChange={handleFormChange}
                                        className="w-full h-10 rounded-xl bg-white border-slate-200 text-slate-800 font-bold text-right focus:ring-2 focus:ring-violet-500 transition-all px-3" />
                                </div>
                            </div>

                            <div>
                                <label className="text-[11px] font-bold text-violet-600 uppercase ml-1 mb-1 block">총 금액</label>
                                <input type="text" value={formatCurrency(formState.total)} readOnly
                                    className="w-full h-10 rounded-xl bg-violet-50 border-none text-violet-700 font-black text-right px-4" />
                            </div>

                            <div>
                                <label className="text-[11px] font-bold text-slate-500 uppercase ml-1 mb-1 block">결제 상태</label>
                                <select name="paymentStatus" value={formState.paymentStatus} onChange={handleFormChange}
                                    className="w-full h-10 rounded-xl bg-white border-slate-200 text-slate-800 font-bold focus:ring-2 focus:ring-violet-500 transition-all px-3">
                                    <option value="계좌이체">계좌이체</option>
                                    <option value="미지급">미지급(외상)</option>
                                    <option value="현금">현금</option>
                                    <option value="카드">카드</option>
                                </select>
                            </div>

                            {/* Inventory Toggle */}
                            <div className="mt-2 bg-slate-50 rounded-xl p-3 border border-slate-200">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-xs font-bold text-slate-600 flex items-center gap-1">
                                        <span className="material-symbols-rounded text-sm">inventory_2</span> 창고 재고 입고
                                    </span>
                                    <label className="relative inline-flex items-center cursor-pointer">
                                        <input type="checkbox" name="isInventoryMode" checked={formState.isInventoryMode} onChange={handleFormChange} className="sr-only peer" />
                                        <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-violet-600"></div>
                                    </label>
                                </div>

                                {formState.isInventoryMode && (
                                    <div className="flex flex-col gap-3 animate-in fade-in slide-in-from-top-2 duration-300">
                                        <div>
                                            <select name="linkProductId" value={formState.linkProductId} onChange={handleFormChange}
                                                className="w-full h-9 rounded-lg border-orange-200 bg-orange-50 text-xs font-bold text-orange-800 focus:ring-2 focus:ring-orange-400">
                                                <option value="">재고 연동 안함 (일반 지출)</option>
                                                {products.filter(p => p.item_type === 'material').map(p => (
                                                    <option key={p.product_id} value={p.product_id}>
                                                        {p.product_name} {p.specification ? `(${p.specification})` : ''}
                                                    </option>
                                                ))}
                                            </select>
                                            <p className="text-[10px] text-orange-600 mt-1 ml-1">* 선택 시 해당 원자재 재고가 증가합니다.</p>
                                        </div>

                                        {/* Sync Finished Goods Toggle */}
                                        <div className="pt-2 border-t border-dashed border-slate-300">
                                            <label className="flex items-center gap-2 cursor-pointer mb-2">
                                                <input type="checkbox" name="isSyncMode" checked={formState.isSyncMode} onChange={handleFormChange}
                                                    className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 border-gray-300" />
                                                <span className="text-xs font-bold text-blue-600">완제품(버섯) 포장 완료 처리</span>
                                            </label>

                                            {formState.isSyncMode && (
                                                <div className="bg-blue-50/50 rounded-lg p-2 border border-blue-100">
                                                    <input type="text" value={syncSearchQuery} onChange={handleSyncSearch} placeholder="완제품명 검색..."
                                                        className="w-full h-8 rounded border-blue-200 text-xs mb-2 px-2 focus:ring-1 focus:ring-blue-400" />

                                                    <div className="max-h-[150px] overflow-y-auto flex flex-col gap-1">
                                                        {suggestedProducts.length === 0 ? (
                                                            <p className="text-[10px] text-slate-400 text-center py-2">검색 결과가 없습니다.</p>
                                                        ) : (
                                                            suggestedProducts.map(p => {
                                                                const currentQty = formState.syncItems.find(i => i.product_id === p.product_id)?.quantity || '';
                                                                return (
                                                                    <div key={p.product_id} className="flex items-center justify-between bg-white px-2 py-1.5 rounded border border-blue-100">
                                                                        <span className="text-xs font-medium truncate flex-1">{p.product_name}</span>
                                                                        <input type="number" placeholder="수량" value={currentQty}
                                                                            onChange={e => handleAddSyncItem(p, e.target.value)}
                                                                            className="w-16 h-6 text-right text-xs border border-slate-200 rounded px-1 focus:border-blue-500 outline-none" />
                                                                    </div>
                                                                );
                                                            })
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div>
                                <label className="text-[11px] font-bold text-slate-500 uppercase ml-1 mb-1 block">메모</label>
                                <textarea name="memo" value={formState.memo} onChange={handleFormChange}
                                    className="w-full h-20 rounded-xl bg-white border-slate-200 text-slate-800 text-sm p-3 focus:ring-2 focus:ring-violet-500 transition-all resize-none"></textarea>
                            </div>

                            <div className="flex gap-2 mt-2">
                                <button onClick={handleSave} className="flex-1 h-11 bg-violet-600 hover:bg-violet-700 text-white rounded-xl font-bold shadow-lg shadow-violet-200 transition-all flex items-center justify-center gap-2">
                                    <span className="material-symbols-rounded">save</span> 저장하기
                                </button>
                                <button onClick={handleReset} className="w-12 h-11 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl flex items-center justify-center transition-all">
                                    <span className="material-symbols-rounded">restart_alt</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right: List & Table */}
                <div className="flex-1 flex flex-col min-w-0 gap-4">
                    {/* Filter Bar */}
                    <div className="bg-white rounded-[1.5rem] p-4 border border-slate-200 shadow-sm flex flex-wrap items-center gap-3">
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 rounded-lg border border-slate-200">
                            <span className="material-symbols-rounded text-slate-400 text-[18px]">calendar_today</span>
                            <input type="date" value={filterStart} onChange={e => setFilterStart(e.target.value)} className="bg-transparent text-sm font-bold text-slate-600 outline-none w-28" />
                            <span className="text-slate-400">~</span>
                            <input type="date" value={filterEnd} onChange={e => setFilterEnd(e.target.value)} className="bg-transparent text-sm font-bold text-slate-600 outline-none w-28" />
                        </div>

                        <select value={filterVendor} onChange={e => setFilterVendor(e.target.value)}
                            className="h-10 rounded-lg border-slate-200 text-sm font-bold text-slate-600 w-40">
                            <option value="">모든 거래처</option>
                            {vendors.map(v => <option key={v.vendor_id} value={v.vendor_id}>{v.vendor_name}</option>)}
                        </select>

                        <button onClick={loadPurchases} className="h-10 px-4 bg-slate-800 text-white rounded-lg font-bold hover:bg-slate-700 transition-colors flex items-center gap-2 text-sm">
                            <span className="material-symbols-rounded text-[18px]">search</span> 조회
                        </button>

                        <div className="ml-auto flex items-center gap-6">
                            <div className="text-right">
                                <span className="text-[10px] font-bold text-slate-400 uppercase block">검색 합계</span>
                                <span className="text-lg font-black text-slate-800">{formatCurrency(summary.total)}원</span>
                            </div>
                            <div className="text-right pl-6 border-l border-slate-200">
                                <span className="text-[10px] font-bold text-red-400 uppercase block">미지급 합계</span>
                                <span className="text-lg font-black text-red-500">{formatCurrency(summary.unpaid)}원</span>
                            </div>
                        </div>
                    </div>

                    {/* Table */}
                    <div className="flex-1 bg-white rounded-[1.5rem] border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                        <div className="flex-1 overflow-y-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-slate-50 sticky top-0 z-10 shadow-sm">
                                    <tr className="text-slate-500 border-b border-slate-200">
                                        <th className="py-3 px-4 font-bold whitespace-nowrap">일자</th>
                                        <th className="py-3 px-4 font-bold whitespace-nowrap">공급처</th>
                                        <th className="py-3 px-4 font-bold whitespace-nowrap w-1/3">품목명</th>
                                        <th className="py-3 px-4 font-bold whitespace-nowrap text-center">수량</th>
                                        <th className="py-3 px-4 font-bold whitespace-nowrap text-right">총 금액</th>
                                        <th className="py-3 px-4 font-bold whitespace-nowrap text-center">결제</th>
                                        <th className="py-3 px-4 font-bold whitespace-nowrap text-center">관리</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {purchases.map(p => (
                                        <tr key={p.purchase_id} onClick={() => handleEdit(p)} className="hover:bg-violet-50/50 cursor-pointer transition-colors group">
                                            <td className="py-3 px-4 font-medium text-slate-600">{p.purchase_date}</td>
                                            <td className="py-3 px-4 font-bold text-slate-700">{p.vendor_name || '-'}</td>
                                            <td className="py-3 px-4">
                                                <div className="font-bold text-slate-800">{p.item_name}</div>
                                                {p.specification && <div className="text-xs text-slate-500">({p.specification})</div>}
                                            </td>
                                            <td className="py-3 px-4 text-center font-medium text-slate-600">{formatCurrency(p.quantity)}</td>
                                            <td className="py-3 px-4 text-right font-bold text-slate-800">{formatCurrency(p.total_amount)}원</td>
                                            <td className="py-3 px-4 text-center">
                                                <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold border ${p.payment_status === '미지급'
                                                    ? 'bg-red-50 text-red-600 border-red-200'
                                                    : 'bg-green-50 text-green-600 border-green-200'
                                                    }`}>
                                                    {p.payment_status}
                                                </span>
                                            </td>
                                            <td className="py-3 px-4 text-center">
                                                <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button onClick={(e) => { e.stopPropagation(); handleDelete(p.purchase_id); }}
                                                        className="w-8 h-8 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500 flex items-center justify-center transition-colors">
                                                        <span className="material-symbols-rounded text-lg">delete</span>
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                    {purchases.length === 0 && (
                                        <tr>
                                            <td colspan="7" className="py-12 text-center text-slate-400 font-medium">매입 내역이 없습니다.</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default FinancePurchase;

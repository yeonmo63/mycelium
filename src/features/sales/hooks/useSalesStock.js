import { useState, useEffect, useMemo } from 'react';

export const useSalesStock = (showAlert, showConfirm) => {
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
        primaryMaterialId: '',
        targets: [{ id: Date.now(), productId: '', qty: 1 }],
        deductions: [],
        memo: '',
        loading: false
    });

    // Harvest State (Raw Material / Product In)
    const [harvestModal, setHarvestModal] = useState({
        open: false,
        items: [{ id: Date.now(), targetId: '', qty: '', grade: 'A' }],
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

    const [freshnessMap, setFreshnessMap] = useState({});

    // --- Effects ---
    useEffect(() => {
        loadData();
    }, [tab]);

    const loadData = async () => {
        if (!window.__TAURI__) return;
        try {
            const list = await window.__TAURI__.core.invoke('get_product_list');
            setProducts(list || []);

            const freshData = await window.__TAURI__.core.invoke('get_product_freshness');
            const fMap = {};
            if (freshData) {
                freshData.forEach(item => {
                    fMap[item.product_id] = item.last_in_date;
                });
            }
            setFreshnessMap(fMap);

            const logData = await window.__TAURI__.core.invoke('get_inventory_logs', {
                limit: 100,
                itemType: tab
            });
            setLogs(logData || []);
        } catch (e) {
            console.error(e);
        }
    };

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

                setAdjustModal(prev => ({ ...prev, open: false }));
                await loadData();
            }
        } catch (e) {
            showAlert("오류", "저장 실패: " + e);
        }
    };

    const openHarvestModal = (specificId) => {
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

    const handleHarvest = async () => {
        const { items, memo } = harvestModal;
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
                setHarvestModal(prev => ({ ...prev, open: false }));
                loadData();
            }
        } catch (e) {
            showAlert("오류", "처리 실패: " + e);
        }
    };

    const openConvertModal = (initialId = '') => {
        const prodId = initialId ? Number(initialId) : null;
        let initialTargets = [{ id: Date.now(), productId: '', qty: 1 }];
        let initialDeductions = [];
        let primaryId = '';

        if (prodId) {
            const prod = products.find(p => p.product_id === prodId);
            if (prod) {
                const isProduct = !prod.item_type || prod.item_type === 'product';
                if (isProduct) {
                    initialTargets = [{ id: Date.now(), productId: String(prodId), qty: 1 }];
                } else {
                    initialDeductions = [{
                        id: Date.now(),
                        materialId: prodId,
                        name: prod.product_name,
                        stock: prod.stock_quantity || 0,
                        tQty: 0,
                        rQty: 1,
                        type: 'raw'
                    }];
                    primaryId = String(prodId);
                }
            }
        }

        setConvertModal({
            open: true,
            primaryMaterialId: primaryId,
            targets: initialTargets,
            deductions: initialDeductions,
            memo: '',
            loading: false
        });
    };

    const handleBatchConvert = async () => {
        const { targets, deductions, memo } = convertModal;
        const validTargets = targets.filter(t => t.productId && Number(t.qty) > 0);
        const validDeductions = deductions.filter(d => d.materialId && Number(d.rQty) > 0);

        if (validTargets.length === 0) return showAlert("알림", "생산할 품목을 1개 이상 선택해주세요.");

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
                setConvertModal(prev => ({ ...prev, open: false }));
                loadData();
            }
        } catch (e) {
            showAlert("오류", "처리 실패: " + e);
        }
    };

    // Derived Data
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
            list = list.filter(p => !p.item_type || p.item_type === 'product');
        }

        if (searchQuery) list = list.filter(p => p.product_name.toLowerCase().includes(searchQuery.toLowerCase()));
        return list;
    }, [products, tab, searchQuery, auxSubTab]);

    const filteredLogs = useMemo(() => {
        let list = logs;
        if (hideAutoLogs) {
            // Filter logic
            // ... (keep existing logic)
            // Ideally we should just return list based on hideAutoLogs
            if (hideAutoLogs) {
                return logs.filter(l => !l.reference_id?.startsWith('SALES_AUTO'));
            }
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

    // BOM Modal
    const [bomModal, setBomModal] = useState({
        open: false,
        product: null
    });

    const openBomModal = (product) => {
        setBomModal({
            open: true,
            product
        });
    };

    return {
        tab, setTab,
        products, setProducts,
        logs, setLogs,
        searchQuery, setSearchQuery,
        logSearchQuery, setLogSearchQuery,
        hideAutoLogs, setHideAutoLogs,
        auxSubTab, setAuxSubTab,
        convertModal, setConvertModal,
        harvestModal, setHarvestModal,
        adjustModal, setAdjustModal,
        freshnessMap,
        loadData,
        getFreshnessInfo,
        filteredProducts,
        filteredLogs,
        openAdjustModal,
        handleAdjustStock,
        openHarvestModal,
        handleHarvest,
        openHarvestModal,
        handleHarvest,
        openConvertModal,
        handleBatchConvert,
        bomModal, setBomModal,
        openBomModal
    };
};

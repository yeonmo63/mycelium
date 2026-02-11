import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { formatDate, parseNumber, formatPhoneNumber } from '../../../utils/common';

export const useSalesReception = (showAlert, showConfirm) => {
    // --- State Management ---
    const [orderDate, setOrderDate] = useState(formatDate(new Date()));
    const [customer, setCustomer] = useState(null);
    const [addresses, setAddresses] = useState([]);
    const [products, setProducts] = useState([]);
    const [salesRows, setSalesRows] = useState([]);
    const [deletedSalesIds, setDeletedSalesIds] = useState([]);
    const [editingTempId, setEditingTempId] = useState(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [isDirty, setIsDirty] = useState(false);
    const [companyInfo, setCompanyInfo] = useState(null);
    const [isDraftRestored, setIsDraftRestored] = useState(false);

    // Form Input State
    const initialInputState = {
        product: '',
        spec: '',
        qty: 1,
        price: '',
        discountRate: 0,
        amount: 0,
        shipType: 'basic',
        shipZip: '',
        shipAddr1: '',
        shipAddr2: '',
        shipName: '',
        shipMobile: '',
        shipMemo: '',
        isSaveAddr: true
    };
    const [inputState, setInputState] = useState(initialInputState);

    // --- Helpers ---
    const calculateAmount = useCallback((qty, price, discount) => {
        const q = Number(qty) || 0;
        const p = typeof price === 'string' ? parseNumber(price) : Number(price) || 0;
        const d = Number(discount) || 0;
        let total = q * p * (1 - d / 100);
        total = Math.floor(total / 10) * 10;
        return total;
    }, []);

    // --- Loading Logic ---
    const loadCompanyInfo = useCallback(async () => {
        try {
            if (!window.__TAURI__) return;
            const info = await window.__TAURI__.core.invoke('get_company_info');
            setCompanyInfo(info);
        } catch (e) {
            console.error(e);
        }
    }, []);

    const loadProducts = useCallback(async () => {
        try {
            if (!window.__TAURI__) return;
            const list = await window.__TAURI__.core.invoke('get_product_list');
            setProducts(list.filter(p => (p.item_type || 'product') === 'product') || []);
        } catch (e) {
            console.error(e);
        }
    }, []);

    const loadSalesHistory = useCallback(async (cid, date) => {
        try {
            if (!window.__TAURI__) return;
            const history = await window.__TAURI__.core.invoke('get_customer_sales_on_date', {
                customerId: String(cid),
                date
            });
            const rows = history.map(s => ({
                id: s.sales_id,
                tempId: s.sales_id,
                product: s.product_name,
                spec: s.specification,
                qty: s.quantity,
                price: s.unit_price,
                discountRate: s.discount_rate || 0,
                amount: s.total_amount,
                supplyValue: s.supply_value,
                vatAmount: s.vat_amount,
                status: s.status,
                shipName: s.shipping_name || '',
                shipZip: s.shipping_zip_code || '',
                shipAddr1: s.shipping_address_primary || '',
                shipAddr2: s.shipping_address_detail || '',
                shipMobile: s.shipping_mobile_number || '',
                shipMemo: s.memo || '',
                isDirty: false
            }));
            setSalesRows(rows.reverse());
            setDeletedSalesIds([]);
            setIsDirty(false);
        } catch (e) {
            console.error(e);
        }
    }, []);

    // --- Draft Logic ---
    const [tempDraft, setTempDraft] = useState(null);

    useEffect(() => {
        const draft = localStorage.getItem('mycelium_draft_reception');
        if (draft) {
            try {
                const parsed = JSON.parse(draft);
                if (parsed.salesRows?.length > 0 || parsed.customer) {
                    setTempDraft(parsed);
                }
            } catch (e) {
                console.error(e);
            }
        }
    }, []);

    const handleRestoreDraft = () => {
        if (!tempDraft) return;
        setCustomer(tempDraft.customer);
        setOrderDate(tempDraft.orderDate || formatDate(new Date()));
        setSalesRows(tempDraft.salesRows || []);
        setDeletedSalesIds(tempDraft.deletedSalesIds || []);
        setInputState(prev => ({ ...prev, ...tempDraft.inputState }));
        setIsDirty(true);
        setIsDraftRestored(true);
        setTempDraft(null);
    };

    const handleDiscardDraft = () => {
        clearDraft();
        setTempDraft(null);
    };

    useEffect(() => {
        if (isDirty || salesRows.length > 0 || customer) {
            const draftData = { customer, orderDate, salesRows, deletedSalesIds, inputState };
            localStorage.setItem('mycelium_draft_reception', JSON.stringify(draftData));
        }
    }, [customer, orderDate, salesRows, deletedSalesIds, inputState, isDirty]);

    const clearDraft = () => {
        localStorage.removeItem('mycelium_draft_reception');
        setIsDraftRestored(false);
    };

    // --- Actions ---
    const selectCustomer = async (cust) => {
        setCustomer(cust);
        try {
            const addrs = await window.__TAURI__.core.invoke('get_customer_addresses', { customerId: cust.customer_id });
            setAddresses(addrs || []);
            const defAddr = addrs.find(a => a.is_default) || addrs[0];
            if (defAddr) fillShippingFromAddress(defAddr, cust);
            else fillShippingFromCustomer(cust);
        } catch (e) {
            fillShippingFromCustomer(cust);
        }
    };

    const fillShippingFromAddress = (addr, cust) => {
        setInputState(prev => ({
            ...prev,
            shipType: `addr_${addr.address_id}`,
            shipZip: addr.zip_code || '',
            shipAddr1: addr.address_primary || '',
            shipAddr2: addr.address_detail || '',
            shipName: addr.recipient_name || cust.customer_name,
            shipMobile: addr.mobile_number || cust.mobile_number || '',
            shipMemo: addr.shipping_memo || ''
        }));
    };

    const fillShippingFromCustomer = (cust) => {
        setInputState(prev => ({
            ...prev,
            shipType: 'basic',
            shipZip: cust.zip_code || '',
            shipAddr1: cust.address_primary || '',
            shipAddr2: cust.address_detail || '',
            shipName: cust.customer_name,
            shipMobile: cust.mobile_number || '',
            shipMemo: ''
        }));
    };

    const handleInputChange = (e) => {
        const { name, value, type, checked } = e.target;
        setInputState(prev => {
            let next = { ...prev, [name]: type === 'checkbox' ? checked : value };
            if (name === 'product') {
                const f = products.find(p => p.product_name === value);
                if (f) { next.spec = f.specification || ''; next.price = f.unit_price; }
            }
            if (['product', 'qty', 'price', 'discountRate'].includes(name)) {
                next.amount = calculateAmount(next.qty, next.price, next.discountRate);
            }
            if (name === 'shipType') {
                if (value === 'new') {
                    next.shipZip = ''; next.shipAddr1 = ''; next.shipAddr2 = '';
                    next.shipName = ''; next.shipMobile = ''; next.shipMemo = '';
                } else if (value === 'basic' && customer) {
                    next.shipZip = customer.zip_code || ''; next.shipAddr1 = customer.address_primary || '';
                    next.shipAddr2 = customer.address_detail || ''; next.shipName = customer.customer_name;
                    next.shipMobile = customer.mobile_number || ''; next.shipMemo = '';
                } else if (value.startsWith('addr_')) {
                    const aid = Number(value.split('_')[1]);
                    const ad = addresses.find(a => a.address_id === aid);
                    if (ad) {
                        next.shipZip = ad.zip_code; next.shipAddr1 = ad.address_primary; next.shipAddr2 = ad.address_detail;
                        next.shipName = ad.recipient_name; next.shipMobile = ad.mobile_number; next.shipMemo = ad.shipping_memo || '';
                    }
                }
            }
            if (name === 'shipMobile') next.shipMobile = formatPhoneNumber(value);
            return next;
        });
        setIsDirty(true);
    };

    const handleAddRow = () => {
        if (!customer) { showAlert('알림', '고객을 먼저 조회해주세요.'); return; }
        if (!inputState.product) { showAlert('알림', '상품을 선택해주세요.'); return; }

        let newStatus = '접수';
        if (editingTempId) {
            newStatus = inputState.status || '접수';
        }

        const newRow = {
            ...inputState,
            tempId: editingTempId || Date.now() + Math.random(),
            status: newStatus,
            isDirty: true
        };

        if (editingTempId) {
            setSalesRows(prev => prev.map(r => r.tempId === editingTempId ? newRow : r));
            setEditingTempId(null);
        } else {
            setSalesRows(prev => [newRow, ...prev]);
        }
        setInputState(prev => ({ ...prev, product: '', spec: '', qty: 1, price: '', discountRate: 0, amount: 0 }));
        setIsDirty(true);
    };

    const handleEditRow = (row) => {
        setEditingTempId(row.tempId);
        setInputState({ ...row, shipType: 'new' });
    };

    const handleDeleteRow = (row) => {
        if (row.id) setDeletedSalesIds(prev => [...prev, String(row.id)]);
        setSalesRows(prev => prev.filter(r => r.tempId !== row.tempId));
        setIsDirty(true);
    };

    const handleSaveAll = async () => {
        if (salesRows.length === 0 && deletedSalesIds.length === 0) return;
        if (!await showConfirm('저장 확인', '모든 변경 사항을 저장하시겠습니까?')) return;
        setIsProcessing(true);
        try {
            const payload = salesRows.map(r => ({
                salesId: r.id ? String(r.id) : null,
                customerId: String(customer.customer_id),
                productName: r.product,
                specification: r.spec || null,
                unitPrice: Number(String(r.price).replace(/[^0-9]/g, '')),
                quantity: Number(r.qty),
                totalAmount: Number(r.amount),
                status: r.status,
                memo: r.shipMemo || null,
                orderDateStr: orderDate,
                shippingName: r.shipName || null,
                shippingZipCode: r.shipZip || null,
                shippingAddressPrimary: r.shipAddr1 || null,
                shippingAddressDetail: r.shipAddr2 || null,
                shippingMobileNumber: r.shipMobile || null,
                paidAmount: 0,
                paymentStatus: null,
                discountRate: Number(r.discountRate),
                isDirty: r.isDirty ? "true" : "false"
            }));
            await window.__TAURI__.core.invoke('save_general_sales_batch', { items: payload, deletedIds: deletedSalesIds });
            await showAlert('성공', '정상적으로 저장되었습니다.');
            clearDraft();
            loadSalesHistory(customer.customer_id, orderDate);
        } catch (e) {
            showAlert('오류', `저장 중 오류가 발생했습니다: ${e}`);
        } finally { setIsProcessing(false); }
    };

    const handleReset = async () => {
        if (isDirty && !await showConfirm('초기화', '작성 중인 내용이 있습니다. 정말 초기화하시겠습니까?')) return;
        setCustomer(null); setSalesRows([]); setInputState(initialInputState); setIsDirty(false);
        clearDraft();
    };

    // --- Derived ---
    const summary = useMemo(() => {
        const count = salesRows.length;
        const qty = salesRows.reduce((a, b) => a + Number(b.qty), 0);
        const amount = salesRows.reduce((a, b) => a + Number(b.amount), 0);

        // Detailed summary for VAT/Supply
        const supply = salesRows.reduce((a, b) => a + (b.supplyValue || b.amount), 0);
        const vat = salesRows.reduce((a, b) => a + (b.vatAmount || 0), 0);
        return { count, qty, amount, supply, vat };
    }, [salesRows]);

    const numberToKorean = (number) => {
        const units = ['', '십', '백', '천'];
        const bigUnits = ['', '만', '억', '조'];
        const digits = ['', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구'];
        if (number === 0) return '영';
        let result = '';
        let unitCount = 0;
        let num = number;
        while (num > 0) {
            let chunk = num % 10000;
            let chunkResult = '';
            for (let i = 0; i < 4; i++) {
                let digit = chunk % 10;
                if (digit > 0) {
                    let digitStr = (digit === 1 && i > 0) ? '' : digits[digit];
                    chunkResult = digitStr + units[i] + chunkResult;
                }
                chunk = Math.floor(chunk / 10);
            }
            if (chunkResult !== '') result = chunkResult + bigUnits[unitCount] + result;
            unitCount++;
            num = Math.floor(num / 10000);
        }
        return result;
    };

    const handlePrintStatement = () => {
        if (!customer) { showAlert('알림', '고객을 선택해주세요.'); return; }
        if (salesRows.length === 0) { showAlert('알림', '출력할 내역이 없습니다.'); return; }

        const companyName = companyInfo?.company_name || '(주)강릉명가';
        const businessNum = companyInfo?.business_reg_number || '000-00-00000';
        const repName = companyInfo?.representative_name || '관리자';
        const address = companyInfo?.address || '정보 없음';
        const phone = companyInfo?.phone_number || companyInfo?.mobile_number || '정보 없음';

        const formatCurrencyLocal = (val) => (val || 0).toLocaleString();

        const html = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>거래명세서 - ${customer.customer_name}</title>
                <style>
                    @media print {
                        @page { margin: 0; }
                        body { margin: 0; padding: 15mm; }
                    }
                    body { font-family: 'Malgun Gothic', 'Dotum', sans-serif; font-size: 12px; }
                    .title { font-size: 24px; font-weight: bold; text-align: center; text-decoration: underline; margin-bottom: 20px; }
                    .header-table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
                    .main-table { width: 100%; border-collapse: collapse; border: 2px solid #000; table-layout: fixed; }
                    .total-box { border: 2px solid #000; padding: 10px; margin-top: 10px; font-weight: bold; font-size: 14px; display: flex; justify-content: space-between; }
                    .row-cell { border: 1px solid #000; padding: 5px; height: 30px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; vertical-align: middle; }
                    .row-num { width: 30px; text-align: center; }
                    .row-item { text-align: left; white-space: normal; }
                    .row-qty { width: 40px; text-align: center; }
                    .row-price { width: 80px; text-align: right; }
                    .row-amt { width: 90px; text-align: right; }
                    .row-rem { text-align: left; }
                    .provider-table td { border: 1px solid #000; padding: 3px; white-space: nowrap; font-size: 11px; }
                </style>
            </head>
            <body>
                <div class="title">거 래 명 세 서</div>
                <table class="header-table">
                    <tr>
                        <td width="45%" valign="top">
                            <table style="width:100%;">
                                <tr><td width="60" style="font-size:11px;">일 자 :</td><td style="font-size:11px;">${orderDate}</td></tr>
                                <tr><td style="font-size:11px;">고객명 :</td><td><span style="font-size:15px; font-weight:bold;">${customer.customer_name} 귀하</span></td></tr>
                            </table>
                        </td>
                        <td width="55%">
                            <table class="provider-table" style="width:100%; border-collapse:collapse;">
                                <tr>
                                    <td rowspan="4" width="20" style="text-align:center; background:#eee; font-weight:bold;">공<br>급<br>자</td>
                                    <td>등록번호</td>
                                    <td colspan="3" style="font-weight:bold; font-size:13px;">${businessNum}</td>
                                </tr>
                                <tr>
                                    <td>상 호</td>
                                    <td>${companyName}</td>
                                    <td>성 명</td>
                                    <td style="text-align:center;">${repName} (인)</td>
                                </tr>
                                <tr>
                                    <td>주 소</td>
                                    <td colspan="3" style="font-size:10px; white-space:normal;">${address}</td>
                                </tr>
                                <tr>
                                    <td>전 화</td>
                                    <td colspan="3">${phone}</td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                </table>
                <table class="main-table">
                    <tr style="background:#eee; text-align:center; height: 30px; font-weight:bold;">
                        <td class="row-cell row-num">No</td>
                        <td class="row-cell" style="width:200px;">품명 및 규격</td>
                        <td class="row-cell row-qty">수량</td>
                        <td class="row-cell row-price">단가</td>
                        <td class="row-cell" style="width:80px; text-align:right;">공급가액</td>
                        <td class="row-cell" style="width:70px; text-align:right;">부가세</td>
                        <td class="row-cell row-amt">합계금액</td>
                        <td class="row-cell row-rem">비고</td>
                    </tr>
                    ${Array.from({ length: 15 }).map((_, i) => {
            const row = salesRows[i];
            if (row) {
                return `
                            <tr style="height: 35px;">
                                <td class="row-cell row-num">${i + 1}</td>
                                <td class="row-cell row-item">
                                    <div style="font-weight:bold; font-size:11px;">${row.product}</div>
                                    <div style="font-size:9px; color:#555;">${row.spec || '-'}</div>
                                </td>
                                <td class="row-cell row-qty">${row.qty}</td>
                                <td class="row-cell row-price">${formatCurrencyLocal(row.price)}</td>
                                <td class="row-cell" style="text-align:right;">${formatCurrencyLocal(row.supplyValue || row.amount)}</td>
                                <td class="row-cell" style="text-align:right;">${formatCurrencyLocal(row.vatAmount || 0)}</td>
                                <td class="row-cell row-amt">${formatCurrencyLocal(row.amount)}</td>
                                <td class="row-cell row-rem" style="font-size:8px;">${row.discountRate > 0 ? `할인 ${row.discountRate}% ` : ''}${row.shipAddr1 ? `[배송] ${row.shipAddr1}` : ''}</td>
                            </tr>`;
            } else {
                return `
                            <tr style="height: 35px;">
                                <td class="row-cell row-num"></td>
                                <td class="row-cell"></td>
                                <td class="row-cell row-qty"></td>
                                <td class="row-cell row-price"></td>
                                <td class="row-cell"></td>
                                <td class="row-cell"></td>
                                <td class="row-cell row-amt"></td>
                                <td class="row-cell row-rem"></td>
                            </tr>`;
            }
        }).join('')}
                </table>
                <div class="total-box">
                    <div style="font-size: 11px;">
                        <div>총 공급가액: ￦ ${formatCurrencyLocal(summary.supply)}</div>
                        <div>총 부 가 세: ￦ ${formatCurrencyLocal(summary.vat)}</div>
                    </div>
                    <span>합계금액 (일금 ${numberToKorean(summary.amount)}원정) ￦ ${formatCurrencyLocal(summary.amount)}</span>
                </div>
                <div style="margin-top:20px; text-align:center; color:#888; font-size:11px;">위 금액을 정히 영수(청구)함.</div>
            </body>
            </html>
        `;

        const iframe = document.createElement('iframe');
        iframe.style.position = 'absolute';
        iframe.style.width = '0px';
        iframe.style.height = '0px';
        iframe.style.border = 'none';
        document.body.appendChild(iframe);
        const doc = iframe.contentWindow.document;
        doc.open();
        doc.write(html);
        doc.close();
        iframe.contentWindow.focus();
        setTimeout(() => {
            iframe.contentWindow.print();
            setTimeout(() => document.body.removeChild(iframe), 1000);
        }, 500);
    };

    const handleCsvUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const buffer = await file.arrayBuffer();
        let text = "";
        try {
            const utf8Decoder = new TextDecoder('utf-8', { fatal: true });
            text = utf8Decoder.decode(buffer);
        } catch (err) {
            const eucKrDecoder = new TextDecoder('euc-kr');
            text = eucKrDecoder.decode(buffer);
        }

        const parseCsvLine = (line) => {
            const parts = [];
            let current = "";
            let inQuotes = false;
            for (let j = 0; j < line.length; j++) {
                const char = line[j];
                if (char === '"' && line[j + 1] === '"') {
                    current += '"';
                    j++;
                } else if (char === '"') inQuotes = !inQuotes;
                else if (char === ',' && !inQuotes) {
                    parts.push(current.trim());
                    current = "";
                } else current += char;
            }
            parts.push(current.trim());
            return parts;
        };

        const lines = text.split(/\r?\n/).filter(l => l.trim());
        if (lines.length === 0) return;
        const startIndex = (lines[0].includes('이름') || lines[0].includes('주소')) ? 1 : 0;
        const newRows = lines.slice(startIndex).map(line => {
            const cols = parseCsvLine(line);
            if (cols.length < 2 || !cols[0]) return null;
            return {
                ...initialInputState,
                tempId: Date.now() + Math.random(),
                isDirty: true,
                status: '접수',
                amount: 0,
                shipName: cols[0],
                shipMobile: formatPhoneNumber(cols[1]),
                shipZip: cols[2] || '',
                shipAddr1: cols[3] || '',
                shipAddr2: cols[4] || '',
                product: cols[5] || ''
            };
        }).filter(r => r !== null);

        setSalesRows(prev => [...newRows, ...prev]);
        setIsDirty(true);
        showAlert('알림', `${newRows.length}건의 데이터를 불러왔습니다.`);
        e.target.value = '';
    };

    return {
        orderDate, setOrderDate,
        customer, setCustomer,
        addresses,
        products,
        salesRows, setSalesRows,
        editingTempId,
        isProcessing,
        isDirty, setIsDirty,
        companyInfo,
        inputState, setInputState,
        loadProducts, loadCompanyInfo, loadSalesHistory,
        selectCustomer,
        handleInputChange,
        handleAddRow,
        handleEditRow,
        handleDeleteRow,
        handleSaveAll,
        handleReset,
        handlePrintStatement,
        handleCsvUpload,
        summary,
        isDraftRestored,
        tempDraft,
        handleRestoreDraft,
        handleDiscardDraft
    };
};

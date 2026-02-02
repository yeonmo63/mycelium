import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { formatCurrency, parseNumber, formatPhoneNumber } from '../../utils/common';
import { useModal } from '../../contexts/ModalContext';

/**
 * SalesReception.jsx
 * "일반 접수" - 고밀도 정보 입력 및 세련된 프리미엄 UI
 */
const SalesReception = () => {
    // --- Custom Hooks ---
    const { showAlert, showConfirm } = useModal();

    // --- State Management ---
    const [orderDate, setOrderDate] = useState(new Date().toISOString().split('T')[0]);
    const [customer, setCustomer] = useState(null);
    const [addresses, setAddresses] = useState([]);
    const [products, setProducts] = useState([]);
    const [salesRows, setSalesRows] = useState([]);
    const [deletedSalesIds, setDeletedSalesIds] = useState([]);
    const [editingTempId, setEditingTempId] = useState(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [isDirty, setIsDirty] = useState(false);
    const [companyInfo, setCompanyInfo] = useState(null);

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

    // Refs
    const custSearchRef = useRef(null);
    const prodSelectRef = useRef(null);
    const fileInputRef = useRef(null);

    // Modals State
    const [showSelectionModal, setShowSelectionModal] = useState(false);
    const [searchResults, setSearchResults] = useState([]);
    const [showRegisterModal, setShowRegisterModal] = useState(false);
    const [showAddrLayer, setShowAddrLayer] = useState(false);
    const [addrTarget, setAddrTarget] = useState(null);
    const [quickRegisterName, setQuickRegisterName] = useState('');

    const loadCompanyInfo = useCallback(async () => {
        try {
            if (!window.__TAURI__) return;
            const info = await window.__TAURI__.core.invoke('get_company_info');
            setCompanyInfo(info);
        } catch (e) {
            console.error("Company info load error:", e);
        }
    }, []);

    const loadProducts = useCallback(async () => {
        try {
            if (!window.__TAURI__) return;
            const list = await window.__TAURI__.core.invoke('get_product_list');
            setProducts(list.filter(p => (p.item_type || 'product') === 'product') || []);
        } catch (e) {
            console.error("Product load error:", e);
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
            console.error("History load error:", e);
        }
    }, []);

    // --- Data Loading ---
    useEffect(() => {
        loadProducts();
        loadCompanyInfo();
    }, [loadProducts, loadCompanyInfo]);

    useEffect(() => {
        if (customer && orderDate) {
            loadSalesHistory(customer.customer_id, orderDate);
        } else {
            setSalesRows([]);
        }
    }, [customer, orderDate, loadSalesHistory]);

    // --- Customer Logic ---
    const handleSearchCustomer = async () => {
        const query = custSearchRef.current?.value.trim();
        if (!query) {
            showAlert('알림', '조회할 고객명을 입력해주세요.');
            return;
        }

        try {
            const results = await window.__TAURI__.core.invoke('search_customers_by_name', { name: query });
            if (!results || results.length === 0) {
                if (await showConfirm('신규 고객', '검색 결과가 없습니다. 새로운 고객으로 등록하시겠습니까?')) {
                    setQuickRegisterName(query);
                    setShowRegisterModal(true);
                }
                return;
            }

            if (results.length === 1) {
                // 단일 검색 결과인 경우 바로 선택
                selectCustomer(results[0]);
            } else {
                // 여러 명인 경우 선택 모달 표시
                setSearchResults(results);
                setShowSelectionModal(true);
            }
        } catch (e) {
            showAlert('오류', '고객 검색 중 오류가 발생했습니다.');
        }
    };

    const handleQuickRegister = async (newCustomerData) => {
        try {
            const payload = {
                name: newCustomerData.name,
                mobile: newCustomerData.mobile,
                level: newCustomerData.level || '일반',
                joinDate: new Date().toISOString().split('T')[0],
                zip: newCustomerData.zip || null,
                addr1: newCustomerData.addr1 || null,
                addr2: newCustomerData.addr2 || null,
                phone: newCustomerData.phone || null,
                email: newCustomerData.email || null,
                anniversaryDate: newCustomerData.anniversaryDate || null,
                anniversaryType: newCustomerData.anniversaryType || null,
                acquisitionChannel: newCustomerData.acquisition || null,
                purchaseCycle: newCustomerData.purchaseCycle || null,
                prefProductType: newCustomerData.prefProduct || null,
                prefPackageType: newCustomerData.prefPackage || null,
                subInterest: newCustomerData.subInterest || false,
                familyType: newCustomerData.familyType || null,
                healthConcern: newCustomerData.healthConcern || null,
                memo: newCustomerData.memo || null,
                marketingConsent: newCustomerData.marketingConsent || false
            };

            await window.__TAURI__.core.invoke('create_customer', payload);

            // 등록 후 다시 검색하여 선택 처리 (ID 등을 가져오기 위해)
            const results = await window.__TAURI__.core.invoke('search_customers_by_name', { name: payload.name });
            const created = results.find(r => r.mobile_number === payload.mobile) || results[0];

            if (created) {
                selectCustomer(created);
                setShowRegisterModal(false);
                showAlert('성공', '신규 고객이 등록 및 선택되었습니다.');
            }
        } catch (e) {
            showAlert('오류', `고객 등록 실패: ${e}`);
        }
    };

    const selectCustomer = async (cust) => {
        setCustomer(cust);
        if (custSearchRef.current) custSearchRef.current.value = cust.customer_name;

        try {
            const addrs = await window.__TAURI__.core.invoke('get_customer_addresses', { customerId: cust.customer_id });
            setAddresses(addrs || []);
            const defAddr = addrs.find(a => a.is_default) || addrs[0];
            if (defAddr) fillShippingFromAddress(defAddr, cust);
            else fillShippingFromCustomer(cust);
        } catch (e) {
            fillShippingFromCustomer(cust);
        }
        setTimeout(() => prodSelectRef.current?.focus(), 100);
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

    // --- Helpers ---
    const calculateAmount = useCallback((qty, price, discount) => {
        const q = Number(qty) || 0;
        const p = typeof price === 'string' ? parseNumber(price) : Number(price) || 0;
        const d = Number(discount) || 0;
        let total = q * p * (1 - d / 100);
        total = Math.floor(total / 10) * 10;
        return total;
    }, []);

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
        const address = companyInfo?.address || '강원도 강릉시...';
        const phone = companyInfo?.phone_number || companyInfo?.mobile_number || '033-000-0000';

        const html = `
            < html >
            <head>
                <title>거래명세서 - ${customer.customer_name}</title>
                <style>
                    body { font-family: 'Malgun Gothic', sans-serif; font-size: 12px; margin: 20px; }
                    .title { font-size: 24px; font-weight: bold; text-align: center; text-decoration: underline; margin-bottom: 20px; }
                    .header-table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
                    .main-table { width: 100%; border-collapse: collapse; border: 2px solid #000; }
                <style>
                    body { font-family: 'Malgun Gothic', sans-serif; font-size: 12px; margin: 20px; }
                    .title { font-size: 24px; font-weight: bold; text-align: center; text-decoration: underline; margin-bottom: 20px; }
                    .header-table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
                    .main-table { width: 100%; border-collapse: collapse; border: 2px solid #000; table-layout: fixed; }
                    .total-box { border: 2px solid #000; padding: 10px; margin-top: 10px; font-weight: bold; font-size: 14px; display: flex; justify-content: space-between; }
                    .row-cell { border: 1px solid #000; padding: 5px; height: 30px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; vertical-align: middle; }
                    .row-num { width: 30px; text-align: center; }
                    .row-item { text-align: left; white-space: normal; } /* Allow wrapping for item name if needed, or keep fixed */
                    .row-qty { width: 40px; text-align: center; }
                    .row-price { width: 80px; text-align: right; }
                    .row-disc { width: 40px; text-align: right; }
                    .row-amt { width: 90px; text-align: right; }
                    .row-rem { text-align: left; }
                </style>
            </head>
            <body>
                <div class="title">거 래 명 세 서</div>
                <table class="header-table">
                    <tr>
                        <td width="50%" valign="top">
                            <table style="width:100%;">
                                <tr><td width="60">일 자 :</td><td>${orderDate}</td></tr>
                                <tr><td>고객명 :</td><td><span style="font-size:16px; font-weight:bold;">${customer.customer_name} 귀하</span></td></tr>
                            </table>
                        </td>
                        <td width="50%">
                            <table style="width:100%; border:1px solid #000; border-collapse:collapse;">
                                <tr>
                                    <td rowspan="4" width="20" style="border:1px solid #000; text-align:center; background:#eee;">공<br>급<br>자</td>
                                    <td style="border:1px solid #000; padding:3px;">등록번호</td>
                                    <td colspan="3" style="border:1px solid #000; padding:3px; font-weight:bold;">${businessNum}</td>
                                </tr>
                                <tr>
                                    <td style="border:1px solid #000; padding:3px;">상 호</td>
                                    <td style="border:1px solid #000; padding:3px;">${companyName}</td>
                                    <td style="border:1px solid #000; padding:3px;">성 명</td>
                                    <td style="border:1px solid #000; padding:3px; text-align:center;">${repName} (인)</td>
                                </tr>
                                <tr>
                                    <td style="border:1px solid #000; padding:3px;">주 소</td>
                                    <td colspan="3" style="border:1px solid #000; padding:3px; font-size:10px;">${address}</td>
                                </tr>
                                <tr>
                                    <td style="border:1px solid #000; padding:3px;">전 화</td>
                                    <td colspan="3" style="border:1px solid #000; padding:3px;">${phone}</td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                </table>
                <table class="main-table">
                    <tr style="background:#eee; text-align:center; height: 30px;">
                        <td class="row-cell row-num">No</td>
                        <td class="row-cell">품명 및 규격</td>
                        <td class="row-cell row-qty">수량</td>
                        <td class="row-cell row-price">단가</td>
                        <td class="row-cell row-disc">할인</td>
                        <td class="row-cell row-amt">금액</td>
                        <td class="row-cell row-rem">비고</td>
                    </tr>
                    ${Array.from({ length: 10 }).map((_, i) => {
            const row = salesRows[i];
            if (row) {
                return `
                            <tr style="height: 40px;"> <!-- Fixed row height -->
                                <td class="row-cell row-num">${i + 1}</td>
                                <td class="row-cell row-item">
                                    <div style="font-weight:bold;">${row.product} <span style="font-size:11px; font-weight:normal; color:#555;">(${row.spec || '-'})</span></div>
                                    ${row.shipAddr1 ? `<div style="font-size:10px; color:#666; margin-top:2px;">[배송] ${row.shipAddr1} (${row.shipName})</div>` : ''}
                                </td>
                                <td class="row-cell row-qty">${row.qty}</td>
                                <td class="row-cell row-price">${formatCurrency(row.price)}</td>
                                <td class="row-cell row-disc">${row.discountRate > 0 ? row.discountRate + '%' : '-'}</td>
                                <td class="row-cell row-amt">${formatCurrency(row.amount)}</td>
                                <td class="row-cell row-rem">${row.shipMemo || ''}</td>
                            </tr>`;
            } else {
                // Filler row
                return `
                            <tr style="height: 40px;">
                                <td class="row-cell row-num"></td>
                                <td class="row-cell"></td>
                                <td class="row-cell row-qty"></td>
                                <td class="row-cell row-price"></td>
                                <td class="row-cell row-disc"></td>
                                <td class="row-cell row-amt"></td>
                                <td class="row-cell row-rem"></td>
                            </tr>`;
            }
        }).join('')}
                </table>
                <div class="total-box">
                    <span>합계금액 (일금 ${numberToKorean(summary.amount)}원정)</span>
                    <span>￦ ${formatCurrency(summary.amount)}</span>
                </div>
                <div style="margin-top:20px; text-align:center; color:#888;">위 금액을 정히 영수(청구)함.</div>
            </body>
            </html>
        `;


        // Create a hidden iframe for printing to avoid popup blockers
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
            // Remove iframe after printing (give it some time)
            setTimeout(() => {
                document.body.removeChild(iframe);
            }, 1000);
        }, 500);
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
    };

    const handleAddRow = () => {
        if (!customer) { showAlert('알림', '고객을 먼저 조회해주세요.'); return; }
        if (!inputState.product) { showAlert('알림', '상품을 선택해주세요.'); return; }

        // Status Logic: Simple Receipt
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
        prodSelectRef.current?.focus();
    };

    const handleAddressSearch = (target = 'input') => {
        if (!window.daum || !window.daum.Postcode) {
            showAlert('오류', '주소 검색 서비스(Daum)를 불러올 수 없습니다. 인터넷 연결을 확인하거나 잠시 후 다시 시도해주세요.');
            return;
        }

        setAddrTarget(target);
        setShowAddrLayer(true);

        // 레이어가 렌더링된 후(next tick) 실행되어야 합니다.
        setTimeout(() => {
            new window.daum.Postcode({
                oncomplete: (data) => {
                    let fullAddr = data.address;
                    let extraAddr = '';

                    if (data.addressType === 'R') {
                        if (data.bname !== '') extraAddr += data.bname;
                        if (data.buildingName !== '') extraAddr += (extraAddr !== '' ? `, ${data.buildingName} ` : data.buildingName);
                        fullAddr += (extraAddr !== '' ? ` (${extraAddr})` : '');
                    }

                    if (target === 'input') {
                        setInputState(prev => ({
                            ...prev,
                            shipZip: data.zonecode,
                            shipAddr1: fullAddr
                        }));
                    } else {
                        if (target.zipId) {
                            const zipEl = document.getElementById(target.zipId);
                            if (zipEl) zipEl.value = data.zonecode;
                        }
                        if (target.addr1Id) {
                            const addrEl = document.getElementById(target.addr1Id);
                            if (addrEl) addrEl.value = fullAddr;
                        }
                    }
                    setShowAddrLayer(false);
                },
                width: '100%',
                height: '100%'
            }).embed(document.getElementById('addr-layer-container'));
        }, 100);
    };

    const handleEditRow = (row) => { setEditingTempId(row.tempId); setInputState({ ...row, shipType: 'new' }); };
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
            loadSalesHistory(customer.customer_id, orderDate);
        } catch (e) {
            showAlert('오류', `저장 중 오류가 발생했습니다: ${e} `);
        } finally { setIsProcessing(false); }
    };

    const handleReset = async () => {
        if (isDirty && !await showConfirm('초기화', '작성 중인 내용이 있습니다. 정말 초기화하시겠습니까?')) return;
        setCustomer(null); setSalesRows([]); setInputState(initialInputState); setIsDirty(false);
        if (custSearchRef.current) custSearchRef.current.value = '';
    };

    const summary = useMemo(() => {
        const count = salesRows.length;
        const qty = salesRows.reduce((a, b) => a + Number(b.qty), 0);
        const amount = salesRows.reduce((a, b) => a + Number(b.amount), 0);
        return { count, qty, amount };
    }, [salesRows]);

    return (
        <div className="flex flex-col h-full bg-[#f8fafc] overflow-hidden animate-in fade-in duration-700">
            {/* Top Navigation & Action Header */}
            <div className="px-6 lg:px-8 min-[2000px]:px-12 pt-6 lg:pt-8 min-[2000px]:pt-12 pb-1">
                <div className="flex justify-between items-end mb-4">
                    <div>
                        <div className="flex items-center gap-2 mb-0.5">
                            <span className="w-6 h-1 bg-indigo-600 rounded-full"></span>
                            <span className="text-[9px] font-black tracking-[0.2em] text-indigo-600 uppercase">Sales Management System</span>
                        </div>
                        <h1 className="text-3xl font-black text-slate-600 tracking-tighter" style={{ fontFamily: '"Noto Sans KR", sans-serif' }}>일반 접수 <span className="text-slate-300 font-light ml-1 text-xl">Reception</span></h1>
                    </div>
                    <div className="flex gap-3">
                        <button onClick={() => fileInputRef.current?.click()} className="group h-10 px-5 rounded-xl bg-white border border-slate-200 text-slate-600 font-bold hover:border-indigo-500 hover:text-indigo-600 transition-all flex items-center gap-2 shadow-sm text-sm">
                            <span className="material-symbols-rounded text-lg group-hover:scale-110 transition-transform">upload_file</span> 주소입력 (CSV)
                        </button>
                        <input type="file" ref={fileInputRef} onChange={async (e) => {
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
                                    } else if (char === '"') {
                                        inQuotes = !inQuotes;
                                    } else if (char === ',' && !inQuotes) {
                                        parts.push(current.trim());
                                        current = "";
                                    } else {
                                        current += char;
                                    }
                                }
                                parts.push(current.trim());
                                return parts;
                            };

                            const lines = text.split(/\r?\n/).filter(l => l.trim());
                            if (lines.length === 0) return;

                            // 헤더 제외 (이름, 연락처 포함 시)
                            const startIndex = (lines[0].includes('이름') || lines[0].includes('주소')) ? 1 : 0;

                            const newRows = lines.slice(startIndex).map(line => {
                                const cols = parseCsvLine(line);
                                if (cols.length < 2 || !cols[0]) return null;
                                return {
                                    ...inputState,
                                    tempId: Date.now() + Math.random(),
                                    isDirty: true,
                                    status: '접수',
                                    amount: 0
                                };
                            }).filter(r => r !== null);

                            setSalesRows(prev => [...newRows, ...prev]);
                            setIsDirty(true);
                            showAlert('알림', `${newRows.length}건의 데이터를 불러왔습니다.`);
                            e.target.value = '';
                        }} className="hidden" accept=".csv" />
                    </div>
                </div>

                {/* Info Bar - Refined Style */}
                <div className="grid grid-cols-12 gap-3 items-stretch">
                    <div className="col-span-2 bg-white rounded-[1.5rem] p-3 border border-slate-100 shadow-sm transition-all hover:shadow-md text-sm">
                        <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1 block ml-1">접수 일자</label>
                        <div className="relative">
                            <input type="date" value={orderDate} onChange={e => setOrderDate(e.target.value)}
                                className="w-full h-10 bg-slate-100 border-slate-200 border rounded-xl font-black text-slate-800 focus:ring-2 focus:ring-indigo-500 transition-all px-3 text-[14px]" />
                        </div>
                    </div>
                    <div className="col-span-3 bg-white rounded-[1.5rem] p-3 border border-slate-100 shadow-sm transition-all hover:shadow-md text-sm">
                        <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1 block ml-1">고객 조회</label>
                        <div className="relative">
                            <input
                                ref={custSearchRef}
                                onKeyDown={e => e.key === 'Enter' && handleSearchCustomer()}
                                placeholder="이름 입력 후 엔터..."
                                className="w-full h-10 bg-slate-900 border-none rounded-xl text-white placeholder:text-slate-500 font-bold px-4 pr-12 focus:ring-4 focus:ring-indigo-500/20 transition-all text-[14px]"
                            />
                            <button onClick={handleSearchCustomer} className="absolute right-1.5 top-1.5 bottom-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg px-2 transition-colors">
                                <span className="material-symbols-rounded text-base">search</span>
                            </button>
                        </div>
                    </div>
                    <div className="col-span-7 bg-white rounded-[1.5rem] p-3 border border-slate-100 shadow-sm transition-all hover:shadow-md relative overflow-hidden group">
                        <div className="absolute top-0 right-0 w-24 h-full bg-indigo-50/50 -skew-x-12 translate-x-10 transition-transform group-hover:translate-x-5" />
                        <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1 block ml-1">선택된 고객 정보</label>
                        <div className="flex items-center gap-6 h-10 px-1 relative z-10">
                            {customer ? (
                                <>
                                    <div className="flex items-center gap-2">
                                        <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white font-black text-xs">{customer.customer_name[0]}</div>
                                        <div>
                                            <span className="font-black text-slate-900 block leading-tight text-sm">{customer.customer_name}</span>
                                            <span className="text-[8px] text-slate-400 font-bold uppercase">{customer.customer_id}</span>
                                        </div>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-1 text-slate-500 mb-0.5">
                                            <span className="material-symbols-rounded text-[12px]">location_on</span>
                                            <span className="text-[8px] font-black uppercase">기본 배송지 정보</span>
                                        </div>
                                        <span className="text-xs text-slate-700 font-bold block truncate">[{customer.zip_code || '-'}] {customer.address_primary} {customer.address_detail}</span>
                                    </div>
                                    <div className="shrink-0 text-right">
                                        <div className="flex items-center justify-end gap-1 text-indigo-500 mb-0.5">
                                            <span className="material-symbols-rounded text-[12px]">call</span>
                                            <span className="text-[8px] font-black uppercase">연락처</span>
                                        </div>
                                        <span className="text-xs font-black text-slate-900">{customer.mobile_number}</span>
                                    </div>
                                </>
                            ) : (
                                <div className="flex items-center gap-2 text-slate-600 italic font-black text-xs">
                                    <span className="material-symbols-rounded animate-pulse text-indigo-500 text-base">fingerprint</span>
                                    성함 혹은 번호로 고객 조회를 먼저 완료해주세요...
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Interactive Workpanel */}
            <div className={`px-6 lg:px-8 min-[2000px]:px-12 mt-1 flex flex-col gap-3 overflow-hidden flex-1 pb-6 lg:pb-8 min-[2000px]:pb-12 ${!customer ? 'pointer-events-none' : ''}`}>
                <div className="bg-white rounded-[1.5rem] p-5 shadow-lg border border-slate-200/60 relative">
                    <div className="absolute top-4 left-6 flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-indigo-600 animate-pulse"></div>
                        <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">항목 입력</span>
                    </div>

                    <div className="grid grid-cols-12 gap-3 mb-4 mt-4">
                        <div className="col-span-3">
                            <label className="text-[10.5px] font-bold text-slate-600 uppercase mb-1 block">상품명</label>
                            <div className="relative">
                                <select name="product" value={inputState.product} onChange={handleInputChange} ref={prodSelectRef}
                                    className="w-full h-10 rounded-xl bg-white border-slate-200 text-[14px] font-bold focus:ring-2 focus:ring-indigo-600 transition-all appearance-none px-4">
                                    <option value="">상품 선택</option>
                                    {products.map(p => <option key={p.product_id} value={p.product_name}>{p.product_name}</option>)}
                                </select>
                                <span className="material-symbols-rounded absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 text-base">unfold_more</span>
                            </div>
                        </div>
                        <div className="col-span-1">
                            <label className="text-[10.5px] font-bold text-slate-600 uppercase text-center mb-1 block">규격</label>
                            <input name="spec" value={inputState.spec} readOnly className="w-full h-10 rounded-xl bg-slate-100 border-none text-[14px] text-center font-bold text-slate-500 shadow-inner" />
                        </div>
                        <div className="col-span-1">
                            <label className="text-[10.5px] font-bold text-slate-600 uppercase text-center mb-1 block">수량</label>
                            <input type="number" name="qty" value={inputState.qty} onChange={handleInputChange} className="w-full h-10 rounded-xl bg-white border-slate-200 text-center font-black focus:ring-2 focus:ring-indigo-600 transition-all text-[14px]" />
                        </div>
                        <div className="col-span-1">
                            <label className="text-[10.5px] font-bold text-slate-600 uppercase text-right pr-2 mb-1 block">단가</label>
                            <input name="price" value={formatCurrency(inputState.price)} onChange={handleInputChange} className="w-full h-10 rounded-xl bg-white border-slate-200 text-right font-black pr-3 focus:ring-2 focus:ring-indigo-600 transition-all text-[14px]" />
                        </div>
                        <div className="col-span-1">
                            <label className="text-[10.5px] font-bold text-slate-600 uppercase text-center mb-1 block">할인(%)</label>
                            <input type="number" name="discountRate" value={inputState.discountRate} onChange={handleInputChange} className="w-full h-10 rounded-xl bg-white border-slate-200 text-center font-black focus:ring-2 focus:ring-indigo-600 transition-all text-[14px] text-indigo-600 px-0" />
                        </div>
                        <div className="col-span-1">
                            <label className="text-[10.5px] font-bold text-indigo-600 uppercase text-right pr-2 mb-1 block">금액</label>
                            <input value={formatCurrency(inputState.amount)} readOnly
                                className="w-full h-10 rounded-xl bg-slate-100 border-none text-slate-900 text-right font-black text-[14px] px-4 shadow-inner" />
                        </div>
                    </div>

                    <div className="bg-slate-100/50 p-5 rounded-[1.5rem] border border-slate-200 flex flex-col gap-4">
                        {/* Line 1: Address Info (Type + Zip + Addr1 + Addr2) */}
                        <div className="flex gap-4 items-end">
                            <div className="shrink-0 flex items-center gap-3 pr-4 border-r border-slate-200">
                                <div className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-500 shadow-sm"><span className="material-symbols-rounded text-lg">local_shipping</span></div>
                                <div>
                                    <label className="text-[11px] font-black text-slate-700 uppercase tracking-tight block mb-1">배송지 선택</label>
                                    <select
                                        name="shipType"
                                        value={inputState.shipType}
                                        onChange={handleInputChange}
                                        className="w-48 h-10 rounded-lg border-slate-200 bg-white text-[14px] font-bold text-slate-900 shadow-sm focus:ring-2 focus:ring-indigo-500 px-3 py-1 transition-all"
                                    >
                                        <option value="basic">고객 주소</option>
                                        {addresses.map(a => (
                                            <option key={a.address_id} value={`addr_${a.address_id}`}>
                                                {a.is_default ? '기본 배송지' : (a.address_alias || a.address_primary)}
                                            </option>
                                        ))}
                                        <option value="new">직접 입력</option>
                                    </select>
                                </div>
                            </div>
                            <div className="flex-1 grid grid-cols-12 gap-2">
                                <div className="col-span-1">
                                    <label className="text-[10.5px] font-bold text-slate-600 uppercase block mb-1 ml-1 text-center">우편번호</label>
                                    <input name="shipZip" value={inputState.shipZip} readOnly onClick={() => handleAddressSearch('input')} className="w-full h-9 rounded-lg border-slate-100 text-[14px] font-black text-slate-900 text-center bg-slate-100 shadow-sm cursor-pointer" />
                                </div>
                                <div className="col-span-5">
                                    <label className="text-[10.5px] font-bold text-slate-600 uppercase block mb-1 ml-1">기본 배송 주소 (클릭하여 검색)</label>
                                    <input name="shipAddr1" value={inputState.shipAddr1} readOnly onClick={() => handleAddressSearch('input')} className="w-full h-9 rounded-lg border-slate-100 text-[14px] font-bold text-slate-900 bg-slate-100 px-2 shadow-sm cursor-pointer" />
                                </div>
                                <div className="col-span-6">
                                    <label className="text-[10.5px] font-bold text-slate-600 uppercase block mb-1 ml-1">상세 주소 입력</label>
                                    <input name="shipAddr2" value={inputState.shipAddr2} onChange={handleInputChange} placeholder="아파트 동, 호수 등 상세정보 입력" className="w-full h-9 rounded-lg border-slate-200 bg-slate-100 text-[14px] font-bold text-slate-900 px-3 focus:ring-2 focus:ring-indigo-600 transition-all" />
                                </div>
                            </div>
                        </div>

                        {/* Line 2: Recipient Info + Action Controls */}
                        <div className="grid grid-cols-12 gap-3 items-end pt-1">
                            <div className="col-span-2">
                                <label className="text-[10.5px] font-bold text-slate-600 uppercase block mb-1 ml-1">수령인(받는분)</label>
                                <input name="shipName" value={inputState.shipName} onChange={handleInputChange} placeholder="성함" className="w-full h-10 rounded-lg border-slate-200 bg-slate-100 text-[14px] font-bold text-slate-900 px-3 focus:ring-2 focus:ring-indigo-600 transition-all" />
                            </div>
                            <div className="col-span-2">
                                <label className="text-[10.5px] font-bold text-slate-600 uppercase block mb-1 ml-1">연락처</label>
                                <input name="shipMobile" value={inputState.shipMobile} onChange={handleInputChange} placeholder="010-0000-0000" className="w-full h-10 rounded-lg border-slate-200 bg-slate-100 text-[14px] font-black text-slate-900 px-3 focus:ring-2 focus:ring-indigo-600 text-center" />
                            </div>
                            <div className="col-span-4">
                                <label className="text-[10.5px] font-bold text-indigo-600 uppercase block mb-1 ml-1">배송 메모</label>
                                <input name="shipMemo" value={inputState.shipMemo} onChange={handleInputChange} placeholder="기사님 전달사항 등..." className="w-full h-10 rounded-lg border-slate-200 bg-slate-100 text-[14px] font-black text-black px-3 focus:ring-2 focus:ring-indigo-600 transition-all" />
                            </div>
                            <div className="col-span-4 flex items-center justify-between pl-4 gap-3">
                                <div className="flex flex-col gap-1">
                                    <label className="flex items-center gap-2 cursor-pointer select-none group">
                                        <input type="checkbox" name="isSaveAddr" checked={inputState.isSaveAddr} onChange={handleInputChange} className="w-4 h-4 rounded-md text-blue-600 border-slate-300 focus:ring-0 cursor-pointer" />
                                        <span className="text-[11px] font-black text-blue-600 group-hover:text-blue-700 transition-colors uppercase">주소록 저장</span>
                                    </label>
                                </div>
                                <button onClick={handleAddRow} className={`flex-1 h-11 px-6 rounded-xl font-black text-xs flex items-center justify-center gap-2 transition-all shadow-lg ${editingTempId ? 'bg-emerald-500 hover:bg-emerald-600 text-white' : 'bg-slate-900 hover:bg-indigo-600 text-white shadow-indigo-200'}`}>
                                    <span className="material-symbols-rounded text-lg">{editingTempId ? 'edit_square' : 'add_circle'}</span>
                                    {editingTempId ? '수정 적용' : '리스트 추가'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* The List Area - High Sophisticated Table */}
                <div className="flex-1 overflow-hidden flex flex-col bg-white rounded-[1.5rem] shadow-xl border border-slate-200 relative">
                    <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500"></div>
                    <div className="flex-1 overflow-auto stylish-scrollbar p-0.5">
                        <table className="w-full text-xs border-separate border-spacing-0">
                            <thead className="sticky top-0 z-20">
                                <tr className="bg-slate-50/80 backdrop-blur-md">
                                    <th className="px-4 py-2 text-center text-[9px] font-black uppercase text-slate-400 border-b border-slate-100">번호</th>
                                    <th className="px-4 py-2 text-left text-[9px] font-black uppercase text-slate-400 border-b border-slate-100">상품명</th>
                                    <th className="px-4 py-2 text-center text-[9px] font-black uppercase text-slate-400 border-b border-slate-100">규격</th>
                                    <th className="px-4 py-2 text-center text-[9px] font-black uppercase text-slate-400 border-b border-slate-100">수량</th>
                                    <th className="px-4 py-2 text-right text-[9px] font-black uppercase text-slate-400 border-b border-slate-100">단가</th>
                                    <th className="px-4 py-2 text-right text-[9px] font-black uppercase text-slate-400 border-b border-slate-100">할인</th>
                                    <th className="px-4 py-2 text-right text-[9px] font-black uppercase text-slate-400 border-b border-slate-100">금액</th>
                                    <th className="px-4 py-2 text-center text-[9px] font-black uppercase text-slate-400 border-b border-slate-100">상태</th>
                                    <th className="px-4 py-2 text-center text-[9px] font-black uppercase text-slate-400 border-b border-slate-100">관리</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {salesRows.map((row, idx) => (
                                    <tr key={row.tempId} className={`group hover:bg-slate-50/50 transition-all ${editingTempId === row.tempId ? 'bg-indigo-50/40' : ''}`}>
                                        <td className="px-4 py-2 text-center text-[9px] font-black uppercase text-slate-400 border-b border-slate-100">{salesRows.length - idx}</td>
                                        <td className="px-4 py-2 border-b border-slate-100">
                                            <div className="flex items-center gap-2">
                                                <div className="w-1.5 h-6 rounded-full bg-slate-100 group-hover:bg-indigo-500 transition-all"></div>
                                                <div>
                                                    <div className="font-black text-slate-900 text-sm group-hover:text-indigo-600 transition-colors uppercase">{row.product}</div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-[9px] text-slate-400 font-bold uppercase truncate max-w-[150px]">{row.shipAddr1}</span>
                                                        <span className="text-[9px] text-indigo-500/70 font-black shrink-0">{row.shipName}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-4 py-2 text-center border-b border-slate-100">
                                            <div className="inline-flex items-center justify-center min-w-[32px] h-5 rounded bg-slate-100 text-slate-500 font-bold text-[9px]">{row.spec || '-'}</div>
                                        </td>
                                        <td className="px-4 py-2 text-center font-black text-black border-b border-slate-100">
                                            {row.qty}
                                        </td>
                                        <td className="px-4 py-2 text-right font-bold text-slate-500 border-b border-slate-100">{formatCurrency(row.price)}</td>
                                        <td className="px-4 py-2 text-right font-bold text-indigo-500 border-b border-slate-100">{row.discountRate}%</td>
                                        <td className="px-4 py-2 text-right border-b border-slate-100">
                                            <span className="text-sm font-black text-slate-900 tracking-tighter">{formatCurrency(row.amount)}</span>
                                        </td>
                                        <td className="px-4 py-2 text-center border-b border-slate-100">
                                            <span className="text-[9px] font-black text-slate-500 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100">{row.status}</span>
                                        </td>
                                        <td className="px-4 py-2 text-center border-b border-slate-100">
                                            <div className="flex justify-center gap-1.5 opacity-40 group-hover:opacity-100 transition-all duration-300">
                                                <button onClick={() => handleEditRow(row)} className="w-7 h-7 rounded-lg bg-white border border-slate-200 text-slate-500 hover:text-indigo-600 hover:border-indigo-200 hover:shadow-sm transition-all" title="수정">
                                                    <span className="material-symbols-rounded text-base">edit_note</span>
                                                </button>
                                                <button onClick={() => handleDeleteRow(row)} className="w-7 h-7 rounded-lg bg-white border border-slate-200 text-slate-500 hover:text-rose-600 hover:border-rose-200 hover:shadow-sm transition-all" title="삭제">
                                                    <span className="material-symbols-rounded text-base">delete_sweep</span>
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                                {salesRows.length === 0 && (
                                    <tr>
                                        <td colSpan="9" className="py-16 text-center">
                                            <div className="flex flex-col items-center gap-2">
                                                <span className="material-symbols-rounded text-4xl text-slate-200">auto_stories</span>
                                                <div className="font-black text-lg text-slate-800">접수 내역이 없습니다</div>
                                                <p className="text-slate-400 text-[11px]">고객 선택 후 항목을 추가해주세요.</p>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Footer Final Action & Summary */}
                    <div className="bg-slate-900 p-4 px-8 flex justify-between items-center text-white border-t border-slate-800 rounded-b-[1.5rem]">
                        <div className="flex gap-10 items-center">
                            <div className="flex gap-3 items-center">
                                <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white/40"><span className="material-symbols-rounded">analytics</span></div>
                                <div className="flex flex-col">
                                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">전체 합계 요약</span>
                                    <div className="flex items-baseline gap-1">
                                        <span className="text-xl font-black">{summary.count}건</span>
                                        <span className="mx-2 w-1 h-3 bg-white/10 rounded-full"></span>
                                        <span className="text-xl font-black">{summary.qty}개</span>
                                    </div>
                                </div>
                            </div>
                            <div className="flex flex-col pl-10 border-l border-white/10 ml-2">
                                <span className="text-[9px] font-black text-indigo-400 uppercase tracking-widest italic mb-0.5">최종 합계</span>
                                <div className="flex items-baseline gap-1">
                                    <span className="text-[9px] font-black text-indigo-400/50 uppercase">KRW</span>
                                    <span className="text-xl font-black text-indigo-400 leading-none">{formatCurrency(summary.amount)}원</span>
                                </div>
                            </div>
                        </div>
                        <div className="flex gap-3 h-12">
                            <button onClick={handleReset} className="px-6 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 font-black transition-all text-xs">초기화</button>
                            <button onClick={handlePrintStatement} disabled={!customer || salesRows.length === 0}
                                className="px-6 rounded-xl bg-white border-2 border-slate-700 text-slate-700 hover:bg-slate-50 font-black transition-all text-xs flex items-center gap-2">
                                <span className="material-symbols-rounded text-lg">print</span> 거래명세서 출력
                            </button>
                            <button onClick={handleSaveAll} disabled={isProcessing || !customer}
                                className={`px - 10 rounded - xl font - black shadow - xl flex items - center gap - 2 ${isProcessing ? 'bg-slate-700 text-slate-500' : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/40'} `}>
                                {isProcessing ? (
                                    <span className="material-symbols-rounded animate-spin text-lg">refresh</span>
                                ) : (
                                    <span className="material-symbols-rounded text-lg">save_as</span>
                                )}
                                <span className="text-sm uppercase tracking-tight">일괄 저장하기</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>


            {/* Customer Selection Modal */}
            {
                showSelectionModal && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                        <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={() => setShowSelectionModal(false)}></div>
                        <div className="bg-white rounded-3xl w-full max-w-4xl shadow-2xl relative overflow-hidden animate-in zoom-in-95 duration-200 text-slate-900 text-left">
                            <div className="bg-indigo-600 p-6 text-white flex justify-between items-center">
                                <h3 className="text-xl font-bold">고객 선택</h3>
                                <button onClick={() => setShowSelectionModal(false)} className="hover:bg-white/10 rounded-lg p-1">
                                    <span className="material-symbols-rounded">close</span>
                                </button>
                            </div>
                            <div className="p-6">
                                <p className="text-slate-500 text-sm mb-4">검색 결과가 여러 명입니다. 정확한 고객을 선택해주세요.</p>
                                <div className="max-h-[400px] overflow-y-auto pr-2">
                                    <table className="w-full text-sm">
                                        <thead className="sticky top-0 bg-white">
                                            <tr className="text-slate-400 text-[10px] uppercase font-black border-b border-slate-100">
                                                <th className="py-2 text-left">이름</th>
                                                <th className="py-2 text-left">연락처</th>
                                                <th className="py-2 text-left">주소</th>
                                                <th className="py-2 text-center">선택</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-50">
                                            {searchResults.map(c => (
                                                <tr key={c.customer_id} onClick={() => { selectCustomer(c); setShowSelectionModal(false); }} className="hover:bg-slate-50/80 group transition-colors cursor-pointer border-b border-slate-50 last:border-0">
                                                    <td className="py-3 px-2 font-bold text-slate-800 group-hover:text-indigo-700 transition-colors">{c.customer_name}</td>
                                                    <td className="py-3 px-2 text-slate-600 font-medium">{c.mobile_number}</td>
                                                    <td className="py-3 px-2 text-slate-400 text-xs truncate max-w-[180px]">{c.address_primary}</td>
                                                    <td className="py-3 px-2 text-center">
                                                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-slate-100 text-slate-400 group-hover:bg-indigo-600 group-hover:text-white transition-all shadow-sm">
                                                            <span className="material-symbols-rounded text-sm">check</span>
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                            <div className="bg-slate-50 p-4 flex justify-between items-center">
                                <span className="text-xs text-slate-400">찾으시는 고객이 없나요?</span>
                                <button onClick={() => { setShowSelectionModal(false); setQuickRegisterName(custSearchRef.current?.value); setShowRegisterModal(true); }} className="px-4 py-2 bg-slate-900 text-white rounded-xl font-bold text-sm hover:bg-slate-800 transition-all flex items-center gap-2">
                                    <span className="material-symbols-rounded text-lg">person_add</span> 신규 고객으로 등록
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Quick Register Modal */}
            {
                showRegisterModal && (
                    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
                        <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={() => setShowRegisterModal(false)}></div>
                        <form onSubmit={(e) => {
                            e.preventDefault();
                            const data = {
                                name: e.target.name.value,
                                mobile: e.target.mobile.value,
                                phone: e.target.phone.value,
                                level: e.target.level.value,
                                zip: e.target.zip.value,
                                addr1: e.target.addr1.value,
                                addr2: e.target.addr2.value,
                                memo: e.target.memo.value
                            };
                            handleQuickRegister(data);
                        }} className="bg-white rounded-3xl w-full max-w-3xl shadow-2xl relative overflow-hidden animate-in zoom-in-95 duration-200 text-slate-900 text-left">
                            <div className="bg-slate-900 p-6 text-white flex justify-between items-center">
                                <div>
                                    <h3 className="text-xl font-bold">신규 고객 퀵 등록</h3>
                                    <p className="text-[10px] text-slate-400 font-bold uppercase mt-1">빠른 등록 후 판매를 바로 시작합니다</p>
                                </div>
                                <div className="flex gap-2">
                                    <button type="button" onClick={() => fileInputRef.current?.click()} className="h-9 px-4 rounded-xl bg-slate-800 text-white text-xs font-bold hover:bg-slate-700 transition-all flex items-center gap-2 border border-slate-700">
                                        <span className="material-symbols-rounded text-base">upload_file</span> 파일
                                    </button>
                                    <button type="button" onClick={() => setShowRegisterModal(false)} className="hover:bg-white/10 rounded-lg p-1 text-white">
                                        <span className="material-symbols-rounded">close</span>
                                    </button>
                                </div>
                            </div>
                            <div className="p-6 space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="col-span-1">
                                        <label className="text-[10px] font-black text-slate-400 uppercase mb-1 block ml-1">고객명</label>
                                        <input name="name" defaultValue={quickRegisterName} required className="w-full h-11 px-4 rounded-xl bg-slate-100 border-none focus:ring-4 focus:ring-indigo-600/20 font-black text-[14px]" placeholder="이름 입력" />
                                    </div>
                                    <div className="col-span-1">
                                        <label className="text-[10px] font-black text-slate-400 uppercase mb-1 block ml-1">회원 등급</label>
                                        <select name="level" className="w-full h-11 px-4 rounded-xl bg-slate-100 border-none focus:ring-4 focus:ring-indigo-600/20 font-black text-[14px] appearance-none">
                                            <option value="일반">일반 고객</option>
                                            <option value="VIP">VIP 고객</option>
                                            <option value="법인/단체">법인/단체</option>
                                        </select>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="col-span-1">
                                        <label className="text-[10px] font-black text-slate-400 uppercase mb-1 block ml-1">휴대전화</label>
                                        <input name="mobile" required placeholder="010-0000-0000" onChange={(e) => e.target.value = formatPhoneNumber(e.target.value)} className="w-full h-11 px-4 rounded-xl bg-slate-100 border-none focus:ring-4 focus:ring-indigo-600/20 font-black text-[14px]" />
                                    </div>
                                    <div className="col-span-1">
                                        <label className="text-[10px] font-black text-slate-400 uppercase mb-1 block ml-1">일반전화</label>
                                        <input name="phone" placeholder="전화번호" onChange={(e) => e.target.value = formatPhoneNumber(e.target.value)} className="w-full h-11 px-4 rounded-xl bg-slate-100 border-none focus:ring-4 focus:ring-indigo-600/20 font-black text-[14px]" />
                                    </div>
                                </div>

                                <div className="space-y-3">
                                    <div className="grid grid-cols-4 gap-2">
                                        <div className="col-span-1">
                                            <label className="text-[10px] font-black text-slate-400 uppercase mb-1 block ml-1">우편번호</label>
                                            <input name="zip" id="quick-zip" className="w-full h-11 px-4 rounded-xl bg-slate-100 border-none cursor-pointer font-black text-[14px]" readOnly onClick={() => handleAddressSearch({ zipId: 'quick-zip', addr1Id: 'quick-addr1' })} placeholder="검색" />
                                        </div>
                                        <div className="col-span-3">
                                            <label className="text-[10px] font-black text-slate-400 uppercase mb-1 block ml-1">기본 주소</label>
                                            <input name="addr1" id="quick-addr1" className="w-full h-11 px-4 rounded-xl bg-slate-100 border-none cursor-pointer font-black text-[14px]" readOnly onClick={() => handleAddressSearch({ zipId: 'quick-zip', addr1Id: 'quick-addr1' })} placeholder="클릭하여 주소 검색" />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-black text-slate-400 uppercase mb-1 block ml-1">상세 주소</label>
                                        <input name="addr2" id="quick-addr2" className="w-full h-11 px-4 rounded-xl bg-slate-100 border-none focus:ring-4 focus:ring-indigo-600/20 font-black text-[14px]" placeholder="상세주소 입력" />
                                    </div>
                                </div>

                                <div>
                                    <label className="text-[10px] font-black text-slate-400 uppercase mb-1 block ml-1">고객 특이사항 및 메모</label>
                                    <textarea name="memo" rows="2" className="w-full px-4 py-3 rounded-xl bg-slate-100 border-none focus:ring-4 focus:ring-indigo-600/20 font-black text-[14px]" placeholder="중요한 정보가 있다면 입력하세요"></textarea>
                                </div>
                            </div>
                            <div className="bg-slate-50 p-6 flex justify-end gap-3">
                                <button type="button" onClick={() => setShowRegisterModal(false)} className="px-6 py-3 rounded-xl text-slate-500 font-black hover:bg-slate-200 transition-all text-sm">취소</button>
                                <button type="submit" className="px-10 py-3 bg-indigo-600 text-white rounded-xl font-black shadow-lg shadow-indigo-600/30 hover:bg-indigo-500 transition-all text-sm">등록 및 접수 시작</button>
                            </div>
                        </form>
                    </div>
                )
            }

            {/* Daum Address Layer Modal (Avoids Popup Blockers) */}
            {showAddrLayer && (
                <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm shadow-2xl" onClick={() => setShowAddrLayer(false)}></div>
                    <div className="bg-white rounded-3xl w-full max-w-[500px] h-[600px] shadow-2xl relative overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col">
                        <div className="bg-slate-900 px-6 py-4 text-white flex justify-between items-center shrink-0">
                            <span className="font-bold">주소 검색</span>
                            <button onClick={() => setShowAddrLayer(false)} className="hover:bg-white/10 rounded-lg p-1">
                                <span className="material-symbols-rounded">close</span>
                            </button>
                        </div>
                        <div id="addr-layer-container" className="flex-1 w-full bg-slate-50"></div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SalesReception;

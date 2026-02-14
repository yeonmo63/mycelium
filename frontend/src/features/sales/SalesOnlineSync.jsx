import React, { useState, useEffect, useRef } from 'react';
import { formatCurrency, parseNumber } from '../../utils/common';
import { useModal } from '../../contexts/ModalContext';
import ExcelUploadModal from './components/reception/ExcelUploadModal';

const SalesOnlineSync = () => {
    const { showAlert, showConfirm } = useModal();
    // State
    const [file, setFile] = useState(null);
    const [mallType, setMallType] = useState('sabangnet');
    const [parsedOrders, setParsedOrders] = useState([]);
    const [productList, setProductList] = useState([]);
    const [mappings, setMappings] = useState({});

    // UI State
    const [step, setStep] = useState('upload'); // upload | review | complete
    const [isMappingModalOpen, setIsMappingModalOpen] = useState(false);
    const [isExcelCustomModalOpen, setIsExcelCustomModalOpen] = useState(false);
    const [uploadFileData, setUploadFileData] = useState(null);

    // Quick Register Modal
    const [isQuickRegOpen, setIsQuickRegOpen] = useState(false);
    const [quickRegData, setQuickRegData] = useState({ name: '', spec: '1kg', price: '', tag: '' });
    const [pendingOrderForQuickReg, setPendingOrderForQuickReg] = useState(null);

    useEffect(() => {
        loadBaseData();
        loadLocalMappings();
    }, []);

    const loadBaseData = async () => {
        if (!window.__TAURI__) return;
        try {
            const list = await window.__TAURI__.core.invoke('get_product_list');
            setProductList(list.filter(p => (p.item_type || 'product') === 'product') || []);
        } catch (e) {
            console.error(e);
        }
    };

    const loadLocalMappings = () => {
        const saved = localStorage.getItem('online_product_mappings');
        if (saved) {
            const parsed = JSON.parse(saved);
            for (const key in parsed) {
                if (typeof parsed[key] === 'number') parsed[key] = { id: parsed[key], price: 0 };
            }
            setMappings(parsed);
        }
    };

    const saveLocalMappings = (newMappings) => {
        setMappings(newMappings);
        localStorage.setItem('online_product_mappings', JSON.stringify(newMappings));
    };

    // --- File Handling ---
    const handleFileChange = (e) => {
        if (e.target.files && e.target.files[0]) {
            setFile(e.target.files[0]);
        }
    };

    const handleParse = () => {
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (e) => {
            const buffer = e.target.result;
            const decoderUtf8 = new TextDecoder('utf-8');
            let text = decoderUtf8.decode(buffer);

            if (!text.includes('주문번호') && !text.includes('구매자')) {
                const decoderEucKr = new TextDecoder('euc-kr');
                text = decoderEucKr.decode(buffer);
            }

            try {
                let orders = [];
                if (mallType === 'naver') orders = parseNaverCsv(text);
                else if (mallType === 'coupang') orders = parseCoupangCsv(text);
                else if (mallType === 'custom') {
                    const allRows = parseCSV(text);
                    if (allRows.length < 2) {
                        await showAlert('오류', '데이터가 부족합니다.');
                        return;
                    }
                    setUploadFileData({ headers: allRows[0], rows: allRows.slice(1).filter(r => r.some(c => c)) });
                    setIsExcelCustomModalOpen(true);
                    return; // Wait for modal
                }
                else orders = parseGenericCsv(text);

                if (orders.length === 0) {
                    await showAlert('오류', '데이터를 추출하지 못했습니다. 형식을 확인해주세요.');
                    return;
                }

                // Identify Customers
                if (window.__TAURI__) {
                    const invoke = window.__TAURI__.core.invoke;
                    for (const order of orders) {
                        try {
                            if (!order.mobile) { order.isNewCustomer = true; continue; }
                            const dups = await invoke('search_customers_by_mobile', { mobile: order.mobile });
                            if (dups && dups.length > 0) {
                                order.isNewCustomer = false;
                                order.existingCustomerId = dups[0].customer_id;
                                order.existingCustomerName = dups[0].customer_name;
                            } else {
                                order.isNewCustomer = true;
                            }
                        } catch (e) { console.warn(e); order.isNewCustomer = true; }
                    }
                }

                setParsedOrders(orders);
                setStep('review');

            } catch (err) {
                console.error(err);
                await showAlert('파싱 오류', err.toString());
            }
        };
        reader.readAsArrayBuffer(file);
    };

    // --- CSV Parsing Logic (Ported) ---
    const parseCSV = (text) => {
        const lines = text.split(/\r?\n/);
        return lines.map(line => {
            const parts = [];
            let current = '';
            let inQuotes = false;
            for (let i = 0; i < line.length; i++) {
                const char = line[i];
                if (char === '"') inQuotes = !inQuotes;
                else if (char === ',' && !inQuotes) { parts.push(current.trim()); current = ''; }
                else current += char;
            }
            parts.push(current.trim());
            return parts;
        });
    };

    const parseNaverCsv = (text) => {
        const rows = parseCSV(text);
        if (rows.length < 2) return [];

        const headers = rows[0];
        const idx = {
            name: headers.indexOf('수량'),
            orderer: headers.indexOf('구매자명'),
            receiver: headers.indexOf('수취인명'),
            mobile: headers.indexOf('수취인연락처1'),
            zip: headers.indexOf('우편번호'),
            addr: headers.indexOf('배송지'),
            prodName: headers.indexOf('상품명'),
            option: headers.indexOf('옵션정보'),
            qty: headers.indexOf('수량'),
            price: headers.indexOf('상품가격'),
            orderId: headers.indexOf('주문번호')
        };

        if (idx.prodName === -1) {
            idx.prodName = headers.findIndex(h => h.includes('상품명'));
            idx.orderer = headers.findIndex(h => h.includes('구매자명'));
            idx.receiver = headers.findIndex(h => h.includes('수취인명'));
            idx.mobile = headers.findIndex(h => h.includes('연락처'));
            idx.addr = headers.findIndex(h => h.includes('배송지'));
            idx.qty = headers.findIndex(h => h.includes('수량'));
        }

        const data = [];
        for (let i = 1; i < rows.length; i++) {
            const r = rows[i];
            if (!r[idx.prodName]) continue;

            const mallProductText = r[idx.prodName] + (r[idx.option] ? ` (${r[idx.option]})` : '');
            const uPrice = parseNumber(r[idx.price]) || 0;

            data.push({
                orderId: r[idx.orderId] || '',
                customerName: r[idx.orderer] || r[idx.receiver],
                receiverName: r[idx.receiver],
                mobile: r[idx.mobile],
                zip: r[idx.zip],
                address: r[idx.addr],
                mallProductName: mallProductText.trim(),
                qty: parseInt(r[idx.qty]) || 1,
                unitPrice: uPrice,
                internalProductId: matchProduct(mallProductText.trim(), uPrice)
            });
        }
        return data;
    };

    const parseCoupangCsv = (text) => {
        const rows = parseCSV(text);
        if (rows.length < 2) return [];

        const headers = rows[0];
        const idx = {
            orderId: headers.indexOf('주문번호'),
            orderer: headers.indexOf('구매자'),
            receiver: headers.indexOf('수취인명'),
            mobile: headers.indexOf('연락처'),
            zip: headers.indexOf('우편번호'),
            addr: headers.findIndex(h => h.includes('배송지')),
            prodName: headers.indexOf('등록상품명'),
            qty: headers.indexOf('수량'),
            price: headers.indexOf('결제금액')
        };

        if (idx.prodName === -1) {
            idx.prodName = headers.findIndex(h => h.includes('상품명'));
            idx.orderer = headers.findIndex(h => h.includes('구매자') || h.includes('주문자'));
            idx.receiver = headers.findIndex(h => h.includes('수취인'));
            idx.mobile = headers.findIndex(h => h.includes('연락처') || h.includes('전화번호'));
        }

        const data = [];
        for (let i = 1; i < rows.length; i++) {
            const r = rows[i];
            if (!r[idx.prodName]) continue;

            const qty = parseInt(r[idx.qty]) || 1;
            // Coupang '결제금액' is Total Price
            const uPrice = (parseNumber(r[idx.price]) / qty) || 0;

            data.push({
                orderId: r[idx.orderId] || '',
                customerName: r[idx.orderer] || r[idx.receiver],
                receiverName: r[idx.receiver],
                mobile: r[idx.mobile],
                zip: r[idx.zip],
                address: r[idx.addr],
                mallProductName: r[idx.prodName].trim(),
                qty: qty,
                unitPrice: uPrice,
                internalProductId: matchProduct(r[idx.prodName].trim(), uPrice)
            });
        }
        return data;
    };

    const parseGenericCsv = (text) => {
        const rows = parseCSV(text);
        if (rows.length < 2) return [];
        return rows.slice(1).map(r => {
            const uPrice = parseNumber(r[6]) || 0;
            return {
                customerName: r[0],
                mobile: r[1],
                zip: r[2],
                address: r[3],
                mallProductName: r[4],
                qty: parseInt(r[5]) || 1,
                unitPrice: uPrice,
                internalProductId: matchProduct(r[4], uPrice)
            };
        }).filter(o => o.customerName);
    };

    const handleImportFromExcel = async (rows) => {
        const orders = rows.map(r => ({
            orderId: 'EXCEL-' + Date.now().toString().slice(-4),
            customerName: r.shipName,
            receiverName: r.shipName,
            mobile: r.shipMobile,
            zip: r.shipZip,
            address: r.shipAddr1 + (r.shipAddr2 ? ' ' + r.shipAddr2 : ''),
            mallProductName: r.product,
            qty: r.qty,
            unitPrice: r.price,
            internalProductId: matchProduct(r.product, r.price)
        }));

        // Identify Customers
        if (window.__TAURI__) {
            const invoke = window.__TAURI__.core.invoke;
            for (const order of orders) {
                try {
                    if (!order.mobile) { order.isNewCustomer = true; continue; }
                    const dups = await invoke('search_customers_by_mobile', { mobile: order.mobile });
                    if (dups && dups.length > 0) {
                        order.isNewCustomer = false;
                        order.existingCustomerId = dups[0].customer_id;
                        order.existingCustomerName = dups[0].customer_name;
                    } else {
                        order.isNewCustomer = true;
                    }
                } catch (e) { console.warn(e); order.isNewCustomer = true; }
            }
        }

        setParsedOrders(orders);
        setStep('review');
    };

    const matchProduct = (mallName, mallPrice) => {
        // 1. Direct
        if (mappings[mallName]) return mappings[mallName].id || mappings[mallName];

        // 2. Fuzzy
        const found = productList.find(p => mallName.includes(p.product_name) || p.product_name.includes(mallName));
        if (found) {
            // Price Check (50% threshold)
            if (mallPrice > 0 && found.unit_price > 0) {
                const diff = Math.abs(mallPrice - found.unit_price);
                if (diff / found.unit_price > 0.5) return null;
            }
            return found.product_id;
        }
        return null;
    };

    // --- Matching Operations ---
    const handleMatchChange = (orderIndex, newPid) => {
        if (newPid === 'NEW') {
            setPendingOrderForQuickReg({ index: orderIndex, ...parsedOrders[orderIndex] });
            setQuickRegData({
                name: parsedOrders[orderIndex].mallProductName,
                spec: '1kg',
                price: formatCurrency(parsedOrders[orderIndex].unitPrice),
                tag: ''
            });
            setIsQuickRegOpen(true);
            return;
        }

        const order = parsedOrders[orderIndex];
        const newOrders = [...parsedOrders];
        newOrders[orderIndex] = { ...order, internalProductId: newPid };
        setParsedOrders(newOrders);

        if (newPid) {
            const newMap = { ...mappings, [order.mallProductName]: { id: Number(newPid), price: order.unitPrice } };
            saveLocalMappings(newMap);
        }
    };

    // --- Quick Register ---
    const handleQuickRegister = async () => {
        if (!pendingOrderForQuickReg) return;

        const price = parseNumber(quickRegData.price);
        let finalName = quickRegData.name;
        if (quickRegData.tag) finalName = `[${quickRegData.tag}] ${quickRegData.name}`;

        try {
            if (window.__TAURI__) {
                const newId = await window.__TAURI__.core.invoke('create_product', {
                    productName: finalName,
                    specification: quickRegData.spec,
                    unitPrice: price,
                    stockQuantity: 100,
                    safetyStock: 10,
                    costPrice: 0
                });

                await loadBaseData(); // Refresh list to get new product

                // Update Order & Mapping
                // Note: since loadBaseData is async and state update is batched, we might not see new product in 'productList' immediately for rendering.
                // But we know ID.

                // Update mapping immediately
                const newMap = { ...mappings, [pendingOrderForQuickReg.mallProductName]: { id: newId, price } };
                saveLocalMappings(newMap);

                // Update row
                handleMatchChange(pendingOrderForQuickReg.index, newId);

                await showAlert("완료", "신규 상품이 등록되었습니다.");
                setIsQuickRegOpen(false);
            }
        } catch (e) {
            await showAlert("오류", "상품 등록 실패: " + e);
        }
    };

    // --- Sync Execution ---
    const [isApiLoading, setIsApiLoading] = useState(false);

    const handleApiSync = async () => {
        if (mallType === 'generic') {
            await showAlert("알림", "일반 형식은 실시간 연동을 지원하지 않습니다. 엑셀을 이용해주세요.");
            return;
        }
        setIsApiLoading(true);
        try {
            const invoke = window.__TAURI__.core.invoke;
            const orders = await invoke('fetch_external_mall_orders', { mallType });

            if (!orders || orders.length === 0) {
                await showAlert("결과", "가져올 새로운 주문 데이터가 없습니다.");
                return;
            }

            // identify customers
            for (const order of orders) {
                try {
                    if (!order.mobile) { order.isNewCustomer = true; continue; }
                    const dups = await invoke('search_customers_by_mobile', { mobile: order.mobile });
                    if (dups && dups.length > 0) {
                        order.isNewCustomer = false;
                        order.existingCustomerId = dups[0].customer_id;
                        order.existingCustomerName = dups[0].customer_name;
                    } else {
                        order.isNewCustomer = true;
                    }
                } catch (e) { console.warn(e); order.isNewCustomer = true; }
                order.internalProductId = matchProduct(order.mallProductName, order.unitPrice);
            }

            setParsedOrders(orders);
            setStep('review');
        } catch (e) {
            await showAlert("연동 오류", e);
        } finally {
            setIsApiLoading(false);
        }
    };

    const handleSync = async () => {
        const unmatched = parsedOrders.filter(o => !o.internalProductId).length;
        if (unmatched > 0) {
            await showAlert("경고", `${unmatched}건의 상품이 매칭되지 않았습니다.`);
            return;
        }

        if (!await showConfirm("확인", `${parsedOrders.length}건의 주문을 연동하시겠습니까?`)) return;

        let success = 0;
        let fail = 0;

        if (window.__TAURI__) {
            const invoke = window.__TAURI__.core.invoke;
            for (const order of parsedOrders) {
                try {
                    let cid = order.existingCustomerId;
                    if (!cid) {
                        // Create Customer
                        cid = await invoke('create_customer', {
                            name: order.customerName,
                            mobile: order.mobile,
                            zip: order.zip,
                            addr1: order.address,
                            level: '일반',
                            memo: `[쇼핑몰] ${order.mallProductName}`
                        });
                    }

                    // Create Sale
                    const internalP = productList.find(p => p.product_id == order.internalProductId) || { product_name: 'Unknown', unit_price: order.unitPrice };

                    await invoke('create_sale', {
                        customerId: Number(cid),
                        productName: internalP.product_name,
                        specification: internalP.specification || null,
                        unitPrice: Number(order.unitPrice),
                        quantity: Number(order.qty),
                        totalAmount: Number(order.unitPrice * order.qty),
                        status: '입금완료',
                        memo: `[쇼핑몰] ${order.orderId}`,
                        orderDateStr: new Date().toISOString().split('T')[0],
                        shippingName: order.receiverName || order.customerName,
                        shippingZipCode: order.zip || null,
                        shippingAddressPrimary: order.address || null,
                        shippingAddressDetail: '',
                        shippingMobileNumber: order.mobile || null,
                        shippingDate: null,
                        paidAmount: Number(order.unitPrice * order.qty)
                    });
                    success++;
                } catch (e) {
                    console.error(e);
                    fail++;
                }
            }
            await showAlert("완료", `성공: ${success}, 실패: ${fail}`);
            setStep('upload');
            setFile(null);
            setParsedOrders([]);
        }
    };

    return (
        <div className="h-full flex flex-col relative overflow-hidden">
            {/* Header Title */}
            <div className="px-6 lg:px-8 min-[2000px]:px-12 pt-6 lg:pt-8 min-[2000px]:pt-12 pb-1 shrink-0">
                <div className="flex justify-center items-center mb-4">
                    <div className="inline-flex flex-col items-start">
                        <div className="flex items-center gap-2 mb-0.5">
                            <span className="w-6 h-1 bg-teal-500 rounded-full"></span>
                            <span className="text-[9px] font-black tracking-[0.2em] text-teal-600 uppercase">Multi-Channel Sync Engine</span>
                        </div>
                        <h1 className="text-3xl font-black text-slate-600 tracking-tighter" style={{ fontFamily: '"Noto Sans KR", sans-serif' }}>통합 주문 수집 <span className="text-slate-300 font-light ml-1 text-xl">Omni-Channel Sync</span></h1>
                    </div>
                </div>
            </div>


            {/* Upload Step */}
            {step === 'upload' && (
                <div className="flex-1 flex flex-col items-center pt-10 px-8 pb-20">
                    <div className="w-[600px] bg-white p-10 rounded-[2.5rem] shadow-2xl border border-slate-100/50 text-center relative overflow-hidden">
                        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-teal-400 via-emerald-400 to-green-400"></div>

                        <div className="mb-8 relative z-10">
                            <div className="w-24 h-24 mx-auto bg-slate-50 rounded-full flex items-center justify-center mb-4 shadow-inner">
                                <span className="material-symbols-rounded text-5xl text-teal-500">cloud_sync</span>
                            </div>
                            <h3 className="text-2xl font-black text-slate-700 mt-2">주문 데이터 수집</h3>
                            <p className="text-slate-400 text-sm font-bold mt-2">실시간 API 연동 또는 엑셀 업로드</p>
                        </div>

                        <div className="mb-6 text-left bg-slate-50 p-6 rounded-2xl border border-slate-100">
                            <label className="block text-xs font-black text-slate-400 uppercase mb-2 ml-1">쇼핑몰 선택</label>
                            <select value={mallType} onChange={e => setMallType(e.target.value)}
                                className="w-full h-12 px-4 rounded-xl bg-white border border-slate-200 font-bold text-slate-700 focus:ring-4 focus:ring-teal-500/20 focus:border-teal-500 transition-all outline-none">
                                <option value="sabangnet">사방넷 (Sabangnet API)</option>
                                <option value="playauto">플레이오토 (PlayAuto API)</option>
                                <option value="naver">네이버 스마트스토어 (Commerce API)</option>
                                <option value="coupang">쿠팡 (윙 API)</option>
                                <option value="custom">자유 양식 엑셀 (컬럼 직접 지정)</option>
                                <option value="generic">기본 (이름,연락처,주소,상품명)</option>
                            </select>
                        </div>

                        <div className="grid grid-cols-2 gap-4 mb-4">
                            <div className="flex flex-col gap-2">
                                <button
                                    onClick={handleApiSync}
                                    disabled={isApiLoading || mallType === 'generic'}
                                    className="h-24 rounded-2xl bg-teal-50 border-2 border-teal-100 hover:border-teal-400 hover:bg-teal-100/50 transition-all flex flex-col items-center justify-center gap-2 group disabled:opacity-50 disabled:grayscale"
                                >
                                    {isApiLoading ? (
                                        <div className="w-6 h-6 border-2 border-teal-500 border-t-transparent rounded-full animate-spin"></div>
                                    ) : (
                                        <span className="material-symbols-rounded text-3xl text-teal-600 group-hover:scale-110 transition-transform">bolt</span>
                                    )}
                                    <span className="text-xs font-black text-teal-700">API 실시간 연동</span>
                                </button>
                            </div>
                            <div className="flex flex-col gap-2">
                                <button
                                    onClick={() => document.getElementById('file-upload').click()}
                                    className="h-24 rounded-2xl bg-slate-50 border-2 border-dashed border-slate-200 hover:border-teal-400 hover:bg-slate-100/50 transition-all flex flex-col items-center justify-center gap-2 group"
                                >
                                    <span className="material-symbols-rounded text-3xl text-slate-400 group-hover:text-teal-600 transition-colors">upload_file</span>
                                    <span className="text-xs font-black text-slate-500">엑셀 파일 업로드</span>
                                </button>
                                <input id="file-upload" type="file" onChange={handleFileChange} className="hidden" accept=".csv" />
                            </div>
                        </div>

                        {file && (
                            <div className="mb-4 bg-emerald-50 p-3 rounded-xl flex items-center justify-between border border-emerald-100 animate-in fade-in slide-in-from-top-2">
                                <div className="flex items-center gap-2">
                                    <span className="material-symbols-rounded text-emerald-600 text-sm">check_circle</span>
                                    <span className="text-[11px] font-bold text-emerald-700">{file.name}</span>
                                </div>
                                <button onClick={() => setFile(null)} className="text-emerald-400 hover:text-emerald-600">
                                    <span className="material-symbols-rounded text-sm">close</span>
                                </button>
                            </div>
                        )}

                        <div className="mt-4 flex gap-3">
                            <button className="flex-1 h-12 rounded-xl bg-slate-100 text-slate-500 font-black hover:bg-slate-200 transition-colors"
                                onClick={() => setIsMappingModalOpen(true)}>
                                매칭 규칙 관리
                            </button>
                            <button className="flex-[2] h-12 rounded-xl bg-teal-600 text-white font-black hover:bg-teal-500 shadow-lg shadow-teal-200 transition-all hover:scale-[1.02] disabled:opacity-50 disabled:scale-100"
                                disabled={!file} onClick={handleParse}>
                                <div className="flex items-center justify-center gap-2">
                                    <span>엑셀 분석 시작</span>
                                    <span className="material-symbols-rounded text-lg">arrow_forward</span>
                                </div>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Review Step */}
            {step === 'review' && (
                <div className="px-6 lg:px-8 min-[2000px]:px-12 mt-1 flex flex-col gap-3 overflow-hidden flex-1 pb-6 lg:pb-8 min-[2000px]:pb-12">
                    <div className="bg-white rounded-[1.5rem] shadow-xl border border-slate-200 relative flex flex-col h-full overflow-hidden">
                        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-teal-400 via-emerald-400 to-green-400 z-10"></div>

                        <div className="flex justify-between items-center mb-2 shrink-0 p-5 pb-0">
                            <div className="flex items-center gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-teal-500 animate-pulse"></span>
                                <span className="text-[11px] font-black text-slate-500 uppercase tracking-widest">분석된 주문 리스트</span>
                                <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-[10px] font-bold ml-2">총 {parsedOrders.length}건</span>
                            </div>
                            <div className="flex gap-2">
                                <button onClick={() => { setStep('upload'); setParsedOrders([]); setFile(null); }}
                                    className="h-8 px-3 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold flex items-center gap-1 transition-colors">
                                    <span className="material-symbols-rounded text-sm">arrow_back</span> 재업로드
                                </button>
                            </div>
                        </div>

                        <div className="flex-1 overflow-auto stylish-scrollbar p-0.5">
                            <table className="w-full text-xs border-separate border-spacing-0">
                                <thead className="sticky top-0 z-10">
                                    <tr className="bg-slate-50/80 backdrop-blur-md">
                                        <th className="px-4 py-2 text-center text-[9px] font-black uppercase text-slate-400 border-b border-slate-100 w-[5%]">No</th>
                                        <th className="px-4 py-2 text-left text-[9px] font-black uppercase text-slate-400 border-b border-slate-100 w-[20%]">고객정보</th>
                                        <th className="px-4 py-2 text-left text-[9px] font-black uppercase text-slate-400 border-b border-slate-100 w-[25%]">쇼핑몰 상품명</th>
                                        <th className="px-4 py-2 text-left text-[9px] font-black uppercase text-slate-400 border-b border-slate-100 w-[25%]">내부 상품 매칭</th>
                                        <th className="px-4 py-2 text-center text-[9px] font-black uppercase text-slate-400 border-b border-slate-100 w-[15%]">수량/단가</th>
                                        <th className="px-4 py-2 text-center text-[9px] font-black uppercase text-slate-400 border-b border-slate-100 w-[10%]">상태</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {parsedOrders.map((order, i) => {
                                        const isMatched = !!order.internalProductId;
                                        return (
                                            <tr key={i} className={`hover:bg-slate-50/80 transition-colors ${!isMatched ? 'bg-red-50/30' : ''}`}>
                                                <td className="px-4 py-3 text-center text-slate-400 font-bold">{i + 1}</td>
                                                <td className="px-4 py-3">
                                                    <div className="font-bold flex gap-2 items-center text-slate-700">
                                                        {order.customerName}
                                                        {order.isNewCustomer
                                                            ? <span className="bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded text-[10px] font-black uppercase tracking-tight">New</span>
                                                            : <span className="bg-purple-50 text-purple-600 px-1.5 py-0.5 rounded text-[10px] font-black uppercase tracking-tight">Exist</span>
                                                        }
                                                    </div>
                                                    <div className="text-[10px] text-slate-400 font-bold mt-0.5">{order.mobile}</div>
                                                </td>
                                                <td className="px-4 py-3 text-slate-600 font-medium">{order.mallProductName}</td>
                                                <td className="px-4 py-3">
                                                    <select className={`w-full h-8 pl-2 pr-8 rounded-lg text-xs font-bold border outline-none bg-white focus:ring-2 focus:ring-teal-500/20 transition-all appearance-none cursor-pointer
                                                        ${!isMatched ? 'border-red-300 text-red-500 bg-red-50/50' : 'border-slate-200 text-slate-700'}`}
                                                        value={order.internalProductId || ''}
                                                        onChange={e => handleMatchChange(i, e.target.value)}
                                                        style={{ backgroundImage: 'none' }}
                                                    >
                                                        <option value="">-- 상품 선택 필요 --</option>
                                                        <option value="NEW" className="font-black text-blue-600">✨ 새 상품으로 등록하기...</option>
                                                        {productList.map(p => (
                                                            <option key={p.product_id} value={p.product_id}>{p.product_name} ({p.specification})</option>
                                                        ))}
                                                    </select>
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                    <div className="font-bold text-slate-700">{order.qty}개</div>
                                                    <div className="text-[10px] text-slate-400 font-bold">{formatCurrency(order.unitPrice)}원</div>
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                    {isMatched
                                                        ? <span className="text-emerald-500 font-black text-[10px] bg-emerald-50 px-2 py-1 rounded-full">MATCHED</span>
                                                        : <span className="text-red-500 font-black text-[10px] bg-red-50 px-2 py-1 rounded-full animate-pulse">CHECK</span>
                                                    }
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        {/* Footer */}
                        <div className="bg-slate-900 border-t border-slate-800 p-4 px-8 flex justify-between items-center shrink-0 z-20 h-[88px]">
                            <div className="flex gap-4 items-center">
                                <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white/40">
                                    <span className="material-symbols-rounded">sync_alt</span>
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">매칭 상태</span>
                                    <div className="flex items-baseline gap-3 text-white">
                                        <div className="flex items-center gap-1">
                                            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                                            <span className="text-sm font-bold">성공 {parsedOrders.filter(o => o.internalProductId).length}</span>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <span className="w-2 h-2 rounded-full bg-red-500"></span>
                                            <span className="text-sm font-bold">미매칭 {parsedOrders.filter(o => !o.internalProductId).length}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <button onClick={handleSync}
                                className="px-10 h-12 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-black shadow-lg shadow-teal-900/40 transition-all hover:scale-105 text-sm flex items-center gap-2">
                                <span className="material-symbols-rounded text-lg">cloud_sync</span>
                                <span className="text-sm uppercase tracking-tight">주문 연동 실행하기</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Quick Register Modal */}
            {isQuickRegOpen && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={() => setIsQuickRegOpen(false)}></div>
                    <div className="bg-white rounded-3xl w-full max-w-[450px] shadow-2xl relative overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="bg-slate-900 px-6 py-4 flex justify-between items-center">
                            <h3 className="text-white font-bold text-lg">신규 상품 간편 등록</h3>
                            <button onClick={() => setIsQuickRegOpen(false)} className="text-slate-400 hover:text-white"><span className="material-symbols-rounded">close</span></button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="text-[10px] font-black text-slate-400 uppercase mb-1 block ml-1">쇼핑몰 상품명</label>
                                <input value={quickRegData.name} readOnly className="w-full h-10 px-3 rounded-xl bg-slate-50 border-none font-bold text-sm text-slate-500" />
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-slate-400 uppercase mb-1 block ml-1">내부 등록명 (수정가능)</label>
                                <div className="flex gap-2">
                                    <select value={quickRegData.tag} onChange={e => setQuickRegData({ ...quickRegData, tag: e.target.value })}
                                        className="w-24 h-10 px-2 rounded-xl bg-slate-100 border-none font-bold text-sm">
                                        <option value="">(태그없음)</option>
                                        <option value="특판">특판</option>
                                        <option value="온라인">온라인</option>
                                    </select>
                                    <input value={quickRegData.name} onChange={e => setQuickRegData({ ...quickRegData, name: e.target.value })}
                                        className="flex-1 h-10 px-3 rounded-xl bg-slate-100 border-none font-bold text-sm focus:ring-2 focus:ring-teal-500" />
                                </div>
                            </div>
                            <div className="flex gap-3">
                                <div className="flex-1">
                                    <label className="text-[10px] font-black text-slate-400 uppercase mb-1 block ml-1">규격</label>
                                    <input value={quickRegData.spec} onChange={e => setQuickRegData({ ...quickRegData, spec: e.target.value })}
                                        className="w-full h-10 px-3 rounded-xl bg-slate-100 border-none font-bold text-sm focus:ring-2 focus:ring-teal-500" />
                                </div>
                                <div className="flex-1">
                                    <label className="text-[10px] font-black text-slate-400 uppercase mb-1 block ml-1">단가</label>
                                    <input value={quickRegData.price} onChange={e => setQuickRegData({ ...quickRegData, price: e.target.value })}
                                        className="w-full h-10 px-3 rounded-xl bg-slate-100 border-none font-bold text-sm text-right focus:ring-2 focus:ring-teal-500" />
                                </div>
                            </div>
                        </div>
                        <div className="p-4 bg-slate-50 flex justify-end gap-2 border-t border-slate-100">
                            <button onClick={() => setIsQuickRegOpen(false)} className="px-4 py-2 rounded-xl text-slate-500 font-bold hover:bg-slate-200 text-xs">취소</button>
                            <button onClick={handleQuickRegister} className="px-6 py-2 rounded-xl bg-teal-600 text-white font-bold hover:bg-teal-500 shadow-lg shadow-teal-200 text-xs">등록 및 매칭</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Mapping Rules Modal */}
            {isMappingModalOpen && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={() => setIsMappingModalOpen(false)}></div>
                    <div className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl relative overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[80vh]">
                        <div className="bg-slate-900 px-6 py-4 flex justify-between items-center shrink-0">
                            <h3 className="text-white font-bold text-lg">상품 매칭 규칙 관리</h3>
                            <button onClick={() => setIsMappingModalOpen(false)} className="text-slate-400 hover:text-white"><span className="material-symbols-rounded">close</span></button>
                        </div>
                        <div className="flex-1 overflow-auto p-0">
                            <table className="w-full text-xs">
                                <thead className="bg-slate-50 sticky top-0 border-b border-slate-200">
                                    <tr>
                                        <th className="px-4 py-3 text-left font-black text-slate-500">쇼핑몰 상품명</th>
                                        <th className="px-4 py-3 text-left font-black text-slate-500">연결된 내부 상품</th>
                                        <th className="px-4 py-3 w-16 text-center font-black text-slate-500">삭제</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {Object.entries(mappings).map(([key, val]) => {
                                        const pid = val.id || val;
                                        const found = productList.find(p => p.product_id == pid);
                                        return (
                                            <tr key={key} className="hover:bg-slate-50">
                                                <td className="px-4 py-3 text-slate-600 font-medium">{key}</td>
                                                <td className="px-4 py-3 text-blue-600 font-bold">
                                                    {found ? `${found.product_name} (${found.specification})` : `ID: ${pid} (미확인)`}
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                    <button onClick={() => {
                                                        const newM = { ...mappings };
                                                        delete newM[key];
                                                        saveLocalMappings(newM);
                                                    }} className="w-8 h-8 rounded-lg hover:bg-red-50 text-slate-300 hover:text-red-500 transition-colors flex items-center justify-center mx-auto">
                                                        <span className="material-symbols-rounded text-base">delete</span>
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            <ExcelUploadModal
                isOpen={isExcelCustomModalOpen}
                onClose={() => setIsExcelCustomModalOpen(false)}
                fileData={uploadFileData}
                onImport={handleImportFromExcel}
            />
        </div>
    );
};

export default SalesOnlineSync;

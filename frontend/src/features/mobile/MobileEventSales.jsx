import React, { useState, useEffect, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Capacitor } from '@capacitor/core';
import { scanNativeQr, stopNativeQr } from '../../utils/nativeScanner';
import { useNavigate } from 'react-router-dom';
import { callBridge } from '../../utils/apiBridge';
import { useModal } from '../../contexts/ModalContext';
import {
    ShoppingCart,
    ArrowLeft,
    Plus,
    Minus,
    Trash2,
    CreditCard,
    User,
    Tag,
    LayoutDashboard,
    ClipboardList,
    PlusCircle,
    Store,
    QrCode,
    Percent,
    ChevronDown,
    CalendarDays,
    Save,
    X
} from 'lucide-react';

const MobileEventSales = () => {
    const navigate = useNavigate();
    const { showAlert, showConfirm } = useModal();
    const [products, setProducts] = useState([]);
    const [events, setEvents] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [cart, setCart] = useState([]);
    const [customerName, setCustomerName] = useState('');
    const [paymentMethod, setPaymentMethod] = useState('현금');
    const [selectedEventId, setSelectedEventId] = useState('');
    const [discountRate, setDiscountRate] = useState(0);
    const [isScanning, setIsScanning] = useState(false);
    const [isScannerOpen, setIsScannerOpen] = useState(false);
    const [scannerValue, setScannerValue] = useState('');
    const scannerInputRef = useRef(null);
    const html5QrCodeRef = useRef(null);
    const fileInputRef = useRef(null);
    const qtyInputRef = useRef(null);
    const [cameraError, setCameraError] = useState(null);

    useEffect(() => {
        let isInstanceMounted = true;

        if (isScannerOpen) {
            // Native Scanner logic
            if (Capacitor.isNativePlatform()) {
                const runNativeScan = async () => {
                    try {
                        const result = await scanNativeQr();
                        if (result.content && isInstanceMounted) {
                            processQrCode(result.content);
                        }
                    } catch (err) {
                        console.error("Native scan error", err);
                        setCameraError("네이티브 스캐너 실행 실패: " + err.message);
                    }
                };
                runNativeScan();
                return () => {
                    isInstanceMounted = false;
                    stopNativeQr();
                };
            }

            const timer = setTimeout(async () => {
                if (!isInstanceMounted) return;
                if (scannerInputRef.current) scannerInputRef.current.focus();

                const readerElement = document.getElementById("reader-event");
                if (!readerElement) return;

                try {
                    // Cleanup existing
                    if (html5QrCodeRef.current) {
                        try {
                            if (html5QrCodeRef.current.isScanning) {
                                await html5QrCodeRef.current.stop();
                            }
                        } catch (e) {
                            console.warn("Cleanup failed", e);
                        }
                    }

                    const html5QrCode = new Html5Qrcode("reader-event");
                    html5QrCodeRef.current = html5QrCode;

                    const config = { fps: 15, qrbox: { width: 250, height: 250 }, aspectRatio: 1.0, disableFlip: false };

                    try {
                        await html5QrCode.start(
                            { facingMode: "environment" },
                            config,
                            (decodedText) => {
                                if (isInstanceMounted) {
                                    setCameraError(null);
                                    processQrCode(decodedText);
                                }
                            },
                            (errorMessage) => { /* quiet */ }
                        );
                    } catch (startErr) {
                        console.log("Back camera failed, trying front", startErr);
                        await html5QrCode.start(
                            { facingMode: "user" },
                            config,
                            (decodedText) => {
                                if (isInstanceMounted) {
                                    setCameraError(null);
                                    processQrCode(decodedText);
                                }
                            },
                            () => { }
                        );
                    }
                } catch (err) {
                    console.error("Scanner initialization failed:", err);
                    if (!window.isSecureContext && window.location.hostname !== 'localhost') {
                        setCameraError("🔐 보안 연결(HTTPS)이 아닙니다. WiFi(HTTP) 접속 중에는 실시간 카메라를 사용할 수 없습니다.");
                    } else {
                        setCameraError(`🔐 카메라 연결 실패: ${err.message || '권한 요청을 확인해주세요'}`);
                    }
                }
            }, 500);

            return () => {
                isInstanceMounted = false;
                clearTimeout(timer);
                if (html5QrCodeRef.current) {
                    const currentScanner = html5QrCodeRef.current;
                    if (currentScanner.getState && currentScanner.getState() === 2) {
                        currentScanner.stop().catch(e => console.error("Stop failed", e));
                    } else if (currentScanner.isScanning) {
                        currentScanner.stop().catch(e => console.error("Stop failed", e));
                    }
                }
            };
        }
    }, [isScannerOpen]);

    const handleFileScan = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
            const html5QrCode = new Html5Qrcode("reader-event");
            const result = await html5QrCode.scanFileV2(file, false);
            processQrCode(result.decodedText);
            setIsScannerOpen(false);
        } catch (err) {
            alert("사진에서 코드를 읽을 수 없습니다. 다시 찍어주세요.");
        }
    };
    const [showInputSection, setShowInputSection] = useState(true);

    const initialInputState = {
        product: '',
        qty: 1,
        price: '',
        amount: 0
    };
    const [inputState, setInputState] = useState(initialInputState);

    const formatCurrency = (amount) => {
        if (typeof amount !== 'number') {
            amount = parseFloat(String(amount).replace(/[^0-9.-]/g, '')) || 0;
        }
        return amount.toLocaleString('ko-KR');
    };

    // Persistence: Load from localStorage on mount
    useEffect(() => {
        const savedCart = localStorage.getItem('event_cart');
        const savedEvent = localStorage.getItem('event_id');
        const savedDiscount = localStorage.getItem('event_discount');

        if (savedCart) setCart(JSON.parse(savedCart));
        if (savedEvent) setSelectedEventId(savedEvent);
        if (savedDiscount) setDiscountRate(parseInt(savedDiscount));

        loadBaseData();
    }, []);

    // Persistence: Save to localStorage on change
    useEffect(() => {
        localStorage.setItem('event_cart', JSON.stringify(cart));
    }, [cart]);

    useEffect(() => {
        localStorage.setItem('event_id', selectedEventId);
    }, [selectedEventId]);

    useEffect(() => {
        localStorage.setItem('event_discount', discountRate.toString());
    }, [discountRate]);

    const loadBaseData = async () => {
        try {
            const [pRes, eRes] = await Promise.all([
                callBridge('get_product_list'),
                callBridge('get_all_events')
            ]);
            // Filter only finished products (완제품)
            const finishedProducts = (pRes || []).filter(p =>
                (!p.item_type || p.item_type === 'product') &&
                p.status !== '단종상품'
            );
            setProducts(finishedProducts);
            setEvents(eRes || []);
        } catch (e) {
            console.error(e);
            showAlert("데이터 로드 실패", "목록 정보를 가져오지 못했습니다.");
        } finally {
            setIsLoading(false);
        }
    };

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        let newState = { ...inputState, [name]: value };

        if (name === 'product') {
            const p = products.find(prod => prod.product_name === value);
            if (p) {
                newState.price = p.unit_price;
            }
        }

        const qty = Number(newState.qty) || 0;
        const price = Number(String(newState.price).replace(/[^0-9]/g, '')) || 0;
        newState.amount = qty * price;

        setInputState(newState);
    };

    const handleAdd = () => {
        if (!selectedEventId) return showAlert("행사 미선택", "진행 중인 행사를 먼저 선택해 주세요.");
        if (!inputState.product) return showAlert("품목 미선택", "품목을 먼저 선택해 주세요.");
        if (Number(inputState.qty) <= 0) return showAlert("수량 확인", "수량은 1개 이상이어야 합니다.");

        const product = products.find(p => p.product_name === inputState.product);
        if (!product) return;

        const existing = cart.find(item => item.product_id === product.product_id);
        const finalPrice = Number(String(inputState.price).replace(/[^0-9]/g, ''));

        if (existing) {
            setCart(cart.map(item =>
                item.product_id === product.product_id
                    ? { ...item, quantity: item.quantity + Number(inputState.qty), unit_price: finalPrice }
                    : item
            ));
        } else {
            setCart([...cart, { ...product, quantity: Number(inputState.qty), unit_price: finalPrice }]);
        }

        setInputState(initialInputState);
    };

    const handleQrScan = () => {
        setIsScannerOpen(true);
        setScannerValue('');
    };

    const processQrCode = async (code) => {
        if (!code) return;
        const rawCode = code.trim();
        setIsScanning(true);

        console.log("Processing Scanned Content:", rawCode);

        // Stop scanner immediately
        if (html5QrCodeRef.current) {
            try {
                const state = html5QrCodeRef.current.getState ? html5QrCodeRef.current.getState() : 0;
                if (state === 2 || html5QrCodeRef.current.isScanning) {
                    await html5QrCodeRef.current.stop();
                }
            } catch (e) {
                console.warn("Stop on success failed", e);
            }
        }

        const parts = rawCode.split('|').map(p => p.trim());
        let foundProduct = null;

        if (parts[0] === 'PRODUCT' && parts[1]) {
            const pid = parseInt(parts[1]);
            const nameInQr = parts[3];
            const specInQr = (parts[4] === 'NA' || !parts[4]) ? '' : parts[4];

            foundProduct = products.find(p => Number(p.product_id) === pid);

            if (!foundProduct || (foundProduct && nameInQr && foundProduct.product_name !== nameInQr)) {
                const matchedNameSpec = products.find(p =>
                    p.product_name === nameInQr &&
                    (specInQr ? p.specification === specInQr : true)
                );
                if (matchedNameSpec) foundProduct = matchedNameSpec;
            }
        } else if (parts[0] === 'HARVEST' && parts[3]) {
            const name = parts[3];
            const gradeOrSpec = parts[4] || '';

            foundProduct = products.find(p =>
                p.product_name === name &&
                (p.specification === gradeOrSpec || (p.specification && gradeOrSpec && p.specification.includes(gradeOrSpec)))
            );

            if (!foundProduct) {
                const sameNameProducts = products.filter(p => p.product_name === name);
                if (sameNameProducts.length === 1) {
                    foundProduct = sameNameProducts[0];
                } else if (sameNameProducts.length > 1) {
                    showAlert("인식 모호함", `[${name}] 상품이 여러 규격으로 존재합니다. 목록에서 직접 선택해 주세요.`);
                    setIsScanning(false);
                    return;
                }
            }
        } else if (rawCode.includes('ID:')) {
            const idPart = rawCode.split('ID:').pop().trim();
            const pid = parseInt(idPart.replace(/[^0-9]/g, ''));
            foundProduct = products.find(p => Number(p.product_id) === pid);
        } else {
            foundProduct = products.find(p =>
                (p.product_code && p.product_code === rawCode) ||
                p.product_name === rawCode ||
                `${p.product_name} ${p.specification || ''}`.trim() === rawCode ||
                `${p.product_name}(${p.specification || ''})`.trim() === rawCode
            );

            if (!foundProduct && /^\d+$/.test(rawCode)) {
                const pid = parseInt(rawCode);
                foundProduct = products.find(p => Number(p.product_id) === pid);
            }
        }

        setIsScanning(false);
        if (foundProduct) {
            handleInputChange({ target: { name: 'product', value: foundProduct.product_name } });
            setIsScannerOpen(false);
            // Auto-focus quantity for faster entry
            setTimeout(() => {
                qtyInputRef.current?.focus();
                qtyInputRef.current?.select();
            }, 300);
        } else {
            showAlert("인식 실패", `[${rawCode}] 상품을 찾을 수 없습니다.`);
        }
    };

    const updateQuantity = (productId, delta) => {
        setCart(cart.map(item => {
            if (item.product_id === productId) {
                const newQty = Math.max(0, item.quantity + delta);
                return { ...item, quantity: newQty };
            }
            return item;
        }).filter(item => item.quantity > 0));
    };

    const subTotal = cart.reduce((sum, item) => sum + (item.unit_price * item.quantity), 0);
    const discountAmount = Math.round(subTotal * (discountRate / 100));
    const totalAmount = subTotal - discountAmount;

    const handleCheckout = async () => {
        if (!selectedEventId) {
            showAlert("행사 미선택", "진행 중인 행사를 먼저 선택해 주세요.");
            return;
        }
        if (cart.length === 0) {
            showAlert("체크아웃 실패", "장바구니가 비어 있습니다.");
            return;
        }

        const selectedEvent = events.find(e => e.event_id === selectedEventId);

        const confirmed = await showConfirm(
            "판매 데이터 전송",
            `${selectedEvent ? '[' + selectedEvent.event_name + '] ' : ''}총 ${totalAmount.toLocaleString()}원 결제 내역을 농장 PC로 전송할까요?`
        );

        if (!confirmed) return;

        try {
            const salesData = cart.map(item => ({
                sales_id: "",
                customer_id: "EVENT_GUEST",
                product_name: item.product_name,
                specification: item.specification,
                unit_price: item.unit_price,
                quantity: item.quantity,
                total_amount: Math.round((item.unit_price * item.quantity) * (1 - discountRate / 100)),
                memo: `[특판:${selectedEvent?.event_name || '미설정'}] ${customerName ? '고객:' + customerName : ''} / 할인:${discountRate}% / 결제:${paymentMethod}`,
                status: '결제완료',
                payment_status: '입금완료',
                discount_rate: discountRate
            }));

            const res = await callBridge('save_general_sales_batch', { sales: salesData });

            if (res && res.success) {
                showAlert("전송 성공", "판매 기록을 농장 본체에 안전하게 저장했습니다.");
                setCart([]);
                setCustomerName('');
                // Note: discountRate remains the same for the next customer
            } else {
                throw new Error(res?.error || "Unknown error");
            }
        } catch (e) {
            console.error(e);
            showAlert("저장 실패", "데이터 전송 중 오류가 발생했습니다. 네트워크를 확인해 주세요.");
        }
    };

    return (
        <div className="flex flex-col h-full bg-[#f8fafc] overflow-hidden">
            {/* Header */}
            <div className="bg-white px-5 pt-6 pb-4 border-b border-slate-100 shrink-0">
                <div className="flex justify-between items-center mb-4">
                    <h1 className="text-xl font-black text-slate-900 tracking-tight">특판접수</h1>
                    <div className="flex gap-2">
                        <button
                            onClick={() => navigate('/mobile-dashboard')}
                            className="p-2 bg-slate-50 text-slate-400 rounded-xl hover:text-indigo-600 transition-colors"
                        >
                            <ArrowLeft size={18} />
                        </button>
                    </div>
                </div>

                {/* Event Selector */}
                <div className="relative">
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-indigo-500 pointer-events-none">
                        <CalendarDays size={18} />
                    </div>
                    <select
                        className="w-full h-12 bg-slate-50 border-none rounded-2xl pl-12 pr-10 text-sm font-black text-slate-700 appearance-none focus:ring-2 focus:ring-indigo-500 transition-all"
                        value={selectedEventId}
                        onChange={(e) => setSelectedEventId(e.target.value)}
                    >
                        {events.length === 0 ? (
                            <option value="">등록된 행사가 없습니다</option>
                        ) : (
                            <>
                                <option value="">진행 중인 행사 선택 (필수)</option>
                                {events.map(e => (
                                    <option key={e.event_id} value={e.event_id}>{e.event_name}</option>
                                ))}
                            </>
                        )}
                    </select>
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 pointer-events-none">
                        <ChevronDown size={18} />
                    </div>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto overflow-x-hidden px-5 pt-4 pb-44 space-y-6">
                {/* QR Scanner & Discount Row */}
                <div className="grid grid-cols-2 gap-4">
                    <button
                        onClick={handleQrScan}
                        className={`bg-indigo-600 h-20 rounded-3xl shadow-lg shadow-indigo-100 flex flex-col items-center justify-center gap-1 text-white active:scale-95 transition-all ${isScanning ? 'animate-pulse' : ''}`}
                    >
                        <QrCode size={24} />
                        <span className="text-[11px] font-black">{isScanning ? '인식 중...' : '상품 QR 스캔'}</span>
                    </button>

                    <div className="bg-white h-20 rounded-3xl shadow-sm border border-slate-100 flex flex-col items-center justify-center gap-1 relative overflow-hidden">
                        <div className="flex items-center gap-1">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">적용 할인율</span>
                        </div>
                        <div className="flex items-center gap-3 bg-slate-50 p-1.5 rounded-2xl border border-slate-100">
                            <button
                                type="button"
                                onClick={() => setDiscountRate(Math.max(0, discountRate - 1))}
                                className="w-10 h-10 flex items-center justify-center bg-white rounded-xl text-rose-500 shadow-sm border border-slate-200 active:scale-90 transition-all"
                            >
                                <span className="text-2xl font-black leading-none select-none">-</span>
                            </button>
                            <div className="flex items-center justify-center min-w-[3rem]">
                                <input
                                    type="number"
                                    className="w-10 text-center bg-transparent border-none text-xl font-black text-rose-600 p-0 focus:ring-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                    value={discountRate}
                                    onChange={(e) => setDiscountRate(Math.min(100, Math.max(0, parseInt(e.target.value) || 0)))}
                                />
                                <Percent size={14} className="text-rose-400 ml-0.5" strokeWidth={3} />
                            </div>
                            <button
                                type="button"
                                onClick={() => setDiscountRate(Math.min(100, discountRate + 1))}
                                className="w-10 h-10 flex items-center justify-center bg-rose-500 rounded-xl text-white active:scale-90 transition-all shadow-md shadow-rose-100"
                            >
                                <span className="text-2xl font-black leading-none select-none">+</span>
                            </button>
                        </div>
                    </div>
                </div>

                {/* Quick Selection List */}
                <div className={`space-y-3 transition-opacity ${!selectedEventId ? 'opacity-30 pointer-events-none' : ''}`}>
                    <div className="flex items-center gap-2 text-slate-400 font-black text-xs uppercase tracking-widest pl-1">
                        <Plus size={12} className="text-indigo-500" />
                        <span>품목 퀵 선택</span>
                    </div>
                    <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
                        {products.map(p => (
                            <button
                                key={p.product_id}
                                onClick={() => {
                                    handleInputChange({ target: { name: 'product', value: p.product_name } });
                                }}
                                className="bg-white px-5 py-3 rounded-2xl shadow-sm border border-slate-100 whitespace-nowrap active:scale-95 transition-all flex flex-col items-center min-w-[120px]"
                            >
                                <div className="text-sm font-black text-slate-700">{p.product_name}</div>
                                {p.specification && <div className="text-[10px] text-slate-400 font-bold mb-1">{p.specification}</div>}
                                <div className="text-[10px] text-indigo-500 font-black">{formatCurrency(p.unit_price)}원</div>
                            </button>
                        ))}
                    </div>
                </div>

                {!selectedEventId && (
                    <div className="bg-amber-50 border border-amber-100 p-4 rounded-2xl flex items-center gap-3 animate-pulse">
                        <div className="w-10 h-10 bg-amber-500 rounded-xl flex items-center justify-center text-white shrink-0">
                            <Tag size={20} />
                        </div>
                        <div className="text-sm font-black text-amber-900 leading-tight">
                            상단 대기 중인 행사를 먼저 선택해야<br />판매 등록이 가능합니다.
                        </div>
                    </div>
                )}

                {/* Quick Input Toggle */}
                <div className="flex items-center justify-between px-2">
                    <h2 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em]">접수 품목 ({cart.length})</h2>
                    <button
                        onClick={() => setShowInputSection(!showInputSection)}
                        className={`text-[11px] font-black h-8 px-4 rounded-full transition-all ${showInputSection ? 'bg-indigo-600 text-white shadow-lg' : 'bg-white border border-slate-100 text-indigo-600'}`}
                    >
                        {showInputSection ? '접기' : '품목 추가'}
                    </button>
                </div>

                {/* Sales Input Form */}
                {showInputSection && (
                    <div className={`bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-xl space-y-5 animate-in slide-in-from-top-4 duration-300 transition-opacity ${!selectedEventId ? 'opacity-30 pointer-events-none' : ''}`}>
                        <div>
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-tighter ml-1 mb-1.5 block">상품 선택</label>
                            <select
                                name="product"
                                className="w-full h-12 bg-slate-50 border-none rounded-2xl px-5 text-sm font-black focus:ring-2 focus:ring-indigo-500 transition-all appearance-none"
                                value={inputState.product}
                                onChange={handleInputChange}
                            >
                                <option value="">품목을 선택하세요</option>
                                {products.map(p => (
                                    <option key={p.product_id} value={p.product_name}>
                                        {p.product_name} ({p.specification || '규격 없음'}) - {formatCurrency(p.unit_price)}원
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-tighter ml-1 mb-1.5 block">단가</label>
                                <input
                                    name="price"
                                    className="w-full h-12 bg-slate-50 border-none rounded-2xl text-sm font-black focus:ring-2 focus:ring-indigo-500 transition-all text-right px-4"
                                    value={formatCurrency(inputState.price)}
                                    onChange={(e) => handleInputChange({ target: { name: 'price', value: e.target.value.replace(/[^0-9]/g, '') } })}
                                    placeholder="0"
                                />
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-tighter ml-1 mb-1.5 block">수량</label>
                                <div className="h-12 bg-slate-50 rounded-2xl flex items-center px-1 border border-slate-100 overflow-hidden">
                                    <button
                                        type="button"
                                        onClick={() => handleInputChange({ target: { name: 'qty', value: Math.max(1, Number(inputState.qty) - 1) } })}
                                        className="w-10 h-10 shrink-0 flex items-center justify-center bg-white rounded-xl shadow-sm border border-slate-200 text-slate-700 active:scale-90 transition-all"
                                    >
                                        <span className="text-2xl font-black leading-none select-none">-</span>
                                    </button>
                                    <input
                                        ref={qtyInputRef}
                                        type="number"
                                        name="qty"
                                        className="flex-1 w-full bg-transparent border-none text-center font-black text-lg text-slate-800 focus:ring-0 p-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                        value={inputState.qty}
                                        onChange={handleInputChange}
                                        inputMode="numeric"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => handleInputChange({ target: { name: 'qty', value: Number(inputState.qty) + 1 } })}
                                        className="w-10 h-10 shrink-0 flex items-center justify-center bg-indigo-600 rounded-xl shadow-sm text-white active:scale-90 transition-all"
                                    >
                                        <span className="text-2xl font-black leading-none select-none">+</span>
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div>
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-tighter ml-1 mb-1.5 block">합계 금액</label>
                            <div className="h-12 bg-indigo-50/50 rounded-2xl flex items-center px-4 justify-between border border-indigo-100/50">
                                <ShoppingCart size={18} className="text-indigo-300" />
                                <span className="text-lg font-black text-indigo-600">{formatCurrency(inputState.amount)}원</span>
                            </div>
                        </div>

                        <button
                            onClick={handleAdd}
                            className="w-full h-14 bg-indigo-600 text-white rounded-2xl font-black shadow-lg shadow-indigo-100 flex items-center justify-center gap-3 active:scale-[0.98] transition-all"
                        >
                            <Plus size={20} />
                            담기
                        </button>
                    </div>
                )}

                {/* Shopping Cart Area */}
                <div className="space-y-3">
                    <div className="flex items-center justify-between px-1">
                        <div className="flex items-center gap-2 text-slate-400 font-black text-xs uppercase tracking-widest">
                            <ShoppingCart size={12} />
                            <span>담긴 상품 ({cart.length})</span>
                        </div>
                        <button
                            onClick={() => {
                                if (cart.length > 0) {
                                    setCart([]);
                                }
                            }}
                            disabled={cart.length === 0}
                            className={`flex items-center gap-1 font-black text-xs px-2 py-1.5 rounded-lg transition-all active:scale-95 ${cart.length > 0 ? 'text-rose-500 bg-rose-50 border border-rose-100 shadow-sm' : 'text-slate-300 bg-slate-50 opacity-50'}`}
                        >
                            <Trash2 size={12} />
                            <span>전체 비우기</span>
                        </button>
                    </div>

                    {cart.length === 0 ? (
                        <div className="bg-white rounded-3xl p-10 flex flex-col items-center justify-center text-slate-300 border border-slate-100 border-dashed">
                            <QrCode size={40} className="mb-2 opacity-20" />
                            <span className="text-sm font-bold text-center px-4">상품 QR을 스캔하거나 하단 리스트에서 선택하세요</span>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {cart.map(item => (
                                <div key={item.product_id} className="bg-white px-5 py-3 rounded-[1.5rem] border border-slate-100 shadow-sm flex items-center gap-4 animate-in fade-in slide-in-from-left-2 transition-all">
                                    <div className="flex-1 min-w-0 pr-4">
                                        <div className="text-sm font-black text-slate-800 truncate">{item.product_name}</div>
                                        {item.specification && <div className="text-[10px] text-slate-400 font-bold mt-0.5">{item.specification}</div>}
                                        <div className="flex items-center gap-2 mt-1">
                                            <span className="text-[10px] text-slate-400 font-bold line-through">{item.unit_price.toLocaleString()}원</span>
                                            <span className="text-[10px] text-indigo-600 font-black">
                                                {Math.round(item.unit_price * (1 - discountRate / 100)).toLocaleString()}원
                                            </span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 bg-slate-50 p-1.5 rounded-xl border border-slate-100 scale-95 origin-right">
                                        <button
                                            type="button"
                                            onClick={() => updateQuantity(item.product_id, -1)}
                                            className="w-7 h-7 rounded-lg bg-white shadow-sm border border-slate-200 flex items-center justify-center text-slate-700 active:scale-90"
                                        ><span className="text-xl font-black leading-none select-none">-</span></button>
                                        <span className="text-sm font-black text-slate-800 min-w-[20px] text-center">{item.quantity}</span>
                                        <button
                                            type="button"
                                            onClick={() => updateQuantity(item.product_id, 1)}
                                            className="w-7 h-7 rounded-lg bg-indigo-600 shadow-sm flex items-center justify-center text-white active:scale-90"
                                        ><span className="text-xl font-black leading-none select-none">+</span></button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Additional Info */}
                <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 space-y-4">
                    <div className="space-y-2">
                        <div className="flex items-center gap-2 text-slate-800 font-black text-sm pl-1">
                            <CreditCard size={16} className="text-indigo-500" />
                            <span>결제 수단</span>
                        </div>
                        <div className="flex gap-2">
                            {['현금', '카드', '계좌이체'].map(m => (
                                <button
                                    key={m}
                                    onClick={() => setPaymentMethod(m)}
                                    className={`flex-1 h-12 rounded-xl font-black text-sm transition-all ${paymentMethod === m ? 'bg-indigo-600 text-white shadow-md' : 'bg-slate-50 text-slate-400'}`}
                                >
                                    {m}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="space-y-2">
                        <div className="flex items-center gap-2 text-slate-800 font-black text-sm pl-1">
                            <ClipboardList size={16} className="text-indigo-500" />
                            <span>특이사항 메모 (선택)</span>
                        </div>
                        <input
                            type="text"
                            placeholder="빨간 모자 손님, 대량 구매 등"
                            className="w-full h-12 bg-slate-50 border-none rounded-2xl px-4 text-sm font-bold text-slate-700 placeholder:text-slate-300"
                            value={customerName}
                            onChange={(e) => setCustomerName(e.target.value)}
                        />
                    </div>
                </div>
            </div>

            {/* Bottom Sticky Action Bar */}
            <div className="fixed bottom-0 left-0 right-0 z-50 animate-in slide-in-from-bottom-full duration-500">
                <div className="bg-white border-t border-slate-100 p-5 pb-24 shadow-[0_-10px_40px_rgba(0,0,0,0.05)]">
                    <div className="flex gap-4 items-center">
                        <div className="flex-1 flex flex-col justify-center px-4 h-14 bg-slate-50 rounded-[1.5rem]">
                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">최종 결제 금액</span>
                            <span className="text-lg font-black text-indigo-600 leading-none">{totalAmount.toLocaleString()}원</span>
                        </div>
                        <button
                            onClick={handleCheckout}
                            disabled={cart.length === 0}
                            className={`w-20 h-14 bg-indigo-600 text-white rounded-[1.5rem] flex items-center justify-center shadow-lg shadow-indigo-100 active:scale-[0.95] transition-all ${cart.length === 0 ? 'opacity-50' : ''}`}
                        >
                            <Save size={24} />
                        </button>
                    </div>
                </div>
            </div>

            {/* QR Scanner Overlay */}
            {
                isScannerOpen && (
                    <div className="fixed inset-0 z-[100] bg-slate-900 flex flex-col items-center justify-center p-6 animate-in fade-in duration-300">
                        {/* Camera View Area */}
                        <div className="relative w-full max-w-xs aspect-square border-2 border-indigo-500/50 rounded-[3rem] overflow-hidden bg-slate-950 shadow-2xl flex items-center justify-center">
                            <div id="reader-event" className="absolute inset-0 z-0"></div>

                            {cameraError && (
                                <div className="z-20 flex flex-col items-center gap-4 px-6 py-4 bg-slate-800/95 text-white rounded-3xl text-center mx-4 border border-white/10 shadow-2xl">
                                    <p className="text-xs font-black leading-relaxed">
                                        {cameraError}
                                    </p>
                                    <button
                                        onClick={() => fileInputRef.current?.click()}
                                        className="px-6 py-3 bg-indigo-600 rounded-2xl text-sm font-black shadow-lg active:scale-95 transition-all"
                                    >
                                        카메라 촬영으로 인식하기
                                    </button>
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept="image/*"
                                        capture="environment"
                                        className="hidden"
                                        onChange={handleFileScan}
                                    />
                                </div>
                            )}

                            {/* Scanning Overlay Decoration */}
                            <div className="absolute inset-0 pointer-events-none z-10">
                                <div className="absolute inset-x-0 h-1 bg-indigo-500 shadow-[0_0_15px_rgba(99,102,241,0.8)] animate-scan" />
                                <div className="absolute top-8 left-8 w-8 h-8 border-t-4 border-l-4 border-white rounded-tl-lg" />
                                <div className="absolute top-8 right-8 w-8 h-8 border-t-4 border-r-4 border-white rounded-tr-lg" />
                                <div className="absolute bottom-8 left-8 w-8 h-8 border-b-4 border-l-4 border-white rounded-bl-lg" />
                                <div className="absolute bottom-8 right-8 w-8 h-8 border-b-4 border-r-4 border-white rounded-br-lg" />
                            </div>
                        </div>

                        <div className="mt-12 text-center text-white space-y-4 w-full">
                            <h3 className="text-xl font-black">특판 품목 스캔 중</h3>
                            <p className="text-sm text-slate-400">사각형 안에 상품 QR 코드를 맞춰주세요.</p>

                            <div className="max-w-xs mx-auto pt-6 space-y-2">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block">직접 코드 입력 (인식 불가 시)</label>
                                <div className="relative opacity-60 focus-within:opacity-100 transition-opacity">
                                    <input
                                        ref={scannerInputRef}
                                        type="text"
                                        className="w-full h-12 bg-white/5 border border-white/10 rounded-2xl px-6 text-white text-center font-black focus:border-indigo-500 focus:ring-0 transition-all outline-none text-xs"
                                        placeholder="여기에 직접 입력"
                                        value={scannerValue}
                                        onChange={(e) => setScannerValue(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && processQrCode(scannerValue)}
                                    />
                                </div>
                            </div>
                        </div>

                        <button
                            onClick={() => setIsScannerOpen(false)}
                            className="mt-auto mb-12 w-16 h-16 bg-white/10 hover:bg-white/20 text-white rounded-full flex items-center justify-center transition-all active:scale-90"
                        >
                            <X size={32} />
                        </button>

                        <style dangerouslySetInnerHTML={{
                            __html: `
                        @keyframes scan { 0% { top: 0; } 50% { top: 100%; } 100% { top: 0; } }
                        .animate-scan { position: absolute; animation: scan 3s infinite linear; }
                        #reader-event video { 
                            object-fit: cover !important;
                            height: 100% !important;
                            width: 100% !important;
                        }
                    `}} />
                    </div>
                )
            }
        </div >
    );
};

export default MobileEventSales;

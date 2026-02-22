import React, { useState, useEffect, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Capacitor } from '@capacitor/core';
import { scanNativeQr, stopNativeQr } from '../../utils/nativeScanner';
import { useNavigate } from 'react-router-dom';
import { callBridge } from '../../utils/apiBridge';
import { useModal } from '../../contexts/ModalContext';
import {
    Plus,
    Minus,
    Trash2,
    CalendarDays,
    RefreshCw,
    Tag,
    ShoppingCart,
    CreditCard,
    ClipboardList,
    Save,
    History,
    UserPlus,
    X as XIcon,
    QrCode,
    Percent,
    ChevronDown
} from 'lucide-react';
import { formatPhoneNumber } from '../../utils/common';

// Sub-components
import EventCustomerSearch from './components/EventSales/EventCustomerSearch';
import EventSelectedInfo from './components/EventSales/EventSelectedInfo';
import EventCartHeader from './components/EventSales/EventCartHeader';
import EventProductQuickSelect from './components/EventSales/EventProductQuickSelect';
import EventProductInputSection from './components/EventSales/EventProductInputSection';
import EventCartItem from './components/EventSales/EventCartItem';
import EventRegistrationModal from './components/EventSales/EventRegistrationModal';
import EventQrScannerUI from './components/EventSales/EventQrScannerUI';
import EventCheckoutSummary from './components/EventSales/EventCheckoutSummary';

const MobileEventSales = () => {
    const navigate = useNavigate();
    const { showAlert, showConfirm } = useModal();
    const [products, setProducts] = useState([]);
    const [events, setEvents] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [cart, setCart] = useState([]);
    const [customer, setCustomer] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [isSearching, setIsSearching] = useState(false);
    const [showRegisterForm, setShowRegisterForm] = useState(false);
    const [newCustomer, setNewCustomer] = useState({ name: '', mobile: '' });
    const [memo, setMemo] = useState('');
    const [paymentMethod, setPaymentMethod] = useState('현금');
    const [selectedEventId, setSelectedEventId] = useState('');
    const [discountRate, setDiscountRate] = useState(0);
    const [isScanning, setIsScanning] = useState(false);
    const [isScannerOpen, setIsScannerOpen] = useState(false);
    const [scannerValue, setScannerValue] = useState('');
    const [inputState, setInputState] = useState({ product: '', price: 0, qty: 1, amount: 0 });
    const [showInputSection, setShowInputSection] = useState(false);
    const scannerInputRef = useRef(null);
    const html5QrCodeRef = useRef(null);
    const fileInputRef = useRef(null);
    const qtyInputRef = useRef(null);
    const [cameraError, setCameraError] = useState(null);

    useEffect(() => {
        let isInstanceMounted = true;

        if (isScannerOpen && !Capacitor.isNativePlatform()) {
            const timer = setTimeout(async () => {
                if (!isInstanceMounted) return;

                const readerElement = document.getElementById("reader-event");
                if (!readerElement) return;

                try {
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
                            (errorMessage) => { }
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
    const initialInputState = {
        product: '',
        qty: 1,
        price: '',
        amount: 0
    };

    const handleSearch = async () => {
        if (!searchQuery.trim()) return;
        setIsSearching(true);
        try {
            const eventResults = await callBridge('search_events_by_name', { name: searchQuery });

            const combined = (eventResults || []).map(e => ({ ...e, _type: 'event' }));

            setSearchResults(combined);
            if (combined.length === 0) {
                // If no event found, we could search customers as fallback or just keep as is
                // But per user request, we focus on events.
            }
        } catch (e) {
            console.error(e);
        } finally {
            setIsSearching(false);
        }
    };

    const handleSelectResult = (item) => {
        if (item._type === 'event') {
            setSelectedEventId(item.event_id);
            // If selecting an event directly, we proceed as guest if no customer selected
            setSearchQuery('');
            setSearchResults([]);
            showAlert('행사 선택', `[${item.event_name}] 행사가 선택되었습니다.`);
        } else {
            setCustomer(item);
            setSearchQuery('');
            setSearchResults([]);
        }
    };

    const handleQuickRegister = async () => {
        if (!newCustomer.name || !newCustomer.mobile) {
            return showAlert('알림', '이름과 연락처를 입력해주세요.');
        }
        try {
            await callBridge('create_customer', {
                name: newCustomer.name,
                mobile: formatPhoneNumber(newCustomer.mobile),
                joinDate: new Date().toISOString().split('T')[0]
            });
            const results = await callBridge('search_customers_by_name', { name: newCustomer.name });
            if (results && results.length > 0) {
                setCustomer(results[0]);
                setShowRegisterForm(false);
                showAlert('성공', '고객이 등록되었습니다.');
            }
        } catch (e) {
            showAlert('오류', `고객 등록 실패: ${e}`);
        }
    };

    const handleReset = () => {
        setCart([]);
        setCustomer(null);
        setSelectedEventId('');
        setDiscountRate(0);
        setInputState(initialInputState);
    };

    const formatCurrency = (amount) => {
        if (typeof amount !== 'number') {
            amount = parseFloat(String(amount).replace(/[^0-9.-]/g, '')) || 0;
        }
        return amount.toLocaleString('ko-KR');
    };

    useEffect(() => {
        const savedCart = localStorage.getItem('event_cart');
        const savedEvent = localStorage.getItem('event_id');
        const savedDiscount = localStorage.getItem('event_discount');

        if (savedCart) setCart(JSON.parse(savedCart));
        if (savedEvent) setSelectedEventId(savedEvent);
        if (savedDiscount) setDiscountRate(parseInt(savedDiscount));

        loadBaseData();
    }, []);

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

    const handleQrScan = async () => {
        if (Capacitor.isNativePlatform()) {
            try {
                const result = await scanNativeQr();
                if (result.content) {
                    processQrCode(result.content);
                }
            } catch (err) {
                console.error("Native scan error", err);
            }
            return;
        }
        setCameraError(null);
        setIsScannerOpen(true);
        setScannerValue('');
    };

    const processQrCode = async (code) => {
        if (!code) return;
        const rawCode = code.trim();
        setIsScanning(true);

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
                salesId: null,
                customerId: customer ? customer.customer_id : "EVENT_GUEST",
                productName: item.product_name,
                specification: item.specification || null,
                unitPrice: Number(item.unit_price),
                quantity: Number(item.quantity),
                totalAmount: Math.round((item.unit_price * item.quantity) * (1 - discountRate / 100)),
                status: '결제완료',
                memo: `[특판:${selectedEvent?.event_name || '미설정'}] ${memo ? '메모:' + memo : ''} / 할인:${discountRate}% / 결제:${paymentMethod}`,
                orderDateStr: new Date().toISOString().split('T')[0],
                paidAmount: Math.round((item.unit_price * item.quantity) * (1 - discountRate / 100)),
                paymentStatus: '입금완료',
                discountRate: discountRate,
                isDirty: "true"
            }));

            const res = await callBridge('save_general_sales_batch', { items: salesData, deleted_ids: [] });

            if (res && res.success) {
                showAlert("전송 성공", "판매 기록을 농장 본체에 안전하게 저장했습니다.");
                handleReset();
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
            <div className="bg-white px-5 pt-10 pb-4 border-b border-slate-100 shrink-0 sticky top-0 z-50">
                <div className="flex justify-start items-center gap-2 mb-4">
                    <h1 className="text-2xl font-black text-slate-900 tracking-tight">특판 접수</h1>
                    <div className="flex-1 flex justify-end">
                        <button
                            onClick={handleReset}
                            className="p-2 bg-slate-50 text-slate-400 rounded-xl hover:text-rose-500 transition-colors"
                        >
                            <History size={18} />
                        </button>
                    </div>
                </div>

                {(!customer && !selectedEventId) ? (
                    <EventCustomerSearch
                        searchQuery={searchQuery}
                        setSearchQuery={setSearchQuery}
                        handleSearch={handleSearch}
                        searchResults={searchResults}
                        handleSelectResult={handleSelectResult}
                        isSearching={isSearching}
                        setShowRegisterForm={setShowRegisterForm}
                    />
                ) : (
                    <EventSelectedInfo
                        customer={customer}
                        setCustomer={setCustomer}
                        events={events}
                        selectedEventId={selectedEventId}
                        setSelectedEventId={setSelectedEventId}
                    />
                )}
            </div>

            <div className="flex-1 overflow-y-auto overflow-x-hidden px-5 pt-4 pb-20 space-y-6">
                {(customer || selectedEventId) && (
                    <>
                        <EventCartHeader
                            isScanning={isScanning}
                            onQrScan={handleQrScan}
                            discountRate={discountRate}
                            setDiscountRate={setDiscountRate}
                        />

                        <EventProductQuickSelect
                            products={products}
                            selectedEventId={selectedEventId}
                            handleInputChange={handleInputChange}
                            formatCurrency={formatCurrency}
                        />

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

                        <div className="flex items-center justify-between px-2">
                            <h2 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em]">접수 품목 ({cart.length})</h2>
                            <button
                                onClick={() => setShowInputSection(!showInputSection)}
                                className={`text-[11px] font-black h-8 px-4 rounded-full transition-all ${showInputSection ? 'bg-indigo-600 text-white shadow-lg' : 'bg-white border border-slate-100 text-indigo-600'}`}
                            >
                                {showInputSection ? '접기' : '품목 추가'}
                            </button>
                        </div>

                        <EventProductInputSection
                            show={showInputSection}
                            products={products}
                            inputState={inputState}
                            handleInputChange={handleInputChange}
                            onAdd={handleAdd}
                            qtyInputRef={qtyInputRef}
                            formatCurrency={formatCurrency}
                            selectedEventId={selectedEventId}
                        />

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
                                        <EventCartItem
                                            key={item.product_id}
                                            item={item}
                                            discountRate={discountRate}
                                            updateQuantity={updateQuantity}
                                        />
                                    ))}
                                </div>
                            )}
                        </div>

                        <EventCheckoutSummary
                            paymentMethod={paymentMethod}
                            setPaymentMethod={setPaymentMethod}
                            memo={memo}
                            setMemo={setMemo}
                            totalAmount={totalAmount}
                            onCheckout={handleCheckout}
                            cartLength={cart.length}
                        />
                    </>
                )}
            </div>

            {/* Registration Modal Overlay */}
            <EventRegistrationModal
                show={showRegisterForm}
                onClose={() => setShowRegisterForm(false)}
                newCustomer={newCustomer}
                setNewCustomer={setNewCustomer}
                onRegister={handleQuickRegister}
                formatPhoneNumber={formatPhoneNumber}
            />
            <EventQrScannerUI
                isOpen={isScannerOpen}
                onClose={() => setIsScannerOpen(false)}
                cameraError={cameraError}
                fileInputRef={fileInputRef}
                handleFileScan={handleFileScan}
                scannerInputRef={scannerInputRef}
                scannerValue={scannerValue}
                setScannerValue={setScannerValue}
                processQrCode={processQrCode}
            />
        </div>
    );
};

export default MobileEventSales;

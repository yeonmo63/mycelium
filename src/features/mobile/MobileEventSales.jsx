import React, { useState, useEffect } from 'react';
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
    Save
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
            setProducts(pRes || []);
            setEvents(eRes || []);
        } catch (e) {
            console.error(e);
            showAlert("데이터 로드 실패", "목록 정보를 가져오지 못했습니다.");
        } finally {
            setIsLoading(false);
        }
    };

    const addToCart = (product) => {
        const existing = cart.find(item => item.product_id === product.product_id);
        if (existing) {
            setCart(cart.map(item =>
                item.product_id === product.product_id
                    ? { ...item, quantity: item.quantity + 1 }
                    : item
            ));
        } else {
            setCart([...cart, { ...product, quantity: 1 }]);
        }
    };

    const handleQrScan = () => {
        setIsScanning(true);
        // Simulate a QR scan result
        setTimeout(() => {
            setIsScanning(false);
            const randomProduct = products[Math.floor(Math.random() * products.length)];
            if (randomProduct) {
                addToCart(randomProduct);
            }
        }, 1200);
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
        <div className="mobile-fullscreen bg-slate-50 flex flex-col font-sans overflow-x-hidden pb-44">
            {/* Header */}
            <div className="bg-white border-b border-slate-100 p-4 pt-8 sticky top-0 z-50">
                <div className="flex items-center justify-between mb-4">
                    <button className="p-2 hover:bg-slate-50 rounded-xl text-slate-400" onClick={() => navigate('/mobile-dashboard')}>
                        <ArrowLeft size={20} />
                    </button>
                    <div className="flex items-center gap-2 text-center">
                        <Store className="text-amber-500" size={20} />
                        <h1 className="text-lg font-black text-slate-800">특판 행사 접수</h1>
                    </div>
                    <div className="w-10"></div> {/* Spacer for symmetry */}
                </div>

                {/* Event Selector */}
                <div className="relative">
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-indigo-500 pointer-events-none">
                        <CalendarDays size={18} />
                    </div>
                    <select
                        className="w-full h-12 bg-slate-50 border-none rounded-xl pl-12 pr-10 text-sm font-black text-slate-700 appearance-none"
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

            <div className="p-4 space-y-6">
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
                        <div className="flex items-center gap-1">
                            <input
                                type="number"
                                className="w-12 text-center bg-transparent border-none text-xl font-black text-rose-500 p-0 focus:ring-0"
                                value={discountRate}
                                onChange={(e) => setDiscountRate(Math.min(100, Math.max(0, parseInt(e.target.value) || 0)))}
                            />
                            <Percent size={14} className="text-rose-500" />
                        </div>
                    </div>
                </div>

                {/* Quick Selection List */}
                <div className="space-y-3">
                    <div className="flex items-center gap-2 text-slate-400 font-black text-xs uppercase tracking-widest pl-1">
                        <Tag size={12} />
                        <span>또는 수동 선택</span>
                    </div>
                    <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
                        {products.map(p => (
                            <button
                                key={p.product_id}
                                onClick={() => addToCart(p)}
                                className="bg-white px-5 py-3 rounded-2xl shadow-sm border border-slate-100 whitespace-nowrap active:scale-95 transition-all"
                            >
                                <div className="text-sm font-black text-slate-700">{p.product_name}</div>
                                <div className="text-[10px] text-indigo-500 font-bold">{p.unit_price.toLocaleString()}원</div>
                            </button>
                        ))}
                    </div>
                </div>

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
                        <div className="space-y-2">
                            {cart.map(item => (
                                <div key={item.product_id} className="bg-white p-4 rounded-2xl shadow-sm border border-slate-50 flex items-center justify-between">
                                    <div className="flex-1 min-w-0 pr-4">
                                        <div className="text-sm font-black text-slate-800 truncate">{item.product_name}</div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-[10px] text-slate-400 font-bold line-through">{item.unit_price.toLocaleString()}원</span>
                                            <span className="text-[10px] text-indigo-600 font-black">
                                                {Math.round(item.unit_price * (1 - discountRate / 100)).toLocaleString()}원
                                            </span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3 bg-slate-50 p-1 rounded-xl">
                                        <button onClick={() => updateQuantity(item.product_id, -1)} className="w-8 h-8 rounded-lg bg-white shadow-sm flex items-center justify-center text-slate-600 active:scale-90">
                                            <Minus size={14} />
                                        </button>
                                        <span className="text-sm font-black text-slate-800 min-w-[20px] text-center">{item.quantity}</span>
                                        <button onClick={() => updateQuantity(item.product_id, 1)} className="w-8 h-8 rounded-lg bg-indigo-600 shadow-sm flex items-center justify-center text-white active:scale-90">
                                            <Plus size={14} />
                                        </button>
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

            {/* Bottom Sticky Action Bar (Always visible but dynamic height) */}
            <div className="fixed bottom-0 left-0 right-0 p-4 pb-24 bg-white/95 backdrop-blur-xl border-t border-slate-100 z-40 transition-all">
                <div className="space-y-2 mb-4 px-2">
                    <div className="flex justify-between items-end border-b border-slate-50 pb-2">
                        <div className="flex flex-col">
                            <span className="text-slate-400 font-bold text-[10px] uppercase">SUBTOTAL</span>
                            <span className="text-slate-500 font-black text-sm">{subTotal.toLocaleString()}원</span>
                        </div>
                        <div className="flex flex-col items-end">
                            <span className="text-rose-400 font-bold text-[10px] uppercase">DISCOUNT ({discountRate}%)</span>
                            <span className="text-rose-500 font-black text-sm">-{discountAmount.toLocaleString()}원</span>
                        </div>
                    </div>
                    <div className="flex justify-between items-center py-1">
                        <span className="text-slate-800 font-black text-lg">최종 금액</span>
                        <div className="text-right">
                            <span className="text-3xl font-black text-indigo-600">{totalAmount.toLocaleString()}</span>
                            <span className="text-lg font-black text-indigo-600 ml-1">원</span>
                        </div>
                    </div>
                </div>
                <button
                    onClick={handleCheckout}
                    disabled={cart.length === 0}
                    className="w-full h-16 bg-indigo-600 disabled:bg-slate-200 rounded-3xl text-white font-black text-xl flex items-center justify-center gap-3 shadow-xl shadow-indigo-100 active:scale-95 transition-transform"
                >
                    <Save size={24} />
                    농장 PC로 저장 및 전송
                </button>
            </div>

            {/* Bottom Tab Bar */}
            <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-xl border-t border-slate-100 flex items-center justify-around h-20 px-4 pb-4 z-50">
                <button onClick={() => navigate('/mobile-dashboard')} className="flex flex-col items-center gap-1 text-slate-400">
                    <LayoutDashboard size={24} />
                    <span className="text-[10px] font-black">현황판</span>
                </button>
                <button onClick={() => navigate('/mobile-event-sales')} className="flex flex-col items-center gap-1 text-indigo-600">
                    <Store size={24} />
                    <span className="text-[10px] font-black">특판접수</span>
                </button>
                <button onClick={() => navigate('/mobile-worklog')} className="flex flex-col items-center gap-1 text-slate-400">
                    <ClipboardList size={24} />
                    <span className="text-[10px] font-black">작업일지</span>
                </button>
                <button onClick={() => navigate('/mobile-harvest')} className="flex flex-col items-center gap-1 text-slate-400">
                    <PlusCircle size={24} />
                    <span className="text-[10px] font-black">수확입력</span>
                </button>
            </div>
        </div>
    );
};

export default MobileEventSales;

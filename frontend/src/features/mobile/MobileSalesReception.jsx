import React, { useState, useRef, useEffect } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Capacitor } from '@capacitor/core';
import { scanNativeQr, stopNativeQr } from '../../utils/nativeScanner';
import { useNavigate } from 'react-router-dom';
import { useModal } from '../../contexts/ModalContext';
import { useSalesReception } from '../sales/hooks/useSalesReception';
import { callBridge } from '../../utils/apiBridge';
import { formatCurrency, formatPhoneNumber } from '../../utils/common';
import {
    Search,
    UserPlus,
    Plus,
    Minus,
    Trash2,
    Save,
    History,
    Truck,
    Package,
    CreditCard,
    ArrowRight,
    MapPin,
    Calendar,
    ChevronDown,
    ChevronUp,
    X,
    QrCode,
    Percent,
    ClipboardList
} from 'lucide-react';

const MobileSalesReception = () => {
    const navigate = useNavigate();
    const { showAlert, showConfirm } = useModal();
    const {
        orderDate, setOrderDate,
        customer, setCustomer,
        products,
        salesRows,
        isProcessing,
        inputState, setInputState,
        loadProducts, loadSalesHistory,
        selectCustomer,
        handleInputChange,
        handleAddRow,
        handleDeleteRow,
        handleSaveAll,
        handleReset,
        summary,
        paymentMethod, setPaymentMethod,
        memo, setMemo,
        updateRowQty
    } = useSalesReception(showAlert, showConfirm);

    const [isSearching, setIsSearching] = useState(false);
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
            // Native Scanner Logic
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

            // Web Fallback (Existing)
            // Give layout a moment to render the target div
            const timer = setTimeout(async () => {
                if (!isInstanceMounted) return;
                if (scannerInputRef.current) scannerInputRef.current.focus();

                const readerElement = document.getElementById("reader");
                if (!readerElement) return;

                try {
                    // Clean up any existing instance first
                    if (html5QrCodeRef.current) {
                        try {
                            if (html5QrCodeRef.current.isScanning) {
                                await html5QrCodeRef.current.stop();
                            }
                        } catch (e) {
                            console.warn("Cleanup of old scanner failed", e);
                        }
                    }

                    const html5QrCode = new Html5Qrcode("reader");
                    html5QrCodeRef.current = html5QrCode;

                    const config = {
                        fps: 15,
                        qrbox: { width: 250, height: 250 },
                        aspectRatio: 1.0,
                        disableFlip: false // Standard QRs don't need flip
                    };

                    // First try environment (back) camera
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
                            (errorMessage) => { /* quiet callback */ }
                        );
                    } catch (startErr) {
                        console.log("Environment camera start failed, trying any available camera", startErr);
                        // Fallback: Use any available camera
                        await html5QrCode.start(
                            { facingMode: "user" }, // Try front if back fails
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
                    // Note: stop() is async, but we can't await in cleanup easily without side effects
                    // The getState() check is more robust in 2.3.8
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
            const html5QrCode = new Html5Qrcode("reader");
            const result = await html5QrCode.scanFileV2(file, false);
            processQrCode(result.decodedText);
            setIsScannerOpen(false);
        } catch (err) {
            alert("사진에서 코드를 읽을 수 없습니다. 다시 찍어주세요.");
        }
    };

    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [showRegisterForm, setShowRegisterForm] = useState(false);
    const [showInputSection, setShowInputSection] = useState(true);
    const [isSummaryExpanded, setIsSummaryExpanded] = useState(false);

    // New Customer State
    const [newCustomer, setNewCustomer] = useState({ name: '', mobile: '' });

    useEffect(() => {
        loadProducts();
    }, [loadProducts]);

    useEffect(() => {
        if (customer && orderDate) {
            loadSalesHistory(customer.customer_id, orderDate);
        }
    }, [customer, orderDate, loadSalesHistory]);

    const handleSearch = async () => {
        if (!searchQuery.trim()) return;
        setIsSearching(true);
        try {
            const results = await callBridge('search_customers_by_name', { name: searchQuery });
            setSearchResults(results || []);
            if (results?.length === 0) {
                setNewCustomer(prev => ({ ...prev, name: searchQuery }));
            }
        } catch (e) {
            console.error(e);
        } finally {
            setIsSearching(false);
        }
    };

    const handleSelectCustomer = (cust) => {
        selectCustomer(cust);
        setSearchQuery('');
        setSearchResults([]);
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
                handleSelectCustomer(results[0]);
                setShowRegisterForm(false);
                showAlert('성공', '고객이 등록되었습니다.');
            }
        } catch (e) {
            showAlert('오류', `고객 등록 실패: ${e}`);
        }
    };

    const formatMobile = (e) => {
        setNewCustomer({ ...newCustomer, mobile: formatPhoneNumber(e.target.value) });
    };

    const handleAdd = () => {
        if (!inputState.product) return showAlert('알림', '상품을 선택해주세요.');
        handleAddRow();
        setShowInputSection(false);
    };

    const handleQrScan = () => {
        setIsScannerOpen(true);
        setScannerValue('');
    };

    const processQrCode = async (code) => {
        if (!code) return;
        const rawCode = code.trim();
        const parts = rawCode.split('|').map(p => p.trim());
        let foundProduct = null;

        if (parts[0] === 'PRODUCT' && parts[1]) {
            const pid = parseInt(parts[1]);
            foundProduct = products.find(p => Number(p.product_id) === pid);
        } else if (parts[0] === 'HARVEST' && parts[3]) {
            const name = parts[3];
            foundProduct = products.find(p => p.product_name === name);
        } else {
            foundProduct = products.find(p =>
                (p.product_code && p.product_code === rawCode) ||
                p.product_name === rawCode
            );
        }

        if (foundProduct) {
            handleInputChange({
                target: {
                    name: 'product',
                    value: foundProduct.product_name
                }
            });

            // Stop scanner immediately upon success to release camera
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

            showAlert("인식 완료", `[${foundProduct.product_name}] 상품이 선택되었습니다.`);
            setIsScannerOpen(false);

            // Auto-focus quantity for faster entry
            setTimeout(() => {
                qtyInputRef.current?.focus();
                qtyInputRef.current?.select();
            }, 300);
        } else {
            showAlert("인식 실패", "상품을 찾을 수 없습니다.");
        }
    };

    return (
        <div className="flex flex-col h-full bg-[#f8fafc] overflow-hidden">
            {/* Header */}
            <div className="bg-white px-5 pt-6 pb-4 border-b border-slate-100 shrink-0">
                <div className="flex justify-between items-center mb-4">
                    <h1 className="text-xl font-black text-slate-900 tracking-tight">일반접수</h1>
                    <div className="flex gap-2">
                        <button
                            onClick={handleReset}
                            className="p-2 bg-slate-50 text-slate-400 rounded-xl hover:text-rose-500 transition-colors"
                        >
                            <History size={18} />
                        </button>
                    </div>
                </div>

                {/* Customer Search / Selection */}
                {!customer ? (
                    <div className="space-y-3">
                        <div className="relative">
                            <input
                                type="text"
                                placeholder="고객 이름 또는 전화번호"
                                className="w-full h-12 px-5 bg-slate-50 border-none rounded-2xl text-sm font-bold focus:ring-2 focus:ring-indigo-500 transition-all"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                            />
                            <button
                                onClick={handleSearch}
                                className="absolute right-2 top-1/2 -translate-y-1/2 h-8 px-4 bg-indigo-600 text-white rounded-xl text-xs font-black shadow-lg shadow-indigo-100"
                            >
                                검색
                            </button>
                        </div>

                        {/* Search Results */}
                        {searchResults.length > 0 && (
                            <div className="bg-white border border-slate-100 rounded-2xl shadow-xl max-h-48 overflow-auto animate-in slide-in-from-top-2">
                                {searchResults.map(cust => (
                                    <button
                                        key={cust.customer_id}
                                        onClick={() => handleSelectCustomer(cust)}
                                        className="w-full px-4 py-3 text-left border-b border-slate-50 last:border-0 hover:bg-slate-50 active:bg-slate-100 transition-colors"
                                    >
                                        <div className="text-sm font-black text-slate-800">{cust.customer_name}</div>
                                        <div className="text-[10px] font-bold text-slate-400">{cust.mobile_number} | {cust.address_primary || '주소 없음'}</div>
                                    </button>
                                ))}
                            </div>
                        )}

                        {/* New Customer Prompt */}
                        {searchQuery && searchResults.length === 0 && !isSearching && (
                            <button
                                onClick={() => setShowRegisterForm(true)}
                                className="w-full h-12 border-2 border-dashed border-slate-200 rounded-2xl flex items-center justify-center gap-2 text-slate-400 hover:text-indigo-600 hover:border-indigo-200 transition-all font-bold text-sm"
                            >
                                <UserPlus size={18} />
                                <span>"{searchQuery}" 신규 고객 등록하기</span>
                            </button>
                        )}
                    </div>
                ) : (
                    <div className="flex items-center gap-4 bg-indigo-50 p-4 rounded-3xl border border-indigo-100">
                        <div className="w-12 h-12 bg-indigo-600 text-white rounded-2xl flex items-center justify-center font-black text-lg">
                            {customer.customer_name[0]}
                        </div>
                        <div className="flex-1">
                            <div className="flex items-center gap-2">
                                <span className="text-sm font-black text-slate-900">{customer.customer_name}</span>
                                <span className="bg-white text-indigo-600 px-2 py-0.5 rounded-full text-[9px] font-black border border-indigo-200 uppercase tracking-tighter">VIP CUSTOMER</span>
                            </div>
                            <div className="text-[10px] font-bold text-slate-500 mt-0.5">{customer.mobile_number}</div>
                        </div>
                        <button
                            onClick={() => setCustomer(null)}
                            className="p-2 text-slate-300 hover:text-rose-500 transition-colors"
                        >
                            <X size={18} />
                        </button>
                    </div>
                )}
            </div>

            {/* Main Content */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden px-5 pt-4 pb-20 space-y-4">
                {customer && (
                    <>
                        {/* Order Date */}
                        <div className="bg-white p-4 rounded-[2rem] border border-slate-100 shadow-sm flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="p-2.5 bg-indigo-50 text-indigo-500 rounded-2xl">
                                    <Calendar size={18} />
                                </div>
                                <span className="text-sm font-bold text-slate-600">접수 일자</span>
                            </div>
                            <input
                                type="date"
                                className="bg-transparent border-none text-right font-black text-slate-900 focus:ring-0 text-sm"
                                value={orderDate}
                                onChange={(e) => setOrderDate(e.target.value)}
                            />
                        </div>

                        {/* QR Scan & Discount Row */}
                        <div className="grid grid-cols-2 gap-4">
                            <button
                                onClick={handleQrScan}
                                className="bg-white h-20 rounded-3xl shadow-sm border border-slate-100 flex flex-col items-center justify-center gap-1 text-slate-600 active:scale-95 transition-all"
                            >
                                <QrCode size={24} className="text-indigo-500" />
                                <span className="text-[11px] font-black">상품 QR 스캔</span>
                            </button>

                            <div className="bg-white h-20 rounded-3xl shadow-sm border border-slate-100 flex flex-col items-center justify-center gap-1">
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">적용 할인율</span>
                                <div className="flex items-center gap-3">
                                    <button
                                        onClick={() => handleInputChange({ target: { name: 'discountRate', value: Math.max(0, (Number(inputState.discountRate) || 0) - 1) } })}
                                        className="w-8 h-8 flex items-center justify-center bg-slate-50 rounded-lg text-rose-500 active:scale-95 transition-all"
                                    >
                                        <span className="text-xl font-black leading-none select-none">-</span>
                                    </button>
                                    <div className="flex items-center">
                                        <input
                                            type="number"
                                            name="discountRate"
                                            className="w-14 text-center bg-transparent border-none text-xl font-black text-rose-500 p-0 focus:ring-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                            value={inputState.discountRate || 0}
                                            onChange={handleInputChange}
                                        />
                                        <Percent size={14} className="text-rose-500" strokeWidth={3} />
                                    </div>
                                    <button
                                        onClick={() => handleInputChange({ target: { name: 'discountRate', value: Math.min(100, (Number(inputState.discountRate) || 0) + 1) } })}
                                        className="w-8 h-8 flex items-center justify-center bg-rose-500 rounded-lg text-white active:scale-95 transition-all shadow-sm shadow-rose-100"
                                    >
                                        <span className="text-xl font-black leading-none select-none">+</span>
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Quick Selection List */}
                        <div className="space-y-3">
                            <div className="flex items-center gap-2 text-slate-400 font-black text-xs uppercase tracking-widest pl-1 mt-2">
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

                        {/* Quick Input Toggle */}
                        <div className="flex items-center justify-between px-2">
                            <h2 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em]">접수 품목 ({salesRows.length})</h2>
                            <button
                                onClick={() => setShowInputSection(!showInputSection)}
                                className={`text-[11px] font-black h-8 px-4 rounded-full transition-all ${showInputSection ? 'bg-indigo-600 text-white shadow-lg' : 'bg-white border border-slate-100 text-indigo-600'}`}
                            >
                                {showInputSection ? '접기' : '품목 추가'}
                            </button>
                        </div>

                        {/* Sales Input Form */}
                        {showInputSection && (
                            <div className="bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-xl space-y-5 animate-in slide-in-from-top-4 duration-300">
                                <div>
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-tighter ml-1 mb-1.5 block">상품 선택</label>
                                    <select
                                        name="product"
                                        className="w-full h-12 bg-slate-50 border-none rounded-2xl text-sm font-black focus:ring-2 focus:ring-indigo-500 transition-all appearance-none pr-10"
                                        value={inputState.product}
                                        onChange={handleInputChange}
                                    >
                                        <option value="">상품을 선택하세요</option>
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
                                            className="w-full h-12 bg-slate-50 border-none rounded-2xl text-sm font-black focus:ring-2 focus:ring-indigo-500 transition-all text-right"
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
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-tighter ml-1 mb-1.5 block">금액 (할인 적용)</label>
                                    <div className="h-12 bg-indigo-50/50 rounded-2xl flex items-center px-4 justify-between border border-indigo-100/50">
                                        <CreditCard size={18} className="text-indigo-300" />
                                        <span className="text-lg font-black text-indigo-600">{formatCurrency(inputState.amount)}원</span>
                                    </div>
                                </div>

                                <button
                                    onClick={handleAdd}
                                    className="w-full h-14 bg-indigo-600 text-white rounded-2xl font-black shadow-lg shadow-indigo-100 flex items-center justify-center gap-3 active:scale-[0.98] transition-all"
                                >
                                    <Plus size={20} />
                                    항목 추가
                                </button>
                            </div>
                        )}

                        {/* Sales Rows List */}
                        <div className="space-y-3">
                            {salesRows.map(row => (
                                <div key={row.tempId} className="bg-white px-5 py-3 rounded-[1.5rem] border border-slate-100 shadow-sm flex items-center gap-4 animate-in fade-in slide-in-from-left-2 transition-all">
                                    <div className="w-10 h-10 bg-slate-50 text-slate-400 rounded-xl flex items-center justify-center shrink-0">
                                        <Package size={20} />
                                    </div>
                                    <div className="flex-1">
                                        <div className="text-sm font-black text-slate-800">{row.product}</div>
                                        <div className="text-[10px] font-bold text-slate-400 mt-1">
                                            {formatCurrency(row.price)}원 × {row.qty}개
                                        </div>
                                    </div>
                                    <div className="text-right flex flex-col items-end gap-1">
                                        <div className="text-sm font-black text-indigo-600">{formatCurrency(row.amount)}원</div>
                                        <div className="flex items-center gap-2 bg-slate-50 p-1.5 rounded-xl scale-95 origin-right border border-slate-200">
                                            <button
                                                type="button"
                                                onClick={() => updateRowQty(row.tempId, -1)}
                                                className="w-7 h-7 rounded-lg bg-white shadow-sm border border-slate-200 flex items-center justify-center text-slate-700 active:scale-90"
                                            ><span className="text-lg font-black leading-none select-none">-</span></button>
                                            <span className="text-sm font-black text-slate-800 min-w-[20px] text-center">{row.qty}</span>
                                            <button
                                                type="button"
                                                onClick={() => updateRowQty(row.tempId, 1)}
                                                className="w-7 h-7 rounded-lg bg-indigo-600 shadow-sm flex items-center justify-center text-white active:scale-90"
                                            ><span className="text-lg font-black leading-none select-none">+</span></button>
                                        </div>
                                        <button
                                            onClick={() => handleDeleteRow(row)}
                                            className="text-[9px] font-black text-rose-400 hover:text-rose-600 uppercase"
                                        >삭제</button>
                                    </div>
                                </div>
                            ))}

                            {salesRows.length === 0 && !showInputSection && (
                                <div className="py-12 text-center">
                                    <div className="w-16 h-16 bg-slate-50 text-slate-200 rounded-full flex items-center justify-center mx-auto mb-4">
                                        <Package size={32} />
                                    </div>
                                    <p className="text-sm font-bold text-slate-400">등록된 항목이 없습니다.<br />품목을 추가해주세요.</p>
                                </div>
                            )}
                        </div>

                        {/* Additional Info */}
                        {salesRows.length > 0 && (
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
                                        <span>특이사항 메모 (전체)</span>
                                    </div>
                                    <input
                                        type="text"
                                        placeholder="공통 기재 사항"
                                        className="w-full h-12 bg-slate-50 border-none rounded-2xl px-4 text-sm font-bold text-slate-700 placeholder:text-slate-300"
                                        value={memo}
                                        onChange={(e) => setMemo(e.target.value)}
                                    />
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* Bottom Summary & Save Bar */}
            {
                customer && salesRows.length > 0 && (
                    <div className="fixed bottom-0 left-0 right-0 z-50 animate-in slide-in-from-bottom-full duration-500">
                        {/* Summary Overlay (Expandable) */}
                        {isSummaryExpanded && (
                            <div className="bg-slate-900/90 backdrop-blur-md text-white p-6 rounded-t-[3rem] space-y-4 animate-in slide-in-from-bottom-4">
                                <div className="flex justify-between items-center text-slate-400 text-xs font-black uppercase tracking-widest">
                                    <span>정산 상세 요약</span>
                                    <button onClick={() => setIsSummaryExpanded(false)}><ChevronDown /></button>
                                </div>
                                <div className="space-y-3 pt-2">
                                    <div className="flex justify-between items-center">
                                        <span className="text-slate-400 text-sm font-bold">총 공급가액</span>
                                        <span className="text-white font-black">{formatCurrency(summary.supply)}원</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-slate-400 text-sm font-bold">총 부가세</span>
                                        <span className="text-white font-black">{formatCurrency(summary.vat)}원</span>
                                    </div>
                                    <div className="h-px bg-white/10 my-2"></div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-indigo-400 text-lg font-black">최종 결제 예정액</span>
                                        <span className="text-2xl font-black text-white">{formatCurrency(summary.amount)}원</span>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="bg-white border-t border-slate-100 p-5 pb-24 shadow-[0_-10px_40px_rgba(0,0,0,0.05)]">
                            <div className="flex gap-4 items-center">
                                <button
                                    onClick={() => setIsSummaryExpanded(!isSummaryExpanded)}
                                    className="flex-1 h-14 bg-slate-900 text-white rounded-[1.5rem] px-5 flex items-center justify-between group active:scale-[0.98] transition-all"
                                >
                                    <div className="flex flex-col items-start">
                                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">총 ({salesRows.length}개) 합계</span>
                                        <span className="text-lg font-black leading-none">{formatCurrency(summary.amount)}원</span>
                                    </div>
                                    <div className="flex items-center gap-1 text-slate-500">
                                        {isSummaryExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                                    </div>
                                </button>
                                <button
                                    onClick={handleSaveAll}
                                    disabled={isProcessing}
                                    className={`w-20 h-14 bg-indigo-600 text-white rounded-[1.5rem] flex items-center justify-center shadow-lg shadow-indigo-100 active:scale-[0.95] transition-all ${isProcessing ? 'opacity-50 animate-pulse' : ''}`}
                                >
                                    <Save size={24} />
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Quick Register Modal */}
            {
                showRegisterForm && (
                    <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-end animate-in fade-in duration-300">
                        <div className="w-full bg-white rounded-t-[3rem] p-8 pb-12 animate-in slide-in-from-bottom-10 duration-500 shadow-2xl">
                            <div className="flex justify-between items-center mb-8">
                                <div>
                                    <h1 className="text-2xl font-black text-slate-800 tracking-tight">신규 고객 등록</h1>
                                    <p className="text-sm font-medium text-slate-400 mt-1 font-bold">정보를 입력하여 바로 접수를 진행하세요.</p>
                                </div>
                                <button onClick={() => setShowRegisterForm(false)} className="p-3 bg-slate-50 rounded-2xl text-slate-300"><X /></button>
                            </div>

                            <div className="space-y-6">
                                <div>
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-2 block">성함</label>
                                    <input
                                        className="w-full h-14 bg-slate-50 border-none rounded-2xl px-5 text-sm font-black focus:ring-2 focus:ring-indigo-500 transition-all"
                                        placeholder="고객 성함"
                                        value={newCustomer.name}
                                        onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-2 block">휴대폰 번호</label>
                                    <input
                                        className="w-full h-14 bg-slate-50 border-none rounded-2xl px-5 text-sm font-black focus:ring-2 focus:ring-indigo-500 transition-all"
                                        placeholder="010-0000-0000"
                                        value={newCustomer.mobile}
                                        onChange={formatMobile}
                                    />
                                </div>

                                <button
                                    onClick={handleQuickRegister}
                                    className="w-full h-16 bg-indigo-600 text-white rounded-2xl animate-in zoom-in-95 duration-500 font-black text-lg shadow-xl shadow-indigo-100 mt-4 active:scale-[0.98]"
                                >
                                    지금 등록 완료
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Loading Indicator */}
            {
                isSearching && (
                    <div className="fixed inset-0 z-[200] bg-white/60 backdrop-blur-sm flex items-center justify-center">
                        <div className="flex flex-col items-center gap-4">
                            <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                            <span className="text-sm font-black text-indigo-600 animate-pulse">고객 데이터를 조회 중...</span>
                        </div>
                    </div>
                )
            }
            {/* QR Scanner Overlay */}
            {isScannerOpen && (
                <div className="fixed inset-0 z-[100] bg-slate-900 flex flex-col items-center justify-center p-6 animate-in fade-in duration-300">
                    {/* Camera View Area */}
                    <div className="relative w-full max-w-xs aspect-square border-2 border-indigo-500/50 rounded-[3rem] overflow-hidden bg-slate-950 shadow-2xl flex items-center justify-center">
                        <div id="reader" className="absolute inset-0 z-0"></div>

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
                        <h3 className="text-xl font-black">QR 코드 스캔 중</h3>
                        <p className="text-sm text-slate-400">사각형 안에 QR 코드를 맞춰주세요.</p>

                        <div className="max-w-xs mx-auto pt-6 space-y-2">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block">직접 코드 입력 (인식 불가 시)</label>
                            <div className="relative opacity-60 focus-within:opacity-100 transition-opacity">
                                <input
                                    ref={scannerInputRef}
                                    type="text"
                                    className="w-full h-12 bg-white/5 border border-white/10 rounded-2xl px-6 text-white text-center font-black focus:border-indigo-500/50 focus:ring-0 transition-all outline-none text-xs"
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
                        #reader video { 
                            object-fit: cover !important;
                            height: 100% !important;
                            width: 100% !important;
                        }
                    `}} />
                </div>
            )}
        </div >
    );
};

export default MobileSalesReception;

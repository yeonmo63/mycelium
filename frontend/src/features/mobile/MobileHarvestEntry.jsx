import React, { useState, useEffect, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Capacitor } from '@capacitor/core';
import { scanNativeQr, stopNativeQr } from '../../utils/nativeScanner';
import { useNavigate } from 'react-router-dom';
import { callBridge } from '../../utils/apiBridge';
import { useModal } from '../../contexts/ModalContext';
import { Save, ArrowLeft, Package, Trash2, Scale, Info, CircleCheck, LayoutDashboard, ClipboardList, CirclePlus, Store, QrCode } from 'lucide-react';
import dayjs from 'dayjs';

const MobileHarvestEntry = () => {
    const navigate = useNavigate();
    const { showAlert, showConfirm } = useModal();
    const [batches, setBatches] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    const [formData, setFormData] = useState({
        harvest_id: 0,
        batch_id: null,
        harvest_date: dayjs().format('YYYY-MM-DD'),
        quantity: 0,
        defective_quantity: 0,
        loss_quantity: 0,
        unit: 'kg',
        grade: '특품',
        traceability_code: '',
        memo: '',
        package_count: 0,
        weight_per_package: 0,
        package_unit: 'kg'
    });

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

                const readerElement = document.getElementById("reader-harvest");
                if (!readerElement) return;

                try {
                    // Clean up existing instance
                    if (html5QrCodeRef.current) {
                        try {
                            if (html5QrCodeRef.current.isScanning) {
                                await html5QrCodeRef.current.stop();
                            }
                        } catch (e) {
                            console.warn("Cleanup of old scanner failed", e);
                        }
                    }

                    const html5QrCode = new Html5Qrcode("reader-harvest");
                    html5QrCodeRef.current = html5QrCode;

                    const config = { fps: 15, qrbox: { width: 250, height: 250 }, aspectRatio: 1.0, disableFlip: false };

                    // Try environment (back) camera
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
                        console.log("Environment camera start failed, trying any", startErr);
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
            const html5QrCode = new Html5Qrcode("reader-harvest");
            const result = await html5QrCode.scanFileV2(file, false);
            processQrCode(result.decodedText);
            setIsScannerOpen(false);
        } catch (err) {
            alert("사진에서 코드를 읽을 수 없습니다. 다시 찍어주세요.");
        }
    };

    const handleQrScan = () => {
        setIsScannerOpen(true);
        setScannerValue('');
    };

    const processQrCode = async (code) => {
        if (!code) return;
        const rawCode = code.trim();
        setIsScanning(true);
        console.log("Harvest Processing Scanned QR:", rawCode);

        const parts = rawCode.split('|').map(p => p.trim());
        let foundBatch = null;

        if (parts[0] === 'BATCH' && parts[1]) {
            const bid = parseInt(parts[1]);
            foundBatch = batches.find(b => Number(b.batch_id) === bid);
        } else {
            foundBatch = batches.find(b => b.batch_code === rawCode);
        }

        setIsScanning(false);
        if (foundBatch) {
            setFormData(prev => ({ ...prev, batch_id: foundBatch.batch_id }));

            // Stop scanner immediately upon success
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

            setIsScannerOpen(false);
            // Auto-focus quantity for faster entry
            setTimeout(() => {
                qtyInputRef.current?.focus();
                qtyInputRef.current?.select();
            }, 300);
            showAlert("인식 완료", `[${foundBatch.batch_code}] 배치가 선택되었습니다.`);
        } else {
            showAlert("인식 실패", `[${rawCode}] 배치 정보를 찾을 수 없습니다.`);
        }
    };

    useEffect(() => {
        loadBatches();
    }, []);

    const [products, setProducts] = useState([]);

    const loadBatches = async () => {
        try {
            const [bRes, pRes] = await Promise.all([
                callBridge('get_production_batches'),
                callBridge('get_product_list')
            ]);
            setBatches(bRes?.filter(b => b.status !== 'completed') || []);
            setProducts(pRes || []);
        } catch (e) {
            console.error(e);
            showAlert("데이터 로드 실패", "배치 및 상품 정보를 가져오지 못했습니다.");
        } finally {
            setIsLoading(false);
        }
    };

    const handleSave = async () => {
        if (!formData.batch_id) {
            showAlert("입력 확인", "수확할 생산 배치를 선택해 주세요.");
            return;
        }
        if (formData.quantity <= 0 && formData.defective_quantity <= 0) {
            showAlert("입력 확인", "수확 수량을 입력해 주세요.");
            return;
        }

        const confirmed = await showConfirm(
            "수확 기록 저장",
            "입력하신 수확 데이터를 저장하고 재고에 반영할까요?\n(정품 수량은 자동으로 완제품 재고에 합산됩니다.)"
        );

        if (!confirmed) return;

        try {
            const res = await callBridge('save_harvest_record', {
                record: {
                    ...formData,
                    quantity: parseFloat(formData.quantity),
                    defective_quantity: parseFloat(formData.defective_quantity),
                    loss_quantity: parseFloat(formData.loss_quantity),
                    harvest_date: formData.harvest_date
                },
                complete_batch: false // Default to false for mobile quick entry
            });

            if (res && res.success) {
                showAlert("저장 완료", "수확 기록이 성공적으로 저장되었습니다.");
                setFormData(prev => ({
                    ...prev,
                    quantity: 0,
                    defective_quantity: 0,
                    loss_quantity: 0,
                    memo: ''
                }));
            } else {
                throw new Error(res?.error || "Unknown error");
            }
        } catch (e) {
            console.error(e);
            showAlert("저장 실패", "기록 중 오류가 발생했습니다: " + e);
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col font-sans pb-24">
            {/* Header */}
            <div className="bg-white border-b border-slate-100 p-4 pt-4 sticky top-0 z-50 flex items-center justify-between">
                <button className="p-2 hover:bg-slate-50 rounded-xl text-slate-400" onClick={() => window.history.back()}>
                    <ArrowLeft size={20} />
                </button>
                <h1 className="text-lg font-black text-slate-800">모바일 수확 입력</h1>
                <div className="w-10"></div>
            </div>

            <div className="p-4 space-y-4">
                {/* Batch Selection */}
                <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3 text-slate-800 font-black">
                            <Package size={18} className="text-indigo-500" />
                            <span>생산 배치 선택</span>
                        </div>
                        <button
                            onClick={handleQrScan}
                            disabled={isScanning}
                            className={`flex items-center gap-2 px-4 py-2 rounded-xl font-black text-xs transition-all active:scale-95 ${isScanning ? 'bg-slate-100 text-slate-400' : 'bg-indigo-50 text-indigo-600 border border-indigo-100'}`}
                        >
                            {isScanning ? (
                                <>
                                    <div className="w-3 h-3 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                                    <span>스캔 중...</span>
                                </>
                            ) : (
                                <>
                                    <QrCode size={14} />
                                    <span>QR 스캔</span>
                                </>
                            )}
                        </button>
                    </div>

                    <select
                        className="w-full h-14 bg-slate-50 border-none rounded-2xl px-4 text-sm font-bold text-slate-700"
                        value={formData.batch_id || ''}
                        onChange={(e) => setFormData({ ...formData, batch_id: e.target.value ? parseInt(e.target.value) : null })}
                    >
                        <option value="">배치를 선택하세요</option>
                        {batches.map(b => {
                            const p = products.find(x => x.product_id === b.product_id);
                            return (
                                <option key={b.batch_id} value={b.batch_id}>
                                    {b.batch_code} - {p ? `${p.product_name}${p.specification ? ` (${p.specification})` : ''}` : '미지정 상품'}
                                </option>
                            );
                        })}
                    </select>
                </div>

                {/* Main Quantity */}
                <div className="bg-indigo-600 rounded-[2.5rem] p-6 shadow-xl shadow-indigo-100 text-white space-y-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Scale size={20} />
                            <span className="font-black text-lg">정품 수확량</span>
                        </div>
                        <div className="px-3 py-1 bg-white/20 rounded-full text-[10px] font-black uppercase tracking-widest">Main Stock</div>
                    </div>

                    <div className="flex items-end gap-3">
                        <input
                            ref={qtyInputRef}
                            type="number"
                            className="w-full bg-transparent border-b-2 border-white/30 focus:border-white text-4xl font-black text-white placeholder:text-white/30 outline-none pb-2"
                            placeholder="0.00"
                            value={formData.quantity || ''}
                            onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                            inputMode="decimal"
                        />
                        <span className="text-2xl font-black mb-2">kg</span>
                    </div>
                </div>

                {/* Sub Quantities */}
                <div className="grid grid-cols-2 gap-4">
                    <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100 space-y-3">
                        <div className="flex items-center gap-2 text-rose-500 font-black text-xs">
                            <Info size={14} />
                            <span>비상품(파지)</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <input
                                type="number"
                                className="w-full bg-slate-50 border-none rounded-xl p-3 text-lg font-black text-slate-700"
                                placeholder="0"
                                value={formData.defective_quantity || ''}
                                onChange={(e) => setFormData({ ...formData, defective_quantity: e.target.value })}
                            />
                            <span className="font-bold text-slate-400">kg</span>
                        </div>
                    </div>

                    <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100 space-y-3">
                        <div className="flex items-center gap-2 text-slate-400 font-black text-xs">
                            <Trash2 size={14} />
                            <span>현장 손실</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <input
                                type="number"
                                className="w-full bg-slate-50 border-none rounded-xl p-3 text-lg font-black text-slate-700"
                                placeholder="0"
                                value={formData.loss_quantity || ''}
                                onChange={(e) => setFormData({ ...formData, loss_quantity: e.target.value })}
                            />
                            <span className="font-bold text-slate-400">kg</span>
                        </div>
                    </div>
                </div>

                {/* Grade & Memo */}
                <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100 space-y-3">
                    <div className="flex items-center gap-3 text-slate-800 font-black mb-2">
                        <CircleCheck size={18} className="text-indigo-500" />
                        <span>등급 및 기타 정보</span>
                    </div>

                    <div className="flex gap-2">
                        {['특품', '상품', '보통'].map(g => (
                            <button
                                key={g}
                                onClick={() => setFormData({ ...formData, grade: g })}
                                className={`flex-1 h-12 rounded-xl font-black text-sm transition-all ${formData.grade === g ? 'bg-indigo-600 text-white shadow-md shadow-indigo-100' : 'bg-slate-50 text-slate-400'}`}
                            >
                                {g}
                            </button>
                        ))}
                    </div>

                    <textarea
                        className="w-full min-h-[100px] bg-slate-50 border-none rounded-2xl p-4 text-sm font-medium text-slate-700 placeholder:text-slate-300 resize-none"
                        placeholder="특이사항이 있다면 기록해 주세요."
                        value={formData.memo}
                        onChange={(e) => setFormData({ ...formData, memo: e.target.value })}
                    />
                </div>
            </div>

            {/* Bottom Action Bar */}
            <div className="fixed bottom-0 left-0 right-0 p-4 pb-24 bg-white/80 backdrop-blur-xl border-t border-slate-100 z-40">
                <button
                    onClick={handleSave}
                    className="w-full h-14 bg-indigo-600 rounded-2xl text-white font-black text-lg flex items-center justify-center gap-2 shadow-lg shadow-indigo-200 active:scale-95 transition-transform"
                >
                    <Save size={20} />
                    수확 기록 저장하기
                </button>
            </div>

            {/* QR Scanner Overlay */}
            {isScannerOpen && (
                <div className="fixed inset-0 z-[100] bg-slate-900 flex flex-col items-center justify-center p-6 animate-in fade-in duration-300">
                    {/* Camera View Area */}
                    <div className="relative w-full max-w-xs aspect-square border-2 border-indigo-500/50 rounded-[3rem] overflow-hidden bg-slate-950 shadow-2xl flex items-center justify-center">
                        <div id="reader-harvest" className="absolute inset-0 z-0"></div>

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
                        <h3 className="text-xl font-black">현장 QR 스캔 중</h3>
                        <p className="text-sm text-slate-400">구역이나 배치 QR 코드를 맞춰주세요.</p>

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
                        #reader-harvest video { 
                            object-fit: cover !important;
                            height: 100% !important;
                            width: 100% !important;
                        }
                    `}} />
                </div>
            )}
        </div>
    );
};

export default MobileHarvestEntry;

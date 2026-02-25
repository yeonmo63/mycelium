import React, { useState, useEffect, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Capacitor } from '@capacitor/core';
import { scanNativeQr, stopNativeQr } from '../../utils/nativeScanner';
import { useNavigate } from 'react-router-dom';
import { callBridge } from '../../utils/apiBridge';
import { useModal } from '../../contexts/ModalContext';
import { Camera, Save, ArrowLeft, Thermometer, Droplets, MapPin, LayoutDashboard, ClipboardList, PlusCircle, Store, QrCode, X as XIcon, RefreshCw } from 'lucide-react';
import dayjs from 'dayjs';
import { usePullToRefresh } from './hooks/usePullToRefresh';

const MobileWorkLog = () => {
    const navigate = useNavigate();
    const { showAlert } = useModal();
    const [spaces, setSpaces] = useState([]);
    const [batches, setBatches] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const scrollContainerRef = useRef(null);

    const { pullDistance, isRefreshing: isPTRRefreshing, bind } = usePullToRefresh(async () => {
        await loadBaseData();
    }, {
        scrollEltRef: scrollContainerRef
    });

    const [formData, setFormData] = useState({
        log_id: 0,
        batch_id: null,
        space_id: null,
        log_date: dayjs().format('YYYY-MM-DD'),
        worker_name: localStorage.getItem('username') || '',
        work_type: '일반작업',
        work_content: '',
        input_materials: null,
        env_data: { temp: '', humi: '' },
        photos: null
    });

    const [photoPreview, setPhotoPreview] = useState(null);
    const fileInputRef = useRef(null);
    const scannerFileRef = useRef(null);

    const [isScannerOpen, setIsScannerOpen] = useState(false);
    const [scannerValue, setScannerValue] = useState('');
    const scannerInputRef = useRef(null);
    const html5QrCodeRef = useRef(null);
    const nextInputRef = useRef(null);
    const [cameraError, setCameraError] = useState(null);

    useEffect(() => {
        let isInstanceMounted = true;

        if (isScannerOpen && !Capacitor.isNativePlatform()) {
            const timer = setTimeout(async () => {
                if (!isInstanceMounted) return;

                const readerElement = document.getElementById("reader-worklog");
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

                    const html5QrCode = new Html5Qrcode("reader-worklog");
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
            const html5QrCode = new Html5Qrcode("reader-worklog");
            const result = await html5QrCode.scanFileV2(file, false);
            processQrCode(result.decodedText);
            setIsScannerOpen(false);
        } catch (err) {
            alert("사진에서 코드를 읽을 수 없습니다. 다시 찍어주세요.");
        }
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
        console.log("WorkLog Processing Scanned QR:", rawCode);

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

        if (parts[0] === 'BATCH' && parts[1]) {
            const bid = parseInt(parts[1]);
            const found = batches.find(b => Number(b.batch_id) === bid);
            if (found) {
                setFormData(prev => ({ ...prev, batch_id: found.batch_id }));
                setIsScannerOpen(false);
                setTimeout(() => nextInputRef.current?.focus(), 300);
                showAlert("인식 완료", `배치 [${found.batch_code}]가 선택되었습니다.`);
                return;
            }
        } else if (parts[0] === 'SPACE' && parts[1]) {
            const sid = parseInt(parts[1]);
            const found = spaces.find(s => Number(s.space_id) === sid);
            if (found) {
                setFormData(prev => ({ ...prev, space_id: found.space_id }));
                setIsScannerOpen(false);
                showAlert("인식 완료", `구역 [${found.space_name}]이 선택되었습니다.`);
                return;
            }
        }

        const foundBatch = batches.find(b => b.batch_code === rawCode);
        if (foundBatch) {
            setFormData(prev => ({ ...prev, batch_id: foundBatch.batch_id }));
            setIsScannerOpen(false);
            showAlert("인식 완료", `배치 [${foundBatch.batch_code}]가 선택되었습니다.`);
            return;
        }

        const foundSpace = spaces.find(s => s.space_name === rawCode);
        if (foundSpace) {
            setFormData(prev => ({ ...prev, space_id: foundSpace.space_id }));
            setIsScannerOpen(false);
            setTimeout(() => nextInputRef.current?.focus(), 300);
            showAlert("인식 완료", `구역 [${foundSpace.space_name}]이 선택되었습니다.`);
            return;
        }

        setIsScannerOpen(false);
        showAlert("인식 실패", `[${rawCode}] 정보를 찾을 수 없습니다.`);
    };


    useEffect(() => {
        loadBaseData();
    }, []);

    const loadBaseData = async () => {
        try {
            const [sRes, bRes] = await Promise.all([
                callBridge('get_production_spaces'),
                callBridge('get_production_batches')
            ]);
            setSpaces(sRes || []);
            setBatches(bRes || []);
        } catch (e) {
            console.error(e);
            showAlert("데이터 로드 실패", "실제 생산 정보를 가져오지 못했습니다.");
        } finally {
            setIsLoading(false);
        }
    };

    const handleSave = async () => {
        if (!formData.work_content) {
            showAlert("입력 확인", "작업 내용을 입력해 주세요.");
            return;
        }

        try {
            // Ensure data types match backend expectations (FarmingLog struct)
            const payload = {
                ...formData,
                batch_id: Number(formData.batch_id) || 0,
                space_id: Number(formData.space_id) || 0,
                log_date: typeof formData.log_date === 'object' ? formData.log_date.format('YYYY-MM-DD') : formData.log_date,
                env_data: {
                    temp: formData.env_data.temp ? parseFloat(formData.env_data.temp) : null,
                    humi: formData.env_data.humi ? parseFloat(formData.env_data.humi) : null
                }
            };

            const res = await callBridge('save_farming_log', payload);
            if (res && res.success) {
                showAlert("저장 완료", "현장 작업 일지가 성공적으로 기록되었습니다.");
                setFormData(prev => ({
                    ...prev,
                    work_content: '',
                    env_data: { temp: '', humi: '' }
                }));
            } else {
                throw new Error(res?.error || "Unknown error");
            }
        } catch (e) {
            console.error(e);
            showAlert("저장 실패", "일지 기록 중 오류가 발생했습니다: " + e);
        }
    };

    const handlePhoto = () => {
        fileInputRef.current?.click();
    };

    const onFileChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setPhotoPreview(reader.result);
                setFormData(prev => ({ ...prev, photos: reader.result }));
            };
            reader.readAsDataURL(file);
        }
    };

    return (
        <div ref={scrollContainerRef} {...bind} className="min-h-screen bg-slate-50 flex flex-col font-sans overflow-hidden">
            <div
                className="fixed left-0 right-0 top-0 flex justify-center pointer-events-none z-[60] transition-transform"
                style={{
                    transform: `translateY(${pullDistance}px)`,
                    opacity: pullDistance > 20 ? 1 : 0
                }}
            >
                <div className="bg-white/90 backdrop-blur-md p-2 rounded-full shadow-lg border border-slate-200 mt-2">
                    <RefreshCw
                        size={20}
                        className={`text-indigo-600 ${isPTRRefreshing ? 'animate-spin' : ''}`}
                        style={{
                            transform: isPTRRefreshing ? 'none' : `rotate(${pullDistance * 3}deg)`,
                            transition: isPTRRefreshing ? 'none' : 'transform 0.1s'
                        }}
                    />
                </div>
            </div>

            {/* Header */}
            <div className="bg-white px-5 pt-10 pb-4 border-b border-slate-100 shrink-0 flex items-center gap-2 sticky top-0 z-50">
                <h1 className="text-2xl font-black text-slate-800">현장 작업 일지</h1>
            </div>

            <div className="flex-1 overflow-y-auto p-4 pb-20 space-y-4">
                <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    ref={fileInputRef}
                    onChange={onFileChange}
                    className="hidden"
                />

                <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100 space-y-3">
                    <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-3 text-slate-800 font-black">
                            <MapPin size={18} className="text-indigo-500" />
                            <span>작업 구역/배치 선택</span>
                        </div>
                        <button
                            onClick={handleQrScan}
                            className="flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-600 border border-indigo-100 rounded-xl font-black text-xs transition-all active:scale-95"
                        >
                            <QrCode size={14} />
                            <span>QR 스캔</span>
                        </button>
                    </div>

                    <div className="space-y-3">
                        <select
                            className="w-full h-14 bg-slate-50 border-none rounded-2xl px-4 text-sm font-bold text-slate-700"
                            value={formData.space_id || ''}
                            onChange={(e) => setFormData({ ...formData, space_id: e.target.value ? parseInt(e.target.value) : null })}
                        >
                            <option value="">구역 선택 (필수 제외)</option>
                            {spaces.map(s => (
                                <option key={s.space_id} value={s.space_id}>{s.space_name}</option>
                            ))}
                        </select>

                        <select
                            className="w-full h-14 bg-slate-50 border-none rounded-2xl px-4 text-sm font-bold text-slate-700"
                            value={formData.batch_id || ''}
                            onChange={(e) => setFormData({ ...formData, batch_id: e.target.value ? parseInt(e.target.value) : null })}
                        >
                            <option value="">생산 배치 선택 (필수 제외)</option>
                            {batches.map(b => (
                                <option key={b.batch_id} value={b.batch_id}>{b.batch_code}</option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="bg-white p-4 rounded-3xl shadow-sm border border-slate-100 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-rose-50 text-rose-500 flex items-center justify-center">
                            <Thermometer size={18} />
                        </div>
                        <input
                            ref={nextInputRef}
                            type="number"
                            placeholder="온도"
                            className="w-full bg-transparent border-none text-sm font-black text-slate-800 placeholder:text-slate-300"
                            value={formData.env_data.temp}
                            onChange={(e) => setFormData({ ...formData, env_data: { ...formData.env_data, temp: e.target.value } })}
                            inputMode="decimal"
                        />
                        <span className="text-xs font-bold text-slate-400">°C</span>
                    </div>
                    <div className="bg-white p-4 rounded-3xl shadow-sm border border-slate-100 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-500 flex items-center justify-center">
                            <Droplets size={18} />
                        </div>
                        <input
                            type="number"
                            placeholder="습도"
                            className="w-full bg-transparent border-none text-sm font-black text-slate-800 placeholder:text-slate-300"
                            value={formData.env_data.humi}
                            onChange={(e) => setFormData({ ...formData, env_data: { ...formData.env_data, humi: e.target.value } })}
                        />
                        <span className="text-xs font-bold text-slate-400">%</span>
                    </div>
                </div>

                <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100 space-y-3">
                    <div className="flex items-center gap-3 text-slate-800 font-black mb-2">
                        <ClipboardList size={18} className="text-indigo-500" />
                        <span>작업 내용 기록</span>
                    </div>
                    <textarea
                        className="w-full min-h-[150px] bg-slate-50 border-none rounded-2xl p-4 text-sm font-medium text-slate-700 placeholder:text-slate-300 resize-none"
                        placeholder="어떤 작업을 하셨나요? (예: 영양제 살포, 솎아주기 등)"
                        value={formData.work_content}
                        onChange={(e) => setFormData({ ...formData, work_content: e.target.value })}
                    />
                </div>

                <button
                    onClick={handlePhoto}
                    className="w-full bg-white p-6 rounded-3xl shadow-sm border-2 border-dashed border-slate-200 flex flex-col items-center justify-center gap-2 group active:bg-slate-50 transition-colors overflow-hidden"
                >
                    {photoPreview ? (
                        <div className="w-full aspect-video rounded-xl overflow-hidden relative">
                            <img src={photoPreview} alt="Preview" className="w-full h-full object-cover" />
                            <div className="absolute inset-0 bg-black/20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                <Camera size={32} className="text-white" />
                            </div>
                        </div>
                    ) : (
                        <>
                            <div className="w-12 h-12 rounded-full bg-slate-50 text-slate-400 flex items-center justify-center group-hover:bg-indigo-50 group-hover:text-indigo-500 transition-colors">
                                <Camera size={24} />
                            </div>
                            <span className="text-sm font-black text-slate-400 group-hover:text-indigo-500">현장 사진 첨부 (선택)</span>
                        </>
                    )}
                </button>

                <div className="pt-4 pb-12">
                    <button
                        onClick={handleSave}
                        className="w-full h-16 bg-indigo-600 rounded-[2rem] text-white font-black text-lg flex items-center justify-center gap-3 shadow-xl shadow-indigo-100 active:scale-[0.98] transition-all"
                    >
                        <Save size={24} />
                        일지 저장하기
                    </button>
                </div>
            </div>

            {isScannerOpen && (
                <div className="fixed inset-0 z-[100] bg-slate-900 flex flex-col items-center justify-start p-6 pt-12 animate-in fade-in duration-300 overflow-y-auto">
                    <div className="relative w-full max-w-[280px] aspect-square border-2 border-indigo-500/50 rounded-[2.5rem] overflow-hidden bg-slate-950 shadow-2xl flex items-center justify-center shrink-0">
                        <div id="reader-worklog" className="absolute inset-0 z-0"></div>
                        {cameraError && (
                            <div className="z-20 flex flex-col items-center gap-4 px-6 py-4 bg-slate-800/95 text-white rounded-3xl text-center mx-4 border border-white/10 shadow-2xl">
                                <p className="text-xs font-black leading-relaxed">{cameraError}</p>
                                <button
                                    onClick={() => scannerFileRef.current?.click()}
                                    className="px-6 py-3 bg-indigo-600 rounded-2xl text-sm font-black shadow-lg active:scale-95 transition-all"
                                >
                                    카메라 촬영으로 인식하기
                                </button>
                                <input ref={scannerFileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFileScan} />
                            </div>
                        )}
                        <div className="absolute inset-0 pointer-events-none z-10">
                            <div className="absolute inset-x-0 h-1 bg-indigo-500 shadow-[0_0_15px_rgba(99,102,241,0.8)] animate-scan" />
                            <div className="absolute top-8 left-8 w-8 h-8 border-t-4 border-l-4 border-white rounded-tl-lg" />
                            <div className="absolute top-8 right-8 w-8 h-8 border-t-4 border-r-4 border-white rounded-tr-lg" />
                            <div className="absolute bottom-8 left-8 w-8 h-8 border-b-4 border-l-4 border-white rounded-bl-lg" />
                            <div className="absolute bottom-8 right-8 w-8 h-8 border-b-4 border-r-4 border-white rounded-br-lg" />
                        </div>
                    </div>
                    <div className="mt-6 text-center text-white space-y-4 w-full">
                        <h3 className="text-xl font-black">현장 QR 스캔 중</h3>
                        <p className="text-sm text-slate-400">구역이나 배치 QR 코드를 맞춰주세요.</p>
                        <div className="max-w-xs mx-auto pt-2 space-y-2">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block">직접 코드 입력 (인식 불가 시)</label>
                            <div className="relative opacity-60 focus-within:opacity-100 transition-opacity">
                                <input
                                    ref={scannerInputRef}
                                    type="text"
                                    className="w-full h-12 bg-white/5 border border-white/10 rounded-2xl px-6 text-white text-center font-black focus:border-indigo-500/50 focus:ring-0 transition-all outline-none text-xs"
                                    placeholder="여기에 직접 입력"
                                    value={scannerValue}
                                    onChange={(e) => setScannerValue(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            processQrCode(scannerValue);
                                            e.target.blur();
                                        }
                                    }}
                                />
                            </div>
                        </div>
                    </div>
                    <button
                        onClick={() => {
                            setIsScannerOpen(false);
                            setCameraError(null);
                        }}
                        className="mt-8 mb-12 w-16 h-16 bg-white/10 hover:bg-white/20 text-white rounded-full flex items-center justify-center transition-all active:scale-90 shrink-0"
                    >
                        <XIcon size={32} />
                    </button>
                    <style dangerouslySetInnerHTML={{
                        __html: `
                        @keyframes scan { 0% { top: 0; } 50% { top: 100%; } 100% { top: 0; } }
                        .animate-scan { position: absolute; animation: scan 3s infinite linear; }
                        #reader-worklog video { 
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

export default MobileWorkLog;

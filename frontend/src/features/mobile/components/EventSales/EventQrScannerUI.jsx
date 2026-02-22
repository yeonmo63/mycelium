import React from 'react';
import { X as XIcon } from 'lucide-react';

const EventQrScannerUI = ({
    isOpen,
    onClose,
    cameraError,
    fileInputRef,
    handleFileScan,
    scannerInputRef,
    scannerValue,
    setScannerValue,
    processQrCode
}) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] bg-slate-900 flex flex-col items-center justify-start p-6 pt-12 animate-in fade-in duration-300 overflow-y-auto">
            <div className="relative w-full max-w-[280px] aspect-square border-2 border-indigo-500/50 rounded-[2.5rem] overflow-hidden bg-slate-950 shadow-2xl flex items-center justify-center shrink-0">
                <div id="reader-event" className="absolute inset-0 z-0"></div>
                {cameraError && (
                    <div className="z-20 flex flex-col items-center gap-4 px-6 py-4 bg-slate-800/95 text-white rounded-3xl text-center mx-4 border border-white/10 shadow-2xl">
                        <p className="text-xs font-black leading-relaxed">{cameraError}</p>
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            className="px-6 py-3 bg-indigo-600 rounded-2xl text-sm font-black shadow-lg active:scale-95 transition-all"
                        >
                            카메라 촬영으로 인식하기
                        </button>
                        <input ref={fileInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFileScan} />
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
                <h3 className="text-xl font-black">특판 품목 스캔 중</h3>
                <p className="text-sm text-slate-400">사각형 안에 상품 QR 코드를 맞춰주세요.</p>
                <div className="max-w-xs mx-auto pt-2 space-y-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block">직접 코드 입력 (인식 불가 시)</label>
                    <div className="relative opacity-60 focus-within:opacity-100 transition-opacity">
                        <input
                            ref={scannerInputRef}
                            type="text"
                            className="w-full h-12 bg-white/5 border border-white/10 rounded-2xl px-6 text-white text-center font-black focus:border-indigo-500 focus:ring-0 transition-all outline-none text-xs"
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
                onClick={onClose}
                className="mt-8 mb-12 w-16 h-16 bg-white/10 hover:bg-white/20 text-white rounded-full flex items-center justify-center transition-all active:scale-90 shrink-0"
            >
                <XIcon size={32} />
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
    );
};

export default EventQrScannerUI;

import React from 'react';
import { X as XIcon } from 'lucide-react';

const EventQrScannerUI = ({
    isOpen,
    onClose,
    isContinuousScan,
    toggleContinuousScan,
    cameraError,
    fileInputRef,
    handleFileScan,
    scannerInputRef,
    scannerValue,
    setScannerValue,
    processQrCode
}) => {

    React.useEffect(() => {
        if (isOpen && scannerInputRef?.current) {
            setTimeout(() => scannerInputRef.current.focus(), 300);
        }
    }, [isOpen]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] bg-slate-950 flex flex-col items-center justify-start p-6 pt-16 animate-in fade-in duration-500 overflow-y-auto overflow-x-hidden">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-indigo-900/20 via-slate-950 to-slate-950 pointer-events-none"></div>

            <div className="relative w-full max-w-[300px] aspect-square border-[3px] border-white/10 rounded-[3rem] overflow-hidden bg-black shadow-[0_0_60px_rgba(99,102,241,0.2)] flex items-center justify-center shrink-0 group">
                <div id="reader-event" className="absolute inset-0 z-0"></div>
                {cameraError && (
                    <div className="z-20 flex flex-col items-center gap-5 px-8 py-6 bg-slate-900/90 backdrop-blur-xl text-white rounded-[2rem] text-center mx-4 border border-white/10 shadow-3xl">
                        <div className="w-12 h-12 rounded-full bg-rose-500/20 flex items-center justify-center text-rose-500 mb-2">
                            <span className="material-symbols-rounded text-3xl">videocam_off</span>
                        </div>
                        <p className="text-[11px] font-black leading-relaxed text-slate-300">{cameraError}</p>
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 rounded-2xl text-xs font-black shadow-[0_8px_20px_rgba(99,102,241,0.3)] active:scale-95 transition-all flex items-center justify-center gap-2"
                        >
                            <span className="material-symbols-rounded text-lg">photo_camera</span>
                            카메라 촬영으로 인식
                        </button>
                        <input ref={fileInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFileScan} />
                    </div>
                )}
                <div className="absolute inset-0 pointer-events-none z-10">
                    <div className="absolute inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-indigo-500 to-transparent shadow-[0_0_20px_rgba(99,102,241,1)] animate-scan" style={{ top: '10%' }} />

                    {/* Corner accents */}
                    <div className="absolute top-10 left-10 w-10 h-10 border-t-[4px] border-l-[4px] border-white shadow-[0_0_15px_rgba(255,255,255,0.4)] rounded-tl-xl" />
                    <div className="absolute top-10 right-10 w-10 h-10 border-t-[4px] border-r-[4px] border-white shadow-[0_0_15px_rgba(255,255,255,0.4)] rounded-tr-xl" />
                    <div className="absolute bottom-10 left-10 w-10 h-10 border-b-[4px] border-l-[4px] border-white shadow-[0_0_15px_rgba(255,255,255,0.4)] rounded-bl-xl" />
                    <div className="absolute bottom-10 right-10 w-10 h-10 border-b-[4px] border-r-[4px] border-white shadow-[0_0_15px_rgba(255,255,255,0.4)] rounded-br-xl" />
                </div>
            </div>

            <div className="mt-10 text-center text-white space-y-6 w-full max-w-sm relative z-10">
                <div className="space-y-2">
                    <h3 className="text-2xl font-black tracking-tight bg-gradient-to-br from-white to-slate-400 bg-clip-text text-transparent">특판 품목 스캔</h3>
                    <p className="text-xs text-slate-500 font-bold uppercase tracking-[0.2em]">Ready to analyze QR codes</p>
                </div>

                <div className="flex justify-center pt-2">
                    <button
                        onClick={toggleContinuousScan}
                        className={`group relative h-12 px-8 rounded-2xl flex items-center gap-3 transition-all duration-500 ${isContinuousScan
                            ? 'bg-indigo-600 shadow-[0_0_30px_rgba(79,70,229,0.4)] border border-indigo-400/50'
                            : 'bg-white/5 border border-white/10 opacity-60 hover:opacity-100'
                            }`}
                    >
                        <div className={`w-2 h-2 rounded-full ${isContinuousScan ? 'bg-white animate-pulse' : 'bg-slate-500'}`}></div>
                        <span className={`text-xs font-black uppercase tracking-widest ${isContinuousScan ? 'text-white' : 'text-slate-400'}`}>
                            {isContinuousScan ? 'Continuous Mode ON' : 'Single Scan Mode'}
                        </span>
                        <div className="absolute -inset-1 bg-indigo-500/20 rounded-[1.5rem] blur opacity-0 group-hover:opacity-100 transition-opacity"></div>
                    </button>
                </div>


                <div className="pt-4 space-y-3">
                    <div className="flex items-center gap-3 px-4 mb-1">
                        <div className="h-px flex-1 bg-white/5"></div>
                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] whitespace-nowrap">Manual Entry</span>
                        <div className="h-px flex-1 bg-white/5"></div>
                    </div>
                    <div className="relative group/input">
                        <input
                            ref={scannerInputRef}
                            type="text"
                            inputMode="text"
                            className="w-full h-14 bg-white/[0.03] border border-white/10 rounded-2xl px-6 text-white text-center font-black focus:border-indigo-500/50 focus:bg-white/[0.07] focus:ring-4 focus:ring-indigo-500/10 transition-all outline-none text-[15px] placeholder:text-slate-700 tracking-wider"
                            placeholder="코드 직접 입력"
                            value={scannerValue}
                            onChange={(e) => setScannerValue(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    processQrCode(scannerValue);
                                    e.target.blur();
                                }
                            }}
                        />
                        <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-600 group-focus-within/input:text-indigo-400 transition-colors">
                            <span className="material-symbols-rounded text-xl">keyboard_return</span>
                        </div>
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

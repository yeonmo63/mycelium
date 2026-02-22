import React from 'react';
import { QrCode, Percent } from 'lucide-react';

const EventCartHeader = ({
    isScanning,
    onQrScan,
    discountRate,
    setDiscountRate
}) => {
    return (
        <div className="grid grid-cols-2 gap-4">
            <button
                onClick={onQrScan}
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
    );
};

export default EventCartHeader;

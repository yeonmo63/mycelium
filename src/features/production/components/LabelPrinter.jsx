import React, { forwardRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import dayjs from 'dayjs';

const LabelPrinter = forwardRef(({ type, data }, ref) => {
    if (!data) return null;

    return (
        <div
            ref={ref}
            className={`qr-label-wrapper bg-white text-black p-4 transition-opacity ${data?.isPrinting ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
            style={{
                width: '80mm',
                height: '40mm',
                position: 'fixed',
                left: '-9999px',
                top: '-9999px',
                zIndex: -1
            }}
        >
            {data?.isPrinting && (
                <style>
                    {`
                    @media print {
                        @page { 
                            size: 80mm 40mm;
                            margin: 0; 
                        }
                        html, body { 
                            margin: 0; 
                            padding: 0;
                            height: 40mm;
                            width: 80mm;
                            background: white !important;
                            visibility: hidden;
                        }
                        .qr-label-wrapper { 
                            visibility: visible !important;
                            display: block !important;
                            position: fixed !important;
                            left: 0 !important;
                            top: 0 !important;
                            width: 80mm !important;
                            height: 40mm !important;
                            margin: 0 !important;
                            padding: 3mm !important;
                            box-sizing: border-box !important;
                            z-index: 99999 !important;
                            background: white !important;
                        }
                        .qr-label-wrapper * { 
                            visibility: visible !important; 
                        }
                        .label-container {
                            width: 100%;
                            height: 100%;
                            display: flex !important;
                            flex-direction: row !important;
                            gap: 1rem;
                            align-items: center;
                        }
                        /* Force specific hide of other print views */
                        #printable-report { display: none !important; }
                    }
                    `}
                </style>
            )}

            <div className="label-container flex flex-row gap-4 items-center h-full">
                {/* QR Code Section */}
                <div className="flex-shrink-0 flex flex-col items-center gap-1">
                    <div className="bg-white p-1 border border-slate-200 rounded-lg">
                        <QRCodeSVG
                            value={data.qrValue || 'N/A'}
                            size={type === 'harvest' ? 85 : 100}
                            style={{
                                width: type === 'harvest' ? '85px' : '100px',
                                height: type === 'harvest' ? '85px' : '100px'
                            }}
                            level="M"
                            bgColor="#ffffff"
                            includeMargin={false}
                        />
                    </div>
                    {type === 'harvest' && (
                        <div className="text-[7px] font-black text-center leading-none text-emerald-800">
                            농산물 우수관리<br />(GAP)인증
                        </div>
                    )}
                </div>

                {/* Info Section */}
                <div className="flex-1 flex flex-col justify-center overflow-hidden">
                    <div className="mb-1 flex justify-between items-start border-b border-slate-900 pb-1">
                        <div className="flex-1">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">
                                {type === 'product' ? 'Product Item' : 'Harvest Label'}
                            </p>
                            <h2 className="text-[13px] font-black text-slate-900 truncate leading-tight">
                                {data.title || 'Unknown Item'}
                            </h2>
                        </div>
                        {type === 'harvest' && (
                            <div className="text-right shrink-0">
                                <div className="text-[9px] font-black text-slate-900 leading-none">영농기록장</div>
                                <div className="text-[7px] font-bold text-slate-400 leading-none">GAP 인증</div>
                            </div>
                        )}
                    </div>

                    <div className="space-y-0.5">
                        <div className="flex justify-between items-center text-[9px] font-bold text-slate-600 border-b border-slate-100 pb-0.5">
                            <span>관리번호</span>
                            <span className="text-slate-900 font-black">{data.code || '-'}</span>
                        </div>
                        {data.spec && (
                            <div className="flex justify-between items-center text-[9px] font-bold text-slate-600 border-b border-slate-100 pb-0.5">
                                <span>규격/특징</span>
                                <span className="text-slate-900 font-black truncate max-w-[100px]">{data.spec}</span>
                            </div>
                        )}
                        {data.date && (
                            <div className="flex justify-between items-center text-[9px] font-bold text-slate-600 border-b border-slate-100 pb-0.5">
                                <span>기타정보</span>
                                <span className="text-slate-900 font-black">{data.date}</span>
                            </div>
                        )}
                    </div>

                    <div className="mt-2 text-right">
                        <p className="text-[8px] font-black text-slate-300 italic">
                            Mycelium Smart Farm System
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
});

export default LabelPrinter;

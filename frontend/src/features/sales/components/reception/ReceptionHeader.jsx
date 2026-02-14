import React from 'react';

const ReceptionHeader = ({ fileInputRef, onCsvUpload }) => {
    return (
        <div className="flex justify-between items-end mb-4">
            <div>
                <div className="flex items-center gap-2 mb-0.5">
                    <span className="w-6 h-1 bg-indigo-600 rounded-full"></span>
                    <span className="text-[9px] font-black tracking-[0.2em] text-indigo-600 uppercase">Sales Management System</span>
                </div>
                <h1 className="text-3xl font-black text-slate-600 tracking-tighter" style={{ fontFamily: '"Noto Sans KR", sans-serif' }}>일반 접수 <span className="text-slate-300 font-light ml-1 text-xl">Reception</span></h1>
            </div>
            <div className="flex gap-3">
                <button onClick={() => fileInputRef.current?.click()} className="group h-10 px-5 rounded-xl bg-white border border-slate-200 text-slate-600 font-bold hover:border-indigo-500 hover:text-indigo-600 transition-all flex items-center gap-2 shadow-sm text-sm">
                    <span className="material-symbols-rounded text-lg group-hover:scale-110 transition-transform">upload_file</span> 주소입력 (CSV)
                </button>
                <input type="file" ref={fileInputRef} onChange={onCsvUpload} className="hidden" accept=".csv" />
            </div>
        </div>
    );
};

export default ReceptionHeader;

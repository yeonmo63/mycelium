import React from 'react';

const AddressLayer = ({ isOpen, onClose }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm shadow-2xl" onClick={onClose}></div>
            <div className="bg-white rounded-3xl w-full max-w-[500px] h-[600px] shadow-2xl relative overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col">
                <div className="bg-slate-900 px-6 py-4 text-white flex justify-between items-center shrink-0">
                    <span className="font-bold">주소 검색</span>
                    <button onClick={onClose} className="hover:bg-white/10 rounded-lg p-1">
                        <span className="material-symbols-rounded">close</span>
                    </button>
                </div>
                <div id="addr-layer-container" className="flex-1 w-full bg-slate-50"></div>
            </div>
        </div>
    );
};

export default AddressLayer;

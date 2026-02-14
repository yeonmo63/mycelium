import React from 'react';
import { X, Printer } from 'lucide-react';
import { handlePrintRaw } from '../utils/printUtils';

const printStyles = `
    @media print {
        @page { size: A4 landscape; margin: 0; }
        html, body { 
            background: white !important; 
            color: black !important;
            margin: 0 !important;
            padding: 0 !important;
        }
        nav, .tauri-drag-region, .print\\:hidden, .no-print { display: none !important; }
        #root > div:not(.fixed) { display: none !important; }
        .print-modal-content {
            display: block !important;
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 10mm !important;
            visibility: visible !important;
            background: white !important;
            box-shadow: none !important;
        }
        .print-modal-content * {
            visibility: visible !important;
            border-color: black !important;
        }
    }
`;

const PrintPreviewModal = ({ isOpen, onClose, title, children }) => {
    if (!isOpen) return null;

    const handlePrint = () => {
        const el = document.getElementById('print-preview-content');
        if (!el) return;

        const html = `
            <style>
                ${printStyles}
                body { font-family: 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif; }
                table { border-collapse: collapse; width: 100%; }
                th, td { border: 1px solid #000; }
            </style>
            <div class="print-modal-content">
                ${el.innerHTML}
            </div>
        `;
        handlePrintRaw(html);
    };

    return (
        <div className="fixed inset-0 z-[300] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 print:p-0 print:bg-white print:block print:relative print:z-0">
            {/* UI Controls (Hidden on Print) */}
            <div className="fixed top-8 right-8 flex flex-col gap-4 print:hidden z-[310] no-print">
                <button
                    onClick={onClose}
                    className="w-14 h-14 bg-white text-slate-400 rounded-2xl shadow-2xl hover:text-rose-500 hover:scale-110 active:scale-95 transition-all flex items-center justify-center group"
                    title="닫기"
                >
                    <X size={32} className="group-hover:rotate-90 transition-transform duration-300" />
                </button>

                <div className="h-px bg-white/20 w-full" />

                <button
                    onClick={handlePrint}
                    className="h-14 px-8 rounded-2xl font-black text-sm bg-indigo-600 text-white shadow-2xl shadow-indigo-500/30 hover:bg-indigo-700 hover:-translate-y-1 active:translate-y-0 transition-all flex items-center gap-3"
                >
                    <Printer size={20} /> 인쇄하기
                </button>
            </div>

            {/* A4 Paper Preview */}
            <div className="w-full max-w-[297mm] h-[210mm] max-h-[90vh] bg-white rounded-[1rem] shadow-2xl overflow-y-auto overflow-x-hidden print:max-h-none print:shadow-none print:rounded-none print:overflow-visible print:w-full relative custom-scrollbar">
                <div id="print-preview-content" className="p-[15mm]">
                    {children}
                </div>
            </div>
        </div>
    );
};

export default PrintPreviewModal;

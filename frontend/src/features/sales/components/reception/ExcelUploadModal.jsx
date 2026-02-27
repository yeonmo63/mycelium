import React, { useState, useEffect } from 'react';
import { formatPhoneNumber } from '../../../../utils/common';

const ExcelUploadModal = ({ isOpen, onClose, fileData, onImport }) => {
    const [mapping, setMapping] = useState({
        customer_name: -1,
        mobile: -1,
        zip: -1,
        address1: -1,
        address2: -1,
        product: -1,
        qty: -1,
        price: -1,
        memo: -1
    });

    const [previewData, setPreviewData] = useState([]);
    const [headers, setHeaders] = useState([]);
    const [rows, setRows] = useState([]);

    useEffect(() => {
        if (fileData) {
            setHeaders(fileData.headers || []);
            setRows(fileData.rows || []);

            // Auto-detect mappings based on header names
            const newMapping = { ...mapping };
            fileData.headers.forEach((h, idx) => {
                const head = h.replace(/\s/g, '').toLowerCase();
                if (head.includes('이름') || head.includes('수취인') || head.includes('고객명')) newMapping.customer_name = idx;
                if (head.includes('전화') || head.includes('휴대폰') || head.includes('연락처')) newMapping.mobile = idx;
                if (head.includes('우편') || head.includes('우편번호')) newMapping.zip = idx;
                if (head.includes('주소') && !head.includes('상세')) newMapping.address1 = idx;
                if (head.includes('상세주소') || (head.includes('주소') && head.includes('2'))) newMapping.address2 = idx;
                if (head.includes('상품명') || head.includes('품명')) newMapping.product = idx;
                if (head.includes('수량')) newMapping.qty = idx;
                if (head.includes('단가') || head.includes('판매가')) newMapping.price = idx;
                if (head.includes('메모') || head.includes('요청사항')) newMapping.memo = idx;
            });
            setMapping(newMapping);
        }
    }, [fileData]);

    const handleImport = () => {
        const importedRows = rows.map(row => {
            return {
                shipName: mapping.customer_name !== -1 ? row[mapping.customer_name] : '',
                shipMobile: mapping.mobile !== -1 ? formatPhoneNumber(row[mapping.mobile]) : '',
                shipZip: mapping.zip !== -1 ? row[mapping.zip] : '',
                shipAddr1: mapping.address1 !== -1 ? row[mapping.address1] : '',
                shipAddr2: mapping.address2 !== -1 ? row[mapping.address2] : '',
                product: mapping.product !== -1 ? row[mapping.product] : '',
                qty: mapping.qty !== -1 ? parseInt(String(row[mapping.qty]).replace(/[^0-9]/g, '')) || 1 : 1,
                price: mapping.price !== -1 ? parseInt(String(row[mapping.price]).replace(/[^0-9]/g, '')) || 0 : 0,
                shipMemo: mapping.memo !== -1 ? row[mapping.memo] : ''
            };
        }).filter(r => r.shipName || r.product);

        onImport(importedRows);
        onClose();
    };

    if (!isOpen) return null;

    const fields = [
        { key: 'customer_name', label: '고객명/수취인', required: true },
        { key: 'mobile', label: '연락처', required: true },
        { key: 'product', label: '상품명', required: true },
        { key: 'qty', label: '수량' },
        { key: 'price', label: '단가' },
        { key: 'zip', label: '우편번호' },
        { key: 'address1', label: '기본주소' },
        { key: 'address2', label: '상세주소' },
        { key: 'memo', label: '배송메모' },
    ];

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
            <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden border border-white/20">
                {/* Header */}
                <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                    <div>
                        <h2 className="text-2xl font-black text-slate-800 tracking-tight">통합 엑셀 업로드 설정</h2>
                        <p className="text-xs text-slate-400 font-bold mt-1 uppercase tracking-wider">Excel/CSV Column Mapping & Preview</p>
                    </div>
                    <button onClick={onClose} className="w-10 h-10 rounded-full hover:bg-slate-200 flex items-center justify-center transition-colors">
                        <span className="material-symbols-rounded text-slate-400">close</span>
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-hidden flex flex-col p-8 gap-8">
                    {/* Mapping Settings */}
                    <div className="grid grid-cols-3 gap-6">
                        {fields.map(f => (
                            <div key={f.key}>
                                <label htmlFor={`mapping-select-${f.key}`} className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">
                                    {f.label} {f.required && <span className="text-rose-500">*</span>}
                                </label>
                                <select
                                    id={`mapping-select-${f.key}`}
                                    value={mapping[f.key]}
                                    onChange={(e) => setMapping(prev => ({ ...prev, [f.key]: parseInt(e.target.value) }))}
                                    className="w-full h-11 bg-slate-100 border-none rounded-2xl px-4 font-bold text-slate-700 focus:ring-4 focus:ring-indigo-500/10 transition-all text-sm"
                                >
                                    <option value={-1}>-- 가져오지 않음 --</option>
                                    {headers.map((h, i) => (
                                        <option key={i} value={i}>{h}</option>
                                    ))}
                                </select>
                            </div>
                        ))}
                    </div>

                    {/* Preview Table */}
                    <div className="flex-1 flex flex-col min-h-0 border border-slate-200 rounded-[1.5rem] overflow-hidden">
                        <div className="bg-slate-900 px-6 py-3 text-white flex justify-between items-center">
                            <span className="text-xs font-black uppercase tracking-widest opacity-80">데이터 미리보기 (상위 5건)</span>
                            <span className="text-[10px] font-bold bg-white/20 px-2 py-0.5 rounded-full">총 {rows.length}개 행 감지됨</span>
                        </div>

                        <div className="flex-1 overflow-auto bg-slate-50">
                            <table className="w-full text-xs text-left border-collapse">
                                <thead className="sticky top-0 bg-slate-100/90 backdrop-blur z-10">
                                    <tr>
                                        {headers.map((h, idx) => (
                                            <th key={idx} className="p-3 border-b border-slate-200 font-black text-slate-500 uppercase tracking-tighter whitespace-nowrap">{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.slice(0, 5).map((row, ridx) => (
                                        <tr key={ridx} className="border-b border-slate-200/50 bg-white hover:bg-indigo-50/30 transition-colors">
                                            {row.map((cell, cidx) => (
                                                <td key={cidx} className="p-3 whitespace-nowrap text-slate-600 font-medium">{cell}</td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="p-8 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
                    <button onClick={onClose} className="h-14 px-8 rounded-2xl border border-slate-200 bg-white font-black text-slate-500 hover:bg-slate-100 transition-all">취소</button>
                    <button
                        onClick={handleImport}
                        disabled={mapping.customer_name === -1 || mapping.product === -1}
                        className="h-14 px-10 rounded-2xl bg-indigo-600 text-white font-black hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-xl shadow-indigo-200 transition-all transform hover:scale-[1.02] active:scale-95"
                    >
                        데이터 가져오기 ({rows.length}건)
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ExcelUploadModal;

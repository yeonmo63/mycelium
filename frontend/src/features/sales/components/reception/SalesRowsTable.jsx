import React from 'react';
import { formatCurrency } from '../../../../utils/common';

const SalesRowsTable = ({ salesRows, editingTempId, handleEditRow, handleDeleteRow }) => {
    return (
        <div className="flex-1 overflow-hidden flex flex-col bg-white rounded-[1.5rem] shadow-xl border border-slate-200 relative mb-3">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500"></div>
            <div className="flex-1 overflow-auto stylish-scrollbar p-0.5">
                <table className="w-full text-xs border-separate border-spacing-0">
                    <thead className="sticky top-0 z-20">
                        <tr className="bg-slate-50/80 backdrop-blur-md">
                            <th className="px-4 py-2 text-center text-[9px] font-black uppercase text-slate-400 border-b border-slate-100">번호</th>
                            <th className="px-4 py-2 text-left text-[9px] font-black uppercase text-slate-400 border-b border-slate-100">상품명</th>
                            <th className="px-4 py-2 text-center text-[9px] font-black uppercase text-slate-400 border-b border-slate-100">규격</th>
                            <th className="px-4 py-2 text-center text-[9px] font-black uppercase text-slate-400 border-b border-slate-100">수량</th>
                            <th className="px-4 py-2 text-right text-[9px] font-black uppercase text-slate-400 border-b border-slate-100">단가</th>
                            <th className="px-4 py-2 text-right text-[9px] font-black uppercase text-slate-400 border-b border-slate-100">할인</th>
                            <th className="px-4 py-2 text-right text-[9px] font-black uppercase text-slate-400 border-b border-slate-100">금액</th>
                            <th className="px-4 py-2 text-center text-[9px] font-black uppercase text-slate-400 border-b border-slate-100">상태</th>
                            <th className="px-4 py-2 text-center text-[9px] font-black uppercase text-slate-400 border-b border-slate-100">관리</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                        {salesRows.map((row, idx) => (
                            <tr key={row.tempId} className={`group hover:bg-slate-50/50 transition-all ${editingTempId === row.tempId ? 'bg-indigo-50/40' : ''}`}>
                                <td className="px-4 py-2 text-center text-[9px] font-black uppercase text-slate-400 border-b border-slate-100">{salesRows.length - idx}</td>
                                <td className="px-4 py-2 border-b border-slate-100">
                                    <div className="flex items-center gap-2">
                                        <div className="w-1.5 h-6 rounded-full bg-slate-100 group-hover:bg-indigo-500 transition-all"></div>
                                        <div>
                                            <div className="font-black text-slate-900 text-sm group-hover:text-indigo-600 transition-colors uppercase">{row.product}</div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-[9px] text-slate-400 font-bold uppercase truncate max-w-[150px]">{row.shipAddr1}</span>
                                                <span className="text-[9px] text-indigo-500/70 font-black shrink-0">{row.shipName}</span>
                                            </div>
                                        </div>
                                    </div>
                                </td>
                                <td className="px-4 py-2 text-center border-b border-slate-100">
                                    <div className="inline-flex items-center justify-center min-w-[32px] h-5 rounded bg-slate-100 text-slate-500 font-bold text-[9px]">{row.spec || '-'}</div>
                                </td>
                                <td className="px-4 py-2 text-center font-black text-black border-b border-slate-100">
                                    {row.qty}
                                </td>
                                <td className="px-4 py-2 text-right font-bold text-slate-500 border-b border-slate-100">{formatCurrency(row.price)}</td>
                                <td className="px-4 py-2 text-right font-bold text-indigo-500 border-b border-slate-100">{row.discountRate}%</td>
                                <td className="px-4 py-2 text-right border-b border-slate-100">
                                    <span className="text-sm font-black text-slate-900 tracking-tighter">{formatCurrency(row.amount)}</span>
                                </td>
                                <td className="px-4 py-2 text-center border-b border-slate-100">
                                    <span className="text-[9px] font-black text-slate-500 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100">{row.status}</span>
                                </td>
                                <td className="px-4 py-2 text-center border-b border-slate-100">
                                    <div className="flex justify-center gap-1.5 opacity-40 group-hover:opacity-100 transition-all duration-300">
                                        <button onClick={() => handleEditRow(row)} className="w-7 h-7 rounded-lg bg-white border border-slate-200 text-slate-500 hover:text-indigo-600 hover:border-indigo-200 hover:shadow-sm transition-all" title="수정">
                                            <span className="material-symbols-rounded text-base">edit_note</span>
                                        </button>
                                        <button onClick={() => handleDeleteRow(row)} className="w-7 h-7 rounded-lg bg-white border border-slate-200 text-slate-500 hover:text-rose-600 hover:border-rose-200 hover:shadow-sm transition-all" title="삭제">
                                            <span className="material-symbols-rounded text-base">delete_sweep</span>
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                        {salesRows.length === 0 && (
                            <tr>
                                <td colSpan="9" className="py-16 text-center">
                                    <div className="flex flex-col items-center gap-2">
                                        <span className="material-symbols-rounded text-4xl text-slate-200">auto_stories</span>
                                        <div className="font-black text-lg text-slate-800">접수 내역이 없습니다</div>
                                        <p className="text-slate-400 text-[11px]">고객 선택 후 항목을 추가해주세요.</p>
                                    </div>
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default SalesRowsTable;

import React from 'react';
import { formatCurrency } from '../../../../utils/common';

const SalesInputPanel = ({
    inputState, handleInputChange, products, addresses, prodSelectRef,
    handleAddressSearch, handleAddRow, editingTempId
}) => {
    return (
        <div className="bg-white rounded-[1.5rem] p-5 shadow-lg border border-slate-200/60 relative mb-3">
            <div className="absolute top-4 left-6 flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-indigo-600 animate-pulse"></div>
                <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">항목 입력</span>
            </div>

            <div className="grid grid-cols-12 gap-3 mb-4 mt-4">
                <div className="col-span-3">
                    <label className="text-[10.5px] font-bold text-slate-600 uppercase mb-1 block">상품명</label>
                    <div className="relative">
                        <select name="product" value={inputState.product} onChange={handleInputChange} ref={prodSelectRef}
                            className="w-full h-10 rounded-xl bg-white border-slate-200 text-[14px] font-bold focus:ring-2 focus:ring-indigo-600 transition-all appearance-none px-4">
                            <option value="">상품 선택</option>
                            {products.map(p => <option key={p.product_id} value={p.product_name}>{p.product_name}</option>)}
                        </select>
                        <span className="material-symbols-rounded absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 text-base">unfold_more</span>
                    </div>
                </div>
                <div className="col-span-1">
                    <label className="text-[10.5px] font-bold text-slate-600 uppercase text-center mb-1 block">규격</label>
                    <input name="spec" value={inputState.spec} readOnly className="w-full h-10 rounded-xl bg-slate-100 border-none text-[14px] text-center font-bold text-slate-500 shadow-inner" />
                </div>
                <div className="col-span-1">
                    <label className="text-[10.5px] font-bold text-slate-600 uppercase text-center mb-1 block">수량</label>
                    <input type="number" name="qty" value={inputState.qty} onChange={handleInputChange} className="w-full h-10 rounded-xl bg-white border-slate-200 text-center font-black focus:ring-2 focus:ring-indigo-600 transition-all text-[14px]" />
                </div>
                <div className="col-span-1">
                    <label className="text-[10.5px] font-bold text-slate-600 uppercase text-right pr-2 mb-1 block">단가</label>
                    <input name="price" value={formatCurrency(inputState.price)} onChange={handleInputChange} className="w-full h-10 rounded-xl bg-white border-slate-200 text-right font-black pr-3 focus:ring-2 focus:ring-indigo-600 transition-all text-[14px]" />
                </div>
                <div className="col-span-1">
                    <label className="text-[10.5px] font-bold text-slate-600 uppercase text-center mb-1 block">할인(%)</label>
                    <input type="number" name="discountRate" value={inputState.discountRate} onChange={handleInputChange} className="w-full h-10 rounded-xl bg-white border-slate-200 text-center font-black focus:ring-2 focus:ring-indigo-600 transition-all text-[14px] text-indigo-600 px-0" />
                </div>
                <div className="col-span-1">
                    <label className="text-[10.5px] font-bold text-indigo-600 uppercase text-right pr-2 mb-1 block">금액</label>
                    <input value={formatCurrency(inputState.amount)} readOnly
                        className="w-full h-10 rounded-xl bg-slate-100 border-none text-slate-900 text-right font-black text-[14px] px-4 shadow-inner" />
                </div>
            </div>

            <div className="bg-slate-100/50 p-5 rounded-[1.5rem] border border-slate-200 flex flex-col gap-4">
                <div className="flex gap-4 items-end">
                    <div className="shrink-0 flex items-center gap-3 pr-4 border-r border-slate-200">
                        <div className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-500 shadow-sm"><span className="material-symbols-rounded text-lg">local_shipping</span></div>
                        <div>
                            <label className="text-[11px] font-black text-slate-700 uppercase tracking-tight block mb-1">배송지 선택</label>
                            <select
                                name="shipType"
                                value={inputState.shipType}
                                onChange={handleInputChange}
                                className="w-48 h-10 rounded-lg border-slate-200 bg-white text-[14px] font-bold text-slate-900 shadow-sm focus:ring-2 focus:ring-indigo-500 px-3 py-1 transition-all"
                            >
                                <option value="basic">고객 주소</option>
                                {addresses.map(a => (
                                    <option key={a.address_id} value={`addr_${a.address_id}`}>
                                        {a.is_default ? '기본 배송지' : (a.address_alias || a.address_primary)}
                                    </option>
                                ))}
                                <option value="new">직접 입력</option>
                            </select>
                        </div>
                    </div>
                    <div className="flex-1 grid grid-cols-12 gap-2">
                        <div className="col-span-1">
                            <label className="text-[10.5px] font-bold text-slate-600 uppercase block mb-1 ml-1 text-center">우편번호</label>
                            <input name="shipZip" value={inputState.shipZip} readOnly onClick={() => handleAddressSearch('input')} className="w-full h-9 rounded-lg border-slate-100 text-[14px] font-black text-slate-900 text-center bg-slate-100 shadow-sm cursor-pointer" />
                        </div>
                        <div className="col-span-5">
                            <label className="text-[10.5px] font-bold text-slate-600 uppercase block mb-1 ml-1">기본 배송 주소 (클릭하여 검색)</label>
                            <input name="shipAddr1" value={inputState.shipAddr1} readOnly onClick={() => handleAddressSearch('input')} className="w-full h-9 rounded-lg border-slate-100 text-[14px] font-bold text-slate-900 bg-slate-100 px-2 shadow-sm cursor-pointer" />
                        </div>
                        <div className="col-span-6">
                            <label className="text-[10.5px] font-bold text-slate-600 uppercase block mb-1 ml-1">상세 주소 입력</label>
                            <input name="shipAddr2" value={inputState.shipAddr2} onChange={handleInputChange} placeholder="아파트 동, 호수 등 상세정보 입력" className="w-full h-9 rounded-lg border-slate-200 bg-slate-100 text-[14px] font-bold text-slate-900 px-3 focus:ring-2 focus:ring-indigo-600 transition-all" />
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-12 gap-3 items-end pt-1">
                    <div className="col-span-2">
                        <label className="text-[10.5px] font-bold text-slate-600 uppercase block mb-1 ml-1">수령인(받는분)</label>
                        <input name="shipName" value={inputState.shipName} onChange={handleInputChange} placeholder="성함" className="w-full h-10 rounded-lg border-slate-200 bg-slate-100 text-[14px] font-bold text-slate-900 px-3 focus:ring-2 focus:ring-indigo-600 transition-all" />
                    </div>
                    <div className="col-span-2">
                        <label className="text-[10.5px] font-bold text-slate-600 uppercase block mb-1 ml-1">연락처</label>
                        <input name="shipMobile" value={inputState.shipMobile} onChange={handleInputChange} placeholder="010-0000-0000" className="w-full h-10 rounded-lg border-slate-200 bg-slate-100 text-[14px] font-black text-slate-900 px-3 focus:ring-2 focus:ring-indigo-600 text-center" />
                    </div>
                    <div className="col-span-4">
                        <label className="text-[10.5px] font-bold text-indigo-600 uppercase block mb-1 ml-1">배송 메모</label>
                        <input name="shipMemo" value={inputState.shipMemo} onChange={handleInputChange} placeholder="기사님 전달사항 등..." className="w-full h-10 rounded-lg border-slate-200 bg-slate-100 text-[14px] font-black text-black px-3 focus:ring-2 focus:ring-indigo-600 transition-all" />
                    </div>
                    <div className="col-span-4 flex items-center justify-between pl-4 gap-3">
                        <div className="flex flex-col gap-1">
                            <label className="flex items-center gap-2 cursor-pointer select-none group">
                                <input type="checkbox" name="isSaveAddr" checked={inputState.isSaveAddr} onChange={handleInputChange} className="w-4 h-4 rounded-md text-blue-600 border-slate-300 focus:ring-0 cursor-pointer" />
                                <span className="text-[11px] font-black text-blue-600 group-hover:text-blue-700 transition-colors uppercase">주소록 저장</span>
                            </label>
                        </div>
                        <button onClick={handleAddRow} className={`flex-1 h-11 px-6 rounded-xl font-black text-xs flex items-center justify-center gap-2 transition-all shadow-lg ${editingTempId ? 'bg-emerald-500 hover:bg-emerald-600 text-white' : 'bg-slate-900 hover:bg-indigo-600 text-white shadow-indigo-200'}`}>
                            <span className="material-symbols-rounded text-lg">{editingTempId ? 'edit_square' : 'add_circle'}</span>
                            {editingTempId ? '수정 적용' : '리스트 추가'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SalesInputPanel;

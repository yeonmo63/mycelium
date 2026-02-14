import React from 'react';
import { formatPhoneNumber } from '../../../../utils/common';

const QuickRegisterModal = ({ isOpen, onClose, quickRegisterName, fileInputRef, handleQuickRegister, handleAddressSearch }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={onClose}></div>
            <form onSubmit={(e) => {
                e.preventDefault();
                const data = {
                    name: e.target.name.value,
                    mobile: e.target.mobile.value,
                    phone: e.target.phone.value,
                    level: e.target.level.value,
                    zip: e.target.zip.value,
                    addr1: e.target.addr1.value,
                    addr2: e.target.addr2.value,
                    memo: e.target.memo.value
                };
                handleQuickRegister(data);
            }} className="bg-white rounded-3xl w-full max-w-3xl shadow-2xl relative overflow-hidden animate-in zoom-in-95 duration-200 text-slate-900 text-left">
                <div className="bg-slate-900 p-6 text-white flex justify-between items-center text-left">
                    <div>
                        <h3 className="text-xl font-bold">신규 고객 퀵 등록</h3>
                        <p className="text-[10px] text-slate-400 font-bold uppercase mt-1">빠른 등록 후 판매를 바로 시작합니다</p>
                    </div>
                    <div className="flex gap-2">
                        <button type="button" onClick={() => fileInputRef.current?.click()} className="h-9 px-4 rounded-xl bg-slate-800 text-white text-xs font-bold hover:bg-slate-700 transition-all flex items-center gap-2 border border-slate-700">
                            <span className="material-symbols-rounded text-base">upload_file</span> 파일
                        </button>
                        <button type="button" onClick={onClose} className="hover:bg-white/10 rounded-lg p-1 text-white">
                            <span className="material-symbols-rounded">close</span>
                        </button>
                    </div>
                </div>
                <div className="p-6 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="col-span-1">
                            <label className="text-[10px] font-black text-slate-400 uppercase mb-1 block ml-1">고객명</label>
                            <input name="name" defaultValue={quickRegisterName} required className="w-full h-11 px-4 rounded-xl bg-slate-100 border-none focus:ring-4 focus:ring-indigo-600/20 font-black text-[14px]" placeholder="이름 입력" />
                        </div>
                        <div className="col-span-1">
                            <label className="text-[10px] font-black text-slate-400 uppercase mb-1 block ml-1">회원 등급</label>
                            <select name="level" className="w-full h-11 px-4 rounded-xl bg-slate-100 border-none focus:ring-4 focus:ring-indigo-600/20 font-black text-[14px] appearance-none">
                                <option value="일반">일반 고객</option>
                                <option value="VIP">VIP 고객</option>
                                <option value="법인/단체">법인/단체</option>
                            </select>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="col-span-1">
                            <label className="text-[10px] font-black text-slate-400 uppercase mb-1 block ml-1">휴대전화</label>
                            <input name="mobile" required placeholder="010-0000-0000" onChange={(e) => e.target.value = formatPhoneNumber(e.target.value)} className="w-full h-11 px-4 rounded-xl bg-slate-100 border-none focus:ring-4 focus:ring-indigo-600/20 font-black text-[14px]" />
                        </div>
                        <div className="col-span-1">
                            <label className="text-[10px] font-black text-slate-400 uppercase mb-1 block ml-1">일반전화</label>
                            <input name="phone" placeholder="전화번호" onChange={(e) => e.target.value = formatPhoneNumber(e.target.value)} className="w-full h-11 px-4 rounded-xl bg-slate-100 border-none focus:ring-4 focus:ring-indigo-600/20 font-black text-[14px]" />
                        </div>
                    </div>

                    <div className="space-y-3">
                        <div className="grid grid-cols-4 gap-2">
                            <div className="col-span-1">
                                <label className="text-[10px] font-black text-slate-400 uppercase mb-1 block ml-1">우편번호</label>
                                <input name="zip" id="quick-zip" className="w-full h-11 px-4 rounded-xl bg-slate-100 border-none cursor-pointer font-black text-[14px]" readOnly onClick={() => handleAddressSearch({ zipId: 'quick-zip', addr1Id: 'quick-addr1' })} placeholder="검색" />
                            </div>
                            <div className="col-span-3">
                                <label className="text-[10px] font-black text-slate-400 uppercase mb-1 block ml-1">기본 주소</label>
                                <input name="addr1" id="quick-addr1" className="w-full h-11 px-4 rounded-xl bg-slate-100 border-none cursor-pointer font-black text-[14px]" readOnly onClick={() => handleAddressSearch({ zipId: 'quick-zip', addr1Id: 'quick-addr1' })} placeholder="클릭하여 주소 검색" />
                            </div>
                        </div>
                        <div>
                            <label className="text-[10px] font-black text-slate-400 uppercase mb-1 block ml-1">상세 주소</label>
                            <input name="addr2" id="quick-addr2" className="w-full h-11 px-4 rounded-xl bg-slate-100 border-none focus:ring-4 focus:ring-indigo-600/20 font-black text-[14px]" placeholder="상세주소 입력" />
                        </div>
                    </div>

                    <div>
                        <label className="text-[10px] font-black text-slate-400 uppercase mb-1 block ml-1">고객 특이사항 및 메모</label>
                        <textarea name="memo" rows="2" className="w-full px-4 py-3 rounded-xl bg-slate-100 border-none focus:ring-4 focus:ring-indigo-600/20 font-black text-[14px]" placeholder="중요한 정보가 있다면 입력하세요"></textarea>
                    </div>
                </div>
                <div className="bg-slate-50 p-6 flex justify-end gap-3 shrink-0">
                    <button type="button" onClick={onClose} className="px-6 py-3 rounded-xl text-slate-500 font-black hover:bg-slate-200 transition-all text-sm">취소</button>
                    <button type="submit" className="px-10 py-3 bg-indigo-600 text-white rounded-xl font-black shadow-lg shadow-indigo-600/30 hover:bg-indigo-500 transition-all text-sm">등록 및 접수 시작</button>
                </div>
            </form>
        </div>
    );
};

export default QuickRegisterModal;

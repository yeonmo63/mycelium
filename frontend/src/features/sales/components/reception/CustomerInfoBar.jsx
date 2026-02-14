import React from 'react';

const CustomerInfoBar = ({ orderDate, setOrderDate, custSearchRef, handleSearchCustomer, customer }) => {
    return (
        <div className="grid grid-cols-12 gap-3 items-stretch">
            <div className="col-span-2 bg-white rounded-[1.5rem] p-3 border border-slate-100 shadow-sm transition-all hover:shadow-md text-sm">
                <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1 block ml-1">접수 일자</label>
                <div className="relative">
                    <input type="date" value={orderDate} onChange={e => setOrderDate(e.target.value)}
                        className="w-full h-10 bg-slate-100 border-slate-200 border rounded-xl font-black text-slate-800 focus:ring-2 focus:ring-indigo-500 transition-all px-3 text-[14px]" />
                </div>
            </div>
            <div className="col-span-3 bg-white rounded-[1.5rem] p-3 border border-slate-100 shadow-sm transition-all hover:shadow-md text-sm">
                <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1 block ml-1">고객 조회</label>
                <div className="relative">
                    <input
                        ref={custSearchRef}
                        onKeyDown={e => e.key === 'Enter' && handleSearchCustomer()}
                        placeholder="이름 입력 후 엔터..."
                        className="w-full h-10 bg-slate-900 border-none rounded-xl text-white placeholder:text-slate-500 font-bold px-4 pr-12 focus:ring-4 focus:ring-indigo-500/20 transition-all text-[14px]"
                    />
                    <button onClick={handleSearchCustomer} className="absolute right-1.5 top-1.5 bottom-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg px-2 transition-colors">
                        <span className="material-symbols-rounded text-base">search</span>
                    </button>
                </div>
            </div>
            <div className="col-span-7 bg-white rounded-[1.5rem] p-3 border border-slate-100 shadow-sm transition-all hover:shadow-md relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-24 h-full bg-indigo-50/50 -skew-x-12 translate-x-10 transition-transform group-hover:translate-x-5" />
                <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1 block ml-1">선택된 고객 정보</label>
                <div className="flex items-center gap-6 h-10 px-1 relative z-10">
                    {customer ? (
                        <>
                            <div className="flex items-center gap-2">
                                <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white font-black text-xs">{customer.customer_name[0]}</div>
                                <div>
                                    <span className="font-black text-slate-900 block leading-tight text-sm">{customer.customer_name}</span>
                                    <span className="text-[8px] text-slate-400 font-bold uppercase">{customer.customer_id}</span>
                                </div>
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1 text-slate-500 mb-0.5">
                                    <span className="material-symbols-rounded text-[12px]">location_on</span>
                                    <span className="text-[8px] font-black uppercase">기본 배송지 정보</span>
                                </div>
                                <span className="text-xs text-slate-700 font-bold block truncate">[{customer.zip_code || '-'}] {customer.address_primary} {customer.address_detail}</span>
                            </div>
                            <div className="shrink-0 text-right">
                                <div className="flex items-center justify-end gap-1 text-indigo-500 mb-0.5">
                                    <span className="material-symbols-rounded text-[12px]">call</span>
                                    <span className="text-[8px] font-black uppercase">연락처</span>
                                </div>
                                <span className="text-xs font-black text-slate-900">{customer.mobile_number}</span>
                            </div>
                        </>
                    ) : (
                        <div className="flex items-center gap-2 text-slate-600 italic font-black text-xs">
                            <span className="material-symbols-rounded animate-pulse text-indigo-500 text-base">fingerprint</span>
                            성함 혹은 번호로 고객 조회를 먼저 완료해주세요...
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default CustomerInfoBar;

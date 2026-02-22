import React from 'react';
import { X as XIcon, CalendarDays, ChevronDown } from 'lucide-react';

const EventSelectedInfo = ({
    customer,
    onClearCustomer,
    events,
    selectedEventId,
    setSelectedEventId
}) => {
    return (
        <div className="flex flex-col gap-3">
            <div className="flex items-center gap-4 bg-indigo-50 p-4 rounded-3xl border border-indigo-100">
                <div className="w-12 h-12 bg-indigo-600 text-white rounded-2xl flex items-center justify-center font-black text-lg">
                    {customer ? customer.customer_name[0] : 'G'}
                </div>
                <div className="flex-1">
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-black text-slate-900">{customer ? customer.customer_name : '이벤트 방문객'}</span>
                        <span className="bg-white text-indigo-600 px-2 py-0.5 rounded-full text-[9px] font-black border border-indigo-200 uppercase tracking-tight">
                            {customer ? 'EVENT CUSTOMER' : 'GUEST'}
                        </span>
                    </div>
                    <div className="text-[10px] font-bold text-slate-500 mt-0.5">{customer ? customer.mobile_number : '연락처 미지정'}</div>
                </div>
                <button
                    onClick={onClearCustomer}
                    className="p-2 text-slate-300 hover:text-rose-500 transition-colors"
                >
                    <XIcon size={18} />
                </button>
            </div>

            <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-indigo-500 pointer-events-none">
                    <CalendarDays size={18} />
                </div>
                <select
                    className="w-full h-12 bg-slate-50 border-none rounded-2xl pl-12 pr-10 text-sm font-black text-slate-700 appearance-none focus:ring-2 focus:ring-indigo-500 transition-all border border-slate-100"
                    value={selectedEventId}
                    onChange={(e) => setSelectedEventId(e.target.value)}
                >
                    {events.length === 0 ? (
                        <option value="">등록된 행사가 없습니다</option>
                    ) : (
                        <>
                            <option value="">진행 중인 행사 선택 (필수)</option>
                            {events.map(e => (
                                <option key={e.event_id} value={e.event_id}>{e.event_name}</option>
                            ))}
                        </>
                    )}
                </select>
                <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 pointer-events-none">
                    <ChevronDown size={18} />
                </div>
            </div>
        </div>
    );
};

export default EventSelectedInfo;

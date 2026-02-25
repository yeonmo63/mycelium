import React from 'react';
import { Search, UserPlus } from 'lucide-react';

const EventCustomerSearch = ({
    searchQuery,
    setSearchQuery,
    handleSearch,
    searchResults,
    handleSelectResult,
    isSearching,
    setShowRegisterForm
}) => {
    return (
        <div className="space-y-4">
            <div className="relative">
                <input
                    type="text"
                    placeholder="고객명 또는 이벤트명 검색"
                    className="w-full h-12 bg-slate-50 border-none rounded-2xl pl-4 pr-24 text-sm font-black text-slate-700 placeholder:text-slate-300 focus:ring-2 focus:ring-indigo-500 transition-all border border-slate-100"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                />
                <button
                    onClick={handleSearch}
                    className="absolute right-2 top-1/2 -translate-y-1/2 h-8 px-4 bg-indigo-600 text-white rounded-xl text-xs font-black shadow-lg shadow-indigo-100 whitespace-nowrap"
                >
                    검색
                </button>
            </div>

            {searchResults.length > 0 && (
                <div className="bg-white border border-slate-100 rounded-2xl shadow-xl max-h-48 overflow-auto animate-in slide-in-from-top-2">
                    {searchResults.map((item, idx) => (
                        <button
                            key={item._type === 'event' ? `event-${item.event_id}` : `cust-${item.customer_id}-${idx}`}
                            onClick={() => handleSelectResult(item)}
                            className="w-full px-4 py-3 text-left border-b border-slate-50 last:border-0 hover:bg-slate-50 active:bg-slate-100 transition-colors"
                        >
                            <div className="flex items-center justify-between gap-2">
                                <div className="text-sm font-black text-slate-800 whitespace-nowrap overflow-hidden text-ellipsis">
                                    {item._type === 'event' ? item.event_name : item.customer_name}
                                </div>
                                <span className={`shrink-0 text-[9px] font-black px-1.5 py-0.5 rounded-md ${item._type === 'event' ? 'bg-amber-100 text-amber-600' : 'bg-indigo-100 text-indigo-600'}`}>
                                    {item._type === 'event' ? '행사' : '고객'}
                                </span>
                            </div>
                            <div className="text-[10px] font-bold text-slate-400 truncate">
                                {item._type === 'event'
                                    ? `${item.start_date} ~ ${item.end_date}`
                                    : `${item.mobile_number} | ${item.address_primary || '주소 없음'}`}
                            </div>
                        </button>
                    ))}
                </div>
            )}

            {searchQuery && searchResults.length === 0 && !isSearching && (
                <button
                    onClick={() => setShowRegisterForm(true)}
                    className="w-full h-12 border-2 border-dashed border-slate-200 rounded-2xl flex items-center justify-center gap-2 text-slate-400 hover:text-indigo-600 hover:border-indigo-200 transition-all font-bold text-sm"
                >
                    <UserPlus size={18} />
                    <span>"{searchQuery}" 신규 고객 등록하기</span>
                </button>
            )}
        </div>
    );
};

export default EventCustomerSearch;

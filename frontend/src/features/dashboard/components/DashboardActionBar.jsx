import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

const DashboardActionBar = ({
    searchQuery,
    setSearchQuery,
    isSearchFocused,
    setIsSearchFocused,
    searchRef,
    setShowLogoutModal
}) => {
    const navigate = useNavigate();

    const commands = useMemo(() => [
        { id: 'reception', label: '주문 접수 바로가기', sub: '일반/특판 주문 입력', path: '/sales/reception', icon: 'add_shopping_cart' },
        { id: 'stock', label: '재고 및 수확 관리', sub: '실시간 재고 현황 및 감사 로그', path: '/sales/stock', icon: 'inventory_2' },
        { id: 'customer', label: '고객명부 조회', sub: '회원/비회원 통합 검색', path: '/customer/edit', icon: 'group' },
        { id: 'consult', label: '고객 상담 내역', sub: '미처리 상담 및 대응 기록', path: '/customer/consultation', icon: 'forum' },
        { id: 'ledger', label: '통합 매출 장부', sub: '월간/분기 매출 통계 확인', path: '/sales/ledger', icon: 'menu_book' },
        { id: 'purchase', label: '매입/지축 관리', sub: '자재 매입 및 경비 증빙', path: '/finance/purchase', icon: 'receipt_long' },
        { id: 'exp_status', label: '체험 예약 현황', sub: '오늘과 이번 주 체험 기록', path: '/exp/reservation-status', icon: 'event_available' },
        { id: 'settings', label: '시스템 설정', sub: '사용자 관리 및 DB 백업', path: '/settings/company-info', icon: 'settings' }
    ], []);

    const filteredCommands = useMemo(() => {
        if (!searchQuery) return commands.slice(0, 5);
        const q = searchQuery.toLowerCase();
        return commands.filter(c => c.label.toLowerCase().includes(q) || c.sub.toLowerCase().includes(q));
    }, [searchQuery, commands]);

    const handleCommandClick = (path) => {
        setIsSearchFocused(false);
        setSearchQuery('');
        navigate(path);
    };

    return (
        <div className="flex items-center justify-between mb-4 gap-8 animate-in fade-in slide-in-from-top-4 duration-500 shrink-0 relative">
            <div className="flex-1 max-w-2xl min-[2000px]:max-w-4xl relative group" ref={searchRef}>
                <div className={`relative flex items-center bg-white/80 backdrop-blur-xl border border-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] ${isSearchFocused ? 'border-indigo-400 ring-4 ring-indigo-500/5' : ''} rounded-[24px] px-6 py-4 transition-all duration-300`}>
                    <span className={`material-symbols-rounded ${isSearchFocused ? 'text-indigo-500' : 'text-slate-400'} transition-colors text-2xl`}>search</span>
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onFocus={() => setIsSearchFocused(true)}
                        placeholder="명령어를 입력하거나 메뉴를 검색하세요 (예: '재고', '매출')"
                        className="flex-1 bg-transparent border-none outline-none px-4 text-[15px] font-medium tracking-tight text-slate-700 placeholder:text-slate-300"
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && filteredCommands.length > 0) {
                                handleCommandClick(filteredCommands[0].path);
                            }
                        }}
                    />
                    <div className="flex items-center gap-2">
                        {searchQuery && (
                            <button onClick={() => setSearchQuery('')} className="p-1.5 hover:bg-slate-100 rounded-full text-slate-400">
                                <span className="material-symbols-rounded text-lg">close</span>
                            </button>
                        )}
                        <span className="w-px h-4 bg-slate-200 mx-2"></span>
                        <div className="bg-slate-100 px-2 py-1 rounded-md text-[10px] font-black text-slate-400 border border-slate-200">ALT + K</div>
                    </div>
                </div>

                {isSearchFocused && (
                    <>
                        <div className="absolute inset-0 bg-transparent z-[99] fixed w-screen h-screen top-0 left-0" onClick={() => setIsSearchFocused(false)}></div>
                        <div className="absolute top-[calc(100%+12px)] left-0 w-full bg-white rounded-[24px] shadow-[0_20px_60px_rgba(0,0,0,0.15)] border border-slate-200 overflow-hidden z-[100] animate-in fade-in slide-in-from-top-4 duration-300">
                            <div className="px-5 py-3 bg-slate-50/50 border-b border-slate-100 flex items-center justify-between">
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">빠른 탐색 및 명령어</span>
                                <span className="text-[10px] text-slate-400 font-bold">{filteredCommands.length} 건 발견</span>
                            </div>
                            <div className="p-2 max-h-[400px] overflow-auto stylish-scrollbar">
                                {filteredCommands.length > 0 ? filteredCommands.map((cmd) => (
                                    <button
                                        key={cmd.id}
                                        onClick={() => handleCommandClick(cmd.path)}
                                        className="w-full flex items-center gap-4 p-4 hover:bg-indigo-50/50 rounded-2xl transition-all group text-left"
                                    >
                                        <div className="w-10 h-10 rounded-xl bg-slate-100 group-hover:bg-white text-slate-400 group-hover:text-indigo-600 flex items-center justify-center transition-all shadow-sm">
                                            <span className="material-symbols-rounded text-xl">{cmd.icon}</span>
                                        </div>
                                        <div className="flex-1">
                                            <div className="text-sm font-black text-slate-700 group-hover:text-indigo-900 leading-tight">{cmd.label}</div>
                                            <div className="text-[11px] text-slate-400 group-hover:text-indigo-400 font-medium mt-1 uppercase tracking-tight">{cmd.sub}</div>
                                        </div>
                                        <span className="material-symbols-rounded text-slate-200 group-hover:text-indigo-300 text-lg opacity-0 group-hover:opacity-100 -translate-x-2 group-hover:translate-x-0 transition-all">arrow_forward</span>
                                    </button>
                                )) : (
                                    <div className="py-12 text-center text-slate-400 font-bold italic">
                                        검색 결과 없음: "{searchQuery}"
                                    </div>
                                )}
                            </div>
                            <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-4">
                                <div className="flex items-center gap-4">
                                    <div className="flex items-center gap-1.5 grayscale opacity-50">
                                        <span className="bg-white px-1.5 py-0.5 rounded border border-slate-300 text-[9px] font-bold">↵</span>
                                        <span className="text-[10px] font-bold">선택</span>
                                    </div>
                                    <div className="flex items-center gap-1.5 grayscale opacity-50">
                                        <span className="bg-white px-1.5 py-0.5 rounded border border-slate-300 text-[9px] font-bold">ESC</span>
                                        <span className="text-[10px] font-bold">닫기</span>
                                    </div>
                                </div>
                                <div className="text-[10px] font-black text-indigo-500 bg-indigo-50 px-3 py-1.5 rounded-full border border-indigo-100">
                                    마이셀리움 AI
                                </div>
                            </div>
                        </div>
                    </>
                )}
            </div>

            <div className="flex items-center gap-4 bg-white p-2.5 pr-6 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all">
                <div className="w-10 h-10 rounded-xl bg-slate-900 border border-slate-700 flex items-center justify-center text-white shadow-lg overflow-hidden relative group">
                    <span className="material-symbols-rounded text-xl group-hover:scale-110 transition-transform">person</span>
                    <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 border-2 border-slate-900 rounded-full"></div>
                </div>
                <div className="flex flex-col mr-6">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.1em] leading-none mb-1">마이셀리움</span>
                    <span className="text-sm font-black text-slate-800 tracking-tight">{localStorage.getItem('username') || '관리자'}님</span>
                </div>
                <button
                    onClick={() => setShowLogoutModal(true)}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-50 hover:bg-rose-50 text-slate-500 hover:text-rose-600 font-black text-[11px] transition-all active:scale-95 border border-slate-100 uppercase tracking-widest"
                >
                    <span className="material-symbols-rounded text-sm">logout</span>
                    로그아웃
                </button>
            </div>
        </div>
    );
};

export default DashboardActionBar;

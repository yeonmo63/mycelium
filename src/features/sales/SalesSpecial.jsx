import React, { useState, useEffect, useMemo } from 'react';
import { formatCurrency, formatDate } from '../../utils/common';
import { useModal } from '../../contexts/ModalContext';

const SalesSpecial = () => {
    const { showAlert, showConfirm } = useModal();

    // --- State ---
    const [eventData, setEventData] = useState({
        event_id: '',
        event_name: '',
        organizer: '',
        manager_name: '',
        manager_contact: '',
        location_address: '',
        memo: '',
        start_date: '',
        end_date: ''
    });

    const [salesRows, setSalesRows] = useState([]);
    const [deletedSalesIds, setDeletedSalesIds] = useState([]);
    const [products, setProducts] = useState([]);

    // UI State
    const [isEventSearchOpen, setIsEventSearchOpen] = useState(false);
    const [eventSearchResults, setEventSearchResults] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [lastSearchQuery, setLastSearchQuery] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isDraftRestored, setIsDraftRestored] = useState(false);
    const [isDirty, setIsDirty] = useState(false);

    // Derived
    const summary = useMemo(() => {
        const count = salesRows.length;
        const qty = salesRows.reduce((a, b) => a + Number(b.qty), 0);
        const amount = salesRows.reduce((a, b) => a + Number(b.amount), 0);
        return { count, qty, amount };
    }, [salesRows]);

    // --- Effects ---
    useEffect(() => {
        loadProducts();
    }, []);

    const loadProducts = async () => {
        if (!window.__TAURI__) return;
        try {
            const list = await window.__TAURI__.core.invoke('get_product_list');
            setProducts(list.filter(p => (p.item_type || 'product') === 'product') || []);
        } catch (e) {
            console.error(e);
        }
    };

    // --- Draft Auto-Save Logic ---
    useEffect(() => {
        const draft = localStorage.getItem('mycelium_draft_special');
        if (draft) {
            try {
                const parsed = JSON.parse(draft);
                if (parsed.salesRows?.length > 0 || parsed.eventData?.event_name) {
                    setEventData(parsed.eventData);
                    setSalesRows(parsed.salesRows || []);
                    setDeletedSalesIds(parsed.deletedSalesIds || []);
                    setIsDirty(true);
                    setIsDraftRestored(true);
                }
            } catch (e) {
                console.error("Special Draft restore error:", e);
            }
        }
    }, []);

    useEffect(() => {
        if (isDirty || salesRows.length > 0 || eventData.event_name) {
            const draftData = {
                eventData,
                salesRows,
                deletedSalesIds
            };
            localStorage.setItem('mycelium_draft_special', JSON.stringify(draftData));
        }
    }, [eventData, salesRows, deletedSalesIds, isDirty]);

    const clearDraft = () => {
        localStorage.removeItem('mycelium_draft_special');
        setIsDraftRestored(false);
    };

    // --- Event Operations ---
    const handleEventInputChange = (e) => {
        const { name, value } = e.target;
        setEventData(prev => ({ ...prev, [name]: value }));
        setIsDirty(true);
    };

    const searchEvents = async () => {
        const query = (eventData.event_name || '').trim();

        if (!query) {
            showAlert("알림", "검색어를 입력해주세요.");
            return;
        }

        if (query === lastSearchQuery) {
            if (eventSearchResults.length > 0 && !isEventSearchOpen) {
                setIsEventSearchOpen(true);
            }
            return;
        }

        setSearchQuery(query);

        if (!window.__TAURI__) {
            // Mock
            setEventSearchResults([
                { event_id: 1, event_name: '2023 강릉 커피 축제', organizer: '강릉시', start_date: '2023-10-01', end_date: '2023-10-05' },
                { event_id: 2, event_name: '서울 식품 박람회', organizer: 'KOTRA', start_date: '2023-11-01', end_date: '2023-11-04' }
            ]);
            setIsEventSearchOpen(true);
            setLastSearchQuery(query);
            return;
        }

        try {
            const results = await window.__TAURI__.core.invoke('search_events_by_name', { name: query });
            setEventSearchResults(results || []);
            setIsEventSearchOpen(true);
            setLastSearchQuery(query);
        } catch (e) {
            await showAlert("오류", "행사 검색 실패: " + e);
        }
    };

    const selectEvent = async (evt) => {
        setEventData({
            event_id: evt.event_id,
            event_name: evt.event_name,
            organizer: evt.organizer || '',
            manager_name: evt.manager_name || '',
            manager_contact: evt.manager_contact || '',
            location_address: evt.location_address || '',
            memo: evt.memo || '',
            start_date: evt.start_date || '',
            end_date: evt.end_date || ''
        });
        setIsEventSearchOpen(false);
        setIsDirty(true);

        // Load Sales
        loadEventSales(evt.event_id, evt.start_date, evt.end_date);
    };

    const loadEventSales = async (eventId, start, end) => {
        if (!window.__TAURI__) return;
        try {
            const sales = await window.__TAURI__.core.invoke('get_sales_by_event_id_and_date_range', {
                eventId: String(eventId),
                startDate: start || null,
                endDate: end || null
            });
            const rows = sales.map(s => ({
                id: s.sales_id,
                tempId: Math.random(),
                orderDate: s.order_date,
                product: s.product_name,
                spec: s.specification,
                qty: s.quantity,
                price: s.unit_price,
                discount: s.discount_rate || 0,
                amount: s.total_amount,
                memo: s.memo || ''
            }));
            setSalesRows(rows.reverse());
            setDeletedSalesIds([]);
            setIsDirty(false);
        } catch (e) {
            console.error(e);
        }
    };

    const handleNewEvent = () => {
        setEventData({
            event_id: '',
            event_name: searchQuery || '',
            organizer: '',
            manager_name: '',
            manager_contact: '',
            location_address: '',
            memo: '',
            start_date: formatDate(new Date()),
            end_date: formatDate(new Date())
        });
        setSalesRows([]);
        setIsEventSearchOpen(false);
        setIsDirty(true);
    };

    // --- Row Operations ---
    const addRow = () => {
        if (!eventData.event_name) {
            showAlert("알림", "행사 정보를 먼저 입력해주세요.");
            return;
        }

        const date = formatDate(new Date());
        // Clamp date
        let d = date;
        if (eventData.start_date && d < eventData.start_date.substring(0, 10)) d = eventData.start_date.substring(0, 10);
        if (eventData.end_date && d > eventData.end_date.substring(0, 10)) d = eventData.end_date.substring(0, 10);
        setSalesRows(prev => [{
            tempId: Date.now() + Math.random(),
            orderDate: d,
            product: '',
            spec: '',
            qty: 1,
            price: '',
            discount: 0,
            amount: 0,
            memo: ''
        }, ...prev]);
        setIsDirty(true);
    };

    const handleRowChange = (id, field, value) => {
        setSalesRows(prev => prev.map(row => {
            if (row.tempId !== id) return row;

            const newRow = { ...row, [field]: value };

            if (field === 'product') {
                const p = products.find(x => x.product_name === value);
                if (p) {
                    newRow.spec = p.specification;
                    newRow.price = p.unit_price;
                }
            }

            // Calc Amount
            if (['qty', 'price', 'discount', 'product'].includes(field)) {
                const q = Number(newRow.qty) || 0;
                const p = Number(newRow.price) || 0;
                const d = Number(newRow.discount) || 0;
                newRow.amount = Math.floor(q * p * (1 - d / 100) / 10) * 10;
            }

            return newRow;
        }));
        setIsDirty(true);
    };

    const deleteRow = (row) => {
        if (row.id) {
            setDeletedSalesIds(prev => [...prev, row.id]);
        }
        setSalesRows(prev => prev.filter(r => r.tempId !== row.tempId));
        setIsDirty(true);
    };

    const handleQrScan = () => {
        // Mock QR Scan
        if (!eventData.event_name) {
            showAlert("알림", "행사 정보를 먼저 입력해주세요.");
            return;
        }
        showAlert("QR 스캔", "카메라 스캔 시뮬레이션: '상품 A'가 인식되었습니다.");
        const date = new Date().toISOString().split('T')[0];
        const p = products.find(x => x.product_name === '상품 A') || (products[0] || { product_name: '상품 A', unit_price: 10000, specification: '1kg' });
        setSalesRows(prev => [{
            tempId: Date.now() + Math.random(),
            orderDate: date,
            product: p.product_name,
            spec: p.specification,
            qty: 1,
            price: p.unit_price,
            discount: 0,
            amount: p.unit_price,
            memo: ''
        }, ...prev]);
        setIsDirty(true);
    };

    const handleSaveAll = async () => {
        if (!eventData.event_name) return;
        if (!await showConfirm("저장", "일괄 저장하시겠습니까?")) return;

        setIsLoading(true);
        try {
            const eventInput = {
                ...eventData,
                start_date: eventData.start_date || null,
                end_date: eventData.end_date || null
            };

            const salesInput = salesRows
                .filter(r => r.product)
                .map(r => ({
                    sales_id: r.id ? String(r.id) : "",
                    order_date: r.orderDate,
                    product_name: r.product,
                    specification: r.spec || null,
                    quantity: Number(r.qty),
                    unit_price: Number(r.price),
                    discount_rate: Number(r.discount),
                    memo: r.memo || null,
                }));

            if (window.__TAURI__) {
                const newEventId = await window.__TAURI__.core.invoke('save_special_sales_batch', {
                    event: eventInput,
                    sales: salesInput,
                    deletedSalesIds: deletedSalesIds
                });
                setEventData(prev => ({ ...prev, event_id: newEventId }));
                await showAlert("성공", "저장되었습니다.");
                clearDraft();
                loadEventSales(newEventId, eventInput.start_date, eventInput.end_date);
            } else {
                await showAlert("성공", "저장 테스트 완료");
            }
        } catch (e) {
            console.error(e);
            await showAlert("오류", "저장 실패: " + e);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex flex-col h-full bg-[#f8fafc] overflow-hidden animate-in fade-in duration-700">
            {/* Top Navigation & Header */}
            <div className="px-6 lg:px-8 min-[2000px]:px-12 pt-6 lg:pt-8 min-[2000px]:pt-12 pb-1">
                <div className="flex justify-between items-end mb-4">
                    <div>
                        <div className="flex items-center gap-2 mb-0.5">
                            <span className="w-6 h-1 bg-indigo-600 rounded-full"></span>
                            <span className="text-[9px] font-black tracking-[0.2em] text-indigo-600 uppercase">Special Event Sales</span>
                        </div>
                        <h1 className="text-3xl font-black text-slate-600 tracking-tighter" style={{ fontFamily: '"Noto Sans KR", sans-serif' }}>
                            특판 행사 접수 <span className="text-slate-300 font-light ml-1 text-xl">Event Sales</span>
                        </h1>
                    </div>
                </div>

                {/* Event Info Card */}
                <div className="grid grid-cols-12 gap-3 items-stretch mt-4">
                    <div className="col-span-12 bg-white rounded-[1.5rem] p-6 border border-slate-100 shadow-sm hover:shadow-md transition-all">
                        <div className="flex items-center gap-2 mb-6 border-b border-slate-50 pb-4">
                            <div className="bg-indigo-50 p-2 rounded-lg">
                                <span className="material-symbols-rounded text-indigo-600 text-xl">campaign</span>
                            </div>
                            <span className="text-sm font-black text-slate-700 uppercase tracking-tight">행사 기본 정보</span>
                            <span className="text-xs text-slate-400 font-medium ml-auto">* 행사명을 입력하고 엔터를 누르면 검색됩니다.</span>
                        </div>

                        <div className="grid grid-cols-12 gap-6 mb-2">
                            <div className="col-span-4 lg:col-span-3">
                                <label className="text-[11px] font-bold text-slate-500 uppercase mb-1.5 block ml-1">행사명 (검색/입력)</label>
                                <div className="flex gap-2">
                                    <input
                                        value={eventData.event_name}
                                        name="event_name"
                                        onChange={handleEventInputChange}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' || e.key === 'Tab') {
                                                e.preventDefault();
                                                searchEvents();
                                            }
                                        }}
                                        className="w-full h-11 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 px-4 focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all text-sm shadow-sm"
                                        placeholder="행사명을 입력하세요"
                                    />
                                    <button
                                        onClick={searchEvents}
                                        className="min-w-[50px] h-11 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors shadow-sm flex items-center justify-center"
                                        title="행사 검색"
                                    >
                                        <span className="material-symbols-rounded text-xl">search</span>
                                    </button>
                                </div>
                            </div>
                            <div className="col-span-2">
                                <label className="text-[11px] font-bold text-slate-500 uppercase mb-1.5 block ml-1">주최</label>
                                <input value={eventData.organizer} name="organizer" onChange={handleEventInputChange} className="w-full h-11 bg-white border border-slate-200 rounded-xl font-bold text-slate-700 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all px-4 text-sm" />
                            </div>
                            <div className="col-span-2">
                                <label className="text-[11px] font-bold text-slate-500 uppercase mb-1.5 block ml-1">담당자</label>
                                <input value={eventData.manager_name} name="manager_name" onChange={handleEventInputChange} className="w-full h-11 bg-white border border-slate-200 rounded-xl font-bold text-slate-700 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all px-4 text-sm" />
                            </div>
                            <div className="col-span-2">
                                <label className="text-[11px] font-bold text-slate-500 uppercase mb-1.5 block ml-1">연락처</label>
                                <input value={eventData.manager_contact} name="manager_contact" onChange={handleEventInputChange} className="w-full h-11 bg-white border border-slate-200 rounded-xl font-bold text-slate-700 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all px-4 text-sm" />
                            </div>
                            <div className="col-span-2 lg:col-span-3">
                                <label className="text-[11px] font-bold text-slate-500 uppercase mb-1.5 block ml-1">행사 기간</label>
                                <div className="flex items-center gap-2">
                                    <input type="date" value={eventData.start_date} name="start_date" onChange={handleEventInputChange} className="w-full h-11 bg-white border border-slate-200 rounded-xl text-sm px-3 font-bold text-slate-700 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all" title="시작일" />
                                    <span className="text-slate-300 font-bold">~</span>
                                    <input type="date" value={eventData.end_date} name="end_date" onChange={handleEventInputChange} className="w-full h-11 bg-white border border-slate-200 rounded-xl text-sm px-3 font-bold text-slate-700 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all" title="종료일" />
                                </div>
                            </div>
                        </div>
                        <div className="grid grid-cols-12 gap-4">
                            <div className="col-span-12">
                                <label className="text-[11px] font-bold text-slate-500 uppercase mb-1.5 block ml-1">장소 및 메모</label>
                                <input value={eventData.location_address} name="location_address" onChange={handleEventInputChange} className="w-full h-11 bg-white border border-slate-200 rounded-xl font-bold text-slate-700 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all px-4 text-sm" placeholder="장소 주소 또는 메모사항" />
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Sales Rows - Interactive Panel */}
            <div className="px-6 lg:px-8 min-[2000px]:px-12 mt-1 flex flex-col gap-3 overflow-hidden flex-1 pb-6 lg:pb-8 min-[2000px]:pb-12">
                <div className="bg-white rounded-[1.5rem] shadow-xl border border-slate-200 relative flex flex-col h-full overflow-hidden">
                    <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 z-10"></div>

                    <div className="flex justify-between items-center mb-2 shrink-0 p-5 pb-0">
                        <div className="flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
                            <span className="text-[11px] font-black text-slate-500 uppercase tracking-widest">실적 리스트</span>
                        </div>
                        <div className="flex gap-2">
                            <button onClick={handleQrScan} className="h-10 px-4 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-100 text-xs font-bold flex items-center gap-2 transition-all hover:scale-105">
                                <span className="material-symbols-rounded text-lg">qr_code_scanner</span> QR 스캔
                            </button>
                            <button onClick={addRow} className="h-10 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-2 transition-all shadow-md shadow-indigo-200 hover:scale-105 active:scale-95">
                                <span className="material-symbols-rounded text-lg">add</span> 행 추가
                            </button>
                        </div>
                    </div>

                    <div className="flex-1 overflow-auto stylish-scrollbar p-0.5 relative">
                        <table className="w-full text-xs text-left border-collapse table-fixed">
                            <thead className="sticky top-0 z-20">
                                <tr className="bg-slate-50 border-b border-slate-200 shadow-sm">
                                    <th className="px-4 py-3 text-center text-[10px] font-black uppercase text-slate-500 w-[5%] tracking-wider">No</th>
                                    <th className="px-4 py-3 text-center text-[10px] font-black uppercase text-slate-500 w-[12%] tracking-wider">일자</th>
                                    <th className="px-4 py-3 text-center text-[10px] font-black uppercase text-slate-500 w-[20%] tracking-wider">상품명</th>
                                    <th className="px-4 py-3 text-center text-[10px] font-black uppercase text-slate-500 w-[10%] tracking-wider">규격</th>
                                    <th className="px-4 py-3 text-center text-[10px] font-black uppercase text-slate-500 w-[8%] tracking-wider">수량</th>
                                    <th className="px-4 py-3 text-center text-[10px] font-black uppercase text-slate-500 w-[10%] tracking-wider">단가</th>
                                    <th className="px-4 py-3 text-center text-[10px] font-black uppercase text-slate-500 w-[8%] tracking-wider">할인(%)</th>
                                    <th className="px-4 py-3 text-center text-[10px] font-black uppercase text-slate-500 w-[12%] tracking-wider">합계</th>
                                    <th className="px-4 py-3 text-center text-[10px] font-black uppercase text-slate-500 tracking-wider">비고</th>
                                    <th className="px-4 py-3 text-center text-[10px] font-black uppercase text-slate-500 w-[5%] tracking-wider">삭제</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 bg-white">
                                {salesRows.map((row, idx) => (
                                    <tr key={row.tempId} className="hover:bg-indigo-50/20 transition-colors group">
                                        <td className="text-center text-slate-400 font-bold text-xs">{salesRows.length - idx}</td>
                                        <td className="p-2">
                                            <input type="date" value={row.orderDate} onChange={e => handleRowChange(row.tempId, 'orderDate', e.target.value)}
                                                className="w-full h-10 bg-slate-50 border border-slate-200 rounded-lg px-2 text-center text-xs text-slate-600 font-bold focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all outline-none" />
                                        </td>
                                        <td className="p-2">
                                            <input list={`dl-${row.tempId}`} value={row.product} onChange={e => handleRowChange(row.tempId, 'product', e.target.value)}
                                                className="w-full h-10 bg-white border border-slate-200 rounded-lg px-3 text-left text-xs text-slate-800 font-bold focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all outline-none placeholder:font-normal" placeholder="상품선택" />
                                            <datalist id={`dl-${row.tempId}`}>
                                                {products.map(p => <option key={p.product_name} value={p.product_name} />)}
                                            </datalist>
                                        </td>
                                        <td className="p-2">
                                            <input value={row.spec} readOnly
                                                className="w-full h-10 bg-slate-50/50 border border-slate-100 rounded-lg px-2 text-center text-xs text-slate-500 font-medium outline-none" tabIndex={-1} />
                                        </td>
                                        <td className="p-2">
                                            <input type="number" value={row.qty} onChange={e => handleRowChange(row.tempId, 'qty', e.target.value)}
                                                className="w-full h-10 bg-white border border-slate-200 rounded-lg px-2 text-center text-xs font-bold text-slate-700 focus:border-orange-400 focus:ring-2 focus:ring-orange-100 transition-all outline-none" />
                                        </td>
                                        <td className="p-2">
                                            <input value={formatCurrency(row.price)} onChange={e => handleRowChange(row.tempId, 'price', e.target.value.replace(/[^0-9]/g, ''))}
                                                className="w-full h-10 bg-white border border-slate-200 rounded-lg px-2 text-right text-xs text-slate-600 font-bold focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all outline-none" />
                                        </td>
                                        <td className="p-2">
                                            <input type="number" value={row.discount} onChange={e => handleRowChange(row.tempId, 'discount', e.target.value)}
                                                className="w-full h-10 bg-white border border-slate-200 rounded-lg px-2 text-center text-xs text-red-500 font-bold focus:border-red-400 focus:ring-2 focus:ring-red-100 transition-all outline-none" />
                                        </td>
                                        <td className="p-2">
                                            <input value={formatCurrency(row.amount)} readOnly
                                                className="w-full h-10 bg-slate-50 border border-slate-200 rounded-lg px-3 text-right text-xs font-black text-indigo-600 outline-none" tabIndex={-1} />
                                        </td>
                                        <td className="p-2">
                                            <input value={row.memo} onChange={e => handleRowChange(row.tempId, 'memo', e.target.value)}
                                                className="w-full h-10 bg-white border border-slate-200 rounded-lg px-3 text-left text-xs text-slate-600 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all outline-none placeholder:text-slate-300" placeholder="메모" />
                                        </td>
                                        <td className="text-center p-2">
                                            <button onClick={() => deleteRow(row)} className="w-8 h-8 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-all flex items-center justify-center mx-auto group-hover:block" title="삭제">
                                                <span className="material-symbols-rounded text-lg">delete</span>
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                                {salesRows.length === 0 && (
                                    <tr>
                                        <td colSpan="10" className="h-[40vh] text-center border-b-0">
                                            <div className="flex flex-col items-center justify-center h-full text-slate-300">
                                                <div className="w-16 h-16 rounded-full bg-slate-50 flex items-center justify-center mb-4">
                                                    <span className="material-symbols-rounded text-3xl opacity-20">assignment_add</span>
                                                </div>
                                                <div className="flex flex-col items-center gap-1">
                                                    <span className="text-sm font-bold text-slate-400">등록된 접수 내역이 없습니다.</span>
                                                    <span className="text-xs text-slate-400/60">상단의 [행 추가] 버튼을 눌러 내역을 입력하세요.</span>
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Footer Summary - Dark Theme Matching SalesReception */}
                    <div className="bg-slate-900 border-t border-slate-800 p-4 px-8 flex justify-between items-center shrink-0 z-30 h-[90px] shadow-[0_-10px_40px_rgba(0,0,0,0.2)]">
                        <div className="flex gap-10 items-center">
                            <div className="flex gap-4 items-center">
                                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-white/10 flex items-center justify-center shadow-inner">
                                    <span className="material-symbols-rounded text-indigo-400 text-2xl">analytics</span>
                                </div>
                                <div className="flex flex-col gap-1">
                                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">전체 합계 요약</span>
                                    <div className="flex items-baseline gap-2 text-white">
                                        <span className="text-2xl font-black tracking-tight">{summary.count}<span className="text-sm font-normal text-slate-500 ml-1">건</span></span>
                                        <span className="w-px h-4 bg-white/10 mx-2"></span>
                                        <span className="text-2xl font-black tracking-tight">{summary.qty}<span className="text-sm font-normal text-slate-500 ml-1">개</span></span>
                                    </div>
                                </div>
                            </div>
                            <div className="flex flex-col pl-10 border-l border-white/10 ml-2">
                                <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest italic mb-1">Total Amount</span>
                                <div className="flex items-baseline gap-1">
                                    <span className="text-[11px] font-black text-emerald-400/50 uppercase">KRW</span>
                                    <span className="text-3xl font-black text-emerald-400 leading-none drop-shadow-[0_2px_10px_rgba(16,185,129,0.3)]">{formatCurrency(summary.amount)}</span>
                                    <span className="text-lg font-bold text-emerald-400/50">원</span>
                                </div>
                            </div>
                        </div>
                        <div className="flex gap-3">
                            <button onClick={() => { setEventData({ event_id: '', event_name: '', organizer: '', manager_name: '', manager_contact: '', location_address: '', memo: '', start_date: '', end_date: '' }); setSalesRows([]); setDeletedSalesIds([]); setIsDirty(false); clearDraft(); }}
                                className="h-12 px-6 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-400 font-bold transition-all text-xs flex items-center gap-2 border border-slate-700/50">
                                <span className="material-symbols-rounded">refresh</span> 초기화
                            </button>
                            <button onClick={handleSaveAll} className="h-12 px-8 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold shadow-lg shadow-indigo-900/40 transition-all hover:scale-105 active:scale-95 text-sm flex items-center gap-3" disabled={isLoading || !eventData.event_name}>
                                {isLoading ? (
                                    <>
                                        <span className="material-symbols-rounded animate-spin">sync</span> 저장 중...
                                    </>
                                ) : (
                                    <>
                                        <span className="material-symbols-rounded">save</span> 일괄 저장하기
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Event Search Modal - Adjusted */}
            {isEventSearchOpen && (
                <div className="modal flex fixed inset-0 z-50 items-center justify-center bg-black/60 backdrop-blur-md animate-in fade-in duration-300">
                    <div className="bg-white w-[800px] rounded-[2.5rem] shadow-2xl overflow-hidden p-0 border border-white/50 relative transform transition-all scale-100">
                        {/* Modal Header */}
                        <div className="bg-gradient-to-r from-slate-50 to-white p-8 border-b border-slate-100 flex justify-between items-center">
                            <div>
                                <h3 className="text-2xl font-black text-slate-800 flex items-center gap-3">
                                    <span className="w-10 h-10 rounded-2xl bg-indigo-100 text-indigo-600 flex items-center justify-center shadow-sm">
                                        <span className="material-symbols-rounded text-2xl">search</span>
                                    </span>
                                    행사 검색
                                </h3>
                                <p className="text-slate-400 text-sm mt-1 ml-14 font-medium">검색된 행사 목록에서 작업을 진행할 행사를 선택해주세요.</p>
                            </div>
                            <button onClick={() => setIsEventSearchOpen(false)} className="w-10 h-10 rounded-full bg-slate-100 text-slate-400 hover:bg-slate-200 hover:text-slate-600 flex items-center justify-center transition-all">
                                <span className="material-symbols-rounded text-xl">close</span>
                            </button>
                        </div>

                        {/* Modal Content */}
                        <div className="p-8 bg-slate-50/50">
                            <div className="max-h-[500px] overflow-auto border border-slate-200 rounded-2xl mb-6 bg-white shadow-sm">
                                <table className="w-full text-sm">
                                    <thead className="bg-slate-50 text-[11px] uppercase text-slate-500 sticky top-0 font-black tracking-wider z-10">
                                        <tr>
                                            <th className="p-5 text-left pl-8 w-1/2">행사명</th>
                                            <th className="p-5 text-center w-1/4">기간</th>
                                            <th className="p-5 text-center w-1/4">주최</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {eventSearchResults.map(evt => (
                                            <tr key={evt.event_id} onClick={() => selectEvent(evt)} className="cursor-pointer hover:bg-indigo-50/50 transition-colors group">
                                                <td className="p-5 pl-8">
                                                    <div className="font-bold text-slate-700 text-base group-hover:text-indigo-700 transition-colors">{evt.event_name}</div>
                                                    <div className="text-xs text-slate-400 mt-1 font-medium truncate max-w-[300px]">{evt.location_address || '장소 정보 없음'}</div>
                                                </td>
                                                <td className="p-5 text-center">
                                                    <div className="inline-flex items-center px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600 text-xs font-bold border border-slate-200">
                                                        {evt.start_date?.substring(0, 10)} ~ {evt.end_date?.substring(0, 10)}
                                                    </div>
                                                </td>
                                                <td className="p-5 text-center text-slate-600 font-medium">{evt.organizer}</td>
                                            </tr>
                                        ))}
                                        {eventSearchResults.length === 0 && (
                                            <tr>
                                                <td colSpan="3" className="p-16 text-center">
                                                    <div className="flex flex-col items-center justify-center text-slate-300">
                                                        <span className="material-symbols-rounded text-5xl mb-3 opacity-30">rule_folder</span>
                                                        <span className="text-lg font-bold text-slate-400">검색 결과가 없습니다.</span>
                                                        <span className="text-sm mt-1">새로운 행사라면 아래 '신규 등록' 버튼을 눌러주세요.</span>
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>

                            <div className="flex justify-between items-center pt-2">
                                <div className="text-xs text-slate-400 font-bold">
                                    * 검색어: <span className="text-indigo-500">'{searchQuery}'</span>
                                </div>
                                <div className="flex gap-3">
                                    <button onClick={() => setIsEventSearchOpen(false)} className="h-12 px-6 rounded-2xl bg-white border border-slate-200 text-slate-500 font-bold hover:bg-slate-50 transition-colors text-sm">취소</button>
                                    <button onClick={handleNewEvent} className="h-12 px-8 rounded-2xl bg-indigo-600 text-white font-bold hover:bg-indigo-700 transition-all text-sm shadow-lg shadow-indigo-200 hover:scale-105 active:scale-95 flex items-center gap-2">
                                        <span className="material-symbols-rounded">add_circle</span>
                                        신규 행사로 등록
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SalesSpecial;

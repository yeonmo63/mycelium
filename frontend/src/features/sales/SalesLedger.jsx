import React, { useState, useEffect } from 'react';
import { formatCurrency, parseNumber } from '../../utils/common';
import { useModal } from '../../contexts/ModalContext';

const SalesLedger = () => {
    const { showAlert, showConfirm } = useModal();
    // --- State ---
    const [customers, setCustomers] = useState([]);
    const [selectedCustomer, setSelectedCustomer] = useState(null);
    const [ledger, setLedger] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [isLoadingLedger, setIsLoadingLedger] = useState(false);

    // Modals
    const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
    const [customerSearchResults, setCustomerSearchResults] = useState([]);
    const [customerSearchQuery, setCustomerSearchQuery] = useState('');
    const [isEntryModalOpen, setIsEntryModalOpen] = useState(false);
    const [entryForm, setEntryForm] = useState({
        id: null, // If editing
        type: '입금',
        date: new Date().toISOString().split('T')[0],
        amount: '',
        desc: ''
    });

    // --- Init ---
    useEffect(() => {
        loadDefaultDebtList();
    }, []);

    const loadDefaultDebtList = async () => {
        if (!window.__TAURI__) return;
        try {
            const list = await window.__TAURI__.core.invoke('get_customers_with_debt');
            setCustomers(list || []);
        } catch (e) {
            console.error(e);
        }
    };

    // --- Customer Selection ---
    const handleSelectCustomer = async (customer) => {
        setSelectedCustomer(customer);
        setIsLoadingLedger(true);
        if (window.__TAURI__) {
            try {
                const data = await window.__TAURI__.core.invoke('get_customer_ledger', { customerId: customer.customer_id });
                setLedger(data || []);
            } catch (e) {
                console.error(e);
                setLedger([]);
            } finally {
                setIsLoadingLedger(false);
            }
        }
    };

    // --- Customer Search (Modal) ---
    const searchCustomer = async () => {
        if (!customerSearchQuery) return;
        if (window.__TAURI__) {
            try {
                const res = await window.__TAURI__.core.invoke('search_customers_by_name', { name: customerSearchQuery });
                setCustomerSearchResults(res || []);
            } catch (e) {
                console.error(e);
            }
        }
    };

    const addCustomerToList = (c) => {
        const exists = customers.find(x => x.customer_id === c.customer_id);
        if (!exists) {
            setCustomers(prev => [c, ...prev]);
        }
        handleSelectCustomer(c);
        setIsSearchModalOpen(false);
        setCustomerSearchQuery('');
        setCustomerSearchResults([]);
    };

    // --- Entry Logic ---
    const openEntryModal = (type, editData = null) => {
        if (!selectedCustomer) return;
        setEntryForm({
            id: editData?.ledger_id || null,
            type: editData?.transaction_type || type,
            date: editData?.transaction_date || new Date().toISOString().split('T')[0],
            amount: editData ? Math.abs(editData.amount) : '',
            desc: editData?.description || (type === '입금' ? '잔금 입금' : (type === '이월' ? '기초 잔액 이월' : '잔액 조정'))
        });
        setIsEntryModalOpen(true);
    };

    const handleSaveEntry = async () => {
        const { id, type, date, amount, desc } = entryForm;
        // Strip everything except numbers and minus sign
        const amountVal = Number(String(amount).replace(/[^0-9-]/g, ''));

        if (amountVal === 0) return showAlert("알림", "금액을 입력해주세요.");
        if (!selectedCustomer) return;

        try {
            if (window.__TAURI__) {
                const invoke = window.__TAURI__.core.invoke;
                if (id) {
                    await invoke('update_ledger_entry', {
                        ledgerId: id,
                        transactionDate: date,
                        transactionType: type,
                        amount: amountVal,
                        description: desc
                    });
                    await showAlert("성공", "수정되었습니다.");
                } else {
                    await invoke('create_ledger_entry', {
                        customerId: selectedCustomer.customer_id,
                        transactionDate: date,
                        transactionType: type,
                        amount: amountVal,
                        description: desc
                    });
                    await showAlert("성공", "등록되었습니다.");
                }

                setIsEntryModalOpen(false);
                await loadDefaultDebtList(); // Refresh list balances

                // Refresh the selected customer object to get fresh current_balance
                const fresh = await window.__TAURI__.core.invoke('get_customer', { customerId: selectedCustomer.customer_id });
                if (fresh) {
                    handleSelectCustomer(fresh);
                } else {
                    // If balance became 0 and filtered out (though get_customer should still work), 
                    // we still want to show the current one until they switch
                    handleSelectCustomer(selectedCustomer);
                }
            }
        } catch (e) {
            showAlert("오류", "저장 실패: " + e);
        }
    };

    const handleDeleteEntry = async (id) => {
        if (!await showConfirm("삭제 확인", "정말 이 내역을 삭제하시겠습니까?\n삭제 후 잔액은 자동으로 조정됩니다.")) return;
        try {
            if (window.__TAURI__) {
                await window.__TAURI__.core.invoke('delete_ledger_entry', { ledgerId: id });
                await showAlert("성공", "삭제되었습니다.");
                handleSelectCustomer(selectedCustomer);
                loadDefaultDebtList();
            }
        } catch (e) {
            showAlert("오류", "삭제 실패: " + e);
        }
    };

    // --- Render Helpers ---
    const filteredCustomers = customers.filter(c =>
        (c.customer_name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (c.mobile_number || '').includes(searchQuery)
    );

    const currentBalance = ledger.length > 0 ? ledger[0].running_balance : (selectedCustomer?.current_balance || 0);

    return (
        <div className="flex flex-col h-full bg-[#f8fafc] overflow-hidden animate-in fade-in duration-700">
            {/* Header Area */}
            <div className="px-6 lg:px-8 min-[2000px]:px-12 pt-6 lg:pt-8 min-[2000px]:pt-12 pb-1 bg-[#f8fafc]">
                <div className="flex justify-between items-end mb-4">
                    <div>
                        <div className="flex items-center gap-2 mb-0.5">
                            <span className="w-6 h-1 bg-indigo-600 rounded-full"></span>
                            <span className="text-[9px] font-black tracking-[0.2em] text-indigo-600 uppercase">Sales Management System</span>
                        </div>
                        <h1 className="text-3xl font-black text-slate-600 tracking-tighter" style={{ fontFamily: '"Noto Sans KR", sans-serif' }}>
                            고객 미수금 관리 <span className="text-slate-300 font-light ml-1 text-xl">Receivables</span>
                        </h1>
                    </div>
                    <div className="flex gap-3">
                        <button onClick={() => setIsSearchModalOpen(true)} className="group h-10 px-5 rounded-xl bg-white border border-slate-200 text-slate-600 font-bold hover:border-indigo-500 hover:text-indigo-600 transition-all flex items-center gap-2 shadow-sm text-sm">
                            <span className="material-symbols-rounded text-lg group-hover:scale-110 transition-transform">person_add</span> 고객 추가 (검색)
                        </button>
                    </div>
                </div>
            </div>

            {/* Main Layout */}
            <div className="px-6 lg:px-8 min-[2000px]:px-12 flex gap-4 overflow-hidden flex-1 pb-6 lg:pb-8 min-[2000px]:pb-12 mt-1">
                {/* Left Panel: Customer List */}
                <div className="w-[340px] flex flex-col bg-white rounded-[1.5rem] shadow-lg border border-slate-200/60 overflow-hidden">
                    <div className="p-5 border-b border-slate-100 bg-slate-50/50">
                        <h2 className="text-sm font-black text-slate-700 mb-2 uppercase tracking-wide">Customer List</h2>
                        <div className="relative">
                            <span className="material-symbols-rounded absolute left-3 top-2.5 text-slate-400 text-lg">search</span>
                            <input
                                className="w-full h-10 pl-10 pr-4 rounded-xl bg-white border border-slate-200 text-sm font-bold text-slate-700 focus:ring-2 focus:ring-indigo-500 transition-all shadow-sm placeholder:font-medium"
                                placeholder="고객 검색..."
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                            />
                        </div>
                        <div className="flex justify-between items-center mt-3 text-[11px] font-black text-slate-400 uppercase">
                            <span>목록 ({filteredCustomers.length}명)</span>
                            <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-indigo-50 text-indigo-600">
                                <span className="material-symbols-rounded text-sm">check_circle</span>
                                <span>미수금 보유</span>
                            </div>
                        </div>
                    </div>
                    <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
                        {filteredCustomers.map(c => (
                            <div key={c.customer_id}
                                onClick={() => handleSelectCustomer(c)}
                                className={`p-3 rounded-xl cursor-pointer transition-all border ${selectedCustomer?.customer_id === c.customer_id ? 'bg-indigo-600 border-indigo-500 shadow-md text-white transform scale-[1.02]' : 'bg-white border-transparent hover:bg-slate-50 hover:border-slate-100 text-slate-600'}`}>
                                <div className="flex justify-between items-start mb-1">
                                    <span className={`font-black text-sm ${selectedCustomer?.customer_id === c.customer_id ? 'text-white' : 'text-slate-800'}`}>{c.customer_name}</span>
                                    <span className={`font-mono text-sm font-black ${selectedCustomer?.customer_id === c.customer_id ? 'text-indigo-200' : (c.current_balance > 0 ? 'text-rose-500' : (c.current_balance < 0 ? 'text-emerald-500' : 'text-slate-300'))}`}>
                                        {formatCurrency(c.current_balance)}
                                    </span>
                                </div>
                                <div className={`text-[11px] font-bold ${selectedCustomer?.customer_id === c.customer_id ? 'text-indigo-200' : 'text-slate-400'}`}>{c.mobile_number || '-'}</div>
                            </div>
                        ))}
                        {filteredCustomers.length === 0 && <div className="p-8 text-center text-slate-400 text-xs font-bold">표시할 고객이 없습니다.</div>}
                    </div>
                </div>

                {/* Right Panel: Ledger Detail */}
                <div className="flex-1 flex flex-col bg-white rounded-[1.5rem] shadow-lg border border-slate-200/60 overflow-hidden relative">
                    {selectedCustomer ? (
                        <>
                            {/* Detail Header */}
                            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/30">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 rounded-2xl bg-indigo-100 text-indigo-600 flex items-center justify-center shadow-inner">
                                        <span className="material-symbols-rounded text-2xl">account_balance_wallet</span>
                                    </div>
                                    <div>
                                        <h3 className="text-xl font-black text-slate-800 flex items-center gap-2">
                                            {selectedCustomer.customer_name}
                                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 font-black border border-slate-200">{selectedCustomer.customer_id}</span>
                                        </h3>
                                        <div className="text-sm text-slate-500 font-bold">{selectedCustomer.mobile_number}</div>
                                    </div>
                                </div>
                                <div className="text-right bg-white px-5 py-2 rounded-2xl border border-slate-100 shadow-sm">
                                    <div className="text-[10px] text-slate-400 font-black uppercase tracking-wider mb-0.5">현재 미수금 잔액</div>
                                    <div className={`text-2xl font-black ${currentBalance > 0 ? 'text-rose-500' : currentBalance < 0 ? 'text-emerald-500' : 'text-slate-700'}`}>
                                        {formatCurrency(currentBalance)} <span className="text-sm text-slate-400 font-bold">KRW</span>
                                    </div>
                                </div>
                            </div>

                            {/* Toolbar */}
                            <div className="px-6 py-3 border-b border-slate-100 flex justify-end gap-2 bg-white sticky top-0 z-10">
                                <button onClick={() => openEntryModal('이월')} className="h-9 px-4 rounded-xl bg-white border border-slate-200 text-slate-500 font-black hover:bg-slate-50 hover:text-slate-700 hover:border-slate-300 transition-all flex items-center gap-1.5 text-xs shadow-sm">
                                    <span className="material-symbols-rounded text-base">history</span> 기초 이월
                                </button>
                                <button onClick={() => openEntryModal('조정')} className="h-9 px-4 rounded-xl bg-orange-50 border border-orange-100 text-orange-600 font-black hover:bg-orange-100 transition-all flex items-center gap-1.5 text-xs shadow-sm">
                                    <span className="material-symbols-rounded text-base">tune</span> 잔액 조정
                                </button>
                                <button onClick={() => openEntryModal('입금')} className="h-9 px-5 rounded-xl bg-indigo-600 text-white font-black hover:bg-indigo-500 transition-all flex items-center gap-1.5 text-xs shadow-md shadow-indigo-200">
                                    <span className="material-symbols-rounded text-base">payments</span> 입금 등록
                                </button>
                            </div>

                            {/* Table Area */}
                            <div className="flex-1 overflow-auto bg-slate-50/50 p-4">
                                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                                    <table className="w-full text-sm text-left">
                                        <thead className="bg-slate-50 text-slate-500 font-black text-xs uppercase border-b border-slate-200 sticky top-0 z-10">
                                            <tr>
                                                <th className="px-4 py-3 text-center w-[12%] min-w-[100px]">일자</th>
                                                <th className="px-4 py-3 text-center w-[8%] min-w-[60px]">구분</th>
                                                <th className="px-4 py-3 text-left">내용</th>
                                                <th className="px-4 py-3 text-right w-[15%] min-w-[100px]">변동금액</th>
                                                <th className="px-4 py-3 text-right w-[15%] min-w-[100px] bg-slate-50">잔액</th>
                                                <th className="px-4 py-3 text-center w-[8%] min-w-[80px]">관리</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {isLoadingLedger ? (
                                                <tr><td colSpan="6" className="p-20 text-center"><span className="material-symbols-rounded animate-spin text-3xl text-slate-300">sync</span></td></tr>
                                            ) : ledger.length === 0 ? (
                                                <tr><td colSpan="6" className="p-20 text-center text-slate-400 font-bold italic">거래 내역이 없습니다. (잔액 0원)</td></tr>
                                            ) : (
                                                ledger.map(row => {
                                                    const isEditable = ['이월', '입금', '조정', '매출수정', '매출취소'].includes(row.transaction_type);
                                                    let typeColor = 'text-slate-600';
                                                    let badgeBg = 'bg-slate-100';
                                                    if (row.transaction_type === '매출') { typeColor = 'text-blue-600'; badgeBg = 'bg-blue-50'; }
                                                    if (row.transaction_type === '입금') { typeColor = 'text-emerald-600'; badgeBg = 'bg-emerald-50'; }
                                                    if (['반품', '매출취소'].includes(row.transaction_type)) { typeColor = 'text-rose-500'; badgeBg = 'bg-rose-50'; }

                                                    return (
                                                        <tr key={row.ledger_id} className="hover:bg-slate-50 group transition-colors">
                                                            <td className="px-4 py-3 text-center font-bold text-slate-500 text-xs">{row.transaction_date}</td>
                                                            <td className="px-4 py-3 text-center">
                                                                <span className={`px-2 py-0.5 rounded-md font-black text-[10px] ${typeColor} ${badgeBg} uppercase`}>{row.transaction_type}</span>
                                                            </td>
                                                            <td className="px-4 py-3 font-bold text-slate-700 break-all">
                                                                {row.description}
                                                                {row.reference_id && <span className="text-xs text-slate-400 font-medium ml-1">({row.reference_id})</span>}
                                                            </td>
                                                            <td className="px-4 py-3 text-right font-black text-xs font-mono text-slate-600">{formatCurrency(row.amount)}</td>
                                                            <td className="px-4 py-3 text-right font-black text-xs font-mono text-indigo-900 bg-slate-50/50">{formatCurrency(row.running_balance)}</td>
                                                            <td className="px-4 py-3 text-center">
                                                                {isEditable && (
                                                                    <div className="flex justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                        <button onClick={() => openEntryModal(null, row)} className="w-7 h-7 rounded bg-white border border-slate-200 text-slate-400 hover:text-indigo-600 hover:border-indigo-200 transition-all flex items-center justify-center shadow-sm"><span className="material-symbols-rounded text-sm">edit</span></button>
                                                                        <button onClick={() => handleDeleteEntry(row.ledger_id)} className="w-7 h-7 rounded bg-white border border-slate-200 text-slate-400 hover:text-rose-600 hover:border-rose-200 transition-all flex items-center justify-center shadow-sm"><span className="material-symbols-rounded text-sm">delete</span></button>
                                                                    </div>
                                                                )}
                                                            </td>
                                                        </tr>
                                                    );
                                                })
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </>
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center text-slate-300">
                            <div className="w-24 h-24 rounded-full bg-slate-50 flex items-center justify-center mb-6 shadow-inner">
                                <span className="material-symbols-rounded text-5xl opacity-50">account_balance_wallet</span>
                            </div>
                            <p className="font-black text-lg text-slate-400">고객을 선택하여 원장을 조회하세요.</p>
                            <p className="text-sm font-medium opacity-60 mt-2">왼쪽 목록에서 미수금 관리가 필요한 고객을 선택해주세요.</p>
                        </div>
                    )}
                </div>
            </div>

            {/* --- Modals --- */}

            {/* Search Modal */}
            {isSearchModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 backdrop-blur-md bg-slate-900/40 animate-in fade-in duration-300">
                    <div className="relative w-full max-w-lg bg-white rounded-[2rem] shadow-2xl overflow-hidden animate-in zoom-in-95 flex flex-col max-h-[70vh]">
                        <div className="px-6 py-5 bg-slate-800 text-white flex justify-between items-center shrink-0">
                            <h3 className="text-lg font-black flex items-center gap-3">
                                <span className="material-symbols-rounded text-indigo-400">person_add</span>
                                거래처/고객 추가
                            </h3>
                            <button onClick={() => setIsSearchModalOpen(false)} className="w-8 h-8 rounded-full hover:bg-white/10 flex items-center justify-center transition-colors"><span className="material-symbols-rounded">close</span></button>
                        </div>
                        <div className="p-4 border-b border-slate-100 bg-slate-50 flex gap-2">
                            <input value={customerSearchQuery} onChange={e => setCustomerSearchQuery(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && searchCustomer()}
                                className="flex-1 h-11 px-4 rounded-xl border border-slate-300 font-bold text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" placeholder="이름 검색..." autoFocus />
                            <button onClick={searchCustomer} className="h-11 px-6 bg-indigo-600 text-white rounded-xl font-black shadow-lg shadow-indigo-200 hover:bg-indigo-500 transition-all text-sm">검색</button>
                        </div>
                        <div className="flex-1 overflow-y-auto custom-scrollbar p-2">
                            <table className="w-full text-left text-sm">
                                <tbody className="divide-y divide-slate-100">
                                    {customerSearchResults.map(c => (
                                        <tr key={c.customer_id} className="hover:bg-slate-50 group transition-colors">
                                            <td className="px-4 py-3 font-black text-slate-800">{c.customer_name}</td>
                                            <td className="px-4 py-3 text-slate-500 font-medium text-xs font-mono">{c.mobile_number}</td>
                                            <td className="px-4 py-3 text-right">
                                                <button onClick={() => addCustomerToList(c)} className="px-4 py-1.5 rounded-lg bg-white border border-slate-200 text-indigo-600 font-black text-xs hover:bg-indigo-600 hover:text-white transition-all shadow-sm">선택</button>
                                            </td>
                                        </tr>
                                    ))}
                                    {customerSearchResults.length === 0 && <tr><td colSpan="3" className="p-10 text-center text-slate-400 font-bold italic">검색 결과가 없습니다.</td></tr>}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* Entry Modal */}
            {isEntryModalOpen && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 backdrop-blur-sm bg-slate-950/40 text-left">
                    <div className="relative w-full max-w-sm bg-white rounded-[2rem] shadow-2xl overflow-hidden animate-in zoom-in-95">
                        <div className={`px-6 py-5 text-white flex justify-between items-center ${entryForm.type === '입금' ? 'bg-indigo-600' : (entryForm.type === '이월' ? 'bg-slate-700' : 'bg-orange-500')
                            }`}>
                            <h3 className="text-lg font-black">{entryForm.id ? `${entryForm.type} 수정` : `${entryForm.type} 등록`}</h3>
                            <button onClick={() => setIsEntryModalOpen(false)} className="w-8 h-8 rounded-full hover:bg-white/10 flex items-center justify-center transition-colors"><span className="material-symbols-rounded">close</span></button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div className="space-y-1">
                                <label className="text-xs font-black text-slate-400 uppercase ml-1">일자</label>
                                <input type="date" value={entryForm.date} onChange={e => setEntryForm({ ...entryForm, date: e.target.value })}
                                    className="w-full h-11 px-4 rounded-xl bg-slate-50 border border-slate-200 font-bold text-slate-700 focus:ring-2 focus:ring-indigo-500" />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-black text-slate-400 uppercase ml-1">금액</label>
                                <input value={formatCurrency(entryForm.amount)}
                                    onChange={e => {
                                        let val = e.target.value;
                                        if (entryForm.type === '조정') {
                                            // Allow minus sign for adjustments
                                            val = val.replace(/[^0-9-]/g, '');
                                            // Ensure minus is only at the front
                                            if (val.includes('-') && val.indexOf('-') !== 0) val = val.replace(/-/g, '');
                                            if ((val.match(/-/g) || []).length > 1) val = '-' + val.replace(/-/g, '');
                                        } else {
                                            val = val.replace(/[^0-9]/g, '');
                                        }
                                        setEntryForm({ ...entryForm, amount: val });
                                    }}
                                    className="w-full h-11 px-4 rounded-xl bg-white border border-slate-300 text-right font-black text-xl text-indigo-600 focus:ring-2 focus:ring-indigo-500" placeholder="0" />
                                <div className="text-[11px] text-right font-bold mt-1 text-slate-400">
                                    {entryForm.type === '입금' ? <span className="text-emerald-500">잔액이 차감됩니다.</span> : <span className="text-rose-500">잔액이 증가합니다.</span>}
                                </div>
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-black text-slate-400 uppercase ml-1">내용 (메모)</label>
                                <input value={entryForm.desc} onChange={e => setEntryForm({ ...entryForm, desc: e.target.value })}
                                    className="w-full h-11 px-4 rounded-xl bg-white border border-slate-200 font-bold text-slate-700 focus:ring-2 focus:ring-indigo-500" />
                            </div>
                            <div className="pt-2 flex justify-end">
                                <button onClick={handleSaveEntry} className={`h-11 px-8 rounded-xl text-white font-black shadow-lg transition-all text-sm ${entryForm.type === '입금' ? 'bg-indigo-600 hover:bg-indigo-500 shadow-indigo-200' : (entryForm.type === '이월' ? 'bg-slate-700 hover:bg-slate-600 shadow-slate-300' : 'bg-orange-500 hover:bg-orange-400 shadow-orange-200')
                                    }`}>저장 완료</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SalesLedger;

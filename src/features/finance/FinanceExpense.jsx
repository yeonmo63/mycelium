import React, { useState, useEffect } from 'react';
import { formatCurrency, parseNumber } from '../../utils/common';
import { useModal } from '../../contexts/ModalContext';

/**
 * FinanceExpense.jsx
 * 일반 지출 관리
 * MushroomFarm의 기능을 포팅하고, CSI-Manager SalesReception과 유사한 Premium UI를 적용함.
 */
const FinanceExpense = () => {
    // --- Custom Hooks ---
    const { showAlert, showConfirm } = useModal();

    // --- State Management ---
    const [expenses, setExpenses] = useState([]);
    const [isLoading, setIsLoading] = useState(false);

    // Filters
    const today = new Date().toISOString().split('T')[0];
    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
    const [filter, setFilter] = useState({ start: startOfMonth, end: today, category: '' });

    // Form Stats
    const initialFormState = {
        id: null,
        date: today,
        category: '운영비',
        amount: '', // String for comma handling
        method: '계좌이체',
        memo: ''
    };
    const [form, setForm] = useState(initialFormState);

    // --- Init ---
    useEffect(() => {
        loadExpenses();
    }, []);

    const loadExpenses = async () => {
        if (!window.__TAURI__) return;
        setIsLoading(true);
        try {
            const list = await window.__TAURI__.core.invoke('get_expense_list', {
                startDate: filter.start,
                endDate: filter.end,
                category: filter.category || null
            });
            setExpenses(list || []);
        } catch (e) {
            console.error(e);
            showAlert("오류", "데이터 로딩 실패: " + e);
            setExpenses([]);
        } finally {
            setIsLoading(false);
        }
    };

    // --- Handlers ---
    const handleFormChange = (e) => {
        const { name, value } = e.target;
        setForm(prev => {
            if (name === 'amount') {
                const numericVal = parseNumber(value.replace(/,/g, ''));
                return { ...prev, amount: numericVal }; // Store as number
            }
            return { ...prev, [name]: value };
        });
    };

    const handleAmountChange = (e) => {
        const val = e.target.value.replace(/,/g, '');
        // Allow numeric inputs only
        if (!/^\d*$/.test(val)) return;
        setForm(prev => ({ ...prev, amount: val }));
    }

    const handleSave = async () => {
        const amountNum = Number(form.amount);
        if (amountNum <= 0) return showAlert("알림", "지출 금액을 입력해주세요.");

        const expense = {
            expense_id: form.id,
            expense_date: form.date,
            category: form.category,
            amount: amountNum,
            payment_method: form.method,
            memo: form.memo
        };

        try {
            if (window.__TAURI__) {
                await window.__TAURI__.core.invoke('save_expense', { expense });
                await showAlert("성공", "지출 내역이 저장되었습니다.");
                handleReset();
                loadExpenses();
            }
        } catch (e) {
            showAlert("오류", "저장 실패: " + e);
        }
    };

    const handleDelete = async (id) => {
        if (!await showConfirm("삭제 확인", "이 지출 내역을 삭제하시겠습니까?")) return;
        try {
            if (window.__TAURI__) {
                await window.__TAURI__.core.invoke('delete_expense', { id });
                loadExpenses();
            }
        } catch (e) {
            showAlert("오류", "삭제 실패: " + e);
        }
    };

    const handleReset = () => {
        setForm(initialFormState);
    };

    const loadToForm = (item) => {
        setForm({
            id: item.expense_id,
            date: item.expense_date,
            category: item.category,
            amount: String(item.amount),
            method: item.payment_method,
            memo: item.memo || ''
        });
    };

    // Stats
    const totalSum = expenses.reduce((sum, e) => sum + e.amount, 0);

    return (
        <div className="flex flex-col h-full bg-[#f8fafc] overflow-hidden animate-in fade-in duration-700">
            {/* Header Area */}
            <div className="px-6 lg:px-8 pt-6 lg:pt-8 pb-4">
                <div className="flex items-center gap-2 mb-1">
                    <span className="w-6 h-1 bg-violet-600 rounded-full"></span>
                    <span className="text-[9px] font-black tracking-[0.2em] text-violet-600 uppercase">Financial Management</span>
                </div>
                <h1 className="text-3xl font-black text-slate-600 tracking-tighter" style={{ fontFamily: '"Noto Sans KR", sans-serif' }}>
                    일반 지출 관리 <span className="text-slate-300 font-light ml-1 text-xl">Expense Management</span>
                </h1>
            </div>

            <div className="flex flex-1 gap-6 px-6 lg:px-8 pb-6 min-h-0">
                {/* Left: Input Form */}
                <div className="w-[360px] flex flex-col gap-4 h-full">
                    <div className="bg-white rounded-[1.5rem] p-5 border border-slate-200 shadow-sm relative group overflow-hidden flex flex-col flex-1 h-full">
                        <div className="absolute top-0 right-0 w-24 h-full bg-violet-50/50 -skew-x-12 translate-x-12 transition-transform group-hover:translate-x-6" />

                        <div className="flex items-center gap-2 mb-4 relative z-10 shrink-0">
                            <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center text-violet-600">
                                <span className="material-symbols-rounded">edit_square</span>
                            </div>
                            <h3 className="text-lg font-bold text-slate-700">지출 정보 입력</h3>
                        </div>

                        <div className="flex flex-col gap-3 relative z-10 overflow-y-auto flex-1 px-1 custom-scrollbar">
                            <div>
                                <label className="text-[11px] font-bold text-slate-500 uppercase ml-1 mb-1 block">지출 일자</label>
                                <input type="date" name="date" value={form.date} onChange={handleFormChange}
                                    className="w-full h-10 rounded-xl bg-slate-50 border-slate-200 text-slate-800 font-bold focus:ring-2 focus:ring-violet-500 transition-all px-3" />
                            </div>

                            <div>
                                <label className="text-[11px] font-bold text-slate-500 uppercase ml-1 mb-1 block">카테고리</label>
                                <div className="relative">
                                    <select name="category" value={form.category} onChange={handleFormChange}
                                        className="w-full h-10 rounded-xl bg-white border-slate-200 text-slate-800 font-bold focus:ring-2 focus:ring-violet-500 transition-all px-3 appearance-none">
                                        <option>운영비</option>
                                        <option>인건비</option>
                                        <option>임차료</option>
                                        <option>수도광열비</option>
                                        <option>통신비</option>
                                        <option>광고선전비</option>
                                        <option>접대비</option>
                                        <option>차량유지비</option>
                                        <option>소모품비</option>
                                        <option>세금/공과</option>
                                        <option>기타</option>
                                    </select>
                                    <span className="material-symbols-rounded absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">unfold_more</span>
                                </div>
                            </div>

                            <div>
                                <label className="text-[11px] font-bold text-slate-500 uppercase ml-1 mb-1 block">지출 금액</label>
                                <input type="text" name="amount" value={formatCurrency(form.amount)} onChange={handleAmountChange}
                                    className="w-full h-10 rounded-xl bg-white border-slate-200 text-slate-800 font-bold text-right focus:ring-2 focus:ring-violet-500 transition-all px-3" />
                            </div>



                            <div>
                                <label className="text-[11px] font-bold text-slate-500 uppercase ml-1 mb-1 block">결제 수단</label>
                                <select name="method" value={form.method} onChange={handleFormChange}
                                    className="w-full h-10 rounded-xl bg-white border-slate-200 text-slate-800 font-bold focus:ring-2 focus:ring-violet-500 transition-all px-3">
                                    <option>계좌이체</option>
                                    <option>현금</option>
                                    <option>카드</option>
                                    <option>기타</option>
                                </select>
                            </div>

                            <div>
                                <label className="text-[11px] font-bold text-slate-500 uppercase ml-1 mb-1 block">지출 내역/메모</label>
                                <textarea name="memo" value={form.memo} onChange={handleFormChange}
                                    className="w-full h-32 rounded-xl bg-white border-slate-200 text-slate-800 text-sm p-3 focus:ring-2 focus:ring-violet-500 transition-all resize-none" placeholder="상세 내용을 입력하세요"></textarea>
                            </div>

                            <div className="flex gap-2 mt-auto pt-4">
                                <button onClick={handleSave} className="flex-1 h-11 bg-violet-600 hover:bg-violet-700 text-white rounded-xl font-bold shadow-lg shadow-violet-200 transition-all flex items-center justify-center gap-2">
                                    <span className="material-symbols-rounded">save</span> 저장하기
                                </button>
                                <button onClick={handleReset} className="w-12 h-11 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl flex items-center justify-center transition-all">
                                    <span className="material-symbols-rounded">restart_alt</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right: List & Table */}
                <div className="flex-1 flex flex-col min-w-0 gap-4">
                    {/* Filter Bar */}
                    <div className="bg-white rounded-[1.5rem] p-4 border border-slate-200 shadow-sm flex flex-wrap items-center gap-3">
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 rounded-lg border border-slate-200">
                            <span className="material-symbols-rounded text-slate-400 text-[18px]">calendar_today</span>
                            <input type="date" value={filter.start} onChange={e => setFilter({ ...filter, start: e.target.value })} className="bg-transparent text-sm font-bold text-slate-600 outline-none w-28" />
                            <span className="text-slate-400">~</span>
                            <input type="date" value={filter.end} onChange={e => setFilter({ ...filter, end: e.target.value })} className="bg-transparent text-sm font-bold text-slate-600 outline-none w-28" />
                        </div>

                        <select value={filter.category} onChange={e => setFilter({ ...filter, category: e.target.value })}
                            className="h-10 rounded-lg border-slate-200 text-sm font-bold text-slate-600 w-32">
                            <option value="">모든 항목</option>
                            <option>운영비</option>
                            <option>인건비</option>
                            <option>임차료</option>
                            <option>수도광열비</option>
                            <option>통신비</option>
                            <option>광고선전비</option>
                            <option>접대비</option>
                            <option>차량유지비</option>
                            <option>소모품비</option>
                            <option>세금/공과</option>
                            <option>기타</option>
                        </select>

                        <button onClick={loadExpenses} className="h-10 px-4 bg-slate-800 text-white rounded-lg font-bold hover:bg-slate-700 transition-colors flex items-center gap-2 text-sm">
                            <span className="material-symbols-rounded text-[18px]">search</span> 조회
                        </button>

                        <div className="ml-auto flex items-center gap-6">
                            <div className="text-right pl-6 border-l border-slate-200">
                                <span className="text-[10px] font-bold text-red-400 uppercase block">총 지출액</span>
                                <span className="text-lg font-black text-red-500">{formatCurrency(totalSum)}원</span>
                            </div>
                        </div>
                    </div>

                    {/* Table */}
                    <div className="flex-1 bg-white rounded-[1.5rem] border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                        <div className="flex-1 overflow-y-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-slate-50 sticky top-0 z-10 shadow-sm">
                                    <tr className="text-slate-500 border-b border-slate-200">
                                        <th className="py-3 px-4 font-bold whitespace-nowrap text-center min-w-[100px]">지출일</th>
                                        <th className="py-3 px-4 font-bold whitespace-nowrap text-center min-w-[100px]">항목</th>
                                        <th className="py-3 px-4 font-bold whitespace-nowrap text-right min-w-[120px]">금액</th>
                                        <th className="py-3 px-4 font-bold whitespace-nowrap text-center">지급방법</th>
                                        <th className="py-3 px-4 font-bold whitespace-nowrap w-2/5 min-w-[200px]">메모</th>
                                        <th className="py-3 px-4 font-bold whitespace-nowrap text-center w-[80px]">관리</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {expenses.length === 0 ? (
                                        <tr><td colSpan="6" className="py-12 text-center text-slate-400 font-medium">지출 내역이 없습니다.</td></tr>
                                    ) : (
                                        expenses.map(item => (
                                            <tr key={item.expense_id} onClick={() => loadToForm(item)} className="hover:bg-violet-50/50 cursor-pointer transition-colors group">
                                                <td className="py-3 px-4 text-center font-medium text-slate-600">{item.expense_date}</td>
                                                <td className="py-3 px-4 text-center">
                                                    <span className="inline-block px-2 py-0.5 rounded text-xs font-bold bg-slate-100 text-slate-600 border border-slate-200 whitespace-nowrap">
                                                        {item.category}
                                                    </span>
                                                </td>
                                                <td className="py-3 px-4 text-right font-black text-red-500">{formatCurrency(item.amount)}원</td>
                                                <td className="py-3 px-4 text-center text-slate-500 text-xs">{item.payment_method}</td>
                                                <td className="py-3 px-4 text-slate-700 break-keep">{item.memo || '-'}</td>
                                                <td className="py-3 px-4 text-center">
                                                    <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <button onClick={(e) => { e.stopPropagation(); handleDelete(item.expense_id); }}
                                                            className="w-8 h-8 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500 flex items-center justify-center transition-colors">
                                                            <span className="material-symbols-rounded text-lg">delete</span>
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default FinanceExpense;

import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useModal } from '../../contexts/ModalContext';
import { useAdminGuard } from '../../hooks/useAdminGuard';
import { invoke } from '../../utils/apiBridge';
import { Lock } from 'lucide-react';

/**
 * FinanceVendor.jsx
 * 공급/거래처 관리
 */
const FinanceVendor = () => {
    // --- Custom Hooks ---
    const navigate = useNavigate();
    const { showAlert, showConfirm } = useModal();
    const { isAuthorized, checkAdmin, isVerifying } = useAdminGuard();

    // --- State Management ---
    const [vendors, setVendors] = useState([]);
    const [allVendors, setAllVendors] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');

    // Form
    const initialFormState = {
        id: null,
        name: '',
        bizNum: '',
        rep: '',
        mobile: '',
        email: '',
        address: '',
        items: '',
        memo: ''
    };
    const [form, setForm] = useState(initialFormState);

    // --- Admin Guard Check ---
    const checkRunComp = useRef(false);
    useEffect(() => {
        if (checkRunComp.current) return;
        checkRunComp.current = true;

        const init = async () => {
            const ok = await checkAdmin();
            if (!ok) {
                navigate('/');
            }
        };
        init();
    }, [checkAdmin, navigate]);

    // --- Init ---
    useEffect(() => {
        if (isAuthorized) {
            loadVendors();
        }
    }, [isAuthorized]);

    // Local filtering
    useEffect(() => {
        if (!searchQuery) {
            setVendors(allVendors);
        } else {
            const query = searchQuery.toLowerCase();
            const filtered = allVendors.filter(v =>
                v.vendor_name.toLowerCase().includes(query) ||
                (v.main_items && v.main_items.toLowerCase().includes(query))
            );
            setVendors(filtered);
        }
    }, [searchQuery, allVendors]);

    const loadVendors = async () => {
        try {
            const list = await invoke('get_vendors');
            setAllVendors(list || []);
            setVendors(list || []);
        } catch (e) {
            console.error(e);
            showAlert("오류", "데이터 로딩 실패: " + e.message || e);
        }
    };

    // --- Handlers ---
    const handleFormChange = (e) => {
        const { name, value } = e.target;
        setForm(prev => ({ ...prev, [name]: value }));
    };

    const handleSave = async () => {
        if (!form.name.trim()) return showAlert("알림", "거래처명을 입력해주세요.");

        const vendor = {
            vendor_id: form.id,
            vendor_name: form.name,
            business_number: form.bizNum,
            representative: form.rep,
            mobile_number: form.mobile,
            email: form.email,
            address: form.address,
            main_items: form.items,
            memo: form.memo,
            is_active: true
        };

        try {
            await invoke('save_vendor', vendor);
            await showAlert("성공", "거래처 정보가 저장되었습니다.");
            handleReset();
            loadVendors();
        } catch (e) {
            showAlert("오류", "저장 실패: " + e.message || e);
        }
    };

    const handleDelete = async (id, name) => {
        if (!await showConfirm("삭제 확인", `'${name}' 거래처를 삭제하시겠습니까?`)) return;
        try {
            await invoke('delete_vendor', { id });
            loadVendors();
        } catch (e) {
            showAlert("오류", "삭제 실패: " + e.message || e);
        }
    };

    const handleReset = () => {
        setForm(initialFormState);
        setSearchQuery('');
    };

    const loadToForm = (v) => {
        setForm({
            id: v.vendor_id,
            name: v.vendor_name,
            bizNum: v.business_number || '',
            rep: v.representative || '',
            mobile: v.mobile_number || '',
            email: v.email || '',
            address: v.address || '',
            items: v.main_items || '',
            memo: v.memo || ''
        });
        setSearchQuery(v.vendor_name);
    };

    if (!isAuthorized) {
        return (
            <div className="flex h-full items-center justify-center bg-[#f8fafc]">
                <div className="text-center animate-pulse">
                    {isVerifying ? (
                        <div className="w-12 h-12 border-4 border-slate-200 border-t-indigo-500 rounded-full animate-spin mx-auto mb-4" />
                    ) : (
                        <Lock size={48} className="mx-auto text-slate-300 mb-4" />
                    )}
                    <p className="text-slate-400 font-bold">
                        {isVerifying ? '인증 확인 중...' : '인증 대기 중...'}
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-[#f8fafc] overflow-hidden animate-in fade-in duration-700">
            {/* Header Area */}
            <div className="px-6 lg:px-8 pt-6 lg:pt-8 pb-4">
                <div className="flex items-center gap-2 mb-1">
                    <span className="w-6 h-1 bg-violet-600 rounded-full"></span>
                    <span className="text-[9px] font-black tracking-[0.2em] text-violet-600 uppercase">Vendor Management</span>
                </div>
                <h1 className="text-3xl font-black text-slate-600 tracking-tighter" style={{ fontFamily: '"Noto Sans KR", sans-serif' }}>
                    공급/거래처 관리 <span className="text-slate-300 font-light ml-1 text-xl">Supply Vendors</span>
                </h1>
            </div>

            <div className="flex flex-1 gap-6 px-6 lg:px-8 pb-6 min-h-0">
                {/* Left: Input Form */}
                <div className="w-[420px] flex flex-col gap-4 h-full">
                    <div className="bg-white rounded-[1.5rem] p-5 border border-slate-200 shadow-sm relative group overflow-hidden flex flex-col flex-1 h-full">
                        <div className="absolute top-0 right-0 w-24 h-full bg-violet-50/50 -skew-x-12 translate-x-12 transition-transform group-hover:translate-x-6" />

                        <div className="flex items-center gap-2 mb-4 relative z-10 shrink-0">
                            <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center text-violet-600">
                                <span className="material-symbols-rounded">store</span>
                            </div>
                            <h3 className="text-lg font-bold text-slate-700">거래처 정보 입력</h3>
                        </div>

                        <div className="flex flex-col gap-3 relative z-10 overflow-y-auto flex-1 px-1 custom-scrollbar">
                            <div>
                                <label htmlFor="vendor-name" className="text-[11px] font-bold text-slate-500 uppercase ml-1 mb-1 block">거래처명 (업체명) <span className="text-violet-500">*</span></label>
                                <input id="vendor-name" name="name" value={form.name} onChange={handleFormChange} placeholder="예: OO농산" autoFocus
                                    className="w-full h-10 rounded-xl bg-white border-slate-200 text-slate-800 font-bold focus:ring-2 focus:ring-violet-500 transition-all px-3" />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label htmlFor="vendor-rep" className="text-[11px] font-bold text-slate-500 uppercase ml-1 mb-1 block">대표자</label>
                                    <input id="vendor-rep" name="rep" value={form.rep} onChange={handleFormChange} placeholder="홍길동"
                                        className="w-full h-10 rounded-xl bg-white border-slate-200 text-slate-800 font-bold focus:ring-2 focus:ring-violet-500 transition-all px-3" />
                                </div>
                                <div>
                                    <label htmlFor="vendor-biznum" className="text-[11px] font-bold text-slate-500 uppercase ml-1 mb-1 block">사업자번호</label>
                                    <input id="vendor-biznum" name="bizNum" value={form.bizNum} onChange={handleFormChange} placeholder="000-00-00000"
                                        className="w-full h-10 rounded-xl bg-white border-slate-200 text-slate-800 font-bold focus:ring-2 focus:ring-violet-500 transition-all px-3" />
                                </div>
                            </div>

                            <div className="w-1/2 pr-1.5">
                                <label htmlFor="vendor-mobile" className="text-[11px] font-bold text-slate-500 uppercase ml-1 mb-1 block">연락처</label>
                                <input id="vendor-mobile" name="mobile" value={form.mobile} onChange={handleFormChange} placeholder="010.."
                                    className="w-full h-10 rounded-xl bg-white border-slate-200 text-slate-800 font-bold focus:ring-2 focus:ring-violet-500 transition-all px-3" />
                            </div>

                            <div>
                                <label htmlFor="vendor-email" className="text-[11px] font-bold text-slate-500 uppercase ml-1 mb-1 block">이메일</label>
                                <input id="vendor-email" type="email" name="email" value={form.email} onChange={handleFormChange} placeholder="email@example.com"
                                    className="w-full h-10 rounded-xl bg-white border-slate-200 text-slate-800 font-bold focus:ring-2 focus:ring-violet-500 transition-all px-3" />
                            </div>

                            <div>
                                <label htmlFor="vendor-address" className="text-[11px] font-bold text-slate-500 uppercase ml-1 mb-1 block">주소</label>
                                <input id="vendor-address" name="address" value={form.address} onChange={handleFormChange} placeholder="사업장 주소 입력"
                                    className="w-full h-10 rounded-xl bg-white border-slate-200 text-slate-800 font-bold focus:ring-2 focus:ring-violet-500 transition-all px-3" />
                            </div>

                            <div>
                                <label htmlFor="vendor-items" className="text-[11px] font-bold text-slate-500 uppercase ml-1 mb-1 block">주요 취급 품목</label>
                                <input id="vendor-items" name="items" value={form.items} onChange={handleFormChange} placeholder="예: 박스, 라벨지, 버섯종균 등"
                                    className="w-full h-10 rounded-xl bg-white border-slate-200 text-slate-800 font-bold focus:ring-2 focus:ring-violet-500 transition-all px-3" />
                            </div>

                            <div>
                                <label htmlFor="vendor-memo" className="text-[11px] font-bold text-slate-500 uppercase ml-1 mb-1 block">메모</label>
                                <textarea id="vendor-memo" name="memo" value={form.memo} onChange={handleFormChange}
                                    className="w-full h-24 rounded-xl bg-white border-slate-200 text-slate-800 text-sm p-3 focus:ring-2 focus:ring-violet-500 transition-all resize-none" placeholder="거래 특이사항을 입력하세요"></textarea>
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
                    <div className="bg-white rounded-[1.5rem] p-4 border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                            <div className="relative">
                                <span className="material-symbols-rounded absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">search</span>
                                <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="거래처명 또는 품목 검색..."
                                    className="pl-10 pr-4 h-10 rounded-xl bg-slate-50 border-slate-200 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-violet-500 transition-all w-64" />
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            <span className="text-[11px] font-bold text-slate-400 uppercase">등록된 거래처</span>
                            <span className="text-lg font-black text-violet-600">{vendors.length}</span>
                            <span className="text-sm font-medium text-slate-500">곳</span>
                        </div>
                    </div>

                    {/* Table */}
                    <div className="flex-1 bg-white rounded-[1.5rem] border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                        <div className="flex-1 overflow-y-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-slate-50 sticky top-0 z-10 shadow-sm">
                                    <tr className="text-slate-500 border-b border-slate-200">
                                        <th className="py-3 px-4 font-bold whitespace-nowrap w-[15%] min-w-[120px]">거래처명</th>
                                        <th className="py-3 px-4 font-bold whitespace-nowrap w-[10%] min-w-[80px]">대표자</th>
                                        <th className="py-3 px-4 font-bold whitespace-nowrap w-[12%] min-w-[100px]">연락처</th>
                                        <th className="py-3 px-4 font-bold whitespace-nowrap w-[25%] min-w-[200px]">주소</th>
                                        <th className="py-3 px-4 font-bold whitespace-nowrap w-[30%] min-w-[150px]">주요 품목</th>
                                        <th className="py-3 px-4 font-bold whitespace-nowrap text-center w-[80px]">관리</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {vendors.length === 0 ? (
                                        <tr><td colSpan="6" className="py-12 text-center text-slate-400 font-medium">등록된 거래처가 없습니다.</td></tr>
                                    ) : (
                                        vendors.map(v => (
                                            <tr key={v.vendor_id} onClick={() => loadToForm(v)} className="hover:bg-violet-50/50 cursor-pointer transition-colors group">
                                                <td className="py-3 px-4 font-bold text-slate-800 break-keep">{v.vendor_name}</td>
                                                <td className="py-3 px-4 font-medium text-slate-600">{v.representative || '-'}</td>
                                                <td className="py-3 px-4 font-mono text-xs text-slate-500">{v.mobile_number || '-'}</td>
                                                <td className="py-3 px-4 text-slate-600 text-xs break-keep">{v.address || '-'}</td>
                                                <td className="py-3 px-4 text-slate-700 text-sm truncate">{v.main_items || '-'}</td>
                                                <td className="py-3 px-4 text-center">
                                                    <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <button onClick={(e) => { e.stopPropagation(); handleDelete(v.vendor_id, v.vendor_name); }}
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

export default FinanceVendor;

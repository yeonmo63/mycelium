import React, { useState, useEffect } from 'react';
import { useModal } from '../../contexts/ModalContext';
import { invokeAI } from '../../utils/aiErrorHandler';

const CustomerConsultation = () => {
    const { showAlert, showConfirm } = useModal();

    // --- State ---
    const [consultList, setConsultList] = useState([]);
    const [searchParams, setSearchParams] = useState({
        startDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0], // First day of month
        endDate: new Date().toISOString().split('T')[0],
    });

    // Modal State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editData, setEditData] = useState(null);
    const [aiBriefing, setAiBriefing] = useState(null);
    const [aiAdvisor, setAiAdvisor] = useState(null);
    const [isAiLoading, setIsAiLoading] = useState(false);

    // Customer Selection State
    const [showSelectModal, setShowSelectModal] = useState(false);
    const [customerSearchResults, setCustomerSearchResults] = useState([]);

    // Stats
    const stats = {
        urgent: consultList.filter(c => c.priority === '긴급' && c.status !== '완료').length,
        pending: consultList.filter(c => ['접수', '처리중'].includes(c.status)).length
    };

    // --- Handlers ---
    useEffect(() => {
        handleSearch();
    }, []);

    const handleSearch = async () => {
        if (!window.__TAURI__) return;
        try {
            const results = await window.__TAURI__.core.invoke('get_consultations', {
                startDate: searchParams.startDate || null,
                endDate: searchParams.endDate || null
            });
            setConsultList(results || []);
        } catch (e) {
            console.error(e);
            showAlert('오류', '상담 내역 조회 실패: ' + e);
        }
    };

    const handleGlobalBriefing = async () => {
        if (!window.__TAURI__) return;
        try {
            setIsAiLoading(true);
            const summary = await invokeAI(showAlert, 'get_pending_consultations_summary');
            showAlert('AI 상담 브리핑', summary); // Or better: use a custom rich modal if available
        } catch (e) {
            console.error(e);
        } finally {
            setIsAiLoading(false);
        }
    };

    const handleOpenModal = (consult = null) => {
        setEditData(consult ? { ...consult } : {
            consult_id: null,
            customer_id: null,
            guest_name: '',
            contact: '',
            channel: '전화',
            counselor_name: '관리자',
            category: '일반 문의',
            priority: '보통',
            title: '',
            content: '',
            answer: '',
            status: '접수',
            consult_date: new Date().toISOString().split('T')[0],
            follow_up_date: ''
        });
        setAiBriefing(null);
        setAiAdvisor(null);
        setIsModalOpen(true);
    };

    const handleSave = async (e) => {
        e.preventDefault();
        if (!window.__TAURI__) return;

        try {
            if (editData.consult_id) {
                // Update
                await window.__TAURI__.core.invoke('update_consultation', {
                    consultId: editData.consult_id,
                    answer: editData.answer || null,
                    status: editData.status,
                    priority: editData.priority,
                    followUpDate: editData.follow_up_date || null
                });
                showAlert('성공', '상담 내역이 업데이트되었습니다.');
            } else {
                // Create
                await window.__TAURI__.core.invoke('create_consultation', {
                    customerId: editData.customer_id || null, // Logic needs to handle customer linking separately or via search
                    guestName: editData.guest_name,
                    contact: editData.contact,
                    channel: editData.channel,
                    counselorName: editData.counselor_name,
                    category: editData.category,
                    priority: editData.priority,
                    title: editData.title,
                    content: editData.content
                });
                showAlert('성공', '새로운 상담이 등록되었습니다.');
            }
            setIsModalOpen(false);
            handleSearch();
        } catch (e) {
            showAlert('오류', '저장 실패: ' + e);
        }
    };

    const handleDelete = async () => {
        if (!editData?.consult_id) return;
        if (!await showConfirm('삭제 확인', '정말 이 상담 내역을 삭제하시겠습니까?')) return;

        try {
            await window.__TAURI__.core.invoke('delete_consultation', { consultId: editData.consult_id });
            showAlert('성공', '삭제되었습니다.');
            setIsModalOpen(false);
            handleSearch();
        } catch (e) {
            showAlert('오류', '삭제 실패: ' + e);
        }
    };

    // AI Features in Modal
    const handleGetAiAdvisor = async () => {
        if (!editData) return;
        setIsAiLoading(true);
        try {
            const advice = await invokeAI(showAlert, 'get_consultation_ai_advisor', {
                customerId: editData.customer_id || null, // Note: backend assumes string or option? Check type. Mostly String or Option<String>
                category: editData.category,
                title: editData.title,
                content: editData.content
            });
            setAiAdvisor(advice);
        } catch (e) {
            console.error(e);
        } finally {
            setIsAiLoading(false);
        }
    };

    const handleGetCustomerBriefing = async () => {
        if (!editData?.customer_id) return;
        setIsAiLoading(true);
        try {
            const briefing = await invokeAI(showAlert, 'get_consultation_briefing', {
                customerId: editData.customer_id
            });
            setAiBriefing(briefing);
        } catch (e) {
            console.error(e);
        } finally {
            setIsAiLoading(false);
        }
    };

    // Customer Search for New Consult (Simplified)
    // Customer Search for New Consult
    const handleCustomerSearch = async (name) => {
        if (!name || name.length < 1) {
            showAlert('알림', '검색어를 입력해주세요.');
            return;
        }
        try {
            const customers = await window.__TAURI__.core.invoke('search_customers_by_name', { name });
            if (!customers || customers.length === 0) {
                // No match - assume guest (silent)
            } else if (customers.length === 1) {
                handleSelectCustomer(customers[0]);
            } else {
                setCustomerSearchResults(customers);
                setShowSelectModal(true);
            }
        } catch (e) {
            console.error(e);
            showAlert('오류', '고객 검색 중 오류가 발생했습니다.');
        }
    };

    const handleSelectCustomer = (customer) => {
        setEditData(prev => ({
            ...prev,
            customer_id: customer.customer_id,
            guest_name: customer.customer_name,
            contact: customer.mobile_number,
            counselor_name: prev.counselor_name || '관리자', // Preserve or default
        }));
        setShowSelectModal(false);
    };

    const handleCustomerInputKey = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleCustomerSearch(e.target.value);
        }
    };

    // Helpers for Badge Colors
    const getStatusColor = (s) => {
        switch (s) {
            case '접수': return 'bg-indigo-100 text-indigo-700 border-indigo-200';
            case '처리중': return 'bg-blue-100 text-blue-700 border-blue-200';
            case '완료': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
            case '보류': return 'bg-amber-100 text-amber-700 border-amber-200';
            default: return 'bg-slate-100 text-slate-600 border-slate-200';
        }
    };

    const getPriorityColor = (p) => {
        switch (p) {
            case '긴급': return 'bg-rose-100 text-rose-700 border-rose-200 animate-pulse';
            case '높음': return 'bg-orange-100 text-orange-700 border-orange-200';
            case '낮음': return 'bg-slate-100 text-slate-600 border-slate-200';
            default: return 'bg-sky-100 text-sky-700 border-sky-200';
        }
    };


    return (
        <div className="flex flex-col h-full bg-[#f8fafc] overflow-hidden animate-in fade-in duration-700">
            {/* Header Area */}
            <div className="px-6 lg:px-8 min-[2000px]:px-12 pt-6 lg:pt-8 min-[2000px]:pt-12 pb-1">
                <div className="flex justify-between items-end mb-4">
                    <div>
                        <div className="flex items-center gap-2 mb-0.5">
                            <span className="w-6 h-1 bg-indigo-600 rounded-full"></span>
                            <span className="text-[9px] font-black tracking-[0.2em] text-indigo-600 uppercase">Customer Relationship Management</span>
                        </div>
                        <h1 className="text-3xl font-black text-slate-600 tracking-tighter" style={{ fontFamily: '"Noto Sans KR", sans-serif' }}>
                            상담 관리 (CRM) <span className="text-slate-300 font-light ml-1 text-xl">Consultation</span>
                        </h1>
                    </div>
                </div>

                {/* Dashboard / Filter Bar */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 mb-4">
                    {/* Stats Cards */}
                    <div className="lg:col-span-3 flex gap-3">
                        <div className="flex-1 bg-white rounded-2xl border border-rose-100 p-3 shadow-sm flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-rose-50 flex items-center justify-center text-rose-500">
                                <span className="material-symbols-rounded">campaign</span>
                            </div>
                            <div>
                                <div className="text-[10px] font-black text-rose-400 uppercase">긴급 미처리</div>
                                <div className="text-xl font-black text-slate-700">{stats.urgent}건</div>
                            </div>
                        </div>
                        <div className="flex-1 bg-white rounded-2xl border border-indigo-100 p-3 shadow-sm flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-500">
                                <span className="material-symbols-rounded">pending_actions</span>
                            </div>
                            <div>
                                <div className="text-[10px] font-black text-indigo-400 uppercase">처리 대기</div>
                                <div className="text-xl font-black text-slate-700">{stats.pending}건</div>
                            </div>
                        </div>
                    </div>

                    {/* Filter */}
                    <div className="lg:col-span-9 bg-white rounded-2xl border border-slate-200 p-3 shadow-sm flex items-center gap-3">
                        <span className="material-symbols-rounded text-slate-400 ml-2">filter_alt</span>
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-black text-slate-500 uppercase">기간</span>
                            <input type="date" value={searchParams.startDate} onChange={e => setSearchParams({ ...searchParams, startDate: e.target.value })} className="h-9 px-3 rounded-lg bg-slate-50 border border-slate-200 text-sm font-bold text-slate-700" />
                            <span className="text-slate-400">~</span>
                            <input type="date" value={searchParams.endDate} onChange={e => setSearchParams({ ...searchParams, endDate: e.target.value })} className="h-9 px-3 rounded-lg bg-slate-50 border border-slate-200 text-sm font-bold text-slate-700" />
                        </div>
                        <div className="h-6 w-px bg-slate-200 mx-1"></div>
                        <button onClick={handleSearch} className="h-9 px-4 rounded-lg bg-slate-800 text-white font-black hover:bg-slate-700 transition-all text-sm shadow-md shadow-slate-200">조회</button>

                        <div className="flex-1"></div>

                        <button onClick={handleGlobalBriefing} className="h-9 px-4 rounded-lg bg-white border border-indigo-200 text-indigo-600 font-black hover:bg-indigo-50 transition-all text-sm flex items-center gap-2">
                            <span className="material-symbols-rounded text-lg">psychology</span> AI 브리핑
                        </button>
                        <button onClick={() => handleOpenModal()} className="h-9 px-5 rounded-lg bg-indigo-600 text-white font-black hover:bg-indigo-500 transition-all text-sm shadow-md shadow-indigo-200 flex items-center gap-2">
                            <span className="material-symbols-rounded">add</span> 상담 등록
                        </button>
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div className="px-6 lg:px-8 min-[2000px]:px-12 flex flex-col overflow-hidden flex-1 pb-4">
                <div className="bg-white rounded-[1.5rem] border border-slate-200 shadow-sm flex flex-col overflow-hidden h-full">
                    {/* Header */}
                    <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                        <span className="text-xs font-black text-slate-500">검색 결과: <span className="text-indigo-600">{consultList.length}</span>건</span>
                    </div>

                    {/* Table */}
                    <div className="flex-1 overflow-auto bg-slate-50/30">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-50 text-slate-500 font-black text-xs uppercase border-b border-slate-200 sticky top-0 z-10">
                                <tr>
                                    <th className="px-4 py-3 text-center w-[10%] min-w-[90px]">일자</th>
                                    <th className="px-4 py-3 text-center w-[8%] min-w-[70px]">상태</th>
                                    <th className="px-4 py-3 text-left w-[15%] min-w-[120px]">고객 정보</th>
                                    <th className="px-4 py-3 text-left w-[12%] min-w-[100px]">접수 경로/담당</th>
                                    <th className="px-4 py-3 text-center w-[10%] min-w-[80px]">유형</th>
                                    <th className="px-4 py-3 text-left">제목</th>
                                    <th className="px-4 py-3 text-center w-[8%] min-w-[60px]">우선순위</th>
                                    <th className="px-4 py-3 text-center w-[8%] min-w-[60px]">감성분석</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {consultList.length === 0 ? (
                                    <tr><td colSpan="8" className="p-20 text-center text-slate-400 font-bold italic">상담 내역이 없습니다.</td></tr>
                                ) : (
                                    consultList.map(c => (
                                        <tr key={c.consult_id} onClick={() => handleOpenModal(c)} className="hover:bg-slate-50 group transition-colors bg-white cursor-pointer">
                                            <td className="px-4 py-3 text-center text-slate-500 text-xs font-mono">{c.consult_date}</td>
                                            <td className="px-4 py-3 text-center">
                                                <span className={`px-2 py-0.5 rounded text-[10px] font-black border ${getStatusColor(c.status)}`}>{c.status}</span>
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="font-bold text-slate-700">{c.guest_name}</div>
                                                <div className="text-[10px] text-slate-400">{c.contact}</div>
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="font-bold text-slate-700 text-xs">{c.channel}</div>
                                                <div className="text-[10px] text-slate-400">{c.counselor_name}</div>
                                            </td>
                                            <td className="px-4 py-3 text-center text-slate-600 text-xs">{c.category}</td>
                                            <td className="px-4 py-3 font-bold text-slate-700 truncate max-w-[300px]">{c.title}</td>
                                            <td className="px-4 py-3 text-center">
                                                <span className={`px-2 py-0.5 rounded text-[10px] font-black border ${getPriorityColor(c.priority)}`}>{c.priority}</span>
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                {c.sentiment ? (
                                                    <span className={`px-2 py-0.5 rounded text-[10px] font-black ${c.sentiment.includes('긍정') ? 'bg-emerald-100 text-emerald-600' : c.sentiment.includes('부정') ? 'bg-rose-100 text-rose-600' : 'bg-slate-100 text-slate-500'}`}>
                                                        {c.sentiment}
                                                    </span>
                                                ) : <span className="text-slate-300">-</span>}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Modal */}
            {isModalOpen && editData && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
                    <div className="relative w-full max-w-4xl bg-white rounded-[2rem] shadow-2xl overflow-hidden animate-in zoom-in-95 flex flex-col max-h-[90vh]">
                        {/* Modal Header */}
                        <div className="px-8 py-5 bg-slate-800 text-white flex justify-between items-center shrink-0">
                            <h3 className="text-xl font-black flex items-center gap-2">
                                <span className="material-symbols-rounded text-indigo-400">support_agent</span>
                                {editData.consult_id ? '상담 상세 정보 및 처리' : '새 상담 등록'}
                            </h3>
                            <button onClick={() => setIsModalOpen(false)} className="w-9 h-9 rounded-full hover:bg-white/20 transition-colors flex items-center justify-center">
                                <span className="material-symbols-rounded">close</span>
                            </button>
                        </div>

                        {/* Modal Body */}
                        <div className="flex-1 overflow-y-auto p-8 bg-[#f8fafc]">
                            <form onSubmit={handleSave} className="space-y-6">
                                {/* Top Section: Customer & Date - 2 Cols */}
                                {/* Top Section: Customer & Date - 2 Cols Flat Grid */}
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-4 items-start">
                                    {/* 1. Customer Search */}
                                    <div className="space-y-1">
                                        <div className="flex justify-between items-center h-7">
                                            <label className="text-xs font-black text-slate-500 uppercase">고객 검색 (회원)</label>
                                            {editData.customer_id && (
                                                <button type="button" onClick={handleGetCustomerBriefing} className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded border border-indigo-100 hover:bg-indigo-100 flex items-center gap-1">
                                                    <span className="material-symbols-rounded text-xs">summarize</span> AI 히스토리 요약
                                                </button>
                                            )}
                                        </div>
                                        <div className="relative">
                                            <input type="text" placeholder={editData.consult_id ? "고객명 수정 불가" : "이름 입력 (Tab/클릭 이동시 검색)"}
                                                value={editData.guest_name || ''}
                                                onChange={(e) => setEditData({ ...editData, guest_name: e.target.value, customer_id: null })}
                                                onBlur={(e) => handleCustomerSearch(e.target.value)}
                                                onKeyDown={handleCustomerInputKey}
                                                disabled={!!editData.consult_id}
                                                className={`w-full h-10 px-3 rounded-lg border border-slate-200 text-sm font-bold text-slate-700 bg-white focus:ring-2 focus:ring-indigo-500 ${editData.consult_id ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : ''}`} />
                                            {editData.customer_id && (
                                                <span className="absolute right-3 top-2.5 text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100 flex items-center gap-1">
                                                    <span className="material-symbols-rounded text-[10px]">link</span> 회원
                                                </span>
                                            )}
                                        </div>
                                        {aiBriefing && (
                                            <div className="mt-2 p-3 bg-blue-50 border border-blue-100 rounded-lg text-xs leading-relaxed text-blue-800 animate-in fade-in">
                                                <strong className="block mb-1 text-blue-900">💡 AI 요약 브리핑:</strong>
                                                {aiBriefing}
                                            </div>
                                        )}
                                    </div>

                                    {/* 2. Channel */}
                                    <div className="space-y-1">
                                        <div className="flex justify-between items-center h-7">
                                            <label className="text-xs font-black text-slate-500 uppercase">상담 채널</label>
                                        </div>
                                        <select value={editData.channel} onChange={e => setEditData({ ...editData, channel: e.target.value })} className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm font-bold text-slate-700 bg-white">
                                            <option value="전화">전화</option>
                                            <option value="문자">문자</option>
                                            <option value="방문">방문</option>
                                            <option value="기타">기타</option>
                                        </select>
                                    </div>

                                    {/* 3. Date */}
                                    <div className="space-y-1">
                                        <div className="flex justify-between items-center h-7">
                                            <label className="text-xs font-black text-slate-500 uppercase">상담 날짜</label>
                                        </div>
                                        <input type="date" value={editData.consult_date} onChange={e => setEditData({ ...editData, consult_date: e.target.value })} className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm font-bold text-slate-700 bg-slate-50" />
                                    </div>

                                    {/* 4. Counselor */}
                                    <div className="space-y-1">
                                        <div className="flex justify-between items-center h-7">
                                            <label className="text-xs font-black text-slate-500 uppercase">상담원 (작성자)</label>
                                        </div>
                                        <input type="text" value={editData.counselor_name} onChange={e => setEditData({ ...editData, counselor_name: e.target.value })} className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm font-bold text-slate-700" placeholder="상담원 성함" />
                                    </div>

                                    {/* 5. Guest Name */}
                                    <div className="space-y-1">
                                        <div className="flex justify-between items-center h-7">
                                            <label className="text-xs font-black text-slate-500 uppercase">상담 대상자</label>
                                        </div>
                                        <input type="text" value={editData.guest_name}
                                            onChange={e => setEditData({ ...editData, guest_name: e.target.value })}
                                            readOnly={!!editData.consult_id}
                                            className={`w-full h-10 px-3 rounded-lg border border-slate-200 text-sm font-bold text-slate-700 ${editData.consult_id ? 'bg-slate-100 text-slate-500 focus:ring-0' : ''}`}
                                            placeholder="상담 받으시는 분 성함" />
                                    </div>

                                    {/* 6. Category & Priority */}
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-1">
                                            <div className="flex justify-between items-center h-7">
                                                <label className="text-xs font-black text-slate-500 uppercase">상담 유형</label>
                                            </div>
                                            <select value={editData.category} onChange={e => setEditData({ ...editData, category: e.target.value })} className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm font-bold text-slate-700 bg-white">
                                                <option value="상품문의">상품문의</option>
                                                <option value="대량구매">대량구매</option>
                                                <option value="체험문의">체험문의</option>
                                                <option value="배송문의">배송문의</option>
                                                <option value="클레임">클레임</option>
                                                <option value="기타">기타</option>
                                            </select>
                                        </div>
                                        <div className="space-y-1">
                                            <div className="flex justify-between items-center h-7">
                                                <label className="text-xs font-black text-slate-500 uppercase">우선순위</label>
                                            </div>
                                            <select value={editData.priority} onChange={e => setEditData({ ...editData, priority: e.target.value })} className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm font-bold text-slate-700 bg-white">
                                                <option value="낮음">낮음</option>
                                                <option value="보통">보통</option>
                                                <option value="높음">높음</option>
                                                <option value="긴급">긴급</option>
                                            </select>
                                        </div>
                                    </div>

                                    {/* 7. Contact */}
                                    <div className="space-y-1">
                                        <div className="flex justify-between items-center h-7">
                                            <label className="text-xs font-black text-slate-500 uppercase">연락처</label>
                                        </div>
                                        <input type="text" value={editData.contact} onChange={e => setEditData({ ...editData, contact: e.target.value })} className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm font-bold text-slate-700" placeholder="연락처" />
                                    </div>
                                </div>

                                {/* Width 100% Sections */}
                                <div className="space-y-4">
                                    <div className="space-y-1">
                                        <label className="text-xs font-black text-slate-500 uppercase">상담 제목</label>
                                        <input type="text" value={editData.title} onChange={e => setEditData({ ...editData, title: e.target.value })} className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm font-black text-slate-800 placeholder-slate-400 bg-white" placeholder="상담 내용을 요약해주세요" />
                                    </div>

                                    <div className="space-y-1">
                                        <div className="flex justify-between items-center">
                                            <label className="text-xs font-black text-slate-500 uppercase">상담 상세 내용</label>
                                            <button type="button" onClick={handleGetAiAdvisor} className="bg-gradient-to-br from-indigo-500 to-purple-600 text-white px-3 py-1 rounded-lg text-xs font-black flex items-center gap-1 hover:shadow-lg hover:shadow-indigo-200 transition-all">
                                                <span className="material-symbols-rounded text-sm">psychology</span> AI 상담 조언 받기
                                            </button>
                                        </div>
                                        <textarea value={editData.content} onChange={e => setEditData({ ...editData, content: e.target.value })} rows="4" className="w-full bg-white border border-slate-200 rounded-xl p-4 text-sm font-medium text-slate-600 resize-none highlight-focus" placeholder="문의하신 상세 내용을 입력하세요."></textarea>
                                    </div>

                                    {/* AI Advisor Card */}
                                    {aiAdvisor && (
                                        <div className="bg-purple-50 border border-purple-100 rounded-xl p-4 space-y-3 animate-in fade-in slide-in-from-top-4">
                                            <div className="flex items-center gap-2 text-purple-700">
                                                <span className="material-symbols-rounded">magic_button</span>
                                                <h4 className="text-xs font-black uppercase">Jenny's AI 상담 가이드</h4>
                                            </div>
                                            <div className="space-y-2 text-sm text-slate-700 bg-white/60 p-3 rounded-lg border border-purple-100/50">
                                                <div className="flex gap-2">
                                                    <span className="font-bold shrink-0 w-12 text-purple-600">분석</span>
                                                    <span>{aiAdvisor.analysis}</span>
                                                </div>
                                                <div className="flex gap-2">
                                                    <span className="font-bold shrink-0 w-12 text-blue-600">전략</span>
                                                    <span>{aiAdvisor.strategy}</span>
                                                </div>
                                                <div className="flex gap-2">
                                                    <span className="font-bold shrink-0 w-12 text-emerald-600">답변</span>
                                                    <span className="italic">"{aiAdvisor.recommended_answer}"</span>
                                                </div>
                                                <div className="flex gap-2 text-rose-600 font-bold bg-rose-50 p-1.5 rounded">
                                                    <span className="shrink-0 w-12">주의</span>
                                                    <span>{aiAdvisor.caution_points}</span>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* Answer Section */}
                                    {/* Answer Section */}
                                    {editData.consult_id && (
                                        <div className="pt-6 border-t border-slate-200">
                                            <div className="space-y-4">
                                                <label className="text-sm font-black text-indigo-600 flex items-center gap-2">
                                                    <span className="material-symbols-rounded">check_circle</span> 처리 결과 및 답변
                                                    {aiAdvisor && (
                                                        <button type="button" onClick={() => setEditData({ ...editData, answer: aiAdvisor.recommended_answer })} className="ml-auto text-xs bg-emerald-100 text-emerald-600 px-2 py-0.5 rounded font-bold hover:bg-emerald-200">
                                                            AI 답변 적용
                                                        </button>
                                                    )}
                                                </label>
                                                <textarea value={editData.answer || ''} onChange={e => setEditData({ ...editData, answer: e.target.value })} rows="3" className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm font-medium text-slate-700 resize-none focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all" placeholder="처리 결과 입력"></textarea>

                                                <div className="grid grid-cols-2 gap-8">
                                                    <div className="space-y-1">
                                                        <label className="text-xs font-black text-slate-500 uppercase">진행 상태</label>
                                                        <select value={editData.status} onChange={e => setEditData({ ...editData, status: e.target.value })} className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm font-bold text-slate-700 bg-white">
                                                            <option value="접수">접수</option>
                                                            <option value="처리중">처리중</option>
                                                            <option value="완료">완료</option>
                                                            <option value="보류">보류</option>
                                                        </select>
                                                    </div>
                                                    <div className="space-y-1">
                                                        <label className="text-xs font-black text-slate-500 uppercase">재연락 예정일</label>
                                                        <input type="date" value={editData.follow_up_date || ''} onChange={e => setEditData({ ...editData, follow_up_date: e.target.value })} className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm font-bold text-slate-700 bg-white" />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </form>
                        </div>

                        {/* Footer Actions */}
                        <div className="p-5 border-t border-slate-200 bg-white flex justify-between shrink-0">
                            {editData.consult_id ? (
                                <button type="button" onClick={handleDelete} className="h-10 px-5 rounded-xl bg-rose-50 text-rose-600 font-bold hover:bg-rose-100 transition-colors flex items-center gap-2">
                                    <span className="material-symbols-rounded">delete</span> 삭제
                                </button>

                            ) : <div></div>}


                            <div className="flex gap-3">
                                <button onClick={() => setIsModalOpen(false)} className="h-10 px-6 rounded-xl bg-white border border-slate-200 text-slate-500 font-bold hover:bg-slate-50 transition-colors">닫기</button>
                                <button onClick={handleSave} className="h-10 px-8 rounded-xl bg-indigo-600 text-white font-black hover:bg-indigo-500 transition-colors shadow-lg shadow-indigo-200 flex items-center gap-2">
                                    <span className="material-symbols-rounded">check</span> 저장
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )
            }

            {/* Customer Selection Modal */}
            {
                showSelectModal && (
                    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in">
                        <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden animate-in zoom-in-95">
                            <div className="px-5 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                                <h3 className="font-bold text-slate-800">고객 검색 결과</h3>
                                <button onClick={() => setShowSelectModal(false)} className="text-slate-400 hover:text-slate-600">
                                    <span className="material-symbols-rounded">close</span>
                                </button>
                            </div>
                            <div className="max-h-[400px] overflow-y-auto p-2">
                                {customerSearchResults.map(cust => (
                                    <div key={cust.customer_id} onClick={() => handleSelectCustomer(cust)} className="p-3 hover:bg-indigo-50 rounded-xl cursor-pointer transition-colors border-b border-slate-50 last:border-0 group">
                                        <div className="flex justify-between items-center mb-1">
                                            <div className="font-bold text-slate-700 flex items-center gap-2">
                                                {cust.customer_name}
                                                <span className={`text-[10px] px-1.5 py-0.5 rounded ${cust.level === 'VIP' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>{cust.level}</span>
                                            </div>
                                            <div className="text-xs font-bold text-indigo-600">{cust.mobile_number}</div>
                                        </div>
                                        <div className="text-xs text-slate-400 truncate">{cust.address_primary} {cust.address_detail}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Loading Indicator for AI Overlay */}
            {
                isAiLoading && (
                    <div className="fixed inset-0 z-[300] bg-black/20 backdrop-blur-[2px] flex items-center justify-center cursor-wait">
                        <div className="bg-white px-6 py-4 rounded-2xl shadow-xl flex items-center gap-4 animate-bounce-custom">
                            <span className="material-symbols-rounded text-3xl text-indigo-500 animate-spin">sync</span>
                            <div className="text-sm font-bold text-slate-700">AI가 분석 중입니다...</div>
                        </div>
                    </div>
                )
            }
        </div >
    );
};

export default CustomerConsultation;

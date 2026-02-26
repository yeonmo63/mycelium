import React, { useState, useEffect, useRef } from 'react';
import { Lock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useModal } from '../../contexts/ModalContext';
import { useAdminGuard } from '../../hooks/useAdminGuard';
import { invoke } from '../../utils/apiBridge';

const EventMgmt = () => {
    const navigate = useNavigate();
    const { showAlert, showConfirm } = useModal();
    const { isAuthorized, checkAdmin, isVerifying } = useAdminGuard();

    // State
    const [events, setEvents] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    // Modal
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [form, setForm] = useState({
        id: '',
        name: '',
        organizer: '',
        manager: '',
        location: '',
        start: new Date().toISOString().split('T')[0],
        end: '',
        memo: ''
    });

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
            loadEvents();
        }
    }, [isAuthorized]);

    const loadEvents = async (query = '') => {
        setIsLoading(true);
        try {
            const data = await invoke('get_all_events', { query });
            setEvents(data || []);
        } catch (e) {
            console.error(e);
            showAlert("오류", "데이터 로드 실패: " + e.message || e);
            setEvents([]);
        } finally {
            setIsLoading(false);
        }
    };

    // --- Actions ---
    const handleSearch = () => {
        loadEvents(searchQuery);
    };

    const handleOpenModal = (event = null) => {
        if (event) {
            setForm({
                id: event.event_id,
                name: event.event_name,
                organizer: event.organizer || '',
                manager: event.manager_name || '',
                location: event.location_address || '',
                start: event.start_date || '',
                end: event.end_date || '',
                memo: event.memo || ''
            });
        } else {
            setForm({
                id: '',
                name: '',
                organizer: '',
                manager: '',
                location: '',
                start: new Date().toISOString().split('T')[0],
                end: '',
                memo: ''
            });
        }
        setIsModalOpen(true);
    };

    const handleSave = async () => {
        if (!form.name.trim()) return showAlert("알림", "행사명은 필수입니다.");

        const isConfirm = await showConfirm("저장 확인", "수정 사항을 저장하시겠습니까?");
        if (!isConfirm) return;

        const payload = {
            event_id: form.id || null,
            event_name: form.name,
            organizer: form.organizer || null,
            manager_name: form.manager || null,
            manager_contact: null,
            location_address: form.location || null,
            location_detail: null,
            start_date: form.start || null,
            end_date: form.end || null,
            memo: form.memo || null
        };

        try {
            if (form.id) {
                await invoke('update_event', payload);
            } else {
                await invoke('create_event', payload);
            }

            setIsModalOpen(false);
            await showAlert("성공", form.id ? "수정되었습니다." : "등록되었습니다.");
            loadEvents(searchQuery);
        } catch (e) {
            console.error(e);
            showAlert("오류", "저장 실패: " + e);
        }
    };

    const handleDelete = async () => {
        if (!form.id) return;
        if (!await showConfirm("삭제 확인", "정말로 이 행사를 삭제하시겠습니까?\n(관련 판매 데이터가 있을 경우 삭제되지 않을 수 있습니다)")) return;

        try {
            await invoke('delete_event', { event_id: form.id });

            setIsModalOpen(false);
            await showAlert("성공", "삭제되었습니다.");
            loadEvents(searchQuery);
        } catch (e) {
            console.error(e);
            showAlert("오류", "삭제 실패: " + e);
        }
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
            {/* Top Navigation & Action Header */}
            <div className="px-6 lg:px-8 min-[2000px]:px-12 pt-6 lg:pt-8 min-[2000px]:pt-12 pb-2 bg-[#f8fafc]">
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <div className="flex items-center gap-2 mb-0.5">
                            <span className="w-6 h-1 bg-blue-600 rounded-full"></span>
                            <span className="text-[9px] font-black tracking-[0.2em] text-blue-600 uppercase">Event Location Management</span>
                        </div>
                        <h1 className="text-3xl font-black text-slate-600 tracking-tighter" style={{ fontFamily: '"Noto Sans KR", sans-serif' }}>
                            행사(특판)장 관리 <span className="text-slate-300 font-light ml-1 text-xl">Location Master</span>
                        </h1>
                    </div>
                </div>

                <div className="flex justify-end gap-3 items-center">
                    <div className="relative">
                        <span className="material-symbols-rounded absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg">search</span>
                        <input
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleSearch()}
                            className="pl-10 pr-4 h-11 w-64 bg-white border border-slate-200 rounded-xl text-sm font-bold focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all outline-none shadow-sm"
                            placeholder="행사명 검색..."
                        />
                    </div>
                    <button onClick={handleSearch} className="h-11 px-6 rounded-xl bg-white border border-slate-200 text-slate-600 font-bold text-sm hover:bg-slate-50 transition-all shadow-sm">조회</button>
                    <button onClick={() => handleOpenModal()} className="h-11 px-6 rounded-xl bg-blue-600 text-white font-bold text-sm hover:bg-blue-700 shadow-lg shadow-blue-200 transition-all flex items-center gap-2 active:scale-95">
                        <span className="material-symbols-rounded text-lg">add</span> 신규 등록
                    </button>
                </div>
            </div>

            <div className="flex-1 px-6 lg:px-8 min-[2000px]:px-12 pb-6 lg:pb-8 min-[2000px]:pb-12 mt-4 overflow-hidden">
                <div className="h-full bg-white rounded-[1.5rem] border border-slate-200 shadow-sm overflow-hidden flex flex-col relative">
                    <div className="flex-1 overflow-auto stylish-scrollbar">
                        <table className="w-full text-sm border-collapse table-fixed">
                            <thead className="bg-slate-50/80 backdrop-blur-md sticky top-0 z-10 border-b border-slate-200 shadow-sm">
                                <tr>
                                    <th className="px-5 py-4 w-[5%] text-center text-[10px] font-black uppercase text-slate-400 tracking-wider">No</th>
                                    <th className="px-5 py-4 w-[20%] text-left text-[10px] font-black uppercase text-slate-400 tracking-wider">행사명</th>
                                    <th className="px-5 py-4 w-[14%] text-left text-[10px] font-black uppercase text-slate-400 tracking-wider">주최사</th>
                                    <th className="px-5 py-4 w-[10%] text-left text-[10px] font-black uppercase text-slate-400 tracking-wider">담당자</th>
                                    <th className="px-5 py-4 w-[15%] text-left text-[10px] font-black uppercase text-slate-400 tracking-wider">장소</th>
                                    <th className="px-5 py-4 w-[18%] text-center text-[10px] font-black uppercase text-slate-400 tracking-wider">기간</th>
                                    <th className="px-5 py-4 w-[18%] text-left text-[10px] font-black uppercase text-slate-400 tracking-wider">메모</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {isLoading ? (
                                    <tr><td colSpan="7" className="p-10 text-center"><span className="material-symbols-rounded spin text-slate-400 text-2xl">sync</span></td></tr>
                                ) : events.length === 0 ? (
                                    <tr><td colSpan="7" className="p-10 text-center text-slate-400">등록된 행사가 없습니다.</td></tr>
                                ) : (
                                    events.map(ev => (
                                        <tr key={ev.event_id} onClick={() => handleOpenModal(ev)} className="hover:bg-blue-50/40 cursor-pointer transition-colors group">
                                            <td className="px-5 py-4 text-center text-slate-400 font-mono text-[11px]">{events.indexOf(ev) + 1}</td>
                                            <td className="px-5 py-4 font-bold text-slate-700 truncate" title={ev.event_name}>{ev.event_name}</td>
                                            <td className="px-5 py-4 text-slate-600 truncate" title={ev.organizer}>{ev.organizer || '-'}</td>
                                            <td className="px-5 py-4 text-slate-600 truncate" title={ev.manager_name}>{ev.manager_name || '-'}</td>
                                            <td className="px-5 py-4 text-slate-600 truncate" title={ev.location_address}>{ev.location_address || '-'}</td>
                                            <td className="px-5 py-4 text-center">
                                                <span className="bg-blue-50 text-blue-600 px-3 py-1 rounded-lg text-xs font-bold border border-blue-100">
                                                    {ev.start_date || '-'} ~ {ev.end_date || '-'}
                                                </span>
                                            </td>
                                            <td className="px-5 py-4 text-slate-500 truncate max-w-[200px]" title={ev.memo}>{ev.memo || '-'}</td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Modal - Enhanced UI */}
                {isModalOpen && (
                    <div className="modal flex fixed inset-0 z-50 items-center justify-center bg-black/60 backdrop-blur-md animate-in fade-in duration-300">
                        <div className="bg-white w-[850px] rounded-[2.5rem] shadow-2xl overflow-hidden p-0 border border-white/50 relative transform transition-all scale-100">
                            {/* Modal Header */}
                            <div className="bg-gradient-to-r from-slate-50 to-white p-8 border-b border-slate-100 flex justify-between items-center">
                                <div>
                                    <h3 className="text-2xl font-black text-slate-800 flex items-center gap-3">
                                        <span className="w-10 h-10 rounded-2xl bg-blue-100 text-blue-600 flex items-center justify-center shadow-sm">
                                            <span className="material-symbols-rounded text-2xl" aria-hidden="true">{form.id ? 'edit_calendar' : 'add_circle'}</span>
                                        </span>
                                        {form.id ? '행사 정보 수정' : '새 행사 등록'}
                                    </h3>
                                    <p className="text-slate-400 text-sm mt-1 ml-14 font-medium">행사(특판)장의 상세 정보를 입력하고 관리하세요.</p>
                                </div>
                                <button onClick={() => setIsModalOpen(false)} className="w-10 h-10 rounded-full bg-slate-100 text-slate-400 hover:bg-slate-200 hover:text-slate-600 flex items-center justify-center transition-all">
                                    <span className="material-symbols-rounded text-xl">close</span>
                                </button>
                            </div>

                            {/* Modal Content */}
                            <div className="p-8 bg-slate-50/50">
                                <div className="grid grid-cols-12 gap-6">
                                    {/* Left Section: Basic Info */}
                                    <div className="col-span-7 space-y-5">
                                        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4">
                                            <div className="flex items-center gap-2 mb-2">
                                                <span className="w-1 h-4 bg-blue-500 rounded-full"></span>
                                                <span className="text-xs font-black text-slate-400 uppercase tracking-widest">기본 및 담당자 정보</span>
                                            </div>

                                            <div>
                                                <label htmlFor="event-name" className="text-[11px] font-bold text-slate-500 uppercase mb-1.5 block ml-1">행사명 <span className="text-red-500">*</span></label>
                                                <input
                                                    id="event-name"
                                                    value={form.name}
                                                    onChange={e => setForm({ ...form, name: e.target.value })}
                                                    className="w-full h-12 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-800 px-4 focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all text-sm shadow-inner"
                                                    placeholder="행사 명칭을 입력하세요"
                                                    autoFocus
                                                />
                                            </div>

                                            <div className="grid grid-cols-2 gap-4">
                                                <div>
                                                    <label htmlFor="event-organizer" className="text-[11px] font-bold text-slate-500 uppercase mb-1.5 block ml-1">주최/주관사</label>
                                                    <input
                                                        id="event-organizer"
                                                        value={form.organizer}
                                                        onChange={e => setForm({ ...form, organizer: e.target.value })}
                                                        className="w-full h-11 bg-white border border-slate-200 rounded-xl font-bold text-slate-700 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all px-4 text-sm"
                                                        placeholder="주최 기관"
                                                    />
                                                </div>
                                                <div>
                                                    <label htmlFor="event-manager" className="text-[11px] font-bold text-slate-500 uppercase mb-1.5 block ml-1">현장 담당자</label>
                                                    <input
                                                        id="event-manager"
                                                        value={form.manager}
                                                        onChange={e => setForm({ ...form, manager: e.target.value })}
                                                        className="w-full h-11 bg-white border border-slate-200 rounded-xl font-bold text-slate-700 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all px-4 text-sm"
                                                        placeholder="담당자 성함"
                                                    />
                                                </div>
                                            </div>

                                            <div>
                                                <label className="text-[11px] font-bold text-slate-500 uppercase mb-1.5 block ml-1">장소 및 상세 위치</label>
                                                <div className="relative">
                                                    <span className="material-symbols-rounded absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg">location_on</span>
                                                    <input
                                                        value={form.location}
                                                        onChange={e => setForm({ ...form, location: e.target.value })}
                                                        className="w-full h-11 bg-white border border-slate-200 rounded-xl font-bold text-slate-700 pl-10 pr-4 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all text-sm"
                                                        placeholder="행사장 주소 또는 설치 위치"
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Right Section: Schedule & Memo */}
                                    <div className="col-span-5 space-y-5">
                                        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4 h-full">
                                            <div className="flex items-center gap-2 mb-2">
                                                <span className="w-1 h-4 bg-blue-500 rounded-full"></span>
                                                <span className="text-xs font-black text-slate-400 uppercase tracking-widest">운영 일정 및 메모</span>
                                            </div>

                                            <div className="space-y-4">
                                                <div>
                                                    <label className="text-[11px] font-bold text-slate-500 uppercase mb-1.5 block ml-1">행사 시작일</label>
                                                    <input
                                                        type="date"
                                                        value={form.start}
                                                        onChange={e => setForm({ ...form, start: e.target.value })}
                                                        className="w-full h-11 bg-white border border-slate-200 rounded-xl font-bold text-slate-700 px-4 focus:border-blue-500 transition-all text-sm"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="text-[11px] font-bold text-slate-500 uppercase mb-1.5 block ml-1">행사 종료일</label>
                                                    <input
                                                        type="date"
                                                        value={form.end}
                                                        onChange={e => setForm({ ...form, end: e.target.value })}
                                                        className="w-full h-11 bg-white border border-slate-200 rounded-xl font-bold text-slate-700 px-4 focus:border-blue-500 transition-all text-sm"
                                                    />
                                                </div>
                                            </div>

                                            <div>
                                                <label className="text-[11px] font-bold text-slate-500 uppercase mb-1.5 block ml-1">특이사항 (메모)</label>
                                                <textarea
                                                    value={form.memo}
                                                    onChange={e => setForm({ ...form, memo: e.target.value })}
                                                    className="w-full h-24 bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm font-medium text-slate-600 focus:bg-white focus:border-blue-500 transition-all resize-none shadow-inner"
                                                    placeholder="행사 관련 주요 전달 사항을 입력하세요..."
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Modal Footer */}
                                <div className="flex justify-between items-center mt-8 border-t border-slate-200 pt-6">
                                    {form.id ? (
                                        <button
                                            onClick={handleDelete}
                                            className="h-12 px-6 rounded-2xl bg-red-50 text-red-500 font-bold hover:bg-red-100 transition-all text-sm flex items-center gap-2"
                                        >
                                            <span className="material-symbols-rounded">delete</span> 행사 삭제
                                        </button>
                                    ) : <div />}

                                    <div className="flex gap-3">
                                        <button
                                            onClick={() => setIsModalOpen(false)}
                                            className="h-12 px-8 rounded-2xl bg-white border border-slate-200 text-slate-500 font-bold hover:bg-slate-50 transition-colors text-sm"
                                        >
                                            취소
                                        </button>
                                        <button
                                            onClick={handleSave}
                                            className="h-12 px-10 rounded-2xl bg-blue-600 text-white font-bold hover:bg-blue-700 shadow-lg shadow-blue-200 transition-all hover:scale-105 active:scale-95 text-sm flex items-center gap-2"
                                        >
                                            <span className="material-symbols-rounded" aria-hidden="true">save</span>
                                            {form.id ? '수정 사항 저장' : '새 행사 등록하기'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default EventMgmt;

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { invoke } from '../../utils/apiBridge';
import dayjs from 'dayjs';
import 'dayjs/locale/ko';
import { useModal } from '../../contexts/ModalContext';
import {
    ChevronLeft,
    ChevronRight,
    Calendar as CalendarIcon,
    Clock,
    MoreHorizontal,
    Plus,
    AlertCircle,
    CalendarDays,
    Trash2,
    X,
    CheckCircle2,
    Info
} from 'lucide-react';

// Set locale globally for this component
dayjs.locale('ko');

const ScheduleMgmt = () => {
    const { showAlert, showConfirm } = useModal();

    // --- State Management ---
    const [currentMonth, setCurrentMonth] = useState(dayjs());
    const [selectedDate, setSelectedDate] = useState(dayjs());
    const [schedules, setSchedules] = useState([]);
    const [isLoading, setIsLoading] = useState(false);

    // Modal State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingSchedule, setEditingSchedule] = useState(null);
    const [formData, setFormData] = useState({
        title: '',
        description: '',
        startTime: '',
        endTime: '',
        status: 'Planned'
    });

    // --- Data Loading ---
    const loadSchedules = useCallback(async () => {
        setIsLoading(true);
        try {
            const startOfMonth = currentMonth.startOf('month');
            const endOfMonth = currentMonth.endOf('month');
            const startDay = startOfMonth.startOf('week');
            const endDay = endOfMonth.endOf('week');

            const sDate = startDay.format('YYYY-MM-DDTHH:mm:ss');
            const eDate = endDay.format('YYYY-MM-DDTHH:mm:ss');

            const data = await invoke('get_schedules', { startDate: sDate, endDate: eDate });
            setSchedules(data || []);
        } catch (err) {
            console.error("Failed to fetch schedules:", err);
            // Don't show alert on every month change if it fails silently once, but good for debugging
        } finally {
            setIsLoading(false);
        }
    }, [currentMonth]);

    useEffect(() => {
        loadSchedules();
    }, [loadSchedules]);

    // --- Handlers ---
    const handlePrevMonth = () => setCurrentMonth(prev => prev.subtract(1, 'month'));
    const handleNextMonth = () => setCurrentMonth(prev => prev.add(1, 'month'));
    const handleToday = () => {
        const today = dayjs();
        setCurrentMonth(today);
        setSelectedDate(today);
    };

    const handleDayClick = (date) => {
        setSelectedDate(date);
    };

    const openModal = (schedule = null) => {
        if (schedule) {
            setEditingSchedule(schedule);
            setFormData({
                title: schedule.title,
                description: schedule.description || '',
                startTime: dayjs(schedule.start_time).format('YYYY-MM-DDTHH:mm'),
                endTime: dayjs(schedule.end_time).format('YYYY-MM-DDTHH:mm'),
                status: schedule.status || 'Planned'
            });
        } else {
            setEditingSchedule(null);
            const now = selectedDate.hour(dayjs().hour()).minute(dayjs().minute());
            setFormData({
                title: '',
                description: '',
                startTime: now.format('YYYY-MM-DDTHH:mm'),
                endTime: now.add(1, 'hour').format('YYYY-MM-DDTHH:mm'),
                status: 'Planned'
            });
        }
        setIsModalOpen(true);
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setEditingSchedule(null);
    };

    const handleSaveSchedule = async (e) => {
        e.preventDefault();

        if (!formData.title || !formData.startTime || !formData.endTime) {
            showAlert('필수 입력', '제목과 시간은 필수입니다.');
            return;
        }

        try {
            if (editingSchedule) {
                await invoke('update_schedule', {
                    schedule_id: editingSchedule.schedule_id,
                    title: formData.title,
                    description: formData.description,
                    start_time: dayjs(formData.startTime).format('YYYY-MM-DDTHH:mm:ss'),
                    end_time: dayjs(formData.endTime).format('YYYY-MM-DDTHH:mm:ss'),
                    status: formData.status
                });
            } else {
                await invoke('create_schedule', {
                    title: formData.title,
                    description: formData.description,
                    start_time: dayjs(formData.startTime).format('YYYY-MM-DDTHH:mm:ss'),
                    end_time: dayjs(formData.endTime).format('YYYY-MM-DDTHH:mm:ss'),
                    status: formData.status
                });
            }
            closeModal();
            loadSchedules();
        } catch (err) {
            console.error("Save failed:", err);
            showAlert('저장 실패', '오류가 발생했습니다: ' + err);
        }
    };

    const handleDeleteSchedule = async (id) => {
        if (!await showConfirm('일정 삭제', '정말로 이 일정을 삭제하시겠습니까?')) return;

        try {
            await invoke('delete_schedule', { schedule_id: id });
            closeModal();
            loadSchedules();
        } catch (err) {
            showAlert('삭제 실패', '오류가 발생했습니다: ' + err);
        }
    };

    // --- Memoized Values ---
    const calendarDays = useMemo(() => {
        const startOfMonth = currentMonth.startOf('month');
        const startDay = startOfMonth.startOf('week');
        const endDay = currentMonth.endOf('month').endOf('week');

        const days = [];
        let curr = startDay;
        while (curr.isBefore(endDay) || curr.isSame(endDay, 'day')) {
            days.push(curr);
            curr = curr.add(1, 'day');
        }
        return days;
    }, [currentMonth]);

    const selectedDayEvents = useMemo(() => {
        return schedules.filter(ev => {
            const s = dayjs(ev.start_time).startOf('day');
            const e = dayjs(ev.end_time).endOf('day');
            return selectedDate.isSame(s, 'day') ||
                (selectedDate.isAfter(s) && selectedDate.isBefore(e)) ||
                selectedDate.isSame(e, 'day');
        }).sort((a, b) => dayjs(a.start_time).valueOf() - dayjs(b.start_time).valueOf());
    }, [schedules, selectedDate]);

    const monthEventCount = useMemo(() => {
        return schedules.filter(ev => dayjs(ev.start_time).month() === currentMonth.month()).length;
    }, [schedules, currentMonth]);

    // Helper for event status classes
    const getStatusClass = (status) => {
        switch (status?.toLowerCase()) {
            case 'planned': return 'bg-sky-50 text-sky-600 border-sky-100';
            case 'inprogress': return 'bg-amber-50 text-amber-600 border-amber-100';
            case 'completed': return 'bg-emerald-50 text-emerald-600 border-emerald-100';
            case 'important': return 'bg-rose-50 text-rose-600 border-rose-100';
            default: return 'bg-slate-50 text-slate-600 border-slate-100';
        }
    };

    const getStatusDotClass = (status) => {
        switch (status?.toLowerCase()) {
            case 'planned': return 'bg-sky-500';
            case 'inprogress': return 'bg-amber-500';
            case 'completed': return 'bg-emerald-500';
            case 'important': return 'bg-rose-500';
            default: return 'bg-slate-500';
        }
    };

    return (
        <div className="flex flex-col h-screen bg-[#f8fafc] overflow-hidden animate-in fade-in duration-700">
            {/* Header (Matching SalesReception styling) */}
            <div className="px-6 lg:px-8 min-[2000px]:px-12 pt-6 lg:pt-8 min-[2000px]:pt-12 pb-4">
                <div className="flex justify-between items-end">
                    <div>
                        <div className="flex items-center gap-2 mb-0.5">
                            <span className="w-6 h-1 bg-indigo-600 rounded-full"></span>
                            <span className="text-[9px] font-black tracking-[0.2em] text-indigo-600 uppercase">Farm Operation Management</span>
                        </div>
                        <h1 className="text-3xl font-black text-slate-600 tracking-tighter" style={{ fontFamily: '"Noto Sans KR", sans-serif' }}>
                            일정 관리 <span className="text-slate-300 font-light ml-1 text-xl">Schedule Management</span>
                        </h1>
                    </div>
                </div>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 px-6 lg:px-8 min-[2000px]:px-12 pb-8 overflow-hidden">
                <div className="flex flex-col lg:flex-row gap-6 h-full">

                    {/* LEFT: Calendar Grid */}
                    <div className="flex-[3] flex flex-col bg-white rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-200 overflow-hidden ring-1 ring-slate-900/5">
                        {/* Calendar Header */}
                        <div className="px-8 py-6 flex items-center justify-between border-b border-slate-100 bg-white/50 backdrop-blur-sm sticky top-0 z-10">
                            <div className="flex items-center gap-6">
                                <h2 className="text-2xl font-black text-slate-800 tracking-tight">
                                    {currentMonth.format('YYYY. MM')}
                                </h2>
                                <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 shadow-inner">
                                    <button onClick={handlePrevMonth} className="p-1.5 hover:bg-white hover:text-indigo-600 hover:shadow-sm rounded-lg transition-all">
                                        <ChevronLeft size={18} />
                                    </button>
                                    <button onClick={handleNextMonth} className="p-1.5 hover:bg-white hover:text-indigo-600 hover:shadow-sm rounded-lg transition-all">
                                        <ChevronRight size={18} />
                                    </button>
                                    <div className="w-px h-4 bg-slate-300 mx-1"></div>
                                    <button onClick={handleToday} className="px-3 py-1 font-bold text-xs text-slate-600 hover:text-indigo-600 transition-colors uppercase tracking-wider">
                                        Today
                                    </button>
                                </div>
                            </div>

                            {/* Legend */}
                            <div className="hidden min-[1200px]:flex items-center gap-4">
                                {[
                                    { key: 'planned', label: '예정', color: 'bg-sky-500' },
                                    { key: 'inprogress', label: '진행', color: 'bg-amber-500' },
                                    { key: 'completed', label: '완료', color: 'bg-emerald-500' },
                                    { key: 'important', label: '중요', color: 'bg-rose-500' }
                                ].map(item => (
                                    <div key={item.key} className="flex items-center gap-1.5">
                                        <div className={`w-2 h-2 rounded-full ${item.color}`}></div>
                                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-tight">{item.label}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Calendar Grid Header */}
                        <div className="grid grid-cols-7 border-b border-slate-50 bg-slate-50/30 backdrop-blur-sm">
                            {['일', '월', '화', '수', '목', '금', '토'].map((day, idx) => (
                                <div key={day} className={`py-3 text-center text-[10px] font-black tracking-[0.2em] uppercase ${idx === 0 ? 'text-rose-500' : idx === 6 ? 'text-indigo-500' : 'text-slate-400'}`}>
                                    {day}
                                </div>
                            ))}
                        </div>

                        {/* Calendar Grid Body */}
                        <div className="flex-1 grid grid-cols-7 grid-rows-5 overflow-y-auto">
                            {calendarDays.map((day, idx) => {
                                const isSelected = day.isSame(selectedDate, 'day');
                                const isToday = day.isSame(dayjs(), 'day');
                                const isOtherMonth = day.month() !== currentMonth.month();
                                const dayEvents = schedules.filter(ev => {
                                    const s = dayjs(ev.start_time).startOf('day');
                                    const e = dayjs(ev.end_time).endOf('day');
                                    return day.isSame(s, 'day') || (day.isAfter(s) && day.isBefore(e)) || day.isSame(e, 'day');
                                }).sort((a, b) => dayjs(a.start_time).valueOf() - dayjs(b.start_time).valueOf());

                                return (
                                    <div
                                        key={idx}
                                        onClick={() => handleDayClick(day)}
                                        className={`min-h-[100px] p-2 border-b border-r border-slate-50 group hover:bg-indigo-50/30 transition-all cursor-pointer relative
                                            ${isOtherMonth ? 'bg-slate-50/50' : ''}
                                            ${isSelected ? 'bg-indigo-50/50 ring-1 ring-inset ring-indigo-100' : ''}
                                            ${idx % 7 === 6 ? 'border-r-0' : ''}
                                        `}
                                    >
                                        <div className="flex justify-between items-start mb-1.5">
                                            <span className={`text-xs font-black w-6 h-6 flex items-center justify-center rounded-lg transition-transform group-hover:scale-110
                                                ${isToday ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200' :
                                                    isSelected ? 'text-indigo-600' :
                                                        isOtherMonth ? 'text-slate-300' :
                                                            day.day() === 0 ? 'text-rose-500' :
                                                                day.day() === 6 ? 'text-indigo-500' : 'text-slate-500'}
                                            `}>
                                                {day.date()}
                                            </span>
                                        </div>

                                        {/* Day Events Bars */}
                                        <div className="space-y-1 overflow-hidden">
                                            {dayEvents.slice(0, 3).map(ev => (
                                                <div
                                                    key={ev.schedule_id}
                                                    onClick={(e) => { e.stopPropagation(); openModal(ev); }}
                                                    className={`px-1.5 py-0.5 rounded text-[9px] font-black truncate border transition-transform hover:scale-[1.02]
                                                        ${getStatusClass(ev.status)}
                                                    `}
                                                    title={ev.title}
                                                >
                                                    {ev.title}
                                                </div>
                                            ))}
                                            {dayEvents.length > 3 && (
                                                <div className="text-[9px] font-black text-slate-400 pl-1.5">+ {dayEvents.length - 3} 더보기</div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* RIGHT: Sidebar Detail Panel */}
                    <div className="flex-1 flex flex-col gap-6 lg:max-w-md h-full overflow-hidden">

                        {/* Selected Day Info */}
                        <div className="flex flex-col bg-white rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-200 p-8 ring-1 ring-slate-900/5 flex-1 overflow-hidden">
                            <div className="mb-8">
                                <div className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-2">Selected Date</div>
                                <div className="text-sm font-black text-indigo-600 mb-1">{selectedDate.format('YYYY년 M월 D일')}</div>
                                <h3 className="text-2xl font-black text-slate-800 tracking-tight">{selectedDate.format('dddd')} 일정</h3>
                            </div>

                            {/* Events List */}
                            <div className="flex-1 overflow-y-auto pr-2 space-y-4 scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent">
                                {selectedDayEvents.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center py-12 text-slate-300 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
                                        <CalendarDays size={48} className="mb-3 opacity-20" />
                                        <p className="text-xs font-bold uppercase tracking-widest text-slate-400">일정이 없습니다</p>
                                    </div>
                                ) : (
                                    selectedDayEvents.map(ev => (
                                        <div
                                            key={ev.schedule_id}
                                            onClick={() => openModal(ev)}
                                            className="group relative bg-white border border-slate-100 hover:border-indigo-200 p-4 rounded-2xl hover:shadow-xl hover:shadow-indigo-500/10 transition-all cursor-pointer animate-in slide-in-from-right-4 duration-300"
                                        >
                                            <div className="flex items-start gap-4">
                                                <div className="flex flex-col items-center justify-center py-2 px-3 bg-slate-50 group-hover:bg-indigo-50 rounded-xl transition-colors min-w-[64px]">
                                                    <span className="text-[10px] font-black text-slate-400 group-hover:text-indigo-400 transition-colors">{dayjs(ev.start_time).format('HH:mm')}</span>
                                                    <div className="w-px h-2 bg-slate-200 my-1"></div>
                                                    <span className="text-[10px] font-black text-slate-400 group-hover:text-indigo-400 transition-colors">{dayjs(ev.end_time).format('HH:mm')}</span>
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <div className={`w-1.5 h-1.5 rounded-full ${getStatusDotClass(ev.status)}`}></div>
                                                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{ev.status || 'General'}</span>
                                                    </div>
                                                    <h4 className="text-sm font-black text-slate-700 truncate group-hover:text-indigo-600 transition-colors">{ev.title}</h4>
                                                    {ev.description && (
                                                        <p className="text-[11px] font-medium text-slate-400 line-clamp-1 mt-1">{ev.description}</p>
                                                    )}
                                                </div>
                                            </div>
                                            {ev.related_type === 'EXPERIENCE' && (
                                                <div className="absolute top-3 right-3">
                                                    <Info size={14} className="text-sky-400" />
                                                </div>
                                            )}
                                        </div>
                                    ))
                                )}
                            </div>

                            {/* Add Button */}
                            <div className="mt-8 pt-6 border-t border-slate-100">
                                <button
                                    onClick={() => openModal()}
                                    className="w-full h-14 bg-indigo-600 text-white rounded-2xl font-black text-sm flex items-center justify-center gap-2 hover:bg-indigo-500 shadow-lg shadow-indigo-200 transition-all active:scale-[0.98]"
                                >
                                    <Plus size={20} /> 새 일정 등록
                                </button>
                            </div>
                        </div>

                        {/* Quick Stats Card */}
                        <div className="bg-gradient-to-br from-indigo-600 to-purple-700 rounded-3xl p-8 text-white shadow-xl shadow-indigo-200/50">
                            <div className="flex justify-between items-start">
                                <div>
                                    <div className="text-[10px] font-black text-indigo-200 uppercase tracking-[0.2em] mb-1">Monthly Analytics</div>
                                    <div className="text-2xl font-black">{monthEventCount}건</div>
                                    <p className="text-[11px] font-bold text-indigo-100/70 mt-1 italic">이번 달 전체 일정 수</p>
                                </div>
                                <div className="w-12 h-12 bg-white/10 backdrop-blur-md rounded-2xl flex items-center justify-center border border-white/20">
                                    <CalendarIcon size={24} className="text-white" />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Schedule Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300" onClick={closeModal}></div>
                    <div className="relative bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 ring-1 ring-slate-900/10">
                        {/* Modal Header */}
                        <div className="px-10 py-8 bg-slate-50/50 border-b border-slate-100 flex items-center justify-between">
                            <div>
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="w-4 h-1 bg-indigo-600 rounded-full"></span>
                                    <span className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">
                                        {editingSchedule ? 'Edit Schedule' : 'New Schedule'}
                                    </span>
                                </div>
                                <h3 className="text-2xl font-black text-slate-800 tracking-tight">
                                    {editingSchedule ? '일정 상세 정보' : '새 일정 등록'}
                                </h3>
                            </div>
                            <button onClick={closeModal} className="w-10 h-10 rounded-2xl bg-white border border-slate-200 text-slate-400 flex items-center justify-center hover:bg-slate-100 hover:text-slate-600 transition-all shadow-sm">
                                <X size={20} />
                            </button>
                        </div>

                        {/* Modal Body */}
                        <form onSubmit={handleSaveSchedule} className="p-10 space-y-6">
                            {editingSchedule?.related_type === 'EXPERIENCE' && (
                                <div className="flex gap-3 bg-sky-50 p-4 rounded-2xl border border-sky-100 border-l-4 border-l-sky-500 animate-in slide-in-from-top-2">
                                    <div className="p-1 px-1.5">
                                        <AlertCircle size={18} className="text-sky-600" />
                                    </div>
                                    <div>
                                        <p className="text-xs font-black text-sky-800 mb-0.5">⚠️ 수정 불가 시스템 일정</p>
                                        <p className="text-[11px] font-bold text-sky-600 leading-relaxed">
                                            체험 예약으로 자동 생성된 일정입니다. 내용을 변경하시려면<br />
                                            <span className="font-black text-sky-700 underline underline-offset-2 cursor-pointer" onClick={() => { closeModal(); /* Navigate to Exp */ }}>[체험 프로그램 {'>'} 예약 현황]</span> 메뉴를 이용해주세요.
                                        </p>
                                    </div>
                                </div>
                            )}

                            <div>
                                <label htmlFor="title" className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-2">Title</label>
                                <div className="group relative">
                                    <input
                                        type="text"
                                        id="title"
                                        name="title"
                                        value={formData.title}
                                        onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                                        placeholder="일정 제목을 입력하세요"
                                        disabled={editingSchedule?.related_type === 'EXPERIENCE'}
                                        className="w-full h-12 px-5 bg-white border border-slate-200 rounded-xl font-bold text-sm focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all disabled:bg-slate-50 disabled:text-slate-400"
                                        required
                                    />
                                    <div className="absolute top-1/2 right-4 -translate-y-1/2 opacity-0 group-focus-within:opacity-100 transition-opacity">
                                        <CalendarIcon size={16} className="text-indigo-400" />
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label htmlFor="startTime" className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-2">Start At</label>
                                    <div className="relative">
                                        <input
                                            type="datetime-local"
                                            id="startTime"
                                            name="startTime"
                                            value={formData.startTime}
                                            onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                                            disabled={editingSchedule?.related_type === 'EXPERIENCE'}
                                            className="w-full h-12 px-5 bg-white border border-slate-200 rounded-xl font-bold text-xs focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all disabled:bg-slate-50 disabled:text-slate-400"
                                            required
                                        />
                                        <div className="absolute top-1/2 right-4 -translate-y-1/2 text-slate-300 pointer-events-none">
                                            <Clock size={16} />
                                        </div>
                                    </div>
                                </div>
                                <div>
                                    <label htmlFor="endTime" className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-2">End At</label>
                                    <div className="relative">
                                        <input
                                            type="datetime-local"
                                            id="endTime"
                                            name="endTime"
                                            value={formData.endTime}
                                            onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                                            disabled={editingSchedule?.related_type === 'EXPERIENCE'}
                                            className="w-full h-12 px-5 bg-white border border-slate-200 rounded-xl font-bold text-xs focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all disabled:bg-slate-50 disabled:text-slate-400"
                                            required
                                        />
                                        <div className="absolute top-1/2 right-4 -translate-y-1/2 text-slate-300 pointer-events-none">
                                            <Clock size={16} />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div>
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 ml-2">Status / Color</label>
                                <div className="flex flex-wrap gap-2">
                                    {[
                                        { id: 'Planned', label: '예정', color: 'bg-sky-500' },
                                        { id: 'InProgress', label: '진행', color: 'bg-amber-500' },
                                        { id: 'Completed', label: '완료', color: 'bg-emerald-500' },
                                        { id: 'Important', label: '중요', color: 'bg-rose-500' }
                                    ].map(item => (
                                        <label key={item.id} className="cursor-pointer">
                                            <input
                                                type="radio"
                                                name="status"
                                                value={item.id}
                                                checked={formData.status === item.id}
                                                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                                                disabled={editingSchedule?.related_type === 'EXPERIENCE'}
                                                className="peer hidden"
                                            />
                                            <div className={`px-4 py-2.5 rounded-xl border-2 font-black text-[10px] uppercase tracking-wider transition-all
                                                ${formData.status === item.id
                                                    ? 'border-indigo-600 bg-indigo-50 text-indigo-700 shadow-md transform scale-105'
                                                    : 'border-slate-100 bg-white text-slate-400 hover:border-slate-200'}
                                                peer-disabled:opacity-50 peer-disabled:cursor-not-allowed
                                            `}>
                                                <div className="flex items-center gap-2">
                                                    <div className={`w-1.5 h-1.5 rounded-full ${item.color}`}></div>
                                                    {item.label}
                                                </div>
                                            </div>
                                        </label>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <label htmlFor="description" className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-2">Description</label>
                                <textarea
                                    id="description"
                                    name="description"
                                    value={formData.description}
                                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                    placeholder="상세 내용을 입력하세요 (장소, 준비물 등)"
                                    disabled={editingSchedule?.related_type === 'EXPERIENCE'}
                                    rows={3}
                                    className="w-full p-5 bg-white border border-slate-200 rounded-2xl font-bold text-sm focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all resize-none disabled:bg-slate-50 disabled:text-slate-400"
                                />
                            </div>

                            {/* Footer Buttons */}
                            <div className="pt-6 flex gap-3 border-t border-slate-100">
                                {editingSchedule && editingSchedule.related_type !== 'EXPERIENCE' && (
                                    <button
                                        type="button"
                                        onClick={() => handleDeleteSchedule(editingSchedule.schedule_id)}
                                        className="h-12 w-12 flex items-center justify-center bg-rose-50 text-rose-500 rounded-xl hover:bg-rose-100 transition-all border border-rose-100"
                                    >
                                        <Trash2 size={20} />
                                    </button>
                                )}
                                <div className="flex-1"></div>
                                <button
                                    type="button"
                                    onClick={closeModal}
                                    className="h-12 px-8 bg-slate-100 text-slate-600 rounded-xl font-black text-xs hover:bg-slate-200 transition-all"
                                >
                                    취소
                                </button>
                                {editingSchedule?.related_type !== 'EXPERIENCE' && (
                                    <button
                                        type="submit"
                                        className="h-12 px-10 bg-indigo-600 text-white rounded-xl font-black text-xs hover:bg-indigo-500 shadow-lg shadow-indigo-200 transition-all flex items-center gap-2"
                                    >
                                        <CheckCircle2 size={16} /> {editingSchedule ? '수정 사항 저장' : '일정 등록 완료'}
                                    </button>
                                )}
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ScheduleMgmt;

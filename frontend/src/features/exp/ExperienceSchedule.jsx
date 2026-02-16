import React, { useState, useEffect, useCallback, useRef } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import listPlugin from '@fullcalendar/list';
import { invoke } from '../../utils/apiBridge';
import { useModal } from '../../contexts/ModalContext';
import { formatPhoneNumber, formatCurrency } from '../../utils/common';

const ExperienceSchedule = () => {
    const { showAlert, showConfirm } = useModal();
    const calendarRef = useRef(null);
    const [events, setEvents] = useState([]);
    const [loading, setLoading] = useState(false);

    // --- Detail Modal State ---
    const [selectedEvent, setSelectedEvent] = useState(null);
    const [isDetailOpen, setIsDetailOpen] = useState(false);

    const loadSchedule = useCallback(async () => {
        setLoading(true);
        try {
            // Load sufficient range (e.g., current month +/- 1 month) or fetch all for simplicity if dataset is small
            // Ideally, use calendar dates. For now, fetch generic range.
            const start = new Date();
            start.setMonth(start.getMonth() - 2);
            const end = new Date();
            end.setMonth(end.getMonth() + 3);

            const data = await invoke('get_experience_reservations', {
                startDate: start.toISOString().split('T')[0],
                endDate: end.toISOString().split('T')[0]
            });

            // Transform to FullCalendar Events
            const mappedEvents = data.map(r => {
                // Determine color based on status
                let bgColor = '#cbd5e1'; // slate-300 default
                let borderColor = '#94a3b8';

                if (r.status === '예약대기') { bgColor = '#f1f5f9'; borderColor = '#cbd5e1'; } // light gray - waiting
                else if (r.status === '예약완료') { bgColor = '#e0f2fe'; borderColor = '#7dd3fc'; } // sky - confirmed
                else if (r.status === '체험완료') { bgColor = '#d1fae5'; borderColor = '#6ee7b7'; } // emerald - completed
                else if (r.status === '예약취소') { bgColor = '#fef2f2'; borderColor = '#fecaca'; } // red - cancelled

                // If Paid, maybe a darker border or icon?
                const title = `[${r.guest_name}] ${r.program_name} (${r.participant_count}명)`;

                return {
                    id: r.reservation_id,
                    title: title,
                    start: `${r.reservation_date}T${r.reservation_time}`,
                    end: `${r.reservation_date}T${
                        // Add approx 2 hours duration for visualization
                        addHours(r.reservation_time, 2)
                        }`,
                    extendedProps: { ...r }, // Store full object
                    backgroundColor: bgColor,
                    borderColor: borderColor,
                    textColor: '#334155'
                };
            });

            setEvents(mappedEvents);
        } catch (err) {
            console.error('Schedule load failed:', err);
            showAlert('일정 로딩 실패', '예약 정보를 불러오지 못했습니다.');
        } finally {
            setLoading(false);
        }
    }, [showAlert]);

    // Helper to add hours to 'HH:mm' string
    const addHours = (timeStr, hours) => {
        const [h, m] = timeStr.split(':').map(Number);
        const d = new Date();
        d.setHours(h + hours);
        d.setMinutes(m);
        return d.toTimeString().slice(0, 5);
    };

    useEffect(() => {
        loadSchedule();
    }, [loadSchedule]);

    const handleEventClick = (info) => {
        const originalData = info.event.extendedProps;
        setSelectedEvent(originalData);
        setIsDetailOpen(true);
    };

    // --- Action Handlers (Reused from Status Page Logic) ---
    const handleUpdateStatus = async (status) => {
        if (!selectedEvent) return;
        try {
            await invoke('update_experience_status', {
                reservation_id: selectedEvent.reservation_id,
                status,
                append_memo: null
            });
            showAlert('상태 변경 완료', `[${status}] 상태로 변경되었습니다.`);
            setIsDetailOpen(false);
            loadSchedule(); // Refresh calendar
        } catch (err) {
            showAlert('오류', '상태 변경에 실패했습니다: ' + err);
        }
    };

    const handleUpdatePayment = async (status) => {
        if (!selectedEvent) return;
        try {
            await invoke('update_experience_payment_status', {
                reservation_id: selectedEvent.reservation_id,
                payment_status: status
            });
            showAlert('결제 처리 완료', '결제가 완료되었습니다.');
            setIsDetailOpen(false);
            loadSchedule();
        } catch (err) {
            showAlert('오류', '결제 처리에 실패했습니다: ' + err);
        }
    };

    const handleDelete = async () => {
        if (!selectedEvent) return;
        if (!await showConfirm('예약 삭제', '정말로 이 예약을 삭제하시겠습니까?')) return;

        try {
            await invoke('delete_experience_reservation', { reservation_id: selectedEvent.reservation_id });
            showAlert('삭제 완료', '예약이 삭제되었습니다.');
            setIsDetailOpen(false);
            loadSchedule();
        } catch (err) {
            showAlert('오류', '삭제 실패: ' + err);
        }
    };

    return (
        <div className="h-full flex flex-col p-6 lg:p-8 bg-slate-50 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between mb-6 flex-shrink-0">
                <div>
                    <h2 className="text-2xl font-black text-slate-800 tracking-tight">통합 일정 관리</h2>
                    <p className="text-xs text-slate-500 font-medium mt-1">체험 예약 및 농장 일정을 캘린더에서 한눈에 확인하고 관리하세요.</p>
                </div>
                <div className="flex gap-2">
                    <button onClick={loadSchedule} className="w-10 h-10 flex items-center justify-center bg-white border border-slate-200 rounded-xl text-slate-400 hover:text-indigo-600 hover:border-indigo-100 transition-all shadow-sm">
                        <span className="material-symbols-rounded">refresh</span>
                    </button>
                    <button onClick={() => window.location.href = '/exp/reservation-entry'} className="px-5 h-10 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-500 shadow-lg shadow-indigo-200 text-sm flex items-center gap-2">
                        <span className="material-symbols-rounded text-lg">add</span> 일정 등록
                    </button>
                </div>
            </div>

            {/* Calendar Container */}
            <div className="flex-1 bg-white rounded-[2rem] shadow-sm border border-slate-200 overflow-hidden p-2 relative z-0">
                <style>{`
                    .fc { font-family: 'Suit', sans-serif !important; }
                    .fc-toolbar-title { font-size: 1.25rem !important; font-weight: 800 !important; color: #1e293b; }
                    .fc-button-primary { background-color: #fff !important; color: #64748b !important; border: 1px solid #e2e8f0 !important; font-weight: 700 !important; }
                    .fc-button-primary:hover { background-color: #f8fafc !important; color: #334155 !important; }
                    .fc-button-active { background-color: #f1f5f9 !important; color: #4f46e5 !important; border-color: #cbd5e1 !important; }
                    .fc-daygrid-day-number { font-weight: 700; color: #64748b; }
                    .fc-col-header-cell-cushion { font-weight: 800; text-transform: uppercase; font-size: 0.75rem; padding-top: 10px; padding-bottom: 10px; color: #94a3b8; }
                    .fc-event { border-radius: 6px; padding: 2px 4px; font-size: 0.75rem; font-weight: 600; cursor: pointer; transition: transform 0.1s; }
                    .fc-event:hover { transform: scale(1.02); filter: brightness(0.95); }
                `}</style>
                <FullCalendar
                    ref={calendarRef}
                    plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin, listPlugin]}
                    initialView="dayGridMonth"
                    headerToolbar={{
                        left: 'prev,next today',
                        center: 'title',
                        right: 'dayGridMonth,timeGridWeek,listWeek'
                    }}
                    events={events}
                    eventClick={handleEventClick}
                    locale="ko"
                    dayMaxEvents={true}
                    height="100%"
                />
            </div>

            {/* Detail Modal (Smart Actions) */}
            {isDetailOpen && selectedEvent && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]" onClick={() => setIsDetailOpen(false)}></div>
                    <div className="relative bg-white w-full max-w-md rounded-[2rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                        {/* Modal Header */}
                        <div className="px-8 py-6 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                            <div className="flex flex-col">
                                <span className={`text-[10px] uppercase tracking-widest font-black mb-1
                                    ${selectedEvent.status === '예약완료' ? 'text-sky-500' :
                                        selectedEvent.status === '체험완료' ? 'text-emerald-500' :
                                            selectedEvent.status === '예약취소' ? 'text-rose-500' : 'text-slate-400'}`}>
                                    {selectedEvent.status}
                                </span>
                                <h3 className="text-xl font-black text-slate-800">{selectedEvent.guest_name}님 예약</h3>
                            </div>
                            <button onClick={() => setIsDetailOpen(false)} className="w-8 h-8 rounded-full bg-slate-200 text-slate-500 flex items-center justify-center hover:bg-slate-300 transition-all">
                                <span className="material-symbols-rounded text-lg">close</span>
                            </button>
                        </div>

                        {/* Modal Body */}
                        <div className="p-8 space-y-4">
                            <div className="flex justify-between items-center py-2 border-b border-slate-50">
                                <span className="text-xs font-bold text-slate-400">프로그램</span>
                                <span className="text-sm font-black text-slate-700">{selectedEvent.program_name}</span>
                            </div>
                            <div className="flex justify-between items-center py-2 border-b border-slate-50">
                                <span className="text-xs font-bold text-slate-400">일시</span>
                                <span className="text-sm font-black text-slate-700">{selectedEvent.reservation_date} {selectedEvent.reservation_time}</span>
                            </div>
                            <div className="flex justify-between items-center py-2 border-b border-slate-50">
                                <span className="text-xs font-bold text-slate-400">인원/금액</span>
                                <span className="text-sm font-black text-indigo-600">{selectedEvent.participant_count}명 / {formatCurrency(selectedEvent.total_amount)}원</span>
                            </div>
                            <div className="flex justify-between items-center py-2 border-b border-slate-50">
                                <span className="text-xs font-bold text-slate-400">결제상태</span>
                                <span className={`text-xs font-black px-2 py-1 rounded-md ${selectedEvent.payment_status === '결제완료' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-500'}`}>
                                    {selectedEvent.payment_status}
                                </span>
                            </div>
                            {selectedEvent.memo && (
                                <div className="bg-amber-50 p-3 rounded-xl border border-amber-100 mt-2">
                                    <p className="text-xs font-bold text-amber-700">{selectedEvent.memo}</p>
                                </div>
                            )}
                        </div>

                        {/* Smart Action Buttons (Same Logic as Status Page) */}
                        <div className="bg-slate-50 px-8 py-6 border-t border-slate-100">
                            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">빠른 처리 (QUICK ACTIONS)</h4>
                            <div className="grid grid-cols-2 gap-2">
                                {/* Confirm */}
                                {selectedEvent.status !== '예약취소' && selectedEvent.status !== '체험완료' && selectedEvent.status !== '예약완료' && (
                                    <button onClick={() => handleUpdateStatus('예약완료')} className="h-10 bg-white border border-slate-200 rounded-lg text-sky-600 font-bold text-xs hover:border-sky-200 hover:bg-sky-50 shadow-sm flex items-center justify-center gap-1">
                                        <span className="material-symbols-rounded text-base">check_circle</span> 예약 확정
                                    </button>
                                )}
                                {/* Payment */}
                                {selectedEvent.payment_status !== '결제완료' && selectedEvent.status !== '예약취소' && (
                                    <button onClick={() => handleUpdatePayment('결제완료')} className="h-10 bg-white border border-slate-200 rounded-lg text-indigo-600 font-bold text-xs hover:border-indigo-200 hover:bg-indigo-50 shadow-sm flex items-center justify-center gap-1">
                                        <span className="material-symbols-rounded text-base">credit_card</span> 결제 처리
                                    </button>
                                )}
                                {/* Cancel */}
                                {selectedEvent.status !== '체험완료' && selectedEvent.status !== '예약취소' && (
                                    <button onClick={() => handleUpdateStatus('예약취소')} className="h-10 bg-white border border-slate-200 rounded-lg text-orange-600 font-bold text-xs hover:border-orange-200 hover:bg-orange-50 shadow-sm flex items-center justify-center gap-1">
                                        <span className="material-symbols-rounded text-base">cancel</span> 예약 취소
                                    </button>
                                )}
                                {/* Complete */}
                                {selectedEvent.status === '예약완료' && selectedEvent.payment_status === '결제완료' && (
                                    <button onClick={() => handleUpdateStatus('체험완료')} className="h-10 bg-white border border-slate-200 rounded-lg text-emerald-600 font-bold text-xs hover:border-emerald-200 hover:bg-emerald-50 shadow-sm flex items-center justify-center gap-1">
                                        <span className="material-symbols-rounded text-base">task_alt</span> 체험 완료
                                    </button>
                                )}
                            </div>
                            {/* Delete is always available, spread full width if needed or just put below */}
                            <button onClick={handleDelete} className="w-full mt-2 h-10 bg-white border border-rose-100 rounded-lg text-rose-500 font-bold text-xs hover:bg-rose-50 shadow-sm flex items-center justify-center gap-1">
                                <span className="material-symbols-rounded text-base">delete</span> 예약 정보 삭제
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ExperienceSchedule;

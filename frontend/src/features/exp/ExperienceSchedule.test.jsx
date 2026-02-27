import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import ExperienceSchedule from './ExperienceSchedule';
import { ModalProvider, useModal } from '../../contexts/ModalContext';
import * as apiBridge from '../../utils/apiBridge';

// Mock apiBridge
vi.mock('../../utils/apiBridge', () => ({
    invoke: vi.fn()
}));

// Mock useModal
vi.mock('../../contexts/ModalContext', async () => {
    const actual = await vi.importActual('../../contexts/ModalContext');
    return {
        ...actual,
        useModal: vi.fn()
    };
});

// Mock FullCalendar
vi.mock('@fullcalendar/react', () => ({
    default: ({ events, eventClick }) => (
        <div data-testid="full-calendar">
            {events.map(e => (
                <div
                    key={e.id}
                    data-testid={`event-${e.id}`}
                    onClick={() => eventClick({ event: { extendedProps: e.extendedProps } })}
                >
                    {e.title}
                </div>
            ))}
        </div>
    )
}));

vi.mock('@fullcalendar/daygrid', () => ({ default: {} }));
vi.mock('@fullcalendar/timegrid', () => ({ default: {} }));
vi.mock('@fullcalendar/interaction', () => ({ default: {} }));
vi.mock('@fullcalendar/list', () => ({ default: {} }));

describe('ExperienceSchedule Component', () => {
    let user;
    const mockShowAlert = vi.fn();
    const mockShowConfirm = vi.fn().mockResolvedValue(true);

    const mockReservations = [
        {
            reservation_id: 'res-1',
            reservation_date: '2024-03-01',
            reservation_time: '10:00',
            program_name: '딸기 따기 체험',
            guest_name: '김철수',
            participant_count: 4,
            total_amount: 40000,
            status: '예약완료',
            payment_status: '결제완료',
            memo: '아이 동반'
        },
        {
            reservation_id: 'res-2',
            reservation_date: '2024-03-05',
            reservation_time: '14:00',
            program_name: '버섯 키우기',
            guest_name: '이영희',
            participant_count: 2,
            total_amount: 30000,
            status: '예약대기',
            payment_status: '미결제'
        }
    ];

    beforeEach(() => {
        user = userEvent.setup();
        vi.clearAllMocks();

        useModal.mockReturnValue({
            showAlert: mockShowAlert,
            showConfirm: mockShowConfirm
        });

        apiBridge.invoke.mockImplementation((cmd) => {
            if (cmd === 'get_experience_reservations') return Promise.resolve(mockReservations);
            return Promise.resolve({ success: true });
        });
    });

    it('renders header and initial calendar', async () => {
        render(<ExperienceSchedule />);

        expect(screen.getByText('통합 일정 관리')).toBeInTheDocument();
        expect(screen.getByTestId('full-calendar')).toBeInTheDocument();

        await waitFor(() => {
            expect(apiBridge.invoke).toHaveBeenCalledWith('get_experience_reservations', expect.any(Object));
        });

        expect(screen.getByText(/\[김철수\] 딸기 따기 체험 \(4명\)/)).toBeInTheDocument();
        expect(screen.getByText(/\[이영희\] 버섯 키우기 \(2명\)/)).toBeInTheDocument();
    });

    it('opens detail modal when an event is clicked', async () => {
        render(<ExperienceSchedule />);

        await waitFor(() => screen.getByText(/\[김철수\]/));

        const eventEl = screen.getByTestId('event-res-1');
        await user.click(eventEl);

        expect(screen.getByText('김철수님 예약')).toBeInTheDocument();
        expect(screen.getByText('딸기 따기 체험')).toBeInTheDocument();
        expect(screen.getByText('아이 동반')).toBeInTheDocument();
    });

    it('handles status update to "예약완료" from modal', async () => {
        render(<ExperienceSchedule />);

        await waitFor(() => screen.getByText(/\[이영희\]/));

        await user.click(screen.getByTestId('event-res-2'));

        const confirmBtn = screen.getByText('예약 확정');
        await user.click(confirmBtn);

        expect(apiBridge.invoke).toHaveBeenCalledWith('update_experience_status', {
            reservation_id: 'res-2',
            status: '예약완료',
            append_memo: null
        });

        await waitFor(() => {
            expect(mockShowAlert).toHaveBeenCalledWith('상태 변경 완료', expect.stringContaining('예약완료'));
        });
    });

    it('handles payment status update from modal', async () => {
        render(<ExperienceSchedule />);

        await waitFor(() => screen.getByText(/\[이영희\]/));

        await user.click(screen.getByTestId('event-res-2'));

        const payBtn = screen.getByText('결제 처리');
        await user.click(payBtn);

        expect(apiBridge.invoke).toHaveBeenCalledWith('update_experience_payment_status', {
            reservation_id: 'res-2',
            payment_status: '결제완료'
        });

        await waitFor(() => {
            expect(mockShowAlert).toHaveBeenCalledWith('결제 처리 완료', expect.any(String));
        });
    });

    it('handles reservation deletion', async () => {
        render(<ExperienceSchedule />);

        await waitFor(() => screen.getByText(/\[김철수\]/));

        await user.click(screen.getByTestId('event-res-1'));

        const deleteBtn = screen.getByText('예약 정보 삭제');
        await user.click(deleteBtn);

        expect(mockShowConfirm).toHaveBeenCalled();
        expect(apiBridge.invoke).toHaveBeenCalledWith('delete_experience_reservation', {
            reservation_id: 'res-1'
        });

        await waitFor(() => {
            expect(mockShowAlert).toHaveBeenCalledWith('삭제 완료', expect.any(String));
        });
    });

    it('refreshes schedule when refresh button is clicked', async () => {
        render(<ExperienceSchedule />);

        const refreshBtn = screen.getByRole('button', { name: /refresh/i });
        await user.click(refreshBtn);

        expect(apiBridge.invoke).toHaveBeenCalledTimes(2); // Initial load + refresh
    });
});

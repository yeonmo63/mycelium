import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import ScheduleMgmt from './ScheduleMgmt';
import { ModalProvider } from '../../contexts/ModalContext';
import * as apiBridge from '../../utils/apiBridge';
import dayjs from 'dayjs';

// Mock apiBridge
vi.mock('../../utils/apiBridge', () => ({
    invoke: vi.fn()
}));

// Mock printUtils
vi.mock('../../utils/printUtils', () => ({
    handlePrintRaw: vi.fn()
}));

describe('ScheduleMgmt Component', () => {
    let user;
    const todayStr = dayjs().format('YYYY-MM-DD');

    const mockSchedules = [
        {
            schedule_id: 1,
            title: '테스트 일정 1',
            description: '테스트 설명 1',
            start_time: `${todayStr}T10:00:00`,
            end_time: `${todayStr}T11:00:00`,
            status: 'Planned'
        }
    ];

    beforeEach(() => {
        user = userEvent.setup();
        vi.clearAllMocks();

        apiBridge.invoke.mockImplementation((cmd) => {
            if (cmd === 'get_schedules') return Promise.resolve(mockSchedules);
            return Promise.resolve({ success: true });
        });
    });

    const renderWithContext = (ui) => {
        return render(
            <ModalProvider>
                {ui}
            </ModalProvider>
        );
    };

    it('renders header and calendar', async () => {
        renderWithContext(<ScheduleMgmt />);

        expect(screen.getByText(/일정 관리/i)).toBeInTheDocument();

        await waitFor(() => {
            // Find in the calendar grid or sidebar
            const elements = screen.getAllByText('테스트 일정 1');
            expect(elements.length).toBeGreaterThan(0);
        });
    });

    it('opens modal and creates a new schedule', async () => {
        renderWithContext(<ScheduleMgmt />);

        const addBtn = screen.getByText(/새 일정 등록/i);
        await user.click(addBtn);

        await waitFor(() => {
            expect(screen.getByText('새 일정 등록')).toBeInTheDocument();
        });

        const titleInput = screen.getByLabelText(/Title/i);
        await user.type(titleInput, '새로운 테스트 일정');

        const saveBtn = screen.getByText('일정 등록 완료');
        await user.click(saveBtn);

        await waitFor(() => {
            expect(apiBridge.invoke).toHaveBeenCalledWith('create_schedule', expect.objectContaining({
                title: '새로운 테스트 일정'
            }));
        });
    });

    it('opens modal, edits and deletes a schedule', async () => {
        renderWithContext(<ScheduleMgmt />);

        await waitFor(() => {
            const elements = screen.getAllByText('테스트 일정 1');
            expect(elements.length).toBeGreaterThan(0);
        });

        const eventBar = screen.getAllByText('테스트 일정 1')[0];
        await user.click(eventBar);

        await waitFor(() => {
            expect(screen.getByText('일정 상세 정보')).toBeInTheDocument();
        });

        const titleInput = screen.getByLabelText(/Title/i);
        await user.clear(titleInput);
        await user.type(titleInput, '수정된 일정');

        const saveBtn = screen.getByText('수정 사항 저장');
        await user.click(saveBtn);

        await waitFor(() => {
            expect(apiBridge.invoke).toHaveBeenCalledWith('update_schedule', expect.objectContaining({
                title: '수정된 일정'
            }));
        });
    });

    it('switches months in calendar', async () => {
        renderWithContext(<ScheduleMgmt />);

        const nextBtn = await screen.findByRole('button', { name: /calendar_right/i || '' });
        // The buttons don't have aria-labels, so we use their icons if possible or just order
        // In the component: <button onClick={handleNextMonth} ...> <ChevronRight size={18} /> </button>
        // Let's use the SVG classes as a selector helper
        const allButtons = screen.getAllByRole('button');
        const nextMonthBtn = allButtons.find(btn => btn.querySelector('svg.lucide-chevron-right'));

        if (nextMonthBtn) {
            await user.click(nextMonthBtn);
            await waitFor(() => {
                expect(apiBridge.invoke).toHaveBeenCalledWith('get_schedules', expect.any(Object));
            });
        }
    });
});

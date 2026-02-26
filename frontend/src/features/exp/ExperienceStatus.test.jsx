import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import ExperienceStatus from './ExperienceStatus';
import { ModalProvider, useModal } from '../../contexts/ModalContext';
import * as apiBridge from '../../utils/apiBridge';

// Mock apiBridge
vi.mock('../../utils/apiBridge', () => ({
    invoke: vi.fn()
}));

// Mock printUtils
vi.mock('../../utils/printUtils', () => ({
    handlePrintRaw: vi.fn()
}));

// Mock useModal to control showConfirm
vi.mock('../../contexts/ModalContext', async () => {
    const actual = await vi.importActual('../../contexts/ModalContext');
    return {
        ...actual,
        useModal: vi.fn()
    };
});

describe('ExperienceStatus Component', () => {
    let user;
    const mockShowAlert = vi.fn();
    const mockShowConfirm = vi.fn().mockResolvedValue(true);

    const mockReservations = [
        {
            reservation_id: 1,
            reservation_date: '2024-01-01',
            reservation_time: '10:00:00',
            program_id: 1,
            program_name: '딸기 체험',
            guest_name: '홍길동',
            guest_contact: '01011112222',
            participant_count: 2,
            total_amount: 20000,
            status: '예약완료',
            payment_status: '결제완료'
        },
        {
            reservation_id: 2,
            reservation_date: '2024-01-02',
            reservation_time: '14:00:00',
            program_id: 2,
            program_name: '버섯 체험',
            guest_name: '이순신',
            guest_contact: '01033334444',
            participant_count: 3,
            total_amount: 45000,
            status: '예약대기',
            payment_status: '미결제'
        }
    ];

    const mockPrograms = [
        { program_id: 1, program_name: '딸기 체험', price_per_person: 10000 },
        { program_id: 2, program_name: '버섯 체험', price_per_person: 15000 }
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
            if (cmd === 'get_experience_programs') return Promise.resolve(mockPrograms);
            return Promise.resolve({ success: true });
        });
    });

    it('renders header and loads reservations', async () => {
        render(
            <ExperienceStatus />
        );

        expect(screen.getByText(/체험 예약 현황/i)).toBeInTheDocument();

        await waitFor(() => {
            expect(screen.getByText('홍길동')).toBeInTheDocument();
            expect(screen.getByText('이순신')).toBeInTheDocument();
        });
    });

    it('filters reservations by keyword', async () => {
        render(
            <ExperienceStatus />
        );

        await waitFor(() => screen.getByText('홍길동'));

        const keywordInput = screen.getByPlaceholderText(/이름 또는 전화번호 뒷자리/i);
        await user.type(keywordInput, '이순신');

        const searchBtn = screen.getByText('조회');
        await user.click(searchBtn);

        await waitFor(() => {
            expect(screen.queryByText('홍길동')).not.toBeInTheDocument();
            expect(screen.getByText('이순신')).toBeInTheDocument();
        });
    });

    it('opens edit modal and updates reservation', async () => {
        render(
            <ExperienceStatus />
        );

        await waitFor(() => screen.getByText('홍길동'));

        const checkboxes = screen.getAllByRole('checkbox');
        await user.click(checkboxes[1]); // Row for 홍길동

        const editBtn = screen.getByText(/정보 수정/i);
        await user.click(editBtn);

        expect(screen.getByText(/예약 정보 수정/i)).toBeInTheDocument();

        const nameInput = screen.getByLabelText(/예약자 성함/i);
        await user.clear(nameInput);
        await user.type(nameInput, '홍길동_수정');

        const saveBtn = screen.getByText(/설정 내용 저장/i);
        await user.click(saveBtn);

        await waitFor(() => {
            expect(apiBridge.invoke).toHaveBeenCalledWith('update_experience_reservation', expect.objectContaining({
                guest_name: '홍길동_수정'
            }));
        });
    });

    it('performs batch deletion', async () => {
        render(
            <ExperienceStatus />
        );

        await waitFor(() => screen.getByText('홍길동'));

        const selectAll = screen.getAllByRole('checkbox')[0];
        await user.click(selectAll);

        const deleteBtn = screen.getByText(/선택 삭제/i);
        await user.click(deleteBtn);

        await waitFor(() => {
            expect(mockShowConfirm).toHaveBeenCalled();
            expect(apiBridge.invoke).toHaveBeenCalledWith('delete_experience_reservation', expect.any(Object));
        });
    });
});

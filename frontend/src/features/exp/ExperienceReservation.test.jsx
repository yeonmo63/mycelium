import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import ExperienceReservation from './ExperienceReservation';
import { ModalProvider } from '../../contexts/ModalContext';
import * as apiBridge from '../../utils/apiBridge';

// Mock apiBridge
vi.mock('../../utils/apiBridge', () => ({
    invoke: vi.fn()
}));

describe('ExperienceReservation Component', () => {
    let user;

    const mockPrograms = [
        { program_id: 1, program_name: '딸기 따기 체험', price_per_person: 10000, is_active: true },
        { program_id: 2, program_name: '버섯 수확 체험', price_per_person: 15000, is_active: true }
    ];

    const mockCustomers = [
        { customer_id: 1, customer_name: '홍길동', mobile_number: '01011112222' }
    ];

    beforeEach(() => {
        user = userEvent.setup();
        vi.clearAllMocks();

        apiBridge.invoke.mockImplementation((cmd, args) => {
            if (cmd === 'get_experience_programs') return Promise.resolve(mockPrograms);
            if (cmd === 'search_customers_by_mobile' || cmd === 'search_customers_by_name') return Promise.resolve(mockCustomers);
            if (cmd === 'create_experience_reservation') return Promise.resolve({ success: true });
            return Promise.resolve([]);
        });
    });

    it('renders header and loads programs', async () => {
        render(
            <ModalProvider>
                <ExperienceReservation />
            </ModalProvider>
        );

        expect(screen.getByText(/체험 예약 접수/i)).toBeInTheDocument();

        await waitFor(() => {
            expect(screen.getByText(/딸기 따기 체험/)).toBeInTheDocument();
            expect(screen.getByText(/버섯 수확 체험/)).toBeInTheDocument();
        });
    });

    it('calculates total amount based on program and participant count', async () => {
        render(
            <ModalProvider>
                <ExperienceReservation />
            </ModalProvider>
        );

        const programSelect = await screen.findByLabelText(/프로그램 선택/i);
        await user.selectOptions(programSelect, '1'); // 딸기 따기 체험 (10,000원)

        const countInput = screen.getByLabelText(/참가 인원/i);
        await user.clear(countInput);
        await user.type(countInput, '3');

        expect(screen.getByText(/30,000/)).toBeInTheDocument();
    });

    it('searches and selects a customer', async () => {
        render(
            <ModalProvider>
                <ExperienceReservation />
            </ModalProvider>
        );

        const searchBtn = screen.getByText(/기존 고객 검색/i);
        await user.click(searchBtn);

        const searchInput = screen.getByPlaceholderText(/성함 또는 번호 입력 후 엔터/i);
        await user.type(searchInput, '홍길동{enter}');

        const customerRow = await screen.findByText('홍길동');
        await user.click(customerRow);

        expect(screen.getByDisplayValue('홍길동')).toBeInTheDocument();
        expect(screen.getByDisplayValue('01011112222')).toBeInTheDocument();
    });

    it('submits the form successfully', async () => {
        render(
            <ModalProvider>
                <ExperienceReservation />
            </ModalProvider>
        );

        // Fill required fields
        const programSelect = await screen.findByLabelText(/프로그램 선택/i);
        await user.selectOptions(programSelect, '1');

        await user.type(screen.getByLabelText(/성명 \/ 단체명/i), '테스트 예약자');
        await user.type(screen.getByLabelText(/연락처/i), '010-9999-8888');

        const submitBtn = screen.getByText(/예약 정보 저장/i);
        await user.click(submitBtn);

        await waitFor(() => {
            expect(apiBridge.invoke).toHaveBeenCalledWith('create_experience_reservation', expect.any(Object));
        });
    });
});

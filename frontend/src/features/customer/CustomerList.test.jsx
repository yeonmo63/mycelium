import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import CustomerList from './CustomerList';
import { ModalProvider } from '../../contexts/ModalContext';
import * as apiBridge from '../../utils/apiBridge';

vi.mock('../../utils/apiBridge', () => ({
    invoke: vi.fn(),
    callBridge: vi.fn()
}));

global.window.daum = { Postcode: vi.fn(() => ({ embed: vi.fn() })) };

describe('CustomerList Component', () => {
    let user;

    const mockCustomer = {
        customer_id: 'C100',
        customer_name: '홍길동',
        mobile_number: '010-1234-5678',
        membership_level: 'VIP',
        join_date: '2023-01-01',
        email: 'hong@example.com',
        zip_code: '12345',
        address_primary: '서울시 강남구',
        address_detail: '101호',
        status: '정상',
        marketing_consent: true
    };

    beforeEach(() => {
        user = userEvent.setup();
        vi.clearAllMocks();
        localStorage.clear();
    });

    it('renders search input and initial state', async () => {
        render(
            <ModalProvider>
                <CustomerList />
            </ModalProvider>
        );

        expect(screen.getByPlaceholderText(/이름 또는 전화번호 입력/i)).toBeInTheDocument();
        expect(screen.getByText(/조회 모드/i)).toBeInTheDocument();
    });

    it('searches and loads a single customer', async () => {
        apiBridge.invoke.mockImplementation((cmd) => {
            if (cmd === 'search_customers_by_name') return Promise.resolve([mockCustomer]);
            if (cmd === 'get_customer_addresses') return Promise.resolve([]);
            return Promise.resolve(null);
        });

        render(
            <ModalProvider>
                <CustomerList />
            </ModalProvider>
        );

        const searchInput = screen.getByPlaceholderText(/이름 또는 전화번호 입력/i);
        await user.type(searchInput, '홍길동{enter}');

        await waitFor(() => {
            expect(apiBridge.invoke).toHaveBeenCalledWith('search_customers_by_name', { query: '홍길동' });
        });

        expect(await screen.findByRole('textbox', { name: /성함/i })).toHaveValue('홍길동');
        expect(screen.getByDisplayValue('010-1234-5678')).toBeInTheDocument();
        expect(screen.getByDisplayValue('VIP')).toBeInTheDocument();
    });

    it('shows search results modal when multiple customers are found', async () => {
        const mockResults = [
            { ...mockCustomer, customer_id: 'C100', customer_name: '홍길동1' },
            { ...mockCustomer, customer_id: 'C101', customer_name: '홍길동2' }
        ];

        apiBridge.invoke.mockImplementation((cmd) => {
            if (cmd === 'search_customers_by_name') return Promise.resolve(mockResults);
            if (cmd === 'get_customer_addresses') return Promise.resolve([]);
            return Promise.resolve(null);
        });

        render(
            <ModalProvider>
                <CustomerList />
            </ModalProvider>
        );

        const searchInput = screen.getByPlaceholderText(/이름 또는 전화번호 입력/i);
        await user.type(searchInput, '홍길동{enter}');

        expect(await screen.findByText(/검색 결과 선택/i)).toBeInTheDocument();
        expect(screen.getByText('홍길동1')).toBeInTheDocument();
        expect(screen.getByText('홍길동2')).toBeInTheDocument();

        // Select one
        await user.click(screen.getByText('홍길동1'));
        expect(screen.queryByText(/검색 결과 선택/i)).not.toBeInTheDocument();
        expect(await screen.findByRole('textbox', { name: /성함/i })).toHaveValue('홍길동1');
    });

    it('switches to edit mode and updates customer info', async () => {
        apiBridge.invoke.mockImplementation((cmd) => {
            if (cmd === 'search_customers_by_name') return Promise.resolve([mockCustomer]);
            if (cmd === 'get_customer_addresses') return Promise.resolve([]);
            if (cmd === 'update_customer') return Promise.resolve({ success: true });
            if (cmd === 'get_customer') return Promise.resolve({ ...mockCustomer, customer_name: '홍길동 수정' });
            return Promise.resolve(null);
        });

        render(
            <ModalProvider>
                <CustomerList />
            </ModalProvider>
        );

        await user.type(screen.getByPlaceholderText(/이름 또는 전화번호 입력/i), '홍길동{enter}');
        await screen.findByRole('textbox', { name: /성함/i });

        const editBtn = screen.getByRole('button', { name: /고객 수정 모드/i });
        await user.click(editBtn);

        expect(screen.getByText(/수정 모드/i)).toBeInTheDocument();

        const nameInput = screen.getByRole('textbox', { name: /성함/i });
        await user.clear(nameInput);
        await user.type(nameInput, '홍길동 수정');

        const saveBtn = screen.getByRole('button', { name: /고객 정보 저장/i });
        await user.click(saveBtn);

        // Confirm modal
        const confirmBtn = await screen.findByRole('button', { name: /^확인$/ });
        await user.click(confirmBtn);

        await waitFor(() => {
            expect(apiBridge.invoke).toHaveBeenCalledWith('update_customer', expect.objectContaining({
                customerName: '홍길동 수정'
            }));
        });

        expect(await screen.findByText(/수정되었습니다/i)).toBeInTheDocument();
    });

    it('handles customer reactivation', async () => {
        const dormantCustomer = { ...mockCustomer, status: '말소' };
        apiBridge.invoke.mockImplementation((cmd) => {
            if (cmd === 'search_customers_by_name') return Promise.resolve([dormantCustomer]);
            if (cmd === 'get_customer_addresses') return Promise.resolve([]);
            if (cmd === 'reactivate_customer') return Promise.resolve({ success: true });
            if (cmd === 'get_customer') return Promise.resolve({ ...mockCustomer, status: '정상' });
            return Promise.resolve(null);
        });

        render(
            <ModalProvider>
                <CustomerList />
            </ModalProvider>
        );

        await user.type(screen.getByPlaceholderText(/이름 또는 전화번호 입력/i), '홍길동{enter}');
        // Match the badge specifically by using $ to ensure it's the end of text or more specific selector
        expect(await screen.findByText(/휴면 고객$/)).toBeInTheDocument();

        const reactivateBtn = screen.getByRole('button', { name: /정상 고객 복구/i });
        await user.click(reactivateBtn);

        const confirmBtn = await screen.findByRole('button', { name: /^확인$/ });
        await user.click(confirmBtn);

        await waitFor(() => {
            expect(apiBridge.invoke).toHaveBeenCalledWith('reactivate_customer', { customer_id: 'C100' });
        });

        expect(await screen.findByText(/정상 고객으로 전환되었습니다/i)).toBeInTheDocument();
    });
});

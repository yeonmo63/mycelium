import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import CustomerRegister from './CustomerRegister';
import { ModalProvider } from '../../contexts/ModalContext';
import * as apiBridge from '../../utils/apiBridge';

vi.mock('../../utils/apiBridge', () => ({
    invoke: vi.fn(),
    callBridge: vi.fn()
}));

global.window.daum = { Postcode: vi.fn(() => ({ embed: vi.fn() })) };

describe('CustomerRegister Component', () => {
    let user;

    beforeEach(() => {
        user = userEvent.setup();
        vi.clearAllMocks();
        localStorage.clear();
    });

    it('renders registration form', async () => {
        render(
            <ModalProvider>
                <CustomerRegister />
            </ModalProvider>
        );

        expect(screen.getByRole('heading', { name: /고객 등록/i })).toBeInTheDocument();
        expect(screen.getByPlaceholderText(/이름 입력/i)).toBeInTheDocument();
    });

    it('shows suggestions when typing a name', async () => {
        const mockSuggestions = [
            { customer_id: 'C100', customer_name: '홍길동', mobile_number: '010-1111-2222', status: '말소' }
        ];

        apiBridge.invoke.mockImplementation((cmd) => {
            if (cmd === 'search_customers_by_name') return Promise.resolve(mockSuggestions);
            return Promise.resolve([]);
        });

        render(
            <ModalProvider>
                <CustomerRegister />
            </ModalProvider>
        );

        const nameInput = screen.getByPlaceholderText(/이름 입력/i);
        await user.type(nameInput, '홍길동');

        await waitFor(() => {
            expect(screen.getByText(/이미 등록된 비슷한 이름/i)).toBeInTheDocument();
            expect(screen.getByText('010-1111-2222')).toBeInTheDocument();
        });
    });

    it('loads customer data from suggestion', async () => {
        const mockSuggestions = [
            { customer_id: 'C100', customer_name: '홍길동', mobile_number: '010-1111-2222', status: '말소', membership_level: 'VIP' }
        ];

        apiBridge.invoke.mockImplementation((cmd) => {
            if (cmd === 'search_customers_by_name') return Promise.resolve(mockSuggestions);
            return Promise.resolve([]);
        });

        render(
            <ModalProvider>
                <CustomerRegister />
            </ModalProvider>
        );

        const nameInput = screen.getByPlaceholderText(/이름 입력/i);
        await user.type(nameInput, '홍길동');

        const suggestion = await screen.findByText('010-1111-2222');
        await user.click(suggestion);

        // Confirm loading
        const confirmBtn = await screen.findByRole('button', { name: /^확인$/ });
        await user.click(confirmBtn);

        await waitFor(() => {
            expect(screen.getByDisplayValue('010-1111-2222')).toBeInTheDocument();
            expect(screen.getByDisplayValue('VIP')).toBeInTheDocument();
        });
    });

    it('submits a new customer registration', async () => {
        apiBridge.invoke.mockImplementation((cmd) => {
            if (cmd === 'search_customers_by_name') return Promise.resolve([]);
            if (cmd === 'search_customers_by_mobile') return Promise.resolve([]);
            if (cmd === 'create_customer') return Promise.resolve({ success: true });
            return Promise.resolve([]);
        });

        render(
            <ModalProvider>
                <CustomerRegister />
            </ModalProvider>
        );

        await user.type(screen.getByPlaceholderText(/이름 입력/i), '뉴고객');
        await user.type(screen.getByPlaceholderText(/010-0000-0000/i), '010-9999-8888');

        const submitBtn = screen.getByRole('button', { name: /고객 등록/i });
        await user.click(submitBtn);

        // Confirmation modal
        const confirmBtn = await screen.findByRole('button', { name: /^확인$/ });
        await user.click(confirmBtn);

        await waitFor(() => {
            expect(apiBridge.invoke).toHaveBeenCalledWith('create_customer', expect.objectContaining({
                customerName: '뉴고객',
                mobileNumber: '010-9999-8888'
            }));
        });

        expect(await screen.findByText(/고객이 성공적으로 등록되었습니다/i)).toBeInTheDocument();
    });

    it('triggers duplicate warning and handles registration after duplicate check', async () => {
        const mockDups = [
            { customer_id: 'C200', customer_name: '홍길동', mobile_number: '010-5555-6666', status: '정상' }
        ];

        apiBridge.invoke.mockImplementation((cmd) => {
            if (cmd === 'search_customers_by_name') return Promise.resolve(mockDups);
            if (cmd === 'search_customers_by_mobile') return Promise.resolve([]);
            if (cmd === 'create_customer') return Promise.resolve({ success: true });
            return Promise.resolve([]);
        });

        render(
            <ModalProvider>
                <CustomerRegister />
            </ModalProvider>
        );

        await user.type(screen.getByPlaceholderText(/이름 입력/i), '홍길동');

        const submitBtn = screen.getByRole('button', { name: /고객 등록/i });
        await user.click(submitBtn);

        // Should show duplicate modal
        expect(await screen.findByText(/중복 확인/i)).toBeInTheDocument();

        // Find "무시하고 계속 진행" button in modal
        const registerAnywayBtn = screen.getByRole('button', { name: /무시하고 계속 진행/i });
        await user.click(registerAnywayBtn);

        // Second confirmation
        const confirmBtn = await screen.findByRole('button', { name: /^확인$/ });
        await user.click(confirmBtn);

        await waitFor(() => {
            expect(apiBridge.invoke).toHaveBeenCalledWith('create_customer', expect.any(Object));
        });
    });
});

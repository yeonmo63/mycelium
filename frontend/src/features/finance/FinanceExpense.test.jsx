import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import FinanceExpense from './FinanceExpense';
import { ModalProvider } from '../../contexts/ModalContext';
import * as apiBridge from '../../utils/apiBridge';

vi.mock('../../utils/apiBridge', () => ({
    invoke: vi.fn(),
    callBridge: vi.fn()
}));

describe('FinanceExpense Component', () => {
    let user;

    const mockExpenses = [
        {
            expense_id: 1,
            expense_date: '2023-10-01',
            category: '운영비',
            amount: 50000,
            payment_method: '카드',
            memo: '사무용품 구입'
        }
    ];

    beforeEach(() => {
        user = userEvent.setup();
        vi.clearAllMocks();
        apiBridge.invoke.mockImplementation((cmd) => {
            if (cmd === 'get_expenses') return Promise.resolve(mockExpenses);
            return Promise.resolve([]);
        });
    });

    it('renders and displays expense list', async () => {
        render(
            <ModalProvider>
                <FinanceExpense />
            </ModalProvider>
        );

        expect(await screen.findByText('사무용품 구입')).toBeInTheDocument();
        expect(screen.getAllByText(/50,?000/).length).toBeGreaterThan(0);
        expect(screen.getAllByText('운영비').length).toBeGreaterThan(0);
    });

    it('saves a new expense', async () => {
        apiBridge.invoke.mockImplementation((cmd) => {
            if (cmd === 'get_expenses') return Promise.resolve(mockExpenses);
            if (cmd === 'save_expense') return Promise.resolve({ success: true });
            return Promise.resolve([]);
        });

        render(
            <ModalProvider>
                <FinanceExpense />
            </ModalProvider>
        );

        await screen.findByText('사무용품 구입');

        const amountInput = screen.getByLabelText(/지출 금액/i);
        await user.type(amountInput, '100000');

        const memoInput = screen.getByLabelText(/지출 내역\/메모/i);
        await user.type(memoInput, '전기요금');

        const saveBtn = screen.getByRole('button', { name: /저장하기/i });
        await user.click(saveBtn);

        await waitFor(() => {
            expect(apiBridge.invoke).toHaveBeenCalledWith('save_expense', expect.objectContaining({
                amount: 100000,
                memo: '전기요금'
            }));
        });

        expect(await screen.findByText(/지출 내역이 저장되었습니다/i)).toBeInTheDocument();
    });
});

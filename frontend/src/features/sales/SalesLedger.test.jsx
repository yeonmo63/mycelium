import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import SalesLedger from './SalesLedger';
import * as apiBridge from '../../utils/apiBridge';

vi.mock('../../utils/apiBridge', () => ({
    invoke: vi.fn(),
    callBridge: vi.fn()
}));

const mockShowAlert = vi.fn().mockResolvedValue(true);
const mockShowConfirm = vi.fn().mockResolvedValue(true);
vi.mock('../../contexts/ModalContext', () => ({
    useModal: () => ({
        showAlert: mockShowAlert,
        showConfirm: mockShowConfirm
    }),
    ModalProvider: ({ children }) => <div>{children}</div>
}));

const mockDebtors = [
    { customer_id: 1, customer_name: '김농부', mobile_number: '010-1111-2222', current_balance: 150000 },
    { customer_id: 2, customer_name: '이농부', mobile_number: '010-3333-4444', current_balance: 0 }
];

const mockLedger = [
    { ledger_id: 101, transaction_date: '2026-02-25', transaction_type: '매출', description: '생표고 1kg x2', amount: 30000, running_balance: 30000, reference_id: null },
    { ledger_id: 102, transaction_date: '2026-02-26', transaction_type: '입금', description: '잔금 입금', amount: -10000, running_balance: 20000, reference_id: null }
];

describe('SalesLedger Component', () => {
    let user;

    beforeEach(() => {
        user = userEvent.setup();
        vi.clearAllMocks();
        apiBridge.invoke.mockImplementation((cmd, args) => {
            if (cmd === 'get_ledger_debtors') return Promise.resolve(mockDebtors);
            if (cmd === 'get_ledger') return Promise.resolve(mockLedger);
            if (cmd === 'search_customers_by_name') return Promise.resolve([{ customer_id: 3, customer_name: '박농부', mobile_number: '010-5555-6666' }]);
            if (cmd === 'create_ledger_entry') return Promise.resolve({ success: true });
            if (cmd === 'delete_ledger_entry') return Promise.resolve({ success: true });
            if (cmd === 'get_customer') return Promise.resolve(mockDebtors[0]);
            return Promise.resolve(null);
        });
    });

    it('renders header and customer list', async () => {
        render(<SalesLedger />);

        expect(screen.getByText(/고객 미수금 관리/)).toBeInTheDocument();
        expect(await screen.findByText('김농부')).toBeInTheDocument();
        expect(screen.getByText('이농부')).toBeInTheDocument();
    });

    it('selects a customer and loads ledger', async () => {
        render(<SalesLedger />);

        const customer = await screen.findByText('김농부');
        await user.click(customer);

        await waitFor(() => {
            expect(apiBridge.invoke).toHaveBeenCalledWith('get_ledger', { customer_id: 1 });
        });

        expect(await screen.findByText('생표고 1kg x2')).toBeInTheDocument();
        expect(screen.getByText('잔금 입금')).toBeInTheDocument();
    });

    it('shows empty state when no customer selected', () => {
        render(<SalesLedger />);

        expect(screen.getByText('고객을 선택하여 원장을 조회하세요.')).toBeInTheDocument();
    });

    it('opens entry modal for deposit registration', async () => {
        render(<SalesLedger />);

        // Select customer first
        const customer = await screen.findByText('김농부');
        await user.click(customer);

        await screen.findByText('생표고 1kg x2');

        // Click 입금 등록
        const depositBtn = screen.getByRole('button', { name: /입금 등록/i });
        await user.click(depositBtn);

        // Entry modal should show
        await waitFor(() => {
            expect(screen.getByRole('heading', { name: /입금 등록/i })).toBeInTheDocument();
        });
    });

    it('saves a new ledger entry', async () => {
        render(<SalesLedger />);

        // Select customer
        const customer = await screen.findByText('김농부');
        await user.click(customer);
        await screen.findByText('생표고 1kg x2');

        // Open deposit modal
        const depositBtn = screen.getByRole('button', { name: /입금 등록/i });
        await user.click(depositBtn);

        await waitFor(() => {
            expect(screen.getByRole('heading', { name: /입금 등록/i })).toBeInTheDocument();
        });

        // Enter amount
        const amountInput = screen.getByPlaceholderText('0');
        await user.clear(amountInput);
        await user.type(amountInput, '50000');

        // Save
        const saveBtn = screen.getByRole('button', { name: /저장 완료/i });
        await user.click(saveBtn);

        await waitFor(() => {
            expect(apiBridge.invoke).toHaveBeenCalledWith('create_ledger_entry', expect.objectContaining({
                customerId: 1,
                transactionType: '입금',
                amount: 50000
            }));
        });
    });

    it('filters customer list by search query', async () => {
        render(<SalesLedger />);

        await screen.findByText('김농부');

        const searchInput = screen.getByPlaceholderText('고객 검색...');
        await user.type(searchInput, '김');

        expect(screen.getByText('김농부')).toBeInTheDocument();
        expect(screen.queryByText('이농부')).not.toBeInTheDocument();
    });

    it('deletes a ledger entry', async () => {
        render(<SalesLedger />);

        // Select customer
        const customer = await screen.findByText('김농부');
        await user.click(customer);
        await screen.findByText('생표고 1kg x2');

        // Click delete button on the first row
        const deleteBtns = screen.getAllByRole('button').filter(btn => btn.innerHTML.includes('delete'));
        await user.click(deleteBtns[0]);

        await waitFor(() => {
            expect(apiBridge.invoke).toHaveBeenCalledWith('delete_ledger_entry', { ledgerId: 102 });
        });
    });
});

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import FinanceTaxReport from './FinanceTaxReport';
import { ModalProvider } from '../../contexts/ModalContext';
import * as apiBridge from '../../utils/apiBridge';

vi.mock('../../utils/apiBridge', () => ({
    invoke: vi.fn(),
    callBridge: vi.fn()
}));

describe('FinanceTaxReport Component', () => {
    let user;

    const mockReportData = [
        {
            direction: '매출',
            tax_type: '과세',
            category: '농산물',
            date: '2023-10-01',
            name: '표고버섯 1kg',
            supply_value: 10000,
            vat_amount: 1000,
            total_amount: 11000
        },
        {
            direction: '매입',
            tax_type: '과세',
            category: '부자재',
            date: '2023-10-02',
            name: '박스',
            supply_value: 5000,
            vat_amount: 500,
            total_amount: 5500
        }
    ];

    beforeEach(() => {
        user = userEvent.setup();
        vi.clearAllMocks();
        apiBridge.invoke.mockImplementation((cmd) => {
            if (cmd === 'get_tax_report') return Promise.resolve(mockReportData);
            return Promise.resolve([]);
        });
    });

    it('renders and displays report summary', async () => {
        render(
            <ModalProvider>
                <FinanceTaxReport />
            </ModalProvider>
        );

        const searchBtn = screen.getByRole('button', { name: /조회하기/i });
        await user.click(searchBtn);

        // Summary and List might both have the values
        await waitFor(() => {
            expect(screen.getAllByText(/11,?000/).length).toBeGreaterThan(0);
            expect(screen.getAllByText(/5,?500/).length).toBeGreaterThan(0);
            expect(screen.getAllByText(/500/).length).toBeGreaterThan(0);
        });
    });

    it('displays detailed list after query', async () => {
        render(
            <ModalProvider>
                <FinanceTaxReport />
            </ModalProvider>
        );

        await user.click(screen.getByRole('button', { name: /조회하기/i }));

        expect(await screen.findByText('표고버섯 1kg')).toBeInTheDocument();
        expect(screen.getByText('박스')).toBeInTheDocument();
    });
});

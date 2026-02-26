import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import CustomerBatch from './CustomerBatch';
import { ModalProvider } from '../../contexts/ModalContext';
import * as apiBridge from '../../utils/apiBridge';

vi.mock('../../utils/apiBridge', () => ({
    invoke: vi.fn(),
    callBridge: vi.fn()
}));

// Mock URL.createObjectURL for CSV export
global.URL.createObjectURL = vi.fn();
global.URL.revokeObjectURL = vi.fn();

describe('CustomerBatch Component', () => {
    let user;

    const mockCustomers = [
        { customer_id: 'C1', customer_name: '고객1', mobile_number: '010-1111-1111', membership_level: 'VIP', join_date: '2023-01-01', status: '정상', address_primary: '주소1' },
        { customer_id: 'C2', customer_name: '고객2', mobile_number: '010-2222-2222', membership_level: '일반', join_date: '2023-02-01', status: '말소', address_primary: '주소2' }
    ];

    beforeEach(() => {
        user = userEvent.setup();
        vi.clearAllMocks();
        localStorage.clear();
        apiBridge.invoke.mockImplementation((cmd) => {
            if (cmd === 'search_customer_batch') return Promise.resolve(mockCustomers);
            return Promise.resolve([]);
        });
    });

    it('renders and performs initial search', async () => {
        render(
            <ModalProvider>
                <CustomerBatch />
            </ModalProvider>
        );

        expect(screen.getByText(/고객 일괄 조회/i)).toBeInTheDocument();
        await waitFor(() => {
            expect(apiBridge.invoke).toHaveBeenCalledWith('search_customer_batch', expect.any(Object));
        });

        expect(await screen.findByText('고객1')).toBeInTheDocument();
        expect(screen.getByText('고객2')).toBeInTheDocument();
    });

    it('filters by status tabs', async () => {
        render(
            <ModalProvider>
                <CustomerBatch />
            </ModalProvider>
        );

        await screen.findByText('고객1');

        // Click '정상' tab
        const normalTab = screen.getByRole('button', { name: /^정상/ });
        await user.click(normalTab);

        expect(screen.getByText('고객1')).toBeInTheDocument();
        expect(screen.queryByText('고객2')).not.toBeInTheDocument();

        // Click '휴면' tab
        const dormantTab = screen.getByRole('button', { name: /^휴면/ });
        await user.click(dormantTab);

        expect(screen.queryByText('고객1')).not.toBeInTheDocument();
        expect(screen.getByText('고객2')).toBeInTheDocument();
    });

    it('performs keyword search', async () => {
        render(
            <ModalProvider>
                <CustomerBatch />
            </ModalProvider>
        );

        const searchInput = screen.getByPlaceholderText(/이름 또는 연락처 검색/i);
        await user.type(searchInput, '고객1');

        const searchBtn = screen.getAllByRole('button', { name: /^조회$/ })[0];
        await user.click(searchBtn);

        await waitFor(() => {
            expect(apiBridge.invoke).toHaveBeenCalledWith('search_customer_batch', expect.objectContaining({
                keyword: '고객1'
            }));
        });
    });

    it('performs dormant customer search', async () => {
        apiBridge.invoke.mockImplementation((cmd) => {
            if (cmd === 'search_dormant_customers') return Promise.resolve([mockCustomers[1]]);
            if (cmd === 'search_customer_batch') return Promise.resolve(mockCustomers);
            return Promise.resolve([]);
        });

        render(
            <ModalProvider>
                <CustomerBatch />
            </ModalProvider>
        );

        const dormantSearchBtn = screen.getAllByRole('button', { name: /^조회$/ })[1];
        await user.click(dormantSearchBtn);

        await waitFor(() => {
            expect(apiBridge.invoke).toHaveBeenCalledWith('search_dormant_customers', expect.any(Object));
        });

        expect(await screen.findByText('고객2')).toBeInTheDocument();
        expect(screen.queryByText('고객1')).not.toBeInTheDocument();
    });

    it('handles batch reactivation', async () => {
        apiBridge.invoke.mockImplementation((cmd) => {
            if (cmd === 'search_customer_batch') return Promise.resolve(mockCustomers);
            if (cmd === 'reactivate_customers_batch') return Promise.resolve({ success: true });
            return Promise.resolve([]);
        });

        render(
            <ModalProvider>
                <CustomerBatch />
            </ModalProvider>
        );

        await screen.findByText('고객2');

        // Go to dormant tab to see the checkbox and button
        await user.click(screen.getByRole('button', { name: /^휴면/ }));

        // Select 고객2
        const checkboxes = screen.getAllByRole('checkbox');
        // index 0 is "Select All", index 1 is 고객1 (in dormant tab, only 고객2 should be visible but currentItems filter applies)
        // Wait, currentItems is filtered by statusTab. So only 고객2 is rendered.
        // Checkboxes: 0 (Select All), 1 (고객2)
        await user.click(checkboxes[1]);

        const reactivateBtn = screen.getByRole('button', { name: /정상 고객 전환/i });
        await user.click(reactivateBtn);

        // Confirm modal
        const confirmBtn = await screen.findByRole('button', { name: /^확인$/ });
        await user.click(confirmBtn);

        await waitFor(() => {
            expect(apiBridge.invoke).toHaveBeenCalledWith('reactivate_customers_batch', {
                ids: ['C2']
            });
        });

        expect(await screen.findByText(/정상 고객으로 복구되었습니다/i)).toBeInTheDocument();
    });

    it('exports CSV', async () => {
        render(
            <ModalProvider>
                <CustomerBatch />
            </ModalProvider>
        );

        await screen.findByText('고객1');

        const exportBtn = screen.getByRole('button', { name: /엑셀 저장/i });
        await user.click(exportBtn);

        expect(screen.getByText(/파일이 성공적으로 다운로드되었습니다/i)).toBeInTheDocument();
    });
});

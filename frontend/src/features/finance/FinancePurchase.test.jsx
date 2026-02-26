import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import FinancePurchase from './FinancePurchase';
import { ModalProvider } from '../../contexts/ModalContext';
import * as apiBridge from '../../utils/apiBridge';

vi.mock('../../utils/apiBridge', () => ({
    invoke: vi.fn(),
    callBridge: vi.fn()
}));

describe('FinancePurchase Component', () => {
    let user;

    const mockPurchases = [
        {
            purchase_id: 1,
            purchase_date: '2023-10-01',
            vendor_id: 10,
            vendor_name: '테스트농산',
            item_name: '미강',
            quantity: 100,
            unit_price: 500,
            total_amount: 50000,
            payment_status: '계좌이체'
        }
    ];

    const mockVendors = [{ vendor_id: 10, vendor_name: '테스트농산' }];
    const mockProducts = [{ product_id: 1, product_name: '미강', item_type: 'material' }];

    beforeEach(() => {
        user = userEvent.setup();
        vi.clearAllMocks();
        apiBridge.invoke.mockImplementation((cmd) => {
            if (cmd === 'get_purchases') return Promise.resolve(mockPurchases);
            if (cmd === 'get_vendors') return Promise.resolve(mockVendors);
            if (cmd === 'get_product_list') return Promise.resolve(mockProducts);
            return Promise.resolve([]);
        });
    });

    it('renders and displays purchase list', async () => {
        render(
            <ModalProvider>
                <FinancePurchase />
            </ModalProvider>
        );

        expect(await screen.findByText('미강')).toBeInTheDocument();
        expect(screen.getAllByText('테스트농산').length).toBeGreaterThan(0);
        expect(screen.getAllByText(/50,?000/).length).toBeGreaterThan(0);
    });

    it('saves a new purchase', async () => {
        apiBridge.invoke.mockImplementation((cmd) => {
            if (cmd === 'get_purchases') return Promise.resolve(mockPurchases);
            if (cmd === 'get_vendors') return Promise.resolve(mockVendors);
            if (cmd === 'get_product_list') return Promise.resolve(mockProducts);
            if (cmd === 'save_purchase') return Promise.resolve({ success: true });
            return Promise.resolve([]);
        });

        render(
            <ModalProvider>
                <FinancePurchase />
            </ModalProvider>
        );

        await screen.findByText('미강');

        await user.selectOptions(screen.getByLabelText(/공급처/i), '10');
        await user.type(screen.getByLabelText(/품목명/i), '새 미강');
        await user.type(screen.getByLabelText(/수량/i), '200');
        await user.type(screen.getByLabelText(/단가/i), '600');

        const saveBtn = screen.getByRole('button', { name: /저장하기/i });
        await user.click(saveBtn);

        await waitFor(() => {
            expect(apiBridge.invoke).toHaveBeenCalledWith('save_purchase', expect.objectContaining({
                purchase: expect.objectContaining({
                    item_name: '새 미강'
                })
            }));
        }, { timeout: 3000 });

        expect(await screen.findByText(/매입 내역이 저장되었습니다/i)).toBeInTheDocument();
    });
});

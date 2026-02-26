import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import SalesStock from './SalesStock';
import { ModalProvider } from '../../contexts/ModalContext';
import * as apiBridge from '../../utils/apiBridge';

// Mock apiBridge
vi.mock('../../utils/apiBridge', () => ({
    invoke: vi.fn(),
    callBridge: vi.fn()
}));

describe('SalesStock Component', () => {
    let user;

    const mockProducts = [
        { product_id: 1, product_name: '완제품 A', item_type: 'product', stock_quantity: 100, specification: '1kg', safety_stock: 10 },
        { product_id: 2, product_name: '원물 B', item_type: 'harvest_item', stock_quantity: 50, specification: 'kg', safety_stock: 5 },
        { product_id: 3, product_name: '부자재 C', item_type: 'aux_material', stock_quantity: 200, specification: 'box', safety_stock: 20 }
    ];

    const mockLogs = [
        { log_id: 1, product_name: '완제품 A', change_type: '입고', change_quantity: 10, current_stock: 110, log_date: '2023-10-01', created_at: '2023-10-01 10:00:00', memo: '테스트 로그' }
    ];

    beforeEach(() => {
        user = userEvent.setup();
        vi.clearAllMocks();

        apiBridge.invoke.mockImplementation((cmd) => {
            if (cmd === 'get_product_list') return Promise.resolve(mockProducts);
            if (cmd === 'get_product_freshness') return Promise.resolve([]);
            if (cmd === 'get_product_logs') return Promise.resolve(mockLogs);
            if (cmd === 'adjust_product_stock') return Promise.resolve({ success: true });
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

    it('renders products and logs correctly', async () => {
        renderWithContext(<SalesStock />);

        const table = await screen.findByRole('table');
        expect(await within(table).findByText(/완제품 A/i, {}, { timeout: 3000 })).toBeInTheDocument();
        expect(within(table).queryByText(/원물 B/i)).not.toBeInTheDocument();

        expect(await screen.findByText(/테스트 로그/i, {}, { timeout: 3000 })).toBeInTheDocument();
    });

    it('switches tabs and shows corresponding products', async () => {
        renderWithContext(<SalesStock />);

        const harvestTab = screen.getByText(/농산물 \(수확물\)/i);
        await user.click(harvestTab);

        const table = await screen.findByRole('table');
        expect(await within(table).findByText(/원물 B/i, {}, { timeout: 3000 })).toBeInTheDocument();
        expect(within(table).queryByText(/완제품 A/i)).not.toBeInTheDocument();
    });

    it('filters products by search query', async () => {
        renderWithContext(<SalesStock />);

        const searchInput = screen.getByPlaceholderText(/품목명 검색/i);
        await user.type(searchInput, '존재하지않는상품');

        const table = screen.getByRole('table');
        await waitFor(() => {
            expect(within(table).queryByText(/완제품 A/i)).not.toBeInTheDocument();
            expect(screen.getByText(/검색 결과가 없습니다/i)).toBeInTheDocument();
        });

        await user.clear(searchInput);
        await user.type(searchInput, '완제품');
        expect(await within(table).findByText(/완제품 A/i, {}, { timeout: 3000 })).toBeInTheDocument();
    });

    it('opens adjust modal and saves', async () => {
        renderWithContext(<SalesStock />);

        const table = await screen.findByRole('table');
        expect(await within(table).findByText(/완제품 A/i, {}, { timeout: 3000 })).toBeInTheDocument();

        const adjustBtn = screen.getByTitle('재고 조정');
        await user.click(adjustBtn);

        expect(screen.getByText(/재고 직접 조정/i)).toBeInTheDocument();

        const input = screen.getByPlaceholderText('0');
        await user.type(input, '10');

        const saveBtn = screen.getByText(/저장 완료/i);
        await user.click(saveBtn);

        await waitFor(() => {
            expect(apiBridge.invoke).toHaveBeenCalledWith('adjust_product_stock', expect.objectContaining({
                changeQty: 10,
                productId: 1
            }));
        });
    });

    it('opens harvest modal and saves via separate button', async () => {
        renderWithContext(<SalesStock />);

        const harvestTab = screen.getByText(/농산물 \(수확물\)/i);
        await user.click(harvestTab);

        const harvestBtn = screen.getByRole('button', { name: /수확 입고/i });
        await user.click(harvestBtn);

        expect(await screen.findByText(/농산물 수확 입고/i, {}, { timeout: 3000 })).toBeInTheDocument();

        const qtyInputs = screen.getAllByPlaceholderText('0');
        await user.type(qtyInputs[0], '25');

        const saveBtn = screen.getByText(/수확 입고 완료/i);
        await user.click(saveBtn);

        await waitFor(() => {
            expect(apiBridge.invoke).toHaveBeenCalledWith('adjust_product_stock', expect.objectContaining({
                changeQty: 25,
                reasonCategory: '수확'
            }));
        });
    });
});

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import ProductionBatches from './ProductionBatches';
import { ModalProvider } from '../../../contexts/ModalContext';
import * as apiBridge from '../../../utils/apiBridge';

vi.mock('../../../utils/apiBridge', () => ({
    invoke: vi.fn(),
    callBridge: vi.fn()
}));

// Mock scrollIntoView
window.HTMLElement.prototype.scrollIntoView = vi.fn();

describe('ProductionBatches Component', () => {
    let user;

    const mockBatches = [
        {
            batch_id: 1,
            batch_code: 'LOG-20231001-001',
            product_id: 1,
            space_id: 1,
            status: 'growing',
            start_date: '2023-10-01',
            expected_harvest_date: '2023-11-01',
            initial_quantity: 100,
            unit: '개',
            memo: '테스트 메모'
        }
    ];

    const mockProducts = [
        { product_id: 1, product_name: '느타리', item_type: 'harvest_item' }
    ];

    const mockSpaces = [
        { space_id: 1, space_name: '제1재배실' }
    ];

    beforeEach(() => {
        user = userEvent.setup();
        vi.clearAllMocks();
        apiBridge.invoke.mockImplementation((cmd) => {
            if (cmd === 'get_production_batches') return Promise.resolve(mockBatches);
            if (cmd === 'get_product_list') return Promise.resolve(mockProducts);
            if (cmd === 'get_production_spaces') return Promise.resolve(mockSpaces);
            return Promise.resolve([]);
        });
    });

    it('renders and displays active batches', async () => {
        render(
            <ModalProvider>
                <ProductionBatches />
            </ModalProvider>
        );

        expect(await screen.findByText('LOG-20231001-001')).toBeInTheDocument();
        expect(screen.getByText('느타리')).toBeInTheDocument();
        expect(screen.getByText('제1재배실')).toBeInTheDocument();
    });

    it('opens create modal with generated code', async () => {
        render(
            <ModalProvider>
                <ProductionBatches />
            </ModalProvider>
        );

        const addBtn = screen.getByRole('button', { name: /새 생산 주기 시작/i });
        await user.click(addBtn);

        expect(screen.getByRole('heading', { name: /생산 주기 시작/i })).toBeInTheDocument();

        // Wait for code generation
        await waitFor(() => {
            const input = screen.getByLabelText(/배치 코드/i);
            expect(input.value).toMatch(/^B-/);
        }, { timeout: 2000 });
    });

    it('saves a new batch', async () => {
        apiBridge.invoke.mockImplementation((cmd) => {
            if (cmd === 'get_production_batches') return Promise.resolve(mockBatches);
            if (cmd === 'get_product_list') return Promise.resolve(mockProducts);
            if (cmd === 'get_production_spaces') return Promise.resolve(mockSpaces);
            if (cmd === 'save_production_batch') return Promise.resolve({ success: true, id: 2 });
            return Promise.resolve([]);
        });

        render(
            <ModalProvider>
                <ProductionBatches />
            </ModalProvider>
        );

        await user.click(screen.getByRole('button', { name: /새 생산 주기 시작/i }));

        const productSelect = screen.getByLabelText(/수확 목표 원물/i);
        await user.selectOptions(productSelect, '1');

        const spaceSelect = screen.getByLabelText(/배정 시설/i);
        await user.selectOptions(spaceSelect, '1');

        // Target the submit button in the modal
        const saveBtn = screen.getByRole('button', { name: /^생산 주기 시작$/ });
        await user.click(saveBtn);

        await waitFor(() => {
            expect(apiBridge.invoke).toHaveBeenCalledWith('save_production_batch', expect.objectContaining({
                product_id: 1,
                space_id: 1
            }));
        });

        expect(await screen.findByText(/생산 배치가 등록되었습니다/i)).toBeInTheDocument();
    });
});

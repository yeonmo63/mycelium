import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import HarvestRecords from './HarvestRecords';
import { ModalProvider } from '../../../contexts/ModalContext';
import * as apiBridge from '../../../utils/apiBridge';

vi.mock('../../../utils/apiBridge', () => ({
    invoke: vi.fn(),
    callBridge: vi.fn()
}));

describe('HarvestRecords Component', () => {
    let user;

    const mockRecords = [
        {
            harvest_id: 1,
            batch_id: 1,
            harvest_date: '2023-10-01',
            quantity: 50,
            unit: 'kg',
            grade: 'A',
            traceability_code: 'TR-001'
        }
    ];

    const mockBatches = [
        { batch_id: 1, batch_code: 'LOG-20231001-001', product_id: 1 }
    ];

    const mockProducts = [
        { product_id: 1, product_name: '느타리' }
    ];

    beforeEach(() => {
        user = userEvent.setup();
        vi.clearAllMocks();
        apiBridge.invoke.mockImplementation((cmd) => {
            if (cmd === 'get_production_harvests') return Promise.resolve(mockRecords);
            if (cmd === 'get_production_batches') return Promise.resolve(mockBatches);
            if (cmd === 'get_product_list') return Promise.resolve(mockProducts);
            if (cmd === 'get_company_info') return Promise.resolve({ representative_name: '홍길동' });
            return Promise.resolve([]);
        });
    });

    it('renders and displays harvest records', async () => {
        render(
            <ModalProvider>
                <HarvestRecords />
            </ModalProvider>
        );

        expect(await screen.findByText('LOG-20231001-001')).toBeInTheDocument();
        expect(screen.getByText('50 kg')).toBeInTheDocument();
        expect(screen.getByText('TR-001')).toBeInTheDocument();
    });

    it('opens create modal and saves record', async () => {
        apiBridge.invoke.mockImplementation((cmd) => {
            if (cmd === 'get_production_harvests') return Promise.resolve(mockRecords);
            if (cmd === 'get_production_batches') return Promise.resolve(mockBatches);
            if (cmd === 'get_product_list') return Promise.resolve(mockProducts);
            if (cmd === 'save_harvest_record') return Promise.resolve({ success: true });
            return Promise.resolve([]);
        });

        render(
            <ModalProvider>
                <HarvestRecords />
            </ModalProvider>
        );

        const addBtn = screen.getByRole('button', { name: /새 수확 기록/i });
        await user.click(addBtn);

        expect(screen.getByRole('heading', { name: /새 수확 기록 등록/i })).toBeInTheDocument();

        await user.selectOptions(screen.getByLabelText(/수확 대상 배치/i), '1');

        const qtyInput = screen.getByLabelText(/정품 수확량/i);
        await user.clear(qtyInput);
        await user.type(qtyInput, '60');

        const saveBtn = screen.getByRole('button', { name: /기록 저장 및 재고 반영/i });
        await user.click(saveBtn);

        await waitFor(() => {
            expect(apiBridge.invoke).toHaveBeenCalledWith('save_harvest_record', expect.objectContaining({
                record: expect.objectContaining({
                    batch_id: 1,
                    quantity: 60
                })
            }));
        });

        expect(await screen.findByText(/수확 기록 및 재고 반영이 완료되었습니다/i)).toBeInTheDocument();
    });

    it('opens print preview', async () => {
        render(
            <ModalProvider>
                <HarvestRecords />
            </ModalProvider>
        );

        await screen.findByText('LOG-20231001-001');

        const printBtn = screen.getByRole('button', { name: /qr_code/i });
        await user.click(printBtn);

        expect(screen.getByText(/QR코드 인쇄 미리보기/i)).toBeInTheDocument();
        expect(screen.getByText('느타리 A등급')).toBeInTheDocument();
    });
});

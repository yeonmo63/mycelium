import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import ProductionLogs from './ProductionLogs';
import { ModalProvider } from '../../../contexts/ModalContext';
import * as apiBridge from '../../../utils/apiBridge';

vi.mock('../../../utils/apiBridge', () => ({
    invoke: vi.fn(),
    callBridge: vi.fn()
}));

describe('ProductionLogs Component', () => {
    let user;

    const mockLogs = [
        {
            log_id: 1,
            log_date: '2023-10-01',
            work_type: 'plant',
            work_content: '종균접종 작업',
            worker_name: '작업자1',
            space_id: 1,
            batch_id: 1,
            env_data: { temp: 20, humidity: 60 }
        }
    ];

    const mockSpaces = [
        { space_id: 1, space_name: '제1재배실' }
    ];

    const mockBatches = [
        { batch_id: 1, batch_code: 'LOG-20231001-001' }
    ];

    beforeEach(() => {
        user = userEvent.setup();
        vi.clearAllMocks();
        apiBridge.invoke.mockImplementation((cmd) => {
            if (cmd === 'get_production_logs') return Promise.resolve(mockLogs);
            if (cmd === 'get_production_spaces') return Promise.resolve(mockSpaces);
            if (cmd === 'get_production_batches') return Promise.resolve(mockBatches);
            return Promise.resolve([]);
        });
    });

    it('renders and displays logs', async () => {
        render(
            <ModalProvider>
                <ProductionLogs />
            </ModalProvider>
        );

        expect(await screen.findByText('종균접종 작업')).toBeInTheDocument();
        expect(screen.getByText('제1재배실')).toBeInTheDocument();
        expect(screen.getByText('작업자1')).toBeInTheDocument();
        expect(screen.getByText(/20.*°C/)).toBeInTheDocument();
    });

    it('opens create modal and saves new log', async () => {
        apiBridge.invoke.mockImplementation((cmd) => {
            if (cmd === 'get_production_logs') return Promise.resolve(mockLogs);
            if (cmd === 'get_production_spaces') return Promise.resolve(mockSpaces);
            if (cmd === 'get_production_batches') return Promise.resolve(mockBatches);
            if (cmd === 'save_farming_log') return Promise.resolve({ success: true, id: 2 });
            return Promise.resolve([]);
        });

        render(
            <ModalProvider>
                <ProductionLogs />
            </ModalProvider>
        );

        const addBtn = screen.getByRole('button', { name: /일지 새로 쓰기/i });
        await user.click(addBtn);

        expect(screen.getByRole('heading', { name: /영농일지 작성/i })).toBeInTheDocument();

        // Fill form
        await user.type(screen.getByLabelText(/작업자/i), '홍길동');
        await user.type(screen.getByLabelText(/상세 작업 내용/i), '테스트 작업 내용');

        await user.selectOptions(screen.getByLabelText(/작업 구획/i), '1');

        const saveBtn = screen.getByRole('button', { name: /현장 일지 저장/i });
        await user.click(saveBtn);

        await waitFor(() => {
            expect(apiBridge.invoke).toHaveBeenCalledWith('save_farming_log', expect.objectContaining({
                worker_name: '홍길동',
                work_content: '테스트 작업 내용',
                space_id: 1
            }));
        });

        expect(await screen.findByText(/영농일지가 저장되었습니다/i)).toBeInTheDocument();
    });

    it('handles log deletion', async () => {
        apiBridge.invoke.mockImplementation((cmd) => {
            if (cmd === 'get_production_logs') return Promise.resolve(mockLogs);
            if (cmd === 'delete_farming_log') return Promise.resolve({ success: true });
            return Promise.resolve([]);
        });

        render(
            <ModalProvider>
                <ProductionLogs />
            </ModalProvider>
        );

        await screen.findByText('종균접종 작업');

        // Find delete button in the row
        const row = screen.getByText('종균접종 작업').closest('tr');
        const deleteBtn = row.querySelector('button:has(.lucide-trash2)');
        await user.click(deleteBtn);

        // Confirm modal
        const confirmBtn = await screen.findByRole('button', { name: /^확인$/ });
        await user.click(confirmBtn);

        await waitFor(() => {
            expect(apiBridge.invoke).toHaveBeenCalledWith('delete_farming_log', { id: 1 });
        });
    });
});

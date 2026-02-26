import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import ProductionSpaces from './ProductionSpaces';
import { ModalProvider } from '../../../contexts/ModalContext';
import * as apiBridge from '../../../utils/apiBridge';

vi.mock('../../../utils/apiBridge', () => ({
    invoke: vi.fn(),
    callBridge: vi.fn()
}));

describe('ProductionSpaces Component', () => {
    let user;

    const mockSpaces = [
        { space_id: 'S1', space_name: '제1재배실', area_size: 100, area_unit: 'm2', status: '정상', is_active: true, memo: '메모1' },
        { space_id: 'S2', space_name: '제2재배실', area_size: 150, area_unit: 'm2', status: '정상', is_active: true, memo: '메모2' }
    ];

    beforeEach(() => {
        user = userEvent.setup();
        vi.clearAllMocks();
        apiBridge.invoke.mockImplementation((cmd) => {
            if (cmd === 'get_production_spaces') return Promise.resolve(mockSpaces);
            return Promise.resolve([]);
        });
    });

    it('renders and loads spaces', async () => {
        render(
            <ModalProvider>
                <ProductionSpaces />
            </ModalProvider>
        );

        expect(await screen.findByText('제1재배실')).toBeInTheDocument();
        expect(screen.getByText('제2재배실')).toBeInTheDocument();
        expect(screen.getByText(/100 m2/)).toBeInTheDocument();
    });

    it('opens create modal and saves new space', async () => {
        apiBridge.invoke.mockImplementation((cmd) => {
            if (cmd === 'get_production_spaces') return Promise.resolve(mockSpaces);
            if (cmd === 'save_production_space') return Promise.resolve({ success: true, id: 'S3' });
            return Promise.resolve([]);
        });

        render(
            <ModalProvider>
                <ProductionSpaces />
            </ModalProvider>
        );

        const addBtn = screen.getByRole('button', { name: /새 시설 등록/i });
        await user.click(addBtn);

        // Check for modal heading specifically
        expect(screen.getByRole('heading', { name: /새 시설 등록/i })).toBeInTheDocument();

        const nameInput = screen.getByLabelText(/시설\/필지 이름/i);
        await user.type(nameInput, '제3재배실');

        const areaInput = screen.getByLabelText(/면적\/규모/i);
        await user.clear(areaInput);
        await user.type(areaInput, '200');

        const saveBtn = screen.getByRole('button', { name: /등록 완료/i });
        await user.click(saveBtn);

        await waitFor(() => {
            expect(apiBridge.invoke).toHaveBeenCalledWith('save_production_space', expect.objectContaining({
                space_name: '제3재배실',
                area_size: 200
            }));
        });

        expect(await screen.findByText(/시설 정보가 저장되었습니다/i)).toBeInTheDocument();
    });

    it('handles space deletion', async () => {
        apiBridge.invoke.mockImplementation((cmd) => {
            if (cmd === 'get_production_spaces') return Promise.resolve(mockSpaces);
            if (cmd === 'delete_production_space') return Promise.resolve({ success: true });
            return Promise.resolve([]);
        });

        render(
            <ModalProvider>
                <ProductionSpaces />
            </ModalProvider>
        );

        await screen.findByText('제1재배실');

        // Find delete button in the first card more reliably
        const containers = screen.getAllByText('제1재배실').map(el => el.closest('.group'));
        const deleteBtn = containers[0].querySelector('button:has(.lucide-trash2)');
        await user.click(deleteBtn);

        // Confirm modal
        const confirmBtn = await screen.findByRole('button', { name: /^확인$/ });
        await user.click(confirmBtn);

        await waitFor(() => {
            expect(apiBridge.invoke).toHaveBeenCalledWith('delete_production_space', { id: 'S1' });
        });
    });
});

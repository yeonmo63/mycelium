import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import RegionAnalysis from './RegionAnalysis';
import { ModalProvider } from '../../contexts/ModalContext';
import * as apiBridge from '../../utils/apiBridge';

// Mock echarts
vi.mock('echarts', () => ({
    init: vi.fn().mockReturnValue({
        showLoading: vi.fn(),
        hideLoading: vi.fn(),
        setOption: vi.fn(),
        dispose: vi.fn(),
        resize: vi.fn(),
    }),
    getMap: vi.fn().mockReturnValue(true),
    registerMap: vi.fn(),
}));

// Mock apiBridge
vi.mock('../../utils/apiBridge', () => ({
    invoke: vi.fn(),
    callBridge: vi.fn()
}));

// Mock fetch for GeoJSON
global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ features: [] }),
});

describe('RegionAnalysis Component', () => {
    let user;

    const mockRegionData = [
        { region: '서울특별시', total_amount: 5000000, total_quantity: 100 }
    ];

    beforeEach(() => {
        user = userEvent.setup();
        vi.clearAllMocks();

        apiBridge.invoke.mockImplementation((cmd) => {
            if (cmd === 'get_sales_by_region_analysis') return Promise.resolve(mockRegionData);
            return Promise.resolve([]);
        });
    });

    it('renders header and executes initial analysis', async () => {
        render(
            <ModalProvider>
                <RegionAnalysis />
            </ModalProvider>
        );

        expect(screen.getByText(/AI 지역별 판매 히트맵/i)).toBeInTheDocument();

        await waitFor(() => {
            expect(screen.getByText('서울특별시')).toBeInTheDocument();
            expect(screen.getByText(/5,000,000/)).toBeInTheDocument();
        });
    });

    it('changes year and triggers analysis', async () => {
        render(
            <ModalProvider>
                <RegionAnalysis />
            </ModalProvider>
        );

        await waitFor(() => screen.getByText('서울특별시'));

        const yearSelect = screen.getByRole('combobox');
        const prevYear = JSON.parse(JSON.stringify(new Date().getFullYear() - 1));

        await user.selectOptions(yearSelect, String(prevYear));

        await waitFor(() => {
            expect(apiBridge.invoke).toHaveBeenCalledWith('get_sales_by_region_analysis', expect.objectContaining({ year: prevYear }));
        });
    });
});

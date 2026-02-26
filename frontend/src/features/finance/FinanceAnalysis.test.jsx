import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import FinanceAnalysis from './FinanceAnalysis';
import { ModalProvider } from '../../contexts/ModalContext';
import * as apiBridge from '../../utils/apiBridge';

// Mock Chart.js
vi.mock('chart.js', () => {
    class MockChart {
        static register = vi.fn();
        constructor() {
            this.destroy = vi.fn();
            this.update = vi.fn();
            this.toDataURL = vi.fn(() => 'data:image/png;base64,mock');
        }
    }
    return {
        Chart: MockChart,
        registerables: []
    };
});

// Mock apiBridge
vi.mock('../../utils/apiBridge', () => ({
    invoke: vi.fn(),
    callBridge: vi.fn()
}));

describe('FinanceAnalysis Component', () => {
    let user;

    const mockPLData = [
        { month: '2023-01', revenue: 1000000, cost: 600000, profit: 400000 },
        { month: '2023-02', revenue: 1200000, cost: 700000, profit: 500000 }
    ];

    const mockCostData = [
        { category: '원자재', amount: 500000, percentage: 50 },
        { category: '인건비', amount: 500000, percentage: 50 }
    ];

    const mockVendorData = [
        { vendor_name: '테스트상사', total_amount: 1000000, purchase_count: 5 }
    ];

    beforeEach(() => {
        user = userEvent.setup();
        vi.clearAllMocks();

        // Mock getContext
        HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
            fillRect: vi.fn(),
            clearRect: vi.fn(),
            getImageData: vi.fn(),
            putImageData: vi.fn(),
            createImageData: vi.fn(),
            setTransform: vi.fn(),
            drawImage: vi.fn(),
            save: vi.fn(),
            fillText: vi.fn(),
            restore: vi.fn(),
            beginPath: vi.fn(),
            moveTo: vi.fn(),
            lineTo: vi.fn(),
            closePath: vi.fn(),
            stroke: vi.fn(),
            translate: vi.fn(),
            scale: vi.fn(),
            rotate: vi.fn(),
            arc: vi.fn(),
            fill: vi.fn(),
            measureText: vi.fn().mockReturnValue({ width: 0 }),
            transform: vi.fn(),
            rect: vi.fn(),
            clip: vi.fn(),
        });

        apiBridge.invoke.mockImplementation((cmd) => {
            if (cmd === 'get_monthly_pl') return Promise.resolve(mockPLData);
            if (cmd === 'get_cost_breakdown') return Promise.resolve(mockCostData);
            if (cmd === 'get_vendor_ranking') return Promise.resolve(mockVendorData);
            return Promise.resolve([]);
        });
    });

    it('renders and displays financial stats', async () => {
        render(
            <ModalProvider>
                <FinanceAnalysis />
            </ModalProvider>
        );

        // Wait for data load
        await waitFor(() => {
            // Total Revenue: 1000000 + 1200000 = 2,200,000
            expect(screen.getByText(/2,200,000원/)).toBeInTheDocument();
            // Total Cost: 600000 + 700000 = 1,300,000
            expect(screen.getByText(/1,300,000원/)).toBeInTheDocument();
            // Net Profit: 2200000 - 1300000 = 900,000
            expect(screen.getByText(/900,000원/)).toBeInTheDocument();
        });
    });

    it('renders top vendors table', async () => {
        render(
            <ModalProvider>
                <FinanceAnalysis />
            </ModalProvider>
        );

        expect(await screen.findByText('테스트상사')).toBeInTheDocument();
        expect(screen.getByText(/1,000,000원/)).toBeInTheDocument();
        expect(screen.getByText('5회')).toBeInTheDocument();
    });

    it('handles year change', async () => {
        render(
            <ModalProvider>
                <FinanceAnalysis />
            </ModalProvider>
        );

        const yearSelect = screen.getByLabelText(/분석 연도/i);
        const currentYear = new Date().getFullYear();
        const prevYear = currentYear - 1;

        await user.selectOptions(yearSelect, String(prevYear));

        await waitFor(() => {
            expect(apiBridge.invoke).toHaveBeenCalledWith('get_monthly_pl', expect.objectContaining({ year: prevYear }));
        }, { timeout: 3000 });
    });
});

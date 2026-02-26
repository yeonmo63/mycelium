import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import SalesIntelligence from './SalesIntelligence';
import { ModalProvider } from '../../contexts/ModalContext';
import * as apiBridge from '../../utils/apiBridge';

// Proper Chart.js mock defined inside the factory for hoisting
vi.mock('chart.js', () => {
    const MockChart = vi.fn().mockImplementation(function () {
        this.destroy = vi.fn();
        this.update = vi.fn();
        this.resize = vi.fn();
        return this;
    });
    MockChart.register = vi.fn();
    return {
        Chart: MockChart,
        registerables: []
    };
});

// Mock apiBridge
vi.mock('../../utils/apiBridge', () => ({
    invoke: vi.fn(() => Promise.resolve([])),
    callBridge: vi.fn(() => Promise.resolve([]))
}));

describe('SalesIntelligence Component', () => {
    let user;

    const mockTrend = [
        { year: 2023, record_count: 100, total_quantity: 500, total_amount: 5000000 },
        { year: 2024, record_count: 120, total_quantity: 600, total_amount: 6500000 }
    ];

    const mockTopProducts = [
        { product_name: '테스트 버섯', total_quantity: 1000 }
    ];

    beforeEach(() => {
        user = userEvent.setup();
        vi.clearAllMocks();

        // Mock canvas context
        HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
            fillRect: vi.fn(),
            measureText: vi.fn().mockReturnValue({ width: 0 }),
        });

        apiBridge.callBridge.mockImplementation((cmd) => {
            if (cmd === 'get_ten_year_sales_stats') return Promise.resolve(mockTrend);
            if (cmd === 'get_top3_products_by_qty') return Promise.resolve(mockTopProducts);
            return Promise.resolve([]);
        });
    });

    it('renders header and initial data', async () => {
        render(
            <ModalProvider>
                <SalesIntelligence />
            </ModalProvider>
        );

        expect(screen.getByText(/지능형 경영 분석 리포트/i)).toBeInTheDocument();

        await waitFor(() => {
            const elements = screen.getAllByText(/테스트 버섯/);
            expect(elements.length).toBeGreaterThan(0);
        }, { timeout: 10000 });
    });

    it('switches tabs', async () => {
        render(
            <ModalProvider>
                <SalesIntelligence />
            </ModalProvider>
        );

        await screen.findAllByText(/테스트 버섯/);

        const summaryTab = screen.getByText('종합 요약');
        await user.click(summaryTab);

        await waitFor(() => {
            expect(screen.getByText(/올해 총 판매액/)).toBeInTheDocument();
        }, { timeout: 10000 });
    });

    it('shows print report button', async () => {
        render(
            <ModalProvider>
                <SalesIntelligence />
            </ModalProvider>
        );

        await screen.findByText(/지능형 경영 분석 리포트/i);

        expect(screen.getByText(/리포트 인쇄/i)).toBeInTheDocument();
    });
});

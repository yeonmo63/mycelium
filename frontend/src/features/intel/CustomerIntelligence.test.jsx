import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import CustomerIntelligence from './CustomerIntelligence';
import { ModalProvider } from '../../contexts/ModalContext';
import * as apiBridge from '../../utils/apiBridge';
import { BrowserRouter } from 'react-router-dom';

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

describe('CustomerIntelligence Component', () => {
    let user;

    const mockRfmData = [
        { customer_id: 1, customer_name: '홍길동', mobile_number: '010-1111-2222', rfm_segment: 'Champions (최우수)', last_order_date: '2024-01-01', total_orders: 10, total_amount: 1000000 }
    ];

    beforeEach(() => {
        user = userEvent.setup();
        vi.clearAllMocks();

        // Mock canvas context
        HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
            fillRect: vi.fn(),
            measureText: vi.fn().mockReturnValue({ width: 0 }),
        });

        apiBridge.invoke.mockImplementation((cmd) => {
            if (cmd === 'get_rfm_analysis') return Promise.resolve(mockRfmData);
            return Promise.resolve([]);
        });
    });

    it('renders and displays RFM analysis data', async () => {
        render(
            <BrowserRouter>
                <ModalProvider>
                    <CustomerIntelligence />
                </ModalProvider>
            </BrowserRouter>
        );

        expect(screen.getByText(/AI 고객 성장 센터/i)).toBeInTheDocument();

        await waitFor(() => {
            expect(screen.getByText(/홍길동/)).toBeInTheDocument();
            expect(screen.getByText(/Champions/)).toBeInTheDocument();
        }, { timeout: 10000 });
    });

    it('switches tabs to AI Repurchase Suggestion', async () => {
        render(
            <BrowserRouter>
                <ModalProvider>
                    <CustomerIntelligence />
                </ModalProvider>
            </BrowserRouter>
        );

        const repurchaseTab = screen.getByText('AI 재구매 제안');
        await user.click(repurchaseTab);

        await waitFor(() => {
            expect(screen.getByText(/구매주기 엔진/i)).toBeInTheDocument();
        }, { timeout: 10000 });
    });
});

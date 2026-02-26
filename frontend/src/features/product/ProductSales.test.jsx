import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import ProductSales from './ProductSales';
import { ModalProvider } from '../../contexts/ModalContext';
import * as apiBridge from '../../utils/apiBridge';

// Extremely simple Chart.js mock to prevent any hangs
vi.mock('chart.js/auto', () => {
    return {
        default: vi.fn().mockImplementation(function () {
            return {
                destroy: vi.fn(),
                update: vi.fn(),
            };
        })
    };
});

// Mock apiBridge
vi.mock('../../utils/apiBridge', () => ({
    invoke: vi.fn(() => Promise.resolve([])),
    callBridge: vi.fn(() => Promise.resolve([]))
}));

describe('ProductSales Component', () => {
    let user;

    const mockSalesData = [
        { product_name: '상품A', record_count: 5, total_quantity: 10, total_amount: 100000 }
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
            if (cmd === 'get_product_sales_stats') return Promise.resolve(mockSalesData);
            return Promise.resolve([]);
        });
    });

    it('renders header and initial data', async () => {
        render(
            <ModalProvider>
                <ProductSales />
            </ModalProvider>
        );

        expect(screen.getByText(/상품별 판매 현황/i)).toBeInTheDocument();

        await waitFor(() => {
            // Check for table content instead of possibly blocking chart labels
            expect(screen.getByText('상품A')).toBeInTheDocument();
        }, { timeout: 10000 });
    });

    it('opens trend modal when a product is clicked', async () => {
        render(
            <ModalProvider>
                <ProductSales />
            </ModalProvider>
        );

        const productA = await screen.findByText('상품A');
        await user.click(productA);

        await waitFor(() => {
            expect(screen.getByText(/최근 10년간 판매 추이 분석/i)).toBeInTheDocument();
        }, { timeout: 10000 });
    });
});

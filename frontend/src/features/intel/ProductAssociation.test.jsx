import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import ProductAssociation from './ProductAssociation';
import { ModalProvider } from '../../contexts/ModalContext';
import * as apiBridge from '../../utils/apiBridge';

// Mock d3
vi.mock('d3', () => ({
    select: vi.fn().mockReturnValue({
        append: vi.fn().mockReturnThis(),
        attr: vi.fn().mockReturnThis(),
        style: vi.fn().mockReturnThis(),
        selectAll: vi.fn().mockReturnThis(),
        data: vi.fn().mockReturnThis(),
        join: vi.fn().mockReturnThis(),
        call: vi.fn().mockReturnThis(),
        text: vi.fn().mockReturnThis(),
        on: vi.fn().mockReturnThis(),
    }),
    forceSimulation: vi.fn().mockReturnValue({
        force: vi.fn().mockReturnThis(),
        on: vi.fn().mockReturnThis(),
        alphaTarget: vi.fn().mockReturnThis(),
        restart: vi.fn().mockReturnThis(),
    }),
    forceLink: vi.fn().mockReturnValue({
        id: vi.fn().mockReturnThis(),
        distance: vi.fn().mockReturnThis(),
    }),
    forceManyBody: vi.fn().mockReturnValue({
        strength: vi.fn().mockReturnThis(),
    }),
    forceCenter: vi.fn(),
    forceCollide: vi.fn().mockReturnValue({
        radius: vi.fn().mockReturnThis(),
    }),
    drag: vi.fn().mockReturnValue({
        on: vi.fn().mockReturnThis(),
    }),
}));

// Mock apiBridge
vi.mock('../../utils/apiBridge', () => ({
    invoke: vi.fn(),
    callBridge: vi.fn()
}));

describe('ProductAssociation Component', () => {
    let user;

    const mockAssociations = [
        { product_a: '사과', product_b: '배', pair_count: 5, support_percent: 10 }
    ];

    beforeEach(() => {
        user = userEvent.setup();
        vi.clearAllMocks();

        apiBridge.invoke.mockImplementation((cmd) => {
            if (cmd === 'get_product_associations') return Promise.resolve(mockAssociations);
            return Promise.resolve([]);
        });
    });

    it('renders header and loads association data', async () => {
        render(
            <ModalProvider>
                <ProductAssociation />
            </ModalProvider>
        );

        expect(screen.getByText(/상품 연관 분석/i)).toBeInTheDocument();

        await waitFor(() => {
            expect(screen.getByText('사과')).toBeInTheDocument();
        });
    });

    it('displays insight section when data is loaded', async () => {
        render(
            <ModalProvider>
                <ProductAssociation />
            </ModalProvider>
        );

        await waitFor(() => {
            expect(screen.getByText(/In-Depth Insights/i)).toBeInTheDocument();
            expect(screen.getByText(/사과/)).toBeInTheDocument();
            expect(screen.getByText(/배/)).toBeInTheDocument();
        });
    });
});

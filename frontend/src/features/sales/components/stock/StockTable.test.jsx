import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import StockTable from './StockTable';

describe('StockTable Component', () => {
    const mockProducts = [
        { product_id: 1, product_name: '느타리버섯', item_type: 'product', stock_quantity: 50, safety_stock: 10, specification: '1kg' },
        { product_id: 2, product_name: '택배박스(중)', item_type: 'aux_material', category: '박스/포장', stock_quantity: 5, safety_stock: 20, specification: '10개입' }
    ];
    const mockProps = {
        products: mockProducts,
        tab: 'harvest_item',
        getFreshnessInfo: vi.fn(id => id === 1 ? { diffDays: 2, dateStr: '2024-03-01' } : null),
        openAdjustModal: vi.fn(),
        openHarvestModal: vi.fn(),
        openConvertModal: vi.fn(),
        openBomModal: vi.fn()
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders products and correct headers', () => {
        render(<StockTable {...mockProps} />);
        expect(screen.getByText('느타리버섯')).toBeInTheDocument();
        expect(screen.getByText('상품명 (완제품)')).toBeInTheDocument(); // tab=harvest_item shows '상품명 (완제품)' in logic? No wait, check logic.
        // if (tab === 'raw_material') ... else if (tab === 'aux_material') ... else '상품명 (완제품)'
    });

    it('shows sub-tag for auxiliary material', () => {
        render(<StockTable {...mockProps} tab="aux_material" />);
        expect(screen.getByText('박스')).toBeInTheDocument();
    });

    it('shows safety stock warning', () => {
        render(<StockTable {...mockProps} />);
        // product 2 is low stock (5 <= 20)
        // Material symbols are rendered as text in JSDOM if not mocked, but here they are span with text 'error'
        expect(screen.getByTitle('안전재고 부족')).toBeInTheDocument();
    });

    it('shows freshness badge', () => {
        render(<StockTable {...mockProps} />);
        expect(screen.getByText(/신선/)).toBeInTheDocument();
    });

    it('triggers modal functions on button clicks', () => {
        render(<StockTable {...mockProps} />);

        const harvestBtns = screen.getAllByTitle('수확 입고');
        fireEvent.click(harvestBtns[0]);
        expect(mockProps.openHarvestModal).toHaveBeenCalledWith(1);

        const adjustBtns = screen.getAllByTitle('재고 조정');
        fireEvent.click(adjustBtns[1]); // for second item
        expect(mockProps.openAdjustModal).toHaveBeenCalledWith(mockProducts[1]);
    });
});

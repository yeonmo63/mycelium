import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import BatchProductionModal from './BatchProductionModal';
import * as apiBridge from '../../../../utils/apiBridge';

vi.mock('../../../../utils/apiBridge', () => ({
    callBridge: vi.fn(),
}));

describe('BatchProductionModal Component', () => {
    const mockProducts = [
        { product_id: 1, product_name: '느타리버섯 1kg', specification: '1kg', item_type: 'product', stock_quantity: 100 },
        { product_id: 2, product_name: '느타리 원물', specification: 'kg', item_type: 'harvest_item', stock_quantity: 500 },
        { product_id: 3, product_name: '1kg 박스', specification: 'EA', item_type: 'aux_material', stock_quantity: 200 }
    ];

    const mockBoms = [
        { material_id: 2, product_name: '느타리 원물', ratio: 1.1, stock_quantity: 500, item_type: 'harvest_item' },
        { material_id: 3, product_name: '1kg 박스', ratio: 1.0, stock_quantity: 200, item_type: 'aux_material' }
    ];

    const initialConvertModal = {
        targets: [{ id: 'target-1', productId: '1', qty: 10 }],
        deductions: [],
        primaryMaterialId: null,
        loading: false,
        memo: ''
    };

    const mockSetConvertModal = vi.fn();
    const mockHandleBatchConvert = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        apiBridge.callBridge.mockImplementation((fn, args) => {
            if (fn === 'get_product_bom' && args.productId === 1) return Promise.resolve(mockBoms);
            return Promise.resolve([]);
        });
    });

    it('renders and loads BOMs on mount', async () => {
        render(
            <BatchProductionModal
                isOpen={true}
                onClose={vi.fn()}
                convertModal={initialConvertModal}
                setConvertModal={mockSetConvertModal}
                products={mockProducts}
                handleBatchConvert={mockHandleBatchConvert}
            />
        );

        expect(screen.getByText('통합 상품화 처리')).toBeInTheDocument();

        await waitFor(() => {
            expect(apiBridge.callBridge).toHaveBeenCalledWith('get_product_bom', { productId: 1 });
        });
    });

    it('handles quantity change and triggers scaling when primary material changes', async () => {
        // We need a rendered state with deductions to test interactions
        // But since scaling logic is inside useEffect and handleDeductionQtyChange, we test if setConvertModal is called

        const modalWithDeductions = {
            ...initialConvertModal,
            deductions: [
                { id: 'deduct-1', materialId: 2, name: '느타리 원물', stock: 500, tQty: 11, rQty: 11, type: 'raw', ratio: 1.1 }
            ],
            primaryMaterialId: '2'
        };

        render(
            <BatchProductionModal
                isOpen={true}
                onClose={vi.fn()}
                convertModal={modalWithDeductions}
                setConvertModal={mockSetConvertModal}
                products={mockProducts}
                handleBatchConvert={mockHandleBatchConvert}
            />
        );

        const qtyInput = screen.getByDisplayValue('11');
        fireEvent.change(qtyInput, { target: { value: '22' } });

        // Scaling logic should trigger setConvertModal with new targets
        expect(mockSetConvertModal).toHaveBeenCalled();
    });

    it('calls handleBatchConvert when button is clicked', () => {
        render(
            <BatchProductionModal
                isOpen={true}
                onClose={vi.fn()}
                convertModal={initialConvertModal}
                setConvertModal={mockSetConvertModal}
                products={mockProducts}
                handleBatchConvert={mockHandleBatchConvert}
            />
        );

        const submitBtn = screen.getByText('통합 상품화 완료');
        fireEvent.click(submitBtn);

        expect(mockHandleBatchConvert).toHaveBeenCalled();
    });
});

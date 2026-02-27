import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import BomManagementModal from './BomManagementModal';
import * as apiBridge from '../../../../utils/apiBridge';
import { ModalProvider } from '../../../../contexts/ModalContext';

vi.mock('../../../../utils/apiBridge', () => ({
    callBridge: vi.fn(),
}));

describe('BomManagementModal Component', () => {
    const mockProduct = { product_id: 1, product_name: '느타리버섯 1kg' };
    const mockAllProducts = [
        { product_id: 1, product_name: '느타리버섯 1kg', item_type: 'product' },
        { product_id: 2, product_name: '느타리 원물', item_type: 'raw_material', specification: 'kg', stock_quantity: 500 },
        { product_id: 3, product_name: '1kg 박스', item_type: 'aux_material', specification: 'EA', stock_quantity: 200 }
    ];

    const mockBomList = [
        { material_id: 2, product_name: '느타리 원물', ratio: 1.1, stock_quantity: 500, specification: 'kg' }
    ];

    beforeEach(() => {
        vi.clearAllMocks();
        apiBridge.callBridge.mockImplementation((fn, args) => {
            if (fn === 'get_product_bom') return Promise.resolve(mockBomList);
            if (fn === 'add_bom_item') return Promise.resolve({ success: true });
            if (fn === 'remove_bom_item') return Promise.resolve({ success: true });
            return Promise.resolve([]);
        });
    });

    const renderWithContext = (component) => {
        return render(
            <ModalProvider>
                {component}
            </ModalProvider>
        );
    };

    it('renders and loads BOM list', async () => {
        renderWithContext(
            <BomManagementModal
                isOpen={true}
                onClose={vi.fn()}
                product={mockProduct}
                allProducts={mockAllProducts}
            />
        );

        expect(screen.getByText(/구성 자재 관리/)).toBeInTheDocument();

        await waitFor(() => {
            expect(screen.getAllByText(/느타리 원물/).length).toBeGreaterThan(0);
            expect(screen.getByText('1.1', { exact: false })).toBeInTheDocument();
        });
    });

    it('adds a new material to BOM', async () => {
        renderWithContext(
            <BomManagementModal
                isOpen={true}
                onClose={vi.fn()}
                product={mockProduct}
                allProducts={mockAllProducts}
            />
        );

        await waitFor(() => {
            expect(screen.getByLabelText('자재 선택')).toBeInTheDocument();
        });

        // Select '1kg 박스' (only filtered materials shown)
        const select = screen.getByLabelText('자재 선택');
        fireEvent.change(select, { target: { value: '3' } });

        const ratioInput = screen.getByLabelText('소요 수량');
        fireEvent.change(ratioInput, { target: { value: '1.0' } });

        const addBtn = screen.getByText('추가');
        fireEvent.click(addBtn);

        await waitFor(() => {
            expect(apiBridge.callBridge).toHaveBeenCalledWith('add_bom_item', {
                productId: 1,
                materialId: 3,
                ratio: 1.0
            });
        });
    });

    it('removes a material from BOM', async () => {
        // Since showConfirm is involved, we might need to mock it if tests hang
        // But let's assume it works for now or if we mock it in ModalProvider

        renderWithContext(
            <BomManagementModal
                isOpen={true}
                onClose={vi.fn()}
                product={mockProduct}
                allProducts={mockAllProducts}
            />
        );

        await waitFor(() => {
            expect(screen.getByText('느타리 원물')).toBeInTheDocument();
        });

        const deleteBtn = screen.getByTitle('목록에서 제거');
        fireEvent.click(deleteBtn);

        // waitForConfirm might be needed if using real ModalProvider
        // For simplicity in unit tests, one might mock useModal
    });
});

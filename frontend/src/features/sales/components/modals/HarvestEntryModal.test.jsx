import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import HarvestEntryModal from './HarvestEntryModal';

describe('HarvestEntryModal Component', () => {
    const mockProducts = [
        { product_id: 1, product_name: '느타리버섯', item_type: 'harvest_item', status: '정상' },
        { product_id: 2, product_name: '표고버섯', item_type: 'harvest_item', status: '정상' }
    ];
    const mockHarvestModal = {
        items: [{ id: 1, targetId: 1, qty: '10', grade: 'A' }],
        memo: '오늘 수확량 좋음'
    };
    const mockProps = {
        isOpen: true,
        onClose: vi.fn(),
        harvestModal: mockHarvestModal,
        setHarvestModal: vi.fn(),
        products: mockProducts,
        handleHarvest: vi.fn()
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders nothing when isOpen is false', () => {
        const { container } = render(<HarvestEntryModal {...mockProps} isOpen={false} />);
        expect(container.firstChild).toBeNull();
    });

    it('renders modal content correctly', () => {
        render(<HarvestEntryModal {...mockProps} />);
        expect(screen.getByText('농산물 수확 입고')).toBeInTheDocument();
        expect(screen.getByDisplayValue('오늘 수확량 좋음')).toBeInTheDocument();
        expect(screen.getByDisplayValue('10')).toBeInTheDocument();
        expect(screen.getByText('📦 느타리버섯')).toBeInTheDocument();
    });

    it('handles adding new harvest item', () => {
        render(<HarvestEntryModal {...mockProps} />);
        const addBtn = screen.getByText('수확 품목 추가');
        fireEvent.click(addBtn);
        expect(mockProps.setHarvestModal).toHaveBeenCalled();
    });

    it('handles removing harvest item if more than 1', () => {
        const multiItemModal = {
            ...mockHarvestModal,
            items: [
                { id: 1, targetId: 1, qty: '10', grade: 'A' },
                { id: 2, targetId: 2, qty: '5', grade: 'B' }
            ]
        };
        render(<HarvestEntryModal {...mockProps} harvestModal={multiItemModal} />);
        const deleteBtns = screen.getAllByText('delete');
        fireEvent.click(deleteBtns[0]);
        expect(mockProps.setHarvestModal).toHaveBeenCalled();
    });

    it('triggers handleHarvest on click', () => {
        render(<HarvestEntryModal {...mockProps} />);
        const finishBtn = screen.getByText('수확 입고 완료');
        fireEvent.click(finishBtn);
        expect(mockProps.handleHarvest).toHaveBeenCalled();
    });

    it('triggers onClose when cancel button or backdrop clicked', () => {
        render(<HarvestEntryModal {...mockProps} />);
        const cancelBtn = screen.getByText('취소');
        fireEvent.click(cancelBtn);
        expect(mockProps.onClose).toHaveBeenCalled();
    });
});

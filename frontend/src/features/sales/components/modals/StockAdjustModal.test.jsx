import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import StockAdjustModal from './StockAdjustModal';

describe('StockAdjustModal Component', () => {
    const mockProduct = { product_id: 1, product_name: '느타리버섯', stock_quantity: 100, specification: '1kg' };
    const mockProps = {
        isOpen: true,
        onClose: vi.fn(),
        product: mockProduct,
        val: '10',
        setVal: vi.fn(),
        reason: '',
        setReason: vi.fn(),
        memo: '',
        setMemo: vi.fn(),
        handleAdjustStock: vi.fn()
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders current and adjusted stock values', () => {
        render(<StockAdjustModal {...mockProps} />);
        expect(screen.getByText('100')).toBeInTheDocument(); // 현재고
        expect(screen.getByText('110')).toBeInTheDocument(); // 조정 후 (100 + 10)
    });

    it('updates quantity value', () => {
        render(<StockAdjustModal {...mockProps} />);
        const input = screen.getByPlaceholderText('0');
        fireEvent.change(input, { target: { value: '20' } });
        expect(mockProps.setVal).toHaveBeenCalledWith('20');
    });

    it('updates reason and memo', () => {
        render(<StockAdjustModal {...mockProps} />);
        const reasonSelect = screen.getByRole('combobox');
        fireEvent.change(reasonSelect, { target: { value: '폐기손실' } });
        expect(mockProps.setReason).toHaveBeenCalledWith('폐기손실');

        const memoArea = screen.getByPlaceholderText('상세 내용을 입력하세요.');
        fireEvent.change(memoArea, { target: { value: '파손 발생' } });
        expect(mockProps.setMemo).toHaveBeenCalledWith('파손 발생');
    });

    it('calls handleAdjustStock on save', () => {
        render(<StockAdjustModal {...mockProps} />);
        const saveBtn = screen.getByText('저장 완료');
        fireEvent.click(saveBtn);
        expect(mockProps.handleAdjustStock).toHaveBeenCalled();
    });
});

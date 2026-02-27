import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import EventCheckoutSummary from './EventCheckoutSummary';

describe('EventCheckoutSummary', () => {
    const defaultProps = {
        paymentMethod: '현금',
        setPaymentMethod: vi.fn(),
        memo: '',
        setMemo: vi.fn(),
        totalAmount: 12000,
        onCheckout: vi.fn(),
        cartLength: 1
    };

    it('renders payment methods and memo input', () => {
        render(<EventCheckoutSummary {...defaultProps} />);
        expect(screen.getByText('결제 수단')).toBeInTheDocument();
        expect(screen.getByText('현금')).toBeInTheDocument();
        expect(screen.getByText('카드')).toBeInTheDocument();
        expect(screen.getByText('계좌이체')).toBeInTheDocument();
        expect(screen.getByPlaceholderText('빨간 모자 손님, 대량 구매 등')).toBeInTheDocument();
    });

    it('calls setPaymentMethod when a method is clicked', () => {
        render(<EventCheckoutSummary {...defaultProps} />);
        fireEvent.click(screen.getByText('카드'));
        expect(defaultProps.setPaymentMethod).toHaveBeenCalledWith('카드');
    });

    it('calls setMemo on input change', () => {
        render(<EventCheckoutSummary {...defaultProps} />);
        const input = screen.getByPlaceholderText('빨간 모자 손님, 대량 구매 등');
        fireEvent.change(input, { target: { value: '메모 테스트' } });
        expect(defaultProps.setMemo).toHaveBeenCalledWith('메모 테스트');
    });

    it('displays total amount correctly', () => {
        render(<EventCheckoutSummary {...defaultProps} totalAmount={25500} />);
        expect(screen.getByText('25,500원')).toBeInTheDocument();
    });

    it('calls onCheckout when save button is clicked', () => {
        render(<EventCheckoutSummary {...defaultProps} />);
        const saveBtn = screen.getByRole('button', { name: '' }); // Lucide-react Icon button has no name usually
        // Let's find by finding the button that contains the Save icon
        // Or just using the last button
        const buttons = screen.getAllByRole('button');
        const checkoutBtn = buttons[buttons.length - 1]; // Save button is at the end
        fireEvent.click(checkoutBtn);
        expect(defaultProps.onCheckout).toHaveBeenCalled();
    });

    it('disables checkout button when cart is empty', () => {
        render(<EventCheckoutSummary {...defaultProps} cartLength={0} />);
        const buttons = screen.getAllByRole('button');
        const checkoutBtn = buttons[buttons.length - 1];
        expect(checkoutBtn).toBeDisabled();
    });
});

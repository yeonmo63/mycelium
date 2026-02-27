import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import ReceptionFooter from './ReceptionFooter';

describe('ReceptionFooter Component', () => {
    const mockProps = {
        summary: { count: 2, qty: 10, amount: 100000 },
        handleReset: vi.fn(),
        handlePrintStatement: vi.fn(),
        handleSaveAll: vi.fn(),
        isProcessing: false,
        customer: { customer_id: 1 },
        salesRows: [{ sales_id: 1 }]
    };

    it('renders totals correctly', () => {
        render(<ReceptionFooter {...mockProps} />);
        expect(screen.getByText('2건')).toBeInTheDocument();
        expect(screen.getByText('10개')).toBeInTheDocument();
        expect(screen.getByText('100,000원')).toBeInTheDocument();
    });

    it('disables save button if no customer', () => {
        render(<ReceptionFooter {...mockProps} customer={null} />);
        const saveBtn = screen.getByText('일괄 저장하기').closest('button');
        expect(saveBtn).toBeDisabled();
    });

    it('shows loading state on save button', () => {
        render(<ReceptionFooter {...mockProps} isProcessing={true} />);
        expect(screen.getByText('refresh')).toHaveClass('animate-spin');
    });

    it('calls handleReset on reset button click', () => {
        render(<ReceptionFooter {...mockProps} />);
        fireEvent.click(screen.getByText('초기화'));
        expect(mockProps.handleReset).toHaveBeenCalled();
    });

    it('calls handleSaveAll on save button click', () => {
        render(<ReceptionFooter {...mockProps} />);
        fireEvent.click(screen.getByText('일괄 저장하기'));
        expect(mockProps.handleSaveAll).toHaveBeenCalled();
    });
});

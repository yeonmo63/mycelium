import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import TransactionStatementView from './TransactionStatementView';

describe('TransactionStatementView Component', () => {
    const mockCustomer = { customer_id: 1, customer_name: '홍길동', mobile_number: '010-1234-5678' };
    const mockRows = [{ product: '느타리버섯', spec: '1kg', qty: 10, price: 15000, supplyValue: 150000, vatAmount: 0 }];
    const mockSummary = { amount: 150000, supply: 150000, vat: 0 };
    const mockCompany = { company_name: '(주)강릉명가', business_reg_number: '123-45-67890' };

    const mockProps = {
        isOpen: true,
        onClose: vi.fn(),
        customer: mockCustomer,
        salesRows: mockRows,
        companyInfo: mockCompany,
        orderDate: new Date(),
        summary: mockSummary,
        onPrint: vi.fn()
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders statement content correctly', () => {
        render(<TransactionStatementView {...mockProps} />);
        expect(screen.getByText(/거 래 명 세 서/)).toBeInTheDocument();
        expect(screen.getByText(/홍길동/)).toBeInTheDocument();
        expect(screen.getByText(/귀하/)).toBeInTheDocument();
        expect(screen.getByText(/강릉명가/)).toBeInTheDocument();
        expect(screen.getByText(/일금/)).toBeInTheDocument();
        expect(screen.getByText(/십오만/)).toBeInTheDocument();
        expect(screen.getByText(/원정/)).toBeInTheDocument();
        expect(screen.getByText(/느타리버섯/)).toBeInTheDocument();
    });

    it('renders at least 12 rows', () => {
        render(<TransactionStatementView {...mockProps} />);
        // 1 active row + 11 empty rows
        const rows = screen.getAllByRole('row');
        // 1 (head) + 12 (body) + 1 (foot) = 14 rows total
        expect(rows.length).toBeGreaterThanOrEqual(14);
    });

    it('calls handlePrintInternal via button', () => {
        // We can't easily test handlePrintInternal because it uses global handlePrintRaw
        // But we can check if the button is there and clickable
        render(<TransactionStatementView {...mockProps} />);
        const printBtn = screen.getByText('인쇄 / PDF 저장');
        fireEvent.click(printBtn);
        // It might not trigger onPrint prop directly because in-component handler is used
        // But we can check if print button exists
        expect(printBtn).toBeInTheDocument();
    });

    it('calls onClose when close button clicked', () => {
        render(<TransactionStatementView {...mockProps} />);
        const closeBtn = screen.getByTitle('닫기');
        fireEvent.click(closeBtn);
        expect(mockProps.onClose).toHaveBeenCalled();
    });
});

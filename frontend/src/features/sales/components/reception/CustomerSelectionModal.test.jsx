import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import CustomerSelectionModal from './CustomerSelectionModal';

describe('CustomerSelectionModal Component', () => {
    const mockSearchResults = [
        { customer_id: 1, customer_name: '홍길동', mobile_number: '010-1234-5678', address_primary: '서울시 강남구' },
        { customer_id: 2, customer_name: '김철수', mobile_number: '010-9876-5432', address_primary: '부산시 해운대구' }
    ];

    const mockSelectCustomer = vi.fn();
    const mockOnClose = vi.fn();
    const mockSetQuickRegisterName = vi.fn();
    const mockSetShowRegisterModal = vi.fn();

    it('renders customer list when open', () => {
        render(
            <CustomerSelectionModal
                isOpen={true}
                onClose={mockOnClose}
                searchResults={mockSearchResults}
                selectCustomer={mockSelectCustomer}
                setQuickRegisterName={mockSetQuickRegisterName}
                setShowRegisterModal={mockSetShowRegisterModal}
                custSearchRef={{ current: { value: 'test' } }}
            />
        );

        expect(screen.getByText('고객 선택')).toBeInTheDocument();
        expect(screen.getByText('홍길동')).toBeInTheDocument();
        expect(screen.getByText('김철수')).toBeInTheDocument();
    });

    it('calls selectCustomer and onClose when a row is clicked', () => {
        render(
            <CustomerSelectionModal
                isOpen={true}
                onClose={mockOnClose}
                searchResults={mockSearchResults}
                selectCustomer={mockSelectCustomer}
                setQuickRegisterName={mockSetQuickRegisterName}
                setShowRegisterModal={mockSetShowRegisterModal}
                custSearchRef={{ current: { value: 'test' } }}
            />
        );

        const rows = screen.getAllByTestId('customer-row');
        fireEvent.click(rows[0]);

        expect(mockSelectCustomer).toHaveBeenCalledWith(mockSearchResults[0]);
        expect(mockOnClose).toHaveBeenCalled();
    });

    it('triggers quick registration when button is clicked', () => {
        const searchInputVal = '새로운고객';
        render(
            <CustomerSelectionModal
                isOpen={true}
                onClose={mockOnClose}
                searchResults={mockSearchResults}
                selectCustomer={mockSelectCustomer}
                setQuickRegisterName={mockSetQuickRegisterName}
                setShowRegisterModal={mockSetShowRegisterModal}
                custSearchRef={{ current: { value: searchInputVal } }}
            />
        );

        const registerBtn = screen.getByText('신규 고객으로 등록');
        fireEvent.click(registerBtn);

        expect(mockOnClose).toHaveBeenCalled();
        expect(mockSetQuickRegisterName).toHaveBeenCalledWith(searchInputVal);
        expect(mockSetShowRegisterModal).toHaveBeenCalledWith(true);
    });
});

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import SalesInputPanel from './SalesInputPanel';

describe('SalesInputPanel Component', () => {
    const mockProducts = [{ product_id: 1, product_name: '느타리버섯' }];
    const mockAddresses = [{ address_id: 1, address_primary: '강릉시...', is_default: true }];
    const mockInputState = {
        product: '',
        spec: '1kg',
        qty: '1',
        price: 15000,
        amount: 15000,
        discountRate: '0',
        shipType: 'basic',
        shipZip: '',
        shipAddr1: '',
        shipAddr2: '',
        shipName: '',
        shipMobile: '',
        shipMemo: '',
        isSaveAddr: false
    };
    const mockProps = {
        inputState: mockInputState,
        handleInputChange: vi.fn(),
        products: mockProducts,
        addresses: mockAddresses,
        prodSelectRef: { current: null },
        handleAddressSearch: vi.fn(),
        handleAddRow: vi.fn(),
        editingTempId: null
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders input fields correctly', () => {
        render(<SalesInputPanel {...mockProps} />);
        expect(screen.getByText('상품 선택')).toBeInTheDocument();
        expect(screen.getAllByDisplayValue('15,000')).toHaveLength(2);
        expect(screen.getByText('리스트 추가')).toBeInTheDocument();
    });

    it('triggers handleInputChange on field changes', () => {
        render(<SalesInputPanel {...mockProps} />);

        const productSelect = screen.getByRole('combobox', { name: /상품명/i });
        fireEvent.change(productSelect, { target: { name: 'product', value: '느타리버섯' } });
        expect(mockProps.handleInputChange).toHaveBeenCalled();

        const qtyInput = screen.getByLabelText('수량');
        fireEvent.change(qtyInput, { target: { name: 'qty', value: '5' } });
        expect(mockProps.handleInputChange).toHaveBeenCalled();
    });

    it('triggers handleAddressSearch when clicking address fields', () => {
        render(<SalesInputPanel {...mockProps} />);
        const addrInput = screen.getByLabelText(/기본 배송 주소/);
        fireEvent.click(addrInput);
        expect(mockProps.handleAddressSearch).toHaveBeenCalledWith('input');
    });

    it('renders Edit button when editingTempId is present', () => {
        render(<SalesInputPanel {...mockProps} editingTempId="temp_1" />);
        expect(screen.getByText('수정 적용')).toBeInTheDocument();
    });

    it('triggers handleAddRow on click', () => {
        render(<SalesInputPanel {...mockProps} />);
        fireEvent.click(screen.getByText('리스트 추가'));
        expect(mockProps.handleAddRow).toHaveBeenCalled();
    });
});

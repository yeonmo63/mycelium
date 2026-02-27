import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import EventProductQuickSelect from './EventProductQuickSelect';

describe('EventProductQuickSelect Component', () => {
    const mockProducts = [
        { product_id: 1, product_name: '느타리버섯', specification: '1kg', unit_price: 15000 },
        { product_id: 2, product_name: '표고버섯', specification: '500g', unit_price: 10000 }
    ];
    const mockOnSelectProduct = vi.fn();
    const mockFormatCurrency = (val) => val.toLocaleString();

    it('renders product list correctly', () => {
        render(
            <EventProductQuickSelect
                products={mockProducts}
                onSelectProduct={mockOnSelectProduct}
                formatCurrency={mockFormatCurrency}
            />
        );

        expect(screen.getByText('느타리버섯')).toBeInTheDocument();
        expect(screen.getByText('1kg')).toBeInTheDocument();
        expect(screen.getByText('15,000원')).toBeInTheDocument();

        expect(screen.getByText('표고버섯')).toBeInTheDocument();
        expect(screen.getByText('500g')).toBeInTheDocument();
        expect(screen.getByText('10,000원')).toBeInTheDocument();
    });

    it('triggers onSelectProduct when a product is clicked', () => {
        render(
            <EventProductQuickSelect
                products={mockProducts}
                onSelectProduct={mockOnSelectProduct}
                formatCurrency={mockFormatCurrency}
            />
        );

        fireEvent.click(screen.getByText('느타리버섯'));
        expect(mockOnSelectProduct).toHaveBeenCalledWith('느타리버섯');
    });
});

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import EventCustomerSearch from './EventCustomerSearch';

describe('EventCustomerSearch Component', () => {
    const defaultProps = {
        searchQuery: '',
        setSearchQuery: vi.fn(),
        handleSearch: vi.fn(),
        searchResults: [],
        handleSelectResult: vi.fn(),
        isSearching: false,
        setShowRegisterForm: vi.fn()
    };

    it('renders search input and search button', () => {
        render(<EventCustomerSearch {...defaultProps} />);
        expect(screen.getByPlaceholderText('고객명 또는 이벤트명 검색')).toBeInTheDocument();
        expect(screen.getByText('검색')).toBeInTheDocument();
    });

    it('calls setSearchQuery on input change', () => {
        render(<EventCustomerSearch {...defaultProps} />);
        const input = screen.getByPlaceholderText('고객명 또는 이벤트명 검색');
        fireEvent.change(input, { target: { value: '홍길동' } });
        expect(defaultProps.setSearchQuery).toHaveBeenCalledWith('홍길동');
    });

    it('calls handleSearch when search button is clicked', () => {
        render(<EventCustomerSearch {...defaultProps} />);
        fireEvent.click(screen.getByText('검색'));
        expect(defaultProps.handleSearch).toHaveBeenCalled();
    });

    it('displays search results when provided', () => {
        const results = [
            { customer_id: 1, customer_name: '홍길동', mobile_number: '010-1234-5678', _type: 'customer' },
            { event_id: 101, event_name: '주말 장터', start_date: '2024-01-01', end_date: '2024-01-02', _type: 'event' }
        ];
        render(<EventCustomerSearch {...defaultProps} searchResults={results} />);

        expect(screen.getByText('홍길동')).toBeInTheDocument();
        expect(screen.getByText('고객')).toBeInTheDocument();
        expect(screen.getByText('010-1234-5678 | 주소 없음')).toBeInTheDocument();

        expect(screen.getByText('주말 장터')).toBeInTheDocument();
        expect(screen.getByText('행사')).toBeInTheDocument();
        expect(screen.getByText('2024-01-01 ~ 2024-01-02')).toBeInTheDocument();
    });

    it('calls handleSelectResult when a result is clicked', () => {
        const results = [{ customer_id: 1, customer_name: '홍길동', mobile_number: '010-1234-5678', _type: 'customer' }];
        render(<EventCustomerSearch {...defaultProps} searchResults={results} />);

        fireEvent.click(screen.getByText('홍길동'));
        expect(defaultProps.handleSelectResult).toHaveBeenCalledWith(results[0]);
    });

    it('shows register new customer button when no results found', () => {
        render(<EventCustomerSearch {...defaultProps} searchQuery="새로운사람" searchResults={[]} isSearching={false} />);
        expect(screen.getByText(/"새로운사람" 신규 고객 등록하기/i)).toBeInTheDocument();
    });

    it('calls setShowRegisterForm when register button is clicked', () => {
        render(<EventCustomerSearch {...defaultProps} searchQuery="새로운사람" searchResults={[]} isSearching={false} />);
        fireEvent.click(screen.getByText(/"새로운사람" 신규 고객 등록하기/i));
        expect(defaultProps.setShowRegisterForm).toHaveBeenCalledWith(true);
    });
});

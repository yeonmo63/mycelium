import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import AuditTrail from './AuditTrail';

describe('AuditTrail Component', () => {
    const mockLogs = [
        {
            created_at: '2026-02-27 10:00:00',
            change_type: '입고',
            product_name: '느타리 원물',
            change_quantity: 50,
            current_stock: 550,
            memo: '수확 입고'
        },
        {
            created_at: '2026-02-27 11:30:00',
            change_type: '출고',
            product_name: '느타리버섯 1kg',
            change_quantity: -10,
            current_stock: 90,
            memo: '판매 출고'
        }
    ];

    const mockLoadData = vi.fn();
    const mockSetHideAutoLogs = vi.fn();
    const mockSetLogSearchQuery = vi.fn();

    it('renders logs grouped by date', async () => {
        render(
            <AuditTrail
                logs={mockLogs}
                hideAutoLogs={false}
                setHideAutoLogs={mockSetHideAutoLogs}
                logSearchQuery=""
                setLogSearchQuery={mockSetLogSearchQuery}
                loadData={mockLoadData}
            />
        );

        expect(screen.getByText('재고 감사 로그 (Audit Trail)')).toBeInTheDocument();
        expect(screen.getAllByText('2026-02-27').length).toBeGreaterThan(0);
        expect(screen.getByText('느타리 원물')).toBeInTheDocument();
        expect(screen.getAllByText(/\+50/).length).toBeGreaterThan(0);
        expect(screen.getAllByText(/-10/).length).toBeGreaterThan(0);
    });

    it('handles search query change', () => {
        render(
            <AuditTrail
                logs={mockLogs}
                hideAutoLogs={false}
                setHideAutoLogs={mockSetHideAutoLogs}
                logSearchQuery=""
                setLogSearchQuery={mockSetLogSearchQuery}
                loadData={mockLoadData}
            />
        );

        const searchInput = screen.getByPlaceholderText('로그 내역 검색...');
        fireEvent.change(searchInput, { target: { value: '느타리' } });

        expect(mockSetLogSearchQuery).toHaveBeenCalledWith('느타리');
    });

    it('handles hide auto logs toggle', () => {
        render(
            <AuditTrail
                logs={mockLogs}
                hideAutoLogs={false}
                setHideAutoLogs={mockSetHideAutoLogs}
                logSearchQuery=""
                setLogSearchQuery={mockSetLogSearchQuery}
                loadData={mockLoadData}
            />
        );

        const toggle = screen.getByLabelText('시스템 자동로그 숨김');
        fireEvent.click(toggle);

        expect(mockSetHideAutoLogs).toHaveBeenCalled();
    });

    it('calls loadData when refresh button is clicked', () => {
        render(
            <AuditTrail
                logs={mockLogs}
                hideAutoLogs={false}
                setHideAutoLogs={mockSetHideAutoLogs}
                logSearchQuery=""
                setLogSearchQuery={mockSetLogSearchQuery}
                loadData={mockLoadData}
            />
        );

        const refreshBtn = screen.getByText('refresh');
        fireEvent.click(refreshBtn);

        expect(mockLoadData).toHaveBeenCalled();
    });
});

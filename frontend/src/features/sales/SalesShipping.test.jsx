import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import SalesShipping from './SalesShipping';
import { ModalProvider } from '../../contexts/ModalContext';
import * as apiBridge from '../../utils/apiBridge';
import * as printUtils from '../../utils/printUtils';

// Mock apiBridge
vi.mock('../../utils/apiBridge', () => ({
    callBridge: vi.fn(),
    invoke: vi.fn()
}));

// Mock printUtils
vi.mock('../../utils/printUtils', () => ({
    handlePrintRaw: vi.fn()
}));

describe('SalesShipping Component', () => {
    let user;

    const mockShipments = [
        {
            sales_id: 'S1',
            order_date: '2023-10-01T10:00:00',
            customer_name: '홍길동',
            mobile_number: '010-1111-2222',
            product_name: '느타리버섯',
            specification: '2kg',
            quantity: 2,
            total_amount: 20000,
            shipping_address_primary: '서울시 강남구',
            shipping_name: '홍길동',
            current_status: '접수'
        },
        {
            sales_id: 'S2',
            order_date: '2023-10-02T11:00:00',
            customer_name: '김철수',
            mobile_number: '010-3333-4444',
            product_name: '표고버섯',
            specification: '1kg',
            quantity: 1,
            total_amount: 15000,
            shipping_address_primary: '경기도 수원시',
            shipping_name: '김철수',
            current_status: '입금완료'
        }
    ];

    beforeEach(() => {
        user = userEvent.setup();
        vi.clearAllMocks();
        localStorage.clear();

        // Default mock implementation for loadData
        apiBridge.callBridge.mockImplementation((command, args) => {
            if (command === 'get_shipments_by_status') {
                if (args.status === '접수') return Promise.resolve([mockShipments[0]]);
                if (args.status === '입금완료') return Promise.resolve([mockShipments[1]]);
                return Promise.resolve([]);
            }
            return Promise.resolve([]);
        });
    });

    it('renders and displays data', async () => {
        render(
            <ModalProvider>
                <SalesShipping />
            </ModalProvider>
        );

        expect(await screen.findByText(/배송 관리/i)).toBeInTheDocument();

        // Use findAllByText for customer names as they appear in both table and hidden print report
        const s1Cells = await screen.findAllByText('홍길동');
        expect(s1Cells.length).toBeGreaterThan(0);

        const s2Cells = await screen.findAllByText('김철수');
        expect(s2Cells.length).toBeGreaterThan(0);
    });

    it('filters data by status', async () => {
        render(
            <ModalProvider>
                <SalesShipping />
            </ModalProvider>
        );

        await screen.findAllByText('홍길동');
        await screen.findAllByText('김철수');

        // Click '접수' filter - using a more specific selector
        const receiptFilter = screen.getByText(/^접수$/, { selector: 'div' }).closest('div');
        await user.click(receiptFilter);

        expect(screen.queryByText('김철수')).not.toBeInTheDocument();
        expect(screen.getByText('홍길동', { selector: 'div.font-black' })).toBeInTheDocument();
    });

    it('handles status update actions', async () => {
        render(
            <ModalProvider>
                <SalesShipping />
            </ModalProvider>
        );

        const rows = await screen.findAllByText('홍길동');
        // The one in the table usually has specific classes
        const s1Row = rows.find(el => el.closest('tr'));
        await user.click(s1Row);

        const confirmBtn = await screen.findByRole('button', { name: /입금확인/i });
        await user.click(confirmBtn);

        const modalConfirmBtn = await screen.findByRole('button', { name: /^확인$/ });
        await user.click(modalConfirmBtn);

        await waitFor(() => {
            expect(apiBridge.callBridge).toHaveBeenCalledWith('update_sale_status', expect.objectContaining({
                salesId: 'S1',
                status: '입금완료'
            }));
        });
    });

    it('handles shipping process (Tracking Number)', async () => {
        render(
            <ModalProvider>
                <SalesShipping />
            </ModalProvider>
        );

        const rows = await screen.findAllByText('김철수');
        const s2Row = rows.find(el => el.closest('tr'));
        await user.click(s2Row);

        const shipBtn = await screen.findByRole('button', { name: /배송처리/i });
        await user.click(shipBtn);

        const trackingInput = await screen.findByPlaceholderText(/운송장번호/i);
        await user.type(trackingInput, '12345678');

        const submitBtn = screen.getByRole('button', { name: /배송 처리 완료/i });
        await user.click(submitBtn);

        await waitFor(() => {
            expect(apiBridge.callBridge).toHaveBeenCalledWith('complete_shipment', expect.objectContaining({
                salesId: 'S2',
                trackingNumber: '12345678'
            }));
        });
    });

    it('triggers CSV download', async () => {
        const mockCreateObjectURL = vi.fn().mockReturnValue('blob:mock-url');
        global.URL.createObjectURL = mockCreateObjectURL;
        const mockLinkClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => { });

        render(
            <ModalProvider>
                <SalesShipping />
            </ModalProvider>
        );

        await screen.findAllByText('홍길동');
        const csvBtn = screen.getByRole('button', { name: /CSV 저장/i });
        await user.click(csvBtn);

        expect(mockCreateObjectURL).toHaveBeenCalled();
        mockLinkClick.mockRestore();
    });

    it('opens print preview and calls print utility', async () => {
        render(
            <ModalProvider>
                <SalesShipping />
            </ModalProvider>
        );

        await screen.findAllByText('홍길동');
        const previewBtn = await screen.findByText(/인쇄 미리보기/i);
        await user.click(previewBtn);

        expect(await screen.findByText(/배송 관리 현황 보고서/i)).toBeInTheDocument();
        const printBtn = screen.getByRole('button', { name: /인쇄하기/i });
        await user.click(printBtn);

        expect(printUtils.handlePrintRaw).toHaveBeenCalled();
    });

    it('handles delete action', async () => {
        render(
            <ModalProvider>
                <SalesShipping />
            </ModalProvider>
        );

        const rows = await screen.findAllByText('홍길동');
        const s1Row = rows.find(el => el.closest('tr'));
        await user.click(s1Row);

        const deleteBtn = await screen.findByRole('button', { name: /삭제/i });
        await user.click(deleteBtn);

        // Confirmation modal
        const modalConfirmBtn = await screen.findByRole('button', { name: /^확인$/ });
        await user.click(modalConfirmBtn);

        await waitFor(() => {
            expect(apiBridge.callBridge).toHaveBeenCalledWith('delete_sale', expect.objectContaining({
                salesId: 'S1'
            }));
        });
    });
});

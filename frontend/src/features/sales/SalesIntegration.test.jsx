import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import SalesOnlineSync from './SalesOnlineSync';
import * as apiBridge from '../../utils/apiBridge';

vi.mock('../../utils/apiBridge', () => ({
    invoke: vi.fn(),
}));

vi.mock('../../contexts/ModalContext', () => ({
    useModal: () => ({
        showAlert: vi.fn().mockResolvedValue(true),
        showConfirm: vi.fn().mockResolvedValue(true),
    }),
    ModalProvider: ({ children }) => <div>{children}</div>
}));

describe('Sales Online Sync - Integration Flow', () => {
    const mockProducts = [
        { product_id: 1, product_name: '느타리버섯 1kg', specification: '1kg', unit_price: 12000, item_type: 'product' },
        { product_id: 2, product_name: '표고버섯 500g', specification: '500g', unit_price: 8000, item_type: 'product' }
    ];

    const mockCustomers = [
        { customer_id: 101, customer_name: '홍길동', mobile_number: '010-1234-5678' }
    ];

    const csvData = '구매자명,수취인연락처1,우편번호,배송지,상품명,수량,상품가격,주문번호\n' +
        '홍길동,010-1234-5678,12345,서울시 강남구,느타리버섯 1kg,2,12000,ORD-001';

    beforeEach(() => {
        vi.clearAllMocks();
        window.localStorage.clear();

        apiBridge.invoke.mockImplementation(async (fn, args) => {
            // Add a small delay to simulate real world async behavior more accurately
            await new Promise(resolve => setTimeout(resolve, 0));

            if (fn === 'get_product_list') return mockProducts;
            if (fn === 'search_customers') return mockCustomers;
            if (fn === 'create_sale') return { success: true };
            if (fn === 'create_customer') return { customerId: 101 };
            return [];
        });

        // Robust Mock FileReader
        vi.stubGlobal('FileReader', vi.fn().mockImplementation(function () {
            this.readAsArrayBuffer = vi.fn((file) => {
                const buffer = new TextEncoder().encode(csvData).buffer;
                // Use a slightly larger delay or just Promise.resolve to trigger onload
                Promise.resolve().then(() => {
                    if (this.onload) this.onload({ target: { result: buffer } });
                });
            });
        }));
    });

    it('should complete the flow: Upload CSV -> Review Mappings -> Sync Sales', async () => {
        render(<SalesOnlineSync />);

        // 1. Initial State - Wait for initial data load
        await waitFor(() => {
            expect(apiBridge.invoke).toHaveBeenCalledWith('get_product_list');
        }, { timeout: 5000 });

        expect(await screen.findByText(/주문 데이터 수집/i)).toBeInTheDocument();

        // 2. Select Mall Type & Upload File
        const mallSelect = screen.getByLabelText(/쇼핑몰 선택/i);
        fireEvent.change(mallSelect, { target: { value: 'generic' } });

        const file = new File(['test'], 'orders.csv', { type: 'text/csv' });
        const hiddenInput = document.getElementById('file-upload');
        fireEvent.change(hiddenInput, { target: { files: [file] } });

        // Wait for file selection state update
        expect(await screen.findByText(/orders.csv/i)).toBeInTheDocument();

        // 3. Parse File
        const parseBtn = screen.getByText(/엑셀 분석 시작/i);
        fireEvent.click(parseBtn);

        // 4. Review Step - Verify customer and product matching
        // The parsing and identification involves multiple async calls
        const reviewTitle = await screen.findByText(/분석된 주문 리스트/i, {}, { timeout: 10000 });
        expect(reviewTitle).toBeInTheDocument();

        // Verify customer matching results in the table
        await waitFor(() => {
            expect(screen.getByText('홍길동')).toBeInTheDocument();
            expect(screen.getByText(/Exist/i)).toBeInTheDocument();
        }, { timeout: 5000 });

        // Verify product auto-matching
        await waitFor(() => {
            const selects = screen.getAllByRole('combobox');
            const matchedSelect = selects.find(s => s.value === '1');
            expect(matchedSelect).toBeDefined();
        }, { timeout: 5000 });

        // 5. Sync Execution
        const syncBtn = screen.getByText(/주문 연동 실행하기/i);
        fireEvent.click(syncBtn);

        // 6. Verification - Wait for create_sale and return to upload step
        await waitFor(() => {
            expect(apiBridge.invoke).toHaveBeenCalledWith('create_sale', expect.objectContaining({
                customerId: 101,
                productName: '느타리버섯 1kg',
                quantity: 2
            }));
        }, { timeout: 10000 });

        // Transition back to upload step happens after showAlert is awaited
        // In the mock, it resolves instantly.
        expect(await screen.findByText(/주문 데이터 수집/i, {}, { timeout: 5000 })).toBeInTheDocument();
    }, 30000);


});

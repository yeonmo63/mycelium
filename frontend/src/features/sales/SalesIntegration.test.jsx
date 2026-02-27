import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import SalesOnlineSync from './SalesOnlineSync';
import * as apiBridge from '../../utils/apiBridge';

// Increase timeout for the whole file if it's a heavy integration test
vi.mock('../../utils/apiBridge', () => ({
    invoke: vi.fn(),
}));

vi.mock('../../contexts/ModalContext', () => ({
    useModal: () => ({
        showAlert: vi.fn().mockImplementation(() => Promise.resolve(true)),
        showConfirm: vi.fn().mockImplementation(() => Promise.resolve(true)),
    }),
    ModalProvider: ({ children }) => <div data-testid="modal-provider">{children}</div>
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
            // Simulate very short network delay
            await new Promise(resolve => setTimeout(resolve, 5));

            if (fn === 'get_product_list') return mockProducts;
            if (fn === 'search_customers') return mockCustomers;
            if (fn === 'create_sale') return { success: true };
            if (fn === 'create_customer') return { customerId: 101 };
            if (fn === 'fetch_external_orders') return [];
            return [];
        });

        // Robust Mock FileReader that behaves more like a real one
        vi.stubGlobal('FileReader', vi.fn().mockImplementation(function () {
            this.readAsArrayBuffer = vi.fn((file) => {
                const buffer = new TextEncoder().encode(csvData).buffer;
                // Using a non-zero timeout helps ensure React has finished any immediate updates
                // and correctly assigned event handlers before they are fired.
                setTimeout(() => {
                    if (this.onload) {
                        this.onload({ target: { result: buffer } });
                    }
                    if (this.onloadend) {
                        this.onloadend({ target: { result: buffer } });
                    }
                }, 10);
            });
        }));
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        cleanup();
    });

    it('should complete the flow: Upload CSV -> Review Mappings -> Sync Sales', async () => {
        render(<SalesOnlineSync />);

        // 1. Initial State - Wait for initial data load to be triggered
        // Checking for the text is more stable than checking the raw mock call count immediately
        expect(await screen.findByText(/주문 데이터 수집/i)).toBeInTheDocument();

        // Ensure base data load (get_product_list) has been called
        await waitFor(() => {
            expect(apiBridge.invoke).toHaveBeenCalledWith('get_product_list');
        }, { timeout: 3000 });

        // 2. Select Mall Type & Upload File
        const mallSelect = screen.getByLabelText(/쇼핑몰 선택/i);
        fireEvent.change(mallSelect, { target: { value: 'generic' } });

        const file = new File(['test'], 'orders.csv', { type: 'text/csv' });
        const hiddenInput = document.getElementById('file-upload');

        // We use fireEvent followed by expectation for better tracking of state transitions
        fireEvent.change(hiddenInput, { target: { files: [file] } });
        expect(await screen.findByText(/orders.csv/i, {}, { timeout: 3000 })).toBeInTheDocument();

        // 3. Parse File
        const parseBtn = screen.getByText(/엑셀 분석 시작/i);
        fireEvent.click(parseBtn);

        // 4. Review Step - Verify customer and product matching
        // Transition to review step involves FileReader (async) + Customer Search (async)
        const reviewTitle = await screen.findByText(/분석된 주문 리스트/i, {}, { timeout: 10000 });
        expect(reviewTitle).toBeInTheDocument();

        // Check if customer "홍길동" from CSV is matched correctly
        await waitFor(() => {
            const customerCell = screen.queryByText('홍길동');
            expect(customerCell).toBeInTheDocument();
            // Checking the "Exist" badge which appears when a customer is found
            expect(screen.getByText(/Exist/i)).toBeInTheDocument();
        }, { timeout: 5000 });

        // Verify product matching (Product 1 should be selected in the combo)
        await waitFor(() => {
            const selects = screen.getAllByRole('combobox');
            // Looking for a select that has a value matching our mock product id
            const productSelect = selects.find(s => s.value === '1');
            expect(productSelect).toBeDefined();
        }, { timeout: 5000 });

        // 5. Sync Execution
        const syncBtn = screen.getByText(/주문 연동 실행하기/i);
        fireEvent.click(syncBtn);

        // 6. Verification - Wait for create_sale calls
        // In this case, we have 1 row in CSV
        await waitFor(() => {
            expect(apiBridge.invoke).toHaveBeenCalledWith('create_sale', expect.objectContaining({
                customerId: 101, // From our mockCustomers or mock create_customer
                productName: '느타리버섯 1kg',
                quantity: 2
            }));
        }, { timeout: 10000 });

        // Finally, it should return to the upload step after the success alert is cleared
        // Since showAlert is mocked to resolve instantly, the transition should be immediate.
        expect(await screen.findByText(/주문 데이터 수집/i, {}, { timeout: 5000 })).toBeInTheDocument();
    }, 40000); // Higher test timeout for integration flow
});

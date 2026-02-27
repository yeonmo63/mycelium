import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import SalesReception from './SalesReception';
import { ModalProvider } from '../../contexts/ModalContext';
import * as apiBridge from '../../utils/apiBridge';
import * as printUtils from '../../utils/printUtils';

vi.mock('../../utils/apiBridge', () => ({
    callBridge: vi.fn(),
    invoke: vi.fn()
}));

vi.mock('../../utils/printUtils', () => ({
    handlePrintRaw: vi.fn()
}));

global.window.daum = { Postcode: vi.fn(() => ({ embed: vi.fn() })) };

describe('SalesReception - Final', () => {
    let user;
    beforeEach(() => {
        user = userEvent.setup();
        vi.clearAllMocks();
        localStorage.clear();
    });

    it('CSV 업로드 및 출력 기능 테스트', async () => {
        const mockCustomer = { customer_id: 'C100', customer_name: '홍길동', mobile_number: '0101234', address_primary: '서울' };
        apiBridge.callBridge.mockImplementation((cmd) => {
            if (cmd === 'get_product_list') return Promise.resolve([{ product_id: 1, product_name: '느타리버섯', specification: '2kg', unit_price: 10000, item_type: 'product' }]);
            if (cmd === 'search_customers_by_name') return Promise.resolve([mockCustomer]);
            if (cmd === 'get_company_info') return Promise.resolve({ company_name: '농장' });
            return Promise.resolve([]);
        });

        const { container } = render(<ModalProvider><SalesReception /></ModalProvider>);
        await screen.findByText(/일반 접수/i);

        // 1. CSV 업로드
        const csvContent = "이름,전화번호,우편번호,주소1,주소2,상품명\n김철수,010-1111-2222,12345,서울,아파트,느타리버섯";
        const file = new File([csvContent], 'test.csv', { type: 'text/csv' });
        fireEvent.change(container.querySelector('input[type="file"]'), { target: { files: [file] } });
        await waitFor(() => expect(screen.queryByText('김철수')).toBeInTheDocument());

        // 2. 검색 및 추가
        const searchInput = screen.getByPlaceholderText(/이름 입력 후 엔터.../i);
        await user.type(searchInput, '홍길동{enter}');
        await screen.findByText(/C100/i);

        const comboboxes = await screen.findAllByRole('combobox');
        const productSelect = comboboxes.find(el => el.name === 'product');
        fireEvent.change(productSelect, { target: { value: '느타리버섯' } });

        await waitFor(() => {
            const priceFields = screen.getAllByDisplayValue(/10.000/);
            expect(priceFields.length).toBeGreaterThan(0);
        });

        await user.click(screen.getByText(/리스트 추가/i));
        await waitFor(() => expect(screen.getAllByText('느타리버섯').length).toBeGreaterThan(0));

        // 3. 출력 모달
        const printBtn = await screen.findByRole('button', { name: /거래명세서 출력/i });
        await user.click(printBtn);

        // Use findByRole for the heading to avoid matching the button text
        await screen.findByRole('heading', { name: /거\s*래\s*명\s*세\s*서/ });

        await user.click(screen.getByText(/인쇄 \/ PDF 저장/i));
        expect(printUtils.handlePrintRaw).toHaveBeenCalled();
    });

    it('초안 복구(Draft Recovery) 기능 테스트', async () => {
        apiBridge.callBridge.mockImplementation((cmd) => {
            if (cmd === 'get_product_list') return Promise.resolve([]);
            if (cmd === 'get_company_info') return Promise.resolve({ company_name: '농장' });
            return Promise.resolve([]);
        });

        const draftData = {
            customer: { customer_id: 'C999', customer_name: '초안고객' },
            salesRows: [{ tempId: 123, product: '느타리버섯', qty: 5, price: 10000, amount: 50000, isDirty: true }]
        };
        localStorage.setItem('mycelium_draft_reception', JSON.stringify(draftData));

        render(<ModalProvider><SalesReception /></ModalProvider>);

        // Draft recovery modal should pop up
        await screen.findByText(/저장되지 않은 데이터가 있습니다/i);
        const restoreBtn = screen.getByRole('button', { name: /데이터 복구하기/i });
        await user.click(restoreBtn);

        // Verify restored data
        await waitFor(() => {
            expect(screen.getByText('초안고객')).toBeInTheDocument();
            expect(screen.getByText('느타리버섯')).toBeInTheDocument();
        });
    });
});

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import FinanceVendor from './FinanceVendor';
import { ModalProvider } from '../../contexts/ModalContext';
import * as apiBridge from '../../utils/apiBridge';
import { BrowserRouter } from 'react-router-dom';

vi.mock('../../utils/apiBridge', () => ({
    invoke: vi.fn(),
    callBridge: vi.fn()
}));

// Mock useAdminGuard
vi.mock('../../hooks/useAdminGuard', () => ({
    useAdminGuard: () => ({
        isAuthorized: true,
        checkAdmin: vi.fn().mockResolvedValue(true),
        isVerifying: false
    })
}));

describe('FinanceVendor Component', () => {
    let user;

    const mockVendors = [
        {
            vendor_id: 1,
            vendor_name: '테스트 상사',
            business_number: '123-45-67890',
            representative: '김대표',
            mobile_number: '010-1234-5678',
            address: '서울시 강남구',
            main_items: '포장재'
        }
    ];

    beforeEach(() => {
        user = userEvent.setup();
        vi.clearAllMocks();
        apiBridge.invoke.mockImplementation((cmd) => {
            if (cmd === 'get_vendors') return Promise.resolve(mockVendors);
            return Promise.resolve([]);
        });
    });

    it('renders and displays vendor list', async () => {
        render(
            <BrowserRouter>
                <ModalProvider>
                    <FinanceVendor />
                </ModalProvider>
            </BrowserRouter>
        );

        expect(await screen.findByText('테스트 상사')).toBeInTheDocument();
        expect(screen.getByText('김대표')).toBeInTheDocument();
        expect(screen.getByText('포장재')).toBeInTheDocument();
    });

    it('saves a new vendor', async () => {
        apiBridge.invoke.mockImplementation((cmd) => {
            if (cmd === 'get_vendors') return Promise.resolve(mockVendors);
            if (cmd === 'save_vendor') return Promise.resolve({ success: true });
            return Promise.resolve([]);
        });

        render(
            <BrowserRouter>
                <ModalProvider>
                    <FinanceVendor />
                </ModalProvider>
            </BrowserRouter>
        );

        await screen.findByText('테스트 상사');

        await user.type(screen.getByLabelText(/거래처명/i), '신규 거래처');
        await user.type(screen.getByLabelText(/대표자/i), '이재능');
        await user.type(screen.getByLabelText(/사업자번호/i), '999-99-99999');

        const saveBtn = screen.getByRole('button', { name: /저장하기/i });
        await user.click(saveBtn);

        await waitFor(() => {
            expect(apiBridge.invoke).toHaveBeenCalledWith('save_vendor', expect.objectContaining({
                vendor_name: '신규 거래처',
                representative: '이재능'
            }));
        });

        expect(await screen.findByText(/거래처 정보가 저장되었습니다/i)).toBeInTheDocument();
    });

    it('filters vendor list', async () => {
        render(
            <BrowserRouter>
                <ModalProvider>
                    <FinanceVendor />
                </ModalProvider>
            </BrowserRouter>
        );

        await screen.findByText('테스트 상사');

        const searchInput = screen.getByPlaceholderText(/거래처명 또는 품목 검색/i);
        await user.type(searchInput, '존재하지않는업체');

        expect(screen.queryByText('테스트 상사')).not.toBeInTheDocument();
    });
});

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import SettingsProduct from './SettingsProduct';
import * as apiBridge from '../../utils/apiBridge';
import { BrowserRouter } from 'react-router-dom';

vi.mock('../../utils/apiBridge', () => ({
    callBridge: vi.fn(),
    invoke: vi.fn()
}));

// Mock useModal
const mockShowAlert = vi.fn().mockResolvedValue(true);
const mockShowConfirm = vi.fn().mockResolvedValue(true);
vi.mock('../../contexts/ModalContext', () => ({
    useModal: () => ({
        showAlert: mockShowAlert,
        showConfirm: mockShowConfirm
    }),
    ModalProvider: ({ children }) => <div>{children}</div>
}));

// Mock useAdminGuard
vi.mock('../../hooks/useAdminGuard', () => ({
    useAdminGuard: () => ({
        isAuthorized: true,
        checkAdmin: vi.fn().mockResolvedValue(true),
        isVerifying: false
    })
}));

describe('SettingsProduct Component', () => {
    let user;

    const mockProducts = [
        { product_id: 1, product_name: '표고버섯 1kg', item_type: 'product', unit_price: 15000, safety_stock: 10, stock_quantity: 50, status: '판매중' },
        { product_id: 2, product_name: '박스 (대)', item_type: 'aux_material', unit_price: 0, safety_stock: 100, stock_quantity: 200, status: '판매중' },
        { product_id: 3, product_name: '생표고 원물', item_type: 'harvest_item', unit_price: 0, safety_stock: 50, stock_quantity: 10, status: '판매중' }
    ];

    beforeEach(() => {
        user = userEvent.setup();
        vi.clearAllMocks();
        apiBridge.callBridge.mockImplementation((cmd) => {
            if (cmd === 'get_product_list') return Promise.resolve(mockProducts);
            if (cmd === 'get_product_bom') return Promise.resolve([]);
            return Promise.resolve({ success: true });
        });
    });

    it('renders and displays product list by default', async () => {
        render(
            <BrowserRouter>
                <SettingsProduct />
            </BrowserRouter>
        );

        expect(await screen.findByText('표고버섯 1kg')).toBeInTheDocument();
        // Since default tab is 'product', others should be filtered out
        expect(screen.queryByText('박스 (대)')).not.toBeInTheDocument();
    });

    it('switches tabs and displays materials', async () => {
        render(
            <BrowserRouter>
                <SettingsProduct />
            </BrowserRouter>
        );

        await screen.findByText('표고버섯 1kg');

        const materialTab = screen.getByRole('button', { name: /부자재/i });
        await user.click(materialTab);

        expect(await screen.findByText('박스 (대)')).toBeInTheDocument();
        expect(screen.queryByText('표고버섯 1kg')).not.toBeInTheDocument();
    });

    it('filters products by search query', async () => {
        render(
            <BrowserRouter>
                <SettingsProduct />
            </BrowserRouter>
        );

        await screen.findByText('표고버섯 1kg');

        const searchInput = screen.getByPlaceholderText(/이름으로 검색/i);
        await user.type(searchInput, '존재하지않는');

        expect(screen.queryByText('표고버섯 1kg')).not.toBeInTheDocument();
    });

    it('opens modal and adds a new product with BOM', async () => {
        render(
            <BrowserRouter>
                <SettingsProduct />
            </BrowserRouter>
        );

        await screen.findByText('표고버섯 1kg');

        const addBtn = screen.getByRole('button', { name: /새 항목 추가/i });
        await user.click(addBtn);

        // Modal should appear
        expect(screen.getByText(/완제품 등록/i)).toBeInTheDocument();

        // Fill basic info
        await user.type(screen.getByPlaceholderText(/상품 또는 자재 이름을 입력하세요/i), '신규 선물세트');

        const priceInput = screen.getByLabelText(/판매 가격/i);
        await user.clear(priceInput);
        await user.type(priceInput, '30000');

        const costInput = screen.getByLabelText(/원가 \(Cost Price\)/i);
        await user.clear(costInput);
        await user.type(costInput, '10000');

        // Add BOM item
        const addBomBtn = screen.getByRole('button', { name: /농산물 추가/i });
        await user.click(addBomBtn);

        // Select material in BOM
        const materialSelect = screen.getByLabelText(/원재료 선택/i);
        await user.selectOptions(materialSelect, '3'); // Select '생표고 원물'

        const saveBtn = screen.getByRole('button', { name: /등록 완료/i });
        await user.click(saveBtn);

        await waitFor(() => {
            expect(apiBridge.callBridge).toHaveBeenCalledWith('create_product', expect.objectContaining({
                productName: '신규 선물세트',
                unitPrice: 30000
            }));
            expect(apiBridge.callBridge).toHaveBeenCalledWith('save_product_bom', expect.objectContaining({
                bomList: expect.arrayContaining([
                    expect.objectContaining({ material_id: 3 })
                ])
            }));
        });
    });
});

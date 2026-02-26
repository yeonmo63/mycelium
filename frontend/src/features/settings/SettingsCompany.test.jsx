import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import SettingsCompany from './SettingsCompany';
import { ModalProvider } from '../../contexts/ModalContext';
import * as apiBridge from '../../utils/apiBridge';
import { BrowserRouter } from 'react-router-dom';

vi.mock('../../utils/apiBridge', () => ({
    invoke: vi.fn(),
    callBridge: vi.fn()
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

describe('SettingsCompany Component', () => {
    let user;

    const mockCompanyInfo = {
        company_name: '마이셀리움 농장',
        representative_name: '홍길동',
        phone_number: '02-123-4567',
        mobile_number: '010-1234-5678',
        business_reg_number: '123-45-67890',
        registration_date: '2020-01-01',
        address: '경기도 양평군',
        business_type: '농업',
        item: '버섯',
        memo: '테스트용 메모',
        certification_info: { gap: 'GAP123', haccp: 'HACCP123', organic: 'ORG123' }
    };

    beforeEach(() => {
        user = userEvent.setup();
        vi.clearAllMocks();
        apiBridge.callBridge.mockImplementation((cmd) => {
            if (cmd === 'get_company_info') return Promise.resolve(mockCompanyInfo);
            if (cmd === 'save_company_info') return Promise.resolve({ success: true });
            return Promise.resolve(null);
        });
    });

    it('renders and displays company info', async () => {
        render(
            <BrowserRouter>
                <SettingsCompany />
            </BrowserRouter>
        );

        expect(await screen.findByDisplayValue('마이셀리움 농장')).toBeInTheDocument();
        expect(screen.getByDisplayValue('홍길동')).toBeInTheDocument();
        expect(screen.getByDisplayValue('GAP123')).toBeInTheDocument();
    });

    it('validates required company name', async () => {
        render(
            <BrowserRouter>
                <SettingsCompany />
            </BrowserRouter>
        );

        const companyInput = await screen.findByDisplayValue('마이셀리움 농장');
        await user.clear(companyInput);

        const saveBtn = screen.getByRole('button', { name: /설정 저장/i });
        await user.click(saveBtn);

        expect(mockShowAlert).toHaveBeenCalled();
    });

    it('saves updated company info', async () => {
        render(
            <BrowserRouter>
                <SettingsCompany />
            </BrowserRouter>
        );

        const companyInput = await screen.findByDisplayValue('마이셀리움 농장');
        await user.clear(companyInput);
        await user.type(companyInput, '수정된 농장명');

        const saveBtn = screen.getByRole('button', { name: /설정 저장/i });
        await user.click(saveBtn);

        await waitFor(() => {
            expect(apiBridge.callBridge).toHaveBeenCalledWith('save_company_info', expect.objectContaining({
                companyName: '수정된 농장명'
            }));
        });

        expect(mockShowAlert).toHaveBeenCalledWith(expect.any(String), expect.stringContaining('업체 정보가 저장되었습니다'));
    });
});

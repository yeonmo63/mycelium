import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import SettingsUser from './SettingsUser';
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

describe('SettingsUser Component', () => {
    let user;

    const mockUsers = [
        { id: 1, username: 'admin', role: 'admin', ui_mode: 'pro', created_at: '2023-01-01' },
        { id: 2, username: 'tester', role: 'user', ui_mode: 'lite', created_at: '2023-02-01' }
    ];

    beforeEach(() => {
        user = userEvent.setup();
        vi.clearAllMocks();
        apiBridge.callBridge.mockImplementation((cmd) => {
            if (cmd === 'get_all_users') return Promise.resolve(mockUsers);
            return Promise.resolve({ success: true });
        });
    });

    it('renders and displays user list', async () => {
        render(
            <BrowserRouter>
                <SettingsUser />
            </BrowserRouter>
        );

        expect(await screen.findByText('admin')).toBeInTheDocument();
        expect(screen.getByText('tester')).toBeInTheDocument();
        expect(screen.getAllByText('관리자').length).toBeGreaterThan(0);
    });

    it('creates a new user', async () => {
        render(
            <BrowserRouter>
                <SettingsUser />
            </BrowserRouter>
        );

        await screen.findByText('admin');

        await user.type(screen.getByPlaceholderText(/사용자 아이디 입력/i), 'newuser');
        await user.type(screen.getByPlaceholderText(/비밀번호 입력/i), 'pass123');

        const regBtn = screen.getByRole('button', { name: /사용자 등록 완료/i });
        await user.click(regBtn);

        await waitFor(() => {
            expect(apiBridge.callBridge).toHaveBeenCalledWith('create_user', expect.objectContaining({
                username: 'newuser',
                password: 'pass123',
                role: 'user'
            }));
        });

        expect(mockShowAlert).toHaveBeenCalledWith('등록 완료', expect.any(String));
    });

    it('edits an existing user', async () => {
        render(
            <BrowserRouter>
                <SettingsUser />
            </BrowserRouter>
        );

        await screen.findByText('tester');

        const rows = screen.getAllByRole('row');
        const testerRow = rows.find(row => row.textContent.includes('tester'));
        const editBtn = within(testerRow).getByLabelText('수정');
        await user.click(editBtn);

        const usernameInput = screen.getByPlaceholderText(/사용자 아이디 입력/i);
        expect(usernameInput.value).toBe('tester');

        await user.clear(usernameInput);
        await user.type(usernameInput, 'updated_tester');
        const saveBtn = screen.getByRole('button', { name: /수정 사항 저장/i });
        await user.click(saveBtn);

        await waitFor(() => {
            expect(apiBridge.callBridge).toHaveBeenCalledWith('update_user', expect.objectContaining({
                id: 2,
                username: 'updated_tester'
            }));
        });
    });

    it('prevents deleting admin user', async () => {
        render(
            <BrowserRouter>
                <SettingsUser />
            </BrowserRouter>
        );

        await screen.findByText('admin');

        const rows = screen.getAllByRole('row');
        const adminRow = rows.find(row => row.textContent.includes('admin') && row.textContent.includes('System'));
        const deleteBtn = within(adminRow).getByLabelText('삭제');

        expect(deleteBtn).toBeDisabled();
    });

    it('deletes a user after confirmation', async () => {
        mockShowConfirm.mockResolvedValueOnce(true);
        render(
            <BrowserRouter>
                <SettingsUser />
            </BrowserRouter>
        );

        await screen.findByText('tester');

        const rows = screen.getAllByRole('row');
        const testerRow = rows.find(row => row.textContent.includes('tester'));
        const deleteBtn = within(testerRow).getByLabelText('삭제');
        await user.click(deleteBtn);

        expect(mockShowConfirm).toHaveBeenCalled();
        await waitFor(() => {
            expect(apiBridge.callBridge).toHaveBeenCalledWith('delete_user', { id: 2 });
        });
    });
});

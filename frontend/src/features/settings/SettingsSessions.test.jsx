import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import SettingsSessions from './SettingsSessions';
import { BrowserRouter } from 'react-router-dom';
import * as apiBridge from '../../utils/apiBridge';
import { ModalProvider, useModal } from '../../contexts/ModalContext';
import * as adminGuard from '../../hooks/useAdminGuard';
import userEvent from '@testing-library/user-event';

// Mock the modules
vi.mock('../../utils/apiBridge', () => ({
    invoke: vi.fn(),
    callBridge: vi.fn()
}));

vi.mock('../../hooks/useAdminGuard', () => ({
    useAdminGuard: vi.fn()
}));

vi.mock('../../contexts/ModalContext', () => ({
    useModal: vi.fn(),
    ModalProvider: vi.fn(({ children }) => <div>{children}</div>)
}));

const mockShowAlert = vi.fn().mockResolvedValue(true);
const mockShowConfirm = vi.fn().mockResolvedValue(true);

const mockSessions = [
    {
        session_id: 'sess_1',
        user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        client_ip: '192.168.0.1',
        last_activity: '2026-02-26T12:00:00Z',
        created_at: '2026-02-26T09:00:00Z'
    },
    {
        session_id: 'sess_2',
        user_agent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
        client_ip: '1.2.3.4',
        last_activity: '2026-02-26T12:05:00Z',
        created_at: '2026-02-26T10:00:00Z'
    }
];

describe('SettingsSessions Component', () => {
    const user = userEvent.setup();

    beforeEach(() => {
        vi.clearAllMocks();

        // Mock Admin Guard to be authorized
        adminGuard.useAdminGuard.mockReturnValue({
            isAuthorized: true,
            checkAdmin: vi.fn().mockResolvedValue(true),
            isVerifying: false
        });

        // Mock useModal
        vi.mocked(useModal).mockReturnValue({
            showAlert: mockShowAlert,
            showConfirm: mockShowConfirm
        });

        // Mock API responses
        apiBridge.callBridge.mockImplementation((command) => {
            if (command === 'get_auth_sessions') return Promise.resolve(mockSessions);
            if (command === 'revoke_auth_session') return Promise.resolve({ success: true });
            return Promise.resolve({ success: true });
        });
    });

    const renderComponent = () => {
        return render(
            <BrowserRouter>
                <SettingsSessions />
            </BrowserRouter>
        );
    };

    it('renders and displays active sessions', async () => {
        renderComponent();

        await waitFor(() => {
            expect(screen.getByText('Chrome (Windows)')).toBeInTheDocument();
            expect(screen.getByText('Safari (iPhone)')).toBeInTheDocument();
        });

        expect(screen.getByText('192.168.0.1')).toBeInTheDocument();
        expect(screen.getByText('1.2.3.4')).toBeInTheDocument();
    });

    it('revokes a session when logout is clicked', async () => {
        renderComponent();

        await waitFor(() => screen.getByText('Chrome (Windows)'));

        const logoutBtns = screen.getAllByRole('button', { name: /기기 로그아웃/i });
        await user.click(logoutBtns[1]); // Safari session

        expect(mockShowConfirm).toHaveBeenCalledWith('원격 로그아웃', '해당 기기에서 로그아웃 시키겠습니까?');

        await waitFor(() => {
            expect(apiBridge.callBridge).toHaveBeenCalledWith('revoke_auth_session', { session_id: 'sess_2' });
            expect(mockShowAlert).toHaveBeenCalledWith('완료', '원격 로그아웃 처리되었습니다.');
        });
    });

    it('reloads sessions when "새로고침" is clicked', async () => {
        renderComponent();

        await waitFor(() => screen.getByText('Chrome (Windows)'));

        const refreshBtn = screen.getByRole('button', { name: /새로고침/i });
        await user.click(refreshBtn);

        expect(apiBridge.callBridge).toHaveBeenCalledWith('get_auth_sessions');
    });

    it('shows empty state when no sessions exist', async () => {
        apiBridge.callBridge.mockResolvedValueOnce([]);

        renderComponent();

        await waitFor(() => {
            expect(screen.getByText('활성 세션이 없습니다.')).toBeInTheDocument();
        });
    });
});

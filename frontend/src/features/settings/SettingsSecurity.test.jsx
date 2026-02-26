import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import SettingsSecurity from './SettingsSecurity';
import { BrowserRouter } from 'react-router-dom';
import * as apiBridge from '../../utils/apiBridge';
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

const mockSecurityStatus = {
    is_secure: false,
    warnings: [
        {
            code: 'JWT_SECRET',
            level: 'High',
            message: '기본 JWT 비밀키 사용 중',
            recommendation: '보안을 위해 강력한 비밀키로 변경하세요.'
        },
        {
            code: 'DB_BACKUP',
            level: 'Medium',
            message: '정기 백업 설정 미비',
            recommendation: '데이터 보호를 위해 일일 백업을 활성화하세요.'
        }
    ]
};

describe('SettingsSecurity Component', () => {
    const user = userEvent.setup();

    beforeEach(() => {
        vi.clearAllMocks();

        // Mock Admin Guard to be authorized
        adminGuard.useAdminGuard.mockReturnValue({
            isAuthorized: true,
            checkAdmin: vi.fn().mockResolvedValue(true),
            isVerifying: false
        });

        // Mock API responses
        apiBridge.callBridge.mockImplementation((command) => {
            if (command === 'get_security_status') return Promise.resolve(mockSecurityStatus);
            return Promise.resolve({ success: true });
        });
    });

    const renderComponent = () => {
        return render(
            <BrowserRouter>
                <SettingsSecurity />
            </BrowserRouter>
        );
    };

    it('renders and displays security status and warnings', async () => {
        renderComponent();

        await waitFor(() => {
            expect(screen.getByText('조치가 필요한 보안 취약점이 발견되었습니다')).toBeInTheDocument();
        });

        expect(screen.getByText('기본 JWT 비밀키 사용 중')).toBeInTheDocument();
        expect(screen.getByText('정기 백업 설정 미비')).toBeInTheDocument();
        expect(screen.getByText(/보안을 위해 강력한 비밀키로 변경하세요/)).toBeInTheDocument();
    });

    it('shows secure message when no warnings exist', async () => {
        apiBridge.callBridge.mockResolvedValueOnce({
            is_secure: true,
            warnings: []
        });

        renderComponent();

        await waitFor(() => {
            expect(screen.getByText('시스템이 안전하게 보호되고 있습니다')).toBeInTheDocument();
        });

        expect(screen.getByText('감지된 보안 위협이 없습니다.')).toBeInTheDocument();
    });

    it('re-scans security when "다시 검사하기" is clicked', async () => {
        renderComponent();

        await waitFor(() => screen.getByText('기본 JWT 비밀키 사용 중'));

        const refreshBtn = screen.getByRole('button', { name: /다시 검사하기/i });
        await user.click(refreshBtn);

        expect(apiBridge.callBridge).toHaveBeenCalledWith('get_security_status');
    });

    it('displays loading state during scan', async () => {
        // Delay the response
        apiBridge.callBridge.mockImplementation(() => new Promise(resolve => setTimeout(() => resolve(mockSecurityStatus), 100)));

        renderComponent();

        expect(screen.getByText('시스템 보안 분석 중...')).toBeInTheDocument();

        await waitFor(() => {
            expect(screen.queryByText('시스템 보안 분석 중...')).not.toBeInTheDocument();
        });
    });
});

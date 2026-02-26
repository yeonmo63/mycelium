import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import SmsLogManager from './SmsLogManager';
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

const mockSmsLogs = [
    {
        log_id: '1',
        recipient_name: '홍길동',
        mobile_number: '01012345678',
        content: '안녕하세요, 홍길동님! 예약이 완료되었습니다.',
        status: '성공',
        sent_at: '2026-02-26 12:00:00'
    },
    {
        log_id: '2',
        recipient_name: '이순신',
        mobile_number: '01011112222',
        content: '특가 이벤트 안내입니다.',
        status: '실패',
        sent_at: '2026-02-26 12:05:00'
    }
];

describe('SmsLogManager Component', () => {
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
            showAlert: vi.fn()
        });

        // Mock API responses
        apiBridge.invoke.mockImplementation((command) => {
            if (command === 'get_sms_logs') return Promise.resolve(mockSmsLogs);
            return Promise.resolve({ success: true });
        });
    });

    const renderComponent = () => {
        return render(
            <BrowserRouter>
                <SmsLogManager />
            </BrowserRouter>
        );
    };

    it('renders and displays SMS logs', async () => {
        renderComponent();

        await waitFor(() => {
            expect(screen.getByText('홍길동')).toBeInTheDocument();
            expect(screen.getByText('이순신')).toBeInTheDocument();
        });

        expect(screen.getByText('01012345678')).toBeInTheDocument();
        expect(screen.getByText('발송완료')).toBeInTheDocument();
        expect(screen.getByText('발송실패')).toBeInTheDocument();
        expect(screen.getByText(/예약이 완료되었습니다/)).toBeInTheDocument();
    });

    it('filters logs by search term', async () => {
        renderComponent();

        await waitFor(() => screen.getByText('홍길동'));

        const searchInput = screen.getByPlaceholderText(/검색/);
        await user.type(searchInput, '이순신');

        expect(screen.queryByText('홍길동')).not.toBeInTheDocument();
        expect(screen.getByText('이순신')).toBeInTheDocument();
    });

    it('reloads logs when "새로고침" is clicked', async () => {
        renderComponent();

        await waitFor(() => screen.getByText('홍길동'));

        const refreshBtn = screen.getByRole('button', { name: /새로고침/i });
        await user.click(refreshBtn);

        expect(apiBridge.invoke).toHaveBeenCalledWith('get_sms_logs');
    });

    it('shows empty state when no logs match search', async () => {
        renderComponent();

        await waitFor(() => screen.getByText('홍길동'));

        const searchInput = screen.getByPlaceholderText(/검색/);
        await user.type(searchInput, '존재하지않는이름');

        expect(screen.getByText('발송 내역이 없습니다.')).toBeInTheDocument();
    });
});

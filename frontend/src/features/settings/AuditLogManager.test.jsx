import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import AuditLogManager from './AuditLogManager';
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

const mockAuditLogs = [
    {
        log_id: '1',
        user_name: '관리자',
        user_id: 1,
        action_type: 'LOGIN',
        description: '로그인 성공',
        ip_address: '127.0.0.1',
        user_agent: 'Chrome',
        created_at: '2026-02-26T12:00:00Z',
        old_values: null,
        new_values: { login_ip: '127.0.0.1' }
    },
    {
        log_id: '2',
        user_name: '조작자',
        user_id: 2,
        action_type: 'UPDATE_PRODUCT',
        description: '상품 수정: 버섯',
        target_table: 'products',
        target_id: 'p1',
        ip_address: '192.168.0.5',
        user_agent: 'Firefox',
        created_at: '2026-02-26T12:05:00Z',
        old_values: { price: 1000 },
        new_values: { price: 1200 }
    }
];

describe('AuditLogManager Component', () => {
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
            if (command === 'get_audit_logs') return Promise.resolve(mockAuditLogs);
            return Promise.resolve({ success: true });
        });
    });

    const renderComponent = () => {
        return render(
            <BrowserRouter>
                <AuditLogManager />
            </BrowserRouter>
        );
    };

    it('renders and displays audit logs in a table', async () => {
        renderComponent();

        await waitFor(() => {
            expect(screen.getByText('로그인 성공')).toBeInTheDocument();
            expect(screen.getByText('상품 수정: 버섯')).toBeInTheDocument();
        });

        expect(screen.getByText('관리자')).toBeInTheDocument();
        expect(screen.getByText('조작자')).toBeInTheDocument();
        expect(screen.getByText('LOGIN')).toBeInTheDocument();
        expect(screen.getByText('UPDATE_PRODUCT')).toBeInTheDocument();
    });

    it('filters logs when action type button is clicked', async () => {
        renderComponent();

        await waitFor(() => screen.getByText('로그인 성공'));

        const loginFilterBtn = screen.getByRole('button', { name: '로그인' });
        await user.click(loginFilterBtn);

        expect(apiBridge.callBridge).toHaveBeenCalledWith('get_audit_logs', expect.objectContaining({
            action_type: 'LOGIN'
        }));
    });

    it('opens detail modal when eye icon is clicked', async () => {
        renderComponent();

        await waitFor(() => screen.getByText('로그인 성공'));

        const detailBtns = screen.getAllByRole('button').filter(b => b.querySelector('svg'));
        // Better: target the button in the second row (Update Product)
        const updateProductRow = screen.getByText('상품 수정: 버섯').closest('tr');
        const detailBtn = updateProductRow.querySelector('button');

        await user.click(detailBtn);

        expect(screen.getByText('상세 감사 데이터 조회')).toBeInTheDocument();
        expect(screen.getByText(/"price": 1000/)).toBeInTheDocument();
        expect(screen.getByText(/"price": 1200/)).toBeInTheDocument();
    });

    it('closes detail modal when close button is clicked', async () => {
        renderComponent();

        await waitFor(() => screen.getByText('로그인 성공'));

        const updateProductRow = screen.getByText('상품 수정: 버섯').closest('tr');
        const detailBtn = updateProductRow.querySelector('button');

        await user.click(detailBtn);
        expect(screen.getByText('상세 감사 데이터 조회')).toBeInTheDocument();

        const closeBtn = screen.getByRole('button', { name: '창 닫기' });
        await user.click(closeBtn);

        await waitFor(() => {
            expect(screen.queryByText('상세 감사 데이터 조회')).not.toBeInTheDocument();
        });
    });

    it('shows empty state when no logs exist', async () => {
        apiBridge.callBridge.mockResolvedValueOnce([]);

        renderComponent();

        await waitFor(() => {
            expect(screen.getByText('데이터가 존재하지 않습니다.')).toBeInTheDocument();
        });
    });
});

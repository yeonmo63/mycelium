import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import SettingsBackup from './SettingsBackup';
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

const mockBackups = [
    {
        filename: 'backup_2026-02-26.db',
        path: '/backups/backup_2026-02-26.db',
        is_auto: true,
        size: 10 * 1024 * 1024,
        timestamp: 1740560400 // 2026-02-26 12:00:00 UTC+9
    }
];

const mockStatus = {
    last_backup: '2026-02-26T12:00:00Z',
    is_auto_enabled: true
};

describe('SettingsBackup Component', () => {
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
            showAlert: vi.fn(),
            showConfirm: vi.fn().mockResolvedValue(true)
        });

        // Mock API responses
        apiBridge.callBridge.mockImplementation((command, args) => {
            if (command === 'get_auto_backups') return Promise.resolve(mockBackups);
            if (command === 'get_backup_status') return Promise.resolve(mockStatus);
            if (command === 'get_backup_path_external') return Promise.resolve('D:\\Backups');
            if (command === 'run_daily_custom_backup') return Promise.resolve({ success: true });
            if (command === 'get_backup_progress') return Promise.resolve({
                percentage: 50.0,
                message: '데이터 압축 중...',
                processed: 5,
                total: 10,
                elapsed_seconds: 10,
                estimated_remaining_seconds: 10
            });
            if (command === 'restore_database') return Promise.resolve({ success: true });
            if (command === 'save_external_backup_path') return Promise.resolve({ success: true });
            if (command === 'run_db_maintenance') return Promise.resolve({ success: true });
            if (command === 'cleanup_old_backups') return Promise.resolve({ deleted_count: 5, freed_bytes: 50 * 1024 * 1024 });
            return Promise.resolve({ success: true });
        });
    });

    const renderComponent = () => {
        return render(
            <BrowserRouter>
                <SettingsBackup />
            </BrowserRouter>
        );
    };

    it('renders and displays backup status and history', async () => {
        renderComponent();

        await waitFor(() => {
            expect(screen.getByText('backup_2026-02-26.db')).toBeInTheDocument();
            // Check for the formatted timestamp. 2026-02-26 21:00 (assuming UTC+9)
            expect(screen.getByText(/2026-02-26/)).toBeInTheDocument();
        });

        expect(screen.getByDisplayValue('D:\\Backups')).toBeInTheDocument();
    });

    it('triggers manual backup and shows progress', async () => {
        renderComponent();

        await waitFor(() => screen.getByText('전체 백업'));

        const backupBtn = screen.getByText('전체 백업');
        fireEvent.click(backupBtn);

        await waitFor(() => {
            expect(screen.getByText('데이터 백업 수행 중')).toBeInTheDocument();
        });

        // Polling will happen automatically with real timers
        await waitFor(() => {
            expect(screen.getByText('50.0%')).toBeInTheDocument();
            expect(screen.getByText('데이터 압축 중...')).toBeInTheDocument();
        }, { timeout: 5000 });
    });

    it('triggers database restore with confirmation', async () => {
        renderComponent();

        await waitFor(() => screen.getByText('복구하기'));

        const restoreBtn = screen.getAllByText('복구하기')[0];
        fireEvent.click(restoreBtn);

        expect(useModal().showConfirm).toHaveBeenCalledWith(
            "데이터베이스 복구",
            expect.stringContaining("정말로 이 백업 파일로 복구하시겠습니까?")
        );

        await waitFor(() => {
            expect(screen.getByText('데이터베이스 복구 중')).toBeInTheDocument();
        });
    });

    it('saves external backup path', async () => {
        renderComponent();

        const input = await waitFor(() => screen.getByPlaceholderText(/D:\\MyceliumBackups/));
        await user.clear(input);
        await user.type(input, 'E:\\NewBackups');

        const allButtons = screen.getAllByRole('button');
        const savePathBtn = allButtons.find(b => b.querySelector('svg[data-lucide="save"]'));

        fireEvent.click(savePathBtn);

        await waitFor(() => {
            expect(apiBridge.callBridge).toHaveBeenCalledWith('save_external_backup_path', { path: 'E:\\NewBackups' });
        });
    });

    it('triggers database maintenance', async () => {
        renderComponent();

        const maintenanceBtn = await waitFor(() => screen.getByText(/데이터베이스 최적화/));
        fireEvent.click(maintenanceBtn);

        expect(useModal().showConfirm).toHaveBeenCalled();
        await waitFor(() => {
            expect(apiBridge.callBridge).toHaveBeenCalledWith('run_db_maintenance');
        });
    });

    it('triggers backup cleanup', async () => {
        renderComponent();

        const cleanupBtn = await waitFor(() => screen.getByText(/오래된 백업 파일 정리/));
        fireEvent.click(cleanupBtn);

        expect(screen.getByText('오래된 백업 파일 정리')).toBeInTheDocument();

        const executeBtn = screen.getByText('정리 실행');
        fireEvent.click(executeBtn);

        await waitFor(() => {
            expect(apiBridge.callBridge).toHaveBeenCalledWith('cleanup_old_backups', { retention_days: 90 });
            expect(useModal().showAlert).toHaveBeenCalledWith('정리 완료', expect.stringContaining('5개의 백업 파일이 삭제되었습니다.'));
        });
    });
});

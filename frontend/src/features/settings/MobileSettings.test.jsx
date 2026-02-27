import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import MobileSettings from './MobileSettings';
import * as apiBridge from '../../utils/apiBridge';

// Mocking hooks
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual('react-router-dom');
    return {
        ...actual,
        useNavigate: () => mockNavigate,
    };
});

vi.mock('../../utils/apiBridge', () => ({
    invoke: vi.fn(),
}));

const mockCheckAdmin = vi.fn();
vi.mock('../../hooks/useAdminGuard', () => ({
    useAdminGuard: () => ({
        isAuthorized: true,
        checkAdmin: mockCheckAdmin,
        isVerifying: false
    }),
}));

const mockShowAlert = vi.fn();
vi.mock('../../contexts/ModalContext', () => ({
    useModal: () => ({
        showAlert: mockShowAlert
    }),
}));

// Mock clipboard
Object.assign(navigator, {
    clipboard: {
        writeText: vi.fn().mockImplementation(() => Promise.resolve()),
    },
});

describe('MobileSettings Component', () => {
    const mockIps = ['127.0.0.1', '192.168.0.10', '100.22.33.44'];
    const mockConfig = { access_pin: '1234', use_pin: true };

    beforeEach(() => {
        vi.clearAllMocks();
        mockCheckAdmin.mockResolvedValue(true);
        apiBridge.invoke.mockImplementation((fn) => {
            if (fn === 'get_local_ip_command') return Promise.resolve(mockIps);
            if (fn === 'get_mobile_config') return Promise.resolve(mockConfig);
            return Promise.resolve({});
        });
    });

    const renderWithRouter = (component) => {
        return render(
            <BrowserRouter>
                {component}
            </BrowserRouter>
        );
    };

    it('renders header and builds initial URL correctly', async () => {
        renderWithRouter(<MobileSettings />);

        await waitFor(() => {
            expect(screen.getByText('모바일 연동 센터')).toBeInTheDocument();
        });

        // 192.168.0.10 should be selected by default
        const ipSelect = screen.getByRole('combobox');
        expect(ipSelect.value).toBe('192.168.0.10');

        // Check URL preview
        expect(screen.getByText(/http:\/\/192\.168\.0\.10:.*\/mobile-dashboard/)).toBeInTheDocument();
    });

    it('updates URL when IP or port changes', async () => {
        renderWithRouter(<MobileSettings />);

        await waitFor(() => {
            expect(screen.getByRole('combobox')).toBeInTheDocument();
        });

        const ipSelect = screen.getByRole('combobox');
        fireEvent.change(ipSelect, { target: { value: '100.22.33.44' } });

        const portInput = screen.getByDisplayValue(window.location.port || '3000');
        fireEvent.change(portInput, { target: { value: '8080' } });

        expect(screen.getByText(/http:\/\/100\.22\.33\.44:8080\/mobile-dashboard/)).toBeInTheDocument();
    });

    it('toggles PIN use and handles save', async () => {
        renderWithRouter(<MobileSettings />);

        await waitFor(() => {
            expect(screen.getByText('모바일 PIN 보안 사용')).toBeInTheDocument();
        });

        const checkbox = screen.getByRole('checkbox');
        // Initial state is true from mockConfig
        expect(checkbox.checked).toBe(true);

        fireEvent.click(checkbox);
        expect(checkbox.checked).toBe(false);

        const saveBtn = screen.getByText('설정사항 안전하게 저장');
        fireEvent.click(saveBtn);

        await waitFor(() => {
            expect(apiBridge.invoke).toHaveBeenCalledWith('save_mobile_config', expect.objectContaining({
                config: expect.objectContaining({ use_pin: false })
            }));
            expect(mockShowAlert).toHaveBeenCalledWith("저장 완료", expect.any(String));
        });
    });

    it('copies URL to clipboard on QR click', async () => {
        renderWithRouter(<MobileSettings />);

        await waitFor(() => {
            expect(screen.getByTestId('qr-container')).toBeInTheDocument();
        });

        const qrContainer = screen.getByTestId('qr-container');
        fireEvent.click(qrContainer);

        expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining('192.168.0.10'));
        expect(mockShowAlert).toHaveBeenCalledWith("주소 복사됨", expect.any(String));
    });
});

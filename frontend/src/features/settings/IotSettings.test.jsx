import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import IotSettings from './IotSettings';
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
    callBridge: vi.fn(),
}));

const mockShowAlert = vi.fn();
const mockShowConfirm = vi.fn();
vi.mock('../../contexts/ModalContext', () => ({
    useModal: () => ({
        showAlert: mockShowAlert,
        showConfirm: mockShowConfirm
    }),
}));

const mockCheckAdmin = vi.fn();
vi.mock('../../hooks/useAdminGuard', () => ({
    useAdminGuard: () => ({
        isAuthorized: true,
        checkAdmin: mockCheckAdmin,
        isVerifying: false
    }),
}));

describe('IotSettings Component', () => {
    const mockSensors = [
        { sensor_id: 1, sensor_name: '테스트 센서', device_type: 'wifi', connection_info: '192.168.0.1', space_id: 1, is_active: true }
    ];
    const mockSpaces = [
        { space_id: 1, space_name: '1번 재배실' }
    ];

    beforeEach(() => {
        vi.clearAllMocks();
        mockCheckAdmin.mockResolvedValue(true);
        apiBridge.callBridge.mockImplementation((fn) => {
            if (fn === 'get_sensors') return Promise.resolve(mockSensors);
            if (fn === 'get_production_spaces') return Promise.resolve(mockSpaces);
            return Promise.resolve([]);
        });
    });

    const renderWithRouter = (component) => {
        return render(
            <BrowserRouter>
                {component}
            </BrowserRouter>
        );
    };

    it('renders header and lists sensors', async () => {
        renderWithRouter(<IotSettings />);

        await waitFor(() => {
            expect(screen.getByText('IoT 장비 관리')).toBeInTheDocument();
        });

        expect(screen.getByText('테스트 센서')).toBeInTheDocument();
        expect(screen.getAllByText('1번 재배실').length).toBeGreaterThan(0);
    });

    it('handles adding new sensor', async () => {
        renderWithRouter(<IotSettings />);

        await waitFor(() => {
            expect(screen.getByLabelText('장비 이름')).toBeInTheDocument();
        });

        const nameInput = screen.getByLabelText('장비 이름');
        fireEvent.change(nameInput, { target: { value: '새 센서' } });

        const saveBtn = screen.getByText('장비 등록 완료');
        fireEvent.click(saveBtn);

        await waitFor(() => {
            expect(apiBridge.callBridge).toHaveBeenCalledWith('save_sensor', expect.any(Object));
            expect(mockShowAlert).toHaveBeenCalledWith('저장 완료', '새로운 장비가 등록되었습니다.');
        });
    });

    it('handles editing existing sensor', async () => {
        renderWithRouter(<IotSettings />);

        await waitFor(() => {
            expect(screen.getByText('테스트 센서')).toBeInTheDocument();
        });

        // Click edit icon - it's a button with an Edit2 icon from lucide
        // Since we are not using a real DOM with classes for lucide icons usually in JSDOM, 
        // let's try to find the button nearby '테스트 센서'
        const row = screen.getByText('테스트 센서').closest('tr');
        const editBtn = row.querySelectorAll('button')[0];
        fireEvent.click(editBtn);

        await waitFor(() => {
            expect(screen.getByDisplayValue('테스트 센서')).toBeInTheDocument();
        });

        const nameInput = screen.getByDisplayValue('테스트 센서');
        fireEvent.change(nameInput, { target: { value: '수정된 센서' } });

        const saveBtn = screen.getByText('설정 내역 저장');
        fireEvent.click(saveBtn);

        await waitFor(() => {
            expect(apiBridge.callBridge).toHaveBeenCalledWith('save_sensor', expect.objectContaining({
                sensor: expect.objectContaining({ sensor_name: '수정된 센서' })
            }));
            expect(mockShowAlert).toHaveBeenCalledWith('저장 완료', '장비 정보가 수정되었습니다.');
        });
    });

    it('handles deleting a sensor', async () => {
        mockShowConfirm.mockResolvedValue(true);
        renderWithRouter(<IotSettings />);

        await waitFor(() => {
            expect(screen.getByText('테스트 센서')).toBeInTheDocument();
        });

        const row = screen.getByText('테스트 센서').closest('tr');
        const deleteBtn = row.querySelectorAll('button')[1];
        fireEvent.click(deleteBtn);

        await waitFor(() => {
            expect(mockShowConfirm).toHaveBeenCalled();
            expect(apiBridge.callBridge).toHaveBeenCalledWith('delete_sensor', { sensorId: 1 });
        });
    });
});

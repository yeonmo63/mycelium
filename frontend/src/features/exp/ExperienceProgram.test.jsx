import { render, screen, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import ExperienceProgram from './ExperienceProgram';
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

const mockPrograms = [
    {
        program_id: 1,
        program_name: '버섯 피자 만들기',
        description: '아이들과 함께 즐거운 시간',
        duration_min: 60,
        price_per_person: 15000,
        max_capacity: 10,
        is_active: true
    },
    {
        program_id: 2,
        program_name: '숲 해설 체험',
        description: '자연의 신비',
        duration_min: 90,
        price_per_person: 5000,
        max_capacity: 20,
        is_active: false
    }
];

describe('ExperienceProgram Component', () => {
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
            if (command === 'get_experience_programs') return Promise.resolve(mockPrograms);
            return Promise.resolve({ success: true });
        });
    });

    const renderComponent = () => {
        return render(
            <BrowserRouter>
                <ExperienceProgram />
            </BrowserRouter>
        );
    };

    it('renders and displays program list', async () => {
        renderComponent();

        await waitFor(() => {
            expect(screen.getByText('버섯 피자 만들기')).toBeInTheDocument();
        }, { timeout: 3000 });

        expect(screen.getByText('숲 해설 체험')).toBeInTheDocument();
        expect(screen.getByText(/15,000/)).toBeInTheDocument();
        expect(screen.getByText('운영중')).toBeInTheDocument();
        expect(screen.getByText('중단')).toBeInTheDocument();
    });

    it('creates a new program', async () => {
        renderComponent();

        const nameInput = screen.getByPlaceholderText(/피자 만들기 체험/i);
        await user.type(nameInput, '신규 체험');

        const priceInput = screen.getByDisplayValue('0');
        await user.clear(priceInput);
        await user.type(priceInput, '10000');

        const saveBtn = screen.getByRole('button', { name: /프로그램 등록하기/i });
        await user.click(saveBtn);

        await waitFor(() => {
            expect(apiBridge.callBridge).toHaveBeenCalledWith('create_experience_program', expect.objectContaining({
                program_name: '신규 체험',
                price_per_person: 10000
            }));
        });

        expect(mockShowAlert).toHaveBeenCalledWith('등록되었습니다.');
    });

    it('edits an existing program', async () => {
        renderComponent();

        await waitFor(() => screen.getByText('버섯 피자 만들기'));

        const editBtn = screen.getAllByRole('button').find(b => b.innerHTML.includes('edit_square'));
        await user.click(editBtn);

        // Form should be filled
        const nameInput = screen.getByDisplayValue('버섯 피자 만들기');
        await user.clear(nameInput);
        await user.type(nameInput, '수정된 피자 체험');

        const saveBtn = screen.getByRole('button', { name: /수정 내용 저장/i });
        await user.click(saveBtn);

        await waitFor(() => {
            expect(apiBridge.callBridge).toHaveBeenCalledWith('update_experience_program', expect.objectContaining({
                program_id: 1,
                program_name: '수정된 피자 체험'
            }));
        });
    });

    it('deletes a program after confirmation', async () => {
        renderComponent();

        await waitFor(() => screen.getByText('버섯 피자 만들기'));

        const deleteBtn = screen.getAllByRole('button').find(b => b.innerHTML.includes('delete'));
        await user.click(deleteBtn);

        expect(mockShowConfirm).toHaveBeenCalledWith('프로그램 삭제', expect.any(String));

        await waitFor(() => {
            expect(apiBridge.callBridge).toHaveBeenCalledWith('delete_experience_program', { program_id: 1 });
        });
    });
});

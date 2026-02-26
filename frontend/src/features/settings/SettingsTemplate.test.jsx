import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import SettingsTemplate from './SettingsTemplate';
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

const mockTemplates = {
    default: ["기본 템플릿 문구"],
    repurchase: ["재구매 유도 문구 샘플"],
    churn: ["이탈 방지용 문구"]
};

describe('SettingsTemplate Component', () => {
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
            const clonedTemplates = JSON.parse(JSON.stringify(mockTemplates));
            if (command === 'get_message_templates') return Promise.resolve(clonedTemplates);
            if (command === 'reset_message_templates') return Promise.resolve(clonedTemplates);
            return Promise.resolve({ success: true });
        });
    });

    const renderComponent = () => {
        return render(
            <BrowserRouter>
                <SettingsTemplate />
            </BrowserRouter>
        );
    };

    it('renders and displays templates for active scenario', async () => {
        renderComponent();

        await waitFor(() => {
            expect(screen.getByDisplayValue('기본 템플릿 문구')).toBeInTheDocument();
        });

        expect(screen.getByText('일반/기본 홍보')).toBeInTheDocument();
    });

    it('switches scenario and displays relevant templates', async () => {
        renderComponent();

        await waitFor(() => screen.getByDisplayValue('기본 템플릿 문구'));

        const repurchaseBtn = screen.getByRole('button', { name: /재구매 유도/i });
        await user.click(repurchaseBtn);

        await waitFor(() => {
            expect(screen.getByDisplayValue('재구매 유도 문구 샘플')).toBeInTheDocument();
        });
    });

    it('adds and edits a template', async () => {
        renderComponent();

        await waitFor(() => screen.getByDisplayValue('기본 템플릿 문구'));

        const addBtn = screen.getByRole('button', { name: /문구 추가/i });
        await user.click(addBtn);

        const textareas = screen.getAllByRole('textbox');
        const newTextarea = textareas[textareas.length - 1];

        await user.clear(newTextarea);
        await user.type(newTextarea, '새로운 템플릿 내용');

        const saveBtn = screen.getByRole('button', { name: /변경사항 저장/i });
        await user.click(saveBtn);

        expect(mockShowConfirm).toHaveBeenCalled();

        await waitFor(() => {
            expect(apiBridge.callBridge).toHaveBeenCalledWith('save_message_templates', expect.objectContaining({
                templates: expect.objectContaining({
                    default: expect.arrayContaining(['새로운 템플릿 내용'])
                })
            }));
        });
    });

    it('removes a template', async () => {
        renderComponent();

        await waitFor(() => screen.getByDisplayValue('기본 템플릿 문구'));

        const deleteBtn = screen.getByRole('button', { name: '삭제' });
        fireEvent.click(deleteBtn);

        await waitFor(() => {
            expect(screen.queryByDisplayValue('기본 템플릿 문구')).not.toBeInTheDocument();
            expect(screen.getByText('등록된 문구가 없습니다.')).toBeInTheDocument();
        });
    });

    it('resets templates to default', async () => {
        renderComponent();

        await waitFor(() => screen.getByDisplayValue('기본 템플릿 문구'));

        const resetBtn = screen.getByRole('button', { name: /초기화/i });
        await user.click(resetBtn);

        expect(mockShowConfirm).toHaveBeenCalledWith('초기화 확인', expect.any(String));

        await waitFor(() => {
            expect(apiBridge.callBridge).toHaveBeenCalledWith('reset_message_templates');
        });
    });
});

import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import EventMgmt from './EventMgmt';
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

const mockEvents = [
    {
        event_id: 1,
        event_name: '봄맞이 특별전',
        organizer: '대성백화점',
        manager_name: '김철수',
        location_address: '서울시 강남구',
        start_date: '2024-03-01',
        end_date: '2024-03-15',
        memo: '메인 로비 설치'
    },
    {
        event_id: 2,
        event_name: '지역 농산물 장터',
        organizer: '도봉구청',
        manager_name: '이영희',
        location_address: '도봉산 입구',
        start_date: '2024-04-01',
        end_date: '2024-04-02',
        memo: '야외 부스'
    }
];

describe('EventMgmt Component', () => {
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
        apiBridge.invoke.mockImplementation((command) => {
            if (command === 'get_all_events') return Promise.resolve(mockEvents);
            return Promise.resolve({ success: true });
        });
    });

    const renderComponent = () => {
        return render(
            <BrowserRouter>
                <EventMgmt />
            </BrowserRouter>
        );
    };

    it('renders and displays event list', async () => {
        renderComponent();

        await waitFor(() => {
            expect(screen.getByText('봄맞이 특별전')).toBeInTheDocument();
            expect(screen.getByText('지역 농산물 장터')).toBeInTheDocument();
        });

        expect(screen.getByText('대성백화점')).toBeInTheDocument();
        expect(screen.getByText('김철수')).toBeInTheDocument();
    });

    it('filters events by search query', async () => {
        renderComponent();

        await waitFor(() => expect(screen.getByText('봄맞이 특별전')).toBeInTheDocument());

        const searchInput = screen.getByPlaceholderText(/행사명 검색/i);
        await user.type(searchInput, '봄맞이');

        const searchBtn = screen.getByRole('button', { name: /조회/i });
        await user.click(searchBtn);

        expect(apiBridge.invoke).toHaveBeenCalledWith('get_all_events', { query: '봄맞이' });
    });

    it('opens modal and creates a new event', async () => {
        renderComponent();

        const addBtn = screen.getByText(/신규 등록/i).closest('button');
        await user.click(addBtn);

        // Debug: Log all headings
        const headings = screen.getAllByRole('heading');
        headings.forEach(h => console.log('DEBUG Heading:', h.textContent));

        // Modal should be open
        expect(screen.getByRole('heading', { name: /^새 행사 등록$/i })).toBeInTheDocument();

        // Fill form
        const nameInput = screen.getByRole('textbox', { name: /행사명/i });
        await user.type(nameInput, '여름 축제');

        const organizerInput = screen.getByRole('textbox', { name: /주최\/주관사/i });
        await user.type(organizerInput, '서울시');

        const managerInput = screen.getByRole('textbox', { name: /현장 담당자/i });
        await user.type(managerInput, '박명수');

        const saveBtn = screen.getByRole('button', { name: /^새 행사 등록하기$/i });
        await user.click(saveBtn);

        expect(mockShowConfirm).toHaveBeenCalled();

        await waitFor(() => {
            expect(apiBridge.invoke).toHaveBeenCalledWith('create_event', expect.objectContaining({
                event_name: '여름 축제',
                organizer: '서울시',
                manager_name: '박명수'
            }));
        });
    });

    it('edits an existing event', async () => {
        renderComponent();

        await waitFor(() => screen.getByText('봄맞이 특별전'));

        const row = screen.getByText('봄맞이 특별전').closest('tr');
        await user.click(row);

        // Modal should open with data
        expect(screen.getByText(/행사 정보 수정/i)).toBeInTheDocument();
        const nameInput = screen.getByDisplayValue('봄맞이 특별전');
        await user.clear(nameInput);
        await user.type(nameInput, '봄맞이 특별전 v2');

        const saveBtn = screen.getByRole('button', { name: /수정 사항 저장/i });
        await user.click(saveBtn);

        expect(mockShowConfirm).toHaveBeenCalled();

        await waitFor(() => {
            expect(apiBridge.invoke).toHaveBeenCalledWith('update_event', expect.objectContaining({
                event_id: 1,
                event_name: '봄맞이 특별전 v2'
            }));
        });
    });

    it('deletes an event after confirmation', async () => {
        renderComponent();

        await waitFor(() => screen.getByText('봄맞이 특별전'));

        const row = screen.getByText('봄맞이 특별전').closest('tr');
        await user.click(row);

        const deleteBtn = screen.getByRole('button', { name: /행사 삭제/i });
        await user.click(deleteBtn);

        expect(mockShowConfirm).toHaveBeenCalled();

        await waitFor(() => {
            expect(apiBridge.invoke).toHaveBeenCalledWith('delete_event', { event_id: 1 });
        });
    });
});

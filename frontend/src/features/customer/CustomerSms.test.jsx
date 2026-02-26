import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import CustomerSms from './CustomerSms';
import { ModalProvider } from '../../contexts/ModalContext';
import * as apiBridge from '../../utils/apiBridge';

// Mock apiBridge
vi.mock('../../utils/apiBridge', () => ({
    invoke: vi.fn(),
    callBridge: vi.fn()
}));

describe('CustomerSms Component', () => {
    let user;

    const mockCompanyInfo = { company_name: '테스트 사과 농장' };

    beforeEach(() => {
        user = userEvent.setup();
        vi.clearAllMocks();

        apiBridge.invoke.mockImplementation((cmd) => {
            if (cmd === 'get_company_info') return Promise.resolve(mockCompanyInfo);
            return Promise.resolve([]);
        });
    });

    it('renders header and initial state', async () => {
        render(
            <ModalProvider>
                <CustomerSms />
            </ModalProvider>
        );

        expect(screen.getByText(/판촉 문자 발송/i)).toBeInTheDocument();

        await waitFor(() => {
            // Check if template dropdown has options
            expect(screen.getByText('템플릿')).toBeInTheDocument();
        });
    });

    it('updates byte count when message is entered', async () => {
        render(
            <ModalProvider>
                <CustomerSms />
            </ModalProvider>
        );

        const textarea = screen.getByPlaceholderText(/발송할 내용을 작성하거나/i);
        await user.type(textarea, '안녕하세요');

        // '안녕하세요' is 5 chars, but in the component it counts bytes (2 for non-ASCII)
        // '안녕하세요' -> 10 bytes
        await waitFor(() => {
            expect(screen.getByText('10')).toBeInTheDocument();
        });
    });

    it('switches to Kakao mode', async () => {
        render(
            <ModalProvider>
                <CustomerSms />
            </ModalProvider>
        );

        const kakaoBtn = screen.getByText('카톡 알림톡');
        await user.click(kakaoBtn);

        expect(screen.getByText(/카카오 알림톡 알림/i)).toBeInTheDocument();
        expect(screen.getByText('알림톡 발송하기')).toBeInTheDocument();
    });
});

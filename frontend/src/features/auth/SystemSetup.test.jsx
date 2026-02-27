import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import SystemSetup from './SystemSetup';
import { ModalProvider } from '../../contexts/ModalContext';
import * as apiBridge from '../../utils/apiBridge';

vi.mock('../../utils/apiBridge', () => ({
    invoke: vi.fn()
}));

describe('SystemSetup Component', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.clearAllMocks();

        // Mock window.confirm and window.close
        window.confirm = vi.fn(() => true);
        window.close = vi.fn();

        // Mock window.location.href
        delete window.location;
        window.location = { href: 'http://localhost/' };
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    const renderWithContext = () => {
        return render(
            <ModalProvider>
                <SystemSetup />
            </ModalProvider>
        );
    };

    it('renders step 1 and handles navigation to step 2', async () => {
        renderWithContext();

        expect(screen.getByText('데이터베이스 연결')).toBeInTheDocument();

        const nextBtn = screen.getByText('다음 단계로');
        fireEvent.click(nextBtn);

        act(() => {
            vi.advanceTimersByTime(600);
        });

        expect(screen.getByText('인공지능 서비스 (선택)')).toBeInTheDocument();
    });

    it('handles navigation between all steps', async () => {
        renderWithContext();

        // Step 1 -> 2
        fireEvent.click(screen.getByText('다음 단계로'));
        act(() => { vi.advanceTimersByTime(600); });

        // Step 2 -> 3
        fireEvent.click(screen.getByText('보안 설정 단계로'));
        act(() => { vi.advanceTimersByTime(600); });

        expect(screen.getByText('시스템 보안 강화')).toBeInTheDocument();

        // Step 3 -> 2 (Back)
        const prevBtn = screen.getByText('이전');
        fireEvent.click(prevBtn);
        act(() => { vi.advanceTimersByTime(600); });

        expect(screen.getByText('인공지능 서비스 (선택)')).toBeInTheDocument();
    });

    it('generates a random JWT secret on mount', async () => {
        renderWithContext();
        // Go to step 3 to see the secret
        fireEvent.click(screen.getByText('다음 단계로'));
        act(() => { vi.advanceTimersByTime(600); });
        fireEvent.click(screen.getByText('보안 설정 단계로'));
        act(() => { vi.advanceTimersByTime(600); });

        const input = screen.getByLabelText('JWT Authentication Secret');
        expect(input.value).not.toBe('');
        expect(input.value.length).toBe(32);
    });

    it('handles successful system setup', async () => {
        apiBridge.invoke.mockResolvedValue({ success: true });

        renderWithContext();

        // Navigate to Step 3
        fireEvent.click(screen.getByText('다음 단계로'));
        act(() => { vi.advanceTimersByTime(600); });
        fireEvent.click(screen.getByText('보안 설정 단계로'));
        act(() => { vi.advanceTimersByTime(600); });

        const finishBtn = screen.getByText('전체 설정 완료');
        fireEvent.click(finishBtn);

        // Flush microtasks to allow handleSetup to proceed to invoke
        await act(async () => {
            await Promise.resolve();
        });

        expect(apiBridge.invoke).toHaveBeenCalled();

        // Flush microtasks to allow invoke to resolve and showAlert to be called
        await act(async () => {
            await Promise.resolve();
            await Promise.resolve();
        });

        // The success message should be shown (isFinished is set to true after showAlert)
        // Wait, showAlert is awaited. We need to click "확인" to resolve it.
        const confirmBtn = screen.getByText('확인');
        fireEvent.click(confirmBtn);

        await act(async () => {
            await Promise.resolve();
        });

        expect(screen.getByText('설정 완료!')).toBeInTheDocument();

        // Check redirect after 3 seconds
        act(() => {
            vi.advanceTimersByTime(3500);
        });

        expect(window.location.href).toBe('/');
    });

    it('handles setup error', async () => {
        const errorMessage = 'DB Connection Failed';
        apiBridge.invoke.mockRejectedValue(new Error(errorMessage));

        renderWithContext();

        // Navigate to Step 3
        fireEvent.click(screen.getByText('다음 단계로'));
        act(() => { vi.advanceTimersByTime(600); });
        fireEvent.click(screen.getByText('보안 설정 단계로'));
        act(() => { vi.advanceTimersByTime(600); });

        const finishBtn = screen.getByText('전체 설정 완료');
        fireEvent.click(finishBtn);

        await act(async () => {
            await Promise.resolve();
            await Promise.resolve();
        });

        expect(screen.getByText('설정 오류')).toBeInTheDocument();
        expect(screen.getByText(errorMessage)).toBeInTheDocument();
    });

    it('handles close button', async () => {
        renderWithContext();

        const closeBtn = screen.getByTitle('프로그램 종료');
        fireEvent.click(closeBtn);

        expect(window.confirm).toHaveBeenCalledWith('설정을 중단하고 창을 닫으시겠습니까?');
        expect(window.close).toHaveBeenCalled();
    });
});

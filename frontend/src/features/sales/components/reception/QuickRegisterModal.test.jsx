import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import QuickRegisterModal from './QuickRegisterModal';

// Mock common utils
vi.mock('../../../../utils/common', () => ({
    formatPhoneNumber: vi.fn(val => val)
}));

describe('QuickRegisterModal Component', () => {
    const mockProps = {
        isOpen: true,
        onClose: vi.fn(),
        quickRegisterName: '홍길동',
        fileInputRef: { current: { click: vi.fn() } },
        handleQuickRegister: vi.fn(),
        handleAddressSearch: vi.fn()
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders nothing if isOpen is false', () => {
        const { container } = render(<QuickRegisterModal {...mockProps} isOpen={false} />);
        expect(container.firstChild).toBeNull();
    });

    it('renders and populates initial name', () => {
        render(<QuickRegisterModal {...mockProps} />);
        expect(screen.getByPlaceholderText('이름 입력')).toHaveValue('홍길동');
        expect(screen.getByText('신규 고객 퀵 등록')).toBeInTheDocument();
    });

    it('triggers address search on click', () => {
        render(<QuickRegisterModal {...mockProps} />);
        const addrInput = screen.getByPlaceholderText(/클릭하여 주소 검색/i);
        fireEvent.click(addrInput);
        expect(mockProps.handleAddressSearch).toHaveBeenCalled();
    });

    it('submits form data correctly', () => {
        render(<QuickRegisterModal {...mockProps} />);

        const nameInput = screen.getByPlaceholderText('이름 입력');
        fireEvent.change(nameInput, { target: { value: '홍길동' } });

        const mobileInput = screen.getByPlaceholderText('010-0000-0000');
        fireEvent.change(mobileInput, { target: { value: '01011112222' } });

        const levelSelect = screen.getByLabelText(/회원 등급/i);
        fireEvent.change(levelSelect, { target: { value: 'VIP' } });

        const submitBtn = screen.getByText('등록 및 접수 시작');
        // fireEvent.click(submitBtn); // Try submit instead

        const form = screen.getByLabelText('quick-register-form');
        fireEvent.submit(form);

        // Debug log
        if (mockProps.handleQuickRegister.mock.calls.length > 0) {
            console.log("ACTUAL CALL:", JSON.stringify(mockProps.handleQuickRegister.mock.calls[0][0]));
        } else {
            console.log("NO CALL DETECTED");
        }

        expect(mockProps.handleQuickRegister).toHaveBeenCalledWith(expect.objectContaining({
            name: '홍길동',
            mobile: '01011112222',
            level: 'VIP'
        }));
    });

    it('calls onClose when close button or background is clicked', () => {
        render(<QuickRegisterModal {...mockProps} />);

        // Background click
        const background = screen.getByLabelText('modal-background');
        fireEvent.click(background);
        expect(mockProps.onClose).toHaveBeenCalled();

        // Close button click
        const closeBtn = screen.getByText('close').closest('button');
        fireEvent.click(closeBtn);
        expect(mockProps.onClose).toHaveBeenCalledTimes(2);
    });
});

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import EventQrScannerUI from './EventQrScannerUI';

describe('EventQrScannerUI Component', () => {
    const mockClick = vi.fn();
    const mockProps = {
        isOpen: true,
        onClose: vi.fn(),
        cameraError: null,
        fileInputRef: { current: { click: mockClick } },
        handleFileScan: vi.fn(),
        scannerInputRef: { current: null },
        scannerValue: '',
        setScannerValue: vi.fn(),
        processQrCode: vi.fn()
    };

    beforeEach(() => {
        vi.clearAllMocks();
        mockClick.mockClear();
    });

    it('renders nothing if isOpen is false', () => {
        const { container } = render(<EventQrScannerUI {...mockProps} isOpen={false} />);
        expect(container.firstChild).toBeNull();
    });

    it('renders scanner UI when open', () => {
        render(<EventQrScannerUI {...mockProps} />);
        expect(screen.getByText('특판 품목 스캔 중')).toBeInTheDocument();
        expect(screen.getByPlaceholderText('코드 직접 입력')).toBeInTheDocument();
    });

    it('shows camera error and handles file upload button', () => {
        const errorMsg = 'Camera not available';
        render(<EventQrScannerUI {...mockProps} cameraError={errorMsg} />);

        expect(screen.getByText(errorMsg)).toBeInTheDocument();
        const uploadBtn = screen.getByText('카메라 촬영으로 인식');
        expect(uploadBtn).toBeInTheDocument();
    });

    it('handles manual code input', () => {
        render(<EventQrScannerUI {...mockProps} scannerValue="12345" />);
        const input = screen.getByPlaceholderText('코드 직접 입력');

        fireEvent.change(input, { target: { value: '67890' } });
        expect(mockProps.setScannerValue).toHaveBeenCalledWith('67890');

        fireEvent.keyDown(input, { key: 'Enter' });
        expect(mockProps.processQrCode).toHaveBeenCalledWith('12345');
    });

    it('calls onClose when close button clicked', () => {
        render(<EventQrScannerUI {...mockProps} />);
        const buttons = screen.getAllByRole('button');
        const xBtn = buttons[buttons.length - 1];
        fireEvent.click(xBtn);
        expect(mockProps.onClose).toHaveBeenCalled();
    });
});

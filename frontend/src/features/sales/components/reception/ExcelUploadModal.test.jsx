import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import ExcelUploadModal from './ExcelUploadModal';

describe('ExcelUploadModal Component', () => {
    const mockFileData = {
        headers: ['고객명', '연락처', '주소', '상품명', '수량', '단가'],
        rows: [
            ['홍길동', '01012345678', '서울시', '느타리', '2', '20000'],
            ['김철수', '010-9999-8888', '부산시', '표고', '1', '15000']
        ]
    };

    const mockOnImport = vi.fn();
    const mockOnClose = vi.fn();

    it('renders and auto-detects mappings', () => {
        render(
            <ExcelUploadModal
                isOpen={true}
                onClose={mockOnClose}
                fileData={mockFileData}
                onImport={mockOnImport}
            />
        );

        expect(screen.getByText('통합 엑셀 업로드 설정')).toBeInTheDocument();

        // Use getAllByLabelText if multiple labels exist, or use regex
        const nameSelect = screen.getByLabelText(/고객명/);
        expect(nameSelect).toBeInTheDocument();

        // Check preview table
        expect(screen.getByText('홍길동')).toBeInTheDocument();
        expect(screen.getByText('느타리')).toBeInTheDocument();
    });

    it('handles manual mapping change', () => {
        render(
            <ExcelUploadModal
                isOpen={true}
                onClose={mockOnClose}
                fileData={mockFileData}
                onImport={mockOnImport}
            />
        );

        const qtySelect = screen.getByLabelText('수량');
        fireEvent.change(qtySelect, { target: { value: '4' } }); // Change to index 4 ('몇개')

        expect(qtySelect.value).toBe('4');
    });

    it('calls onImport with correctly mapped data', () => {
        render(
            <ExcelUploadModal
                isOpen={true}
                onClose={mockOnClose}
                fileData={mockFileData}
                onImport={mockOnImport}
            />
        );

        const importBtn = screen.getByText(/데이터 가져오기/);
        fireEvent.click(importBtn);

        expect(mockOnImport).toHaveBeenCalledWith(expect.arrayContaining([
            expect.objectContaining({
                shipName: '홍길동',
                product: '느타리',
                qty: 2,
                price: 20000
            })
        ]));
        expect(mockOnClose).toHaveBeenCalled();
    });
});

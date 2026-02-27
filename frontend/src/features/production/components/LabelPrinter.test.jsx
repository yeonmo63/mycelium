import { render, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import LabelPrinter, { printLabel } from './LabelPrinter';
import * as printUtils from '../../../utils/printUtils';

vi.mock('../../../utils/printUtils', () => ({
    handlePrintRaw: vi.fn()
}));

describe('LabelPrinter Component', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders factory div but keeps it hidden', () => {
        const { container } = render(<LabelPrinter />);
        const factory = container.querySelector('#isolated-qr_factory');
        // The id in code is "isolated-qr-factory"
        const factoryCorrect = container.querySelector('#isolated-qr-factory');
        expect(factoryCorrect).toBeInTheDocument();
        expect(factoryCorrect).toHaveStyle({ visibility: 'hidden' });
    });

    it('listens to printLabel event and calls handlePrintRaw', async () => {
        render(<LabelPrinter />);

        const mockData = {
            title: '테스트 품목',
            spec: '1kg',
            price: 5000,
            qrValue: 'TEST-123'
        };

        printLabel('product', mockData);

        await waitFor(() => {
            expect(printUtils.handlePrintRaw).toHaveBeenCalled();
            const printHtml = printUtils.handlePrintRaw.mock.calls[0][0];
            expect(printHtml).toContain('테스트 품목');
            expect(printHtml).toContain('1kg');
            expect(printHtml).toContain('5,000');
        });
    });

    it('handles production label type', async () => {
        render(<LabelPrinter />);

        const mockData = {
            title: '생산 품목',
            date: '2023-11-01',
            weight: 10.5,
            qrValue: 'PROD-456'
        };

        printLabel('production', mockData);

        await waitFor(() => {
            expect(printUtils.handlePrintRaw).toHaveBeenCalled();
            const printHtml = printUtils.handlePrintRaw.mock.calls[0][0];
            expect(printHtml).toContain('생산 품목');
            expect(printHtml).toContain('10.5kg');
        });
    });
});

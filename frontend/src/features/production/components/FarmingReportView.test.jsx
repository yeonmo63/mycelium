import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import FarmingReportView from './FarmingReportView';
import { ModalProvider } from '../../../contexts/ModalContext';
import * as apiBridge from '../../../utils/apiBridge';

vi.mock('../../../utils/apiBridge', () => ({
    invoke: vi.fn(),
    callBridge: vi.fn()
}));

describe('FarmingReportView Component', () => {
    let user;

    const mockCompanyData = {
        company_name: '테스트농장',
        representative_name: '대표자',
        address: '주소',
        certification_info: { gap: 'GAP-123', haccp: 'HACCP-123' }
    };

    const mockLogData = [
        {
            log_id: 'L1',
            log_date: '2023-10-01',
            work_type: 'plant',
            work_content: '종균접종 작업',
            worker_name: '작업자1',
            space_name: '제1재배실',
            env_data: { temp: 20, humidity: 60 },
            photos: []
        },
        {
            log_id: 'L2',
            log_date: '2023-10-02',
            work_type: 'pesticide',
            work_content: '약제살포',
            worker_name: '작업자1',
            space_name: '제1재배실',
            env_data: { temp: 21, humidity: 55 },
            photos: []
        }
    ];

    beforeEach(() => {
        user = userEvent.setup();
        vi.clearAllMocks();
        apiBridge.invoke.mockImplementation((cmd) => {
            if (cmd === 'get_production_logs') return Promise.resolve(mockLogData);
            if (cmd === 'get_company_info') return Promise.resolve(mockCompanyData);
            return Promise.resolve([]);
        });
    });

    it('renders report preview with loaded data', async () => {
        render(
            <ModalProvider>
                <FarmingReportView
                    startDate="2023-10-01"
                    endDate="2023-10-31"
                    includeAttachments={true}
                    includeApproval={true}
                    reportType="all"
                    onClose={vi.fn()}
                />
            </ModalProvider>
        );

        expect(await screen.findByText(/통합 영농 및 작업 기록장/i)).toBeInTheDocument();
        expect(screen.getByText('테스트농장')).toBeInTheDocument();
        expect(screen.getByText('종균접종 작업')).toBeInTheDocument();
        // Use getAllByText because worker_name might appear multiple times in the table
        expect(screen.getAllByText('작업자1')[0]).toBeInTheDocument();
    });

    it('filters log types based on reportType prop', async () => {
        render(
            <ModalProvider>
                <FarmingReportView
                    startDate="2023-10-01"
                    endDate="2023-10-31"
                    reportType="chemical"
                    onClose={vi.fn()}
                />
            </ModalProvider>
        );

        expect(await screen.findByText(/농약 살포 및 시비 기록부/i)).toBeInTheDocument();
        expect(screen.getByText('약제살포')).toBeInTheDocument();
        expect(screen.queryByText('종균접종 작업')).not.toBeInTheDocument();
    });

    it('triggers print when button is clicked', async () => {
        // Mock print helper since FarmingReportView uses handlePrintRaw
        vi.mock('../../../utils/printUtils', () => ({
            handlePrintRaw: vi.fn()
        }));

        const { handlePrintRaw } = await import('../../../utils/printUtils');

        render(
            <ModalProvider>
                <FarmingReportView
                    startDate="2023-10-01"
                    endDate="2023-10-31"
                    onClose={vi.fn()}
                />
            </ModalProvider>
        );

        await screen.findByText(/통합 영농 및 작업 기록장/i);

        const printBtn = screen.getByRole('button', { name: /인쇄 \/ PDF 저장/i });
        await user.click(printBtn);

        expect(handlePrintRaw).toHaveBeenCalled();
    });
});

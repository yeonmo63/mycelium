import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import OnlineReputation from './OnlineReputation';
import * as apiBridge from '../../utils/apiBridge';
import * as aiErrorHandler from '../../utils/aiErrorHandler';
import { ModalProvider } from '../../contexts/ModalContext';

// Mock apiBridge
vi.mock('../../utils/apiBridge', () => ({
    invoke: vi.fn(() => Promise.resolve([])),
    callBridge: vi.fn(() => Promise.resolve([]))
}));

// Mock aiErrorHandler
vi.mock('../../utils/aiErrorHandler', () => ({
    invokeAI: vi.fn(() => Promise.resolve({}))
}));

describe('OnlineReputation Component', () => {
    let user;

    const mockCompanyInfo = { company_name: '테스트 사과 농장' };
    const mockSearchResults = [
        { title: '맛있는 버섯', description: '정말 신선해요.', postdate: '2024-01-01', link: 'http://example.com' }
    ];
    const mockAnalysisResult = {
        analyzed_mentions: [
            { original_text: '맛있는 버섯 정말 신선해요.', sentiment_label: 'Positive', sentiment_score: 95 }
        ],
        total_score: 92,
        verdict: 'Excellent',
        summary: '전반적인 평판이 매우 좋습니다.',
        keywords: ['신선함', '맛']
    };

    beforeEach(() => {
        user = userEvent.setup();
        vi.clearAllMocks();

        apiBridge.invoke.mockImplementation((cmd) => {
            if (cmd === 'get_company_info') return Promise.resolve(mockCompanyInfo);
            if (cmd === 'fetch_naver_search') return Promise.resolve(mockSearchResults);
            return Promise.resolve([]);
        });

        aiErrorHandler.invokeAI.mockResolvedValue(mockAnalysisResult);
    });

    it('renders header and initial state', async () => {
        render(
            <ModalProvider>
                <OnlineReputation />
            </ModalProvider>
        );
        expect(screen.getByText(/온라인 AI 평판 분석/i)).toBeInTheDocument();

        await waitFor(() => {
            expect(screen.getByText('테스트 사과 농장')).toBeInTheDocument();
        });
    });

    it('shows loading state and analysis results', async () => {
        render(
            <ModalProvider>
                <OnlineReputation />
            </ModalProvider>
        );

        const analyzeBtn = await screen.findByText(/실시간 평판 분석 실행/i);
        await user.click(analyzeBtn);

        await waitFor(() => {
            expect(screen.getByText('전반적인 평판이 매우 좋습니다.')).toBeInTheDocument();
        }, { timeout: 10000 });

        // Use queryAll to check multiple occurrences if needed or just use first one
        const verdicts = screen.getAllByText('Excellent');
        expect(verdicts.length).toBeGreaterThan(0);
    });
});

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import DashboardLite from './DashboardLite';
import { BrowserRouter, useNavigate } from 'react-router-dom';

// Mock useNavigate
vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual('react-router-dom');
    return {
        ...actual,
        useNavigate: vi.fn(),
    };
});

describe('DashboardLite Component', () => {
    const mockNavigate = vi.fn();
    const mockOnLogout = vi.fn();

    const mockStats = {
        total_sales_amount: 1250000,
        total_orders: 15,
        pending_orders: 5,
        total_customers: 2
    };

    const mockWeatherAdvice = {
        weather_icon: '🌤️',
        current_weather: '맑음',
        marketing_advice: '오늘은 버섯 따기 좋은 날입니다.'
    };

    beforeEach(() => {
        vi.clearAllMocks();
        useNavigate.mockReturnValue(mockNavigate);

        // Mock localStorage
        vi.spyOn(Storage.prototype, 'getItem').mockImplementation((key) => {
            if (key === 'username') return '테스트관리자';
            return null;
        });
    });

    it('renders greeting with username from localStorage', () => {
        render(
            <BrowserRouter>
                <DashboardLite
                    stats={mockStats}
                    isLoading={false}
                    salesTrend={{ pct: 5, isUp: true }}
                    weatherAdvice={mockWeatherAdvice}
                    isWeatherLoading={false}
                    onLogout={mockOnLogout}
                />
            </BrowserRouter>
        );

        expect(screen.getByText(/테스트관리자/)).toBeInTheDocument();
        expect(screen.getByText(/오늘 농장 경영의 핵심 지표입니다/)).toBeInTheDocument();
    });

    it('displays major statistics cards', () => {
        render(
            <BrowserRouter>
                <DashboardLite
                    stats={mockStats}
                    isLoading={false}
                    salesTrend={{ pct: 5, isUp: true }}
                    weatherAdvice={mockWeatherAdvice}
                    isWeatherLoading={false}
                    onLogout={mockOnLogout}
                />
            </BrowserRouter>
        );

        // 오늘 매출액 (StatCard inside DashboardLite)
        expect(screen.getByText('오늘 매출액')).toBeInTheDocument();
        expect(screen.getByText('1,250,000원')).toBeInTheDocument();

        // 오늘 주문
        expect(screen.getByText('오늘 주문')).toBeInTheDocument();
        expect(screen.getByText('15건')).toBeInTheDocument();

        // 배송 대기
        expect(screen.getByText('배송 대기')).toBeInTheDocument();
        expect(screen.getByText('5건')).toBeInTheDocument();

        // 신규 고객
        expect(screen.getByText('신규 고객')).toBeInTheDocument();
        expect(screen.getByText('2명')).toBeInTheDocument();
    });

    it('navigates to correct path when quick action button is clicked', () => {
        render(
            <BrowserRouter>
                <DashboardLite
                    stats={mockStats}
                    isLoading={false}
                    salesTrend={{ pct: 5, isUp: true }}
                    weatherAdvice={mockWeatherAdvice}
                    isWeatherLoading={false}
                    onLogout={mockOnLogout}
                />
            </BrowserRouter>
        );

        const orderBtn = screen.getByText('주문 접수').closest('button');
        fireEvent.click(orderBtn);
        expect(mockNavigate).toHaveBeenCalledWith('/sales/reception');

        const stockBtn = screen.getByText('수확/재고').closest('button');
        fireEvent.click(stockBtn);
        expect(mockNavigate).toHaveBeenCalledWith('/sales/stock');
    });

    it('displays weather advice section', () => {
        render(
            <BrowserRouter>
                <DashboardLite
                    stats={mockStats}
                    isLoading={false}
                    salesTrend={{ pct: 5, isUp: true }}
                    weatherAdvice={mockWeatherAdvice}
                    isWeatherLoading={false}
                    onLogout={mockOnLogout}
                />
            </BrowserRouter>
        );

        expect(screen.getByText('맑음')).toBeInTheDocument();
        expect(screen.getByText('오늘은 버섯 따기 좋은 날입니다.')).toBeInTheDocument();
        expect(screen.getByText('데이터 분석 완료')).toBeInTheDocument();
    });

    it('shows loading state for weather when isWeatherLoading is true', () => {
        render(
            <BrowserRouter>
                <DashboardLite
                    stats={mockStats}
                    isLoading={false}
                    salesTrend={{ pct: 5, isUp: true }}
                    weatherAdvice={null}
                    isWeatherLoading={true}
                    onLogout={mockOnLogout}
                />
            </BrowserRouter>
        );

        expect(screen.getByText('날씨 정보 로딩 중...')).toBeInTheDocument();
        expect(screen.getByText('데이터를 분석하여 마케팅 전략을 추천해 드립니다...')).toBeInTheDocument();
    });

    it('calls onLogout when logout button is clicked', () => {
        render(
            <BrowserRouter>
                <DashboardLite
                    stats={mockStats}
                    isLoading={false}
                    salesTrend={{ pct: 5, isUp: true }}
                    weatherAdvice={mockWeatherAdvice}
                    isWeatherLoading={false}
                    onLogout={mockOnLogout}
                />
            </BrowserRouter>
        );

        const logoutBtn = screen.getByText('로그아웃');
        fireEvent.click(logoutBtn);
        expect(mockOnLogout).toHaveBeenCalled();
    });
});

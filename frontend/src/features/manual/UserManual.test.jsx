import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import UserManual from './UserManual';

// Mock scrollIntoView
Element.prototype.scrollIntoView = vi.fn();

describe('UserManual Component', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders sidebar and main content', () => {
        render(<UserManual />);

        expect(screen.getByText('Mycelium Guide')).toBeInTheDocument();
        expect(screen.getByText('Master Platform v2.0')).toBeInTheDocument();
        expect(screen.getByPlaceholderText('명령어나 기능을 검색하세요...')).toBeInTheDocument();

        // Check for some section buttons (using regex because of potential icons/extra text)
        expect(screen.getByRole('button', { name: /시스템 흐름도/ })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /1\. 대시보드/ })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /10\. 제니의 긴급 구조/ })).toBeInTheDocument();
    });

    it('handles side menu clicks and scrolls to sections', () => {
        render(<UserManual />);

        // Create dummy elements with IDs that the component scrolls to
        const sections = [
            'flowchart', 'dashboard', 'sales', 'customer', 'inventory_prod',
            'finance', 'intel', 'exp', 'schedule', 'settings', 'rescue'
        ];
        sections.forEach(id => {
            const div = document.createElement('div');
            div.id = id;
            document.body.appendChild(div);
        });

        const dashboardBtn = screen.getByRole('button', { name: /1\. 대시보드/ });
        fireEvent.click(dashboardBtn);

        expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({
            behavior: 'smooth',
            block: 'start'
        });

        // Check if active class/style is applied (it uses bg-indigo-600 for active)
        expect(dashboardBtn.closest('button')).toHaveClass('bg-indigo-600');
    });

    it('updates search term on input', () => {
        render(<UserManual />);

        const searchInput = screen.getByPlaceholderText('명령어나 기능을 검색하세요...');
        fireEvent.change(searchInput, { target: { value: '배송' } });

        expect(searchInput.value).toBe('배송');
    });

    it('scrolls to top when clicking "맨 위로 이동"', () => {
        window.scrollTo = vi.fn();
        render(<UserManual />);

        const topBtn = screen.getByText('맨 위로 이동');
        fireEvent.click(topBtn);

        expect(window.scrollTo).toHaveBeenCalledWith({
            top: 0,
            behavior: 'smooth'
        });
    });
});

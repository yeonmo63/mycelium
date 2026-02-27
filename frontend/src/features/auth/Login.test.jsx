import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import Login from './Login';
import * as apiBridge from '../../utils/apiBridge';

vi.mock('../../utils/apiBridge', () => ({
    invoke: vi.fn()
}));

describe('Login Component', () => {
    let user;
    const mockOnLoginSuccess = vi.fn();

    beforeEach(() => {
        user = userEvent.setup();
        vi.clearAllMocks();

        // Default mock for company info
        apiBridge.invoke.mockImplementation((cmd) => {
            if (cmd === 'get_company_info') return Promise.resolve({ company_name: 'Test Mycelium' });
            return Promise.resolve({ success: false, message: 'Not mocked' });
        });

        // Mock window.confirm and window.close
        window.confirm = vi.fn(() => true);
        window.close = vi.fn();

        // Reset localStorage
        localStorage.clear();

        // Mock window.location.reload
        delete window.location;
        window.location = { reload: vi.fn() };
    });

    it('renders and loads company name', async () => {
        render(<Login onLoginSuccess={mockOnLoginSuccess} />);

        expect(await screen.findByText('Test Mycelium')).toBeInTheDocument();
        expect(apiBridge.invoke).toHaveBeenCalledWith('get_company_info');
    });

    it('shows error when fields are empty', async () => {
        render(<Login onLoginSuccess={mockOnLoginSuccess} />);

        const loginBtn = screen.getByText('시스템 로그인');
        await user.click(loginBtn);

        expect(await screen.findByText('아이디와 비밀번호를 모두 입력해주세요.')).toBeInTheDocument();
    });

    it('handles successful login', async () => {
        apiBridge.invoke.mockImplementation((cmd, args) => {
            if (cmd === 'get_company_info') return Promise.resolve({ company_name: 'Test Mycelium' });
            if (cmd === 'login') {
                return Promise.resolve({
                    success: true,
                    user_id: 1,
                    username: 'admin',
                    role: 'admin',
                    ui_mode: 'pro',
                    token: 'mock-token'
                });
            }
            return Promise.resolve(null);
        });

        render(<Login onLoginSuccess={mockOnLoginSuccess} />);

        const idInput = screen.getByPlaceholderText('아이디');
        const pwInput = screen.getByPlaceholderText('비밀번호');
        const loginBtn = screen.getByText('시스템 로그인');

        await user.type(idInput, 'admin');
        await user.type(pwInput, 'password');
        await user.click(loginBtn);

        await waitFor(() => {
            expect(apiBridge.invoke).toHaveBeenCalledWith('login', {
                username: 'admin',
                password: 'password'
            });
        });

        expect(localStorage.getItem('isLoggedIn')).toBe('true');
        expect(localStorage.getItem('username')).toBe('admin');
        expect(localStorage.getItem('token')).toBe('mock-token');
        expect(mockOnLoginSuccess).toHaveBeenCalled();
    });

    it('handles login failure', async () => {
        apiBridge.invoke.mockImplementation((cmd) => {
            if (cmd === 'get_company_info') return Promise.resolve({ company_name: 'Test Mycelium' });
            if (cmd === 'login') {
                return Promise.resolve({
                    success: false,
                    message: '아이디 혹은 비밀번호가 틀렸습니다.'
                });
            }
            return Promise.resolve(null);
        });

        render(<Login onLoginSuccess={mockOnLoginSuccess} />);

        const idInput = screen.getByPlaceholderText('아이디');
        const pwInput = screen.getByPlaceholderText('비밀번호');
        const loginBtn = screen.getByText('시스템 로그인');

        await user.type(idInput, 'wrong');
        await user.type(pwInput, 'wrong');
        await user.click(loginBtn);

        expect(await screen.findByText('아이디 혹은 비밀번호가 틀렸습니다.')).toBeInTheDocument();
    });

    it('reloads page on login success if onLoginSuccess is not provided', async () => {
        apiBridge.invoke.mockImplementation((cmd) => {
            if (cmd === 'get_company_info') return Promise.resolve({ company_name: 'Test Mycelium' });
            if (cmd === 'login') {
                return Promise.resolve({
                    success: true,
                    user_id: 1,
                    username: 'admin',
                    role: 'admin'
                });
            }
            return Promise.resolve(null);
        });

        render(<Login />);

        const idInput = screen.getByPlaceholderText('아이디');
        const pwInput = screen.getByPlaceholderText('비밀번호');
        const loginBtn = screen.getByText('시스템 로그인');

        await user.type(idInput, 'admin');
        await user.type(pwInput, 'admin');
        await user.click(loginBtn);

        await waitFor(() => {
            expect(window.location.reload).toHaveBeenCalled();
        });
    });

    it('handles close button', async () => {
        render(<Login />);

        const closeBtn = screen.getByTitle('프로그램 종료');
        await user.click(closeBtn);

        expect(window.confirm).toHaveBeenCalledWith('프로그램을 종료(창 닫기)하시겠습니까?');
        expect(window.close).toHaveBeenCalled();
    });
});

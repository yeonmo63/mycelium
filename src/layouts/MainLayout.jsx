import React, { useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';

const MainLayout = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const isLoggedIn = sessionStorage.getItem('isLoggedIn');
    const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    const isMobilePort = window.location.port === '8989';
    const isMobileRoute = location.pathname.toLowerCase().startsWith('/mobile-') ||
        isMobileUA || isMobilePort;

    useEffect(() => {
        if (!isLoggedIn && !isMobileRoute) {
            // App.jsx handles the login screen rendering
        }
    }, [isLoggedIn, navigate, isMobileRoute]);

    if (isMobileRoute) {
        return (
            <div className="min-h-screen w-screen bg-slate-50 overflow-x-hidden">
                <Outlet />
            </div>
        );
    }

    return (
        <div className="flex h-screen w-screen overflow-hidden bg-slate-50">
            <Sidebar />
            <main className="flex-1 relative overflow-hidden flex flex-col">
                <div className="flex-1 relative min-h-0 h-full">
                    <Outlet />
                </div>
            </main>
        </div>
    );
};

export default MainLayout;

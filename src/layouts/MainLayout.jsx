import React, { useEffect } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';

const MainLayout = () => {
    const navigate = useNavigate();
    const isLoggedIn = sessionStorage.getItem('isLoggedIn');

    useEffect(() => {
        if (!isLoggedIn) {
            // App.jsx handles the login screen rendering, but this is a safety check
        }
    }, [isLoggedIn, navigate]);

    return (
        <div className="flex h-screen w-screen overflow-hidden bg-slate-50">
            <Sidebar />
            <main className="flex-1 relative overflow-hidden flex flex-col">
                <div id="local-modal-root" className="absolute inset-0 z-[9999] pointer-events-none" />
                <div className="flex-1 relative min-h-0 h-full">
                    <Outlet />
                </div>
            </main>
        </div>
    );
};

export default MainLayout;

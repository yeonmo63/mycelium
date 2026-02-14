import React from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import LabelPrinter from '../features/production/components/LabelPrinter';

const MainLayout = ({ isMobile }) => {
    // If mobile is prop-driven from App.jsx, use it directly for total consistency
    if (isMobile) {
        return (
            <div className="fixed inset-0 bg-slate-50 flex flex-col overflow-hidden">
                <main className="flex-1 w-full relative overflow-y-auto">
                    <Outlet />
                </main>
                <LabelPrinter />
            </div>
        );
    }

    // Default Desktop Layout
    return (
        <div className="flex h-screen w-screen overflow-hidden bg-slate-950">
            <Sidebar />
            <main className="flex-1 relative overflow-hidden flex flex-col bg-slate-50">
                <div className="flex-1 relative min-h-0 h-full">
                    <Outlet />
                </div>
            </main>
            <LabelPrinter />
        </div>
    );
};

export default MainLayout;

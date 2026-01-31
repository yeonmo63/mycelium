import React, { useEffect, useState } from 'react';
import { RouterProvider, createBrowserRouter, Route, createRoutesFromElements } from 'react-router-dom';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { ModalProvider, useModal } from './contexts/ModalContext';
import { getCurrentWindow } from '@tauri-apps/api/window';
import MainLayout from './layouts/MainLayout';
import SystemSetup from './features/auth/SystemSetup';
import Login from './features/auth/Login';

// Import Feature Components
import Dashboard from './features/dashboard/Dashboard';
import CustomerRegister from './features/customer/CustomerRegister';
import CustomerList from './features/customer/CustomerList';
import EventMgmt from './features/customer/EventMgmt';
import CustomerConsultation from './features/customer/CustomerConsultation';
import CustomerBatch from './features/customer/CustomerBatch';
import CustomerBest from './features/customer/CustomerBest';
import CustomerSpecialCare from './features/customer/CustomerSpecialCare';
import CustomerSms from './features/customer/CustomerSms';
import FinancePurchase from './features/finance/FinancePurchase';
import FinanceExpense from './features/finance/FinanceExpense';
import FinanceVendor from './features/finance/FinanceVendor';
import FinanceAnalysis from './features/finance/FinanceAnalysis';
import SettingsProduct from './features/settings/SettingsProduct';
import SettingsUser from './features/settings/SettingsUser';
import SettingsCompany from './features/settings/SettingsCompany';
import SettingsApiKeys from './features/settings/SettingsApiKeys';
import SettingsBackup from './features/settings/SettingsBackup';
import SettingsDbReset from './features/settings/SettingsDbReset';
import SettingsTemplate from './features/settings/SettingsTemplate';
import SalesReception from './features/sales/SalesReception';
import SalesSpecial from './features/sales/SalesSpecial';
import SalesOnlineSync from './features/sales/SalesOnlineSync';
import SalesShipping from './features/sales/SalesShipping';
import SalesClaims from './features/sales/SalesClaims';
import SalesDailyReceipts from './features/sales/SalesDailyReceipts';
import SalesStock from './features/sales/SalesStock';
import SalesLedger from './features/sales/SalesLedger';
import SalesPersonalHistory from './features/sales/SalesPersonalHistory';
import SalesIntelligence from './features/intel/SalesIntelligence';
import CustomerIntelligence from './features/intel/CustomerIntelligence';
import ProductAssociation from './features/intel/ProductAssociation';
import OnlineReputation from './features/marketing/OnlineReputation';
import RegionAnalysis from './features/intel/RegionAnalysis';
import ProductSales from './features/product/ProductSales';
import ExperienceProgram from './features/exp/ExperienceProgram';
import ExperienceReservation from './features/exp/ExperienceReservation';
import ExperienceStatus from './features/exp/ExperienceStatus';
import ExperienceSchedule from './features/exp/ExperienceSchedule';
import ScheduleMgmt from './features/schedule/ScheduleMgmt';
import UserManual from './features/manual/UserManual';
import Placeholder from './components/Placeholder';

const router = createBrowserRouter(
  createRoutesFromElements(
    <Route path="/" element={<MainLayout />}>
      <Route index element={<Dashboard />} />
      <Route path="sales/reception" element={<SalesReception />} />
      <Route path="sales/special" element={<SalesSpecial />} />
      <Route path="sales/online-sync" element={<SalesOnlineSync />} />
      <Route path="sales/shipping" element={<SalesShipping />} />
      <Route path="sales/claims" element={<SalesClaims />} />
      <Route path="sales/daily-receipts" element={<SalesDailyReceipts />} />
      <Route path="sales/daily" element={<SalesPersonalHistory />} />
      <Route path="sales/stock" element={<SalesStock />} />
      <Route path="customer/event-mgmt" element={<EventMgmt />} />
      <Route path="customer/register" element={<CustomerRegister />} />
      <Route path="customer/edit" element={<CustomerList />} />
      <Route path="sales/ledger" element={<SalesLedger />} />
      <Route path="customer/batch" element={<CustomerBatch />} />
      <Route path="customer/consultation" element={<CustomerConsultation />} />
      <Route path="customer/best" element={<CustomerBest />} />
      <Route path="customer/special-care" element={<CustomerSpecialCare />} />
      <Route path="finance/purchase" element={<FinancePurchase />} />
      <Route path="finance/expense" element={<FinanceExpense />} />
      <Route path="finance/vendor" element={<FinanceVendor />} />
      <Route path="status/financial-analysis" element={<FinanceAnalysis />} />
      <Route path="intel/sales" element={<SalesIntelligence />} />
      <Route path="intel/customer" element={<CustomerIntelligence />} />
      <Route path="marketing/association" element={<ProductAssociation />} />
      <Route path="marketing/orm" element={<OnlineReputation />} />
      <Route path="intel/region-analysis" element={<RegionAnalysis />} />
      <Route path="product/sales" element={<ProductSales />} />
      <Route path="customer/sms" element={<CustomerSms />} />
      <Route path="exp/reservation-entry" element={<ExperienceReservation />} />
      <Route path="exp/reservation-status" element={<ExperienceStatus />} />
      <Route path="exp/program-mgmt" element={<ExperienceProgram />} />
      <Route path="schedule" element={<ScheduleMgmt />} />
      <Route path="settings/product-list" element={<SettingsProduct />} />
      <Route path="settings/user-list" element={<SettingsUser />} />
      <Route path="settings/company-info" element={<SettingsCompany />} />
      <Route path="settings/api-keys" element={<SettingsApiKeys />} />
      <Route path="settings/template-mgmt" element={<SettingsTemplate />} />
      <Route path="settings/db-backup-restore" element={<SettingsBackup />} />
      <Route path="settings/db-reset" element={<SettingsDbReset />} />
      <Route path="manual" element={<UserManual />} />
    </Route>
  )
);



function AppContent() {
  const [isConfigured, setIsConfigured] = useState(null);
  const [isLoggedIn, setIsLoggedIn] = useState(sessionStorage.getItem('isLoggedIn') === 'true');
  const { showConfirm } = useModal();

  useEffect(() => {
    let unlisten;

    const handleLogout = () => {
      sessionStorage.removeItem('isLoggedIn');
      setIsLoggedIn(false);
    };

    window.addEventListener('app-logout', handleLogout);

    const setup = async () => {
      try {
        console.log('App starting setup...');
        // Force fresh login on every startup - only once on mount
        sessionStorage.removeItem('isLoggedIn');
        setIsLoggedIn(false);

        const status = await invoke('check_setup_status');
        console.log('Setup status:', status);
        setIsConfigured(status);

        // Remove splash screen from DOM instantly
        const htmlLoading = document.querySelector('.app-loading');
        if (htmlLoading) {
          htmlLoading.style.opacity = '0';
          setTimeout(() => htmlLoading.remove(), 400);
        }

        unlisten = await listen('window_close_requested', async () => {
          const isFriday = new Date().getDay() === 5;
          const hasUnsavedChanges = true; // For now we assume there might be changes if they've logged in

          if (isFriday) {
            const result = await showChoice(
              "프로그램 종료",
              "오늘은 전체 백업이 예정된 금요일입니다.\n데이터를 안전하게 보관한 후 종료하시겠습니까?",
              [
                { label: '백업 후 종료', value: 'backup', primary: true },
                { label: '즉시 종료', value: 'quick', danger: true },
                { label: '취소', value: 'cancel' }
              ]
            );

            if (result === 'backup') {
              if (unlisten) unlisten();
              await invoke('confirm_exit', { skipAutoBackup: false });
            } else if (result === 'quick') {
              if (unlisten) unlisten();
              await invoke('confirm_exit', { skipAutoBackup: true });
            }
          } else {
            const confirmed = await showConfirm("프로그램 종료", "종료하시겠습니까?");
            if (confirmed) {
              if (unlisten) unlisten();
              await invoke('confirm_exit', { skipAutoBackup: false });
            }
          }
        });
      } catch (err) {
        console.error("Initialization error:", err);
        await getCurrentWindow().show();
      }
    };

    setup();
    return () => {
      if (unlisten) unlisten();
      window.removeEventListener('app-logout', handleLogout);
    };
  }, []); // Revert to empty array to run only once on mount

  // --- Auto Backup Logic (Separated) ---
  useEffect(() => {
    let backupInterval;
    if (isLoggedIn) {
      // Check every 5 minutes and backup if modified
      backupInterval = setInterval(() => {
        invoke('trigger_auto_backup').catch(err => console.error("Auto backup failed:", err));
      }, 5 * 60 * 1000);
    }
    return () => {
      if (backupInterval) clearInterval(backupInterval);
    };
  }, [isLoggedIn]);


  // Premium Initial Loading Screen (React State)
  if (isConfigured === null) {
    return (
      <div className="fixed inset-0 z-[99999] flex flex-col items-center justify-center bg-slate-950 font-sans overflow-hidden">
        <div className="absolute inset-0 bg-slate-900/50 mix-blend-overlay"></div>
        <div className="absolute top-[-20%] left-[-10%] w-[800px] h-[800px] bg-indigo-900/20 blur-[150px] rounded-full animate-pulse" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[800px] h-[800px] bg-purple-900/20 blur-[150px] rounded-full animate-pulse delay-700" />
        <div className="relative z-10 flex flex-col items-center">
          <div className="relative mb-10">
            <div className="absolute inset-0 bg-indigo-500 blur-2xl opacity-20 animate-pulse rounded-full"></div>
            <div className="w-24 h-24 bg-gradient-to-br from-indigo-600 to-purple-600 rounded-3xl flex items-center justify-center shadow-2xl shadow-indigo-500/30 rotate-3 ring-4 ring-slate-900/50 relative z-10">
              <span className="material-symbols-rounded text-white text-5xl animate-[bounce_2s_infinite]">agriculture</span>
            </div>
            <div className="absolute inset-[-15px] border-4 border-indigo-500/10 rounded-[40px]"></div>
            <div className="absolute inset-[-15px] border-4 border-transparent border-t-indigo-500/50 rounded-[40px] animate-[spin_3s_linear_infinite]"></div>
            <div className="absolute inset-[-8px] border-2 border-transparent border-b-purple-500/50 rounded-[32px] animate-[spin_2s_linear_infinite_reverse]"></div>
          </div>
          <h2 className="text-4xl font-black text-white tracking-tight mb-4">
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-white via-indigo-100 to-slate-400">
              Mycelium
            </span>
          </h2>
          <div className="flex flex-col items-center gap-3">
            <div className="flex items-center gap-3 text-indigo-300 font-medium text-sm bg-indigo-950/40 px-6 py-2 rounded-full border border-indigo-500/20 backdrop-blur-sm">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-indigo-500"></span>
              </span>
              <span className="animate-pulse">시스템 리소스를 최적화하고 있습니다...</span>
            </div>
            <p className="text-slate-600 text-xs font-medium tracking-wide">VERSION 1.0.0 • ENTERPRISE EDITION</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-slate-950 overflow-hidden font-sans text-slate-200">
      <div className="fixed inset-0 z-0">
        <div className="absolute top-[-20%] left-[-10%] w-[800px] h-[800px] bg-indigo-900/10 blur-[150px] rounded-full" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[800px] h-[800px] bg-purple-900/10 blur-[150px] rounded-full" />
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 brightness-150 mix-blend-overlay"></div>
      </div>

      {isConfigured && isLoggedIn && (
        <div className="relative z-10 h-full">
          <RouterProvider router={router} />
        </div>
      )}

      {!isConfigured && (
        <SystemSetup onComplete={() => setIsConfigured(true)} />
      )}

      {isConfigured && !isLoggedIn && (
        <Login onLoginSuccess={() => setIsLoggedIn(true)} />
      )}
    </div>
  );
}

function App() {
  return (
    <ModalProvider>
      <AppContent />
    </ModalProvider>
  );
}

export default App;

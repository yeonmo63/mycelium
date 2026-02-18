import React, { useEffect, useState, useMemo } from 'react';
import { RouterProvider, createBrowserRouter, Route, createRoutesFromElements, Navigate, Outlet } from 'react-router-dom';
import { ModalProvider, useModal } from './contexts/ModalContext';
import MainLayout from './layouts/MainLayout';
import SystemSetup from './features/auth/SystemSetup';
import Login from './features/auth/Login';
import MobileLogin from './features/mobile/MobileLogin';

// Feature Components
import Dashboard from './features/dashboard/Dashboard';
import MobileDashboard from './features/mobile/MobileDashboard';
import MobileWorkLog from './features/mobile/MobileWorkLog';
import MobileHarvestEntry from './features/mobile/MobileHarvestEntry';
import MobileEventSales from './features/mobile/MobileEventSales';

// Desktop Components (Lazy check if needed)
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
import FinanceTaxReport from './features/finance/FinanceTaxReport';
import FinanceVendor from './features/finance/FinanceVendor';
import FinanceAnalysis from './features/finance/FinanceAnalysis';
import SalesIntelligence from './features/intel/SalesIntelligence';
import CustomerIntelligence from './features/intel/CustomerIntelligence';
import ProductAssociation from './features/intel/ProductAssociation';
import RegionAnalysis from './features/intel/RegionAnalysis';
import OnlineReputation from './features/marketing/OnlineReputation';
import SettingsProduct from './features/settings/SettingsProduct';
import SettingsUser from './features/settings/SettingsUser';
import SettingsCompany from './features/settings/SettingsCompany';
import SettingsApiKeys from './features/settings/SettingsApiKeys';
import SettingsBackup from './features/settings/SettingsBackup';
import SettingsDbReset from './features/settings/SettingsDbReset';
import SettingsTemplate from './features/settings/SettingsTemplate';
import MobileSettings from './features/settings/MobileSettings';
import IotSettings from './features/settings/IotSettings';
import SalesReception from './features/sales/SalesReception';
import SalesSpecial from './features/sales/SalesSpecial';
import SalesOnlineSync from './features/sales/SalesOnlineSync';
import SalesShipping from './features/sales/SalesShipping';
import SalesClaims from './features/sales/SalesClaims';
import SalesDailyReceipts from './features/sales/SalesDailyReceipts';
import SalesStock from './features/sales/SalesStock';
import SalesLedger from './features/sales/SalesLedger';
import SalesPersonalHistory from './features/sales/SalesPersonalHistory';
import ProductSales from './features/product/ProductSales';
import ExperienceProgram from './features/exp/ExperienceProgram';
import ExperienceReservation from './features/exp/ExperienceReservation';
import ExperienceStatus from './features/exp/ExperienceStatus';
import ScheduleMgmt from './features/schedule/ScheduleMgmt';
import ProductionManager from './features/production/ProductionManager';
import UserManual from './features/manual/UserManual';

// Components
import OfflineSyncMonitor from './components/OfflineSyncMonitor';
import UpdateNotifier from './components/UpdateNotifier';

// 1. Environment Detection (Mobile/Desktop)
const getEnvironment = () => {
  if (window.__MYCELIUM_MOBILE__ !== undefined) return window.__MYCELIUM_MOBILE__;

  const isTauri = !!window.__TAURI__;
  if (isTauri) return false;

  const isMobilePath = window.location.pathname.toLowerCase().startsWith('/mobile-');
  const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

  return isMobileUA || isMobilePath;
};

// Admin Guard
const AdminRoute = () => {
  const userRole = sessionStorage.getItem('userRole');
  if (userRole !== 'admin') return <Navigate to="/" replace />;
  return <Outlet />;
};

function AppContent() {
  const { showConfirm } = useModal();

  const IS_MOBILE = useMemo(() => getEnvironment(), []);

  const [isConfigured, setIsConfigured] = useState(null);
  const [isLoggedIn, setIsLoggedIn] = useState(() => sessionStorage.getItem('isLoggedIn') === 'true');
  const [isPinVerified, setIsPinVerified] = useState(() => sessionStorage.getItem('pin_verified') === 'true');
  const [mobileAuthRequired, setMobileAuthRequired] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const initApp = async () => {
      try {
        // 1. Check Setup Status
        const statusRes = await fetch('/api/auth/status');
        const statusData = await statusRes.json();
        setIsConfigured(statusData === 'Configured');

        // 2. Check Auth Status
        const authRes = await fetch('/api/auth/check');
        const authData = await authRes.json();

        setMobileAuthRequired(authData.mobile_auth_required);
        if (authData.logged_in) {
          setIsLoggedIn(true);
          sessionStorage.setItem('isLoggedIn', 'true');

          if (sessionStorage.getItem('pin_verified') === 'true') {
            setIsPinVerified(true);
          }

          if (authData.user) {
            sessionStorage.setItem('userRole', authData.user.role || 'worker');
            sessionStorage.setItem('username', authData.user.username || 'mobile_user');
          }
        }
      } catch (e) {
        console.error("App initialization failed", e);
        setIsConfigured(false);
      } finally {
        setIsLoading(false);
        const spl = document.getElementById('app-spinner');
        if (spl) {
          spl.style.opacity = '0';
          setTimeout(() => spl.remove(), 400);
        }
      }
    };
    initApp();
  }, [IS_MOBILE]);

  const Layout = ({ isMobile }) => (
    <div className="flex flex-col h-full bg-slate-50 overflow-hidden">
      {!isMobile && <MainLayout />}
      <div className={`flex-1 overflow-auto ${isMobile ? 'pb-20' : ''}`}>
        <Outlet />
      </div>
    </div>
  );

  const router = useMemo(() =>
    createBrowserRouter(
      createRoutesFromElements(
        <Route element={<Layout isMobile={IS_MOBILE} />}>
          <Route path="/" element={IS_MOBILE ? <Navigate to="/mobile-dashboard" replace /> : <Navigate to="/dashboard" replace />} />
          <Route path="setup" element={<SystemSetup />} />
          <Route path="login" element={<Login />} />

          <Route path="mobile-dashboard" element={<MobileDashboard />} />
          <Route path="mobile-worklog" element={<MobileWorkLog />} />
          <Route path="mobile-harvest" element={<MobileHarvestEntry />} />
          <Route path="mobile-event-sales" element={<MobileEventSales />} />

          <Route path="dashboard" element={<Dashboard />} />
          <Route path="sales/reception" element={<SalesReception />} />
          <Route path="sales/special" element={<SalesSpecial />} />
          <Route path="sales" element={<Navigate to="/sales/reception" replace />} />
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
          <Route path="finance/tax-report" element={<FinanceTaxReport />} />
          <Route path="finance/vendor" element={<FinanceVendor />} />
          <Route path="finance/analysis" element={<FinanceAnalysis />} />
          <Route path="intel/sales" element={<SalesIntelligence />} />
          <Route path="intel/customer" element={<CustomerIntelligence />} />
          <Route path="marketing/association" element={<ProductAssociation />} />
          <Route path="marketing/orm" element={<OnlineReputation />} />
          <Route path="intel/region-analysis" element={<RegionAnalysis />} />
          <Route path="product/sales" element={<ProductSales />} />
          <Route path="customer/sms" element={<CustomerSms />} />
          <Route path="exp/reservation-entry" element={<ExperienceReservation />} />
          <Route path="exp/reservation-status" element={<ExperienceStatus />} />

          <Route element={<AdminRoute />}>
            <Route path="exp/program-mgmt" element={<ExperienceProgram />} />
            <Route path="settings/product-list" element={<SettingsProduct />} />
            <Route path="settings/user-list" element={<SettingsUser />} />
            <Route path="settings/company-info" element={<SettingsCompany />} />
            <Route path="settings/api-keys" element={<SettingsApiKeys />} />
            <Route path="settings/template-mgmt" element={<SettingsTemplate />} />
            <Route path="settings/iot" element={<IotSettings />} />
            <Route path="settings/db-backup-restore" element={<SettingsBackup />} />
            <Route path="settings/mobile-sync" element={<MobileSettings />} />
            <Route path="settings/db-reset" element={<SettingsDbReset />} />
          </Route>

          <Route path="production" element={<ProductionManager initialTab="dashboard" />} />
          <Route path="schedule" element={<ScheduleMgmt />} />
          <Route path="manual" element={<UserManual />} />

          {IS_MOBILE && <Route path="*" element={<Navigate to="/mobile-dashboard" replace />} />}
        </Route>
      )
    ), [IS_MOBILE]);

  if (isLoading || isConfigured === null) return null;

  return (
    <div id="app-root" className={`fixed inset-0 overflow-hidden ${IS_MOBILE ? 'bg-slate-50' : 'bg-slate-950'} font-sans`}>
      {isConfigured && isLoggedIn && (!IS_MOBILE || !mobileAuthRequired || isPinVerified) ? (
        <RouterProvider router={router} />
      ) : !isConfigured ? (
        <SystemSetup onComplete={() => setIsConfigured(true)} />
      ) : IS_MOBILE ? (
        <MobileLogin onLoginSuccess={() => {
          setIsPinVerified(true);
          setIsLoggedIn(true);
        }} />
      ) : (
        <Login onLoginSuccess={() => setIsLoggedIn(true)} />
      )}
    </div>
  );
}

function App() {
  return (
    <ModalProvider>
      <AppContent />
      <OfflineSyncMonitor />
      <UpdateNotifier />
    </ModalProvider>
  );
}

export default App;

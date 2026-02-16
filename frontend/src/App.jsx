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

// 1. Environment Detection (Mobile/Desktop)
const getEnvironment = () => {
  if (window.__MYCELIUM_MOBILE__ !== undefined) return window.__MYCELIUM_MOBILE__;

  const isMobilePort = window.location.port === '8989';
  const isMobilePath = window.location.pathname.toLowerCase().startsWith('/mobile-');
  const isMobileUA = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  return isMobilePort || isMobilePath || isMobileUA;
};

// Admin Guard
const AdminRoute = () => {
  const userRole = sessionStorage.getItem('userRole');
  if (userRole !== 'admin') return <Navigate to="/" replace />;
  return <Outlet />;
};

function AppContent() {
  const { showConfirm } = useModal();

  // Detection happens ONCE and is stable
  const IS_MOBILE = useMemo(() => getEnvironment(), []);

  // Initial State Sync
  const [isConfigured, setIsConfigured] = useState(null);
  const [isLoggedIn, setIsLoggedIn] = useState(() => sessionStorage.getItem('isLoggedIn') === 'true');
  const [mobileAuthRequired, setMobileAuthRequired] = useState(false);

  // Mobile Auth Check
  useEffect(() => {
    if (IS_MOBILE) {
      const checkAuth = async () => {
        try {
          const res = await fetch('/api/auth/status');
          const data = await res.json();
          setMobileAuthRequired(data.mobile_auth_required);
        } catch (e) {
          console.error("Mobile auth check failed", e);
        }
      };
      checkAuth();
    }
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
          {/* Public Routes */}
          <Route path="/" element={IS_MOBILE ? <Navigate to="/mobile-dashboard" replace /> : <Navigate to="/dashboard" replace />} />
          <Route path="setup" element={<SystemSetup />} />
          <Route path="login" element={<Login />} />

          <Route path="mobile-dashboard" element={<MobileDashboard />} />
          <Route path="mobile-worklog" element={<MobileWorkLog />} />
          <Route path="mobile-harvest" element={<MobileHarvestEntry />} />
          <Route path="mobile-event-sales" element={<MobileEventSales />} />

          {/* Desktop/Admin Routes */}
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="sales" element={<SalesReception />} />
          <Route path="sales-special" element={<SalesSpecial />} />
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

          {/* Catch-all for Mobile */}
          {IS_MOBILE && <Route path="*" element={<Navigate to="/mobile-dashboard" replace />} />}
        </Route>
      )
    ), [IS_MOBILE]);

  useEffect(() => {
    // Check Configuration Status
    fetch('/api/auth/status')
      .then(res => res.json())
      .then(status => {
        console.log("✅ Config Status:", status);
        setIsConfigured(status === 'Configured');
      })
      .catch(err => {
        console.error("❌ Config Status Check Failed:", err);
        setIsConfigured(false);
      })
      .finally(() => {
        const spl = document.getElementById('app-spinner');
        if (spl) { spl.style.opacity = '0'; setTimeout(() => spl.remove(), 400); }
      });
  }, []);

  if (isConfigured === null) return null;

  return (
    <div id="app-root" className={`fixed inset-0 overflow-hidden ${IS_MOBILE ? 'bg-slate-50' : 'bg-slate-950'} font-sans`}>
      {isConfigured && isLoggedIn ? (
        <RouterProvider router={router} />
      ) : !isConfigured ? (
        <SystemSetup onComplete={() => setIsConfigured(true)} />
      ) : IS_MOBILE && mobileAuthRequired ? (
        <MobileLogin onLoginSuccess={() => setIsLoggedIn(true)} />
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
    </ModalProvider>
  );
}

export default App;

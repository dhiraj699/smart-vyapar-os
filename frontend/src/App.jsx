import { useState } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { CartProvider } from './context/CartContext.jsx';
import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import POSScreen from './pages/POSScreen.jsx';
import Inventory from './pages/Inventory.jsx';
import DealerOrders from './pages/DealerOrders.jsx';
import PriceAlerts from './pages/PriceAlerts.jsx';
import DeadCapital from './pages/DeadCapital.jsx';
import Login from './pages/Login.jsx';
import VendorPortal from './pages/VendorPortal.jsx';
import LoginModal from './components/LoginModal.jsx';
import PrintTestModal from './components/PrintTestModal.jsx';
import AdminOnlyRoute from './components/AdminOnlyRoute.jsx';
import FloatingAssistant from './components/FloatingAssistant.jsx';
import { SHOP } from './lib/config.js';
import { useNetworkStatus, syncOfflineBills } from './lib/offlineStorage.js';
import { api } from './lib/api.js';

const link = ({ isActive }) =>
  `rounded-md px-3 py-1.5 text-sm font-semibold transition-colors ${
    isActive ? 'bg-haldi text-ink shadow-sm' : 'text-white/80 hover:bg-white/10 hover:text-white'
  }`;

/**
 * Gatekeeper Route Guard:
 * Restricts unauthorized users and enforces role boundaries
 */
function RequireAuth({ children, allowedRoles }) {
  const { isAuthenticated, user } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // If user is dealer and tries to access regular store POS/inventory, send to vendor portal
  if (user?.role === 'dealer' && (!allowedRoles || !allowedRoles.includes('dealer'))) {
    return <Navigate to="/vendor-portal" replace />;
  }

  // If role is not allowed, show friendly access banner
  if (allowedRoles && !allowedRoles.includes(user?.role)) {
    return (
      <div className="flex h-screen flex-col items-center justify-center p-6 text-center bg-slate-50 dark:bg-slate-900">
        <div className="max-w-md rounded-2xl border border-red-200 bg-white p-8 shadow-xl dark:border-red-900 dark:bg-slate-800">
          <div className="text-4xl mb-3">🚫</div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">Access Restricted</h2>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            Your role (<b>{user?.role}</b>) is not authorized to access this module.
          </p>
          <NavLink
            to={user?.role === 'dealer' ? '/vendor-portal' : '/'}
            className="mt-6 inline-block rounded-xl bg-leaf px-4 py-2 text-sm font-semibold text-white shadow hover:bg-leaf/90 transition"
          >
            Return to Dashboard
          </NavLink>
        </div>
      </div>
    );
  }

  return children;
}

function MainLayout() {
  const { user, isAdmin, isStaff, logout } = useAuth();
  const { isOnline, pendingCount, refreshPendingCount } = useNetworkStatus();
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [isTestPrintOpen, setIsTestPrintOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncToast, setSyncToast] = useState('');
  const navigate = useNavigate();

  const handleSyncNow = async () => {
    if (syncing || !isOnline) return;
    setSyncing(true);
    try {
      const res = await syncOfflineBills(api);
      refreshPendingCount();
      if (res.synced > 0) {
        setSyncToast(`✅ Synced ${res.synced} offline bill(s) with server!`);
        setTimeout(() => setSyncToast(''), 4000);
      }
    } catch {
      /* ignore */
    } finally {
      setSyncing(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="flex h-full flex-col">
      {/* Top Header */}
      <header className="flex h-14 shrink-0 items-center justify-between gap-3 bg-leaf px-4 text-white shadow-md">
        <div className="flex items-center gap-3">
          <div className="flex items-baseline gap-2">
            <span className="text-xl font-black tracking-tight flex items-center gap-1.5">
              <span>⚡</span> Smart Vyapar
            </span>
            <span className="hidden text-xs text-white/70 font-medium md:inline">
              | {SHOP.name} ({SHOP.address ? SHOP.address.split(',')[0] : 'Store'})
            </span>
          </div>

          {/* Network Status Badge */}
          <div className="flex items-center">
            {isOnline ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-800/80 px-2.5 py-0.5 text-[11px] font-medium text-emerald-100 ring-1 ring-inset ring-emerald-500/20">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Online
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500 px-2.5 py-0.5 text-[11px] font-bold text-slate-900 shadow-sm animate-pulse">
                <span>⚡</span> Offline Billing Active
              </span>
            )}

            {/* Offline Pending Queue Badge */}
            {pendingCount > 0 && (
              <button
                type="button"
                onClick={handleSyncNow}
                disabled={syncing || !isOnline}
                className="ml-2 inline-flex items-center gap-1 rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-bold text-slate-900 hover:bg-amber-300 disabled:opacity-75 transition"
                title="Click to sync offline bills now"
              >
                <span>📦 {pendingCount} Queued</span>
                {isOnline && <span className="underline ml-0.5">{syncing ? 'Syncing...' : 'Sync Now'}</span>}
              </button>
            )}
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav className="flex items-center gap-1" aria-label="Main">
          <NavLink to="/" end className={link}>
            Billing (POS)
          </NavLink>
          <NavLink to="/inventory" className={link}>
            Inventory
          </NavLink>

          {/* Admin Restricted Tabs: Marked clearly for staff */}
          <NavLink to="/dead-capital" className={link}>
            Dead Capital {!isAdmin && <span className="text-[10px] opacity-75">🔒</span>}
          </NavLink>
          <NavLink to="/dealer-orders" className={link}>
            Dealer orders {!isAdmin && <span className="text-[10px] opacity-75">🔒</span>}
          </NavLink>
          <NavLink to="/price-alerts" className={link}>
            Price alerts {!isAdmin && <span className="text-[10px] opacity-75">🔒</span>}
          </NavLink>

          {/* Admin link to view Vendor Portal preview */}
          {isAdmin && (
            <NavLink to="/vendor-portal" className={link} title="Preview Supplier Vendor Portal">
              Vendor Portal 🏢
            </NavLink>
          )}
        </nav>

        {/* Right Action Tools: Printer Test, User Role & Logout */}
        <div className="flex items-center gap-2">
          {/* Printer Test Button */}
          <button
            type="button"
            onClick={() => setIsTestPrintOpen(true)}
            className="hidden sm:flex items-center gap-1.5 rounded-lg border border-white/20 bg-white/10 px-2.5 py-1 text-xs font-semibold text-white hover:bg-white/20 transition"
            title="Test 58mm / 80mm thermal receipt printer & UPI QR scan"
          >
            <span>🖨️</span>
            <span>Printer Test</span>
          </button>

          {/* User Role Badge / Switcher */}
          <button
            type="button"
            onClick={() => setIsLoginOpen(true)}
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold transition shadow-sm ${
              isAdmin
                ? 'bg-amber-400 text-slate-900 hover:bg-amber-300'
                : isStaff
                ? 'bg-sky-400 text-slate-900 hover:bg-sky-300'
                : 'border border-white/30 bg-white/10 text-white hover:bg-white/20'
            }`}
          >
            <span>{isAdmin ? '👑' : isStaff ? '🛒' : '🔑'}</span>
            <span>
              {isAdmin
                ? 'Dukandaar (Admin)'
                : isStaff
                ? 'Counter Boy (Staff)'
                : 'Role Switcher'}
            </span>
          </button>

          {/* Logout Button */}
          <button
            type="button"
            onClick={handleLogout}
            className="flex items-center gap-1 rounded-lg border border-red-500/40 bg-red-600/90 px-2.5 py-1 text-xs font-bold text-white shadow-sm transition hover:bg-red-500 active:scale-95"
            title="Logout and lock screen"
          >
            <span>🚪</span>
            <span className="hidden sm:inline">Logout</span>
          </button>
        </div>
      </header>

      {/* Sync Notification Banner */}
      {syncToast && (
        <div className="bg-emerald-600 px-4 py-1.5 text-center text-xs font-bold text-white shadow-inner animate-in slide-in-from-top-2">
          {syncToast}
        </div>
      )}

      {/* Main Content Area */}
      <main className="min-h-0 flex-1 overflow-auto bg-sage-50/40">
        <Routes>
          <Route
            path="/"
            element={
              <ErrorBoundary name="POS">
                <POSScreen />
              </ErrorBoundary>
            }
          />
          <Route
            path="/inventory"
            element={
              <ErrorBoundary name="Inventory">
                <Inventory />
              </ErrorBoundary>
            }
          />
          <Route
            path="/dead-capital"
            element={
              <ErrorBoundary name="DeadCapital">
                <AdminOnlyRoute
                  onOpenLogin={() => setIsLoginOpen(true)}
                  featureName="Dead Capital Analytics"
                >
                  <DeadCapital />
                </AdminOnlyRoute>
              </ErrorBoundary>
            }
          />
          <Route
            path="/dealer-orders"
            element={
              <ErrorBoundary name="DealerOrders">
                <AdminOnlyRoute
                  onOpenLogin={() => setIsLoginOpen(true)}
                  featureName="Dealer Orders & Ledger"
                >
                  <DealerOrders />
                </AdminOnlyRoute>
              </ErrorBoundary>
            }
          />
          <Route
            path="/price-alerts"
            element={
              <ErrorBoundary name="PriceAlerts">
                <AdminOnlyRoute
                  onOpenLogin={() => setIsLoginOpen(true)}
                  featureName="Mandi Price Projections"
                >
                  <PriceAlerts />
                </AdminOnlyRoute>
              </ErrorBoundary>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      {/* Universal Floating AI Assistant */}
      <FloatingAssistant />

      {/* Modals */}
      <LoginModal isOpen={isLoginOpen} onClose={() => setIsLoginOpen(false)} />
      <PrintTestModal
        isOpen={isTestPrintOpen}
        onClose={() => setIsTestPrintOpen(false)}
        currentPaper={localStorage.getItem('vyapar.paper') === '58mm' ? '58mm' : '80mm'}
        onSavePaper={(p) => {
          localStorage.setItem('vyapar.paper', p);
        }}
      />
    </div>
  );
}

function VendorPortalLayout() {
  const { user, isAdmin, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-800 bg-slate-950 px-6 shadow">
        <div className="flex items-center gap-3">
          <span className="text-xl font-black text-white">⚡ Smart Vyapar OS</span>
          <span className="rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-xs font-semibold text-emerald-400 ring-1 ring-inset ring-emerald-500/30">
            🏢 Supplier Vendor Portal
          </span>
        </div>

        <div className="flex items-center gap-3">
          {isAdmin && (
            <NavLink
              to="/"
              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-500 transition shadow"
            >
              ← Back to Store POS
            </NavLink>
          )}
          <button
            type="button"
            onClick={handleLogout}
            className="flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-600/80 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-500 transition shadow"
          >
            <span>🚪</span>
            <span>Logout</span>
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-auto bg-slate-950 p-4 md:p-6">
        <VendorPortal />
      </div>

      {/* Universal Floating AI Assistant */}
      <FloatingAssistant />
    </div>
  );
}

function AppContent() {
  const { isAuthenticated, user } = useAuth();

  return (
    <Routes>
      {/* Public Login Landing Page */}
      <Route
        path="/login"
        element={
          isAuthenticated ? (
            <Navigate to={user?.role === 'dealer' ? '/vendor-portal' : '/'} replace />
          ) : (
            <Login />
          )
        }
      />

      {/* Supplier / Vendor Portal */}
      <Route
        path="/vendor-portal"
        element={
          <RequireAuth allowedRoles={['dealer', 'admin']}>
            <VendorPortalLayout />
          </RequireAuth>
        }
      />

      {/* Protected Store Main App (POS, Inventory, Dead Capital, etc.) */}
      <Route
        path="/*"
        element={
          <RequireAuth allowedRoles={['admin', 'staff']}>
            <MainLayout />
          </RequireAuth>
        }
      />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <CartProvider>
        <AppContent />
      </CartProvider>
    </AuthProvider>
  );
}

import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { SHOP } from '../lib/config.js';

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, loading, error } = useAuth();

  const demoAdminUser = import.meta.env.VITE_DEMO_ADMIN_USER || 'admin';
  const demoAdminPass = import.meta.env.VITE_DEMO_ADMIN_PASS || '';
  const demoStaffUser = import.meta.env.VITE_DEMO_STAFF_USER || 'staff';
  const demoStaffPass = import.meta.env.VITE_DEMO_STAFF_PASS || '';
  const demoDealerUser = import.meta.env.VITE_DEMO_DEALER_USER || 'dealer';
  const demoDealerPass = import.meta.env.VITE_DEMO_DEALER_PASS || '';

  const [identifier, setIdentifier] = useState(demoAdminUser);
  const [password, setPassword] = useState(demoAdminPass);
  const [selectedPersona, setSelectedPersona] = useState('admin');
  const [showPassword, setShowPassword] = useState(false);
  const [localErr, setLocalErr] = useState('');

  const personas = [
    {
      id: 'admin',
      role: 'admin',
      title: 'Store Owner / Admin',
      badge: 'Full Access',
      badgeColor: 'bg-amber-100 text-amber-900 border-amber-300',
      icon: '👑',
      defaultUsername: demoAdminUser,
      defaultPass: demoAdminPass,
      description:
        'Full administrative access: Wholesale buying costs, profit margins, dead capital analysis, dealer ledgers, and staff settings.',
    },
    {
      id: 'staff',
      role: 'staff',
      title: 'Cashier / Counter Staff',
      badge: 'POS Only',
      badgeColor: 'bg-sky-100 text-sky-900 border-sky-300',
      icon: '🛒',
      defaultUsername: demoStaffUser,
      defaultPass: demoStaffPass,
      description:
        'Restricted billing desk: Rapid POS checkout, thermal print receipts, customer udhar lookups. Confidential wholesale margins are hidden.',
    },
    {
      id: 'dealer',
      role: 'dealer',
      title: 'Supplier / Dealer',
      badge: 'Vendor Portal',
      badgeColor: 'bg-emerald-100 text-emerald-900 border-emerald-300',
      icon: '🏢',
      defaultUsername: demoDealerUser,
      defaultPass: demoDealerPass,
      description:
        'External vendor portal: View store replenishment demand, quoted supply prices, and pending payment ledger balance.',
    },
  ];

  const handleSelectPersona = (p) => {
    setSelectedPersona(p.id);
    setIdentifier(p.defaultUsername);
    setPassword(p.defaultPass);
    setLocalErr('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLocalErr('');

    if (!identifier.trim() || !password) {
      setLocalErr('Please enter username/phone and password');
      return;
    }

    const res = await login(identifier.trim(), password);
    if (res.ok) {
      const targetRole = res.user?.role;
      const destination =
        targetRole === 'dealer'
          ? '/vendor-portal'
          : location.state?.from?.pathname || '/';
      navigate(destination, { replace: true });
    } else {
      setLocalErr(res.message || 'Login failed');
    }
  };

  return (
    <div className="flex min-h-screen flex-col justify-center bg-slate-950 px-4 py-8 text-white sm:px-6 lg:px-8">
      {/* Background radial glow */}
      <div className="pointer-events-none fixed inset-0 flex items-center justify-center opacity-25">
        <div className="h-[600px] w-[600px] rounded-full bg-emerald-600 blur-[140px]" />
      </div>

      <div className="relative mx-auto w-full max-w-4xl">
        {/* Brand Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-950/60 px-4 py-1.5 text-xs font-semibold text-emerald-400 backdrop-blur-md mb-3">
            <span>🛡️</span> Smart Vyapar OS · Production Gatekeeper
          </div>
          <h1 className="text-3xl font-black tracking-tight sm:text-4xl text-white">
            Portal Access & Authentication
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Sign in to access your designated role portal for <b>{SHOP.name}</b>
          </p>
        </div>

        {/* Main Grid: Persona Selector on Left + Login Form on Right */}
        <div className="grid grid-cols-1 overflow-hidden rounded-3xl border border-slate-800 bg-slate-900/90 shadow-2xl backdrop-blur-xl md:grid-cols-12">
          {/* Persona Selector (Left Column - 7 Cols) */}
          <div className="border-b border-slate-800 p-6 md:border-b-0 md:border-r md:col-span-7">
            <div className="mb-4 flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                1. Select User Persona (1-Click Test)
              </span>
              <span className="text-[11px] text-emerald-400">Tap to auto-fill credentials</span>
            </div>

            <div className="space-y-3">
              {personas.map((p) => {
                const isSelected = selectedPersona === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleSelectPersona(p)}
                    className={`flex w-full items-start gap-4 rounded-2xl border p-4 text-left transition-all ${
                      isSelected
                        ? 'border-emerald-500 bg-emerald-950/40 ring-1 ring-emerald-500 shadow-lg'
                        : 'border-slate-800 bg-slate-900/60 hover:border-slate-700 hover:bg-slate-800/40'
                    }`}
                  >
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-800 text-2xl shadow-inner">
                      {p.icon}
                    </span>
                    <div className="flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-white text-sm sm:text-base">
                          {p.title}
                        </span>
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${p.badgeColor}`}
                        >
                          {p.badge}
                        </span>
                      </div>
                      <p className="mt-1 text-xs leading-relaxed text-slate-400">
                        {p.description}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Login Form (Right Column - 5 Cols) */}
          <div className="flex flex-col justify-center p-6 md:col-span-5 bg-slate-950/40">
            <div className="mb-4">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                2. Enter Credentials
              </span>
              <h2 className="mt-1 text-lg font-bold text-white">Sign In</h2>
            </div>

            {(localErr || error) && (
              <div className="mb-4 rounded-xl border border-red-500/30 bg-red-950/50 p-3 text-xs text-red-400 animate-in fade-in">
                ⚠️ {localErr || error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Username or Mobile Number
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="admin / staff / dealer or 10-digit phone"
                    required
                    className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500">
                    👤
                  </span>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-medium text-slate-300">Password</label>
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="text-[11px] text-emerald-400 hover:underline"
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500">
                    🔒
                  </span>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-sm font-bold text-white shadow-lg hover:bg-emerald-500 active:scale-[0.99] transition disabled:opacity-50"
              >
                {loading ? (
                  <span>Authenticating…</span>
                ) : (
                  <>
                    <span>Unlock Portal</span>
                    <span>→</span>
                  </>
                )}
              </button>
            </form>

            <div className="mt-5 rounded-xl border border-slate-800 bg-slate-900/60 p-3 text-[11px] text-slate-400">
              <span className="font-bold text-slate-300">Default Roles:</span>
              <ul className="mt-1 space-y-0.5">
                <li>• Owner: <b>admin</b></li>
                <li>• Staff: <b>staff</b></li>
                <li>• Vendor: <b>dealer</b></li>
              </ul>
              <p className="mt-1 text-[10px] text-slate-500">
                Passwords configured securely via environment variables (.env)
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

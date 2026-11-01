import { useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';

export default function LoginModal({ isOpen, onClose }) {
  const { user, login, quickLogin, logout, loading, error } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [localErr, setLocalErr] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLocalErr('');
    if (!username.trim() || !password) {
      setLocalErr('Please enter both username and password');
      return;
    }
    const res = await login(username.trim(), password);
    if (res.ok) {
      setUsername('');
      setPassword('');
      onClose();
    } else {
      setLocalErr(res.message);
    }
  };

  const handleQuick = async (role) => {
    setLocalErr('');
    const res = await quickLogin(role);
    if (res.ok) {
      onClose();
    } else {
      setLocalErr(res.message);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-black/5 dark:bg-slate-900 dark:text-white">
        {/* Header */}
        <div className="mb-6 flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-leaf/10 text-leaf dark:bg-leaf/20">
                🔒
              </span>
              <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
                Vyapar Security & Access
              </h2>
            </div>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Role-Based Access Control for Store Owner & Counter Staff
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
          >
            ✕
          </button>
        </div>

        {/* Current status if already logged in */}
        {user && (
          <div className="mb-5 rounded-xl border border-leaf/30 bg-leaf/5 p-3.5 dark:bg-leaf/10">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold text-leaf uppercase tracking-wider">
                  Currently Logged In
                </div>
                <div className="font-bold text-slate-900 dark:text-white">
                  {user.name} ({user.role === 'admin' ? '👑 Dukandaar / Owner' : '🛒 Counter Boy / Staff'})
                </div>
              </div>
              <button
                onClick={logout}
                className="rounded-lg border border-red-200 bg-red-50 px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-100 dark:border-red-900 dark:bg-red-950 dark:text-red-400"
              >
                Log Out
              </button>
            </div>
          </div>
        )}

        {/* 1-Click Quick Demo Access */}
        <div className="mb-5">
          <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            1-Click Demo Login (Instant Role Switch)
          </label>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              disabled={loading}
              onClick={() => handleQuick('admin')}
              className="flex flex-col items-center justify-center rounded-xl border-2 border-amber-500/30 bg-amber-50/50 p-3.5 text-center transition hover:border-amber-500 hover:bg-amber-50 dark:bg-amber-950/20 dark:hover:bg-amber-950/40"
            >
              <span className="text-xl">👑</span>
              <span className="mt-1 text-xs font-bold text-amber-900 dark:text-amber-300">
                Dukandaar (Admin)
              </span>
              <span className="mt-0.5 text-[10px] text-amber-700 dark:text-amber-400">
                Full Access · Wholesale Rates
              </span>
            </button>

            <button
              type="button"
              disabled={loading}
              onClick={() => handleQuick('staff')}
              className="flex flex-col items-center justify-center rounded-xl border-2 border-blue-500/30 bg-blue-50/50 p-3.5 text-center transition hover:border-blue-500 hover:bg-blue-50 dark:bg-blue-950/20 dark:hover:bg-blue-950/40"
            >
              <span className="text-xl">🛒</span>
              <span className="mt-1 text-xs font-bold text-blue-900 dark:text-blue-300">
                Counter Boy (Staff)
              </span>
              <span className="mt-0.5 text-[10px] text-blue-700 dark:text-blue-400">
                POS Only · Buy Rates Hidden
              </span>
            </button>
          </div>
        </div>

        <div className="relative my-4">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-slate-200 dark:border-slate-800" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-white px-2 text-slate-400 dark:bg-slate-900">or enter credentials</span>
          </div>
        </div>

        {/* Custom Login Form */}
        <form onSubmit={handleSubmit} className="space-y-3">
          {(localErr || error) && (
            <div className="rounded-lg bg-red-50 p-2.5 text-xs text-red-600 dark:bg-red-950/50 dark:text-red-400">
              ⚠️ {localErr || error}
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
              Username
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. admin or staff"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-leaf focus:ring-1 focus:ring-leaf dark:border-slate-700 dark:bg-slate-800"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-leaf focus:ring-1 focus:ring-leaf dark:border-slate-700 dark:bg-slate-800"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="mt-2 w-full rounded-lg bg-leaf py-2.5 text-sm font-semibold text-white shadow hover:bg-leaf/90 disabled:opacity-50"
          >
            {loading ? 'Verifying...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}

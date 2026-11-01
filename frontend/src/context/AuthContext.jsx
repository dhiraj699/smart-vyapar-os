import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api.js';

const AuthContext = createContext(null);

const TOKEN_KEY = 'vyapar.token';
const USER_KEY = 'vyapar.user';

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => {
    try {
      return localStorage.getItem(TOKEN_KEY) || null;
    } catch {
      return null;
    }
  });

  const [user, setUser] = useState(() => {
    try {
      const raw = localStorage.getItem(USER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  // Listen to 401 broadcast from api.js
  useEffect(() => {
    const handleUnauthorized = () => {
      logout();
    };
    window.addEventListener('vyapar:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('vyapar:unauthorized', handleUnauthorized);
  }, [logout]);

  const login = async (username, password) => {
    setLoading(true);
    setError('');
    try {
      const res = await api.post('/auth/login', { username, password });
      const newToken = res.token;
      const newUser = res.user;

      setToken(newToken);
      setUser(newUser);

      try {
        localStorage.setItem(TOKEN_KEY, newToken);
        localStorage.setItem(USER_KEY, JSON.stringify(newUser));
      } catch {
        /* storage disabled */
      }
      return { ok: true, user: newUser };
    } catch (err) {
      const msg = err.message || 'Login failed';
      setError(msg);
      return { ok: false, message: msg };
    } finally {
      setLoading(false);
    }
  };

  /** 1-click Quick Demo switcher for testing Admin, Staff, or Dealer (reads credentials from .env) */
  const quickLogin = async (role) => {
    const creds = {
      admin: {
        u: import.meta.env.VITE_DEMO_ADMIN_USER || 'admin',
        p: import.meta.env.VITE_DEMO_ADMIN_PASS || '',
      },
      dealer: {
        u: import.meta.env.VITE_DEMO_DEALER_USER || 'dealer',
        p: import.meta.env.VITE_DEMO_DEALER_PASS || '',
      },
      staff: {
        u: import.meta.env.VITE_DEMO_STAFF_USER || 'staff',
        p: import.meta.env.VITE_DEMO_STAFF_PASS || '',
      },
    };
    const c = creds[role] || creds.staff;
    return login(c.u, c.p);
  };

  const isAdmin = user?.role === 'admin';
  const isStaff = user?.role === 'staff';
  const isDealer = user?.role === 'dealer';
  const isAuthenticated = Boolean(token && user);

  return (
    <AuthContext.Provider
      value={{
        token,
        user,
        role: user?.role || null,
        isAdmin,
        isStaff,
        isDealer,
        isAuthenticated,
        loading,
        error,
        login,
        logout,
        quickLogin,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside <AuthProvider>');
  }
  return ctx;
}

export default AuthContext;

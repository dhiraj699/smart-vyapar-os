import { useAuth } from '../context/AuthContext.jsx';

export default function AdminOnlyRoute({ children, onOpenLogin, featureName = 'This feature' }) {
  const { user, isAdmin } = useAuth();

  if (isAdmin) {
    return children;
  }

  return (
    <div className="flex h-full flex-col items-center justify-center p-6 text-center">
      <div className="w-full max-w-md rounded-2xl border border-amber-200 bg-white p-8 shadow-xl dark:border-amber-900/50 dark:bg-slate-900">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-100 text-3xl dark:bg-amber-950/50">
          👑
        </div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-white">
          Dukandaar (Owner) Access Only
        </h2>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          <b>{featureName}</b> contains confidential business data (wholesale buying prices, dealer quotes, and shop profit margins).
        </p>

        {user && user.role === 'staff' && (
          <div className="mt-4 rounded-lg bg-blue-50 p-2.5 text-xs text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
            Currently logged in as: <b>{user.name}</b> (Counter Boy / Staff)
          </div>
        )}

        <div className="mt-6 flex flex-col gap-2">
          <button
            onClick={onOpenLogin}
            className="w-full rounded-xl bg-leaf py-2.5 text-sm font-semibold text-white shadow hover:bg-leaf/90 transition"
          >
            Switch to Dukandaar (Admin) Login
          </button>
        </div>
      </div>
    </div>
  );
}

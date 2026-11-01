import { useState, useEffect } from 'react';
import { api } from '../lib/api.js';
import { inr, num } from '../lib/format.js';
import { useAuth } from '../context/AuthContext.jsx';
import { SHOP } from '../lib/config.js';

export default function VendorPortal() {
  const { user, logout } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadPortalData = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/dealers/my-portal');
      setData(res.data);
    } catch (err) {
      setError(err.message || 'Failed to load vendor portal details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPortalData();
  }, []);

  const dealer = data?.dealer || user?.dealer || {};
  const linkedProducts = data?.linkedProducts || [];
  const reorderDemandCount = data?.reorderDemandCount || 0;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
      {/* Top Banner / Vendor Header */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 text-2xl shadow-inner dark:bg-amber-950">
              🏢
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-black text-slate-900 dark:text-white">
                  {dealer.agencyName || dealer.name || 'Vendor Portal'}
                </h1>
                <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                  Verified Supplier
                </span>
              </div>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Contact: {dealer.name} · Ph: {dealer.phone || user?.phone || 'N/A'} · Supplied Store:{' '}
                <b>{SHOP.name}</b>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={loadPortalData}
              disabled={loading}
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              🔄 Refresh
            </button>
            <a
              href={`https://wa.me/91${SHOP.phone}?text=Namaste%20${encodeURIComponent(
                SHOP.name
              )},%20this%20is%20${encodeURIComponent(dealer.name || 'Supplier')}.%20Regarding%20stock%20orders.`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 transition"
            >
              <span>💬</span> WhatsApp Shop Owner
            </a>
          </div>
        </div>
      </div>

      {/* KPI Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {/* Ledger Balance */}
        <div className="rounded-2xl border border-amber-200/80 bg-gradient-to-br from-amber-50 to-amber-100/40 p-5 shadow-xs dark:border-amber-900/40 dark:from-amber-950/20 dark:to-amber-900/10">
          <span className="text-xs font-bold uppercase tracking-wider text-amber-800 dark:text-amber-400">
            Pending Ledger Balance
          </span>
          <div className="mt-2 text-3xl font-black text-amber-950 dark:text-amber-200">
            {inr(dealer.pendingBalance || 0)}
          </div>
          <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
            Amount payable by {SHOP.name} to you
          </p>
        </div>

        {/* Quoted Products */}
        <div className="rounded-2xl border border-blue-200/80 bg-gradient-to-br from-blue-50 to-blue-100/40 p-5 shadow-xs dark:border-blue-900/40 dark:from-blue-950/20 dark:to-blue-900/10">
          <span className="text-xs font-bold uppercase tracking-wider text-blue-800 dark:text-blue-400">
            Active Catalog Items
          </span>
          <div className="mt-2 text-3xl font-black text-blue-950 dark:text-blue-200">
            {linkedProducts.length}
          </div>
          <p className="mt-1 text-xs text-blue-700 dark:text-blue-400">
            Products linked to your agency quote
          </p>
        </div>

        {/* Reorder Demand */}
        <div className="rounded-2xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50 to-emerald-100/40 p-5 shadow-xs dark:border-emerald-900/40 dark:from-emerald-950/20 dark:to-emerald-900/10">
          <span className="text-xs font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-400">
            Immediate Reorder Demand
          </span>
          <div className="mt-2 text-3xl font-black text-emerald-950 dark:text-emerald-200">
            {reorderDemandCount} <span className="text-sm font-semibold">SKUs</span>
          </div>
          <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-400">
            Store inventory is running low on these items
          </p>
        </div>
      </div>

      {/* Linked Products and Quote Demands Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="border-b border-slate-100 p-4 dark:border-slate-800 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              Supplied Catalog & Quoted Rates
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Your agreed wholesale prices and live replenishment demand at {SHOP.name}
            </p>
          </div>
          <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            {linkedProducts.length} Items
          </span>
        </div>

        {error && (
          <div className="p-4 text-xs font-semibold text-red-600 bg-red-50 dark:bg-red-950/50">
            ⚠️ {error}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-left text-sm">
            <thead className="border-b border-slate-100 bg-slate-50/80 text-xs font-bold uppercase text-slate-500 dark:border-slate-800 dark:bg-slate-800/50">
              <tr>
                <th className="px-5 py-3.5">Product Name</th>
                <th className="px-4 py-3.5">Category</th>
                <th className="px-4 py-3.5 text-right">Agreed Supply Rate</th>
                <th className="px-4 py-3.5">Scheme / Bulk Offer</th>
                <th className="px-4 py-3.5 text-center">Store Stock Status</th>
                <th className="px-5 py-3.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-400">
                    Loading your vendor items…
                  </td>
                </tr>
              )}

              {!loading && linkedProducts.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-400">
                    No products currently mapped to your agency quote.
                  </td>
                </tr>
              )}

              {!loading &&
                linkedProducts.map((p) => (
                  <tr key={p._id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition">
                    <td className="px-5 py-3.5">
                      <div className="font-bold text-slate-900 dark:text-white">{p.name}</div>
                      <div className="text-xs text-slate-500">Unit: {p.unit}</div>
                    </td>
                    <td className="px-4 py-3.5 capitalize text-xs font-semibold text-slate-600 dark:text-slate-300">
                      {p.category}
                    </td>
                    <td className="px-4 py-3.5 text-right font-black text-slate-900 dark:text-white">
                      {inr(p.quotedPrice)}
                    </td>
                    <td className="px-4 py-3.5 text-xs text-slate-600 dark:text-slate-300">
                      {p.schemeText ? (
                        <span className="rounded bg-amber-100 px-2 py-0.5 font-bold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                          {p.schemeText}
                        </span>
                      ) : (
                        <span className="text-slate-400">Standard Net</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      {p.needsRestock ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-bold text-red-800 animate-pulse dark:bg-red-950 dark:text-red-300">
                          <span>⚠️</span> Reorder Needed ({p.stockQuantity} left)
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                          <span>✓</span> In Stock ({p.stockQuantity})
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <a
                        href={`https://wa.me/91${SHOP.phone}?text=Namaste%20${encodeURIComponent(
                          SHOP.name
                        )},%20I%20can%20dispatch%20fresh%20units%20for%20${encodeURIComponent(p.name)}.`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 hover:border-slate-300 shadow-xs transition"
                      >
                        Dispatch Note
                      </a>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

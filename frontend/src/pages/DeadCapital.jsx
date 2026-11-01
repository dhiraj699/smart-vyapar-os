import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { inr, num } from '../lib/format.js';
import { useCart } from '../context/CartContext.jsx';

export default function DeadCapital() {
  const navigate = useNavigate();
  const { addItem, setDiscount } = useCart();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [days, setDays] = useState(45);
  const [factor, setFactor] = useState(0.4);
  const [syncing, setSyncing] = useState(false);
  const [toast, setToast] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get(`/analytics/dead-capital?days=${days}&factor=${factor}`);
      setData(res.data);
    } catch (err) {
      setError(err.message || 'Failed to load dead capital analytics');
    } finally {
      setLoading(false);
    }
  }, [days, factor]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSyncFlags = async () => {
    setSyncing(true);
    try {
      const res = await api.get(`/analytics/dead-capital?days=${days}&sync=true`);
      setData(res.data);
      setToast('Dead stock flags synced across inventory');
      setTimeout(() => setToast(''), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSyncing(false);
    }
  };

  const handleApplyBundle = (item) => {
    const rec = item.recommendation;
    if (!rec || rec.strategy !== 'BUNDLE' || !rec.fastMover) return;

    // Add dead item to cart
    addItem({
      _id: item.productId,
      name: item.name,
      sellingPrice: item.sellingPrice,
      stockQuantity: item.stockQuantity,
      unit: item.unit,
    }, 1);

    // Add fast mover partner
    addItem({
      _id: rec.fastMover.productId,
      name: rec.fastMover.name,
      sellingPrice: rec.fastMover.sellingPrice,
      stockQuantity: 999, // default available
      unit: 'pcs',
    }, 1);

    // Set bundle discount
    if (rec.discountPerBundle > 0) {
      setDiscount(rec.discountPerBundle);
    }

    setToast(`Added bundle: ${item.name} + ${rec.fastMover.name} with ₹${rec.discountPerBundle} discount!`);
    setTimeout(() => {
      navigate('/');
    }, 1200);
  };

  const summary = data?.summary || { totalBlockedCapital: 0, deadProductCount: 0, totalUnits: 0, potentialRevenueAtMrp: 0 };
  const items = data?.items || [];
  const categories = data?.categoryBreakdown || [];

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4 md:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Dead Capital Liquidator</h1>
          <p className="text-sm text-sage-500">
            Identify stuck capital (&gt; {days} days idle) and generate smart clearance bundles with fast-moving goods.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleSyncFlags}
            className="btn-ghost text-xs"
            disabled={syncing || loading}
          >
            {syncing ? 'Syncing…' : 'Sync Inventory Flags'}
          </button>
          <button type="button" onClick={loadData} className="btn-leaf text-xs" disabled={loading}>
            Refresh
          </button>
        </div>
      </header>

      {/* Control panel */}
      <div className="flex flex-wrap items-center gap-4 rounded-xl border border-sage-200 bg-white p-4 shadow-sm">
        <label className="flex items-center gap-2 text-sm font-semibold">
          <span>Idle threshold:</span>
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="field py-1 text-sm font-bold"
          >
            <option value={30}>30 Days</option>
            <option value={45}>45 Days (Standard)</option>
            <option value={60}>60 Days</option>
            <option value={90}>90 Days</option>
          </select>
        </label>

        <label className="flex items-center gap-2 text-sm font-semibold">
          <span>Bundle discount share:</span>
          <select
            value={factor}
            onChange={(e) => setFactor(Number(e.target.value))}
            className="field py-1 text-sm font-bold"
          >
            <option value={0.25}>25% of margin</option>
            <option value={0.4}>40% of margin (Recommended)</option>
            <option value={0.6}>60% of margin (Aggressive)</option>
          </select>
        </label>
      </div>

      {error && (
        <div role="alert" className="rounded-xl border border-chilli/30 bg-chilli-light p-4 text-sm text-chilli-dark">
          {error}
        </div>
      )}

      {/* Metrics Banner */}
      {!loading && !error && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-chilli/30 bg-chilli-light p-4">
            <span className="text-xs font-semibold uppercase tracking-wider text-chilli-dark">Blocked Capital</span>
            <div className="mt-1 text-2xl font-black text-chilli-dark">{inr(summary.totalBlockedCapital)}</div>
            <span className="text-xs text-ink/70">At wholesale buying cost</span>
          </div>

          <div className="rounded-xl border border-sage-200 bg-white p-4 shadow-sm">
            <span className="text-xs font-semibold uppercase tracking-wider text-sage-500">Dead Products</span>
            <div className="mt-1 text-2xl font-black text-ink">{summary.deadProductCount}</div>
            <span className="text-xs text-sage-500">{num(summary.totalUnits)} total units idle</span>
          </div>

          <div className="rounded-xl border border-leaf/30 bg-leaf-light p-4">
            <span className="text-xs font-semibold uppercase tracking-wider text-leaf">Potential Revenue</span>
            <div className="mt-1 text-2xl font-black text-leaf">{inr(summary.potentialRevenueAtMrp)}</div>
            <span className="text-xs text-ink/70">When liquidated at MRP</span>
          </div>

          <div className="rounded-xl border border-haldi/50 bg-haldi-light p-4">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#7A5600]">Top Categories</span>
            <div className="mt-1 text-sm font-bold text-ink">
              {categories.slice(0, 2).map((c) => `${c.category} (${inr(c.blockedCapital)})`).join(', ') || 'None'}
            </div>
            <span className="text-xs text-[#7A5600]">Hold majority of dead capital</span>
          </div>
        </div>
      )}

      {loading && <p className="p-6 text-center text-sage-500">Analyzing slow-moving inventory & computing bundles…</p>}

      {!loading && !error && items.length === 0 && (
        <div className="rounded-xl border border-leaf/30 bg-leaf-light p-8 text-center">
          <p className="text-lg font-bold text-leaf">Great inventory velocity!</p>
          <p className="mt-1 text-sm text-ink/80">No products have been idle for more than {days} days.</p>
        </div>
      )}

      {/* Dead Stock & Bundle Recommendations */}
      <div className="space-y-4">
        {items.map((item) => {
          const rec = item.recommendation;
          const isBundle = rec?.strategy === 'BUNDLE' && rec.fastMover;

          return (
            <article
              key={item.productId}
              className="flex flex-col overflow-hidden rounded-xl border border-sage-200 bg-white shadow-sm lg:flex-row"
            >
              {/* Left: Dead Item Info */}
              <div className="flex-1 p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-lg font-bold text-ink">{item.name}</h3>
                  <span className="rounded-full bg-chilli-light px-2.5 py-0.5 text-xs font-bold text-chilli-dark">
                    {item.daysIdle} days idle
                  </span>
                </div>
                <p className="text-xs text-sage-500 capitalize">{item.category} · {item.unit}</p>

                <div className="mt-3 grid grid-cols-3 gap-2 rounded-lg bg-sage-50 p-3 text-xs">
                  <div>
                    <span className="text-sage-500">Stock left:</span>
                    <p className="font-bold">{num(item.stockQuantity)} {item.unit}</p>
                  </div>
                  <div>
                    <span className="text-sage-500">Wholesale cost:</span>
                    <p className="font-bold">{inr(item.wholesalePrice)}</p>
                  </div>
                  <div>
                    <span className="text-sage-500">Blocked money:</span>
                    <p className="font-bold text-chilli-dark">{inr(item.blockedCapital)}</p>
                  </div>
                </div>
              </div>

              {/* Right: Smart Bundle Action */}
              <div className="border-t border-sage-200 bg-sage-50/50 p-5 lg:w-[420px] lg:border-l lg:border-t-0">
                {isBundle ? (
                  <div className="space-y-2.5">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-leaf">
                      <span>⚡ SMART BUNDLE STRATEGY</span>
                      <span className="rounded bg-leaf/10 px-1.5 py-0.2 text-[10px]">{rec.matchType}</span>
                    </div>

                    <p className="text-sm font-semibold text-ink">{rec.message}</p>

                    <div className="flex items-center justify-between text-xs text-sage-500">
                      <span>Normal price: <span className="line-through">{inr(rec.normalPrice)}</span></span>
                      <span>Bundle price: <span className="text-base font-bold text-leaf">{inr(rec.bundlePrice)}</span></span>
                      <span className="rounded bg-haldi px-1.5 py-0.5 text-xs font-bold text-ink">Save {inr(rec.discountPerBundle)}</span>
                    </div>

                    <p className="text-[11px] text-sage-500">
                      Partnered with best-seller: <b>{rec.fastMover.name}</b> ({num(rec.fastMover.unitsSold30d)} sold last month)
                    </p>

                    <button
                      type="button"
                      onClick={() => handleApplyBundle(item)}
                      className="btn-leaf mt-2 w-full py-2 text-xs font-bold shadow-sm"
                    >
                      Add Bundle to Billing Cart & Apply Discount
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <span className="text-xs font-bold text-chilli-dark">FLAT CLEARANCE DISCOUNT</span>
                    <p className="text-xs text-ink/80">{rec?.message || 'Discount directly at POS to free up capital.'}</p>
                  </div>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-4 left-1/2 z-50 max-w-[90vw] -translate-x-1/2 rounded-lg bg-ink px-4 py-2.5 text-sm font-semibold text-white shadow-lg"
        >
          {toast}
        </div>
      )}
    </div>
  );
}

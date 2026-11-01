import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api.js';
import { SHOP } from '../lib/config.js';
import { inr, num } from '../lib/format.js';

const suggestedQty = (p) => Math.max(1, Math.ceil((p?.lowStockThreshold || 10) * 2 - (p?.stockQuantity || 0)));

/** wa.me needs digits only, with country code. */
const waNumber = (phone) => {
  const d = String(phone || '').replace(/\D/g, '');
  return d.length === 10 ? `91${d}` : d;
};

export function buildOrderText(order, shop = SHOP) {
  const date = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  const lines = (order?.lines || []).map((l, i) => {
    const free = l.freeUnits > 0 ? ` (+${num(l.freeUnits)} free${l.schemeText ? `, scheme ${l.schemeText}` : ''})` : '';
    return `${i + 1}. ${l.name} - ${num(l.requiredQuantity)} ${l.unit} @ ₹${l.quotedPrice}${free}`;
  });
  return [
    `*Purchase order - ${shop?.name || 'Smart Vyapar'}*`,
    `Date: ${date}`,
    `To: ${order?.dealer?.name || 'Dealer'}${order?.dealer?.agencyName ? ` (${order.dealer.agencyName})` : ''}`,
    '',
    ...lines,
    '',
    `Approx. value: ${inr(order?.subtotal)}`,
    '',
    'Please confirm availability and delivery time. Thank you!',
  ].join('\n');
}

export const whatsappUrl = (order, shop = SHOP) =>
  `https://wa.me/${waNumber(order?.dealer?.phone)}?text=${encodeURIComponent(buildOrderText(order, shop))}`;

export default function DealerOrders() {
  const [lowStock, setLowStock] = useState([]);
  const [qty, setQty] = useState({});
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [planning, setPlanning] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/products/low-stock');
      const list = Array.isArray(res?.data) ? res.data : [];
      setLowStock(list);
      setQty(Object.fromEntries(list.map((p) => [p._id, suggestedQty(p)])));
    } catch (err) {
      setError(err.message || 'Could not load low-stock items');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Re-run the optimiser (debounced) whenever quantities change.
  useEffect(() => {
    const items = lowStock
      .map((p) => ({ productId: p._id, requiredQuantity: Number(qty[p._id]) || 0 }))
      .filter((i) => i.requiredQuantity > 0);
    if (!items.length) {
      setPlan(null);
      return undefined;
    }

    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setPlanning(true);
      try {
        const res = await api.post('/procurement/optimize-order', { items }, { signal: ctrl.signal });
        setPlan(res.data);
        setError('');
      } catch (err) {
        if (err.name !== 'AbortError') setError(err.message || 'Failed to optimize orders');
      } finally {
        setPlanning(false);
      }
    }, 450);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [lowStock, qty]);

  const productById = useMemo(() => new Map(lowStock.map((p) => [p._id, p])), [lowStock]);

  const send = (order) => {
    try {
      const win = window.open(whatsappUrl(order), '_blank', 'noopener,noreferrer');
      if (!win) {
        setError('Popup blocked by browser. Please allow popups to open WhatsApp.');
      }
      setSent((s) => ({ ...s, [order.dealer.dealerId]: true }));
    } catch {
      setError('Could not open WhatsApp window.');
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4 md:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Dealer orders</h1>
          <p className="text-sm text-sage-500">
            Low-stock items, split across dealers for the lowest cost. Change a quantity and the plan updates.
          </p>
        </div>
        <button type="button" onClick={load} className="btn-ghost" disabled={loading}>
          Refresh stock
        </button>
      </header>

      {error && <div role="alert" className="rounded-xl border border-chilli/30 bg-chilli-light p-3 text-sm text-chilli-dark">{error}</div>}
      {loading && <p className="text-sage-500">Checking stock levels…</p>}
      {!loading && !error && lowStock.length === 0 && (
        <div className="rounded-xl border border-leaf/30 bg-leaf-light p-6 text-center">
          <p className="font-bold text-leaf">All items are above their low-stock level</p>
          <p className="text-sm">Nothing to order right now.</p>
        </div>
      )}

      {plan?.summary && (
        <div
          className={`flex flex-wrap items-center gap-x-8 gap-y-2 rounded-xl bg-leaf px-5 py-4 text-white transition-opacity ${
            planning ? 'opacity-70' : ''
          }`}
          aria-live="polite"
        >
          <div>
            <div className="text-sm text-white/70">Total order value</div>
            <div className="text-2xl font-bold">{inr(plan.summary.totalCost)}</div>
          </div>
          <div>
            <div className="text-sm text-white/70">Dealers</div>
            <div className="text-2xl font-bold">{plan.summary.dealersInvolved}</div>
          </div>
          <div>
            <div className="text-sm text-white/70">Saved vs. your current buying price</div>
            <div className="text-2xl font-bold text-haldi">{inr(plan.summary.totalNetSavings)}</div>
          </div>
        </div>
      )}

      {plan?.purchaseOrders?.map((order) => (
        <section key={order.dealer.dealerId} className="overflow-hidden rounded-xl border border-sage-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-sage-200 bg-sage-100 px-4 py-3">
            <div>
              <h2 className="text-lg font-bold">{order.dealer.name}</h2>
              <p className="text-sm text-sage-500">
                {order.dealer.agencyName || 'Dealer'} · {order.dealer.phone}
                {order.dealer.pendingBalance > 0 && (
                  <span className="ml-2 font-semibold text-[#7A5600]">You owe {inr(order.dealer.pendingBalance)}</span>
                )}
              </p>
            </div>
            <button type="button" onClick={() => send(order)} className="btn bg-[#25D366] text-ink hover:bg-[#1fb857]">
              {sent[order.dealer.dealerId] ? 'Send again on WhatsApp' : 'Send WhatsApp Order'}
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="text-left text-xs text-sage-500">
                <tr>
                  <th className="px-4 py-2 font-semibold">Item</th>
                  <th className="px-2 py-2 font-semibold">In stock</th>
                  <th className="px-2 py-2 font-semibold">Order qty</th>
                  <th className="px-2 py-2 text-right font-semibold">Rate</th>
                  <th className="px-2 py-2 font-semibold">Scheme</th>
                  <th className="px-2 py-2 text-right font-semibold">Effective rate</th>
                  <th className="px-4 py-2 text-right font-semibold">Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sage-100">
                {order.lines.map((l) => {
                  const p = productById.get(l.productId);
                  return (
                    <tr key={l.productId}>
                      <td className="px-4 py-2.5 font-semibold">
                        {l.name}
                        {l.alternatives?.[0] && (
                          <div className="text-xs font-normal text-sage-500">
                            Next best: {l.alternatives[0].dealerName}, +{inr(l.alternatives[0].extraCost)}
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-2.5">
                        <span className="rounded bg-haldi-light px-1.5 py-0.5 text-xs font-semibold text-[#7A5600]">
                          {num(p?.stockQuantity)} {l.unit}
                        </span>
                      </td>
                      <td className="px-2 py-2.5">
                        <input
                          type="number"
                          min="0"
                          value={qty[l.productId] ?? ''}
                          onChange={(e) => setQty((q) => ({ ...q, [l.productId]: e.target.value }))}
                          className="field w-20 py-1 text-center"
                          aria-label={`Order quantity for ${l.name}`}
                        />
                      </td>
                      <td className="px-2 py-2.5 text-right">{inr(l.quotedPrice)}</td>
                      <td className="px-2 py-2.5">
                        {l.freeUnits > 0 ? (
                          <span className="rounded bg-leaf-light px-1.5 py-0.5 text-xs font-semibold text-leaf">
                            {l.schemeText || 'Scheme'} · {num(l.freeUnits)} free
                          </span>
                        ) : (
                          <span className="text-sage-500">—</span>
                        )}
                      </td>
                      <td className="px-2 py-2.5 text-right font-semibold">{inr(l.effectivePrice)}</td>
                      <td className="px-4 py-2.5 text-right font-bold">{inr(l.lineCost)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-sage-200 bg-sage-50">
                  <td colSpan={5} className="px-4 py-2.5 text-sm text-leaf">
                    Saved on this order: <span className="font-bold">{inr(order.netSavings)}</span>
                  </td>
                  <td className="px-2 py-2.5 text-right text-sm text-sage-500">Subtotal</td>
                  <td className="px-4 py-2.5 text-right text-base font-bold">{inr(order.subtotal)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>
      ))}

      {plan?.unassigned && plan.unassigned.length > 0 && (
        <section className="rounded-xl border border-haldi/50 bg-haldi-light p-4">
          <h2 className="font-bold">No dealer quote yet</h2>
          <p className="text-sm">Add a dealer price for these items to include them in an order.</p>
          <ul className="mt-2 list-inside list-disc text-sm">
            {plan.unassigned.map((u) => (
              <li key={u.productId}>
                {u.name} — need {num(u.requiredQuantity)}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

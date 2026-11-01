import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api.js';
import { daysUntil, inr, shortDate } from '../lib/format.js';

const FILTERS = [
  ['ALL', 'All'],
  ['INCREASE', 'Rate hikes'],
  ['DECREASE', 'Rate drops'],
];

const whenText = (d) => {
  const n = daysUntil(d);
  if (n <= 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  return `in ${n} days`;
};

const tagsFor = (alert) => {
  if (alert.reasonTags && Array.isArray(alert.reasonTags) && alert.reasonTags.length) {
    return alert.reasonTags;
  }
  if (alert.reason) {
    return [alert.reason.split(/[.,;]/)[0].trim()].filter(Boolean);
  }
  return [];
};

function AlertCard({ alert }) {
  const up = alert.direction === 'INCREASE';
  const qty = alert.estimatedOrderQty || 50;
  const current = Number(alert.currentPrice) || 0;
  const projected = Number(alert.projectedPrice) || 0;
  const delta = Math.abs(projected - current);
  const pct = current > 0 ? (delta / current) * 100 : 0;
  const saving = Math.round(delta * qty);
  const tone = up
    ? { border: 'border-chilli/40', head: 'bg-chilli-light', text: 'text-chilli-dark', bar: 'bg-chilli', banner: 'bg-chilli text-white', arrow: '▲' }
    : { border: 'border-leaf/40', head: 'bg-leaf-light', text: 'text-leaf', bar: 'bg-leaf', banner: 'bg-leaf text-white', arrow: '▼' };

  return (
    <article className={`flex flex-col overflow-hidden rounded-xl border-2 bg-white ${tone.border}`}>
      <div className={`flex items-start justify-between gap-3 px-4 py-3 ${tone.head}`}>
        <div>
          <h3 className="text-base font-bold leading-tight">{alert.productName}</h3>
          <p className="text-xs text-sage-500">{alert.category || 'General'}</p>
        </div>
        <span className={`shrink-0 rounded-full bg-white px-2.5 py-1 text-xs font-bold ${tone.text}`}>
          {tone.arrow} {pct.toFixed(1)}%
        </span>
      </div>

      <div className="flex-1 space-y-3 px-4 py-3">
        <div className="flex items-baseline gap-2">
          <span className="text-lg text-sage-500 line-through">{inr(current)}</span>
          <span className={`text-3xl font-bold ${tone.text}`}>{inr(projected)}</span>
        </div>
        <p className="text-sm">
          {up ? 'Expected to rise' : 'Expected to fall'} on <span className="font-bold">{shortDate(alert.effectiveDate)}</span>
          <span className="text-sage-500"> ({whenText(alert.effectiveDate)})</span>
        </p>

        {tagsFor(alert).length > 0 && (
          <ul className="flex flex-wrap gap-1.5" aria-label="Reasons">
            {tagsFor(alert).map((t) => (
              <li key={t} className="rounded-md border border-sage-300 bg-sage-50 px-2 py-0.5 text-xs font-semibold">
                {t}
              </li>
            ))}
          </ul>
        )}
        {alert.reason && <p className="text-xs text-sage-500">{alert.reason}</p>}

        <div>
          <div className="flex justify-between text-xs">
            <span className="text-sage-500">Forecast confidence</span>
            <span className="font-bold">{Math.round(alert.confidenceScore || 0)}%</span>
          </div>
          <div
            className="mt-1 h-1.5 overflow-hidden rounded-full bg-sage-100"
            role="progressbar"
            aria-valuenow={Math.round(alert.confidenceScore || 0)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Forecast confidence"
          >
            <div
              className={`h-full rounded-full ${tone.bar}`}
              style={{ width: `${Math.min(100, Math.max(0, alert.confidenceScore || 0))}%` }}
            />
          </div>
        </div>
      </div>

      <div className={`px-4 py-3 text-sm font-bold ${tone.banner}`}>
        {up ? (
          <>
            Advance book now to save {inr(saving)}
            <span className="block text-xs font-medium text-white/85">
              on about {qty} units before {shortDate(alert.effectiveDate)}
            </span>
          </>
        ) : (
          <>
            Delay purchase, rate dropping on {shortDate(alert.effectiveDate)}
            <span className="block text-xs font-medium text-white/85">
              waiting could save about {inr(saving)} on {qty} units
            </span>
          </>
        )}
      </div>
    </article>
  );
}

export default function PriceAlerts() {
  const [alerts, setAlerts] = useState([]);
  const [filter, setFilter] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/price-alerts?upcoming=true');
      setAlerts(Array.isArray(res?.data) ? res.data : []);
    } catch (err) {
      setError(err.message || 'Failed to load price alerts');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const stats = useMemo(() => {
    const list = Array.isArray(alerts) ? alerts : [];
    const hikes = list.filter((a) => a.direction === 'INCREASE');
    const drops = list.filter((a) => a.direction === 'DECREASE');
    const value = (subList) =>
      subList.reduce((s, a) => s + Math.abs((Number(a.projectedPrice) || 0) - (Number(a.currentPrice) || 0)) * (a.estimatedOrderQty || 50), 0);
    return { hikes: hikes.length, drops: drops.length, hikeValue: value(hikes), dropValue: value(drops) };
  }, [alerts]);

  const visible = useMemo(() => {
    const list = Array.isArray(alerts) ? alerts : [];
    return list.filter((a) => filter === 'ALL' || a.direction === filter);
  }, [alerts, filter]);

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4 md:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Price alerts</h1>
          <p className="text-sm text-sage-500">
            Upcoming wholesale rate changes, so you buy before a hike and wait before a drop.
          </p>
        </div>
        <button type="button" className="btn-ghost" onClick={load} disabled={loading}>
          Refresh
        </button>
      </header>

      {!loading && !error && alerts.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-chilli/30 bg-chilli-light px-4 py-3">
            <div className="text-sm text-chilli-dark">
              {stats.hikes} rate {stats.hikes === 1 ? 'hike' : 'hikes'} coming
            </div>
            <div className="text-xl font-bold text-chilli-dark">
              {inr(stats.hikeValue)} <span className="text-sm font-medium">at stake if you wait</span>
            </div>
          </div>
          <div className="rounded-xl border border-leaf/30 bg-leaf-light px-4 py-3">
            <div className="text-sm text-leaf">
              {stats.drops} rate {stats.drops === 1 ? 'drop' : 'drops'} coming
            </div>
            <div className="text-xl font-bold text-leaf">
              {inr(stats.dropValue)} <span className="text-sm font-medium">you can save by waiting</span>
            </div>
          </div>
        </div>
      )}

      <div className="inline-flex overflow-hidden rounded-lg border border-sage-300" role="group" aria-label="Filter alerts">
        {FILTERS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            aria-pressed={filter === key}
            className={`px-4 py-2 text-sm font-semibold ${
              filter === key ? 'bg-leaf text-white' : 'bg-white hover:bg-sage-100'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {error && (
        <div role="alert" className="rounded-xl border border-chilli/30 bg-chilli-light p-4">
          <p className="font-semibold text-chilli-dark">Could not load price alerts</p>
          <p className="text-sm">{error}</p>
          <button type="button" className="btn-ghost mt-2" onClick={load}>
            Try again
          </button>
        </div>
      )}
      {loading && <p className="text-sage-500">Loading alerts…</p>}
      {!loading && !error && visible.length === 0 && (
        <div className="rounded-xl border border-sage-200 bg-white p-8 text-center">
          <p className="font-bold">No upcoming price changes</p>
          <p className="text-sm text-sage-500">New forecasts appear here as soon as they are added with POST /api/price-alerts.</p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((a) => (
          <AlertCard key={a._id} alert={a} />
        ))}
      </div>
    </div>
  );
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useReactToPrint } from 'react-to-print';
import { QRCodeSVG } from 'qrcode.react';
import { api } from '../lib/api.js';
import { SHOP } from '../lib/config.js';
import { inr, num } from '../lib/format.js';
import { useCart } from '../context/CartContext.jsx';
import ThermalReceipt from '../components/ThermalReceipt.jsx';
import TrustBadge from '../components/TrustBadge.jsx';
import VoicePOS from '../components/VoicePOS.jsx';
import ErrorBoundary from '../components/ErrorBoundary.jsx';
import AddProductModal from '../components/AddProductModal.jsx';
import { useBarcodeScanner } from '../hooks/useBarcodeScanner.js';
import { playScanBeep, playErrorBeep, playCashChime } from '../utils/audio.js';
import { cacheCatalog, getCachedCatalog, saveOfflineBill } from '../lib/offlineStorage.js';
import { useAuth } from '../context/AuthContext.jsx';

const MODES = ['Cash', 'UPI', 'Udhar'];
const DUE_OPTIONS = [7, 15, 30];

const safeGetStorage = (key, fallback) => {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
};

const safeSetStorage = (key, value) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage unavailable or disabled
  }
};

const readPaper = () => {
  return safeGetStorage('vyapar.paper', '80mm') === '58mm' ? '58mm' : '80mm';
};

function useToast() {
  const [toast, setToast] = useState(null);
  const timer = useRef();
  const notify = useCallback((message, kind = 'ok') => {
    clearTimeout(timer.current);
    setToast({ message, kind });
    timer.current = setTimeout(() => setToast(null), kind === 'error' ? 6000 : 3000);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);
  return [toast, notify];
}

export default function POSScreen() {
  const { items, discount, subTotal, grandTotal, addItem, setQty, removeItem, setDiscount, clear } = useCart();

  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState('Cash');
  const [phone, setPhone] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [dueDays, setDueDays] = useState(15);
  const [cust, setCust] = useState({ status: 'idle', data: null, error: '' });
  const [submitting, setSubmitting] = useState(false);
  const [showVoice, setShowVoice] = useState(false);
  const [paper, setPaper] = useState(readPaper);
  const [lastSale, setLastSale] = useState(null);
  const [pendingPrint, setPendingPrint] = useState(false);
  const [toast, notify] = useToast();
  const { isAdmin } = useAuth();

  // Stress test / high volume display windowing
  const [displayLimit, setDisplayLimit] = useState(48);
  const [seedingStress, setSeedingStress] = useState(false);

  // Quick Add Item Modal & Prompt state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addModalInitialData, setAddModalInitialData] = useState({});
  const [notFoundPrompt, setNotFoundPrompt] = useState('');

  // Udhar Repayment state
  const [showSettleModal, setShowSettleModal] = useState(false);
  const [settleAmount, setSettleAmount] = useState('');
  const [settling, setSettling] = useState(false);
  const [settleUpiLink, setSettleUpiLink] = useState(null);

  const searchRef = useRef(null);
  const receiptRef = useRef(null);

  /* ------------------------------ data ------------------------------ */
  const loadProducts = useCallback(async () => {
    try {
      setLoadError('');
      const res = await api.get('/products?limit=1000');
      const list = Array.isArray(res?.data) ? res.data : [];
      setProducts(list);
      cacheCatalog(list);
    } catch (err) {
      const cached = getCachedCatalog();
      if (cached && cached.length > 0) {
        setProducts(cached);
        notify(`⚡ Offline Mode: Using ${cached.length} cached items`);
      } else {
        setLoadError(err.message || 'Could not reach inventory server');
      }
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  const byBarcode = useMemo(() => new Map(products.filter((p) => p && p.barcode).map((p) => [p.barcode, p])), [products]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) =>
        p?.name?.toLowerCase().includes(q) ||
        p?.category?.toLowerCase().includes(q) ||
        (p?.barcode && String(p.barcode).startsWith(q))
    );
  }, [products, query]);

  // Windowed visible slice for silky smooth 60fps rendering even with 1000+ items
  const visibleFiltered = useMemo(() => filtered.slice(0, displayLimit), [filtered, displayLimit]);

  useEffect(() => {
    setDisplayLimit(48);
  }, [query]);

  /* ------------------------------ cart ------------------------------ */
  const add = useCallback(
    (product, qty = 1) => {
      const res = addItem(product, qty);
      if (!res.ok) notify(res.reason, 'error');
      else if (res.capped) notify(`Only ${num(res.added)} more of ${product.name} in stock`, 'error');
      return res;
    },
    [addItem, notify]
  );

  const openAddModal = (customQuery = '') => {
    const term = (customQuery || query).trim();
    const isNumericBarcode = /^\d{6,14}$/.test(term);
    setAddModalInitialData({
      name: isNumericBarcode ? '' : term,
      barcode: isNumericBarcode ? term : '',
    });
    setIsAddModalOpen(true);
  };

  const handleProductAdded = (newProduct) => {
    setProducts((prev) => [newProduct, ...prev.filter((p) => p._id !== newProduct._id)]);
    setNotFoundPrompt('');
    setQuery('');
    notify(`Added "${newProduct.name}" to inventory!`);
    // Automatically add to bill cart for rapid checkout
    add(newProduct, 1);
  };

  /* ---------------------- hardware barcode scanner ------------------ */
  const handleHardwareScan = useCallback(
    async (code) => {
      const term = String(code).trim();
      if (!term) return;

      // 1. Instant local memory lookup (<5ms)
      const local = byBarcode.get(term);
      if (local) {
        add(local);
        playScanBeep();
        notify(`⚡ Scanned: ${local.name}`);
        setQuery('');
        setNotFoundPrompt('');
        return;
      }

      // 2. Lookup in server or offline catalog
      try {
        const res = await api.get(`/products/search?q=${encodeURIComponent(term)}`);
        const results = Array.isArray(res?.data) ? res.data : [];
        if (res.matchType === 'barcode' || results.length === 1) {
          const match = products.find((p) => p._id === results[0]._id) || results[0];
          add(match);
          playScanBeep();
          notify(`⚡ Scanned: ${match.name}`);
          setQuery('');
          setNotFoundPrompt('');
        } else if (results.length === 0) {
          playErrorBeep();
          notify(`Barcode "${term}" not in inventory`, 'error');
          setNotFoundPrompt(term);
        } else {
          notify(`${results.length} items match — tap to select`);
        }
      } catch {
        // Offline fallback lookup
        const cached = getCachedCatalog();
        const match = cached.find((p) => p.barcode === term);
        if (match) {
          add(match);
          playScanBeep();
          notify(`⚡ Scanned (Offline): ${match.name}`);
          setQuery('');
          setNotFoundPrompt('');
        } else {
          playErrorBeep();
          notify(`Barcode "${term}" not found`, 'error');
          setNotFoundPrompt(term);
        }
      }
    },
    [byBarcode, products, add, notify]
  );

  useBarcodeScanner({
    onScan: handleHardwareScan,
    enabled: !isAddModalOpen && !showSettleModal,
  });

  const onSearchKey = async (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const q = query.trim();
    if (!q) return;

    const local = byBarcode.get(q);
    if (local) {
      add(local);
      playScanBeep();
      setQuery('');
      setNotFoundPrompt('');
      return;
    }

    try {
      const res = await api.get(`/products/search?q=${encodeURIComponent(q)}`);
      const results = Array.isArray(res?.data) ? res.data : [];
      if (res.matchType === 'barcode' || results.length === 1) {
        const match = products.find((p) => p._id === results[0]._id) || results[0];
        add(match);
        playScanBeep();
        setQuery('');
        setNotFoundPrompt('');
      } else if (results.length === 0) {
        playErrorBeep();
        notify(`No item found for “${q}”`, 'error');
        setNotFoundPrompt(q);
      } else {
        notify(`${results.length} items match — tap the one you want`);
      }
    } catch (err) {
      const cached = getCachedCatalog();
      const match = cached.find((p) => p.barcode === q || p.name?.toLowerCase().includes(q.toLowerCase()));
      if (match) {
        add(match);
        playScanBeep();
        setQuery('');
        setNotFoundPrompt('');
      } else {
        playErrorBeep();
        notify(err.message || 'Search request failed', 'error');
      }
    }
  };

  /* ---------------------------- udhar lookup ------------------------- */
  useEffect(() => {
    if (mode !== 'Udhar' || phone.length !== 10) {
      setCust({ status: 'idle', data: null, error: '' });
      return undefined;
    }
    let cancelled = false;
    setCust({ status: 'loading', data: null, error: '' });
    const t = setTimeout(async () => {
      try {
        const res = await api.get(`/customers/by-phone/${phone}`);
        if (cancelled) return;
        setCust({ status: 'found', data: res.data, error: '' });
        setCustomerName(res.data.name || '');
      } catch (err) {
        if (cancelled) return;
        if (err.status === 404) setCust({ status: 'new', data: null, error: '' });
        else setCust({ status: 'error', data: null, error: err.message || 'Error looking up customer' });
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [mode, phone]);

  const available = cust.data ? Math.max(0, (cust.data.maxCreditLimit || 0) - (cust.data.totalUdhar || 0)) : null;
  const creditBlock = useMemo(() => {
    if (mode !== 'Udhar' || !cust.data) return '';
    if ((cust.data.trustScore ?? 5) < 3) return 'This customer is restricted for credit. Take Cash or UPI.';
    if (grandTotal > available) return `Bill is ${inr(grandTotal)} but only ${inr(available)} credit is available.`;
    return '';
  }, [mode, cust.data, grandTotal, available]);

  /* ----------------------------- printing ---------------------------- */
  const handlePrint = useReactToPrint({
    contentRef: receiptRef,
    documentTitle: lastSale?.billNumber || 'Receipt',
    pageStyle: `@page { size: ${paper} auto; margin: 0; } html, body { margin: 0 !important; padding: 0 !important; }`,
    onPrintError: (_location, error) => {
      notify(`Printer error: ${error?.message || 'Could not trigger print dialog'}`, 'error');
    },
  });

  useEffect(() => {
    if (pendingPrint && lastSale) {
      setPendingPrint(false);
      try {
        handlePrint();
      } catch (err) {
        notify('Printing could not be initiated automatically. Use Reprint button.', 'error');
      }
    }
  }, [pendingPrint, lastSale, handlePrint, notify]);

  const choosePaper = (p) => {
    setPaper(p);
    safeSetStorage('vyapar.paper', p);
  };

  /* ------------------------------- pay ------------------------------- */
  const handlePay = useCallback(async () => {
    if (submitting) return;
    if (!items.length) return notify('Cart is empty — add items first', 'error');
    if (mode === 'Udhar') {
      if (!/^\d{10}$/.test(phone)) return notify('Enter the customer’s 10-digit mobile number for Udhar', 'error');
      if (cust.status === 'loading') return notify('Checking customer…', 'error');
      if (creditBlock) return notify(creditBlock, 'error');
      if (cust.status === 'new' && !customerName.trim()) return notify('Enter the new customer’s name', 'error');
    }

    setSubmitting(true);
    try {
      const payload = {
        items: items.map((i) => ({ productId: i.productId, quantity: i.qty })),
        discount,
        paymentMode: mode,
      };
      if (mode === 'Udhar') {
        payload.customer = { phone, ...(customerName.trim() ? { name: customerName.trim() } : {}) };
        payload.udharDueDate = new Date(Date.now() + dueDays * 86_400_000).toISOString();
      }

      try {
        const res = await api.post('/sales/create-bill', payload);
        setLastSale(res.data.sale);
        setPendingPrint(true);
        playCashChime();
        clear();
        setPhone('');
        setCustomerName('');
        setMode('Cash');
        notify(`${res.data.sale.billNumber} saved · ${inr(res.data.sale.grandTotal)}`);
        loadProducts();
      } catch (apiErr) {
        // Offline Fallback: If network is offline or server unreachable, generate offline bill
        if (apiErr.status === 0 || apiErr.isOffline || !navigator.onLine) {
          const offlineBill = saveOfflineBill({
            ...payload,
            items: items.map((i) => ({
              product: i.productId,
              name: i.name,
              quantity: i.qty,
              unitPrice: i.price,
              total: i.qty * i.price,
            })),
            subTotal,
            grandTotal,
          });
          setLastSale(offlineBill);
          setPendingPrint(true);
          playCashChime();
          clear();
          setPhone('');
          setCustomerName('');
          setMode('Cash');
          notify(`⚡ Offline bill ${offlineBill.billNumber} created & printing! Queued for auto-sync.`);
        } else {
          throw apiErr;
        }
      }
    } catch (err) {
      notify(err.message, 'error');
      if (err.status === 409) loadProducts(); // stock changed elsewhere
    } finally {
      setSubmitting(false);
      searchRef.current?.focus();
    }
  }, [submitting, items, mode, phone, cust.status, creditBlock, customerName, discount, dueDays, subTotal, grandTotal, clear, notify, loadProducts]);

  /* ------------------------- settle repayment ------------------------ */
  const openSettleModal = async () => {
    if (!cust.data) return;
    setSettleAmount(String(cust.data.totalUdhar));
    setShowSettleModal(true);
    try {
      const res = await api.get(`/customers/${cust.data._id}/upi-link`);
      setSettleUpiLink(res.data.upiLink);
    } catch {
      setSettleUpiLink(null);
    }
  };

  const handleSettleRepayment = async (e) => {
    e.preventDefault();
    const amt = Number(settleAmount);
    if (!amt || amt <= 0) {
      notify('Enter a valid payment amount', 'error');
      return;
    }
    setSettling(true);
    try {
      const res = await api.post(`/customers/${cust.data._id}/settle`, { amount: amt });
      notify(`Recorded payment of ${inr(res.data.applied)} for ${cust.data.name}! Balance: ${inr(res.data.data.totalUdhar)}`);
      setCust((prev) => ({ ...prev, data: res.data.data }));
      setShowSettleModal(false);
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setSettling(false);
    }
  };

  /* ---------------------------- shortcuts ---------------------------- */
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'F2') {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      } else if (e.key === 'F4') {
        e.preventDefault();
        handlePay();
      } else if (e.key === 'F6') {
        e.preventDefault();
        setShowVoice((v) => !v);
      } else if (e.key === 'Escape') {
        if (isAddModalOpen) {
          setIsAddModalOpen(false);
        } else if (showSettleModal) {
          setShowSettleModal(false);
        } else if (items.length) {
          e.preventDefault();
          clear();
          notify('Cart cleared');
        } else if (query) setQuery('');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handlePay, items.length, clear, notify, query, showSettleModal, isAddModalOpen]);

  /* ------------------------------ render ----------------------------- */
  return (
    <div className="flex h-full flex-col">
      {/* Top bar: scanner / search / quick add */}
      <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-sage-200 bg-white px-4 py-3">
        <div className="relative min-w-[220px] flex-1">
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (notFoundPrompt && !e.target.value.trim()) setNotFoundPrompt('');
            }}
            onKeyDown={onSearchKey}
            autoFocus
            autoComplete="off"
            inputMode="search"
            placeholder="Scan barcode or type item name, then press Enter"
            aria-label="Search items or scan barcode"
            className="w-full rounded-xl border-2 border-leaf/40 bg-white px-4 py-3 pr-24 text-lg font-medium placeholder:text-sage-500 focus:border-leaf focus:outline-none"
          />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
            <span className="kbd">F2</span>
          </span>
        </div>

        {/* Quick Add Product Button */}
        <button
          type="button"
          onClick={() => openAddModal()}
          className="btn-leaf flex items-center gap-1.5 shadow-xs"
          title="Quickly register a new product into inventory"
        >
          <span className="text-base font-bold leading-none">+</span> Add Item
        </button>

        <button
          type="button"
          onClick={() => setShowVoice((v) => !v)}
          aria-pressed={showVoice}
          className={showVoice ? 'btn-leaf' : 'btn-ghost'}
        >
          🎤 Voice bill <span className="kbd">F6</span>
        </button>

        <div className="inline-flex overflow-hidden rounded-lg border border-sage-300" role="group" aria-label="Receipt paper width">
          {['80mm', '58mm'].map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => choosePaper(p)}
              aria-pressed={paper === p}
              className={`px-3 py-2 text-sm font-semibold ${paper === p ? 'bg-leaf text-white' : 'bg-white hover:bg-sage-100'}`}
            >
              {p}
            </button>
          ))}
        </div>

        {/* Barcode scanner readiness indicator */}
        <div className="hidden xl:flex items-center gap-1.5 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-800 border border-emerald-200">
          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>Scanner Ready</span>
        </div>

        {/* Admin Quick Stress Test Generator Button */}
        {isAdmin && (
          <button
            type="button"
            disabled={seedingStress}
            onClick={async () => {
              setSeedingStress(true);
              notify('Generating 600 realistic retail products for stress test...');
              try {
                const res = await api.post('/products/seed-stress-test', { count: 600 });
                notify(res.message || 'Stress test products added!');
                loadProducts();
              } catch (e) {
                notify(e.message, 'error');
              } finally {
                setSeedingStress(false);
              }
            }}
            className="hidden lg:flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs font-bold text-amber-900 hover:bg-amber-100 transition disabled:opacity-50"
            title="Seed 600+ items to test POS search and scroll performance"
          >
            <span>⚡</span>
            <span>{seedingStress ? 'Seeding...' : 'Seed 600 Items'}</span>
          </button>
        )}
      </div>

      {/* Immediate "Item not found" Quick-Add Prompt Banner */}
      {notFoundPrompt && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-haldi/50 bg-haldi-light px-4 py-2.5 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-base">⚠️</span>
            <span className="font-medium text-ink">
              Item not found for “<span className="font-bold">{notFoundPrompt}</span>”.
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => openAddModal(notFoundPrompt)}
              className="btn-leaf py-1 text-xs font-bold shadow-xs"
            >
              + Add this item to inventory
            </button>
            <button
              type="button"
              onClick={() => setNotFoundPrompt('')}
              className="rounded px-2 py-1 text-xs font-bold text-sage-500 hover:text-ink"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_420px]">
        {/* Left: items grid */}
        <section className="min-h-0 overflow-y-auto p-4" aria-label="Items">
          {showVoice && (
            <div className="mb-4">
              <ErrorBoundary name="VoicePOS" onReset={() => setShowVoice(false)}>
                <VoicePOS products={products} onClose={() => setShowVoice(false)} />
              </ErrorBoundary>
            </div>
          )}

          {loading && <p className="p-6 text-sage-500">Loading items…</p>}
          {loadError && (
            <div role="alert" className="rounded-xl border border-chilli/30 bg-chilli-light p-4">
              <p className="font-semibold text-chilli-dark">Could not load items</p>
              <p className="text-sm">{loadError}</p>
              <button type="button" onClick={loadProducts} className="btn-ghost mt-2">
                Try again
              </button>
            </div>
          )}

          {!loading && !loadError && filtered.length === 0 && (
            <div className="rounded-xl border border-dashed border-sage-300 bg-white p-8 text-center">
              <p className="text-base font-bold text-ink">
                {products.length ? `Nothing matches “${query}”.` : 'No products in inventory yet.'}
              </p>
              <p className="mt-1 text-sm text-sage-500">
                {query
                  ? 'Quickly register this item into inventory to sell it now.'
                  : 'Add your first product to start billing customers.'}
              </p>
              <button
                type="button"
                onClick={() => openAddModal(query)}
                className="btn-leaf mt-3 text-sm font-bold shadow-xs"
              >
                + Add {query ? `"${query}"` : 'New Item'} to Inventory
              </button>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
            {visibleFiltered.map((p) => {
              const out = (p.stockQuantity || 0) <= 0;
              const low = !out && (p.stockQuantity || 0) <= (p.lowStockThreshold || 10);
              return (
                <button
                  key={p._id}
                  type="button"
                  disabled={out}
                  onClick={() => {
                    add(p);
                    searchRef.current?.focus();
                  }}
                  className="flex flex-col rounded-xl border border-sage-200 bg-white p-3 text-left transition hover:border-leaf hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span className="line-clamp-2 min-h-[2.5rem] text-sm font-semibold leading-tight">{p.name}</span>
                  <span className="mt-2 flex items-end justify-between">
                    <span className="text-lg font-bold text-leaf">
                      {inr(p.sellingPrice)}
                      <span className="text-xs font-medium text-sage-500">/{p.unit}</span>
                    </span>
                    <span
                      className={`rounded px-1.5 py-0.5 text-xs font-semibold ${
                        out ? 'bg-chilli-light text-chilli-dark' : low ? 'bg-haldi-light text-[#7A5600]' : 'bg-sage-100 text-sage-500'
                      }`}
                    >
                      {out ? 'Out' : `${num(p.stockQuantity)} left`}
                    </span>
                  </span>
                  <span className="mt-2 rounded-md bg-leaf-light py-1 text-center text-xs font-bold text-leaf">+ Add</span>
                </button>
              );
            })}
          </div>

          {/* Stress test volume pagination / Load more */}
          {filtered.length > displayLimit && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-sage-200 bg-white p-3 text-xs text-sage-600">
              <span>
                Showing <b>{visibleFiltered.length}</b> of <b>{filtered.length}</b> products in inventory.
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setDisplayLimit((prev) => prev + 48)}
                  className="rounded-lg border border-sage-300 bg-sage-50 px-3 py-1.5 font-bold text-ink hover:bg-sage-100"
                >
                  Load 48 More
                </button>
                <button
                  type="button"
                  onClick={() => setDisplayLimit(filtered.length)}
                  className="rounded-lg bg-leaf px-3 py-1.5 font-bold text-white hover:bg-leaf/90"
                >
                  Show All ({filtered.length})
                </button>
              </div>
            </div>
          )}
        </section>

        {/* Right: cart */}
        <aside className="flex min-h-0 flex-col border-t border-sage-200 bg-white lg:border-l lg:border-t-0" aria-label="Cart">
          <div className="flex items-center justify-between border-b border-sage-200 px-4 py-2.5">
            <h2 className="text-base font-bold">
              Cart <span className="text-sage-500">({items.length})</span>
            </h2>
            <button
              type="button"
              className="text-sm font-semibold text-chilli hover:underline disabled:opacity-40"
              disabled={!items.length}
              onClick={() => {
                clear();
                notify('Cart cleared');
              }}
            >
              Clear <span className="kbd">Esc</span>
            </button>
          </div>

          <div className="min-h-[140px] flex-1 overflow-y-auto">
            {!items.length ? (
              <p className="p-6 text-center text-sm text-sage-500">Scan a barcode, tap an item, or use voice to start a bill.</p>
            ) : (
              <ul className="divide-y divide-sage-100">
                {items.map((i) => (
                  <li key={i.productId} className="px-4 py-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-sm font-semibold leading-tight">{i.name}</span>
                      <button
                        type="button"
                        onClick={() => removeItem(i.productId)}
                        aria-label={`Remove ${i.name}`}
                        className="rounded px-1.5 text-lg leading-none text-sage-500 hover:bg-chilli-light hover:text-chilli"
                      >
                        ×
                      </button>
                    </div>
                    <div className="mt-1.5 flex items-center justify-between">
                      <div className="flex items-center gap-1" role="group" aria-label={`Quantity of ${i.name}`}>
                        <button
                          type="button"
                          className="h-8 w-8 rounded-md border border-sage-300 text-lg font-bold hover:bg-sage-100"
                          onClick={() => setQty(i.productId, i.qty - 1)}
                          aria-label="Decrease"
                        >
                          −
                        </button>
                        <input
                          type="number"
                          min="0"
                          step={['kg', 'litre'].includes(i.unit) ? '0.25' : '1'}
                          value={i.qty}
                          onChange={(e) => setQty(i.productId, e.target.value)}
                          onFocus={(e) => e.target.select()}
                          className="h-8 w-16 rounded-md border border-sage-300 text-center text-sm font-semibold focus:border-leaf focus:outline-none"
                          aria-label={`${i.name} quantity`}
                        />
                        <button
                          type="button"
                          className="h-8 w-8 rounded-md border border-sage-300 text-lg font-bold hover:bg-sage-100"
                          onClick={() => setQty(i.productId, i.qty + 1)}
                          aria-label="Increase"
                        >
                          +
                        </button>
                        <span className="ml-1 text-xs text-sage-500">{i.unit}</span>
                      </div>
                      <div className="text-right text-sm">
                        <div className="text-xs text-sage-500">{inr(i.unitPrice)} each</div>
                        <div className="font-bold">{inr(i.qty * i.unitPrice)}</div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="space-y-3 border-t border-sage-200 p-4">
            <div className="flex items-center justify-between text-sm">
              <span>Subtotal</span>
              <span className="font-semibold">{inr(subTotal)}</span>
            </div>
            <label className="flex items-center justify-between gap-3 text-sm">
              <span>Discount (₹)</span>
              <input
                type="number"
                min="0"
                value={discount || ''}
                placeholder="0"
                onChange={(e) => setDiscount(e.target.value)}
                className="field w-28 text-right"
                aria-label="Discount in rupees"
              />
            </label>
            <div className="flex items-center justify-between border-t border-sage-200 pt-3">
              <span className="text-base font-bold">Grand total</span>
              <span className="text-3xl font-bold text-leaf">{inr(grandTotal)}</span>
            </div>

            <div role="radiogroup" aria-label="Payment mode" className="grid grid-cols-3 gap-2">
              {MODES.map((m) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={mode === m}
                  onClick={() => setMode(m)}
                  className={`rounded-lg border-2 py-2 text-sm font-bold transition ${
                    mode === m ? 'border-leaf bg-leaf text-white' : 'border-sage-300 bg-white hover:bg-sage-100'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>

            {mode === 'UPI' && (
              <div className="space-y-2 rounded-xl border border-leaf/30 bg-leaf-light/20 p-3 text-center transition-all animate-in fade-in">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold uppercase tracking-wider text-leaf">Scan & Pay via UPI</span>
                  <span className="rounded-full bg-leaf/10 px-2 py-0.5 text-[10px] font-bold text-leaf">GPay · PhonePe · Paytm</span>
                </div>
                <div className="flex flex-col items-center justify-center pt-1">
                  <img
                    src={SHOP.qrImage || '/merchant-qr.jpg'}
                    alt="Raj Kumar UPI QR"
                    className="h-44 w-auto rounded-xl border border-sage-200 bg-white p-1.5 shadow-sm object-contain"
                  />
                  <div className="mt-2 text-xs font-bold text-ink">
                    UPI ID: <span className="font-mono text-leaf">{SHOP.upiId}</span>
                  </div>
                  <div className="text-[11px] font-medium text-sage-600">
                    Payee: <b>{SHOP.name}</b>
                  </div>
                </div>
              </div>
            )}

            {mode === 'Udhar' && (
              <div className="space-y-2 rounded-lg border border-sage-200 bg-sage-50 p-3">
                <input
                  className="field"
                  inputMode="numeric"
                  maxLength={10}
                  value={phone}
                  autoFocus
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  placeholder="Customer mobile number"
                  aria-label="Customer mobile number"
                />
                {cust.status === 'loading' && <p className="text-xs text-sage-500">Checking customer…</p>}
                {cust.status === 'error' && <p role="alert" className="text-xs text-chilli-dark">{cust.error}</p>}
                {cust.status === 'new' && (
                  <>
                    <p className="text-xs text-sage-500">New customer — they’ll be added with a ₹2,000 credit limit.</p>
                    <input
                      className="field"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="Customer name"
                      aria-label="Customer name"
                    />
                  </>
                )}
                {cust.data && (
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-bold">{cust.data.name}</span>
                      <TrustBadge score={cust.data.trustScore} />
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <p className="text-sage-500">
                        Owes <span className="font-semibold text-chilli-dark">{inr(cust.data.totalUdhar)}</span> · Credit left{' '}
                        <span className="font-semibold text-ink">{inr(available)}</span>
                      </p>
                      {cust.data.totalUdhar > 0 && (
                        <button
                          type="button"
                          onClick={openSettleModal}
                          className="rounded bg-leaf/10 px-2 py-0.5 font-bold text-leaf hover:bg-leaf/20"
                        >
                          Collect Repayment
                        </button>
                      )}
                    </div>
                  </div>
                )}
                {creditBlock && (
                  <p role="alert" className="rounded-md bg-chilli-light px-2 py-1.5 text-xs font-semibold text-chilli-dark">
                    {creditBlock}
                  </p>
                )}
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-sage-500">Pay within</span>
                  {DUE_OPTIONS.map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setDueDays(d)}
                      aria-pressed={dueDays === d}
                      className={`rounded-full border px-2.5 py-1 font-semibold ${
                        dueDays === d ? 'border-leaf bg-leaf-light text-leaf' : 'border-sage-300 bg-white'
                      }`}
                    >
                      {d} days
                    </button>
                  ))}
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={handlePay}
              disabled={submitting || !items.length || (mode === 'Udhar' && Boolean(creditBlock))}
              className="btn-primary w-full py-3 text-base"
            >
              {submitting ? 'Saving bill…' : `Pay & Print ${inr(grandTotal)}`} <span className="kbd">F4</span>
            </button>

            {lastSale && (
              <button type="button" onClick={handlePrint} className="btn-ghost w-full text-xs">
                Reprint {lastSale.billNumber}
              </button>
            )}
          </div>
        </aside>
      </div>

      {/* Settle Repayment Modal */}
      {showSettleModal && cust.data && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl">
            <h3 className="text-lg font-bold text-ink">Record Udhar Repayment</h3>
            <p className="mt-1 text-sm text-sage-500">
              Customer: <span className="font-semibold text-ink">{cust.data.name}</span> ({cust.data.phone})
            </p>
            <p className="text-sm text-sage-500">
              Total Outstanding: <span className="font-bold text-chilli-dark">{inr(cust.data.totalUdhar)}</span>
            </p>

            {settleUpiLink && (
              <div className="my-3 flex flex-col items-center justify-center rounded-lg bg-sage-50 p-3">
                <img
                  src={SHOP.qrImage || '/merchant-qr.jpg'}
                  alt="Merchant UPI QR"
                  className="h-36 w-auto rounded-lg border border-sage-200 bg-white p-1 object-contain mb-1.5 shadow-xs"
                />
                <div className="text-xs font-bold text-ink">
                  UPI ID: <span className="font-mono text-leaf">{SHOP.upiId}</span>
                </div>
                <span className="mt-0.5 text-[11px] text-sage-500">Customer can scan to pay via UPI (GPay/PhonePe/Paytm)</span>
              </div>
            )}

            <form onSubmit={handleSettleRepayment} className="mt-3 space-y-3">
              <label className="block text-sm">
                <span className="text-xs font-semibold text-sage-500">Amount Received (₹)</span>
                <input
                  type="number"
                  min="1"
                  max={cust.data.totalUdhar}
                  step="0.01"
                  value={settleAmount}
                  onChange={(e) => setSettleAmount(e.target.value)}
                  className="field mt-1 w-full text-lg font-bold"
                  autoFocus
                  required
                />
              </label>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowSettleModal(false)}
                  className="btn-ghost flex-1"
                  disabled={settling}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-leaf flex-1 font-bold"
                  disabled={settling || !Number(settleAmount)}
                >
                  {settling ? 'Recording…' : 'Confirm'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reusable Add Product Modal (Quick POS Integration) */}
      <AddProductModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSuccess={handleProductAdded}
        initialData={addModalInitialData}
      />

      {/* Off-screen receipt */}
      <div style={{ position: 'fixed', top: -9999, left: -9999, opacity: 0, pointerEvents: 'none' }} aria-hidden="true">
        <ThermalReceipt ref={receiptRef} sale={lastSale} shop={SHOP} width={paper} />
      </div>

      {toast && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed bottom-4 left-1/2 z-50 max-w-[90vw] -translate-x-1/2 rounded-lg px-4 py-2.5 text-sm font-semibold shadow-lg ${
            toast.kind === 'error' ? 'bg-chilli text-white' : 'bg-ink text-white'
          }`}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}

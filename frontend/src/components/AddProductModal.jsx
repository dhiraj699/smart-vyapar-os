import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api.js';
import { inr } from '../lib/format.js';

const UNITS = ['packet', 'kg', 'gm', 'litre', 'ml', 'pcs'];
const COMMON_CATEGORIES = [
  'General',
  'Grocery',
  'Spices',
  'Dairy',
  'Snacks',
  'Noodles',
  'Oil',
  'Atta',
  'Rice',
  'Dal',
  'Tea',
  'Sugar',
  'Biscuits',
  'Cleaning',
  'Toiletries',
];

export default function AddProductModal({ isOpen, onClose, onSuccess, initialData = {} }) {
  const [name, setName] = useState('');
  const [barcode, setBarcode] = useState('');
  const [category, setCategory] = useState('General');
  const [customCategory, setCustomCategory] = useState('');
  const [unit, setUnit] = useState('packet');
  const [wholesalePrice, setWholesalePrice] = useState('');
  const [sellingPrice, setSellingPrice] = useState('');
  const [stockQuantity, setStockQuantity] = useState('10');
  const [lowStockThreshold, setLowStockThreshold] = useState('10');
  const [selectedDealerId, setSelectedDealerId] = useState('');
  const [dealerScheme, setDealerScheme] = useState('');

  const [dealers, setDealers] = useState([]);
  const [loadingDealers, setLoadingDealers] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Pre-fill initial data when opened
  useEffect(() => {
    if (isOpen) {
      setError('');
      setName(initialData.name || '');
      setBarcode(initialData.barcode || '');
      setCategory(initialData.category || 'General');
      setCustomCategory('');
      setUnit(initialData.unit || 'packet');
      setWholesalePrice(initialData.wholesalePrice ? String(initialData.wholesalePrice) : '');
      setSellingPrice(initialData.sellingPrice ? String(initialData.sellingPrice) : '');
      setStockQuantity(initialData.stockQuantity !== undefined ? String(initialData.stockQuantity) : '10');
      setLowStockThreshold(initialData.lowStockThreshold !== undefined ? String(initialData.lowStockThreshold) : '10');
      setSelectedDealerId('');
      setDealerScheme('');
    }
  }, [isOpen, initialData]);

  // Load dealers list for supplier dropdown
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    const fetchDealers = async () => {
      setLoadingDealers(true);
      try {
        const res = await api.get('/dealers');
        if (!cancelled) {
          setDealers(Array.isArray(res?.data) ? res.data : []);
        }
      } catch {
        // Fallback: dealers remain empty
      } finally {
        if (!cancelled) setLoadingDealers(false);
      }
    };
    fetchDealers();
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  // Handle ESC key to close
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  // Live Margin Calculations
  const wp = Number(wholesalePrice) || 0;
  const sp = Number(sellingPrice) || 0;
  const profitPerUnit = Math.round((sp - wp) * 100) / 100;
  const marginPercent = sp > 0 ? Math.round(((sp - wp) / sp) * 1000) / 10 : 0;
  const markupPercent = wp > 0 ? Math.round(((sp - wp) / wp) * 1000) / 10 : 0;

  const marginStatus = useMemo(() => {
    if (!sp && !wp) return null;
    if (sp < wp) {
      return {
        tone: 'danger',
        label: 'Loss Warning',
        text: `Selling price is ₹${Math.abs(profitPerUnit).toFixed(2)} below wholesale cost!`,
        cls: 'bg-chilli-light border-chilli text-chilli-dark',
      };
    }
    if (sp === wp) {
      return {
        tone: 'neutral',
        label: 'Zero Margin',
        text: 'Selling at break-even (0% margin).',
        cls: 'bg-sage-100 border-sage-300 text-ink',
      };
    }
    if (marginPercent >= 20) {
      return {
        tone: 'healthy',
        label: 'Healthy Margin',
        text: `Profit: ₹${profitPerUnit.toFixed(2)} / unit (${marginPercent}% margin, ${markupPercent}% markup)`,
        cls: 'bg-leaf-light border-leaf/40 text-leaf',
      };
    }
    return {
      tone: 'moderate',
      label: 'Moderate Margin',
      text: `Profit: ₹${profitPerUnit.toFixed(2)} / unit (${marginPercent}% margin)`,
      cls: 'bg-haldi-light border-haldi/60 text-[#7A5600]',
    };
  }, [sp, wp, profitPerUnit, marginPercent, markupPercent]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Item name is required');
      return;
    }

    if (wp < 0 || isNaN(wp)) {
      setError('Valid wholesale price is required');
      return;
    }
    if (sp < 0 || isNaN(sp)) {
      setError('Valid selling price is required');
      return;
    }

    const effectiveCategory = category === '__custom__' ? customCategory.trim() || 'General' : category;

    const payload = {
      name: trimmedName,
      barcode: barcode.trim() || undefined,
      category: effectiveCategory,
      unit,
      wholesalePrice: wp,
      sellingPrice: sp,
      stockQuantity: Math.max(0, Number(stockQuantity) || 0),
      lowStockThreshold: Math.max(0, Number(lowStockThreshold) || 10),
      dealers: [],
    };

    if (selectedDealerId) {
      payload.dealers.push({
        dealerId: selectedDealerId,
        quotedPrice: wp,
        schemeText: dealerScheme.trim() || undefined,
      });
    }

    setSubmitting(true);
    setError('');

    try {
      const res = await api.post('/products', payload);
      onSuccess?.(res.data);
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to create product');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-product-title"
    >
      <div className="flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-sage-200 bg-sage-50 px-6 py-4">
          <div>
            <h2 id="add-product-title" className="text-xl font-bold text-ink">
              + Add New Inventory Product
            </h2>
            <p className="text-xs text-sage-500">Quick product registration with live margin calculation</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-sage-500 hover:bg-sage-200 hover:text-ink focus:outline-none"
            aria-label="Close dialog"
          >
            ✕
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
            {error && (
              <div role="alert" className="rounded-xl border border-chilli/40 bg-chilli-light p-3 text-sm text-chilli-dark">
                {error}
              </div>
            )}

            {/* 1. Name & Barcode */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-bold text-ink">
                  Product / Item Name <span className="text-chilli">*</span>
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Fortune Sunflower Oil 1L"
                  className="field mt-1 font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-ink">
                  Barcode / SKU (Optional)
                </label>
                <input
                  type="text"
                  value={barcode}
                  onChange={(e) => setBarcode(e.target.value.trim())}
                  placeholder="Scan or type barcode"
                  className="field mt-1 font-mono text-sm"
                />
              </div>
            </div>

            {/* 2. Category & Unit */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-bold text-ink">Category</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="field mt-1 capitalize font-medium"
                >
                  {COMMON_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat.toLowerCase()}>
                      {cat}
                    </option>
                  ))}
                  <option value="__custom__">+ Other / Custom Category</option>
                </select>

                {category === '__custom__' && (
                  <input
                    type="text"
                    required
                    value={customCategory}
                    onChange={(e) => setCustomCategory(e.target.value)}
                    placeholder="Enter custom category name"
                    className="field mt-2 font-medium"
                  />
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-ink">Selling Unit</label>
                <select
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  className="field mt-1 font-medium"
                >
                  {UNITS.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* 3. Pricing & Margin */}
            <div className="rounded-xl border border-sage-200 bg-sage-50/70 p-3.5 space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-bold text-ink">
                    Wholesale Price / Kharid (₹) <span className="text-chilli">*</span>
                  </label>
                  <div className="relative mt-1">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-sage-500">
                      ₹
                    </span>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      required
                      value={wholesalePrice}
                      onChange={(e) => setWholesalePrice(e.target.value)}
                      placeholder="0.00"
                      className="field pl-7 font-bold text-ink"
                    />
                  </div>
                  <span className="text-[11px] text-sage-500">Cost per {unit} from dealer</span>
                </div>

                <div>
                  <label className="block text-xs font-bold text-ink">
                    Selling Price / Retail (₹) <span className="text-chilli">*</span>
                  </label>
                  <div className="relative mt-1">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-leaf">
                      ₹
                    </span>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      required
                      value={sellingPrice}
                      onChange={(e) => setSellingPrice(e.target.value)}
                      placeholder="0.00"
                      className="field pl-7 font-bold text-leaf"
                    />
                  </div>
                  <span className="text-[11px] text-sage-500">Price customer pays</span>
                </div>
              </div>

              {/* Dynamic Live Margin Badge */}
              {marginStatus && (
                <div
                  className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs font-semibold ${marginStatus.cls}`}
                  aria-live="polite"
                >
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold uppercase tracking-wider">{marginStatus.label}:</span>
                    <span>{marginStatus.text}</span>
                  </div>
                  {sp > 0 && profitPerUnit > 0 && (
                    <span className="rounded bg-white/70 px-2 py-0.5 text-xs font-black shadow-xs">
                      {marginPercent}% MARGIN
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* 4. Stock & Threshold */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-bold text-ink">
                  Opening Stock Quantity ({unit}) <span className="text-chilli">*</span>
                </label>
                <input
                  type="number"
                  min="0"
                  step={['kg', 'litre'].includes(unit) ? '0.25' : '1'}
                  required
                  value={stockQuantity}
                  onChange={(e) => setStockQuantity(e.target.value)}
                  className="field mt-1 font-semibold"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-ink">
                  Low Stock Threshold Alert
                </label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  required
                  value={lowStockThreshold}
                  onChange={(e) => setLowStockThreshold(e.target.value)}
                  className="field mt-1 font-semibold"
                />
                <span className="text-[11px] text-sage-500">Alerts you when stock falls to this</span>
              </div>
            </div>

            {/* 5. Supplier / Dealer (Optional) */}
            <div className="border-t border-sage-200 pt-3">
              <label className="block text-xs font-bold text-ink">
                Preferred Supplier / Dealer (Optional)
              </label>
              <div className="mt-1 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <select
                  value={selectedDealerId}
                  onChange={(e) => setSelectedDealerId(e.target.value)}
                  disabled={loadingDealers}
                  className="field text-sm"
                >
                  <option value="">None / Local Mandi Purchase</option>
                  {dealers.map((d) => (
                    <option key={d._id} value={d._id}>
                      {d.name} {d.agencyName ? `(${d.agencyName})` : ''}
                    </option>
                  ))}
                </select>

                {selectedDealerId && (
                  <input
                    type="text"
                    value={dealerScheme}
                    onChange={(e) => setDealerScheme(e.target.value)}
                    placeholder="Scheme text (e.g. 10+1 or Buy 12 get 1)"
                    className="field text-sm"
                  />
                )}
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex shrink-0 items-center justify-end gap-3 border-t border-sage-200 bg-sage-50 px-6 py-3.5">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="btn-ghost"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !name.trim()}
              className="btn-leaf px-5 py-2"
            >
              {submitting ? 'Saving Item…' : 'Save & Add Product'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

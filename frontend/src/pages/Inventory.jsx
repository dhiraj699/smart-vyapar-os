import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api.js';
import { inr, num } from '../lib/format.js';
import AddProductModal from '../components/AddProductModal.jsx';
import { useAuth } from '../context/AuthContext.jsx';

export default function Inventory() {
  const { isAdmin, isStaff, user } = useAuth();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [stockFilter, setStockFilter] = useState('ALL'); // 'ALL', 'LOW', 'OUT'

  // Modals state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [restockItem, setRestockItem] = useState(null);
  const [restockQty, setRestockQty] = useState('');
  const [restockPrice, setRestockPrice] = useState('');
  const [isRestocking, setIsRestocking] = useState(false);

  const [editItem, setEditItem] = useState(null);
  const [editForm, setEditForm] = useState({
    name: '',
    barcode: '',
    category: '',
    wholesalePrice: '',
    sellingPrice: '',
    stockQuantity: '',
    lowStockThreshold: '',
  });
  const [isUpdating, setIsUpdating] = useState(false);

  const [deleteItem, setDeleteItem] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [toast, setToast] = useState('');

  const notify = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3500);
  };

  const loadProducts = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/products?limit=1000');
      setProducts(Array.isArray(res?.data) ? res.data : []);
    } catch (err) {
      setError(err.message || 'Failed to fetch inventory products');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  // Unique categories list
  const categories = useMemo(() => {
    const set = new Set();
    products.forEach((p) => {
      if (p.category) set.add(p.category.toLowerCase());
    });
    return Array.from(set).sort();
  }, [products]);

  // Inventory stats
  const stats = useMemo(() => {
    let totalStockValue = 0;
    let potentialSalesValue = 0;
    let lowStockCount = 0;
    let outOfStockCount = 0;

    products.forEach((p) => {
      const qty = Number(p.stockQuantity) || 0;
      const wp = Number(p.wholesalePrice) || 0;
      const sp = Number(p.sellingPrice) || 0;
      const threshold = Number(p.lowStockThreshold) || 10;

      totalStockValue += qty * wp;
      potentialSalesValue += qty * sp;
      if (qty <= 0) outOfStockCount += 1;
      else if (qty <= threshold) lowStockCount += 1;
    });

    return {
      totalItems: products.length,
      totalStockValue: Math.round(totalStockValue),
      potentialSalesValue: Math.round(potentialSalesValue),
      estimatedProfit: Math.round(potentialSalesValue - totalStockValue),
      lowStockCount,
      outOfStockCount,
    };
  }, [products]);

  // Filtered products list
  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      const matchesSearch =
        !q ||
        p.name?.toLowerCase().includes(q) ||
        p.category?.toLowerCase().includes(q) ||
        (p.barcode && String(p.barcode).toLowerCase().includes(q));

      const matchesCat = categoryFilter === 'ALL' || p.category?.toLowerCase() === categoryFilter;

      let matchesStock = true;
      const stock = Number(p.stockQuantity) || 0;
      const threshold = Number(p.lowStockThreshold) || 10;
      if (stockFilter === 'LOW') {
        matchesStock = stock > 0 && stock <= threshold;
      } else if (stockFilter === 'OUT') {
        matchesStock = stock <= 0;
      }

      return matchesSearch && matchesCat && matchesStock;
    });
  }, [products, search, categoryFilter, stockFilter]);

  // Handle Add Product Callback
  const handleProductAdded = (newProduct) => {
    setProducts((prev) => [newProduct, ...prev.filter((p) => p._id !== newProduct._id)]);
    notify(`Product "${newProduct.name}" added to inventory!`);
  };

  // Open Restock Modal
  const openRestock = (product) => {
    setRestockItem(product);
    setRestockQty('10');
    setRestockPrice(String(product.wholesalePrice || ''));
  };

  // Submit Restock
  const handleRestockSubmit = async (e) => {
    e.preventDefault();
    if (!restockItem) return;
    const added = Number(restockQty);
    if (!added || added <= 0) {
      notify('Enter a valid quantity to add');
      return;
    }
    const wp = restockPrice ? Number(restockPrice) : undefined;

    setIsRestocking(true);
    try {
      const res = await api.post(`/products/${restockItem._id}/restock`, {
        addedQuantity: added,
        wholesalePrice: wp,
      });
      setProducts((prev) => prev.map((p) => (p._id === restockItem._id ? res.data : p)));
      notify(`Restocked ${restockItem.name} (+${added} ${restockItem.unit})!`);
      setRestockItem(null);
    } catch (err) {
      notify(err.message || 'Restock failed');
    } finally {
      setIsRestocking(false);
    }
  };

  // Open Edit Modal
  const openEdit = (product) => {
    setEditItem(product);
    setEditForm({
      name: product.name || '',
      barcode: product.barcode || '',
      category: product.category || 'General',
      wholesalePrice: String(product.wholesalePrice ?? ''),
      sellingPrice: String(product.sellingPrice ?? ''),
      stockQuantity: String(product.stockQuantity ?? ''),
      lowStockThreshold: String(product.lowStockThreshold ?? '10'),
    });
  };

  // Submit Edit
  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (!editItem) return;

    setIsUpdating(true);
    try {
      const payload = {
        name: editForm.name.trim(),
        barcode: editForm.barcode.trim() || undefined,
        category: editForm.category.trim(),
        wholesalePrice: Number(editForm.wholesalePrice),
        sellingPrice: Number(editForm.sellingPrice),
        stockQuantity: Math.max(0, Number(editForm.stockQuantity)),
        lowStockThreshold: Math.max(0, Number(editForm.lowStockThreshold)),
      };

      const res = await api.put(`/products/${editItem._id}`, payload);
      setProducts((prev) => prev.map((p) => (p._id === editItem._id ? res.data : p)));
      notify(`Updated "${res.data.name}" successfully!`);
      setEditItem(null);
    } catch (err) {
      notify(err.message || 'Update failed');
    } finally {
      setIsUpdating(false);
    }
  };

  // Submit Delete
  const handleDeleteSubmit = async () => {
    if (!deleteItem) return;
    setIsDeleting(true);
    try {
      await api.delete(`/products/${deleteItem._id}`);
      setProducts((prev) => prev.filter((p) => p._id !== deleteItem._id));
      notify(`Deleted "${deleteItem.name}" from inventory.`);
      setDeleteItem(null);
    } catch (err) {
      notify(err.message || 'Delete failed');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-5 p-4 md:p-6">
      {/* Top Header */}
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink">Inventory Management</h1>
          <p className="text-sm text-sage-500">
            Real-time stock ledger, wholesale/retail rate management, and quick restocking.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={loadProducts}
            className="btn-ghost"
            disabled={loading}
          >
            Refresh
          </button>
          {isAdmin && (
            <button
              type="button"
              onClick={() => setIsAddModalOpen(true)}
              className="btn-leaf flex items-center gap-1.5 shadow-sm"
            >
              <span className="text-lg font-bold leading-none">+</span> Add New Product
            </button>
          )}
        </div>
      </header>

      {/* Staff Notice Banner */}
      {!isAdmin && (
        <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-3 text-xs text-blue-900 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span>🛡️</span>
            <span>
              <b>Staff Mode Active:</b> You can search products and restock quantities. Wholesale purchase prices and store profit margins are hidden.
            </span>
          </div>
        </div>
      )}

      {/* KPI Cards Banner */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-sage-200 bg-white p-4 shadow-xs">
          <span className="text-xs font-semibold uppercase tracking-wider text-sage-500">Total Products</span>
          <div className="mt-1 text-2xl font-black text-ink">{stats.totalItems}</div>
          <span className="text-xs text-sage-500">Registered inventory SKUs</span>
        </div>

        <div className="rounded-xl border border-leaf/30 bg-leaf-light p-4 shadow-xs">
          <span className="text-xs font-semibold uppercase tracking-wider text-leaf">Stock Value (Cost)</span>
          <div className="mt-1 text-2xl font-black text-leaf">
            {isAdmin ? inr(stats.totalStockValue) : '🔒 Owner Only'}
          </div>
          <span className="text-xs text-ink/70">{isAdmin ? 'At wholesale buying price' : 'Confidential to Dukandaar'}</span>
        </div>

        <div className="rounded-xl border border-haldi/40 bg-haldi-light p-4 shadow-xs">
          <span className="text-xs font-semibold uppercase tracking-wider text-[#7A5600]">Estimated Profit</span>
          <div className="mt-1 text-2xl font-black text-[#7A5600]">
            {isAdmin ? inr(stats.estimatedProfit) : '🔒 Owner Only'}
          </div>
          <span className="text-xs text-ink/70">{isAdmin ? 'On complete inventory turnover' : 'Confidential to Dukandaar'}</span>
        </div>

        <div className="rounded-xl border border-chilli/30 bg-chilli-light p-4 shadow-xs">
          <span className="text-xs font-semibold uppercase tracking-wider text-chilli-dark">Low / Out of Stock</span>
          <div className="mt-1 text-2xl font-black text-chilli-dark">
            {stats.lowStockCount} <span className="text-sm font-bold text-chilli">low</span> · {stats.outOfStockCount} <span className="text-sm font-bold text-chilli-dark">out</span>
          </div>
          <span className="text-xs text-chilli-dark">Items needing re-order</span>
        </div>
      </div>

      {/* Filter / Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-sage-200 bg-white p-3.5 shadow-xs">
        <div className="relative min-w-[240px] flex-1">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by product name, barcode or category…"
            className="field pl-9"
          />
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-sage-500">
            🔍
          </span>
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-sage-500 hover:text-ink"
            >
              Clear
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Category Filter */}
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="field w-auto py-2 text-xs font-semibold capitalize"
          >
            <option value="ALL">All Categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          {/* Stock Level Filter */}
          <select
            value={stockFilter}
            onChange={(e) => setStockFilter(e.target.value)}
            className="field w-auto py-2 text-xs font-semibold"
          >
            <option value="ALL">All Stock Levels</option>
            <option value="LOW">Low Stock (≤ Threshold)</option>
            <option value="OUT">Out of Stock (0)</option>
          </select>
        </div>
      </div>

      {error && (
        <div role="alert" className="rounded-xl border border-chilli/30 bg-chilli-light p-4 text-sm text-chilli-dark">
          {error}
        </div>
      )}

      {/* Products Table */}
      <div className="overflow-hidden rounded-xl border border-sage-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[850px] text-left text-sm">
            <thead className="border-b border-sage-200 bg-sage-100 text-xs text-sage-500">
              <tr>
                <th className="px-4 py-3 font-semibold">Product Name</th>
                <th className="px-3 py-3 font-semibold">Barcode / SKU</th>
                <th className="px-3 py-3 font-semibold">Category</th>
                <th className="px-3 py-3 text-right font-semibold">Stock</th>
                <th className="px-3 py-3 text-right font-semibold">Wholesale (Cost)</th>
                <th className="px-3 py-3 text-right font-semibold">Retail (Selling)</th>
                <th className="px-3 py-3 text-right font-semibold">Margin</th>
                <th className="px-4 py-3 text-center font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sage-100">
              {loading && (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-sage-500">
                    Loading inventory products…
                  </td>
                </tr>
              )}

              {!loading && filteredProducts.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-8 text-center">
                    <p className="font-bold text-ink">No matching products found</p>
                    <p className="mt-1 text-sm text-sage-500">
                      {search ? `Try adjusting your search query “${search}”` : 'Add your first product above.'}
                    </p>
                    <button
                      type="button"
                      onClick={() => setIsAddModalOpen(true)}
                      className="btn-leaf mt-3 text-xs"
                    >
                      + Add New Product
                    </button>
                  </td>
                </tr>
              )}

              {!loading &&
                filteredProducts.map((p) => {
                  const stock = Number(p.stockQuantity) || 0;
                  const threshold = Number(p.lowStockThreshold) || 10;
                  const isOut = stock <= 0;
                  const isLow = !isOut && stock <= threshold;

                  const wp = Number(p.wholesalePrice) || 0;
                  const sp = Number(p.sellingPrice) || 0;
                  const profit = sp - wp;
                  const marginPct = sp > 0 ? Math.round(((sp - wp) / sp) * 100) : 0;

                  return (
                    <tr key={p._id} className="hover:bg-sage-50/60 transition-colors">
                      {/* Name */}
                      <td className="px-4 py-3">
                        <div className="font-bold text-ink">{p.name}</div>
                        <div className="text-[11px] text-sage-500">Sold per {p.unit}</div>
                      </td>

                      {/* Barcode */}
                      <td className="px-3 py-3 font-mono text-xs text-ink/80">
                        {p.barcode ? (
                          <span className="rounded bg-sage-100 px-1.5 py-0.5">{p.barcode}</span>
                        ) : (
                          <span className="text-sage-300">—</span>
                        )}
                      </td>

                      {/* Category */}
                      <td className="px-3 py-3 capitalize">
                        <span className="rounded-full bg-sage-100 px-2 py-0.5 text-xs font-medium text-ink">
                          {p.category || 'General'}
                        </span>
                      </td>

                      {/* Stock with Alert Badge */}
                      <td className="px-3 py-3 text-right">
                        <div className="font-bold">
                          {num(stock)} <span className="text-xs font-normal text-sage-500">{p.unit}</span>
                        </div>
                        <span
                          className={`inline-block rounded px-1.5 py-0.2 text-[10px] font-bold ${
                            isOut
                              ? 'bg-chilli-light text-chilli-dark'
                              : isLow
                              ? 'bg-haldi-light text-[#7A5600]'
                              : 'text-leaf'
                          }`}
                        >
                          {isOut ? 'Out of stock' : isLow ? `Low (≤${threshold})` : 'In stock'}
                        </span>
                      </td>

                      {/* Wholesale Cost */}
                      <td className="px-3 py-3 text-right font-medium text-sage-500">
                        {isAdmin ? inr(wp) : <span className="text-xs text-sage-400">🔒 Confidential</span>}
                      </td>

                      {/* Selling Price */}
                      <td className="px-3 py-3 text-right font-bold text-ink">
                        {inr(sp)}
                      </td>

                      {/* Margin % and per-unit Profit */}
                      <td className="px-3 py-3 text-right">
                        {isAdmin ? (
                          <>
                            <div
                              className={`font-bold ${
                                profit < 0 ? 'text-chilli' : marginPct >= 20 ? 'text-leaf' : 'text-[#7A5600]'
                              }`}
                            >
                              {marginPct}%
                            </div>
                            <div className="text-[11px] text-sage-500">+{inr(profit)}/u</div>
                          </>
                        ) : (
                          <span className="text-xs text-sage-400">🔒 Hidden</span>
                        )}
                      </td>

                      {/* Action buttons */}
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => openRestock(p)}
                            className="rounded-md border border-leaf/40 bg-leaf-light px-2.5 py-1 text-xs font-bold text-leaf hover:bg-leaf hover:text-white transition-colors"
                            title="Restock incoming inventory units"
                          >
                            + Restock
                          </button>
                          {isAdmin && (
                            <>
                              <button
                                type="button"
                                onClick={() => openEdit(p)}
                                className="rounded-md border border-sage-300 bg-white px-2 py-1 text-xs font-semibold text-ink hover:bg-sage-100"
                                title="Edit product rates or details"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeleteItem(p)}
                                className="rounded-md px-1.5 py-1 text-xs font-semibold text-chilli hover:bg-chilli-light"
                                title="Delete item"
                              >
                                ✕
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Restock Modal */}
      {restockItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-ink">⚡ Quick Restock Product</h3>
            <p className="mt-1 text-sm font-semibold text-leaf">{restockItem.name}</p>
            <p className="text-xs text-sage-500">
              Current stock: <b>{num(restockItem.stockQuantity)} {restockItem.unit}</b>
            </p>

            <form onSubmit={handleRestockSubmit} className="mt-4 space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-ink">
                  Incoming Quantity to Add ({restockItem.unit}) <span className="text-chilli">*</span>
                </label>
                <input
                  type="number"
                  min="0.001"
                  step="any"
                  required
                  autoFocus
                  value={restockQty}
                  onChange={(e) => setRestockQty(e.target.value)}
                  className="field mt-1 text-lg font-bold"
                  placeholder="e.g. 20"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-ink">
                  Updated Wholesale Price / Kharid (₹)
                </label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={restockPrice}
                  onChange={(e) => setRestockPrice(e.target.value)}
                  className="field mt-1 font-semibold"
                  placeholder={String(restockItem.wholesalePrice)}
                />
                <span className="text-[11px] text-sage-500">Leave unchanged if bought at same wholesale rate</span>
              </div>

              <div className="rounded-lg bg-sage-50 p-3 text-xs text-ink/80">
                New Stock Total will be:{' '}
                <b>
                  {num((Number(restockItem.stockQuantity) || 0) + (Number(restockQty) || 0))}{' '}
                  {restockItem.unit}
                </b>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setRestockItem(null)}
                  disabled={isRestocking}
                  className="btn-ghost flex-1"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isRestocking || !Number(restockQty)}
                  className="btn-leaf flex-1 font-bold"
                >
                  {isRestocking ? 'Restocking…' : 'Confirm & Add Stock'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Product Modal */}
      {editItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-ink">Edit Product Rates & Info</h3>
            <p className="text-xs text-sage-500">Update item pricing, stock count, and thresholds</p>

            <form onSubmit={handleEditSubmit} className="mt-4 space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-ink">Product Name</label>
                <input
                  type="text"
                  required
                  value={editForm.name}
                  onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                  className="field mt-1 font-semibold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-ink">Barcode / SKU</label>
                  <input
                    type="text"
                    value={editForm.barcode}
                    onChange={(e) => setEditForm((f) => ({ ...f, barcode: e.target.value }))}
                    className="field mt-1 font-mono text-xs"
                    placeholder="None"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-ink">Category</label>
                  <input
                    type="text"
                    value={editForm.category}
                    onChange={(e) => setEditForm((f) => ({ ...f, category: e.target.value }))}
                    className="field mt-1 capitalize font-medium"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 rounded-xl border border-sage-200 bg-sage-50 p-3">
                <div>
                  <label className="block text-xs font-bold text-ink">Wholesale Rate (₹)</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    required
                    value={editForm.wholesalePrice}
                    onChange={(e) => setEditForm((f) => ({ ...f, wholesalePrice: e.target.value }))}
                    className="field mt-1 font-bold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-ink">Retail Selling Rate (₹)</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    required
                    value={editForm.sellingPrice}
                    onChange={(e) => setEditForm((f) => ({ ...f, sellingPrice: e.target.value }))}
                    className="field mt-1 font-bold text-leaf"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-ink">Current Stock Count</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    required
                    value={editForm.stockQuantity}
                    onChange={(e) => setEditForm((f) => ({ ...f, stockQuantity: e.target.value }))}
                    className="field mt-1 font-semibold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-ink">Low Stock Threshold</label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    required
                    value={editForm.lowStockThreshold}
                    onChange={(e) => setEditForm((f) => ({ ...f, lowStockThreshold: e.target.value }))}
                    className="field mt-1 font-semibold"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditItem(null)}
                  disabled={isUpdating}
                  className="btn-ghost flex-1"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUpdating || !editForm.name.trim()}
                  className="btn-leaf flex-1 font-bold"
                >
                  {isUpdating ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-chilli-dark">Delete Product?</h3>
            <p className="mt-2 text-sm text-ink">
              Are you sure you want to remove <span className="font-bold">"{deleteItem.name}"</span> from inventory?
            </p>
            <p className="mt-1 text-xs text-sage-500">
              This action cannot be undone. Past bill receipts will preserve their line snapshots.
            </p>

            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => setDeleteItem(null)}
                disabled={isDeleting}
                className="btn-ghost flex-1"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteSubmit}
                disabled={isDeleting}
                className="btn bg-chilli text-white hover:bg-chilli-dark flex-1 font-bold"
              >
                {isDeleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reusable Add Product Modal */}
      <AddProductModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSuccess={handleProductAdded}
      />

      {/* Toast notification */}
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

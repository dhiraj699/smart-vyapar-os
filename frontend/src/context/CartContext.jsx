import { createContext, useCallback, useContext, useMemo, useReducer, useRef } from 'react';

const CartContext = createContext(null);

const round2 = (n) => {
  const val = Number(n);
  if (!Number.isFinite(val)) return 0;
  return Math.round((val + Number.EPSILON) * 100) / 100;
};

const round3 = (n) => {
  const val = Number(n);
  if (!Number.isFinite(val)) return 0;
  return Math.round((val + Number.EPSILON) * 1000) / 1000;
};

const initial = { items: [], discount: 0 };

function reducer(state, action) {
  switch (action.type) {
    case 'UPSERT': {
      const { product, qty } = action;
      const exists = state.items.some((i) => i.productId === product._id);
      const items = exists
        ? state.items.map((i) => (i.productId === product._id ? { ...i, qty, stock: product.stockQuantity } : i))
        : [
            ...state.items,
            {
              productId: product._id,
              name: product.name,
              unit: product.unit,
              unitPrice: product.sellingPrice,
              qty,
              stock: product.stockQuantity,
            },
          ];
      return { ...state, items };
    }
    case 'SET_QTY':
      return { ...state, items: state.items.map((i) => (i.productId === action.productId ? { ...i, qty: action.qty } : i)) };
    case 'REMOVE':
      return { ...state, items: state.items.filter((i) => i.productId !== action.productId) };
    case 'SET_DISCOUNT':
      return { ...state, discount: action.discount };
    case 'CLEAR':
      return initial;
    default:
      return state;
  }
}

export function CartProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initial);
  const stateRef = useRef(state);
  stateRef.current = state;

  /** Adds qty of a product. Never exceeds stock. Returns { ok, added, capped } so callers can show feedback. */
  const addItem = useCallback((product, qty = 1) => {
    if (!product || !product._id) return { ok: false, added: 0, capped: false, reason: 'Invalid product' };
    const numQty = Math.max(0, Number(qty) || 0);
    if (numQty <= 0) return { ok: false, added: 0, capped: false, reason: 'Quantity must be positive' };

    const current = stateRef.current.items.find((i) => i.productId === product._id);
    const have = current?.qty || 0;
    const room = round3((product.stockQuantity || 0) - have);
    if (room <= 0) return { ok: false, added: 0, capped: true, reason: `${product.name}: no more stock` };

    const whole = ['pcs', 'packet'].includes(product.unit);
    let added = round3(Math.min(numQty, room));
    if (whole) {
      added = Math.max(1, Math.round(added));
    }

    dispatch({ type: 'UPSERT', product, qty: round3(have + added) });
    return { ok: true, added, capped: added < numQty };
  }, []);

  const setQty = useCallback((productId, qty) => {
    const item = stateRef.current.items.find((i) => i.productId === productId);
    if (!item) return;

    const raw = Math.max(0, Math.min(Number(qty) || 0, item.stock || 0));
    const whole = ['pcs', 'packet'].includes(item.unit);
    const clean = whole ? Math.round(raw) : raw;

    if (clean <= 0) dispatch({ type: 'REMOVE', productId });
    else dispatch({ type: 'SET_QTY', productId, qty: round3(clean) });
  }, []);

  const removeItem = useCallback((productId) => dispatch({ type: 'REMOVE', productId }), []);
  const clear = useCallback(() => dispatch({ type: 'CLEAR' }), []);
  const setDiscount = useCallback((value) => {
    const val = Number(value);
    dispatch({ type: 'SET_DISCOUNT', discount: Math.max(0, Number.isFinite(val) ? val : 0) });
  }, []);

  const value = useMemo(() => {
    const subTotal = round2(state.items.reduce((s, i) => s + (Number(i.qty) || 0) * (Number(i.unitPrice) || 0), 0));
    const discount = Math.min(Number(state.discount) || 0, subTotal);
    return {
      items: state.items,
      discount,
      subTotal,
      grandTotal: round2(subTotal - discount),
      itemCount: state.items.length,
      addItem,
      setQty,
      removeItem,
      setDiscount,
      clear,
    };
  }, [state, addItem, setQty, removeItem, setDiscount, clear]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used inside <CartProvider>');
  return ctx;
}

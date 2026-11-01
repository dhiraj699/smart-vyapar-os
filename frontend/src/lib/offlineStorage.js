import { useState, useEffect, useCallback } from 'react';

const CATALOG_KEY = 'vyapar.offline_catalog';
const BILLS_KEY = 'vyapar.offline_sales';

/** Saves loaded catalog into local storage for offline billing */
export function cacheCatalog(products) {
  if (!Array.isArray(products) || products.length === 0) return;
  try {
    localStorage.setItem(CATALOG_KEY, JSON.stringify(products));
  } catch (err) {
    console.warn('Could not cache offline catalog', err);
  }
}

/** Retrieves cached catalog when offline */
export function getCachedCatalog() {
  try {
    const raw = localStorage.getItem(CATALOG_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/** Retrieves pending offline bills that need to be synced to backend */
export function getPendingOfflineBills() {
  try {
    const raw = localStorage.getItem(BILLS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Saves a bill locally when offline so customer doesn't have to wait.
 * Generates an offline reference number like OFF-20261101-0012
 */
export function saveOfflineBill(billData) {
  try {
    const existing = getPendingOfflineBills();
    const dateStamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const randSeq = Math.floor(1000 + Math.random() * 9000);
    const offlineBillNumber = `OFF-${dateStamp}-${randSeq}`;

    const offlineRecord = {
      ...billData,
      billNumber: offlineBillNumber,
      offlineRef: offlineBillNumber,
      createdAt: new Date().toISOString(),
      isOfflineBill: true,
    };

    existing.push(offlineRecord);
    localStorage.setItem(BILLS_KEY, JSON.stringify(existing));

    // Also deduct locally from cached catalog so cashier can't over-bill locally
    try {
      const catalog = getCachedCatalog();
      if (catalog.length) {
        billData.items.forEach((item) => {
          const catItem = catalog.find((c) => c._id === item.productId);
          if (catItem) {
            catItem.stockQuantity = Math.max(0, (catItem.stockQuantity || 0) - item.quantity);
          }
        });
        localStorage.setItem(CATALOG_KEY, JSON.stringify(catalog));
      }
    } catch {
      /* ignore local catalog deduction errors */
    }

    return offlineRecord;
  } catch (err) {
    console.error('Failed to save offline bill', err);
    throw new Error('Could not save bill locally in offline storage');
  }
}

/** Removes a bill after successful sync with backend */
export function removeOfflineBill(offlineRef) {
  try {
    const existing = getPendingOfflineBills();
    const filtered = existing.filter((b) => b.offlineRef !== offlineRef && b.billNumber !== offlineRef);
    localStorage.setItem(BILLS_KEY, JSON.stringify(filtered));
  } catch {
    /* ignore */
  }
}

/**
 * Syncs all pending offline bills to the backend
 */
export async function syncOfflineBills(api) {
  const pending = getPendingOfflineBills();
  if (pending.length === 0) return { synced: 0, failed: 0 };

  let synced = 0;
  let failed = 0;

  for (const bill of pending) {
    try {
      const payload = {
        items: bill.items,
        discount: bill.discount || 0,
        paymentMode: bill.paymentMode,
        customer: bill.customer,
        udharDueDate: bill.udharDueDate,
        splitBreakdown: bill.splitBreakdown,
        offlineRef: bill.offlineRef || bill.billNumber,
      };

      await api.post('/sales/create-bill', payload);
      removeOfflineBill(bill.offlineRef || bill.billNumber);
      synced++;
    } catch (err) {
      console.warn(`Failed to sync offline bill ${bill.offlineRef}:`, err.message);
      failed++;
    }
  }

  return { synced, failed, remaining: getPendingOfflineBills().length };
}

/** React hook to track online/offline status and pending sync count */
export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState(() => (typeof navigator !== 'undefined' ? navigator.onLine : true));
  const [pendingCount, setPendingCount] = useState(() => getPendingOfflineBills().length);

  const refreshPendingCount = useCallback(() => {
    setPendingCount(getPendingOfflineBills().length);
  }, []);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      refreshPendingCount();
    };

    const handleOffline = () => {
      setIsOnline(false);
      refreshPendingCount();
    };

    const handleStorage = (e) => {
      if (e.key === BILLS_KEY) refreshPendingCount();
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('storage', handleStorage);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('storage', handleStorage);
    };
  }, [refreshPendingCount]);

  return { isOnline, pendingCount, refreshPendingCount };
}

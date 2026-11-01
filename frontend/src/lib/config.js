const env = import.meta.env;

const rawUrl = (env.VITE_API_URL || '').trim().replace(/\/+$/, '');
export const API_BASE = !rawUrl
  ? '/api'
  : rawUrl.endsWith('/api')
    ? rawUrl
    : `${rawUrl}/api`;

export const SHOP = {
  name: env.VITE_SHOP_NAME || 'Smart Vyapar Store',
  address: env.VITE_SHOP_ADDRESS || 'Store Address, City, State',
  phone: env.VITE_SHOP_PHONE || '9876543210',
  gstin: env.VITE_SHOP_GSTIN || '',
  upiId: env.VITE_SHOP_UPI_ID || 'merchant@upi',
};

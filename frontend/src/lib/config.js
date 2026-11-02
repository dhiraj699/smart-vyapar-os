const env = import.meta.env;

const rawUrl = (env.VITE_API_URL || '').trim().replace(/\/+$/, '');
export const API_BASE = !rawUrl
  ? '/api'
  : rawUrl.endsWith('/api')
    ? rawUrl
    : `${rawUrl}/api`;

export const SHOP = {
  name: env.VITE_SHOP_NAME || 'Raj Kumar (Ansh Electric)',
  address: env.VITE_SHOP_ADDRESS || 'Chitarpur, Ramgarh, Jharkhand 825101',
  phone: env.VITE_SHOP_PHONE || '9608033907',
  gstin: env.VITE_SHOP_GSTIN || '20ABCDE1234F1Z5',
  upiId: env.VITE_SHOP_UPI_ID || 'kraj7860-1@okaxis',
  qrImage: '/merchant-qr.jpg',
};

import { SHOP } from './config.js';

/**
 * Standard NPCI UPI Payment Deep-Link Constructor
 * Format: upi://pay?pa={MERCHANT_VPA}&pn={SHOP_NAME}&am={BILL_TOTAL}&cu=INR&tn=Invoice_{BILL_NUMBER}
 */
export const buildUpiLink = ({ pa, pn, am, tn }) => {
  const merchantVpa = (pa || SHOP.upiId || 'merchant@upi').trim();
  const merchantName = (pn || SHOP.name || 'Merchant').trim();
  const billTotal = Number(am || 0).toFixed(2);
  const rawNote = String(tn || 'Bill').trim();
  const note = rawNote.startsWith('Invoice_') ? rawNote : `Invoice_${rawNote}`;

  const params = [
    `pa=${encodeURIComponent(merchantVpa)}`,
    `pn=${encodeURIComponent(merchantName)}`,
    `am=${billTotal}`,
    'cu=INR',
    `tn=${encodeURIComponent(note)}`,
  ];

  return `upi://pay?${params.join('&')}`;
};

export default buildUpiLink;

import { forwardRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { SHOP } from '../lib/config.js';
import { buildUpiLink } from '../lib/upi.js';

/* Scoped, self-contained thermal print CSS for 58mm and 80mm printers.
   @page margin:0 plus fixed mm widths ensures zero clipped edges on thermal paper roll. */
const CSS = `
  .vr { 
    box-sizing: border-box; 
    margin: 0 auto; 
    padding: 2mm 2.5mm 4mm; 
    background: #fff; 
    color: #000;
    font-family: 'Courier New', Courier, ui-monospace, monospace; 
    font-size: 11px; 
    line-height: 1.3;
    -webkit-print-color-adjust: exact; 
    print-color-adjust: exact; 
  }
  .vr * { box-sizing: border-box; }
  .vr.w80 { width: 78mm; max-width: 80mm; }
  .vr.w58 { width: 54mm; max-width: 58mm; font-size: 9.5px; padding: 1.5mm 1.5mm 3mm; line-height: 1.25; }
  .vr .c { text-align: center; } 
  .vr .r { text-align: right; } 
  .vr .b { font-weight: 700; }
  .vr .shop { font-size: 14px; font-weight: 700; letter-spacing: .02em; text-transform: uppercase; }
  .vr.w58 .shop { font-size: 12px; }
  .vr hr { border: 0; border-top: 1px dashed #000; margin: 3px 0; }
  .vr table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  .vr th { text-align: left; font-weight: 700; border-bottom: 1px dashed #000; padding: 2px 0; font-size: 10px; }
  .vr.w58 th { font-size: 9px; }
  .vr td { padding: 2px 0; vertical-align: top; word-break: break-word; }
  .vr .num { text-align: right; white-space: nowrap; }
  .vr .row { display: flex; justify-content: space-between; gap: 4px; }
  .vr .grand { 
    font-size: 13.5px; 
    font-weight: 800; 
    border-top: 1.5px solid #000; 
    border-bottom: 1.5px solid #000; 
    padding: 3px 0; 
    margin: 4px 0; 
  }
  .vr.w58 .grand { font-size: 12px; }
  .vr .qr { display: flex; justify-content: center; margin: 5px 0 2px; }
  .vr .qr-box { 
    padding: 4px; 
    background: #fff; 
    display: inline-block;
    border: 1px solid #000;
  }
  .vr .qr svg { display: block; shape-rendering: crispEdges; }
  .vr .cut-line { margin-top: 6px; font-size: 8px; color: #333; text-align: center; letter-spacing: 2px; }
  
  @media print {
    @page { size: auto; margin: 0 !important; }
    html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
    .vr { margin: 0 !important; padding-top: 2mm !important; page-break-inside: avoid; }
  }
`;

const money = (n) => Number(n || 0).toFixed(2);
const qtyText = (n) => String(Number(Number(n || 0).toFixed(3)));

const ThermalReceipt = forwardRef(function ThermalReceipt({ sale, shop = SHOP, width = '80mm', isTestSlip = false }, ref) {
  if (!sale) return null;
  const narrow = width === '58mm';
  const showQr = sale.paymentMode !== 'Cash' || isTestSlip;
  const payAmount = sale.paymentMode === 'Split' ? sale.splitBreakdown?.upi || sale.grandTotal : sale.grandTotal;
  const upiLink = buildUpiLink({
    pa: shop?.upiId || 'shop@upi',
    pn: shop?.name || 'Smart Vyapar',
    am: payAmount,
    tn: sale.billNumber || 'BILL',
  });
  const when = new Date(sale.createdAt || Date.now()).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  const items = Array.isArray(sale.items) ? sale.items : [];

  return (
    <div ref={ref} className={`vr ${narrow ? 'w58' : 'w80'}`}>
      <style>{CSS}</style>

      {isTestSlip && (
        <div className="c b" style={{ border: '1px solid #000', padding: '2px', marginBottom: '4px' }}>
          *** PRINTER TEST SLIP ({width}) ***
        </div>
      )}

      <div className="c">
        <div className="shop">{shop?.name || 'Smart Vyapar Store'}</div>
        {shop?.address && <div>{shop.address}</div>}
        {shop?.phone && <div>Mob: {shop.phone}</div>}
        {shop?.gstin && <div>GSTIN: {shop.gstin}</div>}
      </div>
      <hr />

      <div className="row">
        <span>
          Bill: <b>{sale.billNumber || (sale.offlineRef ? `${sale.offlineRef} (OFFLINE)` : 'DRAFT')}</b>
        </span>
      </div>
      <div className="row">
        <span>Date: {when}</span>
      </div>
      {sale.cashier?.name && (
        <div className="row">
          <span>Cashier: {sale.cashier.name}</span>
        </div>
      )}
      {sale.customer?.phone && (
        <div>
          Cust: {sale.customer.name || 'Customer'} ({sale.customer.phone})
        </div>
      )}
      <hr />

      <table>
        <colgroup>
          <col />
          <col style={{ width: narrow ? '11mm' : '13mm' }} />
          {!narrow && <col style={{ width: '15mm' }} />}
          <col style={{ width: narrow ? '14mm' : '17mm' }} />
        </colgroup>
        <thead>
          <tr>
            <th>Item</th>
            <th className="num">Qty</th>
            {!narrow && <th className="num">Rate</th>}
            <th className="num">Amt</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it, i) => (
            <tr key={`${it.product || it.name || 'item'}-${i}`}>
              <td>{it.name || 'Item'}</td>
              <td className="num">{qtyText(it.quantity)}</td>
              {!narrow && <td className="num">{money(it.unitPrice)}</td>}
              <td className="num">{money(it.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <hr />

      <div className="row">
        <span>Subtotal</span>
        <span>Rs {money(sale.subTotal)}</span>
      </div>
      {(Number(sale.discount) || 0) > 0 && (
        <div className="row">
          <span>Discount</span>
          <span>-Rs {money(sale.discount)}</span>
        </div>
      )}
      <div className="row grand">
        <span>TOTAL AMOUNT</span>
        <span>Rs {money(sale.grandTotal)}</span>
      </div>
      <div className="row">
        <span>Payment Mode</span>
        <span className="b">{sale.paymentMode || 'Cash'}</span>
      </div>
      {sale.paymentMode === 'Udhar' && sale.udharDueDate && (
        <div className="row">
          <span>Due Date</span>
          <span>
            {new Date(sale.udharDueDate).toLocaleDateString('en-IN', {
              day: '2-digit',
              month: 'short',
              year: 'numeric',
            })}
          </span>
        </div>
      )}

      {showQr && (
        <>
          <hr />
          <div className="c b" style={{ fontSize: narrow ? '9.5px' : '11px', letterSpacing: '0.02em' }}>
            {sale.paymentMode === 'Udhar' ? 'Scan & Pay Udhar via UPI' : 'Scan & Pay via any UPI App'}
          </div>
          <div className="qr">
            <div className="qr-box">
              <QRCodeSVG
                value={upiLink}
                size={narrow ? 96 : 130}
                level="M"
                includeMargin={false}
              />
            </div>
          </div>
          <div className="c b" style={{ fontSize: narrow ? '8.5px' : '9.5px' }}>
            UPI ID: {shop?.upiId || 'merchant@upi'}
          </div>
          <div className="c" style={{ fontSize: narrow ? '8px' : '9px', color: '#111' }}>
            Payee: {shop?.name || 'STORE OWNER'}
          </div>
          <div className="c" style={{ fontSize: narrow ? '7.5px' : '8.5px', color: '#333' }}>
            (GPay, PhonePe, Paytm, BHIM)
          </div>
        </>
      )}

      <hr />
      <div className="c b">Dhanyavaad! Phir Padhaariye</div>
      <div className="c" style={{ fontSize: '8.5px' }}>Smart Vyapar OS · Micro-Retail</div>
      <div className="cut-line">✂ - - - - - - - - - - - - - ✂</div>
    </div>
  );
});

export default ThermalReceipt;

import { useState, useRef } from 'react';
import { useReactToPrint } from 'react-to-print';
import ThermalReceipt from './ThermalReceipt.jsx';
import { SHOP } from '../lib/config.js';

export default function PrintTestModal({ isOpen, onClose, currentPaper = '80mm', onSavePaper }) {
  const [paper, setPaper] = useState(currentPaper);
  const receiptRef = useRef(null);

  const sampleSale = {
    billNumber: 'TEST-20261101-0001',
    createdAt: new Date().toISOString(),
    customer: { name: 'Ramesh Kumar (Test)', phone: '9876543210' },
    cashier: { name: 'Counter Boy' },
    items: [
      { name: 'Tata Salt Vacuum 1kg', quantity: 1, unitPrice: 28, total: 28 },
      { name: 'Aashirvaad Atta 5kg', quantity: 1, unitPrice: 255, total: 255 },
      { name: 'Philips 9W LED Bulb B22', quantity: 1, unitPrice: 95, total: 95 },
    ],
    subTotal: 378,
    discount: 15,
    grandTotal: 363,
    paymentMode: 'UPI',
  };

  const handlePrint = useReactToPrint({
    contentRef: receiptRef,
    documentTitle: `Thermal-Test-${paper}`,
    pageStyle: `@page { size: ${paper} auto; margin: 0mm !important; } html, body { margin: 0 !important; padding: 0 !important; }`,
  });

  const selectPaper = (p) => {
    setPaper(p);
    onSavePaper?.(p);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative flex max-h-[92vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-2xl ring-1 ring-black/5 dark:bg-slate-900 dark:text-white">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-slate-100 p-4 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <span className="text-xl">🖨️</span>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Thermal Printer Test & Calibration
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Test margins, paper width, and UPI QR code scanability
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="grid flex-1 grid-cols-1 gap-6 overflow-y-auto p-5 md:grid-cols-2">
          {/* Controls & instructions */}
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Select Roll Width
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => selectPaper('58mm')}
                  className={`flex flex-col items-center rounded-xl border p-3 text-center transition ${
                    paper === '58mm'
                      ? 'border-leaf bg-leaf/10 font-bold text-leaf shadow-sm'
                      : 'border-slate-200 hover:border-slate-300 dark:border-slate-700'
                  }`}
                >
                  <span className="text-sm">58mm (2-inch roll)</span>
                  <span className="text-[10px] text-slate-500">Mini / Bluetooth POS</span>
                </button>
                <button
                  type="button"
                  onClick={() => selectPaper('80mm')}
                  className={`flex flex-col items-center rounded-xl border p-3 text-center transition ${
                    paper === '80mm'
                      ? 'border-leaf bg-leaf/10 font-bold text-leaf shadow-sm'
                      : 'border-slate-200 hover:border-slate-300 dark:border-slate-700'
                  }`}
                >
                  <span className="text-sm">80mm (3-inch roll)</span>
                  <span className="text-[10px] text-slate-500">Standard USB Desktop POS</span>
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-xs text-slate-700 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-300">
              <div className="font-bold text-slate-900 dark:text-white mb-1.5">
                Physical Printer Calibration Steps:
              </div>
              <ul className="space-y-1.5 list-disc pl-4">
                <li>
                  Click <b>"Print Test Slip"</b> below to open the printer dialog.
                </li>
                <li>
                  In Chrome/Edge print window, set <b>Margins: None</b> and disable <b>Headers/Footers</b>.
                </li>
                <li>
                  Inspect the physical paper cut: ensure text is not cut off at the left or right edge.
                </li>
                <li>
                  <b>Scan Test:</b> Open <b>Google Pay / PhonePe</b> on your phone and point camera at the printed QR on the paper. It should detect the UPI link instantly!
                </li>
              </ul>
            </div>

            <button
              onClick={handlePrint}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-leaf py-3 text-sm font-bold text-white shadow-md hover:bg-leaf/90 active:scale-[0.98]"
            >
              <span>🖨️</span> Print Test Slip ({paper})
            </button>
          </div>

          {/* Live Preview */}
          <div className="flex flex-col items-center justify-start rounded-xl border border-dashed border-slate-300 bg-slate-100 p-4 dark:border-slate-700 dark:bg-slate-950/40">
            <div className="mb-2 text-xs font-semibold text-slate-500">
              Live Paper Preview ({paper})
            </div>
            <div className="max-h-[380px] overflow-y-auto rounded shadow-lg ring-1 ring-black/10 bg-white">
              <ThermalReceipt
                ref={receiptRef}
                sale={sampleSale}
                shop={SHOP}
                width={paper}
                isTestSlip={true}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

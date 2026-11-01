import { useEffect, useRef } from 'react';
import { playScanBeep } from '../utils/audio.js';

/**
 * Universal Hardware Barcode Scanner Hook.
 * Listens for rapid HID keystrokes (<65ms intervals) followed by Enter.
 * Automatically detects physical USB and Bluetooth barcode scanners anywhere on the page!
 */
export function useBarcodeScanner({ onScan, enabled = true, minLength = 3, maxIntervalMs = 65 }) {
  const bufferRef = useRef([]);
  const lastKeyTimeRef = useRef(0);
  const onScanRef = useRef(onScan);

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e) => {
      const now = Date.now();
      const timeDiff = now - lastKeyTimeRef.current;
      lastKeyTimeRef.current = now;

      // Reset buffer if delay between keystrokes exceeds threshold (manual slow typing)
      if (timeDiff > maxIntervalMs && bufferRef.current.length > 0) {
        bufferRef.current = [];
      }

      // Enter key indicates end of barcode transmission from scanner
      if (e.key === 'Enter') {
        if (bufferRef.current.length >= minLength) {
          const barcode = bufferRef.current.join('').trim();
          bufferRef.current = [];

          if (barcode) {
            e.preventDefault();
            e.stopPropagation();
            playScanBeep();
            onScanRef.current?.(barcode);
            return;
          }
        }
        bufferRef.current = [];
        return;
      }

      // Capture single printable characters (digits, letters, common barcode symbols)
      if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
        bufferRef.current.push(e.key);
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [enabled, minLength, maxIntervalMs]);
}

export default useBarcodeScanner;

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useCart } from '../context/CartContext.jsx';
import { parseVoiceBill, VOICE_EXAMPLES } from '../utils/voiceParser.js';
import { num } from '../lib/format.js';

const ERROR_TEXT = {
  'not-allowed': 'Microphone access is blocked. Allow microphone permission in your browser address bar and try again.',
  'service-not-allowed': 'Speech service is blocked or unavailable in this browser. Use Chrome or Edge, or type the order below.',
  'no-speech': 'I did not hear anything. Tap the mic and speak closer to the device.',
  'audio-capture': 'No microphone hardware found. Plug one in or type the order below.',
  network: 'Speech recognition requires an internet connection. You can type the order below.',
  aborted: '',
};

const getRecognition = () => {
  if (typeof window === 'undefined') return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
};

function WaveIndicator({ active }) {
  return (
    <div className="flex h-10 items-center gap-1" role="status" aria-live="polite" aria-label={active ? 'Listening' : 'Not listening'}>
      {[0, 1, 2, 3, 4, 5, 6].map((i) => (
        <span
          key={i}
          className={`voice-bar block w-1.5 rounded-full ${active ? 'h-10 bg-chilli' : 'h-2 bg-sage-300'}`}
          style={active ? { animationDelay: `${i * 0.11}s` } : { animation: 'none' }}
        />
      ))}
    </div>
  );
}

export default function VoicePOS({ products, onClose }) {
  const { addItem, removeItem } = useCart();
  const Recognition = useMemo(getRecognition, []);
  const recogRef = useRef(null);
  const productsRef = useRef(products);
  productsRef.current = products;

  const isSecure = typeof window !== 'undefined' ? (window.isSecureContext ?? true) : true;

  const [lang, setLang] = useState('hi-IN');
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [heard, setHeard] = useState('');
  const [typed, setTyped] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState(null); // { items:[{...,added,note}], unmatched }

  const processTranscript = useCallback(
    (text) => {
      const clean = (text || '').trim();
      if (!clean) return;
      setHeard(clean);
      const parsed = parseVoiceBill(clean, productsRef.current || []);
      const items = (parsed.items || []).map((it) => {
        const res = addItem(it.product, it.quantity);
        return {
          ...it,
          added: res.added,
          note: res.ok ? (res.capped ? `Only ${num(res.added)} in stock` : '') : res.reason,
        };
      });
      setResult({ items, unmatched: parsed.unmatched || [] });
    },
    [addItem]
  );

  const stop = useCallback(() => {
    try {
      recogRef.current?.stop();
    } catch {
      // Ignore if recognition already finished
    }
  }, []);

  const start = useCallback(() => {
    if (!Recognition) return;
    setError('');
    setInterim('');
    try {
      const r = new Recognition();
      r.lang = lang;
      r.interimResults = true;
      r.continuous = false;
      r.maxAlternatives = 1;

      r.onstart = () => setListening(true);
      r.onresult = (e) => {
        let finalText = '';
        let interimText = '';
        for (let i = e.resultIndex; i < e.results.length; i += 1) {
          const chunk = e.results[i][0].transcript;
          if (e.results[i].isFinal) finalText += chunk;
          else interimText += chunk;
        }
        setInterim(interimText);
        if (finalText) processTranscript(finalText);
      };
      r.onerror = (e) => {
        setError(ERROR_TEXT[e.error] ?? `Voice input error: ${e.error}`);
      };
      r.onend = () => {
        setListening(false);
        setInterim('');
      };

      recogRef.current = r;
      r.start();
    } catch {
      setError('Could not start the microphone. Tap the mic again or type your order below.');
    }
  }, [Recognition, lang, processTranscript]);

  useEffect(() => {
    return () => {
      try {
        recogRef.current?.abort();
      } catch {
        // Safe unmount
      }
    };
  }, []);

  const swap = (entry, alt) => {
    removeItem(entry.product._id);
    addItem(alt, entry.quantity);
    setResult((prev) => ({
      ...prev,
      items: prev.items.map((x) =>
        x === entry ? { ...x, product: alt, alternatives: [entry.product, ...x.alternatives.filter((a) => a._id !== alt._id)] } : x
      ),
    }));
  };

  return (
    <section aria-label="Voice billing" className="rounded-xl border border-sage-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold">Bolkar bill banao</h2>
          <p className="text-sm text-sage-500">Say the items, e.g. “{VOICE_EXAMPLES[0]}”</p>
        </div>
        {onClose && (
          <button type="button" onClick={onClose} className="btn-ghost px-3 py-1" aria-label="Close voice billing">
            Close
          </button>
        )}
      </div>

      {!isSecure && (
        <div className="mt-2 rounded-lg bg-haldi-light p-2.5 text-xs text-[#7A5600]">
          Note: Browser microphone security requires HTTPS or localhost. If accessing over a local IP, please type your order below.
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-3">
        {Recognition ? (
          <button
            type="button"
            onClick={listening ? stop : start}
            aria-pressed={listening}
            className={listening ? 'btn bg-chilli text-white hover:bg-chilli-dark' : 'btn-leaf'}
          >
            <span aria-hidden="true">{listening ? '■' : '🎤'}</span>
            {listening ? 'Stop listening' : 'Start speaking'}
          </button>
        ) : (
          <p className="rounded-lg bg-haldi-light px-3 py-2 text-sm">
            Voice input is not supported in this browser. Use Chrome or Edge, or type the order below.
          </p>
        )}

        <div className="inline-flex overflow-hidden rounded-lg border border-sage-300" role="group" aria-label="Speech language">
          {[
            ['hi-IN', 'हिन्दी'],
            ['en-IN', 'English'],
          ].map(([code, label]) => (
            <button
              key={code}
              type="button"
              disabled={listening}
              onClick={() => setLang(code)}
              aria-pressed={lang === code}
              className={`px-3 py-1.5 text-sm font-semibold disabled:opacity-60 ${
                lang === code ? 'bg-leaf text-white' : 'bg-white hover:bg-sage-100'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <WaveIndicator active={listening} />
      </div>

      <p className="mt-2 min-h-[1.5rem] text-sm" aria-live="polite">
        {listening && !interim && <span className="text-sage-500">Listening… speak now</span>}
        {interim && <span className="italic text-ink/70">{interim}</span>}
      </p>

      {error && (
        <p role="alert" className="mt-1 rounded-lg bg-chilli-light px-3 py-2 text-sm text-chilli-dark">
          {error}
        </p>
      )}

      {/* Typed fallback: also lets staff paste/correct a transcript */}
      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          processTranscript(typed);
          setTyped('');
        }}
      >
        <input
          className="field"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder="Or type: do packet maggi aur ek kilo sugar"
          aria-label="Type the order instead of speaking"
        />
        <button type="submit" className="btn-ghost shrink-0" disabled={!typed.trim()}>
          Add to cart
        </button>
      </form>

      {heard && (
        <p className="mt-3 text-sm text-sage-500">
          Heard: <span className="font-semibold text-ink">“{heard}”</span>
        </p>
      )}

      {result && (
        <div className="mt-2 space-y-2" aria-live="polite">
          {result.items.map((it, i) => (
            <div key={`${it.product?._id || 'item'}-${i}`} className="rounded-lg border border-leaf/30 bg-leaf-light px-3 py-2 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  <span className="font-bold">
                    {num(it.added || 0)} {it.product?.unit}
                  </span>{' '}
                  × {it.product?.name}
                  <span className="ml-2 text-xs text-sage-500">{it.confidence}% match</span>
                </span>
                <span className="text-xs text-leaf">{it.added > 0 ? 'Added to cart' : 'Not added'}</span>
              </div>
              {it.note && <p className="mt-1 text-xs text-chilli-dark">{it.note}</p>}
              {it.alternatives?.length > 0 && it.added > 0 && (
                <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                  <span className="text-sage-500">Did you mean:</span>
                  {it.alternatives.map((alt) => (
                    <button
                      key={alt._id}
                      type="button"
                      onClick={() => swap(it, alt)}
                      className="rounded-full border border-leaf/40 bg-white px-2 py-0.5 font-semibold hover:bg-haldi-light"
                    >
                      {alt.name}
                    </button>
                  ))}
                </p>
              )}
            </div>
          ))}

          {result.unmatched.map((u, i) => (
            <div key={`u-${i}`} className="rounded-lg border border-haldi/50 bg-haldi-light px-3 py-2 text-sm">
              Couldn’t match “<span className="font-semibold">{u.text}</span>” — {u.reason}. Search for it in the item grid.
            </div>
          ))}

          {!result.items.length && !result.unmatched.length && (
            <p className="rounded-lg bg-sage-100 px-3 py-2 text-sm">No items recognised. Try: “{VOICE_EXAMPLES[1]}”.</p>
          )}
        </div>
      )}
    </section>
  );
}

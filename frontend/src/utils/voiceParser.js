/**
 * Voice-to-bill NLP parser for Hindi / Hinglish / Indian-English shopkeeper speech.
 *
 *   parseVoiceBill("Do packet Maggie aur ek packet Tata Namak", products)
 *   -> { items: [{ product, quantity, spokenText, confidence, alternatives }], unmatched: [...] }
 *
 * Pipeline:  normalise -> tokenise -> split into "order segments" -> extract quantity + unit
 *            -> fuzzy (phonetic + edit-distance) product match -> unit conversion.
 * Works on both Latin transcripts ("paanch kilo sugar") and Devanagari ("पाँच किलो चीनी").
 */

/* ----------------------------- Lexicon ----------------------------- */

const NUMBER_WORDS = {
  // English
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, fifteen: 15, twenty: 20, fifty: 50, half: 0.5,
  // Hinglish
  ek: 1, do: 2, teen: 3, tin: 3, char: 4, chaar: 4, paanch: 5, panch: 5, paach: 5, chhe: 6, chhah: 6, che: 6, chhe_: 6,
  saat: 7, sat: 7, aath: 8, aat: 8, nau: 9, no: 9, das: 10, gyarah: 11, barah: 12, pandrah: 15, bees: 20, pachas: 50,
  aadha: 0.5, adha: 0.5, aadhe: 0.5, dedh: 1.5, dhedh: 1.5, dhai: 2.5, dhaai: 2.5, sawa: 1.25,
  // Devanagari
  'एक': 1, 'दो': 2, 'तीन': 3, 'चार': 4, 'पांच': 5, 'पाँच': 5, 'छह': 6, 'छः': 6, 'छे': 6, 'सात': 7, 'आठ': 8, 'नौ': 9,
  'दस': 10, 'ग्यारह': 11, 'बारह': 12, 'पंद्रह': 15, 'बीस': 20, 'पचास': 50, 'आधा': 0.5, 'आधे': 0.5, 'डेढ़': 1.5, 'डेढ': 1.5, 'ढाई': 2.5, 'सवा': 1.25,
};
const HUNDRED = new Set(['sau', 'सौ']);

const UNIT_WORDS = {
  kilo: 'kg', kg: 'kg', kilogram: 'kg', kilos: 'kg', 'किलो': 'kg',
  gram: 'gm', grams: 'gm', gm: 'gm', g: 'gm', 'ग्राम': 'gm',
  litre: 'litre', liter: 'litre', ltr: 'litre', l: 'litre', 'लीटर': 'litre',
  ml: 'ml',
  packet: 'packet', packets: 'packet', pack: 'packet', pkt: 'packet', paket: 'packet', 'पैकेट': 'packet',
  bottle: 'bottle', bottles: 'bottle', botal: 'bottle', botle: 'bottle', 'बोतल': 'bottle',
  piece: 'pcs', pieces: 'pcs', pcs: 'pcs', pc: 'pcs', 'पीस': 'pcs',
  dozen: 'dozen', darjan: 'dozen', 'दर्जन': 'dozen',
};

const CONNECTORS = new Set(['aur', 'and', 'plus', 'tatha', 'phir', 'or', 'aurr', 'और', 'तथा', 'फिर', 'व']);
const FILLER = new Set([
  'ka', 'ki', 'ke', 'ko', 'wala', 'wali', 'wale', 'chahiye', 'chaiye', 'de', 'dena', 'dijiye', 'dijie', 'dedo', 'please', 'pls',
  'bhi', 'ye', 'woh', 'vo', 'mujhe', 'hume', 'humko', 'add', 'bill', 'me', 'mein', 'main', 'total', 'of', 'the', 'a', 'an', 'some',
  'ka', 'का', 'की', 'के', 'को', 'वाला', 'वाली', 'चाहिए', 'दे', 'देना', 'दीजिए', 'भी', 'मुझे', 'हमको', 'में', 'ये', 'वो',
]);
const GIVE_VERBS = new Set(['de', 'dena', 'dijiye', 'dijie', 'दे', 'देना', 'दीजिए', 'ek', 'एक']);

/* Hindi/Hinglish product words -> a canonical English head so "namak" matches "Salt". */
const SYNONYM_GROUPS = {
  sugar: ['chini', 'cheeni', 'shakkar', 'shakar', 'sugar'],
  salt: ['namak', 'salt', 'nimak'],
  oil: ['tel', 'oil', 'tail'],
  milk: ['doodh', 'dudh', 'milk'],
  rice: ['chawal', 'chaawal', 'rice'],
  flour: ['atta', 'aata', 'flour'],
  tea: ['chai', 'chay', 'tea'],
  soap: ['sabun', 'soap'],
  turmeric: ['haldi', 'turmeric'],
  chilli: ['mirch', 'mirchi', 'chilli', 'chili'],
  curd: ['dahi', 'curd'],
  butter: ['makhan', 'butter'],
  water: ['paani', 'pani', 'water'],
  egg: ['anda', 'ande', 'egg', 'eggs'],
  noodles: ['noodles', 'noodle'],
  biscuit: ['biscuit', 'biscuits', 'biskut'],
};
const SYNONYM_HEAD = Object.entries(SYNONYM_GROUPS).reduce((acc, [head, words]) => {
  words.forEach((w) => { acc[w] = head; });
  return acc;
}, {});

const SIZE_TOKEN = /^\d+(\.\d+)?(kg|g|gm|gms|ml|l|ltr|litre|pcs|pc)?$/;
const STOP_NAME_WORDS = new Set(['and', 'the', 'of', 'with', 'pack', 'combo']);

/* --------------------- Devanagari transliteration -------------------- */

const DEV_VOWELS = { 'अ': 'a', 'आ': 'a', 'इ': 'i', 'ई': 'i', 'उ': 'u', 'ऊ': 'u', 'ए': 'e', 'ऐ': 'ai', 'ओ': 'o', 'औ': 'au', 'ऑ': 'o', 'ऋ': 'ri' };
const DEV_MATRAS = { 'ा': 'a', 'ि': 'i', 'ी': 'i', 'ु': 'u', 'ू': 'u', 'े': 'e', 'ै': 'ai', 'ो': 'o', 'ौ': 'au', 'ॉ': 'o', 'ृ': 'ri' };
const DEV_CONS = {
  'क': 'k', 'ख': 'kh', 'ग': 'g', 'घ': 'gh', 'ङ': 'n', 'च': 'ch', 'छ': 'chh', 'ज': 'j', 'झ': 'jh', 'ञ': 'n',
  'ट': 't', 'ठ': 'th', 'ड': 'd', 'ढ': 'dh', 'ण': 'n', 'त': 't', 'थ': 'th', 'द': 'd', 'ध': 'dh', 'न': 'n',
  'प': 'p', 'फ': 'f', 'ब': 'b', 'भ': 'bh', 'म': 'm', 'य': 'y', 'र': 'r', 'ल': 'l', 'व': 'v', 'श': 'sh', 'ष': 'sh',
  'स': 's', 'ह': 'h', 'ळ': 'l',
};
const VIRAMA = '्';
const DEV_RANGE = /[\u0900-\u097F]/;

const transliterate = (word) => {
  if (!DEV_RANGE.test(word)) return word;
  const chars = [...word.replace(/\u093C/g, '')]; // drop nukta
  let out = '';
  for (let i = 0; i < chars.length; i += 1) {
    const ch = chars[i];
    const next = chars[i + 1];
    if (DEV_CONS[ch]) {
      out += DEV_CONS[ch];
      if (next && DEV_MATRAS[next]) continue; // matra supplies the vowel
      if (next === VIRAMA) { i += 1; continue; } // conjunct - no vowel
      if (next !== undefined) out += 'a'; // inherent 'a', dropped at word end (schwa deletion)
    } else if (DEV_VOWELS[ch]) out += DEV_VOWELS[ch];
    else if (DEV_MATRAS[ch]) out += DEV_MATRAS[ch];
    else if (ch === 'ं' || ch === 'ँ') out += 'n';
    else if (ch === 'ः') out += 'h';
    else if (/[a-z0-9]/i.test(ch)) out += ch.toLowerCase();
  }
  return out;
};

/* --------------------------- Text utilities -------------------------- */

const DEV_DIGITS = '०१२३४५६७८९';
const toAsciiDigits = (s) => s.replace(/[०-९]/g, (d) => String(DEV_DIGITS.indexOf(d)));

export const tokenize = (text) =>
  toAsciiDigits(String(text || '').normalize('NFC').toLowerCase())
    .replace(/[.,!?;:।|()"'`]/g, ' ')
    .replace(/(\d)([a-z\u0900-\u097F])/g, '$1 $2')
    .split(/\s+/)
    .filter(Boolean);

const levenshtein = (a, b) => {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i += 1) {
    const cur = [i];
    for (let j = 1; j <= n; j += 1) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
};

/** Consonant skeleton: "maggi", "maggie", "maigi" and "मैगी" all collapse to the same key. */
export const phoneticKey = (s) => {
  let k = String(s).toLowerCase().replace(/[^a-z]/g, '');
  k = k.replace(/ph/g, 'f').replace(/ch/g, 'C').replace(/sh/g, 's').replace(/ck/g, 'k').replace(/[kgdtbj]h/g, (m) => m[0])
    .replace(/q/g, 'k').replace(/x/g, 'ks').replace(/w/g, 'v').replace(/z/g, 'j').replace(/c/g, 'k');
  k = k[0] + k.slice(1).replace(/[aeiouy]/g, '');
  return k.replace(/(.)\1+/g, '$1');
};

const similarity = (a, b) => {
  if (a === b) return 1;
  if (Math.min(a.length, b.length) < 3) return 0;
  const raw = 1 - levenshtein(a, b) / Math.max(a.length, b.length);
  const ka = phoneticKey(a);
  const kb = phoneticKey(b);
  const phon = ka.length >= 2 && kb.length >= 2 ? (1 - levenshtein(ka, kb) / Math.max(ka.length, kb.length)) * 0.92 : 0;
  return Math.max(raw, phon);
};

const canon = (token) => {
  const latin = transliterate(token);
  return SYNONYM_HEAD[latin] || SYNONYM_HEAD[token] || latin;
};

/* ------------------------- Segment extraction ------------------------ */

const isNumberToken = (t) => /^\d+(\.\d+)?$/.test(t) || (t in NUMBER_WORDS && !HUNDRED.has(t));
const numberValue = (t) => (/^\d/.test(t) ? Number(t) : NUMBER_WORDS[t]);
const isUnit = (t) => t in UNIT_WORDS;
const isProductWord = (t) => !isNumberToken(t) && !isUnit(t) && !FILLER.has(t) && !CONNECTORS.has(t) && !HUNDRED.has(t);

const splitSegments = (tokens) => {
  const segments = [];
  let cur = [];
  const flush = () => { if (cur.length) segments.push(cur); cur = []; };

  tokens.forEach((t, i) => {
    if (CONNECTORS.has(t)) return flush();
    // "ek"/"do" right after a give-verb ("... de do") is a verb, not a quantity.
    const prev = tokens[i - 1];
    const verbDo = (t === 'do' || t === 'दो') && prev && GIVE_VERBS.has(prev) && prev !== 'ek' && prev !== 'एक';
    if (verbDo) return undefined;
    if (isNumberToken(t) && cur.some(isProductWord)) flush(); // new quantity starts a new item
    cur.push(t);
    return undefined;
  });
  flush();
  return segments;
};

const parseSegment = (tokens) => {
  let quantity = null;
  let unit = null;
  const words = [];

  for (let i = 0; i < tokens.length; i += 1) {
    const t = tokens[i];
    if (isNumberToken(t) && quantity === null) {
      let v = numberValue(t);
      if (HUNDRED.has(tokens[i + 1]) && v < 10) { v *= 100; i += 1; }
      quantity = v;
    } else if (isUnit(t) && unit === null) unit = UNIT_WORDS[t];
    else if (isProductWord(t)) words.push(t);
  }
  return { quantity, unit, words };
};

/* --------------------------- Product matching ------------------------ */

const buildIndex = (products) =>
  products.map((product) => {
    const tokens = tokenize(product.name.replace(/[^\p{L}\p{N}\s.]/gu, ' '))
      .filter((t) => !SIZE_TOKEN.test(t) && !STOP_NAME_WORDS.has(t))
      .map(canon);
    return { product, tokens: [...new Set(tokens)] };
  });

const scoreProduct = (phraseTokens, entry) => {
  if (!phraseTokens.length || !entry.tokens.length) return { score: 0, anchor: 0, coverage: 0 };
  let anchor = 0;
  const phraseHit = new Array(phraseTokens.length).fill(0);
  const nameHit = new Array(entry.tokens.length).fill(0);

  entry.tokens.forEach((nt, ni) => {
    phraseTokens.forEach((pt, pi) => {
      const s = similarity(pt, nt);
      if (s >= 0.72) {
        anchor = Math.max(anchor, s);
        phraseHit[pi] = Math.max(phraseHit[pi], s);
        nameHit[ni] = Math.max(nameHit[ni], s);
      }
    });
  });

  const phraseCoverage = phraseHit.filter(Boolean).length / phraseTokens.length;
  const nameCoverage = nameHit.filter(Boolean).length / entry.tokens.length;
  const score = 0.6 * anchor + 0.25 * phraseCoverage + 0.15 * nameCoverage;
  return { score, anchor, coverage: phraseCoverage };
};

const findProducts = (words, index) => {
  const phraseTokens = words.map(canon);
  return index
    .map((entry) => ({ entry, ...scoreProduct(phraseTokens, entry) }))
    .filter((r) => r.score >= 0.65 && r.coverage >= 0.5)
    .sort((a, b) => b.score - a.score || a.entry.product.name.length - b.entry.product.name.length);
};

/* --------------------------- Unit conversion ------------------------- */

const convertQuantity = (qty, spokenUnit, productUnit) => {
  if (!spokenUnit) return qty;
  if (spokenUnit === 'gm' && productUnit === 'kg') return qty / 1000;
  if (spokenUnit === 'kg' && productUnit === 'gm') return qty * 1000;
  if (spokenUnit === 'ml' && productUnit === 'litre') return qty / 1000;
  if (spokenUnit === 'litre' && productUnit === 'ml') return qty * 1000;
  if (spokenUnit === 'dozen') return qty * 12;
  return qty;
};

const round3 = (n) => Math.round(n * 1000) / 1000;

/* ------------------------------- Public ------------------------------ */

export function parseVoiceBill(transcript, products = []) {
  const tokens = tokenize(transcript);
  const index = buildIndex(products);

  // Merge "orphan" segments ("maggi ... 2 packet") into the preceding item when it has no explicit quantity.
  const parsed = [];
  splitSegments(tokens).forEach((seg) => {
    const p = { ...parseSegment(seg), spokenText: seg.join(' ') };
    const prev = parsed[parsed.length - 1];
    if (!p.words.length && prev && prev.quantity === null && p.quantity !== null) {
      prev.quantity = p.quantity;
      prev.unit = prev.unit || p.unit;
      prev.spokenText += ` ${p.spokenText}`;
    } else parsed.push(p);
  });

  const items = [];
  const unmatched = [];

  parsed.forEach((seg) => {
    if (!seg.words.length) {
      if (seg.quantity !== null) unmatched.push({ text: seg.spokenText, reason: 'Quantity heard but no item name' });
      return;
    }
    const matches = findProducts(seg.words, index);
    if (!matches.length) {
      unmatched.push({ text: seg.words.join(' '), reason: 'No matching item in inventory' });
      return;
    }

    const best = matches[0];
    const product = best.entry.product;
    const alternatives = matches
      .slice(1, 4)
      .filter((m) => best.score - m.score <= 0.15)
      .map((m) => m.entry.product);
    const requested = seg.quantity ?? 1;
    const quantity = round3(convertQuantity(requested, seg.unit, product.unit));
    const whole = ['pcs', 'packet'].includes(product.unit);

    items.push({
      product,
      quantity: whole ? Math.max(1, Math.round(quantity)) : quantity,
      spokenText: seg.spokenText,
      confidence: Math.round(best.score * 100),
      alternatives,
    });
  });

  return { items, unmatched, tokens };
}

export const VOICE_EXAMPLES = ['Do packet Maggie aur ek packet Tata Namak', 'Paanch kilo sugar aur do bottle oil', 'डेढ़ किलो चीनी और एक पैकेट नमक'];

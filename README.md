# Smart Vyapar OS

Micro-retail operating system for Indian kirana stores. MERN stack.

```
smart-vyapar-os/
├── backend/    Express (ES modules) + Mongoose + Zod
└── frontend/   React 18 + Vite + Tailwind
```

## Run it

```bash
# 1. API  (MongoDB Atlas URI required; transactions need a replica set, which Atlas always is)
cd backend && cp .env.example .env     # fill MONGODB_URI, SHOP_UPI_ID, SHOP_NAME
npm install
npm run seed                           # optional demo data (--fresh wipes first)
npm run dev                            # http://localhost:5000/api/health

# 2. Client
cd ../frontend && cp .env.example .env
npm install
npm run dev                            # http://localhost:5173  (proxies /api to :5000)
```

## API

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | Liveness + DB state |
| POST | `/api/sales/create-bill` | Atomic checkout (stock, lastSoldAt, invoice `INV-YYYYMMDD-XXXX`, udhar) |
| GET | `/api/products` · `/low-stock` · `/search?q=` | Inventory |
| POST | `/api/products` | Add item with dealer quotes |
| GET | `/api/analytics/dead-capital?days=45&factor=0.4&sync=false` | Dead capital + bundle recommendations |
| POST | `/api/procurement/optimize-order` | Split order across dealers |
| POST | `/api/customers/calculate-risk` | Udhar risk score and flag |
| GET | `/api/customers/by-phone/:phone` · `/:id/upi-link` | Lookup, UPI deep link |
| POST | `/api/customers` · `/:id/settle` | Create customer, record repayment |
| GET/POST | `/api/dealers`, `/api/price-alerts` | Master data |

`create-bill` payload:
```json
{ "items":[{"productId":"...","quantity":2}], "discount":10, "paymentMode":"Udhar",
  "customer":{"phone":"9801112233","name":"Anita"}, "udharDueDate":"2026-10-30" }
```
Prices always come from the database, never from the client.

## Design notes

- **Concurrency**: stock is deducted with `findOneAndUpdate({stockQuantity:{$gte:qty}}, {$inc})` inside `session.withTransaction`. Lines are locked in sorted order to avoid deadlocks, and the invoice counter is rolled back with the transaction.
- **Credit rules**: udhar is rejected if it exceeds `maxCreditLimit` or the customer's trust score is below 3.
- **Optimizer**: ranks dealers by lot-aware cost (free units only on complete lots) and also reports the spec's `EffectivePrice = quoted × base / (base + free)`. Schemes come from numeric `baseQuantity`/`freeUnits` or are parsed from `schemeText` ("10+1", "Buy 12 get 1 free", "10 pe 1 free").
- **Risk score**: `w1·RepaymentSpeedRatio + w2·AvgDelayNormalized − w3·DefaultPenalty` (0.5 / 0.3 / 0.4), min-max scaled to 1–5 stars. Any unpaid bill over 45 days late forces RESTRICTED.
- **Invoices are immutable** at the model layer.
- **Shortcuts** (POS): F2 search, F4 pay & print, F6 voice, Esc clear cart.
- **Voice**: say the quantity first ("do packet maggi aur ek kilo sugar"). Devanagari transcripts work too.
- **Auth** is not wired yet. `bcryptjs` and `jsonwebtoken` are installed; add `/api/auth` and a `protect` middleware before exposing this publicly.

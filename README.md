# ShopKart API

Backend for the [ShopKart Android app](https://github.com/RizTech-Academy/shopkart-android) — catalogue, cart, favourites and orders.

Next.js App Router, TypeScript and SQLite via libSQL. No Docker, no external services, no environment variables. Clone it and it runs.

---

## Quick start

Requires **Node 18.18 or newer**.

```bash
git clone https://github.com/RizTech-Academy/shopkart-api.git
cd shopkart-api
npm install
npm run dev
```

That's it. Open <http://localhost:3000> for the endpoint list.

On first run the database is created at `data/shopkart.db` and seeded with 23 products. It persists across restarts. To start clean, delete the file:

```bash
rm -rf data && npm run dev
```

### Other commands

```bash
npm test           # 30 tests — unit + integration
npm run typecheck  # tsc --noEmit, strict
npm run build      # production build
npm start          # run the production build
```

### Verify it works

```bash
curl http://localhost:3000/api/products?pageSize=3
SESSION=$(curl -s -X POST http://localhost:3000/api/sessions | jq -r .data.id)
curl -X POST http://localhost:3000/api/cart \
  -H "x-session-id: $SESSION" -H 'Content-Type: application/json' \
  -d '{"productId":"p-001","quantity":2}'
```

---

## Architecture

Clean Architecture with the dependency rule enforced by the import graph — every arrow points inward.

```
src/domain/          Entities, value objects, and the repository interfaces (ports).
                     Zero imports from Next.js, libSQL, or any framework.
src/application/     Use cases. One operation each. Depend only on ports.
src/infrastructure/  libSQL adapters implementing those ports, plus the
                     composition root that wires everything together.
src/interface/http/  Request parsing and the domain-error → HTTP-status mapping.
app/api/…            Route handlers. Parse, delegate to a use case, format.
```

Some consequences worth pointing at:

**The domain does not know what a 404 is.** `GetProduct` throws `NotFoundError`. A single function in `interface/http/responses.ts` maps that to a status code. Which is why the same use cases could be driven from a CLI or a queue consumer without change.

**Business rules cannot be bypassed by a route.** "Out of stock cannot be added to a cart" and "a quantity of zero means remove" live in use cases, not handlers. There is no code path around them.

**Tests run against a real database, not mocks.** `__tests__/support.ts` builds the whole object graph against an in-memory SQLite with a fixed clock and deterministic ids. The 21 integration tests exercise genuine SQL — joins, constraints, `ON CONFLICT` upserts — in about 60 ms.

**Prices are integers.** `amountMinor: 12900` is $129.00. `Money` is a branded type, so a raw number cannot be passed where money is expected, and SQLite stores `INTEGER` — never `REAL`, which is a double.

**Cart lines join to products rather than copying the price**, so a cart can never show a stale price that disagrees with checkout.

---

## API

Two response shapes, always:

```jsonc
{ "data": … , "meta": { … } }                       // success
{ "error": { "code": "…", "message": "…" } }        // failure
```

Write endpoints need a session. Create one with `POST /api/sessions` and send the id back as an **`x-session-id`** header. No accounts, no passwords — it exists to keep a cart attached to a device.

### Catalogue

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/api/products` | `search`, `category`, `sort`, `page`, `pageSize` (max 50) |
| `GET` | `/api/products/:id` | 404 if unknown |
| `GET` | `/api/categories` | with product counts |

`sort` is one of `relevance`, `price_asc`, `price_desc`, `rating_desc`, `title_asc`.

### Session

| Method | Path | Notes |
| --- | --- | --- |
| `POST` | `/api/sessions` | returns `{ id, createdAt }` |

### Cart

| Method | Path | Body |
| --- | --- | --- |
| `GET` | `/api/cart` | — |
| `POST` | `/api/cart` | `{ productId, quantity }` — adding an existing product increments it |
| `PATCH` | `/api/cart/items/:productId` | `{ quantity }` — `0` removes the line |
| `DELETE` | `/api/cart/items/:productId` | — |
| `DELETE` | `/api/cart` | empties the cart |

### Favourites

| Method | Path | Body |
| --- | --- | --- |
| `GET` | `/api/favourites` | — |
| `POST` | `/api/favourites` | `{ productId }` — toggles, returns `{ favourited }` |

### Orders

| Method | Path | Notes |
| --- | --- | --- |
| `POST` | `/api/orders` | Checkout. Snapshots prices, then empties the cart. 400 if the cart is empty. |
| `GET` | `/api/orders` | history for the session |
| `GET` | `/api/orders/:id` | 404 if it belongs to another session |

There is no payment step — deliberately out of scope.

---

## Testing

```
9  unit         Money arithmetic, SQL fragment building, LIKE escaping, injection safety
21 integration  Real SQLite: catalogue queries, cart lifecycle, checkout, session isolation
```

The integration tests cover the cases that actually break in production: adding the same product twice increments rather than duplicating, a quantity of zero removes, checkout empties the cart so a basket cannot be bought twice, and one session cannot read another's orders.

---

## Configuration

None required. `DATABASE_URL` is honoured if set — `:memory:` for an ephemeral database, or a libSQL URL for a hosted one — but the default local file needs no configuration at all.

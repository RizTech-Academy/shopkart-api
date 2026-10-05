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

That's it.

- <http://localhost:3000/docs> — **Swagger UI**, for trying every endpoint in the browser
- <http://localhost:3000/api/openapi.json> — the raw spec, importable into Postman or Insomnia

**Using Swagger UI:** call `POST /api/sessions` first, copy the returned `id`, click
**Authorize** at the top right and paste it. Every basket, favourite and order endpoint
needs that header.

On first run the database is created at `data/shopkart.db` and seeded with 23 products. It persists across restarts. To start clean, delete the file:

```bash
rm -rf data && npm run dev
```

### Other commands

```bash
npm test           # 35 tests — unit + integration
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

### Owner, and the mistake it corrects

An earlier version of this codebase keyed baskets and orders on a **session id**. That is
wrong, and instructively so. A session is an authentication artifact — it expires, it is
per-device, it is a detail of *how* somebody proved who they are. A basket belongs to a
**shopper**, and a shopper is either a guest or a registered user.

`src/domain/owner.ts` models that as a sealed type. Three things follow:

- the domain never learns that sessions or tokens exist
- "keep the basket I built as a guest when I sign in" is an operation on two `Owner`s,
  not SQL smuggled into a session repository
- the compiler forces every call site to say which kind it holds

`ResolveOwner` is the single place a session id becomes ownership. When accounts arrive it
gains a token branch and nothing downstream changes.

`OwnershipTransfer` is a one-method interface for the same reason. Moving a basket spans
three tables and belongs to none of them — putting it on `CartRepository` would force every
implementor to know about favourites and orders, which is exactly the interface-segregation
problem worth avoiding.

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
26 integration  Real SQLite: catalogue queries, basket lifecycle, checkout,
                owner isolation, and guest-to-account transfer
```

The integration tests cover the cases that actually break in production: adding the same
product twice increments rather than duplicating, a quantity of zero removes, checkout
empties the basket so it cannot be bought twice, one shopper cannot read another's orders,
and a guest basket survives being transferred to an account — summing quantities where both
sides held the same product, rather than silently dropping one.

---

## Configuration

None required. `DATABASE_URL` is honoured if set — `:memory:` for an ephemeral database, or a libSQL URL for a hosted one — but the default local file needs no configuration at all.

## Product photos

Each product's photo ships with the API in `public/products/<id>.webp` (800×800), so the
catalogue looks the same offline, in CI and in five years, with nothing hotlinked from a stock
host. They are free photos from [Pexels](https://www.pexels.com/license/), cropped and resized
for the demo; the products themselves are fictional.

| Product | Photo |
| --- | --- |
| Aurora Wireless Headphones | [Pexels](https://www.pexels.com/photo/210927/) |
| Pulse Bluetooth Speaker | [Pexels](https://www.pexels.com/photo/9842750/) |
| Echo Studio Microphone | [Pexels](https://www.pexels.com/photo/12715624/) |
| Nomad Earbuds Pro | [Pexels](https://www.pexels.com/photo/32880383/) |
| Meridian Mechanical Keyboard | [Pexels](https://www.pexels.com/photo/12561283/) |
| Glide Ergonomic Mouse | [Pexels](https://www.pexels.com/photo/20510003/) |
| Vista 27-inch 4K Monitor | [Pexels](https://www.pexels.com/photo/27559482/) |
| Anchor USB-C Hub | [Pexels](https://www.pexels.com/photo/20076003/) |
| Trail 30L Backpack | [Pexels](https://www.pexels.com/photo/5202030/) |
| Summit Insulated Bottle | [Pexels](https://www.pexels.com/photo/7815021/) |
| Beacon Camp Lantern | [Pexels](https://www.pexels.com/photo/7385016/) |
| Loom Merino Sweater | [Pexels](https://www.pexels.com/photo/13889763/) |
| Drift Canvas Jacket | [Pexels](https://www.pexels.com/photo/11442987/) |
| Everyday Cotton Tee | [Pexels](https://www.pexels.com/photo/12025472/) |
| Range Wool Socks | [Pexels](https://www.pexels.com/photo/14267095/) |
| Brew Pour-Over Set | [Pexels](https://www.pexels.com/photo/8211266/) |
| Grind Burr Coffee Mill | [Pexels](https://www.pexels.com/photo/13427986/) |
| Slate Chef Knife 8-inch | [Pexels](https://www.pexels.com/photo/4226864/) |
| Ember Cast Iron Skillet | [Pexels](https://www.pexels.com/photo/8743943/) |
| Focus Desk Lamp | [Pexels](https://www.pexels.com/photo/28461166/) |
| Quiet Mist Humidifier | [Pexels](https://www.pexels.com/photo/7417506/) |
| Terra Ceramic Planter | [Pexels](https://www.pexels.com/photo/18294113/) |
| Linen Throw Blanket | [Pexels](https://www.pexels.com/photo/31658575/) |

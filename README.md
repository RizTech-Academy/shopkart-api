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
**Authorize** at the top right and paste it as `sessionId`. Every basket, favourite and order
endpoint needs a credential — either that, or a Bearer token from `/api/auth/login`.

On first run the database is created at `data/shopkart.db` and seeded with 23 products. It persists across restarts. To start clean, delete the file:

```bash
rm -rf data && npm run dev
```

### Other commands

```bash
npm test           # 105 tests — unit + integration
npm run typecheck  # tsc --noEmit, strict
npm run build      # production build
npm start          # run the production build
```

### Verify it works

Browse, build a basket as a guest, then sign up and watch the basket follow you:

```bash
curl http://localhost:3000/api/products?pageSize=3

SESSION=$(curl -s -X POST http://localhost:3000/api/sessions | jq -r .data.id)
curl -X POST http://localhost:3000/api/cart \
  -H "x-session-id: $SESSION" -H 'Content-Type: application/json' \
  -d '{"productId":"p-001","quantity":2}'

TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/register \
  -H "x-session-id: $SESSION" -H 'Content-Type: application/json' \
  -d '{"email":"ada@example.com","password":"correct-horse","displayName":"Ada"}' \
  | jq -r .data.accessToken)

curl http://localhost:3000/api/cart -H "Authorization: Bearer $TOKEN"   # the same two items
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
src/interface/http/  Request parsing, response DTOs, and the domain-error →
                     HTTP-status mapping.
app/api/…            Route handlers. Parse, delegate to a use case, format.
```

**New to the codebase?** Follow one request through the layers — it is about 60 lines end to
end:

`app/api/cart/route.ts` → `application/useCases.ts` (`AddToCart`) →
`domain/ports.ts` (`CartRepository`) → `infrastructure/repositories/LibSqlCartRepository.ts`

The route parses and formats, the use case holds the rule, the port is the seam, and only the
adapter knows SQL exists. Every other endpoint is the same four steps.

Some consequences worth pointing at:

**The domain does not know what a 404 is.** `GetProduct` throws `NotFoundError`. A single function in `interface/http/responses.ts` maps that to a status code. Which is why the same use cases could be driven from a CLI or a queue consumer without change.

**Business rules cannot be bypassed by a route.** "Out of stock cannot be added to a cart" and "a quantity of zero means remove" live in use cases, not handlers. There is no code path around them.

**Tests run against a real database, not mocks.** `__tests__/support.ts` builds the whole object graph against an in-memory SQLite with a fixed clock and deterministic ids. The 80 integration and HTTP tests exercise genuine SQL — joins, constraints, `ON CONFLICT` upserts — in about 90 ms.

**Prices are integers.** `amountMinor: 12900` is $129.00. `Money` is a branded type, so a raw number cannot be passed where money is expected, and SQLite stores `INTEGER` — never `REAL`, which is a double.

**Cart lines join to products rather than copying the price**, so a cart can never show a stale price that disagrees with checkout.

**Checkout is one transaction.** Writing the order and emptying the basket must land together,
or a shopper can pay twice. Repositories are handed an executor that can run a statement and
nothing else, so none of them can open a transaction of its own — see
[Transactions](#transactions).

**Entities are never serialised directly.** Every response body is built in
`interface/http/presenters.ts`, and `Order` shows why that is not ceremony: it holds an
`Owner`, and an `Owner` holds the session id — so returning the entity handed a shopper their
own credential back in the body of every order request. A DTO cannot make that mistake, because
a field has to be written down to be sent. It is also why money has one shape everywhere rather
than three, which an Android client would otherwise have to model three times.

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

`ResolveOwner` is the single place a credential becomes ownership.

`OwnershipTransfer` is a one-method interface for the same reason. Moving a basket spans
three tables and belongs to none of them — putting it on `CartRepository` would force every
implementor to know about favourites and orders, which is exactly the interface-segregation
problem worth avoiding.

It has no endpoint, and that is the point. `RegisterUser` and `LogIn` reach it when a guest
session id arrives with the request; "move everything this shopper owns onto that one" is not
something a client should be able to ask for directly.

### Accounts, and what the Owner type bought

That design predicted a token branch in `ResolveOwner`. Accounts have since landed, and the
prediction held: adding them changed `ResolveOwner` and nothing else. Not one cart, favourite
or order use case knows that accounts exist — they take an `Owner` and always did.

The parts worth pointing at:

**Signing in keeps the basket you built as a guest.** Send `x-session-id` alongside
`/api/auth/register` or `/api/auth/login` and the basket, favourites and order history move
onto the account. Where both sides hold the same product the quantities are summed — a shopper
who added two before signing up and one after expects three, not to silently lose either. This
is `TransferOwnership` between two `Owner`s, which is what the type was introduced for.

**A token beats a session when both are sent.** That ordering is a rule, not an accident: a
signed-in shopper on a shared device must see their own basket, never the one the device was
carrying.

**Tokens are opaque and stored, not signed.** A signed token cannot be revoked without keeping
a denylist — which is the same table, reached by a longer route — and this API never needs to
validate a token without touching the database. So logging out actually invalidates the token,
and only for that device: each sign-in issues its own.

**Sign-in does not reveal who has an account.** A wrong password and an unknown address return
the same message, and both run the hash comparison — `LogIn` verifies against `''` when no user
matched, so an unknown address costs the same time as a wrong one and cannot be told apart by a
stopwatch.

**Passwords are hashed with scrypt from `node:crypto`.** bcrypt and argon2 are native addons
needing a compiler on first install, which would cost the promise that a clone just runs. The
cost parameters are stored inside each hash rather than read from a constant, so raising them
later does not lock out every account created before the change.

**The UNIQUE constraint is the real duplicate-email check**, not the lookup that precedes it.
Two simultaneous sign-ups both pass that lookup; only one survives the insert, and translating
the constraint failure in the repository turns the race into a clean 409 rather than a 500.

### Transactions

**The problem.** Checkout does three things: read the basket, write the order, empty the
basket. As three separate statements there are two ways to charge someone twice — a crash after
the order is written leaves the basket full, and two checkouts arriving together both read the
same full basket.

**The fix, in two pieces.**

`UnitOfWork` is a port in the domain. It says one thing: *run this work so that every write
inside it lands, or none does.*

```ts
interface UnitOfWork {
  run<T>(work: (repositories: TransactionalRepositories) => Promise<T>): Promise<T>;
}
```

It hands the repositories *to* the callback rather than letting it reach for them. That is what
makes the guarantee real instead of advisory: code inside `run` can only touch repositories
that are part of the transaction.

`SqlExecutor` is the other half. Repositories used to receive libSQL's `Client`, which can open
transactions. They now receive this:

```ts
interface SqlExecutor {
  execute(statement: InStatement): Promise<ResultSet>;
}
```

Where a transaction begins and ends is a decision about a use case, not about one table — so a
repository is given nothing it could use to make that decision. `PlaceOrder` reads like the
business rule it is, and the SQL underneath cannot escape it.

**Three things libSQL taught us**, each a comment in `infrastructure/db/LibSqlUnitOfWork.ts` if
you want the detail:

| Decision | Why |
| --- | --- |
| Issue `BEGIN`/`COMMIT` directly instead of `client.transaction()` | That method swaps the connection for a fresh one. `PRAGMA foreign_keys` is per-connection, so constraints would stop being enforced — and a `:memory:` database *is* its connection, so tests would lose their tables. |
| Key the write queue on the connection, not on the object | One connection means one writer. Holding the queue in a field breaks silently if two units of work ever share a client — which a composition root that memoised after an `await` quietly caused. |
| Track re-entrancy with `AsyncLocalStorage` | A boolean cannot tell "called from inside another transaction" apart from "a second request arrived mid-await". Guessing wrong puts one shopper's checkout inside another's transaction. |

One honest note on `BEGIN IMMEDIATE`: it is easy to credit it with more than it does. Inside
this process the *queue* is what stops two checkouts reading the same basket — switching to
`DEFERRED` breaks no test. `IMMEDIATE` covers what the queue cannot see, such as a second
process on the same file.

---

## API

Two response shapes, always:

```jsonc
{ "data": … , "meta": { … } }                       // success
{ "error": { "code": "…", "message": "…" } }        // failure
```

Money is always `{ "amountMinor": 12900, "currency": "USD" }` — every price, line total,
subtotal and order total, in every endpoint.

Basket, favourite and order endpoints need a credential, and take either:

| Shopper | Header |
| --- | --- |
| Guest | `x-session-id: <id>` from `POST /api/sessions` |
| Registered | `Authorization: Bearer <token>` from `/api/auth/login` or `/api/auth/register` |

They behave identically under both — a basket belongs to a shopper, not to a device. If both
are sent, the token wins.

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

### Accounts

| Method | Path | Body |
| --- | --- | --- |
| `POST` | `/api/auth/register` | `{ email, password, displayName }` — password min 8 |
| `POST` | `/api/auth/login` | `{ email, password }` |
| `POST` | `/api/auth/logout` | — revokes the presented token. Idempotent, this device only. |
| `GET` | `/api/auth/me` | the signed-in shopper. 401 for a guest. |

Both register and login return `{ user, accessToken, expiresAt }` and accept an optional
`x-session-id` — send it to carry the guest basket, favourites and order history onto the
account. Tokens last 30 days.

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
| `POST` | `/api/orders` | Checkout. Snapshots prices, then empties the cart. 400 if the cart is empty or holds a sold-out item. |
| `GET` | `/api/orders` | history for the shopper, newest first |
| `GET` | `/api/orders/:id` | 404 if it belongs to another shopper |

There is no payment step — deliberately out of scope.

### Errors

| Status | `code` | When |
| --- | --- | --- |
| 400 | `validation_failed` | the request is malformed or breaks a rule |
| 401 | `unauthenticated` | no credential, or one that is unknown, revoked or expired |
| 404 | `not_found` | no such product, order, session — or not yours |
| 409 | `conflict` | that email already has an account |
| 500 | `internal_error` | a bug |

---

## Testing

```
23 unit         Money arithmetic, SQL fragment building, LIKE escaping, injection
                safety, scrypt hashing, response DTOs, and spec/route drift
58 integration  Real SQLite: catalogue queries, basket lifecycle, checkout, owner
                isolation, accounts, tokens, transactions, and guest-to-account
                transfer
24 http         The route handlers themselves, called directly: header parsing,
                status codes, and response envelopes
```

They aim at the cases that actually break in production rather than at coverage:

- **Basket** — adding the same product twice increments rather than duplicating, a quantity of
  zero removes, and checkout empties the basket so it cannot be bought twice.
- **Ownership** — one shopper cannot read another's orders, and a guest basket transferred to
  an account sums quantities where both sides held the same product instead of dropping one.
- **Accounts** — a wrong password and an unknown address fail with the identical message, an
  expired token stops resolving, signing out of one device leaves another signed in, and case
  or padding in an email cannot create a second account.
- **Transactions** — a failed unit of work leaves nothing behind, two simultaneous checkouts
  produce exactly one order, and foreign keys are still enforced after a transaction has run.
- **HTTP** — `NotFoundError` really does become a 404, a 401 carries `WWW-Authenticate`, an
  order response never contains the session id, and a bearer token beats a session header.
  Route handlers are plain functions over `Request`, so these call them directly; only
  `getContainer` is swapped, leaving the presenters, error mapping and database real.

Two notes on how they are written:

**Fakes only where a real thing would cost something.** Password hashing is faked everywhere
except `unit.password.test.ts`, which exercises the genuine scrypt adapter. A KDF is slow by
design; running it in every account test would dominate the suite and buy no coverage.
Everything else — including the database — is real.

**A test that cannot fail is not a test.** Each transaction guarantee was checked by breaking
the implementation and confirming the right tests went red. That is how the `BEGIN IMMEDIATE`
note above came about: switching to `DEFERRED` broke nothing, so the comment claiming it
prevented double checkout was wrong and got corrected.

---

## Configuration

None required. `DATABASE_URL` is honoured if set — `:memory:` for an ephemeral database, or a libSQL URL for a hosted one — but the default local file needs no configuration at all.

`SHOPKART_PUBLIC_URL` is the origin put in front of product image paths, so a phone can load them (`http://10.0.2.2:3200` for the Android emulator against a local server).

## Hosted demo

A demo runs at **https://shopkart-api.vercel.app** ([API docs](https://shopkart-api.vercel.app/docs)), and the Android app points there by default. It runs on Vercel's free plan with `DATABASE_URL=file:/tmp/shopkart.db`: each serverless instance builds and seeds its own SQLite file on first request. The catalogue is therefore always the same, but baskets, accounts and orders live only as long as that instance does, and two requests can land on different instances. It's a demo of the API, not a store; for anything that must persist, point `DATABASE_URL` at a hosted libSQL database.

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

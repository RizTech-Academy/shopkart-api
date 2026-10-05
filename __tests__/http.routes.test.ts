import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Container } from '@/src/infrastructure/container';
import { newContainer } from './support';

/**
 * The layer the other tests stop short of.
 *
 * Everything else exercises use cases directly, which leaves the handlers
 * themselves — header parsing, presenter wiring, and the domain-error → status
 * mapping — proven only by hand. That is the layer where a `NotFoundError`
 * becomes a 404, and a repo that claims the domain knows nothing about HTTP
 * ought to have a test showing where it learns.
 *
 * Handlers are plain functions over the web `Request`, so they can be called
 * directly. Only `getContainer` is replaced, so the routes, presenters, error
 * mapping and database underneath are all the real ones.
 */
const { containerRef } = vi.hoisted(() => ({ containerRef: { current: null as Container | null } }));

vi.mock('@/src/infrastructure/container', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/src/infrastructure/container')>()),
  getContainer: async () => containerRef.current!,
}));

const products = await import('@/app/api/products/route');
const product = await import('@/app/api/products/[id]/route');
const categories = await import('@/app/api/categories/route');
const sessions = await import('@/app/api/sessions/route');
const cart = await import('@/app/api/cart/route');
const cartItem = await import('@/app/api/cart/items/[productId]/route');
const favourites = await import('@/app/api/favourites/route');
const orders = await import('@/app/api/orders/route');
const order = await import('@/app/api/orders/[id]/route');
const register = await import('@/app/api/auth/register/route');
const login = await import('@/app/api/auth/login/route');
const logout = await import('@/app/api/auth/logout/route');
const me = await import('@/app/api/auth/me/route');

type Body = Record<string, unknown>;

const request = (url: string, init: { method?: string; headers?: Record<string, string>; body?: Body } = {}) =>
  new Request(`http://localhost${url}`, {
    method: init.method ?? 'GET',
    headers: { 'content-type': 'application/json', ...init.headers },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });

const read = async (response: Response) => ({ status: response.status, body: await response.json() });

describe('http routes', () => {
  let session: string;

  beforeEach(async () => {
    containerRef.current = await newContainer();
    const created = await read(await sessions.POST());
    session = (created.body as { data: { id: string } }).data.id;
  });

  const asGuest = () => ({ 'x-session-id': session });

  describe('catalogue', () => {
    it('returns a page of products with meta alongside data', async () => {
      const { status, body } = await read(await products.GET(request('/api/products?pageSize=2')));

      expect(status).toBe(200);
      expect(body.data).toHaveLength(2);
      expect(body.meta).toMatchObject({ page: 1, pageSize: 2, totalItems: 23 });
      // The presenter's shape, not the entity's.
      expect(body.data[0].price).toEqual({ amountMinor: expect.any(Number), currency: 'USD' });
    });

    it('rejects an invalid query parameter with 400 and field details', async () => {
      const { status, body } = await read(await products.GET(request('/api/products?pageSize=500')));

      expect(status).toBe(400);
      expect(body.error.code).toBe('validation_failed');
      expect(body.error.details[0]).toMatchObject({ path: 'pageSize' });
    });

    it('maps NotFoundError to 404', async () => {
      const ctx = { params: Promise.resolve({ id: 'no-such-product' }) };
      const { status, body } = await read(await product.GET(request('/api/products/x'), ctx));

      expect(status).toBe(404);
      expect(body.error.code).toBe('not_found');
    });

    it('needs no credential', async () => {
      expect((await categories.GET()).status).toBe(200);
    });
  });

  describe('credentials', () => {
    it('answers 401 with WWW-Authenticate when none is sent', async () => {
      const response = await cart.GET(request('/api/cart'));

      expect(response.status).toBe(401);
      expect(response.headers.get('www-authenticate')).toBe('Bearer realm="shopkart"');
      expect((await response.json()).error.code).toBe('unauthenticated');
    });

    it('accepts a session id header', async () => {
      const { status } = await read(await cart.GET(request('/api/cart', { headers: asGuest() })));
      expect(status).toBe(200);
    });

    it('accepts a bearer token, in any case', async () => {
      const created = await read(
        await register.POST(request('/api/auth/register', {
          method: 'POST',
          body: { email: 'ada@example.com', password: 'correct-horse', displayName: 'Ada' },
        })),
      );
      const token = created.body.data.accessToken;

      for (const header of [`Bearer ${token}`, `bearer ${token}`, `BEARER ${token}`]) {
        const { status } = await read(await cart.GET(request('/api/cart', { headers: { authorization: header } })));
        expect(status).toBe(200);
      }
    });

    it('rejects a malformed Authorization header rather than misreading it', async () => {
      const { status } = await read(
        await cart.GET(request('/api/cart', { headers: { authorization: 'Basic abc123' } })),
      );
      expect(status).toBe(401);
    });
  });

  describe('cart', () => {
    it('adds an item and returns the basket', async () => {
      const { status, body } = await read(
        await cart.POST(request('/api/cart', { method: 'POST', headers: asGuest(), body: { productId: 'p-001', quantity: 2 } })),
      );

      expect(status).toBe(200);
      expect(body.data.itemCount).toBe(2);
      expect(body.data.subtotal).toEqual({ amountMinor: 25800, currency: 'USD' });
      expect(body.data.lines[0]).toMatchObject({ productId: 'p-001', quantity: 2, inStock: true });
    });

    it('rejects a malformed body with 400', async () => {
      const malformed = new Request('http://localhost/api/cart', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...asGuest() },
        body: 'not json',
      });

      const { status, body } = await read(await cart.POST(malformed));
      expect(status).toBe(400);
      expect(body.error.message).toMatch(/valid JSON/i);
    });

    it('takes the product id from the path on PATCH and DELETE', async () => {
      await cart.POST(request('/api/cart', { method: 'POST', headers: asGuest(), body: { productId: 'p-001', quantity: 5 } }));
      const ctx = { params: Promise.resolve({ productId: 'p-001' }) };

      const patched = await read(
        await cartItem.PATCH(request('/api/cart/items/p-001', { method: 'PATCH', headers: asGuest(), body: { quantity: 2 } }), ctx),
      );
      expect(patched.body.data.itemCount).toBe(2);

      const deleted = await read(
        await cartItem.DELETE(request('/api/cart/items/p-001', { method: 'DELETE', headers: asGuest() }), {
          params: Promise.resolve({ productId: 'p-001' }),
        }),
      );
      expect(deleted.body.data.lines).toHaveLength(0);
    });

    it('empties the basket on DELETE', async () => {
      await cart.POST(request('/api/cart', { method: 'POST', headers: asGuest(), body: { productId: 'p-001', quantity: 1 } }));
      const { body } = await read(await cart.DELETE(request('/api/cart', { method: 'DELETE', headers: asGuest() })));
      expect(body.data.itemCount).toBe(0);
    });
  });

  describe('favourites', () => {
    it('toggles and lists', async () => {
      const toggled = await read(
        await favourites.POST(request('/api/favourites', { method: 'POST', headers: asGuest(), body: { productId: 'p-002' } })),
      );
      expect(toggled.body.data).toEqual({ favourited: true });

      const listed = await read(await favourites.GET(request('/api/favourites', { headers: asGuest() })));
      expect(listed.body.data).toHaveLength(1);
      expect(listed.body.data[0].price).toMatchObject({ currency: 'USD' });
    });
  });

  describe('orders', () => {
    const checkout = () => orders.POST(request('/api/orders', { method: 'POST', headers: asGuest() }));

    beforeEach(async () => {
      await cart.POST(request('/api/cart', { method: 'POST', headers: asGuest(), body: { productId: 'p-001', quantity: 2 } }));
    });

    it('returns 201 and never discloses the owner', async () => {
      const { status, body } = await read(await checkout());

      expect(status).toBe(201);
      expect(body.data.total).toEqual({ amountMinor: 25800, currency: 'USD' });
      // The regression the presenter layer exists for.
      expect(JSON.stringify(body)).not.toContain(session);
      expect(body.data).not.toHaveProperty('owner');
    });

    it('refuses a second checkout with 400', async () => {
      await checkout();
      const { status, body } = await read(await checkout());

      expect(status).toBe(400);
      expect(body.error.message).toMatch(/empty cart/i);
    });

    it('hides another shopper\'s order behind a 404', async () => {
      const placed = await read(await checkout());
      const stranger = await read(await sessions.POST());
      const strangerId = (stranger.body as { data: { id: string } }).data.id;

      const { status } = await read(
        await order.GET(request(`/api/orders/${placed.body.data.id}`, { headers: { 'x-session-id': strangerId } }), {
          params: Promise.resolve({ id: placed.body.data.id }),
        }),
      );

      // 404 rather than 403: confirming it exists would leak that it does.
      expect(status).toBe(404);
    });
  });

  describe('accounts', () => {
    const credentials = { email: 'ada@example.com', password: 'correct-horse' };

    const signUp = (headers: Record<string, string> = {}) =>
      register.POST(request('/api/auth/register', { method: 'POST', headers, body: { ...credentials, displayName: 'Ada' } }));

    it('returns 201 with a token and no password material', async () => {
      const { status, body } = await read(await signUp());

      expect(status).toBe(201);
      expect(body.data.user.email).toBe('ada@example.com');
      expect(body.data.accessToken).toEqual(expect.any(String));
      expect(JSON.stringify(body)).not.toMatch(/correct-horse|passwordHash|fake:/);
    });

    it('maps a duplicate email to 409', async () => {
      await signUp();
      const { status, body } = await read(await signUp());

      expect(status).toBe(409);
      expect(body.error.code).toBe('conflict');
    });

    it('maps a bad sign-in to 401', async () => {
      await signUp();
      const { status, body } = await read(
        await login.POST(request('/api/auth/login', { method: 'POST', body: { ...credentials, password: 'wrong-one' } })),
      );

      expect(status).toBe(401);
      expect(body.error.code).toBe('unauthenticated');
    });

    it('carries the guest basket onto the account when the session header is sent', async () => {
      await cart.POST(request('/api/cart', { method: 'POST', headers: asGuest(), body: { productId: 'p-001', quantity: 3 } }));

      const { body } = await read(await signUp(asGuest()));
      const token = body.data.accessToken;

      const asUser = await read(await cart.GET(request('/api/cart', { headers: { authorization: `Bearer ${token}` } })));
      expect(asUser.body.data.itemCount).toBe(3);
    });

    it('prefers the token over the session id when both are sent', async () => {
      await cart.POST(request('/api/cart', { method: 'POST', headers: asGuest(), body: { productId: 'p-001', quantity: 3 } }));
      const { body } = await read(await signUp());
      const token = body.data.accessToken;

      const both = await read(
        await cart.GET(request('/api/cart', { headers: { ...asGuest(), authorization: `Bearer ${token}` } })),
      );

      // The account's basket is empty; the device's has three.
      expect(both.body.data.itemCount).toBe(0);
    });

    it('serves the profile and refuses a guest', async () => {
      const { body } = await read(await signUp());
      const token = body.data.accessToken;

      const profile = await read(await me.GET(request('/api/auth/me', { headers: { authorization: `Bearer ${token}` } })));
      expect(profile.status).toBe(200);
      expect(profile.body.data.displayName).toBe('Ada');

      const guest = await read(await me.GET(request('/api/auth/me', { headers: asGuest() })));
      expect(guest.status).toBe(401);
    });

    it('revokes on logout and needs a token to do it', async () => {
      const { body } = await read(await signUp());
      const token = body.data.accessToken;
      const bearer = { authorization: `Bearer ${token}` };

      expect((await logout.POST(request('/api/auth/logout', { method: 'POST' }))).status).toBe(401);

      const revoked = await read(await logout.POST(request('/api/auth/logout', { method: 'POST', headers: bearer })));
      expect(revoked.status).toBe(200);
      expect(revoked.body.data).toEqual({ revoked: true });

      expect((await cart.GET(request('/api/cart', { headers: bearer }))).status).toBe(401);
    });
  });

  it('wraps every success in { data } and every failure in { error }', async () => {
    const success = await read(await categories.GET());
    expect(Object.keys(success.body)).toEqual(['data']);

    const failure = await read(await cart.GET(request('/api/cart')));
    expect(Object.keys(failure.body)).toEqual(['error']);
    expect(Object.keys(failure.body.error).sort()).toEqual(['code', 'message']);
  });
});

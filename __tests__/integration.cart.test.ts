import { beforeEach, describe, expect, it } from 'vitest';
import { newContainer, newGuest } from './support';
import type { Container } from '@/src/infrastructure/container';
import { cartSubtotal } from '@/src/domain/entities';

describe('cart and checkout (integration)', () => {
  let c: Container;
  let owner: Awaited<ReturnType<typeof newGuest>>;

  beforeEach(async () => {
    c = await newContainer();
    owner = await newGuest(c);
  });

  it('rejects operations without a valid session', async () => {
    await expect(c.resolveOwner.execute(null)).rejects.toThrow(/session id is required/i);
    await expect(c.resolveOwner.execute('made-up')).rejects.toThrow(/No session exists/);
  });

  it('adds an item and computes the subtotal from live prices', async () => {
    const cart = await c.addToCart.execute(owner, 'p-001', 2);
    expect(cart.lines).toHaveLength(1);
    expect(cartSubtotal(cart).amountMinor).toBe(25800); // 12900 x 2
  });

  it('increments rather than duplicating when the same product is added twice', async () => {
    await c.addToCart.execute(owner, 'p-001', 1);
    const cart = await c.addToCart.execute(owner, 'p-001', 2);
    expect(cart.lines).toHaveLength(1);
    expect(cart.lines[0]!.quantity).toBe(3);
  });

  it('refuses an out-of-stock product', async () => {
    await expect(c.addToCart.execute(owner, 'p-004', 1)).rejects.toThrow(/out of stock/i);
    expect((await c.getCart.execute(owner)).lines).toHaveLength(0);
  });

  it('refuses an unknown product and a non-positive quantity', async () => {
    await expect(c.addToCart.execute(owner, 'nope', 1)).rejects.toThrow(/No product exists/);
    await expect(c.addToCart.execute(owner, 'p-001', 0)).rejects.toThrow(/positive integer/);
  });

  it('treats a quantity of zero as removal', async () => {
    await c.addToCart.execute(owner, 'p-001', 3);
    const cart = await c.updateCartQuantity.execute(owner, 'p-001', 0);
    expect(cart.lines).toHaveLength(0);
  });

  it('keeps carts isolated between sessions', async () => {
    const other = await newGuest(c);
    await c.addToCart.execute(owner, 'p-001', 1);
    expect((await c.getCart.execute(other)).lines).toHaveLength(0);
  });

  it('places an order, snapshots the lines and empties the cart', async () => {
    await c.addToCart.execute(owner, 'p-001', 2);
    await c.addToCart.execute(owner, 'p-002', 1);

    const order = await c.placeOrder.execute(owner);

    expect(order.total.amountMinor).toBe(12900 * 2 + 5900);
    expect(order.lines).toHaveLength(2);
    expect(order.reference).toMatch(/^ORD-\d{4}-/);
    expect((await c.getCart.execute(owner)).lines).toHaveLength(0);
  });

  it('refuses to place an order for an empty cart', async () => {
    await expect(c.placeOrder.execute(owner)).rejects.toThrow(/empty cart/i);
  });

  it('lists and fetches orders, scoped to the session that placed them', async () => {
    await c.addToCart.execute(owner, 'p-001', 1);
    const order = await c.placeOrder.execute(owner);

    expect(await c.listOrders.execute(owner)).toHaveLength(1);
    expect((await c.getOrder.execute(owner, order.id)).id).toBe(order.id);

    const other = await newGuest(c);
    await expect(c.getOrder.execute(other, order.id)).rejects.toThrow(/No order exists/);
  });

  it('toggles favourites on and off', async () => {
    expect(await c.toggleFavourite.execute(owner, 'p-001')).toEqual({ favourited: true });
    expect(await c.listFavourites.execute(owner)).toHaveLength(1);
    expect(await c.toggleFavourite.execute(owner, 'p-001')).toEqual({ favourited: false });
    expect(await c.listFavourites.execute(owner)).toHaveLength(0);
  });

  it('refuses to favourite a product that does not exist', async () => {
    await expect(c.toggleFavourite.execute(owner, 'nope')).rejects.toThrow(/No product exists/);
  });
});

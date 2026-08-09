import { beforeEach, describe, expect, it } from 'vitest';
import { newContainer, newGuest } from './support';
import type { Container } from '@/src/infrastructure/container';
import { userOwner } from '@/src/domain/owner';
import { cartSubtotal } from '@/src/domain/entities';

/**
 * The reason Owner exists.
 *
 * A shopper browses as a guest, fills a basket, then signs in. If the basket
 * evaporates at that moment the sale is lost — it is the most common bug in
 * hand-rolled e-commerce auth. These tests pin the behaviour down before the
 * accounts feature is built on top of it.
 */
describe('ownership transfer (integration)', () => {
  let c: Container;
  beforeEach(async () => { c = await newContainer(); });

  it('moves a guest basket onto a user', async () => {
    const guest = await newGuest(c);
    const user = userOwner('user-1');

    await c.addToCart.execute(guest, 'p-001', 2);
    await c.transferOwnership.execute(guest, user);

    expect((await c.getCart.execute(user)).lines).toHaveLength(1);
    expect((await c.getCart.execute(guest)).lines).toHaveLength(0);
  });

  it('sums quantities when both owners hold the same product', async () => {
    const guest = await newGuest(c);
    const user = userOwner('user-1');

    await c.addToCart.execute(user, 'p-001', 1);
    await c.addToCart.execute(guest, 'p-001', 2);

    await c.transferOwnership.execute(guest, user);

    const cart = await c.getCart.execute(user);
    expect(cart.lines).toHaveLength(1);
    expect(cart.lines[0]!.quantity).toBe(3); // not 1, and not 2 — both kept
    expect(cartSubtotal(cart).amountMinor).toBe(12900 * 3);
  });

  it('carries favourites and past orders across', async () => {
    const guest = await newGuest(c);
    const user = userOwner('user-1');

    await c.toggleFavourite.execute(guest, 'p-002');
    await c.addToCart.execute(guest, 'p-001', 1);
    const order = await c.placeOrder.execute(guest);

    await c.transferOwnership.execute(guest, user);

    expect(await c.listFavourites.execute(user)).toHaveLength(1);
    expect(await c.listOrders.execute(user)).toHaveLength(1);
    expect((await c.getOrder.execute(user, order.id)).id).toBe(order.id);
    expect(await c.listOrders.execute(guest)).toHaveLength(0);
  });

  it('is a no-op when source and target are the same owner', async () => {
    const guest = await newGuest(c);
    await c.addToCart.execute(guest, 'p-001', 2);

    await c.transferOwnership.execute(guest, guest);

    expect((await c.getCart.execute(guest)).lines[0]!.quantity).toBe(2);
  });

  it('keeps different owners isolated', async () => {
    const a = await newGuest(c);
    const b = userOwner('user-2');
    await c.addToCart.execute(a, 'p-001', 1);
    expect((await c.getCart.execute(b)).lines).toHaveLength(0);
  });
});

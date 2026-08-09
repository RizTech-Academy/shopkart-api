import { beforeEach, describe, expect, it } from 'vitest';
import { movableClock, newContainer, newContainerWithClock, newGuest } from './support';
import type { Container } from '@/src/infrastructure/container';
import { ownerKey, type Owner } from '@/src/domain/owner';

describe('accounts (integration)', () => {
  let c: Container;

  beforeEach(async () => {
    c = await newContainer();
  });

  const register = (email = 'ada@example.com', password = 'correct-horse') =>
    c.registerUser.execute({ email, password, displayName: 'Ada Lovelace' });

  it('registers a shopper and issues a working token', async () => {
    const { user, token } = await register();

    expect(user.email).toBe('ada@example.com');
    expect(token.userId).toBe(user.id);

    const owner = await c.resolveOwner.execute({ bearerToken: token.value, sessionId: null });
    expect(owner).toEqual({ kind: 'user', userId: user.id });
  });

  it('never returns the password or its hash', async () => {
    const { user } = await register();
    expect(JSON.stringify(user)).not.toMatch(/correct-horse|fake:/);
  });

  it('normalises the email so case and padding cannot create a second account', async () => {
    await register('Ada@Example.COM');
    await expect(register('  ada@example.com  ')).rejects.toThrow(/already exists/i);
  });

  it('rejects a password shorter than the minimum', async () => {
    await expect(register('short@example.com', 'sevench')).rejects.toThrow(/at least 8/i);
  });

  it('signs in with the right password', async () => {
    const { user } = await register();
    const result = await c.logIn.execute({ email: 'ada@example.com', password: 'correct-horse' });
    expect(result.user.id).toBe(user.id);
  });

  it('fails identically for a wrong password and an unknown address', async () => {
    await register();

    const wrongPassword = await c.logIn.execute({ email: 'ada@example.com', password: 'nope-nope' }).catch((e) => e);
    const unknownEmail = await c.logIn.execute({ email: 'nobody@example.com', password: 'nope-nope' }).catch((e) => e);

    // Identical messages: a differing one would turn login into a way to
    // discover which addresses have accounts.
    expect(wrongPassword.message).toBe(unknownEmail.message);
    expect(wrongPassword.code).toBe('unauthenticated');
  });

  it('issues a distinct token per sign-in, so signing out of one device leaves the other alone', async () => {
    await register();
    const phone = await c.logIn.execute({ email: 'ada@example.com', password: 'correct-horse' });
    const tablet = await c.logIn.execute({ email: 'ada@example.com', password: 'correct-horse' });
    expect(phone.token.value).not.toBe(tablet.token.value);

    await c.logOut.execute(phone.token.value);

    await expect(c.resolveOwner.execute({ bearerToken: phone.token.value, sessionId: null })).rejects.toThrow(/invalid or has expired/i);
    await expect(c.resolveOwner.execute({ bearerToken: tablet.token.value, sessionId: null })).resolves.toBeDefined();
  });

  it('revoking an already-revoked token succeeds', async () => {
    const { token } = await register();
    await c.logOut.execute(token.value);
    await expect(c.logOut.execute(token.value)).resolves.toBeUndefined();
  });

  it('rejects an unknown token', async () => {
    await expect(c.resolveOwner.execute({ bearerToken: 'not-a-token', sessionId: null })).rejects.toThrow(/invalid or has expired/i);
  });

  it('rejects a token past its expiry', async () => {
    const clock = movableClock();
    const container = await newContainerWithClock(clock);
    const { token } = await container.registerUser.execute({
      email: 'ada@example.com', password: 'correct-horse', displayName: 'Ada',
    });

    clock.advanceDays(29);
    await expect(container.resolveOwner.execute({ bearerToken: token.value, sessionId: null })).resolves.toBeDefined();

    clock.advanceDays(2);
    await expect(container.resolveOwner.execute({ bearerToken: token.value, sessionId: null })).rejects.toThrow(/expired/i);
  });

  it('prefers the token when a session id is sent too', async () => {
    const guest = await newGuest(c);
    const { user, token } = await register();

    const owner = await c.resolveOwner.execute({
      bearerToken: token.value,
      sessionId: guest.kind === 'guest' ? guest.sessionId : null,
    });

    // A signed-in shopper on a shared device must see their own basket.
    expect(owner).toEqual({ kind: 'user', userId: user.id });
  });

  it('refuses to hand a guest a profile', async () => {
    const guest = await newGuest(c);
    await expect(c.getCurrentUser.execute(guest)).rejects.toThrow(/guest/i);
  });

  it('returns the profile for a signed-in shopper', async () => {
    const { user, token } = await register();
    const owner = await c.resolveOwner.execute({ bearerToken: token.value, sessionId: null });
    expect(await c.getCurrentUser.execute(owner)).toEqual(user);
  });
});

describe('guest basket carried into an account (integration)', () => {
  let c: Container;

  beforeEach(async () => {
    c = await newContainer();
  });

  const sessionIdOf = (owner: Owner): string | null => (owner.kind === 'guest' ? owner.sessionId : null);

  it('moves a guest basket onto the new account at registration', async () => {
    const guest = await newGuest(c);
    await c.addToCart.execute(guest, 'p-001', 2);
    await c.toggleFavourite.execute(guest, 'p-002');

    const { user } = await c.registerUser.execute({
      email: 'ada@example.com',
      password: 'correct-horse',
      displayName: 'Ada',
      guestSessionId: sessionIdOf(guest),
    });

    const owner = { kind: 'user', userId: user.id } as const;
    const cart = await c.getCart.execute(owner);
    expect(cart.lines).toHaveLength(1);
    expect(cart.lines[0]?.quantity).toBe(2);
    expect(await c.listFavourites.execute(owner)).toHaveLength(1);

    // And it is gone from the guest, not copied.
    expect((await c.getCart.execute(guest)).lines).toHaveLength(0);
  });

  it('merges quantities when signing in on a device that already had a basket', async () => {
    const first = await newGuest(c);
    await c.addToCart.execute(first, 'p-001', 2);
    const { user } = await c.registerUser.execute({
      email: 'ada@example.com', password: 'correct-horse', displayName: 'Ada',
      guestSessionId: sessionIdOf(first),
    });

    const second = await newGuest(c);
    await c.addToCart.execute(second, 'p-001', 1);
    await c.addToCart.execute(second, 'p-002', 1);

    await c.logIn.execute({
      email: 'ada@example.com', password: 'correct-horse', guestSessionId: sessionIdOf(second),
    });

    const cart = await c.getCart.execute({ kind: 'user', userId: user.id });
    const p001 = cart.lines.find((line) => line.product.id === 'p-001');
    expect(p001?.quantity).toBe(3); // 2 from the account + 1 from this device
    expect(cart.lines).toHaveLength(2);
  });

  it('leaves the account basket alone when no session id is sent', async () => {
    const guest = await newGuest(c);
    await c.addToCart.execute(guest, 'p-001', 2);

    const { user } = await c.registerUser.execute({
      email: 'ada@example.com', password: 'correct-horse', displayName: 'Ada',
    });

    expect((await c.getCart.execute({ kind: 'user', userId: user.id })).lines).toHaveLength(0);
    expect((await c.getCart.execute(guest)).lines).toHaveLength(1);
  });

  it('keys a user basket separately from any guest basket', async () => {
    const guest = await newGuest(c);
    const { user } = await c.registerUser.execute({
      email: 'ada@example.com', password: 'correct-horse', displayName: 'Ada',
    });
    expect(ownerKey(guest)).not.toBe(ownerKey({ kind: 'user', userId: user.id }));
  });

  it('carries order history across, and another shopper still cannot read it', async () => {
    const guest = await newGuest(c);
    await c.addToCart.execute(guest, 'p-001', 1);
    const order = await c.placeOrder.execute(guest);

    const { user } = await c.registerUser.execute({
      email: 'ada@example.com', password: 'correct-horse', displayName: 'Ada',
      guestSessionId: sessionIdOf(guest),
    });

    const owner = { kind: 'user', userId: user.id } as const;
    expect(await c.listOrders.execute(owner)).toHaveLength(1);

    const stranger = await newGuest(c);
    await expect(c.getOrder.execute(stranger, order.id)).rejects.toThrow(/No order exists/);
  });
});

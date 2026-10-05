import { beforeEach, describe, expect, it } from 'vitest';
import type { Client } from '@libsql/client';
import { newGuest, newHarness } from './support';
import type { Container } from '@/src/infrastructure/container';
import { LibSqlUnitOfWork } from '@/src/infrastructure/db/LibSqlUnitOfWork';
import type { RepositoryDependencies } from '@/src/infrastructure/repositories/factory';
import { money } from '@/src/domain/money';
import { guestOwner } from '@/src/domain/owner';
import type { Order } from '@/src/domain/entities';

const countOf = async (db: Client, table: string, where = '1=1') =>
  Number((await db.execute(`SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`)).rows[0]?.n ?? 0);

describe('unit of work (integration)', () => {
  let db: Client;
  let deps: RepositoryDependencies;
  let unitOfWork: LibSqlUnitOfWork;

  beforeEach(async () => {
    ({ db, deps } = await newHarness());
    unitOfWork = new LibSqlUnitOfWork(db, deps);
  });

  const anOrder = (id: string): Order => ({
    id,
    reference: `ORD-2026-${id.toUpperCase()}`,
    owner: guestOwner('s-1'),
    lines: [{ productId: 'p-001', title: 'Headphones', unitPrice: money(12900), quantity: 1 }],
    total: money(12900),
    placedAt: '2026-01-15T10:00:00.000Z',
  });

  it('commits every write when the work succeeds', async () => {
    await unitOfWork.run(async ({ orders, carts }) => {
      await orders.create(anOrder('o-1'));
      await carts.addItem(guestOwner('s-1'), 'p-001', 2);
    });

    expect(await countOf(db, 'orders')).toBe(1);
    expect(await countOf(db, 'order_lines')).toBe(1);
    expect(await countOf(db, 'cart_items')).toBe(1);
  });

  it('discards every write when the work throws', async () => {
    await expect(
      unitOfWork.run(async ({ orders, carts }) => {
        await orders.create(anOrder('o-1'));
        await carts.addItem(guestOwner('s-1'), 'p-001', 2);
        throw new Error('something failed after the order was written');
      }),
    ).rejects.toThrow('something failed after the order was written');

    // The order header, its lines and the basket change all disappear
    // together. Before the unit of work these were separate writes and the
    // first would have survived.
    expect(await countOf(db, 'orders')).toBe(0);
    expect(await countOf(db, 'order_lines')).toBe(0);
    expect(await countOf(db, 'cart_items')).toBe(0);
  });

  it('stays usable after a failed transaction', async () => {
    await expect(unitOfWork.run(async () => { throw new Error('boom') })).rejects.toThrow('boom');

    // A rolled-back transaction must not leave the connection mid-transaction,
    // or every later request fails with "cannot start a transaction within a
    // transaction".
    await unitOfWork.run(({ orders }) => orders.create(anOrder('o-2')));
    expect(await countOf(db, 'orders')).toBe(1);
  });

  it('runs concurrent transactions one at a time rather than interleaving', async () => {
    const owner = guestOwner('s-1');
    await Promise.all([
      unitOfWork.run(({ carts }) => carts.addItem(owner, 'p-001', 1)),
      unitOfWork.run(({ carts }) => carts.addItem(owner, 'p-001', 1)),
      unitOfWork.run(({ carts }) => carts.addItem(owner, 'p-002', 1)),
    ]);

    const rows = await db.execute('SELECT product_id, quantity FROM cart_items ORDER BY product_id');
    expect(rows.rows.map((r) => [String(r.product_id), Number(r.quantity)])).toEqual([['p-001', 2], ['p-002', 1]]);
  });

  it('serialises across separate instances built over the same connection', async () => {
    // What is protected is the connection, not the object. A composition root
    // that accidentally builds the graph twice — easy to do by memoising after
    // an await — must not turn concurrent checkouts into "cannot start a
    // transaction within a transaction".
    const other = new LibSqlUnitOfWork(db, deps);
    const owner = guestOwner('s-1');

    await Promise.all([
      unitOfWork.run(({ carts }) => carts.addItem(owner, 'p-001', 1)),
      other.run(({ carts }) => carts.addItem(owner, 'p-001', 1)),
    ]);

    expect(await countOf(db, 'cart_items', "product_id = 'p-001' AND quantity = 2")).toBe(1);
  });

  it('joins an enclosing transaction instead of opening a second one', async () => {
    // A use case built from others must still commit exactly once. Opening a
    // nested transaction on the same connection would throw outright.
    await unitOfWork.run(async ({ orders }) => {
      await orders.create(anOrder('o-1'));
      await unitOfWork.run(({ carts }) => carts.addItem(guestOwner('s-1'), 'p-001', 1));
    });

    expect(await countOf(db, 'orders')).toBe(1);
    expect(await countOf(db, 'cart_items')).toBe(1);
  });

  it('rolls the joined work back with the enclosing transaction', async () => {
    await expect(
      unitOfWork.run(async ({ orders }) => {
        await orders.create(anOrder('o-1'));
        await unitOfWork.run(({ carts }) => carts.addItem(guestOwner('s-1'), 'p-001', 1));
        throw new Error('outer failed');
      }),
    ).rejects.toThrow('outer failed');

    expect(await countOf(db, 'orders')).toBe(0);
    expect(await countOf(db, 'cart_items')).toBe(0);
  });

  it('still enforces foreign keys after a transaction has run', async () => {
    // PRAGMA foreign_keys is per-connection. Driving the transaction over the
    // client's own connection keeps the pragma set by migration in force;
    // handing the connection away and lazily opening another would silently
    // turn constraint checking off.
    await unitOfWork.run(({ carts }) => carts.addItem(guestOwner('s-1'), 'p-001', 1));

    await expect(
      db.execute({
        sql: 'INSERT INTO cart_items (owner_key, product_id, quantity, added_at) VALUES (?, ?, ?, ?)',
        args: ['guest:s-1', 'no-such-product', 1, '2026-01-15T10:00:00.000Z'],
      }),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/i);
  });
});

describe('checkout atomicity (integration)', () => {
  let c: Container;
  let db: Client;

  beforeEach(async () => {
    ({ db, container: c } = await newHarness());
  });

  it('empties the basket in the same transaction that records the order', async () => {
    const owner = await newGuest(c);
    await c.addToCart.execute(owner, 'p-001', 2);

    await c.placeOrder.execute(owner);

    expect(await countOf(db, 'orders')).toBe(1);
    expect(await countOf(db, 'cart_items')).toBe(0);
  });

  it('cannot buy the same basket twice when two checkouts race', async () => {
    const owner = await newGuest(c);
    await c.addToCart.execute(owner, 'p-001', 2);

    const results = await Promise.allSettled([c.placeOrder.execute(owner), c.placeOrder.execute(owner)]);
    const placed = results.filter((r) => r.status === 'fulfilled');
    const refused = results.filter((r) => r.status === 'rejected');

    // The second checkout waits for the first transaction to finish, then
    // reads the basket it emptied. Without the unit of work serialising them,
    // both would read a full basket and the shopper would pay twice.
    expect(placed).toHaveLength(1);
    expect(refused).toHaveLength(1);
    expect((refused[0] as PromiseRejectedResult).reason.message).toMatch(/empty cart/i);
    expect(await countOf(db, 'orders')).toBe(1);
  });

  it('leaves the basket untouched when checkout is refused', async () => {
    const owner = await newGuest(c);
    await c.addToCart.execute(owner, 'p-001', 1);
    await db.execute("UPDATE products SET in_stock = 0 WHERE id = 'p-001'");

    await expect(c.placeOrder.execute(owner)).rejects.toThrow(/no longer in stock/i);

    expect(await countOf(db, 'orders')).toBe(0);
    expect((await c.getCart.execute(owner)).lines).toHaveLength(1);
  });
});

describe('sign-up atomicity (integration)', () => {
  it('does not leave an account behind when the guest basket cannot be moved', async () => {
    const { db, container } = await newHarness();
    const guest = await newGuest(container);
    await container.addToCart.execute(guest, 'p-001', 1);

    // orders.owner_key has no constraint to violate, so the transfer is made to
    // fail by removing the table it writes to last. Contrived, but it is the
    // honest way to ask "if the second write fails, is the first still there?".
    await db.execute('DROP TABLE orders');

    await expect(
      container.registerUser.execute({
        email: 'ada@example.com',
        password: 'correct-horse',
        displayName: 'Ada',
        guestSessionId: guest.kind === 'guest' ? guest.sessionId : null,
      }),
    ).rejects.toThrow();

    // No half-made account: the user row, the token and the basket move all
    // roll back together.
    expect(await countOf(db, 'users')).toBe(0);
    expect(await countOf(db, 'access_tokens')).toBe(0);
    expect(await countOf(db, 'cart_items', "owner_key = 'guest:" + (guest.kind === 'guest' ? guest.sessionId : '') + "'")).toBe(1);
  });
});

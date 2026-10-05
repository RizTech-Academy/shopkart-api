import { describe, expect, it } from 'vitest';
import { money } from '@/src/domain/money';
import { guestOwner } from '@/src/domain/owner';
import type { Cart, Order, Product } from '@/src/domain/entities';
import { toCartDto, toOrderDto, toProductDto } from '@/src/interface/http/presenters';

const product: Product = {
  id: 'p-001',
  title: 'Headphones',
  description: 'Over-ear',
  category: 'audio',
  price: money(12900),
  imageUrl: 'https://example.com/p-001.jpg',
  rating: { average: 4.6, count: 214 },
  inStock: true,
};

describe('presenters', () => {
  it('keeps the session id out of an order response', () => {
    // The regression this layer exists for: serialising the Order entity put
    // `owner: { kind: 'guest', sessionId }` in the body, handing a shopper's
    // own bearer credential back on every order request.
    const order: Order = {
      id: 'o-1',
      reference: 'ORD-2026-ABC123',
      owner: guestOwner('secret-session-id'),
      lines: [{ productId: 'p-001', title: 'Headphones', unitPrice: money(12900), quantity: 2 }],
      total: money(25800),
      placedAt: '2026-01-15T10:00:00.000Z',
    };

    const dto = toOrderDto(order);

    expect(JSON.stringify(dto)).not.toContain('secret-session-id');
    expect(dto).not.toHaveProperty('owner');
  });

  it('uses one money shape across products, baskets and orders', () => {
    const cart: Cart = { owner: guestOwner('s'), lines: [{ product, quantity: 2 }] };
    const order = toOrderDto({
      id: 'o-1', reference: 'r', owner: guestOwner('s'),
      lines: [{ productId: 'p-001', title: 'Headphones', unitPrice: money(12900), quantity: 2 }],
      total: money(25800), placedAt: '2026-01-15T10:00:00.000Z',
    });

    const expected = { amountMinor: 12900, currency: 'USD' };
    expect(toProductDto(product).price).toEqual(expected);
    expect(toCartDto(cart).lines[0]?.unitPrice).toEqual(expected);
    expect(order.lines[0]?.unitPrice).toEqual(expected);
  });

  it('takes basket totals from the domain rather than recomputing them', () => {
    const cart: Cart = {
      owner: guestOwner('s'),
      lines: [{ product, quantity: 2 }, { product: { ...product, id: 'p-002', price: money(1999) }, quantity: 3 }],
    };

    const dto = toCartDto(cart);

    expect(dto.subtotal).toEqual({ amountMinor: 31797, currency: 'USD' }); // 25800 + 5997
    expect(dto.itemCount).toBe(5);
    expect(dto.lines[0]?.lineTotal).toEqual({ amountMinor: 25800, currency: 'USD' });
  });

  it('tells a client which basket lines went out of stock while they shopped', () => {
    const cart: Cart = { owner: guestOwner('s'), lines: [{ product: { ...product, inStock: false }, quantity: 1 }] };
    expect(toCartDto(cart).lines[0]?.inStock).toBe(false);
  });
});

import { addMinor, money, multiplyMinor, type Money, ZERO } from '@/src/domain/money';
import type { Owner } from '@/src/domain/owner';

export interface Rating {
  readonly average: number;
  readonly count: number;
}

export interface Product {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly category: string;
  readonly price: Money;
  readonly imageUrl: string;
  readonly rating: Rating;
  readonly inStock: boolean;
}

export interface Category {
  readonly slug: string;
  readonly name: string;
  readonly productCount: number;
}

export interface CartLine {
  readonly product: Product;
  readonly quantity: number;
}

export interface Cart {
  readonly owner: Owner;
  readonly lines: readonly CartLine[];
}

export interface OrderLine {
  /** Snapshotted at checkout: an order must not change when a price does. */
  readonly productId: string;
  readonly title: string;
  readonly unitPrice: Money;
  readonly quantity: number;
}

export interface Order {
  readonly id: string;
  readonly reference: string;
  readonly owner: Owner;
  readonly lines: readonly OrderLine[];
  readonly total: Money;
  readonly placedAt: string;
}

export interface Session {
  readonly id: string;
  readonly createdAt: string;
}

// ---- derived values, owned by the domain so every caller agrees ----

export const lineTotal = (line: CartLine): Money => ({
  amountMinor: multiplyMinor(line.product.price.amountMinor, line.quantity),
  currency: line.product.price.currency,
});

export const cartSubtotal = (cart: Cart): Money =>
  cart.lines.reduce<Money>(
    (total, line) => ({ amountMinor: addMinor(total.amountMinor, lineTotal(line).amountMinor), currency: 'USD' }),
    ZERO,
  );

export const cartItemCount = (cart: Cart): number =>
  cart.lines.reduce((count, line) => count + line.quantity, 0);

export const orderTotal = (lines: readonly OrderLine[]): Money =>
  lines.reduce<Money>(
    (total, line) => ({
      amountMinor: addMinor(total.amountMinor, multiplyMinor(line.unitPrice.amountMinor, line.quantity)),
      currency: 'USD',
    }),
    money(0),
  );

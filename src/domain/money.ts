/**
 * Money as integer minor units.
 *
 * Never a float: 0.1 + 0.2 !== 0.3 in binary floating point, and a cart is
 * nothing but repeated addition. Kept as a branded number so a raw number
 * cannot be passed where money is expected.
 */
declare const brand: unique symbol;
export type Minor = number & { readonly [brand]: 'Minor' };

export function minor(value: number): Minor {
  if (!Number.isInteger(value)) throw new TypeError(`Money must be an integer minor unit, got ${value}`);
  if (value < 0) throw new RangeError(`Money cannot be negative, got ${value}`);
  return value as Minor;
}

export function addMinor(a: Minor, b: Minor): Minor {
  return minor(a + b);
}

export function multiplyMinor(amount: Minor, quantity: number): Minor {
  if (!Number.isInteger(quantity) || quantity < 0) {
    throw new RangeError(`Quantity must be a non-negative integer, got ${quantity}`);
  }
  return minor(amount * quantity);
}

export interface Money {
  readonly amountMinor: Minor;
  readonly currency: 'USD';
}

export const money = (amountMinor: number): Money => ({ amountMinor: minor(amountMinor), currency: 'USD' });
export const ZERO: Money = money(0);

import { cartItemCount, cartSubtotal, lineTotal, type Cart, type Category, type Order, type Product, type Session, type User } from '@/src/domain/entities';
import type { Money } from '@/src/domain/money';
import type { Authenticated } from '@/src/application/useCases';

/**
 * Domain entity → wire representation.
 *
 * Every response body is built here, and route handlers may return nothing
 * else. Serialising an entity directly looks like it saves a layer, but it
 * silently makes the JSON contract a mirror of the database model: renaming a
 * field for clarity becomes a breaking change for the Android client, and
 * anything ever added to an entity is published the moment it is added.
 *
 * `Order` is the case that proves it. It holds an `Owner`, and an Owner holds
 * the session id — so `JSON.stringify(order)` handed a shopper's own bearer
 * credential back in the response body of every order request. A DTO cannot
 * make that mistake, because a field has to be written down to be sent.
 */

export interface MoneyDto {
  readonly amountMinor: number;
  readonly currency: 'USD';
}

/**
 * One money shape everywhere.
 *
 * The catalogue used to send `price: { amountMinor, currency }` while the
 * basket sent `unitPrice: 12900` and `subtotalMinor`, which forces a client to
 * model the same concept three ways and to decide, per field, whether a bare
 * integer is dollars or cents. Currency travelling with the amount also means
 * a second currency later is an added value, not a new field.
 */
const toMoney = (money: Money): MoneyDto => ({ amountMinor: money.amountMinor, currency: money.currency });

export interface ProductDto {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly category: string;
  readonly price: MoneyDto;
  readonly imageUrl: string;
  readonly rating: { readonly average: number; readonly count: number };
  readonly inStock: boolean;
}

export const toProductDto = (product: Product): ProductDto => ({
  id: product.id,
  title: product.title,
  description: product.description,
  category: product.category,
  price: toMoney(product.price),
  imageUrl: product.imageUrl,
  rating: { average: product.rating.average, count: product.rating.count },
  inStock: product.inStock,
});

export interface CategoryDto {
  readonly slug: string;
  readonly name: string;
  readonly productCount: number;
}

export const toCategoryDto = (category: Category): CategoryDto => ({
  slug: category.slug,
  name: category.name,
  productCount: category.productCount,
});

export interface CartLineDto {
  readonly productId: string;
  readonly title: string;
  readonly imageUrl: string;
  readonly inStock: boolean;
  readonly unitPrice: MoneyDto;
  readonly quantity: number;
  readonly lineTotal: MoneyDto;
}

export interface CartDto {
  readonly lines: readonly CartLineDto[];
  readonly itemCount: number;
  readonly subtotal: MoneyDto;
}

/**
 * Totals come from the domain, never recomputed here.
 *
 * A presenter that multiplied price by quantity itself would be a second
 * implementation of the arithmetic, free to disagree with the one checkout
 * uses — which is the bug where a basket and its receipt show different money.
 */
export const toCartDto = (cart: Cart): CartDto => ({
  lines: cart.lines.map((line) => ({
    productId: line.product.id,
    title: line.product.title,
    imageUrl: line.product.imageUrl,
    inStock: line.product.inStock,
    unitPrice: toMoney(line.product.price),
    quantity: line.quantity,
    lineTotal: toMoney(lineTotal(line)),
  })),
  itemCount: cartItemCount(cart),
  subtotal: toMoney(cartSubtotal(cart)),
});

export interface OrderLineDto {
  readonly productId: string;
  readonly title: string;
  readonly unitPrice: MoneyDto;
  readonly quantity: number;
  readonly lineTotal: MoneyDto;
}

export interface OrderDto {
  readonly id: string;
  readonly reference: string;
  readonly lines: readonly OrderLineDto[];
  readonly itemCount: number;
  readonly total: MoneyDto;
  readonly placedAt: string;
}

/** Note the absent `owner`: who an order belongs to is decided by the request, not disclosed by the response. */
export const toOrderDto = (order: Order): OrderDto => ({
  id: order.id,
  reference: order.reference,
  lines: order.lines.map((line) => ({
    productId: line.productId,
    title: line.title,
    unitPrice: toMoney(line.unitPrice),
    quantity: line.quantity,
    lineTotal: { amountMinor: line.unitPrice.amountMinor * line.quantity, currency: line.unitPrice.currency },
  })),
  itemCount: order.lines.reduce((count, line) => count + line.quantity, 0),
  total: toMoney(order.total),
  placedAt: order.placedAt,
});

export interface SessionDto {
  readonly id: string;
  readonly createdAt: string;
}

export const toSessionDto = (session: Session): SessionDto => ({ id: session.id, createdAt: session.createdAt });

export interface UserDto {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
  readonly createdAt: string;
}

export const toUserDto = (user: User): UserDto => ({
  id: user.id,
  email: user.email,
  displayName: user.displayName,
  createdAt: user.createdAt,
});

export interface AuthenticatedDto {
  readonly user: UserDto;
  readonly accessToken: string;
  readonly expiresAt: string;
}

/** The one response that deliberately contains a credential — it is the only place a client can obtain it. */
export const toAuthenticatedDto = (result: Authenticated): AuthenticatedDto => ({
  user: toUserDto(result.user),
  accessToken: result.token.value,
  expiresAt: result.token.expiresAt,
});

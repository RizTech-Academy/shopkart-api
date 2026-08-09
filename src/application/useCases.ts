import { cartSubtotal, orderTotal, type Cart, type Category, type Order, type Product, type Session } from '@/src/domain/entities';
import { NotFoundError, ValidationError } from '@/src/domain/errors';
import type {
  CartRepository, CatalogueQueries, Clock, FavouriteRepository, IdGenerator, OrderRepository,
  OwnershipTransfer, Page, ProductQuery, SessionRepository,
} from '@/src/domain/ports';
import { guestOwner, type Owner } from '@/src/domain/owner';

/**
 * Application layer.
 *
 * Each use case is one operation with one reason to change. They depend only
 * on the port interfaces from the domain, never on libSQL or Next.js, so every
 * one of them can be exercised against an in-memory database — or a fake — with
 * no HTTP involved.
 */

// ---------- catalogue ----------

export class ListProducts {
  constructor(private readonly catalogue: CatalogueQueries) {}
  execute(query: ProductQuery): Promise<Page<Product>> {
    return this.catalogue.find(query);
  }
}

export class GetProduct {
  constructor(private readonly catalogue: CatalogueQueries) {}
  async execute(id: string): Promise<Product> {
    const product = await this.catalogue.findById(id);
    if (!product) throw new NotFoundError('product', id);
    return product;
  }
}

export class ListCategories {
  constructor(private readonly catalogue: CatalogueQueries) {}
  execute(): Promise<readonly Category[]> {
    return this.catalogue.listCategories();
  }
}

// ---------- sessions ----------

export class CreateSession {
  constructor(private readonly sessions: SessionRepository) {}
  execute(): Promise<Session> {
    return this.sessions.create();
  }
}

/**
 * Turns whatever the transport supplied into the domain's Owner.
 *
 * The single place a session id becomes ownership, which is what keeps every
 * other use case ignorant of how a shopper was identified. When accounts
 * arrive this gains a token branch and nothing downstream changes.
 */
export class ResolveOwner {
  constructor(private readonly sessions: SessionRepository) {}

  async execute(sessionId: string | null): Promise<Owner> {
    if (!sessionId) {
      throw new ValidationError('A session id is required. Create one with POST /api/sessions.');
    }
    const session = await this.sessions.findById(sessionId);
    if (!session) throw new NotFoundError('session', sessionId);
    return guestOwner(session.id);
  }
}

/**
 * Moves everything one shopper owns onto another.
 *
 * Exists so "sign in and keep the basket you built as a guest" is a domain
 * operation on two Owners rather than SQL hidden inside a repository.
 */
export class TransferOwnership {
  constructor(private readonly transfer: OwnershipTransfer) {}
  execute(from: Owner, to: Owner): Promise<void> {
    return this.transfer.transferAll(from, to);
  }
}

// ---------- cart ----------

export interface CartView {
  readonly lines: readonly { productId: string; title: string; imageUrl: string; unitPrice: number; quantity: number; lineTotal: number }[];
  readonly itemCount: number;
  readonly subtotalMinor: number;
  readonly currency: 'USD';
}

export const toCartView = (cart: Cart): CartView => ({
  lines: cart.lines.map((line) => ({
    productId: line.product.id,
    title: line.product.title,
    imageUrl: line.product.imageUrl,
    unitPrice: line.product.price.amountMinor,
    quantity: line.quantity,
    lineTotal: line.product.price.amountMinor * line.quantity,
  })),
  itemCount: cart.lines.reduce((n, l) => n + l.quantity, 0),
  subtotalMinor: cartSubtotal(cart).amountMinor,
  currency: 'USD',
});

export class GetCart {
  constructor(private readonly carts: CartRepository) {}
  execute(owner: Owner): Promise<Cart> {
    return this.carts.get(owner);
  }
}

export class AddToCart {
  constructor(
    private readonly carts: CartRepository,
    private readonly catalogue: CatalogueQueries,
  ) {}

  /** Out-of-stock is rejected here so no route can bypass the rule. */
  async execute(owner: Owner, productId: string, quantity: number): Promise<Cart> {
    if (!Number.isInteger(quantity) || quantity < 1) {
      throw new ValidationError(`Quantity must be a positive integer, got ${quantity}.`);
    }
    const product = await this.catalogue.findById(productId);
    if (!product) throw new NotFoundError('product', productId);
    if (!product.inStock) throw new ValidationError(`"${product.title}" is out of stock.`);

    await this.carts.addItem(owner, productId, quantity);
    return this.carts.get(owner);
  }
}

export class UpdateCartQuantity {
  constructor(private readonly carts: CartRepository) {}
  /** Zero means remove — encoded once so every caller behaves identically. */
  async execute(owner: Owner, productId: string, quantity: number): Promise<Cart> {
    if (!Number.isInteger(quantity) || quantity < 0) {
      throw new ValidationError(`Quantity must be a non-negative integer, got ${quantity}.`);
    }
    if (quantity === 0) await this.carts.removeItem(owner, productId);
    else await this.carts.setQuantity(owner, productId, quantity);
    return this.carts.get(owner);
  }
}

export class RemoveFromCart {
  constructor(private readonly carts: CartRepository) {}
  async execute(owner: Owner, productId: string): Promise<Cart> {
    await this.carts.removeItem(owner, productId);
    return this.carts.get(owner);
  }
}

export class ClearCart {
  constructor(private readonly carts: CartRepository) {}
  async execute(owner: Owner): Promise<Cart> {
    await this.carts.clear(owner);
    return this.carts.get(owner);
  }
}

// ---------- favourites ----------

export class ListFavourites {
  constructor(private readonly favourites: FavouriteRepository) {}
  execute(owner: Owner): Promise<readonly Product[]> {
    return this.favourites.list(owner);
  }
}

export class ToggleFavourite {
  constructor(
    private readonly favourites: FavouriteRepository,
    private readonly catalogue: CatalogueQueries,
  ) {}
  async execute(owner: Owner, productId: string): Promise<{ favourited: boolean }> {
    if (!(await this.catalogue.findById(productId))) throw new NotFoundError('product', productId);
    return this.favourites.toggle(owner, productId);
  }
}

// ---------- orders ----------

export class PlaceOrder {
  constructor(
    private readonly orders: OrderRepository,
    private readonly carts: CartRepository,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  /**
   * Snapshots prices onto the order, writes it, then empties the cart.
   *
   * Emptying is part of placing rather than a separate call a route has to
   * remember: an order that left the cart populated would let a customer buy
   * the same basket twice.
   */
  async execute(owner: Owner): Promise<Order> {
    const cart = await this.carts.get(owner);
    if (cart.lines.length === 0) throw new ValidationError('Cannot place an order with an empty cart.');

    const outOfStock = cart.lines.filter((line) => !line.product.inStock);
    if (outOfStock.length > 0) {
      throw new ValidationError(
        `These items are no longer in stock: ${outOfStock.map((l) => l.product.title).join(', ')}.`,
      );
    }

    const lines = cart.lines.map((line) => ({
      productId: line.product.id,
      title: line.product.title,
      unitPrice: line.product.price,
      quantity: line.quantity,
    }));

    const now = this.clock.now();
    const order: Order = {
      id: this.ids.newId(),
      reference: `ORD-${now.getFullYear()}-${this.ids.newId().slice(0, 6).toUpperCase()}`,
      owner,
      lines,
      total: orderTotal(lines),
      placedAt: now.toISOString(),
    };

    const created = await this.orders.create(order);
    await this.carts.clear(owner);
    return created;
  }
}

export class ListOrders {
  constructor(private readonly orders: OrderRepository) {}
  execute(owner: Owner): Promise<readonly Order[]> {
    return this.orders.listFor(owner);
  }
}

export class GetOrder {
  constructor(private readonly orders: OrderRepository) {}
  async execute(owner: Owner, orderId: string): Promise<Order> {
    const order = await this.orders.findFor(owner, orderId);
    if (!order) throw new NotFoundError('order', orderId);
    return order;
  }
}

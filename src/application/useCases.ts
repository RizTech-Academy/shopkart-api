import { orderTotal, type AccessToken, type Cart, type Category, type Order, type Product, type Session, type User } from '@/src/domain/entities';
import { AuthenticationError, ConflictError, NotFoundError, ValidationError } from '@/src/domain/errors';
import type {
  AccessTokenRepository, CartRepository, CatalogueQueries, Clock, FavouriteRepository, IdGenerator,
  OrderRepository, OwnershipTransfer, Page, PasswordHasher, ProductQuery, SessionRepository, UserRepository,
} from '@/src/domain/ports';
import { guestOwner, userOwner, type Owner } from '@/src/domain/owner';

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
 * Whatever the transport managed to collect about who is calling.
 *
 * Deliberately not a `Request`: the application layer must not learn what a
 * header is. The HTTP layer extracts these two strings; a CLI or a test
 * supplies them directly.
 */
export interface PresentedCredentials {
  readonly bearerToken: string | null;
  readonly sessionId: string | null;
}

/**
 * Turns whatever the transport supplied into the domain's Owner.
 *
 * The single place a credential becomes ownership, which is what keeps every
 * other use case ignorant of how a shopper was identified. This is the token
 * branch the Owner type was designed for — note that adding it changed nothing
 * downstream: not one cart, favourite or order use case knows accounts now
 * exist.
 *
 * A token beats a session when both are sent. That ordering is a rule, not an
 * accident: a signed-in shopper on a shared device must see their own basket,
 * never the one the device was carrying.
 */
export class ResolveOwner {
  constructor(
    private readonly sessions: SessionRepository,
    private readonly tokens: AccessTokenRepository,
  ) {}

  async execute(credentials: PresentedCredentials): Promise<Owner> {
    if (credentials.bearerToken) {
      const userId = await this.tokens.findUserId(credentials.bearerToken);
      if (!userId) throw new AuthenticationError('That access token is invalid or has expired. Sign in again.');
      return userOwner(userId);
    }

    if (credentials.sessionId) {
      const session = await this.sessions.findById(credentials.sessionId);
      if (!session) throw new NotFoundError('session', credentials.sessionId);
      return guestOwner(session.id);
    }

    throw new AuthenticationError(
      'A session id or access token is required. Create a session with POST /api/sessions, or sign in at POST /api/auth/login.',
    );
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

// ---------- accounts ----------

export interface Authenticated {
  readonly user: User;
  readonly token: AccessToken;
}

/** Short enough to type, long enough to be worth hashing. */
export const MIN_PASSWORD_LENGTH = 8;

/**
 * Enforced here rather than in the request schema so the rule holds for every
 * caller. A zod schema can only guarantee the shape of one endpoint's body.
 */
function assertUsablePassword(password: string): void {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new ValidationError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
}

/** Addresses are compared case-insensitively, so one canonical form is stored. */
const normaliseEmail = (email: string): string => email.trim().toLowerCase();

/**
 * Carries the basket a shopper built before they had an account.
 *
 * Signing up or in with items already in a guest basket must not lose them.
 * Expressed as a transfer between two Owners — the mechanism the Owner type
 * was introduced for — rather than as SQL that knows about sessions.
 */
async function adoptGuestBelongings(
  transfer: OwnershipTransfer,
  guestSessionId: string | null,
  user: User,
): Promise<void> {
  if (!guestSessionId) return;
  await transfer.transferAll(guestOwner(guestSessionId), userOwner(user.id));
}

export class RegisterUser {
  constructor(
    private readonly users: UserRepository,
    private readonly passwords: PasswordHasher,
    private readonly tokens: AccessTokenRepository,
    private readonly transfer: OwnershipTransfer,
  ) {}

  async execute(input: {
    email: string;
    password: string;
    displayName: string;
    guestSessionId?: string | null;
  }): Promise<Authenticated> {
    assertUsablePassword(input.password);
    const email = normaliseEmail(input.email);

    if (await this.users.findByEmail(email)) {
      throw new ConflictError(`An account already exists for ${email}.`);
    }

    const user = await this.users.create({
      email,
      displayName: input.displayName.trim(),
      passwordHash: await this.passwords.hash(input.password),
    });

    await adoptGuestBelongings(this.transfer, input.guestSessionId ?? null, user);
    return { user, token: await this.tokens.issue(user.id) };
  }
}

export class LogIn {
  constructor(
    private readonly users: UserRepository,
    private readonly passwords: PasswordHasher,
    private readonly tokens: AccessTokenRepository,
    private readonly transfer: OwnershipTransfer,
  ) {}

  /**
   * An unknown address and a wrong password fail identically, and both still
   * run the hash comparison. Returning "no such account" early would turn this
   * endpoint into a way to discover who has one, and answering faster for an
   * unknown address leaks the same fact through timing.
   */
  async execute(input: {
    email: string;
    password: string;
    guestSessionId?: string | null;
  }): Promise<Authenticated> {
    const found = await this.users.findByEmail(normaliseEmail(input.email));
    const matches = await this.passwords.verify(input.password, found?.passwordHash ?? '');
    if (!found || !matches) throw new AuthenticationError('Email or password is incorrect.');

    await adoptGuestBelongings(this.transfer, input.guestSessionId ?? null, found.user);
    return { user: found.user, token: await this.tokens.issue(found.user.id) };
  }
}

export class LogOut {
  constructor(private readonly tokens: AccessTokenRepository) {}
  /** Idempotent: revoking an already-revoked token is a success, not an error. */
  execute(token: string): Promise<void> {
    return this.tokens.revoke(token);
  }
}

export class GetCurrentUser {
  constructor(private readonly users: UserRepository) {}

  /**
   * Takes an Owner, so it states in its signature that a guest has no profile
   * to return — rather than accepting a user id a caller had to dig out first.
   */
  async execute(owner: Owner): Promise<User> {
    if (owner.kind !== 'user') {
      throw new AuthenticationError('You are browsing as a guest. Sign in to see your account.');
    }
    const user = await this.users.findById(owner.userId);
    if (!user) throw new NotFoundError('user', owner.userId);
    return user;
  }
}

// ---------- cart ----------

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

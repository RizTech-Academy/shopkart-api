import type { AccessToken, Cart, Category, Order, Product, Session, User, UserCredentials } from '@/src/domain/entities';
import type { Owner } from '@/src/domain/owner';

/**
 * Ports — declared by the domain, implemented in `infrastructure/`.
 *
 * Kept deliberately narrow. A port should describe one capability so an
 * implementor is never forced to supply methods it has no business owning.
 * That is why reading the catalogue, mutating a basket, and moving ownership
 * between shoppers are three interfaces rather than one fat repository.
 */

export type SortOption = 'relevance' | 'price_asc' | 'price_desc' | 'rating_desc' | 'title_asc';

export interface ProductQuery {
  readonly search?: string;
  readonly category?: string;
  readonly sort: SortOption;
  readonly page: number;
  readonly pageSize: number;
}

export interface Page<T> {
  readonly items: readonly T[];
  readonly page: number;
  readonly pageSize: number;
  readonly totalItems: number;
  readonly totalPages: number;
}

/** Read-only catalogue access. Nothing here mutates, so nothing here may. */
export interface CatalogueQueries {
  find(query: ProductQuery): Promise<Page<Product>>;
  findById(id: string): Promise<Product | null>;
  listCategories(): Promise<readonly Category[]>;
}

export interface CartRepository {
  get(owner: Owner): Promise<Cart>;
  addItem(owner: Owner, productId: string, quantity: number): Promise<void>;
  setQuantity(owner: Owner, productId: string, quantity: number): Promise<void>;
  removeItem(owner: Owner, productId: string): Promise<void>;
  clear(owner: Owner): Promise<void>;
}

export interface FavouriteRepository {
  list(owner: Owner): Promise<readonly Product[]>;
  toggle(owner: Owner, productId: string): Promise<{ readonly favourited: boolean }>;
}

export interface OrderRepository {
  create(order: Order): Promise<Order>;
  listFor(owner: Owner): Promise<readonly Order[]>;
  findFor(owner: Owner, orderId: string): Promise<Order | null>;
}

/**
 * Moves everything one shopper owns onto another.
 *
 * A single-method interface on purpose: it is what lets "sign in and keep your
 * guest basket" be expressed without any repository needing to know about the
 * others.
 */
export interface OwnershipTransfer {
  transferAll(from: Owner, to: Owner): Promise<void>;
}

/** Identifies a guest device. Authentication only — never ownership. */
export interface SessionRepository {
  create(): Promise<Session>;
  findById(id: string): Promise<Session | null>;
}

export interface NewUser {
  readonly email: string;
  readonly displayName: string;
  readonly passwordHash: string;
}

export interface UserRepository {
  create(user: NewUser): Promise<User>;
  findById(id: string): Promise<User | null>;
  /** Returns the hash alongside the user: verifying a password needs both. */
  findByEmail(email: string): Promise<UserCredentials | null>;
}

/**
 * Turns a password into something safe to store, and checks one against it.
 *
 * A port rather than a direct call to `node:crypto` for the reason the whole
 * layer exists: the domain states *that* passwords are hashed and verified,
 * and infrastructure decides with what. Swapping scrypt for argon2 — or for a
 * fast fake in tests, where a real KDF would dominate the runtime — touches
 * one adapter.
 */
export interface PasswordHasher {
  hash(plaintext: string): Promise<string>;
  verify(plaintext: string, hash: string): Promise<boolean>;
}

/**
 * Issues and redeems bearer tokens.
 *
 * Tokens are opaque and stored, not signed. A signed token cannot be revoked
 * without keeping a denylist — which is the same table, arrived at by a longer
 * route — and this API has no need to validate a token without touching the
 * database. Logging out therefore actually invalidates the token.
 */
export interface AccessTokenRepository {
  issue(userId: string): Promise<AccessToken>;
  /** Null when unknown *or* expired: a caller must not have to check the clock. */
  findUserId(token: string): Promise<string | null>;
  revoke(token: string): Promise<void>;
}

export interface Clock { now(): Date }
export interface IdGenerator { newId(): string }

/**
 * Separate from IdGenerator because the requirements differ: an id needs to be
 * unique, a token needs to be unguessable. Conflating them is how a UUID ends
 * up being used as a credential.
 */
export interface TokenGenerator { newToken(): string }

import type { Cart, Category, Order, Product, Session } from '@/src/domain/entities';
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

export interface Clock { now(): Date }
export interface IdGenerator { newId(): string }

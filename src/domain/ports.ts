import type { Cart, Category, Order, Product, Session } from '@/src/domain/entities';

/**
 * Ports.
 *
 * Declared by the domain and implemented in `infrastructure/`. Use cases
 * depend on these interfaces, never on libSQL — which is the dependency
 * inversion that lets every use case be tested against an in-memory fake and
 * lets the datastore be replaced without touching a single business rule.
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

export interface ProductRepository {
  find(query: ProductQuery): Promise<Page<Product>>;
  findById(id: string): Promise<Product | null>;
  findManyByIds(ids: readonly string[]): Promise<readonly Product[]>;
  listCategories(): Promise<readonly Category[]>;
}

export interface SessionRepository {
  create(): Promise<Session>;
  findById(id: string): Promise<Session | null>;
}

export interface CartRepository {
  get(sessionId: string): Promise<Cart>;
  addItem(sessionId: string, productId: string, quantity: number): Promise<void>;
  setQuantity(sessionId: string, productId: string, quantity: number): Promise<void>;
  removeItem(sessionId: string, productId: string): Promise<void>;
  clear(sessionId: string): Promise<void>;
}

export interface FavouriteRepository {
  list(sessionId: string): Promise<readonly Product[]>;
  toggle(sessionId: string, productId: string): Promise<{ readonly favourited: boolean }>;
}

export interface OrderRepository {
  create(order: Order): Promise<Order>;
  listBySession(sessionId: string): Promise<readonly Order[]>;
  findById(sessionId: string, orderId: string): Promise<Order | null>;
}

/** Generates ids and timestamps. Injected so tests can be deterministic. */
export interface Clock {
  now(): Date;
}

export interface IdGenerator {
  newId(): string;
}

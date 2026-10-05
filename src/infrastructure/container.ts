import { randomBytes, randomUUID } from 'node:crypto';
import { getDatabase } from '@/src/infrastructure/db/client';
import { LibSqlUnitOfWork } from '@/src/infrastructure/db/LibSqlUnitOfWork';
import { createRepositories } from '@/src/infrastructure/repositories/factory';
import { ScryptPasswordHasher } from '@/src/infrastructure/security/ScryptPasswordHasher';
import type { Client } from '@libsql/client';
import type { Clock, IdGenerator, PasswordHasher, TokenGenerator } from '@/src/domain/ports';
import * as uc from '@/src/application/useCases';

export const systemClock: Clock = { now: () => new Date() };
export const uuidGenerator: IdGenerator = { newId: () => randomUUID() };

/**
 * 256 bits from the CSPRNG, base64url so it survives a header untouched.
 *
 * Not `randomUUID`: a v4 UUID carries 122 bits and its purpose is uniqueness,
 * which is a weaker requirement than being unguessable.
 */
export const secureTokenGenerator: TokenGenerator = { newToken: () => randomBytes(32).toString('base64url') };

/**
 * Composition root.
 *
 * The only place concrete implementations are chosen. Everything else receives
 * its collaborators through a constructor, which is what makes the whole graph
 * substitutable in tests — `buildContainer` is called there with an in-memory
 * database and a fixed clock.
 */
export interface ContainerOptions {
  readonly clock?: Clock;
  readonly ids?: IdGenerator;
  readonly tokens?: TokenGenerator;
  /** Overridden in tests: a real KDF is deliberately slow, which is the point of it. */
  readonly passwords?: PasswordHasher;
}

export function buildContainer(db: Client, options: ContainerOptions = {}) {
  const passwords = options.passwords ?? new ScryptPasswordHasher();
  const deps = {
    clock: options.clock ?? systemClock,
    ids: options.ids ?? uuidGenerator,
    tokens: options.tokens ?? secureTokenGenerator,
  };
  const { clock, ids } = deps;

  // Two graphs from one factory: these repositories run outside a transaction,
  // and the unit of work builds an identical set inside one when a use case
  // needs several writes to land together.
  const { catalogue, sessions, carts, favourites, users, accessTokens, orders } = createRepositories(db, deps);
  const unitOfWork = new LibSqlUnitOfWork(db, deps);

  return {
    listProducts: new uc.ListProducts(catalogue),
    getProduct: new uc.GetProduct(catalogue),
    listCategories: new uc.ListCategories(catalogue),
    createSession: new uc.CreateSession(sessions),
    resolveOwner: new uc.ResolveOwner(sessions, accessTokens),
    registerUser: new uc.RegisterUser(passwords, unitOfWork),
    logIn: new uc.LogIn(users, passwords, unitOfWork),
    logOut: new uc.LogOut(accessTokens),
    getCurrentUser: new uc.GetCurrentUser(users),
    getCart: new uc.GetCart(carts),
    addToCart: new uc.AddToCart(carts, catalogue),
    updateCartQuantity: new uc.UpdateCartQuantity(carts),
    removeFromCart: new uc.RemoveFromCart(carts),
    clearCart: new uc.ClearCart(carts),
    listFavourites: new uc.ListFavourites(favourites),
    toggleFavourite: new uc.ToggleFavourite(favourites, catalogue),
    placeOrder: new uc.PlaceOrder(unitOfWork, ids, clock),
    listOrders: new uc.ListOrders(orders),
    getOrder: new uc.GetOrder(orders),
  };
}

export type Container = ReturnType<typeof buildContainer>;

let container: Promise<Container> | undefined;

/**
 * Lazily built for route handlers; tests build their own instead.
 *
 * The *promise* is memoised, not the container. Assigning after an await —
 * `container ??= buildContainer(await getDatabase())` — looks equivalent but
 * is not: two requests arriving together both find it unset, both await, and
 * both build one. Caching the promise means the assignment happens before
 * anything yields, so concurrent callers share the same in-flight build.
 */
export function getContainer(): Promise<Container> {
  container ??= getDatabase().then((db) => buildContainer(db));
  return container;
}

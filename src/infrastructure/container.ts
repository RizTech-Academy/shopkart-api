import { randomBytes, randomUUID } from 'node:crypto';
import { getDatabase } from '@/src/infrastructure/db/client';
import { LibSqlAccessTokenRepository } from '@/src/infrastructure/repositories/LibSqlAccessTokenRepository';
import { LibSqlCartRepository } from '@/src/infrastructure/repositories/LibSqlCartRepository';
import { LibSqlFavouriteRepository } from '@/src/infrastructure/repositories/LibSqlFavouriteRepository';
import { LibSqlOrderRepository } from '@/src/infrastructure/repositories/LibSqlOrderRepository';
import { LibSqlCatalogueQueries } from '@/src/infrastructure/repositories/LibSqlCatalogueQueries';
import { LibSqlOwnershipTransfer } from '@/src/infrastructure/repositories/LibSqlOwnershipTransfer';
import { LibSqlSessionRepository } from '@/src/infrastructure/repositories/LibSqlSessionRepository';
import { LibSqlUserRepository } from '@/src/infrastructure/repositories/LibSqlUserRepository';
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
  const clock = options.clock ?? systemClock;
  const ids = options.ids ?? uuidGenerator;
  const tokenGenerator = options.tokens ?? secureTokenGenerator;
  const passwords = options.passwords ?? new ScryptPasswordHasher();

  const catalogue = new LibSqlCatalogueQueries(db);
  const sessions = new LibSqlSessionRepository(db, ids, clock);
  const carts = new LibSqlCartRepository(db, clock);
  const favourites = new LibSqlFavouriteRepository(db, clock);
  const orders = new LibSqlOrderRepository(db);
  const ownership = new LibSqlOwnershipTransfer(db);
  const users = new LibSqlUserRepository(db, ids, clock);
  const accessTokens = new LibSqlAccessTokenRepository(db, tokenGenerator, clock);

  return {
    listProducts: new uc.ListProducts(catalogue),
    getProduct: new uc.GetProduct(catalogue),
    listCategories: new uc.ListCategories(catalogue),
    createSession: new uc.CreateSession(sessions),
    resolveOwner: new uc.ResolveOwner(sessions, accessTokens),
    transferOwnership: new uc.TransferOwnership(ownership),
    registerUser: new uc.RegisterUser(users, passwords, accessTokens, ownership),
    logIn: new uc.LogIn(users, passwords, accessTokens, ownership),
    logOut: new uc.LogOut(accessTokens),
    getCurrentUser: new uc.GetCurrentUser(users),
    getCart: new uc.GetCart(carts),
    addToCart: new uc.AddToCart(carts, catalogue),
    updateCartQuantity: new uc.UpdateCartQuantity(carts),
    removeFromCart: new uc.RemoveFromCart(carts),
    clearCart: new uc.ClearCart(carts),
    listFavourites: new uc.ListFavourites(favourites),
    toggleFavourite: new uc.ToggleFavourite(favourites, catalogue),
    placeOrder: new uc.PlaceOrder(orders, carts, ids, clock),
    listOrders: new uc.ListOrders(orders),
    getOrder: new uc.GetOrder(orders),
  };
}

export type Container = ReturnType<typeof buildContainer>;

let container: Container | undefined;

/** Lazily built for route handlers; tests build their own instead. */
export async function getContainer(): Promise<Container> {
  container ??= buildContainer(await getDatabase());
  return container;
}

import { randomUUID } from 'node:crypto';
import { getDatabase } from '@/src/infrastructure/db/client';
import { LibSqlCartRepository } from '@/src/infrastructure/repositories/LibSqlCartRepository';
import { LibSqlFavouriteRepository } from '@/src/infrastructure/repositories/LibSqlFavouriteRepository';
import { LibSqlOrderRepository } from '@/src/infrastructure/repositories/LibSqlOrderRepository';
import { LibSqlProductRepository } from '@/src/infrastructure/repositories/LibSqlProductRepository';
import { LibSqlSessionRepository } from '@/src/infrastructure/repositories/LibSqlSessionRepository';
import type { Client } from '@libsql/client';
import type { Clock, IdGenerator } from '@/src/domain/ports';
import * as uc from '@/src/application/useCases';

export const systemClock: Clock = { now: () => new Date() };
export const uuidGenerator: IdGenerator = { newId: () => randomUUID() };

/**
 * Composition root.
 *
 * The only place concrete implementations are chosen. Everything else receives
 * its collaborators through a constructor, which is what makes the whole graph
 * substitutable in tests — `buildContainer` is called there with an in-memory
 * database and a fixed clock.
 */
export function buildContainer(db: Client, clock: Clock = systemClock, ids: IdGenerator = uuidGenerator) {
  const products = new LibSqlProductRepository(db);
  const sessions = new LibSqlSessionRepository(db, ids, clock);
  const carts = new LibSqlCartRepository(db, clock);
  const favourites = new LibSqlFavouriteRepository(db, clock);
  const orders = new LibSqlOrderRepository(db);

  return {
    listProducts: new uc.ListProducts(products),
    getProduct: new uc.GetProduct(products),
    listCategories: new uc.ListCategories(products),
    createSession: new uc.CreateSession(sessions),
    requireSession: new uc.RequireSession(sessions),
    getCart: new uc.GetCart(carts),
    addToCart: new uc.AddToCart(carts, products),
    updateCartQuantity: new uc.UpdateCartQuantity(carts),
    removeFromCart: new uc.RemoveFromCart(carts),
    clearCart: new uc.ClearCart(carts),
    listFavourites: new uc.ListFavourites(favourites),
    toggleFavourite: new uc.ToggleFavourite(favourites, products),
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

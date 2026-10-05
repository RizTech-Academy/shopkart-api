import type { Clock, IdGenerator, TokenGenerator } from '@/src/domain/ports';
import type { SqlExecutor } from '@/src/infrastructure/db/executor';
import { LibSqlAccessTokenRepository } from '@/src/infrastructure/repositories/LibSqlAccessTokenRepository';
import { LibSqlCartRepository } from '@/src/infrastructure/repositories/LibSqlCartRepository';
import { LibSqlCatalogueQueries } from '@/src/infrastructure/repositories/LibSqlCatalogueQueries';
import { LibSqlFavouriteRepository } from '@/src/infrastructure/repositories/LibSqlFavouriteRepository';
import { LibSqlOrderRepository } from '@/src/infrastructure/repositories/LibSqlOrderRepository';
import { LibSqlOwnershipTransfer } from '@/src/infrastructure/repositories/LibSqlOwnershipTransfer';
import { LibSqlSessionRepository } from '@/src/infrastructure/repositories/LibSqlSessionRepository';
import { LibSqlUserRepository } from '@/src/infrastructure/repositories/LibSqlUserRepository';

export interface RepositoryDependencies {
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly tokens: TokenGenerator;
}

/**
 * Builds the repository set against whatever executor it is given.
 *
 * One function, called twice: once by the composition root with the client,
 * and once per transaction by the unit of work. That is the point — if the two
 * graphs were assembled separately they could drift, and a repository wired
 * differently inside a transaction than outside is the kind of bug that only
 * shows up under load.
 */
export function createRepositories(sql: SqlExecutor, deps: RepositoryDependencies) {
  return {
    catalogue: new LibSqlCatalogueQueries(sql),
    sessions: new LibSqlSessionRepository(sql, deps.ids, deps.clock),
    carts: new LibSqlCartRepository(sql, deps.clock),
    favourites: new LibSqlFavouriteRepository(sql, deps.clock),
    orders: new LibSqlOrderRepository(sql),
    ownership: new LibSqlOwnershipTransfer(sql),
    users: new LibSqlUserRepository(sql, deps.ids, deps.clock),
    accessTokens: new LibSqlAccessTokenRepository(sql, deps.tokens, deps.clock),
  };
}

export type Repositories = ReturnType<typeof createRepositories>;

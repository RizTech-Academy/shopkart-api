import { AsyncLocalStorage } from 'node:async_hooks';
import type { TransactionalRepositories, UnitOfWork } from '@/src/domain/ports';
import type { SqlExecutor } from '@/src/infrastructure/db/executor';
import { createRepositories, type RepositoryDependencies } from '@/src/infrastructure/repositories/factory';

/**
 * A unit of work over an explicit SQLite transaction.
 *
 * It issues BEGIN/COMMIT/ROLLBACK itself rather than calling libSQL's
 * `client.transaction()`, and that is a deliberate correction rather than a
 * preference. `transaction()` detaches the client's connection and lazily
 * opens a replacement, which has two consequences worth avoiding:
 *
 *   - `PRAGMA foreign_keys = ON` is per-connection, and a replacement
 *     connection starts with it off. Constraints declared in the schema would
 *     be enforced or not depending on which connection a request happened to
 *     land on.
 *   - a `:memory:` database lives *in* its connection, so a replacement one is
 *     a different, empty database. Tests would need a file to run against,
 *     losing the isolation that makes them trustworthy.
 *
 * Driving the transaction over the one connection the client already holds
 * avoids both. That connection is a single writer, which is what the queue
 * below makes explicit.
 */
export class LibSqlUnitOfWork implements UnitOfWork {
  /**
   * Marks the transaction owning the *current async call chain*.
   *
   * A plain instance field could not tell "a use case called run() from inside
   * another one" apart from "a second HTTP request arrived while the first was
   * awaiting" — the two look identical from outside. Getting that wrong would
   * silently enrol one shopper's checkout into another's transaction.
   */
  static readonly #active = new AsyncLocalStorage<TransactionalRepositories>();

  /**
   * Serialises transactions: one connection means one writer.
   *
   * Keyed on the executor rather than held as an instance field, because the
   * thing being protected is the *connection*, not this object. An instance
   * field would silently stop working the moment two units of work were built
   * over one client — which is exactly what a mis-memoised composition root
   * did, producing "cannot start a transaction within a transaction" only
   * under concurrent requests. Tying the queue to what it guards makes the
   * guarantee independent of how many instances exist.
   */
  static readonly #queues = new WeakMap<SqlExecutor, Promise<unknown>>();

  constructor(
    private readonly db: SqlExecutor,
    private readonly deps: RepositoryDependencies,
  ) {}

  run<T>(work: (repositories: TransactionalRepositories) => Promise<T>): Promise<T> {
    const enclosing = LibSqlUnitOfWork.#active.getStore();
    // Already inside a transaction on this call chain: join it, so a use case
    // composed of others still commits exactly once.
    if (enclosing) return work(enclosing);

    const pending = LibSqlUnitOfWork.#queues.get(this.db) ?? Promise.resolve();
    const result = pending.then(() => this.#runExclusively(work));
    // The queue only sequences; a failed transaction must not stop the next
    // one from running, so its rejection is absorbed here and rethrown to the
    // caller through `result`.
    LibSqlUnitOfWork.#queues.set(this.db, result.catch(() => undefined));
    return result;
  }

  async #runExclusively<T>(work: (repositories: TransactionalRepositories) => Promise<T>): Promise<T> {
    const repositories = createRepositories(this.db, this.deps);

    // Within this process it is the queue above, not this mode, that stops two
    // checkouts reading the same basket — one connection, one transaction at a
    // time. IMMEDIATE guards the case the queue cannot see: another process on
    // the same file, or a hosted libSQL where this client is not the only
    // connection. DEFERRED would take the write lock only at the first write,
    // by which point both transactions have read a full basket and decided
    // what to charge; IMMEDIATE takes it before the read, so the loser waits
    // and then sees the basket the winner emptied.
    await this.db.execute('BEGIN IMMEDIATE');

    try {
      const result = await LibSqlUnitOfWork.#active.run(repositories, () => work(repositories));
      await this.db.execute('COMMIT');
      return result;
    } catch (error) {
      await this.db.execute('ROLLBACK').catch(() => {
        // A failing rollback must not replace the error that caused it: the
        // original is the one that explains what went wrong.
      });
      throw error;
    }
  }
}

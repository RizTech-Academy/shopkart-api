import type { InStatement, ResultSet } from '@libsql/client';

/**
 * The only database capability a repository needs: run one statement.
 *
 * libSQL's `Client` also offers `transaction()`, `batch()`, `sync()` and
 * `close()`. A repository holding one of those could open its own transaction
 * — and where a transaction begins and ends is a question about a *use case*,
 * not about one table. Narrowing the dependency makes that impossible rather
 * than merely discouraged, and it is why `UnitOfWork` is the only thing in the
 * codebase that knows the word COMMIT.
 *
 * `batch()` is absent for the same reason and one more: libSQL's `batch` opens
 * a transaction of its own, so a repository using it inside a unit of work
 * would fail with "cannot start a transaction within a transaction". The
 * atomicity it used to provide is now the unit of work's job, which is where
 * it belonged.
 */
export interface SqlExecutor {
  execute(statement: InStatement): Promise<ResultSet>;
}

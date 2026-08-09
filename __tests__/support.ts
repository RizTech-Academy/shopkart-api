import { createClient } from '@libsql/client';
import { migrateAndSeed } from '@/src/infrastructure/db/client';
import { buildContainer, type Container } from '@/src/infrastructure/container';
import type { Clock, IdGenerator, PasswordHasher, TokenGenerator } from '@/src/domain/ports';

/**
 * Each test gets its own migrated in-memory database and a deterministic
 * clock, id generator and token generator, so assertions on ids and timestamps
 * are stable and tests cannot leak state into one another.
 */
export const FIXED_NOW = '2026-01-15T10:00:00.000Z';

/** A clock a test can wind forward, for anything that expires. */
export function movableClock(start: string = FIXED_NOW) {
  let current = new Date(start);
  return {
    now: () => current,
    advanceDays: (days: number) => {
      current = new Date(current.getTime() + days * 24 * 60 * 60 * 1000);
    },
  };
}

export const newContainer = async (): Promise<Container> => (await newHarness()).container;

export const newContainerWithClock = async (clock: Clock): Promise<Container> =>
  (await newHarness(clock)).container;

/**
 * The container plus the pieces underneath it.
 *
 * Most tests only want the use cases, but anything asserting on transactions
 * needs the database and the same dependencies the container was wired with —
 * building a second set would be testing a different object graph than the one
 * that runs.
 */
export async function newHarness(clock: Clock = { now: () => new Date(FIXED_NOW) }) {
  const db = createClient({ url: ':memory:' });
  await migrateAndSeed(db);

  let counter = 0;
  const ids: IdGenerator = { newId: () => `id-${String(++counter).padStart(4, '0')}` };
  let tokenCounter = 0;
  const tokens: TokenGenerator = { newToken: () => `token-${String(++tokenCounter).padStart(4, '0')}` };

  const deps = { clock, ids, tokens };
  return { db, deps, container: buildContainer(db, { ...deps, passwords: fakeHasher }) };
}

/**
 * scrypt is deliberately slow — that is the entire point of it — and a real
 * one here would dominate the suite's runtime for no coverage gained. The
 * genuine adapter is tested directly in `unit.password.test.ts`; everything
 * else only needs "the same password verifies, a different one does not".
 */
export const fakeHasher: PasswordHasher = {
  hash: async (plaintext) => `fake:${plaintext}`,
  verify: async (plaintext, hash) => hash === `fake:${plaintext}`,
};

/** A guest owner backed by a real session row. */
export async function newGuest(c: Container) {
  const session = await c.createSession.execute();
  return c.resolveOwner.execute({ sessionId: session.id, bearerToken: null });
}

/** A registered shopper, plus the token that authenticates them. */
export async function newUser(c: Container, email = 'ada@example.com', password = 'correct-horse') {
  const { user, token } = await c.registerUser.execute({ email, password, displayName: 'Ada' });
  return { user, token, owner: await c.resolveOwner.execute({ sessionId: null, bearerToken: token.value }) };
}

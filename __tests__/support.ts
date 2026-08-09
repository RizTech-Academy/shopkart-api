import { createClient } from '@libsql/client';
import { migrateAndSeed } from '@/src/infrastructure/db/client';
import { buildContainer, type Container } from '@/src/infrastructure/container';
import type { Clock, IdGenerator } from '@/src/domain/ports';

/**
 * Each test gets its own migrated in-memory database and a deterministic
 * clock and id generator, so assertions on ids and timestamps are stable and
 * tests cannot leak state into one another.
 */
export async function newContainer(): Promise<Container> {
  const db = createClient({ url: ':memory:' });
  await migrateAndSeed(db);

  const clock: Clock = { now: () => new Date('2026-01-15T10:00:00.000Z') };
  let counter = 0;
  const ids: IdGenerator = { newId: () => `id-${String(++counter).padStart(4, '0')}` };

  return buildContainer(db, clock, ids);
}

export async function newSessionId(c: Container): Promise<string> {
  return (await c.createSession.execute()).id;
}

import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createClient, type Client } from '@libsql/client';
import { SCHEMA_STATEMENTS } from '@/src/infrastructure/db/schema';
import { SEED_PRODUCTS } from '@/src/infrastructure/db/seed';

/**
 * Database access.
 *
 * Defaults to a file beside the repo so a clone works with no configuration
 * and data survives a restart. Tests pass `:memory:` for isolation.
 */
const DEFAULT_URL = 'file:./data/shopkart.db';

let singleton: Client | undefined;
let ready: Promise<void> | undefined;

export function createDatabase(url: string = process.env.DATABASE_URL ?? DEFAULT_URL): Client {
  ensureDirectoryFor(url);
  return createClient({ url });
}

/**
 * libSQL will not create a missing parent directory and fails with
 * SQLITE_CANTOPEN, so a fresh clone would break before the first request.
 * Creating it here keeps setup to `npm install && npm run dev`.
 */
function ensureDirectoryFor(url: string): void {
  if (!url.startsWith('file:')) return;
  const path = url.slice('file:'.length);
  if (path.startsWith(':')) return; // file::memory:
  mkdirSync(dirname(path), { recursive: true });
}

/** Creates the schema and seeds the catalogue if it is empty. Idempotent. */
export async function migrateAndSeed(client: Client): Promise<void> {
  await client.execute('PRAGMA foreign_keys = ON');
  for (const statement of SCHEMA_STATEMENTS) {
    await client.execute(statement);
  }

  const { rows } = await client.execute('SELECT COUNT(*) AS count FROM products');
  if (Number(rows[0]?.count ?? 0) > 0) return;

  await client.batch(
    SEED_PRODUCTS.map((p) => ({
      sql: `INSERT INTO products
              (id, title, description, category, price_minor, currency, image_url, rating_average, rating_count, in_stock)
            VALUES (?, ?, ?, ?, ?, 'USD', ?, ?, ?, ?)`,
      args: [p.id, p.title, p.description, p.category, p.priceMinor, p.imageUrl, p.ratingAverage, p.ratingCount, p.inStock ? 1 : 0],
    })),
    'write',
  );
}

/** Process-wide client, migrated once. */
export async function getDatabase(): Promise<Client> {
  singleton ??= createDatabase();
  ready ??= migrateAndSeed(singleton);
  await ready;
  return singleton;
}

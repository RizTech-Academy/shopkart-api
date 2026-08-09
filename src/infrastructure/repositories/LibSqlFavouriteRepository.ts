import type { Client } from '@libsql/client';
import type { Product } from '@/src/domain/entities';
import { ownerKey, type Owner } from '@/src/domain/owner';
import type { Clock, FavouriteRepository } from '@/src/domain/ports';
import { toProduct } from '@/src/infrastructure/db/mappers';

export class LibSqlFavouriteRepository implements FavouriteRepository {
  constructor(
    private readonly db: Client,
    private readonly clock: Clock,
  ) {}

  async list(owner: Owner): Promise<readonly Product[]> {
    const { rows } = await this.db.execute({
      sql: `SELECT p.* FROM favourites f JOIN products p ON p.id = f.product_id
            WHERE f.owner_key = ? ORDER BY f.added_at DESC`,
      args: [ownerKey(owner)],
    });
    return rows.map(toProduct);
  }

  async toggle(owner: Owner, productId: string): Promise<{ favourited: boolean }> {
    const key = ownerKey(owner);
    const { rows } = await this.db.execute({
      sql: 'SELECT 1 FROM favourites WHERE owner_key = ? AND product_id = ?',
      args: [key, productId],
    });

    if (rows.length > 0) {
      await this.db.execute({
        sql: 'DELETE FROM favourites WHERE owner_key = ? AND product_id = ?',
        args: [key, productId],
      });
      return { favourited: false };
    }

    await this.db.execute({
      sql: 'INSERT INTO favourites (owner_key, product_id, added_at) VALUES (?, ?, ?)',
      args: [key, productId, this.clock.now().toISOString()],
    });
    return { favourited: true };
  }
}

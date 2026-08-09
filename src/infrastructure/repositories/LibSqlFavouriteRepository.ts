import type { Client } from '@libsql/client';
import type { Product } from '@/src/domain/entities';
import type { Clock, FavouriteRepository } from '@/src/domain/ports';
import { toProduct } from '@/src/infrastructure/db/mappers';

export class LibSqlFavouriteRepository implements FavouriteRepository {
  constructor(
    private readonly db: Client,
    private readonly clock: Clock,
  ) {}

  async list(sessionId: string): Promise<readonly Product[]> {
    const { rows } = await this.db.execute({
      sql: `SELECT p.* FROM favourites f JOIN products p ON p.id = f.product_id
            WHERE f.session_id = ? ORDER BY f.added_at DESC`,
      args: [sessionId],
    });
    return rows.map(toProduct);
  }

  async toggle(sessionId: string, productId: string): Promise<{ favourited: boolean }> {
    const { rows } = await this.db.execute({
      sql: 'SELECT 1 FROM favourites WHERE session_id = ? AND product_id = ?',
      args: [sessionId, productId],
    });

    if (rows.length > 0) {
      await this.db.execute({
        sql: 'DELETE FROM favourites WHERE session_id = ? AND product_id = ?',
        args: [sessionId, productId],
      });
      return { favourited: false };
    }

    await this.db.execute({
      sql: 'INSERT INTO favourites (session_id, product_id, added_at) VALUES (?, ?, ?)',
      args: [sessionId, productId, this.clock.now().toISOString()],
    });
    return { favourited: true };
  }
}

import type { SqlExecutor } from '@/src/infrastructure/db/executor';
import type { Cart } from '@/src/domain/entities';
import { ownerKey, type Owner } from '@/src/domain/owner';
import type { CartRepository, Clock } from '@/src/domain/ports';
import { toProduct } from '@/src/infrastructure/db/mappers';

export class LibSqlCartRepository implements CartRepository {
  constructor(
    private readonly db: SqlExecutor,
    private readonly clock: Clock,
  ) {}

  /**
   * Lines join to products rather than copying the price, so a basket can
   * never display a stale price that disagrees with checkout.
   */
  async get(owner: Owner): Promise<Cart> {
    const { rows } = await this.db.execute({
      sql: `SELECT p.*, c.quantity AS line_quantity
            FROM cart_items c JOIN products p ON p.id = c.product_id
            WHERE c.owner_key = ? ORDER BY c.added_at ASC`,
      args: [ownerKey(owner)],
    });
    return { owner, lines: rows.map((r) => ({ product: toProduct(r), quantity: Number(r.line_quantity) })) };
  }

  /** Adding an existing product increments rather than duplicating the row. */
  async addItem(owner: Owner, productId: string, quantity: number): Promise<void> {
    await this.db.execute({
      sql: `INSERT INTO cart_items (owner_key, product_id, quantity, added_at) VALUES (?, ?, ?, ?)
            ON CONFLICT (owner_key, product_id) DO UPDATE SET quantity = quantity + excluded.quantity`,
      args: [ownerKey(owner), productId, quantity, this.clock.now().toISOString()],
    });
  }

  async setQuantity(owner: Owner, productId: string, quantity: number): Promise<void> {
    await this.db.execute({
      sql: 'UPDATE cart_items SET quantity = ? WHERE owner_key = ? AND product_id = ?',
      args: [quantity, ownerKey(owner), productId],
    });
  }

  async removeItem(owner: Owner, productId: string): Promise<void> {
    await this.db.execute({
      sql: 'DELETE FROM cart_items WHERE owner_key = ? AND product_id = ?',
      args: [ownerKey(owner), productId],
    });
  }

  async clear(owner: Owner): Promise<void> {
    await this.db.execute({ sql: 'DELETE FROM cart_items WHERE owner_key = ?', args: [ownerKey(owner)] });
  }
}

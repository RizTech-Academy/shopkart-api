import type { Client } from '@libsql/client';
import type { Cart } from '@/src/domain/entities';
import type { CartRepository, Clock } from '@/src/domain/ports';
import { toProduct } from '@/src/infrastructure/db/mappers';

export class LibSqlCartRepository implements CartRepository {
  constructor(
    private readonly db: Client,
    private readonly clock: Clock,
  ) {}

  /**
   * Cart lines join to products rather than copying the price, so a cart can
   * never display a stale price that disagrees with checkout.
   */
  async get(sessionId: string): Promise<Cart> {
    const { rows } = await this.db.execute({
      sql: `SELECT p.*, c.quantity AS line_quantity
            FROM cart_items c JOIN products p ON p.id = c.product_id
            WHERE c.session_id = ? ORDER BY c.added_at ASC`,
      args: [sessionId],
    });

    return {
      sessionId,
      lines: rows.map((row) => ({ product: toProduct(row), quantity: Number(row.line_quantity) })),
    };
  }

  /** Adding an existing product increments rather than duplicating the row. */
  async addItem(sessionId: string, productId: string, quantity: number): Promise<void> {
    await this.db.execute({
      sql: `INSERT INTO cart_items (session_id, product_id, quantity, added_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT (session_id, product_id)
            DO UPDATE SET quantity = quantity + excluded.quantity`,
      args: [sessionId, productId, quantity, this.clock.now().toISOString()],
    });
  }

  async setQuantity(sessionId: string, productId: string, quantity: number): Promise<void> {
    await this.db.execute({
      sql: 'UPDATE cart_items SET quantity = ? WHERE session_id = ? AND product_id = ?',
      args: [quantity, sessionId, productId],
    });
  }

  async removeItem(sessionId: string, productId: string): Promise<void> {
    await this.db.execute({
      sql: 'DELETE FROM cart_items WHERE session_id = ? AND product_id = ?',
      args: [sessionId, productId],
    });
  }

  async clear(sessionId: string): Promise<void> {
    await this.db.execute({ sql: 'DELETE FROM cart_items WHERE session_id = ?', args: [sessionId] });
  }
}

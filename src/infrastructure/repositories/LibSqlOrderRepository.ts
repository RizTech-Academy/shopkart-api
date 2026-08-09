import type { Client } from '@libsql/client';
import type { Order } from '@/src/domain/entities';
import type { OrderRepository } from '@/src/domain/ports';
import { toOrder, toOrderLine } from '@/src/infrastructure/db/mappers';

export class LibSqlOrderRepository implements OrderRepository {
  constructor(private readonly db: Client) {}

  /** Header and lines are written in one batch so an order is never half-created. */
  async create(order: Order): Promise<Order> {
    await this.db.batch(
      [
        {
          sql: `INSERT INTO orders (id, reference, session_id, total_minor, currency, placed_at)
                VALUES (?, ?, ?, ?, 'USD', ?)`,
          args: [order.id, order.reference, order.sessionId, order.total.amountMinor, order.placedAt],
        },
        ...order.lines.map((line) => ({
          sql: `INSERT INTO order_lines (order_id, product_id, title, unit_price_minor, quantity)
                VALUES (?, ?, ?, ?, ?)`,
          args: [order.id, line.productId, line.title, line.unitPrice.amountMinor, line.quantity],
        })),
      ],
      'write',
    );
    return order;
  }

  async listBySession(sessionId: string): Promise<readonly Order[]> {
    const { rows } = await this.db.execute({
      sql: 'SELECT * FROM orders WHERE session_id = ? ORDER BY placed_at DESC',
      args: [sessionId],
    });
    return Promise.all(rows.map(async (row) => toOrder(row, await this.linesFor(String(row.id)))));
  }

  async findById(sessionId: string, orderId: string): Promise<Order | null> {
    const { rows } = await this.db.execute({
      sql: 'SELECT * FROM orders WHERE id = ? AND session_id = ?',
      args: [orderId, sessionId],
    });
    const row = rows[0];
    return row ? toOrder(row, await this.linesFor(String(row.id))) : null;
  }

  private async linesFor(orderId: string) {
    const { rows } = await this.db.execute({
      sql: 'SELECT * FROM order_lines WHERE order_id = ?',
      args: [orderId],
    });
    return rows.map(toOrderLine);
  }
}

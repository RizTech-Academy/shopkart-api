import type { Client } from '@libsql/client';
import type { Order } from '@/src/domain/entities';
import { ownerKey, type Owner } from '@/src/domain/owner';
import type { OrderRepository } from '@/src/domain/ports';
import { toOrder, toOrderLine } from '@/src/infrastructure/db/mappers';

export class LibSqlOrderRepository implements OrderRepository {
  constructor(private readonly db: Client) {}

  /** Header and lines are written in one batch so an order is never half-created. */
  async create(order: Order): Promise<Order> {
    await this.db.batch(
      [
        {
          sql: `INSERT INTO orders (id, reference, owner_key, total_minor, currency, placed_at)
                VALUES (?, ?, ?, ?, 'USD', ?)`,
          args: [order.id, order.reference, ownerKey(order.owner), order.total.amountMinor, order.placedAt],
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

  async listFor(owner: Owner): Promise<readonly Order[]> {
    const { rows } = await this.db.execute({
      sql: 'SELECT * FROM orders WHERE owner_key = ? ORDER BY placed_at DESC',
      args: [ownerKey(owner)],
    });
    return Promise.all(rows.map(async (r) => toOrder(r, owner, await this.linesFor(String(r.id)))));
  }

  async findFor(owner: Owner, orderId: string): Promise<Order | null> {
    const { rows } = await this.db.execute({
      sql: 'SELECT * FROM orders WHERE id = ? AND owner_key = ?',
      args: [orderId, ownerKey(owner)],
    });
    const row = rows[0];
    return row ? toOrder(row, owner, await this.linesFor(String(row.id))) : null;
  }

  private async linesFor(orderId: string) {
    const { rows } = await this.db.execute({
      sql: 'SELECT * FROM order_lines WHERE order_id = ?',
      args: [orderId],
    });
    return rows.map(toOrderLine);
  }
}

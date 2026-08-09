import type { SqlExecutor } from '@/src/infrastructure/db/executor';
import type { Order } from '@/src/domain/entities';
import { ownerKey, type Owner } from '@/src/domain/owner';
import type { OrderRepository } from '@/src/domain/ports';
import { toOrder, toOrderLine } from '@/src/infrastructure/db/mappers';

export class LibSqlOrderRepository implements OrderRepository {
  constructor(private readonly db: SqlExecutor) {}

  /**
   * Writes the header and then the lines.
   *
   * An order must never be half-created, but that is not this class's problem
   * to solve: `PlaceOrder` runs inside a unit of work, so these statements and
   * the basket being emptied either all land or none do. A repository that
   * opened its own transaction here would give a weaker guarantee — the order
   * whole, the basket still full — while looking like a stronger one.
   */
  async create(order: Order): Promise<Order> {
    await this.db.execute({
      sql: `INSERT INTO orders (id, reference, owner_key, total_minor, currency, placed_at)
            VALUES (?, ?, ?, ?, 'USD', ?)`,
      args: [order.id, order.reference, ownerKey(order.owner), order.total.amountMinor, order.placedAt],
    });

    for (const line of order.lines) {
      await this.db.execute({
        sql: `INSERT INTO order_lines (order_id, product_id, title, unit_price_minor, quantity)
              VALUES (?, ?, ?, ?, ?)`,
        args: [order.id, line.productId, line.title, line.unitPrice.amountMinor, line.quantity],
      });
    }

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

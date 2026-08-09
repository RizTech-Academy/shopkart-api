import type { SqlExecutor } from '@/src/infrastructure/db/executor';
import { ownerKey, sameOwner, type Owner } from '@/src/domain/owner';
import type { OwnershipTransfer } from '@/src/domain/ports';

/**
 * Moves a shopper's basket, favourites and orders onto another owner.
 *
 * Its own adapter rather than a method bolted onto one of the repositories:
 * the operation spans three tables and belongs to none of them. Keeping it
 * separate is what stops `CartRepository` from having to know that favourites
 * or orders exist.
 */
export class LibSqlOwnershipTransfer implements OwnershipTransfer {
  constructor(private readonly db: SqlExecutor) {}

  /**
   * The copy-then-delete pairs below are only safe together — a shopper whose
   * basket was deleted but not copied has lost it. Atomicity comes from the
   * unit of work the calling use case opens, not from anything here.
   */
  async transferAll(from: Owner, to: Owner): Promise<void> {
    if (sameOwner(from, to)) return;
    const source = ownerKey(from);
    const target = ownerKey(to);

    // Quantities are summed where both baskets hold the same product: a
    // shopper who added two as a guest and one after signing in expects
    // three, not to silently lose either.
    await this.db.execute({
      sql: `INSERT INTO cart_items (owner_key, product_id, quantity, added_at)
            SELECT ?, product_id, quantity, added_at FROM cart_items WHERE owner_key = ?
            ON CONFLICT (owner_key, product_id) DO UPDATE SET quantity = quantity + excluded.quantity`,
      args: [target, source],
    });
    await this.db.execute({ sql: 'DELETE FROM cart_items WHERE owner_key = ?', args: [source] });

    await this.db.execute({
      sql: `INSERT OR IGNORE INTO favourites (owner_key, product_id, added_at)
            SELECT ?, product_id, added_at FROM favourites WHERE owner_key = ?`,
      args: [target, source],
    });
    await this.db.execute({ sql: 'DELETE FROM favourites WHERE owner_key = ?', args: [source] });

    await this.db.execute({ sql: 'UPDATE orders SET owner_key = ? WHERE owner_key = ?', args: [target, source] });
  }
}

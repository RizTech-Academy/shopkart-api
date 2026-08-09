import type { Row } from '@libsql/client';
import { money } from '@/src/domain/money';
import type { Order, OrderLine, Product } from '@/src/domain/entities';
import type { Owner } from '@/src/domain/owner';

/** Row → entity. The only place database column names are known. */
export function toProduct(row: Row): Product {
  return {
    id: String(row.id),
    title: String(row.title),
    description: String(row.description),
    category: String(row.category),
    price: money(Number(row.price_minor)),
    imageUrl: String(row.image_url),
    rating: { average: Number(row.rating_average), count: Number(row.rating_count) },
    inStock: Number(row.in_stock) === 1,
  };
}

export function toOrderLine(row: Row): OrderLine {
  return {
    productId: String(row.product_id),
    title: String(row.title),
    unitPrice: money(Number(row.unit_price_minor)),
    quantity: Number(row.quantity),
  };
}

export function toOrder(row: Row, owner: Owner, lines: readonly OrderLine[]): Order {
  return {
    id: String(row.id),
    reference: String(row.reference),
    owner,
    lines,
    total: money(Number(row.total_minor)),
    placedAt: String(row.placed_at),
  };
}

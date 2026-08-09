import type { Client } from '@libsql/client';
import type { Category, Product } from '@/src/domain/entities';
import type { Page, ProductQuery, ProductRepository } from '@/src/domain/ports';
import { toProduct } from '@/src/infrastructure/db/mappers';
import { buildOrderBy, buildWhere } from '@/src/infrastructure/sql';

export class LibSqlProductRepository implements ProductRepository {
  constructor(private readonly db: Client) {}

  async find(query: ProductQuery): Promise<Page<Product>> {
    const where = buildWhere(query);

    const countResult = await this.db.execute({
      sql: `SELECT COUNT(*) AS total FROM products ${where.clause}`,
      args: [...where.params] as never,
    });
    const totalItems = Number(countResult.rows[0]?.total ?? 0);

    const result = await this.db.execute({
      sql: `SELECT * FROM products ${where.clause} ORDER BY ${buildOrderBy(query.sort)} LIMIT ? OFFSET ?`,
      args: [...where.params, query.pageSize, (query.page - 1) * query.pageSize] as never,
    });

    return {
      items: result.rows.map(toProduct),
      page: query.page,
      pageSize: query.pageSize,
      totalItems,
      totalPages: totalItems === 0 ? 0 : Math.ceil(totalItems / query.pageSize),
    };
  }

  async findById(id: string): Promise<Product | null> {
    const { rows } = await this.db.execute({ sql: 'SELECT * FROM products WHERE id = ?', args: [id] });
    return rows[0] ? toProduct(rows[0]) : null;
  }

  async findManyByIds(ids: readonly string[]): Promise<readonly Product[]> {
    if (ids.length === 0) return [];
    const placeholders = ids.map(() => '?').join(', ');
    const { rows } = await this.db.execute({
      sql: `SELECT * FROM products WHERE id IN (${placeholders})`,
      args: [...ids] as never,
    });
    return rows.map(toProduct);
  }

  async listCategories(): Promise<readonly Category[]> {
    const { rows } = await this.db.execute(
      `SELECT category AS slug, COUNT(*) AS product_count
       FROM products GROUP BY category ORDER BY category ASC`,
    );
    return rows.map((row) => {
      const slug = String(row.slug);
      return { slug, name: slug.charAt(0).toUpperCase() + slug.slice(1), productCount: Number(row.product_count) };
    });
  }
}

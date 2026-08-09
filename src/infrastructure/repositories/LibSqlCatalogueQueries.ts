import type { SqlExecutor } from '@/src/infrastructure/db/executor';
import type { Category, Product } from '@/src/domain/entities';
import type { CatalogueQueries, Page, ProductQuery } from '@/src/domain/ports';
import { toProduct } from '@/src/infrastructure/db/mappers';
import { buildOrderBy, buildWhere } from '@/src/infrastructure/sql';

export class LibSqlCatalogueQueries implements CatalogueQueries {
  constructor(private readonly db: SqlExecutor) {}

  async find(query: ProductQuery): Promise<Page<Product>> {
    const where = buildWhere(query);

    const counted = await this.db.execute({
      sql: `SELECT COUNT(*) AS total FROM products ${where.clause}`,
      args: [...where.params] as never,
    });
    const totalItems = Number(counted.rows[0]?.total ?? 0);

    const { rows } = await this.db.execute({
      sql: `SELECT * FROM products ${where.clause} ORDER BY ${buildOrderBy(query.sort)} LIMIT ? OFFSET ?`,
      args: [...where.params, query.pageSize, (query.page - 1) * query.pageSize] as never,
    });

    return {
      items: rows.map(toProduct),
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

  async listCategories(): Promise<readonly Category[]> {
    const { rows } = await this.db.execute(
      `SELECT category AS slug, COUNT(*) AS product_count FROM products GROUP BY category ORDER BY category ASC`,
    );
    return rows.map((row) => {
      const slug = String(row.slug);
      return { slug, name: slug.charAt(0).toUpperCase() + slug.slice(1), productCount: Number(row.product_count) };
    });
  }
}

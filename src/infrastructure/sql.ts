import type { SortOption } from '@/src/domain/ports';

export interface SqlFragment {
  readonly clause: string;
  readonly params: readonly unknown[];
}

/**
 * ORDER BY cannot be parameterised — a placeholder is only valid where a value
 * is expected, not an identifier. Mapping through a fixed record means an
 * unknown sort key can never reach the query text.
 */
const ORDER_BY: Record<SortOption, string> = {
  relevance: 'rowid ASC',
  price_asc: 'price_minor ASC',
  price_desc: 'price_minor DESC',
  rating_desc: 'rating_average DESC',
  title_asc: 'title COLLATE NOCASE ASC',
};

export const buildOrderBy = (sort: SortOption): string => ORDER_BY[sort];

/** `%` and `_` are LIKE wildcards; unescaped, a search for "50%" matches everything. */
export const escapeLike = (value: string): string => value.replace(/[\\%_]/g, (c) => `\\${c}`);

export function buildWhere(query: { search?: string; category?: string }): SqlFragment {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (query.category) {
    conditions.push('category = ? COLLATE NOCASE');
    params.push(query.category.trim());
  }
  if (query.search) {
    conditions.push(
      "(title LIKE ? ESCAPE '\\' COLLATE NOCASE OR description LIKE ? ESCAPE '\\' COLLATE NOCASE OR category LIKE ? ESCAPE '\\' COLLATE NOCASE)",
    );
    const term = `%${escapeLike(query.search.trim())}%`;
    params.push(term, term, term);
  }

  return { clause: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '', params };
}

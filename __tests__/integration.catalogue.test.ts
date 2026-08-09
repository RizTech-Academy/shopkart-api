import { beforeEach, describe, expect, it } from 'vitest';
import { newContainer } from './support';
import type { Container } from '@/src/infrastructure/container';

/** Runs against a real migrated SQLite database, not a mock. */
describe('catalogue (integration)', () => {
  let c: Container;
  beforeEach(async () => { c = await newContainer(); });

  const q = { sort: 'relevance' as const, page: 1, pageSize: 20 };

  it('seeds the catalogue and paginates it', async () => {
    const page = await c.listProducts.execute({ ...q, pageSize: 5 });
    expect(page.items).toHaveLength(5);
    expect(page.totalItems).toBe(23);
    expect(page.totalPages).toBe(5);
  });

  it('filters by category', async () => {
    const page = await c.listProducts.execute({ ...q, category: 'audio' });
    expect(page.totalItems).toBe(4);
    expect(page.items.every((p) => p.category === 'audio')).toBe(true);
  });

  it('matches category case-insensitively', async () => {
    expect((await c.listProducts.execute({ ...q, category: 'AUDIO' })).totalItems).toBe(4);
  });

  it('searches title and description', async () => {
    const page = await c.listProducts.execute({ ...q, search: 'keyboard' });
    expect(page.totalItems).toBeGreaterThan(0);
  });

  it('sorts by price in both directions', async () => {
    const asc = await c.listProducts.execute({ ...q, sort: 'price_asc' });
    const desc = await c.listProducts.execute({ ...q, sort: 'price_desc' });
    const ascPrices = asc.items.map((p) => p.price.amountMinor);
    expect([...ascPrices].sort((a, b) => a - b)).toEqual(ascPrices);
    expect(desc.items[0]!.price.amountMinor).toBeGreaterThan(asc.items[0]!.price.amountMinor);
  });

  it('reports totals reflecting the filter, not the whole table', async () => {
    const page = await c.listProducts.execute({ ...q, category: 'audio', pageSize: 2 });
    expect(page.totalItems).toBe(4);
    expect(page.items).toHaveLength(2);
  });

  it('returns a product by id and throws for an unknown one', async () => {
    expect((await c.getProduct.execute('p-001')).title).toContain('Aurora');
    await expect(c.getProduct.execute('nope')).rejects.toThrow(/No product exists/);
  });

  it('lists categories with counts summing to the catalogue', async () => {
    const categories = await c.listCategories.execute();
    expect(categories.reduce((n, cat) => n + cat.productCount, 0)).toBe(23);
  });

  it('stores prices as integers, never floats', async () => {
    const product = await c.getProduct.execute('p-001');
    expect(Number.isInteger(product.price.amountMinor)).toBe(true);
    expect(product.price.amountMinor).toBe(12900);
  });
});

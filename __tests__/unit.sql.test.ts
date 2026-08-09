import { describe, expect, it } from 'vitest';
import { buildOrderBy, buildWhere, escapeLike } from '@/src/infrastructure/sql';

describe('buildWhere', () => {
  it('produces no clause when unfiltered', () => {
    expect(buildWhere({})).toEqual({ clause: '', params: [] });
  });

  it('binds the category rather than interpolating it', () => {
    const { clause, params } = buildWhere({ category: 'audio' });
    expect(clause).toContain('category = ?');
    expect(clause).not.toContain('audio');
    expect(params).toEqual(['audio']);
  });

  it('binds a search term to all three searchable columns', () => {
    const { clause, params } = buildWhere({ search: 'keyboard' });
    expect(clause.match(/LIKE \?/g)).toHaveLength(3);
    expect(params).toEqual(['%keyboard%', '%keyboard%', '%keyboard%']);
  });

  it('combines filters with AND', () => {
    expect(buildWhere({ search: 'a', category: 'b' }).clause).toContain(' AND ');
  });

  it('escapes LIKE wildcards so a literal % is not a match-all', () => {
    expect(escapeLike('50%')).toBe('50\\%');
    expect(escapeLike('a_b')).toBe('a\\_b');
    expect(buildWhere({ search: '100%' }).params[0]).toBe('%100\\%%');
  });

  it('cannot be injected through the sort option', () => {
    // Only whitelisted keys exist; anything else is undefined, never SQL.
    expect(buildOrderBy('price_asc')).toBe('price_minor ASC');
    // @ts-expect-error deliberately invalid key
    expect(buildOrderBy('; DROP TABLE products; --')).toBeUndefined();
  });
});

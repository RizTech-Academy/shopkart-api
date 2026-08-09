import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { openApiDocument } from '@/src/interface/http/openapi';

/**
 * The spec is what the Android client generates from, so an endpoint missing
 * from it is invisible however well it works. Hand-written documentation drifts
 * silently; this is the check that makes it fail loudly instead.
 */
function routePaths(dir: string, prefix = '/api'): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (!entry.isDirectory()) return [];
    const segment = entry.name.replace(/^\[(.+)]$/, '{$1}');
    const child = join(dir, entry.name);
    const here = `${prefix}/${segment}`;
    const isRoute = readdirSync(child).includes('route.ts');
    return [...(isRoute ? [here] : []), ...routePaths(child, here)];
  });
}

describe('openapi document', () => {
  const documented = Object.keys(openApiDocument.paths);
  // The spec describes itself in prose, not as an endpoint.
  const implemented = routePaths(join(process.cwd(), 'app/api')).filter((p) => p !== '/api/openapi.json');

  it('documents every implemented route', () => {
    expect([...implemented].sort()).toEqual([...documented].sort());
  });

  it('serialises to JSON', () => {
    expect(() => JSON.stringify(openApiDocument)).not.toThrow();
  });

  it('declares both ways of being a shopper', () => {
    expect(Object.keys(openApiDocument.components.securitySchemes)).toEqual(['sessionId', 'bearerAuth']);
  });

  it('offers both credentials on every basket, favourite and order endpoint', () => {
    const shopperPaths = documented.filter((p) => /^\/api\/(cart|favourites|orders)/.test(p));
    const operations = shopperPaths.flatMap((path) =>
      Object.values(openApiDocument.paths[path as keyof typeof openApiDocument.paths]),
    ) as { security?: readonly Record<string, unknown>[] }[];

    expect(operations.length).toBeGreaterThan(0);
    for (const operation of operations) {
      expect(operation.security?.map((scheme) => Object.keys(scheme)[0])).toEqual(['sessionId', 'bearerAuth']);
    }
  });
});

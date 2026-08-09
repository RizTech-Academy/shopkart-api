import { getContainer } from '@/src/infrastructure/container';
import { parseProductQuery } from '@/src/interface/http/requests';
import { handle, ok } from '@/src/interface/http/responses';
import { toProductDto } from '@/src/interface/http/presenters';

export const dynamic = 'force-dynamic';

/**
 * Takes a plain `Request`, like every other handler here.
 *
 * `NextRequest.nextUrl` would do the same job, but it is a framework type
 * where the web standard suffices — and a handler that only needs the URL has
 * no reason to demand one. Keeping to `Request` means these handlers can be
 * called directly by a test, which is exactly what `http.routes.test.ts` does.
 */
export const GET = (request: Request) =>
  handle(async () => {
    const { listProducts } = await getContainer();
    const query = parseProductQuery(new URL(request.url).searchParams);
    const { items, ...meta } = await listProducts.execute(query);
    return ok(items.map(toProductDto), meta);
  });

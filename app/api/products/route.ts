import type { NextRequest } from 'next/server';
import { getContainer } from '@/src/infrastructure/container';
import { parseProductQuery } from '@/src/interface/http/requests';
import { handle, ok } from '@/src/interface/http/responses';
import { toProductDto } from '@/src/interface/http/presenters';

export const dynamic = 'force-dynamic';

export const GET = (request: NextRequest) =>
  handle(async () => {
    const { listProducts } = await getContainer();
    const { items, ...meta } = await listProducts.execute(parseProductQuery(request.nextUrl.searchParams));
    return ok(items.map(toProductDto), meta);
  });

import type { NextRequest } from 'next/server';
import { getContainer } from '@/src/infrastructure/container';
import { parseProductQuery } from '@/src/interface/http/requests';
import { handle, ok } from '@/src/interface/http/responses';

export const dynamic = 'force-dynamic';

export const GET = (request: NextRequest) =>
  handle(async () => {
    const { listProducts } = await getContainer();
    const page = await listProducts.execute(parseProductQuery(request.nextUrl.searchParams));
    const { items, ...meta } = page;
    return ok(items, meta);
  });

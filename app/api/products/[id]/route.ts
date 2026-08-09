import { getContainer } from '@/src/infrastructure/container';
import { handle, ok } from '@/src/interface/http/responses';
import { toProductDto } from '@/src/interface/http/presenters';

export const dynamic = 'force-dynamic';

export const GET = (_req: Request, ctx: { params: Promise<{ id: string }> }) =>
  handle(async () => {
    const { getProduct } = await getContainer();
    return ok(toProductDto(await getProduct.execute((await ctx.params).id)));
  });

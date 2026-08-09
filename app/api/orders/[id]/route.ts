import { getContainer } from '@/src/infrastructure/container';
import { sessionIdOf } from '@/src/interface/http/requests';
import { handle, ok } from '@/src/interface/http/responses';

export const dynamic = 'force-dynamic';

export const GET = (request: Request, ctx: { params: Promise<{ id: string }> }) =>
  handle(async () => {
    const c = await getContainer();
    const owner = await c.resolveOwner.execute(sessionIdOf(request));
    return ok(await c.getOrder.execute(owner, (await ctx.params).id));
  });

import { getContainer } from '@/src/infrastructure/container';
import { sessionIdOf } from '@/src/interface/http/requests';
import { handle, ok } from '@/src/interface/http/responses';

export const dynamic = 'force-dynamic';

export const GET = (request: Request, ctx: { params: Promise<{ id: string }> }) =>
  handle(async () => {
    const c = await getContainer();
    const session = await c.requireSession.execute(sessionIdOf(request));
    return ok(await c.getOrder.execute(session.id, (await ctx.params).id));
  });

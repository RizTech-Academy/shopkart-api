import { getContainer } from '@/src/infrastructure/container';
import { parseBody, sessionIdOf, toggleFavouriteSchema } from '@/src/interface/http/requests';
import { handle, ok } from '@/src/interface/http/responses';

export const dynamic = 'force-dynamic';

export const GET = (request: Request) =>
  handle(async () => {
    const c = await getContainer();
    const session = await c.requireSession.execute(sessionIdOf(request));
    return ok(await c.listFavourites.execute(session.id));
  });

export const POST = (request: Request) =>
  handle(async () => {
    const c = await getContainer();
    const session = await c.requireSession.execute(sessionIdOf(request));
    const { productId } = await parseBody(request, toggleFavouriteSchema);
    return ok(await c.toggleFavourite.execute(session.id, productId));
  });

import { getContainer } from '@/src/infrastructure/container';
import { addToCartSchema, parseBody, sessionIdOf } from '@/src/interface/http/requests';
import { handle, ok } from '@/src/interface/http/responses';
import { toCartView } from '@/src/application/useCases';

export const dynamic = 'force-dynamic';

export const GET = (request: Request) =>
  handle(async () => {
    const c = await getContainer();
    const session = await c.requireSession.execute(sessionIdOf(request));
    return ok(toCartView(await c.getCart.execute(session.id)));
  });

export const POST = (request: Request) =>
  handle(async () => {
    const c = await getContainer();
    const session = await c.requireSession.execute(sessionIdOf(request));
    const body = await parseBody(request, addToCartSchema);
    return ok(toCartView(await c.addToCart.execute(session.id, body.productId, body.quantity)));
  });

export const DELETE = (request: Request) =>
  handle(async () => {
    const c = await getContainer();
    const session = await c.requireSession.execute(sessionIdOf(request));
    return ok(toCartView(await c.clearCart.execute(session.id)));
  });

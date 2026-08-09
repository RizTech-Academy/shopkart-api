import { getContainer } from '@/src/infrastructure/container';
import { addToCartSchema, credentialsOf, parseBody } from '@/src/interface/http/requests';
import { handle, ok } from '@/src/interface/http/responses';
import { toCartDto } from '@/src/interface/http/presenters';

export const dynamic = 'force-dynamic';

export const GET = (request: Request) =>
  handle(async () => {
    const c = await getContainer();
    const owner = await c.resolveOwner.execute(credentialsOf(request));
    return ok(toCartDto(await c.getCart.execute(owner)));
  });

export const POST = (request: Request) =>
  handle(async () => {
    const c = await getContainer();
    const owner = await c.resolveOwner.execute(credentialsOf(request));
    const body = await parseBody(request, addToCartSchema);
    return ok(toCartDto(await c.addToCart.execute(owner, body.productId, body.quantity)));
  });

export const DELETE = (request: Request) =>
  handle(async () => {
    const c = await getContainer();
    const owner = await c.resolveOwner.execute(credentialsOf(request));
    return ok(toCartDto(await c.clearCart.execute(owner)));
  });

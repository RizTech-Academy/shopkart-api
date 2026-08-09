import { getContainer } from '@/src/infrastructure/container';
import { parseBody, sessionIdOf, updateQuantitySchema } from '@/src/interface/http/requests';
import { handle, ok } from '@/src/interface/http/responses';
import { toCartView } from '@/src/application/useCases';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ productId: string }> };

export const PATCH = (request: Request, ctx: Ctx) =>
  handle(async () => {
    const c = await getContainer();
    const owner = await c.resolveOwner.execute(sessionIdOf(request));
    const { quantity } = await parseBody(request, updateQuantitySchema);
    const { productId } = await ctx.params;
    return ok(toCartView(await c.updateCartQuantity.execute(owner, productId, quantity)));
  });

export const DELETE = (request: Request, ctx: Ctx) =>
  handle(async () => {
    const c = await getContainer();
    const owner = await c.resolveOwner.execute(sessionIdOf(request));
    const { productId } = await ctx.params;
    return ok(toCartView(await c.removeFromCart.execute(owner, productId)));
  });

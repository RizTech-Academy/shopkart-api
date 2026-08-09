import { getContainer } from '@/src/infrastructure/container';
import { sessionIdOf } from '@/src/interface/http/requests';
import { created, handle, ok } from '@/src/interface/http/responses';

export const dynamic = 'force-dynamic';

export const GET = (request: Request) =>
  handle(async () => {
    const c = await getContainer();
    const owner = await c.resolveOwner.execute(sessionIdOf(request));
    return ok(await c.listOrders.execute(owner));
  });

/** Checkout. No payment step — the order is recorded and the cart emptied. */
export const POST = (request: Request) =>
  handle(async () => {
    const c = await getContainer();
    const owner = await c.resolveOwner.execute(sessionIdOf(request));
    return created(await c.placeOrder.execute(owner));
  });

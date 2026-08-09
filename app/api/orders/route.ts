import { getContainer } from '@/src/infrastructure/container';
import { credentialsOf } from '@/src/interface/http/requests';
import { created, handle, ok } from '@/src/interface/http/responses';
import { toOrderDto } from '@/src/interface/http/presenters';

export const dynamic = 'force-dynamic';

export const GET = (request: Request) =>
  handle(async () => {
    const c = await getContainer();
    const owner = await c.resolveOwner.execute(credentialsOf(request));
    return ok((await c.listOrders.execute(owner)).map(toOrderDto));
  });

/** Checkout. No payment step — the order is recorded and the cart emptied. */
export const POST = (request: Request) =>
  handle(async () => {
    const c = await getContainer();
    const owner = await c.resolveOwner.execute(credentialsOf(request));
    return created(toOrderDto(await c.placeOrder.execute(owner)));
  });

import { getContainer } from '@/src/infrastructure/container';
import { credentialsOf, parseBody, toggleFavouriteSchema } from '@/src/interface/http/requests';
import { handle, ok } from '@/src/interface/http/responses';
import { toProductDto } from '@/src/interface/http/presenters';

export const dynamic = 'force-dynamic';

export const GET = (request: Request) =>
  handle(async () => {
    const c = await getContainer();
    const owner = await c.resolveOwner.execute(credentialsOf(request));
    return ok((await c.listFavourites.execute(owner)).map(toProductDto));
  });

export const POST = (request: Request) =>
  handle(async () => {
    const c = await getContainer();
    const owner = await c.resolveOwner.execute(credentialsOf(request));
    const { productId } = await parseBody(request, toggleFavouriteSchema);
    return ok(await c.toggleFavourite.execute(owner, productId));
  });

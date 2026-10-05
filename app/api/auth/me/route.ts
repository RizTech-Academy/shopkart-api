import { getContainer } from '@/src/infrastructure/container';
import { credentialsOf } from '@/src/interface/http/requests';
import { handle, ok } from '@/src/interface/http/responses';
import { toUserDto } from '@/src/interface/http/presenters';

export const dynamic = 'force-dynamic';

/** The signed-in shopper's profile. 401 for a guest — a guest has no profile, which is not an error about the request. */
export const GET = (request: Request) =>
  handle(async () => {
    const c = await getContainer();
    const owner = await c.resolveOwner.execute(credentialsOf(request));
    return ok(toUserDto(await c.getCurrentUser.execute(owner)));
  });

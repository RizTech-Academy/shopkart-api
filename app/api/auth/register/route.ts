import { getContainer } from '@/src/infrastructure/container';
import { parseBody, registerSchema, sessionIdOf } from '@/src/interface/http/requests';
import { created, handle } from '@/src/interface/http/responses';
import { toAuthenticatedDto } from '@/src/interface/http/presenters';

export const dynamic = 'force-dynamic';

/**
 * Create an account and sign in.
 *
 * `x-session-id` is optional here and means something specific: "this is the
 * basket I built before I had an account, keep it". Sending it moves that
 * basket, its favourites and its order history onto the new user.
 */
export const POST = (request: Request) =>
  handle(async () => {
    const c = await getContainer();
    const body = await parseBody(request, registerSchema);
    const result = await c.registerUser.execute({ ...body, guestSessionId: sessionIdOf(request) });
    return created(toAuthenticatedDto(result));
  });

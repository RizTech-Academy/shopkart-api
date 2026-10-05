import { getContainer } from '@/src/infrastructure/container';
import { loginSchema, parseBody, sessionIdOf } from '@/src/interface/http/requests';
import { handle, ok } from '@/src/interface/http/responses';
import { toAuthenticatedDto } from '@/src/interface/http/presenters';

export const dynamic = 'force-dynamic';

/** Sign in. As with register, an `x-session-id` carries the guest basket across. */
export const POST = (request: Request) =>
  handle(async () => {
    const c = await getContainer();
    const body = await parseBody(request, loginSchema);
    const result = await c.logIn.execute({ ...body, guestSessionId: sessionIdOf(request) });
    return ok(toAuthenticatedDto(result));
  });

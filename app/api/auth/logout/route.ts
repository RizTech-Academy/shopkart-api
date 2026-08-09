import { getContainer } from '@/src/infrastructure/container';
import { requireBearerToken } from '@/src/interface/http/requests';
import { handle, ok } from '@/src/interface/http/responses';

export const dynamic = 'force-dynamic';

/**
 * Revoke the presented token.
 *
 * Takes the raw token rather than an Owner because that is what is being
 * destroyed: signing out of this device must not sign the shopper out of every
 * other one. Idempotent — an already-revoked token still reports success.
 */
export const POST = (request: Request) =>
  handle(async () => {
    const c = await getContainer();
    await c.logOut.execute(requireBearerToken(request));
    return ok({ revoked: true });
  });

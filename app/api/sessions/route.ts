import { getContainer } from '@/src/infrastructure/container';
import { created, handle } from '@/src/interface/http/responses';
import { toSessionDto } from '@/src/interface/http/presenters';

export const dynamic = 'force-dynamic';

/** Creates the anonymous session a client sends back as x-session-id. */
export const POST = () =>
  handle(async () => {
    const { createSession } = await getContainer();
    return created(toSessionDto(await createSession.execute()));
  });

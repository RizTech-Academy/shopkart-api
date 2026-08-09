import { getContainer } from '@/src/infrastructure/container';
import { created, handle } from '@/src/interface/http/responses';

export const dynamic = 'force-dynamic';

/** Creates the anonymous session a client sends back as x-session-id. */
export const POST = () =>
  handle(async () => {
    const { createSession } = await getContainer();
    return created(await createSession.execute());
  });

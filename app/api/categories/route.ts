import { getContainer } from '@/src/infrastructure/container';
import { handle, ok } from '@/src/interface/http/responses';

export const dynamic = 'force-dynamic';

export const GET = () =>
  handle(async () => {
    const { listCategories } = await getContainer();
    return ok(await listCategories.execute());
  });

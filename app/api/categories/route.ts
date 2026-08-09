import { getContainer } from '@/src/infrastructure/container';
import { handle, ok } from '@/src/interface/http/responses';
import { toCategoryDto } from '@/src/interface/http/presenters';

export const dynamic = 'force-dynamic';

export const GET = () =>
  handle(async () => {
    const { listCategories } = await getContainer();
    return ok((await listCategories.execute()).map(toCategoryDto));
  });

import { z } from 'zod';
import { ValidationError } from '@/src/domain/errors';
import type { ProductQuery } from '@/src/domain/ports';

export const SESSION_HEADER = 'x-session-id';
export const MAX_PAGE_SIZE = 50;

const productQuerySchema = z.object({
  search: z.string().trim().min(1).max(100).optional(),
  category: z.string().trim().min(1).max(60).optional(),
  sort: z.enum(['relevance', 'price_asc', 'price_desc', 'rating_desc', 'title_asc']).default('relevance'),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(MAX_PAGE_SIZE).default(20),
});

/** Absent params must stay absent so schema defaults apply — `?search=` is not an error. */
export function parseProductQuery(params: URLSearchParams): ProductQuery {
  type Key = 'search' | 'category' | 'sort' | 'page' | 'pageSize';
  const keys: readonly Key[] = ['search', 'category', 'sort', 'page', 'pageSize'];

  const raw = Object.fromEntries(
    keys
      .map((key) => [key, params.get(key)] as const)
      .filter((entry): entry is readonly [Key, string] => entry[1] !== null && entry[1] !== ''),
  );

  const result = productQuerySchema.safeParse(raw);
  if (!result.success) {
    throw new ValidationError(
      'One or more query parameters are invalid.',
      result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    );
  }
  return result.data;
}

export async function parseBody<T extends z.ZodTypeAny>(request: Request, schema: T): Promise<z.infer<T>> {
  const json = await request.json().catch(() => {
    throw new ValidationError('Request body must be valid JSON.');
  });
  const result = schema.safeParse(json);
  if (!result.success) {
    throw new ValidationError(
      'Request body is invalid.',
      result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    );
  }
  return result.data;
}

export const addToCartSchema = z.object({
  productId: z.string().trim().min(1),
  quantity: z.number().int().positive().max(99).default(1),
});

export const updateQuantitySchema = z.object({
  quantity: z.number().int().min(0).max(99),
});

export const toggleFavouriteSchema = z.object({
  productId: z.string().trim().min(1),
});

export const sessionIdOf = (request: Request): string | null => request.headers.get(SESSION_HEADER);

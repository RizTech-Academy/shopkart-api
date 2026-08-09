import { z } from 'zod';
import { AuthenticationError, ValidationError } from '@/src/domain/errors';
import type { ProductQuery } from '@/src/domain/ports';
import type { PresentedCredentials } from '@/src/application/useCases';

export const SESSION_HEADER = 'x-session-id';
export const AUTHORIZATION_HEADER = 'authorization';
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

/**
 * Shape only — the password *rule* lives in the use case.
 *
 * A schema can guarantee a string arrived; it cannot guarantee every future
 * caller applied the same minimum. Splitting it this way means an endpoint
 * added later inherits the rule for free and cannot weaken it.
 */
export const registerSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(200),
  displayName: z.string().trim().min(1).max(80),
});

export const loginSchema = z.object({
  email: z.string().trim().min(1).max(254),
  password: z.string().min(1).max(200),
});

export const sessionIdOf = (request: Request): string | null => request.headers.get(SESSION_HEADER);

/**
 * `Authorization: Bearer <token>`, matched case-insensitively on the scheme
 * because RFC 7235 says the scheme is case-insensitive and clients differ.
 */
export function bearerTokenOf(request: Request): string | null {
  const header = request.headers.get(AUTHORIZATION_HEADER);
  if (!header) return null;
  const [scheme, ...rest] = header.trim().split(/\s+/);
  if (scheme?.toLowerCase() !== 'bearer') return null;
  const token = rest.join('');
  return token.length > 0 ? token : null;
}

/** Everything the transport knows about the caller, in the shape the application layer accepts. */
export const credentialsOf = (request: Request): PresentedCredentials => ({
  bearerToken: bearerTokenOf(request),
  sessionId: sessionIdOf(request),
});

/** For endpoints that act on the token itself, where "which token" is the whole point. */
export function requireBearerToken(request: Request): string {
  const token = bearerTokenOf(request);
  if (!token) throw new AuthenticationError('An Authorization: Bearer <token> header is required.');
  return token;
}

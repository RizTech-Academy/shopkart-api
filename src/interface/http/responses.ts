import { NextResponse } from 'next/server';
import { AuthenticationError, ConflictError, DomainError, NotFoundError, ValidationError } from '@/src/domain/errors';

/** One envelope for every endpoint, so clients deserialise exactly two shapes. */
export function ok<T>(data: T, meta?: Record<string, unknown>, status = 200): NextResponse {
  return NextResponse.json(meta === undefined ? { data } : { data, meta }, { status });
}

export const created = <T>(data: T): NextResponse => ok(data, undefined, 201);

/**
 * The single place domain failures become HTTP.
 *
 * The domain throws NotFoundError; it has no idea that means 404. Keeping the
 * mapping here is what lets the same use cases run from a test or a CLI.
 */
/**
 * A table rather than a chain of `if`s, so a new domain error is one row and
 * every existing mapping stays untouched. 409 remains the fallback for any
 * DomainError not listed — a new failure mode degrades to a sensible status
 * instead of being reported as a server fault.
 */
const STATUS_BY_ERROR: readonly (readonly [abstract new (...args: never[]) => DomainError, number])[] = [
  [ValidationError, 400],
  [AuthenticationError, 401],
  [NotFoundError, 404],
  [ConflictError, 409],
];

export function toErrorResponse(error: unknown): NextResponse {
  if (error instanceof DomainError) {
    const status = STATUS_BY_ERROR.find(([type]) => error instanceof type)?.[1] ?? 409;
    const details = error instanceof ValidationError && error.details ? { details: error.details } : {};

    return NextResponse.json(
      { error: { code: error.code, message: error.message, ...details } },
      {
        status,
        // RFC 9110 requires this on a 401. Without it, "unauthorised" is a
        // status with no statement of how to become authorised.
        headers: status === 401 ? { 'WWW-Authenticate': 'Bearer realm="shopkart"' } : undefined,
      },
    );
  }

  console.error('[unhandled]', error);
  return NextResponse.json(
    { error: { code: 'internal_error', message: 'Something went wrong.' } },
    { status: 500 },
  );
}

/** Wraps a handler so no route has to repeat the try/catch. */
export function handle(fn: () => Promise<NextResponse>): Promise<NextResponse> {
  return fn().catch(toErrorResponse);
}

import { NextResponse } from 'next/server';
import { DomainError, NotFoundError, ValidationError } from '@/src/domain/errors';

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
export function toErrorResponse(error: unknown): NextResponse {
  if (error instanceof NotFoundError) {
    return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: 404 });
  }
  if (error instanceof ValidationError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message, ...(error.details ? { details: error.details } : {}) } },
      { status: 400 },
    );
  }
  if (error instanceof DomainError) {
    return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: 409 });
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

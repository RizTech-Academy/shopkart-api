/**
 * Domain-level failures.
 *
 * Deliberately not HTTP errors: the domain has no idea what a status code is.
 * The HTTP layer maps these onto responses, which is what lets the same use
 * cases be driven from a CLI, a queue consumer, or a test.
 */
export abstract class DomainError extends Error {
  abstract readonly code: string;
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class NotFoundError extends DomainError {
  readonly code = 'not_found';
  constructor(entity: string, id: string) {
    super(`No ${entity} exists with id "${id}".`);
  }
}

export class ValidationError extends DomainError {
  readonly code = 'validation_failed';
  constructor(message: string, readonly details?: unknown) {
    super(message);
  }
}

export class ConflictError extends DomainError {
  readonly code = 'conflict';
}

/**
 * The credentials presented are missing, unrecognised, or expired.
 *
 * Distinct from ValidationError because the caller's remedy is different: a
 * validation failure means "fix the request", this means "prove who you are".
 * Still a domain concept — it says nothing about headers or status codes; the
 * HTTP layer is what decides that means 401.
 */
export class AuthenticationError extends DomainError {
  readonly code = 'unauthenticated';
}

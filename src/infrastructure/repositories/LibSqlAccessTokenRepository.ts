import type { SqlExecutor } from '@/src/infrastructure/db/executor';
import type { AccessToken } from '@/src/domain/entities';
import type { AccessTokenRepository, Clock, TokenGenerator } from '@/src/domain/ports';

/** Long enough that a shopper is not signed out mid-session, short enough that a leaked token stops working. */
const LIFETIME_DAYS = 30;

export class LibSqlAccessTokenRepository implements AccessTokenRepository {
  constructor(
    private readonly db: SqlExecutor,
    private readonly tokens: TokenGenerator,
    private readonly clock: Clock,
  ) {}

  /**
   * Issuing also drops this user's expired tokens.
   *
   * They are already ignored by `findUserId`, so this is housekeeping rather
   * than a security fix — but rows nobody will ever read again should not
   * accumulate forever. Doing it here keeps the promise that the app needs no
   * scheduler or external service: the work is bounded by one user's tokens
   * and happens on the one path that creates them.
   */
  async issue(userId: string): Promise<AccessToken> {
    const now = this.clock.now();
    const issuedAt = now.toISOString();
    const expiresAt = new Date(now.getTime() + LIFETIME_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const value = this.tokens.newToken();

    await this.db.execute({
      sql: 'DELETE FROM access_tokens WHERE user_id = ? AND expires_at <= ?',
      args: [userId, issuedAt],
    });

    await this.db.execute({
      sql: 'INSERT INTO access_tokens (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)',
      args: [value, userId, issuedAt, expiresAt],
    });

    return { value, userId, expiresAt };
  }

  /**
   * Expiry is applied in the WHERE clause, not checked by the caller.
   *
   * An expired token that still resolves anywhere is the whole vulnerability;
   * making that impossible to forget is worth more than the comparison being
   * visible at the call site. Timestamps are ISO-8601 UTC, which sorts
   * lexicographically, so a string comparison is a chronological one.
   */
  async findUserId(token: string): Promise<string | null> {
    const { rows } = await this.db.execute({
      sql: 'SELECT user_id FROM access_tokens WHERE token = ? AND expires_at > ?',
      args: [token, this.clock.now().toISOString()],
    });
    return rows[0] ? String(rows[0].user_id) : null;
  }

  async revoke(token: string): Promise<void> {
    await this.db.execute({ sql: 'DELETE FROM access_tokens WHERE token = ?', args: [token] });
  }
}

import type { Row } from '@libsql/client';
import type { SqlExecutor } from '@/src/infrastructure/db/executor';
import type { User, UserCredentials } from '@/src/domain/entities';
import { ConflictError } from '@/src/domain/errors';
import type { Clock, IdGenerator, NewUser, UserRepository } from '@/src/domain/ports';

const toUser = (row: Row): User => ({
  id: String(row.id),
  email: String(row.email),
  displayName: String(row.display_name),
  createdAt: String(row.created_at),
});

export class LibSqlUserRepository implements UserRepository {
  constructor(
    private readonly db: SqlExecutor,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  /**
   * The UNIQUE constraint is the real check, not the lookup the use case does
   * first. Two simultaneous sign-ups for the same address both pass that
   * lookup; only one survives the insert, and translating the constraint
   * failure here is what turns the race into a clean 409 instead of a 500.
   */
  async create(user: NewUser): Promise<User> {
    const row = { id: this.ids.newId(), createdAt: this.clock.now().toISOString() };
    try {
      await this.db.execute({
        sql: `INSERT INTO users (id, email, display_name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)`,
        args: [row.id, user.email, user.displayName, user.passwordHash, row.createdAt],
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictError(`An account already exists for ${user.email}.`);
      throw error;
    }
    return { id: row.id, email: user.email, displayName: user.displayName, createdAt: row.createdAt };
  }

  async findById(id: string): Promise<User | null> {
    const { rows } = await this.db.execute({ sql: 'SELECT * FROM users WHERE id = ?', args: [id] });
    return rows[0] ? toUser(rows[0]) : null;
  }

  /** The column collates NOCASE, so `Ada@Example.com` finds `ada@example.com`. */
  async findByEmail(email: string): Promise<UserCredentials | null> {
    const { rows } = await this.db.execute({ sql: 'SELECT * FROM users WHERE email = ?', args: [email] });
    const row = rows[0];
    return row ? { user: toUser(row), passwordHash: String(row.password_hash) } : null;
  }
}

const isUniqueViolation = (error: unknown): boolean =>
  error instanceof Error && /UNIQUE constraint failed/i.test(error.message);

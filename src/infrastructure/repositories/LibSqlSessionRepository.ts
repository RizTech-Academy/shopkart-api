import type { SqlExecutor } from '@/src/infrastructure/db/executor';
import type { Session } from '@/src/domain/entities';
import type { Clock, IdGenerator, SessionRepository } from '@/src/domain/ports';

export class LibSqlSessionRepository implements SessionRepository {
  constructor(
    private readonly db: SqlExecutor,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async create(): Promise<Session> {
    const session: Session = { id: this.ids.newId(), createdAt: this.clock.now().toISOString() };
    await this.db.execute({
      sql: 'INSERT INTO sessions (id, created_at) VALUES (?, ?)',
      args: [session.id, session.createdAt],
    });
    return session;
  }

  async findById(id: string): Promise<Session | null> {
    const { rows } = await this.db.execute({ sql: 'SELECT * FROM sessions WHERE id = ?', args: [id] });
    const row = rows[0];
    return row ? { id: String(row.id), createdAt: String(row.created_at) } : null;
  }
}

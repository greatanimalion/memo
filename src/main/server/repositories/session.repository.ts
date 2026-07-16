import { DatabaseHelper } from '@main/server/db';
import type { Session } from '@type';

export class SessionRepository {
  private dbHelper: DatabaseHelper;

  constructor() {
    this.dbHelper = DatabaseHelper.getInstance();
  }

  getAll(): Session[] {
    return this.dbHelper.session.getAllSessions();
  }

  getById(id: string): Session | undefined {
    return this.dbHelper.session.findSessionById(id);
  }

  create(session: Session): Session {
    return this.dbHelper.session.addSession(session);
  }

  update(id: string, updates: Partial<Session>): Session | null {
    return this.dbHelper.session.updateSession(id, updates);
  }

  delete(id: string): boolean {
    return this.dbHelper.session.deleteSession(id);
  }
}
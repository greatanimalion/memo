import Database from "better-sqlite3";
import { BaseDatabase } from "@main/server/db/base";

export class SessionDatabase extends BaseDatabase {
  constructor(db: Database.Database) {
    super(db);
  }
  public getAllSessions(): any[] {
    const stmt = this.db.prepare("SELECT * FROM sessions");
    const rows = stmt.all() as any[];
    return rows.map((row) => ({
      ...row,
      messages: JSON.parse(row.messages),
    }));
  }

  public addSession(session: any): any {
    const stmt = this.db.prepare(`
      INSERT INTO sessions (id, title, lastUpdated, messages, description) VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(
      session.id,
      session.title || "新的会话",
      session.lastUpdated,
      JSON.stringify(session.messages),
      session.description || null,
    );
    return session;
  }

  public updateSession(id: string, updates: any): any {
    const fields = Object.keys(updates)
      .filter((key) => key !== "id")
      .map((key) => `${key} = ?`);

    const values = Object.entries(updates)
      .filter(([key]) => key !== "id")
      .map(([key, value]) => {
        if (key === "messages") {
          return JSON.stringify(value);
        }
        return value;
      });

    if (fields.length === 0) return null;

    const stmt = this.db.prepare(`
      UPDATE sessions SET ${fields.join(", ")} WHERE id = ?
    `);
    stmt.run(...values, id);

    const selectStmt = this.db.prepare("SELECT * FROM sessions WHERE id = ?");
    const row = selectStmt.get(id) as any;
    if (row) {
      return {
        ...row,
        messages: JSON.parse(row.messages),
      };
    }
    return null;
  }

  public deleteSession(id: string): boolean {
    const stmt = this.db.prepare("DELETE FROM sessions WHERE id = ?");
    const result = stmt.run(id);
    return result.changes > 0;
  }

  public findSessionById(id: string): any {
    const stmt = this.db.prepare("SELECT * FROM sessions WHERE id = ?");
    const row = stmt.get(id) as any;
    if (row) {
      return {
        ...row,
        messages: JSON.parse(row.messages),
      };
    }
    return undefined;
  }
}

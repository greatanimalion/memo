import Database from "better-sqlite3";
import { BaseDatabase } from "@main/server/db/base";

export class BookAgentDatabase extends BaseDatabase {
  constructor(db: Database.Database) {
    super(db);
  }

  private parseRow(row: any): any {
    if (!row) return row;
    return {
      ...row,
      messages: typeof row.messages === "string" ? JSON.parse(row.messages || "[]") : row.messages || [],
    };
  }

  public getByBookId(bookId: string): any[] {
    const stmt = this.db.prepare("SELECT * FROM bookAgent WHERE bookId = ? ORDER BY createdAt DESC");
    const rows = stmt.all(bookId) as any[];
    return rows.map((row) => this.parseRow(row));
  }

  public getById(id: string): any | undefined {
    const stmt = this.db.prepare("SELECT * FROM bookAgent WHERE id = ?");
    const row = stmt.get(id) as any;
    return this.parseRow(row);
  }

  public add(data: any): any {
    const now = Date.now();
    const stmt = this.db.prepare(`
      INSERT INTO bookAgent (id, bookId, title, messages, status, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      data.id,
      data.bookId,
      data.title || "",
      JSON.stringify(data.messages || []),
      data.status || "running",
      now,
      now,
    );
    return this.parseRow({ ...data, createdAt: now, updatedAt: now });
  }

  public update(id: string, updates: any): any | null {
    const allowedKeys = ["title", "messages", "status"];
    updates.updatedAt = Date.now();
    const fields = Object.keys(updates)
      .filter((key) => allowedKeys.includes(key) || key === "updatedAt")
      .map((key) => `${key} = ?`);

    const values = Object.entries(updates)
      .filter(([key]) => allowedKeys.includes(key) || key === "updatedAt")
      .map(([key, value]) => {
        if (key === "messages") return JSON.stringify(value);
        return value;
      });

    if (fields.length === 0) return null;

    const stmt = this.db.prepare(`
      UPDATE bookAgent SET ${fields.join(", ")} WHERE id = ?
    `);
    stmt.run(...values, id);

    const selectStmt = this.db.prepare("SELECT * FROM bookAgent WHERE id = ?");
    const row = selectStmt.get(id) as any;
    return this.parseRow(row);
  }

  public delete(id: string): boolean {
    const stmt = this.db.prepare("DELETE FROM bookAgent WHERE id = ?");
    const result = stmt.run(id);
    return result.changes > 0;
  }

  public deleteByBookId(bookId: string): boolean {
    const stmt = this.db.prepare("DELETE FROM bookAgent WHERE bookId = ?");
    const result = stmt.run(bookId);
    return result.changes > 0;
  }
}

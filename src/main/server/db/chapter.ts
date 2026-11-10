import Database from "better-sqlite3";
import { BaseDatabase } from "@main/server/db/base";

export class ChapterDatabase extends BaseDatabase {
  constructor(db: Database.Database) {
    super(db);
  }

  private parseRow(row: any): any {
    if (!row) return row;
    return {
      ...row,
      metadata: typeof row.metadata === "string" ? JSON.parse(row.metadata || "{}") : row.metadata || {},
    };
  }

  public getByBookId(bookId: string): any[] {
    const stmt = this.db.prepare("SELECT * FROM chapters WHERE bookId = ? ORDER BY `order` ASC");
    const rows = stmt.all(bookId) as any[];
    return rows.map((row) => this.parseRow(row));
  }

  public getMetaByBookId(bookId: string): any[] {
    const stmt = this.db.prepare(
      "SELECT id, bookId, title, wordCount, volumeId, `order`, createdAt, updatedAt FROM chapters WHERE bookId = ? ORDER BY `order` ASC"
    );
    return stmt.all(bookId) as any[];
  }

  public getById(id: string): any | undefined {
    const stmt = this.db.prepare("SELECT * FROM chapters WHERE id = ?");
    const row = stmt.get(id) as any;
    return this.parseRow(row);
  }

  public addChapter(chapter: any): any {
    const now = Date.now();
    const stmt = this.db.prepare(`
      INSERT INTO chapters (id, bookId, title, content, wordCount, volumeId, \`order\`, createdAt, updatedAt, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      chapter.id,
      chapter.bookId,
      chapter.title,
      chapter.content || "",
      chapter.wordCount || 0,
      chapter.volumeId || null,
      chapter.order || 0,
      chapter.createdAt || now,
      chapter.updatedAt || now,
      JSON.stringify(chapter.metadata || {}),
    );
    return this.parseRow({ ...chapter, createdAt: now, updatedAt: now });
  }

  public updateChapter(id: string, updates: any): any | null {
    updates.updatedAt = Date.now();
    const fields = Object.keys(updates)
      .filter((key) => key !== "id")
      .map((key) => `${key} = ?`);

    const values = Object.entries(updates)
      .filter(([key]) => key !== "id")
      .map(([key, value]) => {
        if (key === "metadata") return JSON.stringify(value);
        return value;
      });

    if (fields.length === 0) return null;

    const stmt = this.db.prepare(`
      UPDATE chapters SET ${fields.join(", ")} WHERE id = ?
    `);
    stmt.run(...values, id);

    return this.getById(id) || null;
  }

  public deleteChapter(id: string): boolean {
    const stmt = this.db.prepare("DELETE FROM chapters WHERE id = ?");
    const result = stmt.run(id);
    return result.changes > 0;
  }

  public deleteByBookId(bookId: string): boolean {
    const stmt = this.db.prepare("DELETE FROM chapters WHERE bookId = ?");
    const result = stmt.run(bookId);
    return result.changes > 0;
  }

  public getMaxOrder(bookId: string): number {
    const stmt = this.db.prepare("SELECT MAX(\`order\`) as maxOrder FROM chapters WHERE bookId = ?");
    const row = stmt.get(bookId) as any;
    return row?.maxOrder || 0;
  }
}

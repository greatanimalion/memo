import Database from "better-sqlite3";
import { BaseDatabase } from "@main/server/db/base";

export class VolumeDatabase extends BaseDatabase {
  constructor(db: Database.Database) {
    super(db);
  }

  public getByBookId(bookId: string): any[] {
    const stmt = this.db.prepare("SELECT * FROM volumes WHERE bookId = ? ORDER BY `order` ASC");
    return stmt.all(bookId) as any[];
  }

  public getById(id: string): any | undefined {
    const stmt = this.db.prepare("SELECT * FROM volumes WHERE id = ?");
    return stmt.get(id) as any;
  }

  public addVolume(volume: any): any {
    const now = Date.now();
    const stmt = this.db.prepare(`
      INSERT INTO volumes (id, bookId, title, \`order\`, createdAt) VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(
      volume.id,
      volume.bookId,
      volume.title,
      volume.order || 0,
      volume.createdAt || now,
    );
    return { ...volume, createdAt: now };
  }

  public updateVolume(id: string, updates: any): any | null {
    const fields = Object.keys(updates)
      .filter((key) => key !== "id")
      .map((key) => `${key} = ?`);

    const values = Object.values(updates).filter((_, i) => Object.keys(updates)[i] !== "id");

    if (fields.length === 0) return null;

    const stmt = this.db.prepare(`
      UPDATE volumes SET ${fields.join(", ")} WHERE id = ?
    `);
    stmt.run(...values, id);

    return this.getById(id) || null;
  }

  public deleteVolume(id: string): boolean {
    const stmt = this.db.prepare("DELETE FROM volumes WHERE id = ?");
    const result = stmt.run(id);
    return result.changes > 0;
  }

  public deleteByBookId(bookId: string): boolean {
    const stmt = this.db.prepare("DELETE FROM volumes WHERE bookId = ?");
    const result = stmt.run(bookId);
    return result.changes > 0;
  }

  public getMaxOrder(bookId: string): number {
    const stmt = this.db.prepare("SELECT MAX(\`order\`) as maxOrder FROM volumes WHERE bookId = ?");
    const row = stmt.get(bookId) as any;
    return row?.maxOrder || 0;
  }
}

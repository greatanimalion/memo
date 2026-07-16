import Database from 'better-sqlite3';
import { Memory } from '@type/memory';
import { BaseDatabase } from '@main/server/db/base';
type PartialMemory = Partial<Memory> 
export class MemoryDatabase extends BaseDatabase {
  constructor(db: Database.Database) {
    super(db);
  }
  public getAllMemorys(): any[] {
    const stmt = this.db.prepare('SELECT * FROM memorys');
     return stmt.all() as Memory[];
  }
  public addMemory(memory: Memory): Memory {
    const stmt = this.db.prepare(`
      INSERT INTO memorys (id, isFolder, title, fileUrl, parentId, created, updated, visitedTime, size, starred)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      memory.id,
      memory.isFolder,
      memory.title,
      memory.fileUrl,
      memory.parentId,
      memory.created,
      memory.updated,
      memory.visitedTime,
      memory.size,
      memory.starred??0
    );
    return memory;
  }

  public updateMemory(id: string, updates: PartialMemory): PartialMemory | null {
    const fields = Object.keys(updates)
      .filter((key) => key !== 'id')
      .map((key) => {
        return `${key} = ?`;
      });

    const values = Object.entries(updates)
      .filter(([key]) => key !== 'id')
      .map(([_key, value]) => {
        return value;
      });

    if (fields.length === 0) return null;

    const stmt = this.db.prepare(`
      UPDATE memorys SET ${fields.join(', ')} WHERE id = ?
    `);
    stmt.run(...values, id);
    return updates;
  }

  public deleteMemory(id: string): boolean {
    const stmt = this.db.prepare('DELETE FROM memorys WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  public findMemoryById(id: string): any {
    const stmt = this.db.prepare('SELECT * FROM memorys WHERE id = ?');
    return stmt.get(id) as any;
  }
  public getStarredMemorys(){
    const stmt=this.db.prepare('SELECT * FROM memorys WHERE starred = 1');
    return stmt.all() as any[];
  }
  public getMemoryChildren(parentId: string): any[] {
    const stmt = this.db.prepare('SELECT * FROM memorys WHERE parentId = ?');
    return stmt.all(parentId) as any[];
    
  }
}
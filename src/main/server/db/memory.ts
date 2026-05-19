import { Memory } from '../../../types';
import { BaseDatabase } from './base';

export class MemoryDatabase extends BaseDatabase {
  public getAllMemorys(): any[] {
    const stmt = this.db.prepare('SELECT * FROM memorys');
     return stmt.all() as Memory[];
  }
  public addMemory(memory: Memory): Memory {
    const stmt = this.db.prepare(`
      INSERT INTO memorys (id, isFolder, title, content, parentId, created, updated, visitedTime, size, starred)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      memory.id,
      memory.isFolder,
      memory.title,
      memory.content,
      memory.parentId,
      memory.created,
      memory.updated,
      memory.visitedTime,
      memory.size,
      memory.starred
    );
    return memory;
  }

  public updateMemory(id: string, updates: any): Memory | null {
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
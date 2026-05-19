import { MemoryDatabase } from './memory';
import { DiaryDatabase } from './diary';
import { SessionDatabase } from './session';
import { AgentDatabase } from './agent';
import { BookDatabase } from './book';
import { getDatabasePath } from './base';

export class DatabaseHelper {
  private static instance: DatabaseHelper;
  public memory: MemoryDatabase;
  public diary: DiaryDatabase;
  public session: SessionDatabase;
  public agent: AgentDatabase;
  public book: BookDatabase;
  private constructor() {
    this.memory = new MemoryDatabase();
    this.diary = new DiaryDatabase();
    this.session = new SessionDatabase();
    this.agent = new AgentDatabase();
    this.book = new BookDatabase();
  }

  public static getInstance(): DatabaseHelper {
    if (!DatabaseHelper.instance) {
      DatabaseHelper.instance = new DatabaseHelper();
    }
    return DatabaseHelper.instance;
  }

  public close(): void {
    this.memory.close();
  }

  public getDatabaseSize(): number {
    try {
      const fs = require('fs');
      let dbPath = getDatabasePath();
      const stats = fs.statSync(dbPath);
      return stats.size;
    } catch {
      return 0;
    }
  }
}

export { MemoryDatabase } from './memory';
export { DiaryDatabase } from './diary';
export { SessionDatabase } from './session';
export { AgentDatabase } from './agent';
export { BookDatabase } from './book';
export { BaseDatabase } from './base';
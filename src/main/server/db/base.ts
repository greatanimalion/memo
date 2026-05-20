import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { getSystemRootDir } from '../utils/utils';
import { createTablesSql } from '../constants/sql';


export function getDatabasePath(): string {
  const env = process.env.NODE_ENV;
  if (env === 'development') {
    return path.join(__dirname, '../data/', 'storage.db');
  }
  const systemRoot = getSystemRootDir();
  return path.join(systemRoot, '.MemoryData/', 'storage.db');
}

export class BaseDatabase {
  protected db: Database.Database;
  constructor() {
    let dbPath=getDatabasePath();
    const dbDir = path.dirname(dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.initTables();
  }

  private initTables(): void {
    this.db.exec(createTablesSql);
  }

  public close(): void {
    this.db.close();
  }
}

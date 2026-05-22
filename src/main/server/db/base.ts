import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { getDatabasePath } from '../utils/utils';
import { createTablesSql } from '../constants/sql';
import { databaseConfig } from '../config/database.config';
export class BaseDatabase {
  protected db: Database.Database;
  constructor() {
    let dbPath=getDatabasePath();
    const dbDir = path.dirname(dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    this.db = new Database(dbPath);
    this.db.pragma(databaseConfig.journalMode);
    this.initTables();
  }

  private initTables(): void {
    this.db.exec(createTablesSql);
  }

  public close(): void {
    this.db.close();
  }
}

import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { MemoryDatabase } from "./memory";
import { DiaryDatabase } from "./diary";
import { SessionDatabase } from "./session";
import { AgentDatabase } from "./agent";
import { BookDatabase } from "./book";
import { getDatabasePath } from "../utils/utils";
import { createTablesSql } from "../constants/sql";
import { databaseConfig } from "../config/database.config";

export class DatabaseHelper {
  private static instance: DatabaseHelper;
  private db: Database.Database;
  public memory: MemoryDatabase;
  public diary: DiaryDatabase;
  public session: SessionDatabase;
  public agent: AgentDatabase;
  public book: BookDatabase;

  private constructor() {
    let dbPath = getDatabasePath();
    const dbDir = path.dirname(dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    this.db = new Database(dbPath);
    this.db.pragma(databaseConfig.journalMode);
    this.db.exec(createTablesSql);

    this.memory = new MemoryDatabase(this.db);
    this.diary = new DiaryDatabase(this.db);
    this.session = new SessionDatabase(this.db);
    this.agent = new AgentDatabase(this.db);
    this.book = new BookDatabase(this.db);
  }

  public static getInstance(): DatabaseHelper {
    if (!DatabaseHelper.instance) {
      DatabaseHelper.instance = new DatabaseHelper();
    }
    return DatabaseHelper.instance;
  }

  public close(): void {
    this.db.close();
    DatabaseHelper.instance = null!;
  }

  public getDatabaseSize(): number {
    try {
      let dbPath = getDatabasePath();
      const stats = fs.statSync(dbPath);
      return stats.size;
    } catch {
      return 0;
    }
  }
}

export { MemoryDatabase } from "./memory";
export { DiaryDatabase } from "./diary";
export { SessionDatabase } from "./session";
export { AgentDatabase } from "./agent";
export { BookDatabase } from "./book";
export { BaseDatabase } from "./base";

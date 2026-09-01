import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { MemoryDatabase } from "@main/server/db/memory";
import { DiaryDatabase } from "@main/server/db/diary";
import { SessionDatabase } from "@main/server/db/session";
import { AgentDatabase } from "@main/server/db/agent";
import { BookDatabase } from "@main/server/db/book";
import { ChapterDatabase } from "@main/server/db/chapter";
import { VolumeDatabase } from "@main/server/db/volume";
import { getDatabasePath } from "@main/server/utils/utils";
import { createTablesSql } from "@main/server/constants/sql";
import { databaseConfig } from "@main/server/config/database.config";
import { logger } from "@main/server/utils/logger";

export class DatabaseHelper {
  private static instance: DatabaseHelper;
  private db: Database.Database;
  public memory: MemoryDatabase;
  public diary: DiaryDatabase;
  public session: SessionDatabase;
  public agent: AgentDatabase;
  public book: BookDatabase;
  public chapter: ChapterDatabase;
  public volume: VolumeDatabase;

  private constructor() {
    let dbPath = getDatabasePath();
    const dbDir = path.dirname(dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    this.db = new Database(dbPath);
    this.db.pragma(databaseConfig.journalMode);
    this.db.exec(createTablesSql);
    this.runMigrations();

    this.memory = new MemoryDatabase(this.db);
    this.diary = new DiaryDatabase(this.db);
    this.session = new SessionDatabase(this.db);
    this.agent = new AgentDatabase(this.db);
    this.book = new BookDatabase(this.db);
    this.chapter = new ChapterDatabase(this.db);
    this.volume = new VolumeDatabase(this.db);
  }

  private runMigrations(): void {
    const migrations = [
      "ALTER TABLE books DROP COLUMN author",
      "ALTER TABLE books ADD COLUMN volumes TEXT NOT NULL DEFAULT '[]'",
      "ALTER TABLE books ADD COLUMN settings TEXT NOT NULL DEFAULT '{}'",
      "ALTER TABLE books ADD COLUMN tags TEXT NOT NULL DEFAULT '[]'",
      "ALTER TABLE books ADD COLUMN description TEXT NOT NULL DEFAULT ''",
      "ALTER TABLE books ADD COLUMN createdAt INTEGER NOT NULL DEFAULT 0",
      "ALTER TABLE books ADD COLUMN updatedAt INTEGER NOT NULL DEFAULT 0",
    ];
    for (const sql of migrations) {
      try {
        this.db.exec(sql);
        logger.info(`迁移成功: ${sql}`);
      } catch {
        // 列已存在，忽略
      }
    }
  }

  public static getInstance(): DatabaseHelper {
    if (!DatabaseHelper.instance) {
      DatabaseHelper.instance = new DatabaseHelper();
    }
    return DatabaseHelper.instance;
  }

  public close(): void {
    this.db.close();
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

export { MemoryDatabase } from "@main/server/db/memory";
export { DiaryDatabase } from "@main/server/db/diary";
export { SessionDatabase } from "@main/server/db/session";
export { AgentDatabase } from "@main/server/db/agent";
export { BookDatabase } from "@main/server/db/book";
export { ChapterDatabase } from "@main/server/db/chapter";
export { VolumeDatabase } from "@main/server/db/volume";
export { BaseDatabase } from "@main/server/db/base";

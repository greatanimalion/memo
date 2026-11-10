import fs from "fs";
import path from "path";
import { DatabaseHelper } from "@main/server/db";
import { getSystemRootDir } from "@main/server/utils/utils";
import { logger } from "@main/server/utils/logger";

export class StorageService {
  private dbHelper: DatabaseHelper;
  private dbPath: string;

  constructor() {
    this.dbHelper = DatabaseHelper.getInstance();
    this.dbPath = this.resolveDbPath();
  }

  private resolveDbPath(): string {
    const env = process.env.NODE_ENV;
    if (env === "development") {
      return path.join(__dirname, "../../data/", "storage.db");
    }
    return path.join(getSystemRootDir(), ".MemoryData/", "storage.db");
  }

  close(): void {
    this.dbHelper.close();
  }

  async init(): Promise<void> {
    logger.info("数据库存储已初始化");
  }

  async exportStorage(): Promise<Buffer | null> {
    try {
      return fs.readFileSync(this.dbPath);
    } catch {
      return null;
    }
  }

  async getCacheSize(): Promise<number> {
    return this.dbHelper.getDatabaseSize();
  }

  async writeData(dbBuffer: Buffer): Promise<boolean> {
    if (!dbBuffer) {
      return false;
    }
    try {
      const dirPath = path.dirname(this.dbPath);
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }
      fs.writeFileSync(this.dbPath, dbBuffer);
      return true;
    } catch {
      return false;
    }
  }
}

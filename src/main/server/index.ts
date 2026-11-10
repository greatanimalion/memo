import express from "express";
import http from "http";
import path from "path";
import fs from "fs/promises";
import multer from "multer";
import cors from "cors";
import { getSystemRootDir, getUploadPath } from "@main/server/utils/utils";
import { StorageService } from "@main/server/services/storage.service";
import { logger } from "@main/server/utils/logger";
import memoryRoutes from "@main/server/routes/memory.routes";
import diaryRoutes from "@main/server/routes/diary.routes";
import sessionRoutes from "@main/server/routes/session.routes";
import agentRoutes from "@main/server/routes/agent.routes";
import aiRoutes from "@main/server/routes/ai.routes";
import bookRoutes from "@main/server/routes/book.routes";
import bookAgentRoutes from "@main/server/routes/bookAgent.routes";

import {
  loggerMiddleware,
  notFoundMiddleware,
  errorMiddleware,
} from "@main/server/middleware/error.middleware";

let server: http.Server | null = null;
let uploadDir: string;
let storageService: StorageService | null = null;

async function ensureDirExists(dir: string): Promise<void> {
  try {
    await fs.access(dir);
  } catch {
    await fs.mkdir(dir, { recursive: true });
  }
}

export const createUploadDirectory = async (env: any): Promise<void> => {
  if (env === "development") {
    uploadDir = path.join(__dirname, "../data/", "uploads");
    logger.info(`[开发环境] 上传目录路径: ${uploadDir}`);
  } else {
    uploadDir = path.join(getSystemRootDir(), ".MemoryData/", "uploads");
    logger.info(`[生产环境] 将创建上传目录于: ${uploadDir}`);
  }

  await fs.mkdir(uploadDir, { recursive: true }).catch((error: any) => {
    logger.error(`创建上传目录失败: ${(error as Error).message}`);
    throw error;
  });
};

export async function startExpressServer(): Promise<void> {
  storageService = new StorageService();
  const expressApp = express();
  const port = 32068;
  expressApp.use(cors());
  expressApp.use(express.json({ limit: "100mb" }));
  async function getDateBasedUploadDir(baseDir: string): Promise<string> {
    const date = new Date();
    const year = date.getFullYear().toString();
    const month = (date.getMonth() + 1).toString().padStart(2, "0");
    const day = date.getDate().toString().padStart(2, "0");
    const dateDir = path.join(baseDir, year, month, day);
    await ensureDirExists(dateDir);
    return dateDir;
  }
  const storage = multer.diskStorage({
    destination: async (_req, _file, cb) => {
      const dateDir = await getDateBasedUploadDir(getUploadPath().imagePath);
      cb(null, dateDir);
    },
    filename: (_req, file, cb) => {
      const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
      const ext = path.extname(file.originalname);
      cb(null, file.fieldname + "-" + uniqueSuffix + ext);
    },
  });

  const upload = multer({
    storage,
    limits: { fileSize: 50 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      const allowedTypes = [
        "image/jpeg",
        "image/jpg",
        "image/png",
        "image/gif",
        "image/svg+xml",
        "image/webp",
        "audio/mpeg",
        "audio/wav",
        "audio/ogg",
        "audio/aac",
        "audio/midi",
        "video/mp4",
      ];
      if (!allowedTypes.includes(file.mimetype)) {
        const error = new Error("只允许上传图片、音频或视频格式文件");
        return cb(error as any, false);
      }
      cb(null, true);
    },
  });

  expressApp.use("/api", loggerMiddleware);

  expressApp.use("/api", memoryRoutes);
  expressApp.use("/api", diaryRoutes);
  expressApp.use("/api", sessionRoutes);
  expressApp.use("/api", agentRoutes);
  expressApp.use("/api", aiRoutes);
  expressApp.use("/api", bookRoutes);
  expressApp.use("/api", bookAgentRoutes);

  expressApp.get("/api/memorySize", async (_req, res) => {
    try {
      const service = new StorageService();
      await service.init();
      const cacheSize = await service.getCacheSize();
      res.json({ code: 200, data: cacheSize, message: "success" });
    } catch (error) {
      logger.error("获取存储数据失败:", error);
      res.status(500).json({ code: 500, error: "获取存储数据失败" });
    }
  });
  
  expressApp.use("/api", notFoundMiddleware);
  expressApp.use(errorMiddleware);

  expressApp.post("/upload",
    upload.single("file"),
    (req: any, res: any, next: any) => {
      try {
        if (!req.file) {
          return res.status(400).json({ error: "No file uploaded" });
        }
        const relativePath = path.relative(uploadDir, req.file.path);
        res.json({
          code: 200,
          message: "File uploaded successfully",
          data: {
            url: `/uploads/${relativePath.replace(/\\/g, "/")}`,
            filename: req.file.filename,
            originalname: req.file.originalname,
          },
        });
      } catch (error) {
        next(error);
      }
    },
  );

  expressApp.use("/uploads", express.static(uploadDir));
  expressApp.delete("/deleteFile", async (req: any, res: any) => {
    try {
      const { filePath } = req.body;
      if (!filePath) {
        return res
          .status(400)
          .json({ code: 400, error: "File path is required" });
      }
      const fullPath = path.join(uploadDir, ...filePath.split("/"));

      try {
        await fs.access(fullPath);
      } catch {
        return res.status(404).json({ code: 404, error: "File not found" });
      }

      await fs.unlink(fullPath);

      const getAllFiles = async (
        dirPath: string,
      ): Promise<Array<{ name: string; path: string }>> => {
        const files: Array<{ name: string; path: string }> = [];
        const entries = await fs.readdir(dirPath, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dirPath, entry.name);
          const relativePath = path.relative(uploadDir, fullPath);
          if (entry.isDirectory()) {
            const subFiles = await getAllFiles(fullPath);
            files.push(...subFiles);
          } else {
            files.push({
              name: entry.name,
              path: relativePath.replace(/\\/g, "/"),
            });
          }
        }
        return files;
      };

      const files = await getAllFiles(uploadDir);
      res.json({
        code: 200,
        message: "File deleted successfully",
        data: files,
      });
    } catch (error) {
      logger.error("Error deleting file:", error);
      res.status(500).json({ code: 500, error: "Failed to delete file" });
    }
  });

  server = expressApp.listen(port, () => {
    logger.info(`Express server running at http://localhost:${port}`);
  });
}

export function stopExpressServer(): void {
  if (server) {
    server.close(() => {
      if (storageService) storageService.close();
      logger.info("Express server stopped");
    });
    server = null;
  }
}

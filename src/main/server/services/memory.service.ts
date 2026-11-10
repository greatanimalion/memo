import { MemoryRepository } from "../repositories/memory.repository";
import type { Memory } from "../../../types";
import path from "path";
import fs from "fs";
import { getUploadPath } from "../utils/utils";

export class MemoryService {
  private memoryRepository: MemoryRepository;

  constructor() {
    this.memoryRepository = new MemoryRepository();
  }

  private createMemoFile(content: string): string {
    const uploadDir = getUploadPath().filePath;
    const date = new Date();
    const year = date.getFullYear().toString();
    const month = (date.getMonth() + 1).toString().padStart(2, "0");
    const day = date.getDate().toString().padStart(2, "0");
    const dateDir = path.join(uploadDir, year, month, day);
    fs.mkdirSync(dateDir, { recursive: true });
    const uniqueSuffix = Date.now();
    const filename = `memo-${uniqueSuffix}.html`;
    const filePath = path.join(dateDir, filename);
    fs.writeFileSync(filePath, content, "utf-8");
    const relativePath = path.relative(uploadDir, filePath);
    return `/uploads/files/${relativePath.replace(/\\/g, "/")}`;
  }
  private deleteMemoFile(fileUrl: string): void {
    const uploadDir = getUploadPath().filePath;
    const filePath = path.join(
      uploadDir,
      fileUrl.replace("/uploads/files/", ""),
    );
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
  private updateMemoFile(fileUrl: string, newContent: string): number {
    const uploadDir = getUploadPath().filePath;
    const filePath = path.join(
      uploadDir,
      fileUrl.replace("/uploads/files/", ""),
    );
    if (fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, newContent, "utf-8");
    }
    //返回文件大小
    return fs.existsSync(filePath) ? fs.statSync(filePath).size : 0;
  }

  getAll(): Memory[] {
    return this.memoryRepository.getAll();
  }

  getById(id: string): Memory | null {
    const memory = this.memoryRepository.getById(id);
    if (memory && !memory.isFolder) {
      this.memoryRepository.update(id, { visitedTime: Date.now() });
    }
    return memory || null;
  }

  getChildren(parentId: string): Memory[] {
    return this.memoryRepository.getChildren(parentId);
  }

  create(data: Memory): Memory {
    console.log(data)
    if(!data.isFolder)data.fileUrl = this.createMemoFile("");
    return this.memoryRepository.create(data);
  }

  update(
    id: string,
    data: Partial<Memory>,
    content: string,
  ): Partial<Memory> | null {
    if (data.fileUrl&&content) {
      const size = this.updateMemoFile(data.fileUrl, content || "");
      data.size = size;
    }
    return this.memoryRepository.update(id, data);
  }

  delete(id: string): boolean {
    const memory = this.memoryRepository.getById(id);
    if (memory && memory.fileUrl) {
      this.deleteMemoFile(memory.fileUrl);
    }
    return this.memoryRepository.delete(id);
  }

  getRecent(days: number = 5): Memory[] {
    const memorys = this.getAll();
    const threshold = Date.now() - days * 24 * 60 * 60 * 1000;
    return memorys
      .filter((m) => !m.isFolder && Number(m.visitedTime) >= threshold)
      .sort((a, b) => Number(b.visitedTime) - Number(a.visitedTime));
  }

  getStarred(): Memory[] {
    return this.memoryRepository.getStarred();
  }

  toggleStar(id: string): {
    memory: Partial<Memory> | null;
    wasStarred: number;
  } {
    const memory = this.memoryRepository.getById(id);
    if (!memory) {
      return { memory: null, wasStarred: 0 };
    }
    const wasStarred = memory.starred ? 0 : 1;
    const updated = this.memoryRepository.update(id, { starred: wasStarred });
    return { memory: updated, wasStarred: wasStarred };
  }
}

import { DatabaseHelper } from "../db";
import type { Memory } from "../../../types";

export class MemoryRepository {
  private dbHelper: DatabaseHelper;

  constructor() {
    this.dbHelper = DatabaseHelper.getInstance();
  }

  getAll(): Memory[] {
    return this.dbHelper.memory.getAllMemorys();
  }

  getById(id: string): Memory | undefined {
    return this.dbHelper.memory.findMemoryById(id);
  }
  getStarred(): Memory[] {
    return this.dbHelper.memory.getStarredMemorys();
  }
  getChildren(parentId: string): Memory[] {
    return this.dbHelper.memory.getMemoryChildren(parentId);
  }

  create(memory: Memory): Memory {
    return this.dbHelper.memory.addMemory(memory);
  }

  update(id: string, updates: Partial<Memory>): Memory | null {
    return this.dbHelper.memory.updateMemory(id, updates);
  }

  delete(id: string): boolean {
    return this.dbHelper.memory.deleteMemory(id);
  }
}

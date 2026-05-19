import { MemoryRepository } from '../repositories/memory.repository';
import type { Memory } from '../../../types';

export class MemoryService {
  private memoryRepository: MemoryRepository;

  constructor() {
    this.memoryRepository = new MemoryRepository();
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
    return this.memoryRepository.create(data);
  }

  update(id: string, data: Partial<Memory>): Memory | null {
    return this.memoryRepository.update(id, data);
  }

  delete(id: string): boolean {
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

  toggleStar(id: string): { memory: Memory | null; wasStarred:number } {
    const memory = this.memoryRepository.getById(id);
    if (!memory) {
      return { memory: null, wasStarred:0 };
    }
    const wasStarred = memory.starred||0;
    const updated = this.memoryRepository.update(id, { starred: wasStarred });
    return { memory: updated, wasStarred: wasStarred };
  }
}

import { AgentRepository } from "@main/server/repositories/agent.repository";
import type { MyAgent } from "@type";

export class AgentService {
  private agentRepository: AgentRepository;

  constructor() {
    this.agentRepository = new AgentRepository();
  }

  getAll(): MyAgent[] {
    return this.agentRepository.getAll();
  }

  getById(id: string): MyAgent | null {
    return this.agentRepository.getById(id) || null;
  }

  create(data: MyAgent): MyAgent {
    return this.agentRepository.create(data);
  }

  update(id: string, data: Partial<MyAgent>): MyAgent | null {
    return this.agentRepository.update(id, data);
  }

  delete(id: string): boolean {
    return this.agentRepository.delete(id);
  }
}

import { DatabaseHelper } from '../db';
import type { MyAgent } from '../../../types';

export class AgentRepository {
  private dbHelper: DatabaseHelper;

  constructor() {
    this.dbHelper = DatabaseHelper.getInstance();
  }

  getAll(): MyAgent[] {
    return this.dbHelper.agent.getAllAgents();
  }

  getById(id: string): MyAgent | undefined {
    return this.dbHelper.agent.findAgentById(id);
  }

  create(agent: MyAgent): MyAgent {
    return this.dbHelper.agent.addAgent(agent);
  }

  update(id: string, updates: Partial<MyAgent>): MyAgent | null {
    return this.dbHelper.agent.updateAgent(id, updates);
  }

  delete(id: string): boolean {
    return this.dbHelper.agent.deleteAgent(id);
  }
}
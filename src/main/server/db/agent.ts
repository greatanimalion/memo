import Database from 'better-sqlite3';
import { BaseDatabase } from '@main/server/db/base';

export class AgentDatabase extends BaseDatabase {
  constructor(db: Database.Database) {
    super(db);
  }
  public getAllAgents(): any[] {
    const stmt = this.db.prepare('SELECT * FROM agents');
    return stmt.all() as any[];
  }

  public addAgent(agent: any): any {
    const stmt = this.db.prepare(`
      INSERT INTO agents (id, name, description, content) VALUES (?, ?, ?, ?)
    `);
    stmt.run(agent.id, agent.name, agent.description, agent.content);
    return agent;
  }

  public updateAgent(id: string, updates: any): any {
    const fields = Object.keys(updates)
      .filter((key) => key !== 'id')
      .map((key) => `${key} = ?`);

    const values = Object.entries(updates)
      .filter(([key]) => key !== 'id')
      .map(([, value]) => value);

    if (fields.length === 0) return null;

    const stmt = this.db.prepare(`
      UPDATE agents SET ${fields.join(', ')} WHERE id = ?
    `);
    stmt.run(...values, id);

    const selectStmt = this.db.prepare('SELECT * FROM agents WHERE id = ?');
    const row = selectStmt.get(id) as any;
    return row || null;
  }

  public deleteAgent(id: string): boolean {
    const stmt = this.db.prepare('DELETE FROM agents WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  public findAgentById(id: string): any {
    const stmt = this.db.prepare('SELECT * FROM agents WHERE id = ?');
    return stmt.get(id) as any;
  }
}
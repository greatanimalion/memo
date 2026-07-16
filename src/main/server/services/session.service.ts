import { SessionRepository } from '@main/server/repositories/session.repository';
import type { Session } from '@type';

export class SessionService {
  private sessionRepository: SessionRepository;

  constructor() {
    this.sessionRepository = new SessionRepository();
  }

  getAll(): Session[] {
    return this.sessionRepository.getAll();
  }

  getById(id: string): Session | null {
    return this.sessionRepository.getById(id) || null;
  }

  create(data: Session): Session {
    return this.sessionRepository.create(data);
  }

  update(id: string, data: Partial<Session>): Session | null {
    return this.sessionRepository.update(id, data);
  }

  delete(id: string): boolean {
    return this.sessionRepository.delete(id);
  }
}

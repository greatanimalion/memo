import { BaseDatabase } from './base';

export class DiaryDatabase extends BaseDatabase {
  public getAllDiarys(): any[] {
    const stmt = this.db.prepare('SELECT * FROM diarys');
    const rows = stmt.all() as any[];
    return rows.map((row) => ({
      ...row,
      monthDiarys: JSON.parse(row.monthDiarys)
    }));
  }

  public addDiary(diary: any): any {
    const stmt = this.db.prepare(`
      INSERT INTO diarys (id, monthDiarys) VALUES (?, ?)
    `);
    stmt.run(diary.id, JSON.stringify(diary.monthDiarys));
    return diary;
  }

  public updateDiary(id: string, updates: any): any {
    const fields = Object.keys(updates)
      .filter((key) => key !== 'id')
      .map((key) => `${key} = ?`);

    const values = Object.entries(updates)
      .filter(([key]) => key !== 'id')
      .map(([key, value]) => {
        if (key === 'monthDiarys') {
          return JSON.stringify(value);
        }
        return value;
      });

    if (fields.length === 0) return null;

    const stmt = this.db.prepare(`
      UPDATE diarys SET ${fields.join(', ')} WHERE id = ?
    `);
    stmt.run(...values, id);

    const selectStmt = this.db.prepare('SELECT * FROM diarys WHERE id = ?');
    const row = selectStmt.get(id) as any;
    if (row) {
      return {
        ...row,
        monthDiarys: JSON.parse(row.monthDiarys)
      };
    }
    return null;
  }

  public deleteDiary(id: string): boolean {
    const stmt = this.db.prepare('DELETE FROM diarys WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  public findDiaryById(id: string): any {
    const stmt = this.db.prepare('SELECT * FROM diarys WHERE id = ?');
    const row = stmt.get(id) as any;
    if (row) {
      return {
        ...row,
        monthDiarys: JSON.parse(row.monthDiarys)
      };
    }
    return undefined;
  }
}
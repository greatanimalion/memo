
export interface DatabaseConfig {
  path: string;
  journalMode: string;

}

export const databaseConfig: DatabaseConfig = {
  path: ':memory:',
  journalMode: 'WAL',
};


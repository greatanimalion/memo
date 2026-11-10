export interface DatabaseConfig {
  journalMode: string;
}

export const databaseConfig: DatabaseConfig = {
  journalMode: "journal_mode = WAL",
};

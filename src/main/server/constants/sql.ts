export const createTablesSql = `
      CREATE TABLE IF NOT EXISTS memorys (
        id TEXT PRIMARY KEY,
        isFolder INTEGER NOT NULL,
        title TEXT NOT NULL,
        content TEXT,
        parentId TEXT,
        created TEXT NOT NULL,
        updated TEXT NOT NULL,
        visitedTime TEXT NOT NULL,
        size TEXT NOT NULL,
        starred INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS diarys (
        id TEXT PRIMARY KEY,
        monthDiarys TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        lastUpdated TEXT NOT NULL,
        messages TEXT NOT NULL,
        description TEXT
      );

      CREATE TABLE IF NOT EXISTS agents (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        content TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS books (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        author TEXT NOT NULL,
        cover TEXT NOT NULL,
        chapters TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS bookUtils (
        id TEXT PRIMARY KEY,
        BookID TEXT NOT NULL,
        image TEXT NOT NULL,
        type TEXT NOT NULL,
        description TEXT NOT NULL,
        list TEXT NOT NULL,
        createTime TEXT NOT NULL
      );
    `;

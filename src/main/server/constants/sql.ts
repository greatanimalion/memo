export const createTablesSql = `
      CREATE TABLE IF NOT EXISTS memorys (
        id TEXT PRIMARY KEY,
        isFolder INTEGER NOT NULL,
        title TEXT NOT NULL,
        fileUrl TEXT,
        parentId TEXT,
        created INTEGER NOT NULL,
        updated INTEGER NOT NULL,
        visitedTime INTEGER ,
        size INTEGER,
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
        cover TEXT NOT NULL DEFAULT '',
        tags TEXT NOT NULL DEFAULT '[]',
        settings TEXT NOT NULL DEFAULT '{}'
      );

      CREATE TABLE IF NOT EXISTS chapters (
        id TEXT PRIMARY KEY,
        bookId TEXT NOT NULL,
        title TEXT NOT NULL,
        content TEXT NOT NULL DEFAULT '',
        wordCount INTEGER NOT NULL DEFAULT 0,
        volumeId TEXT,
        \`order\` INTEGER NOT NULL DEFAULT 0,
        createdAt INTEGER NOT NULL DEFAULT 0,
        updatedAt INTEGER NOT NULL DEFAULT 0,
        metadata TEXT DEFAULT '{}',
        FOREIGN KEY (bookId) REFERENCES books(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS volumes (
        id TEXT PRIMARY KEY,
        bookId TEXT NOT NULL,
        title TEXT NOT NULL,
        \`order\` INTEGER NOT NULL DEFAULT 0,
        createdAt INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (bookId) REFERENCES books(id) ON DELETE CASCADE
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

      CREATE TABLE IF NOT EXISTS bookAgent (
        id TEXT PRIMARY KEY,
        bookId TEXT NOT NULL,
        title TEXT NOT NULL DEFAULT '',
        messages TEXT NOT NULL DEFAULT '[]',
        status TEXT NOT NULL DEFAULT 'running',
        createdAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL,
        FOREIGN KEY (bookId) REFERENCES books(id) ON DELETE CASCADE
      );
    `;

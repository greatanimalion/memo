package db

var schemaStatements = []string{
	"CREATE TABLE IF NOT EXISTS memorys (" +
		"id TEXT PRIMARY KEY," +
		"isFolder INTEGER NOT NULL," +
		"title TEXT NOT NULL," +
		"fileUrl TEXT," +
		"parentId TEXT," +
		"created INTEGER NOT NULL," +
		"updated INTEGER NOT NULL," +
		"visitedTime INTEGER," +
		"size INTEGER," +
		"starred INTEGER NOT NULL)",
	"CREATE TABLE IF NOT EXISTS diarys (" +
		"id TEXT PRIMARY KEY," +
		"monthDiarys TEXT NOT NULL)",
	"CREATE TABLE IF NOT EXISTS sessions (" +
		"id TEXT PRIMARY KEY," +
		"title TEXT NOT NULL," +
		"lastUpdated TEXT NOT NULL," +
		"messages TEXT NOT NULL," +
		"description TEXT)",
	"CREATE TABLE IF NOT EXISTS agents (" +
		"id TEXT PRIMARY KEY," +
		"name TEXT NOT NULL," +
		"description TEXT NOT NULL," +
		"content TEXT NOT NULL)",
	"CREATE TABLE IF NOT EXISTS books (" +
		"id TEXT PRIMARY KEY," +
		"title TEXT NOT NULL," +
		"cover TEXT NOT NULL DEFAULT ''," +
		"tags TEXT NOT NULL DEFAULT '[]'," +
		"settings TEXT NOT NULL DEFAULT '{}')",
	"CREATE TABLE IF NOT EXISTS chapters (" +
		"id TEXT PRIMARY KEY," +
		"bookId TEXT NOT NULL," +
		"title TEXT NOT NULL," +
		"content TEXT NOT NULL DEFAULT ''," +
		"aiRes TEXT NOT NULL DEFAULT ''," +
		"isAi INTEGER NOT NULL DEFAULT 0," +
		"wordCount INTEGER NOT NULL DEFAULT 0," +
		"volumeId TEXT," +
		"`order` INTEGER NOT NULL DEFAULT 0," +
		"createdAt INTEGER NOT NULL DEFAULT 0," +
		"updatedAt INTEGER NOT NULL DEFAULT 0," +
		"metadata TEXT DEFAULT '{}'," +
		"FOREIGN KEY (bookId) REFERENCES books(id) ON DELETE CASCADE)",
	"CREATE TABLE IF NOT EXISTS volumes (" +
		"id TEXT PRIMARY KEY," +
		"bookId TEXT NOT NULL," +
		"title TEXT NOT NULL," +
		"`order` INTEGER NOT NULL DEFAULT 0," +
		"createdAt INTEGER NOT NULL DEFAULT 0," +
		"FOREIGN KEY (bookId) REFERENCES books(id) ON DELETE CASCADE)",
	"CREATE TABLE IF NOT EXISTS bookUtils (" +
		"id TEXT PRIMARY KEY," +
		"BookID TEXT NOT NULL," +
		"image TEXT NOT NULL," +
		"type TEXT NOT NULL," +
		"description TEXT NOT NULL," +
		"list TEXT NOT NULL," +
		"createTime TEXT NOT NULL)",
	"CREATE TABLE IF NOT EXISTS bookAgent (" +
		"id TEXT PRIMARY KEY," +
		"bookId TEXT NOT NULL," +
		"title TEXT NOT NULL DEFAULT ''," +
		"messages TEXT NOT NULL DEFAULT '[]'," +
		"status TEXT NOT NULL DEFAULT 'running'," +
		"createdAt INTEGER NOT NULL," +
		"updatedAt INTEGER NOT NULL," +
		"FOREIGN KEY (bookId) REFERENCES books(id) ON DELETE CASCADE)",
	"CREATE TABLE IF NOT EXISTS bookAgentState (" +
		"bookId TEXT PRIMARY KEY," +
		"plan TEXT NOT NULL DEFAULT ''," +
		"progress TEXT NOT NULL DEFAULT '[]'," +
		"issues TEXT NOT NULL DEFAULT '[]'," +
		"updatedAt INTEGER NOT NULL DEFAULT 0," +
		"FOREIGN KEY (bookId) REFERENCES books(id) ON DELETE CASCADE)",
	// ─────────── 结构化台账（Ledger）：长篇记忆的唯一真相源 ───────────
	"CREATE TABLE IF NOT EXISTS storyCharacters (" +
		"id TEXT PRIMARY KEY," +
		"bookId TEXT NOT NULL," +
		"name TEXT NOT NULL," +
		"importance TEXT NOT NULL DEFAULT 'support'," +
		"profile TEXT NOT NULL DEFAULT ''," +
		"status TEXT NOT NULL DEFAULT 'alive'," +
		"firstChapter INTEGER NOT NULL DEFAULT 0," +
		"lastChapter INTEGER NOT NULL DEFAULT 0," +
		"createdAt INTEGER NOT NULL DEFAULT 0," +
		"updatedAt INTEGER NOT NULL DEFAULT 0," +
		"UNIQUE(bookId, name)," +
		"FOREIGN KEY (bookId) REFERENCES books(id) ON DELETE CASCADE)",
	"CREATE TABLE IF NOT EXISTS characterEvents (" +
		"id TEXT PRIMARY KEY," +
		"bookId TEXT NOT NULL," +
		"characterId TEXT NOT NULL," +
		"chapter INTEGER NOT NULL DEFAULT 0," +
		"narrativeTime TEXT NOT NULL DEFAULT ''," +
		"triggerEventId TEXT NOT NULL DEFAULT ''," +
		"field TEXT NOT NULL," +
		"oldValue TEXT NOT NULL DEFAULT ''," +
		"newValue TEXT NOT NULL DEFAULT ''," +
		"reason TEXT NOT NULL DEFAULT ''," +
		"createdAt INTEGER NOT NULL DEFAULT 0)",
	"CREATE INDEX IF NOT EXISTS idx_characterEvents_character ON characterEvents(characterId, chapter)",
	"CREATE TABLE IF NOT EXISTS storyEvents (" +
		"id TEXT PRIMARY KEY," +
		"bookId TEXT NOT NULL," +
		"chapter INTEGER NOT NULL DEFAULT 0," +
		"narrativeTime TEXT NOT NULL DEFAULT ''," +
		"summary TEXT NOT NULL DEFAULT ''," +
		"characterIds TEXT NOT NULL DEFAULT '[]'," +
		"locationId TEXT NOT NULL DEFAULT ''," +
		"causeEventId TEXT NOT NULL DEFAULT ''," +
		"stateDelta TEXT NOT NULL DEFAULT '{}'," +
		"createdAt INTEGER NOT NULL DEFAULT 0)",
	"CREATE INDEX IF NOT EXISTS idx_storyEvents_chapter ON storyEvents(bookId, chapter)",
	"CREATE TABLE IF NOT EXISTS storyLocations (" +
		"id TEXT PRIMARY KEY," +
		"bookId TEXT NOT NULL," +
		"name TEXT NOT NULL," +
		"profile TEXT NOT NULL DEFAULT ''," +
		"createdAt INTEGER NOT NULL DEFAULT 0," +
		"updatedAt INTEGER NOT NULL DEFAULT 0," +
		"UNIQUE(bookId, name)," +
		"FOREIGN KEY (bookId) REFERENCES books(id) ON DELETE CASCADE)",
	"CREATE TABLE IF NOT EXISTS locationEvents (" +
		"id TEXT PRIMARY KEY," +
		"bookId TEXT NOT NULL," +
		"locationId TEXT NOT NULL," +
		"chapter INTEGER NOT NULL DEFAULT 0," +
		"narrativeTime TEXT NOT NULL DEFAULT ''," +
		"triggerEventId TEXT NOT NULL DEFAULT ''," +
		"state TEXT NOT NULL DEFAULT ''," +
		"reason TEXT NOT NULL DEFAULT ''," +
		"createdAt INTEGER NOT NULL DEFAULT 0)",
	"CREATE INDEX IF NOT EXISTS idx_locationEvents_location ON locationEvents(locationId, chapter)",
	"CREATE TABLE IF NOT EXISTS foreshadows (" +
		"id TEXT PRIMARY KEY," +
		"bookId TEXT NOT NULL," +
		"description TEXT NOT NULL," +
		"plantedChapter INTEGER NOT NULL DEFAULT 0," +
		"plannedResolveChapter INTEGER NOT NULL DEFAULT 0," +
		"resolvedChapter INTEGER NOT NULL DEFAULT 0," +
		"status TEXT NOT NULL DEFAULT 'open'," +
		"createdAt INTEGER NOT NULL DEFAULT 0," +
		"updatedAt INTEGER NOT NULL DEFAULT 0)",
	"CREATE INDEX IF NOT EXISTS idx_foreshadows_book ON foreshadows(bookId, status)",
	"CREATE TABLE IF NOT EXISTS storyClock (" +
		"bookId TEXT PRIMARY KEY," +
		"currentChapter INTEGER NOT NULL DEFAULT 0," +
		"narrativeTime TEXT NOT NULL DEFAULT ''," +
		"updatedAt INTEGER NOT NULL DEFAULT 0," +
		"FOREIGN KEY (bookId) REFERENCES books(id) ON DELETE CASCADE)",
	"CREATE TABLE IF NOT EXISTS usage_stats (" +
		"date TEXT PRIMARY KEY," +
		"typingMs INTEGER NOT NULL DEFAULT 0," +
		"activeMs INTEGER NOT NULL DEFAULT 0," +
		"updatedAt INTEGER NOT NULL DEFAULT 0)",
}

// migrations 对应此前 DatabaseHelper.runMigrations() 中尽力执行的 ALTER 语句：
// 执行失败意味着该列已存在。
var migrations = []string{
	"ALTER TABLE books DROP COLUMN author",
	"ALTER TABLE books ADD COLUMN volumes TEXT NOT NULL DEFAULT '[]'",
	"ALTER TABLE books ADD COLUMN settings TEXT NOT NULL DEFAULT '{}'",
	"ALTER TABLE books ADD COLUMN tags TEXT NOT NULL DEFAULT '[]'",
	"ALTER TABLE books ADD COLUMN description TEXT NOT NULL DEFAULT ''",
	"ALTER TABLE books ADD COLUMN createdAt INTEGER NOT NULL DEFAULT 0",
	"ALTER TABLE books ADD COLUMN updatedAt INTEGER NOT NULL DEFAULT 0",
	// chapters.aiRes：章节对应的 AI 回答，与正文 content 分开留存。
	"ALTER TABLE chapters ADD COLUMN aiRes TEXT NOT NULL DEFAULT ''",
	// chapters.isAi：1 表示 AI 写的章节（读 aiRes），0 表示人工写的章节（读 content）。
	"ALTER TABLE chapters ADD COLUMN isAi INTEGER NOT NULL DEFAULT 0",
	// 兼容历史数据：已有 aiRes 但 content 为空的行视为 AI 写的章节。
	"UPDATE chapters SET isAi = 1 WHERE aiRes <> '' AND content = ''",
}

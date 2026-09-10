use rusqlite::{Connection, Result, params};
use std::path::Path;
use std::sync::Mutex;
use crate::models::*;

fn floor_char_boundary(s: &str, index: usize) -> usize {
    if index >= s.len() { return s.len(); }
    let mut i = index;
    while i > 0 && !s.is_char_boundary(i) { i -= 1; }
    i
}

fn ceil_char_boundary(s: &str, index: usize) -> usize {
    let mut i = index;
    while i < s.len() && !s.is_char_boundary(i) { i += 1; }
    i
}

pub struct Database {
    pub conn: Mutex<Connection>,
}

impl Database {
    pub fn new(db_path: &str) -> Result<Self> {
        if let Some(parent) = Path::new(db_path).parent() {
            std::fs::create_dir_all(parent).ok();
        }
        let conn = Connection::open(db_path)?;
        conn.pragma_update(None, "journal_mode", "WAL")?;
        let db = Self { conn: Mutex::new(conn) };
        db.create_tables()?;
        db.run_migrations()?;
        Ok(db)
    }

    fn create_tables(&self) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute_batch("
            CREATE TABLE IF NOT EXISTS memorys (
                id TEXT PRIMARY KEY, isFolder INTEGER NOT NULL, title TEXT NOT NULL,
                fileUrl TEXT, parentId TEXT, created INTEGER NOT NULL, updated INTEGER NOT NULL,
                visitedTime INTEGER, size INTEGER, starred INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS diarys (
                id TEXT PRIMARY KEY, monthDiarys TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY, title TEXT NOT NULL, lastUpdated TEXT NOT NULL,
                messages TEXT NOT NULL, description TEXT
            );
            CREATE TABLE IF NOT EXISTS agents (
                id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL, content TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS books (
                id TEXT PRIMARY KEY, title TEXT NOT NULL, cover TEXT NOT NULL DEFAULT '',
                tags TEXT NOT NULL DEFAULT '[]', settings TEXT NOT NULL DEFAULT '{}',
                description TEXT NOT NULL DEFAULT '', createdAt INTEGER NOT NULL DEFAULT 0,
                updatedAt INTEGER NOT NULL DEFAULT 0
            );
            CREATE TABLE IF NOT EXISTS chapters (
                id TEXT PRIMARY KEY, bookId TEXT NOT NULL, title TEXT NOT NULL,
                content TEXT NOT NULL DEFAULT '', wordCount INTEGER NOT NULL DEFAULT 0,
                volumeId TEXT, `order` INTEGER NOT NULL DEFAULT 0,
                createdAt INTEGER NOT NULL DEFAULT 0, updatedAt INTEGER NOT NULL DEFAULT 0,
                metadata TEXT DEFAULT '{}',
                FOREIGN KEY (bookId) REFERENCES books(id) ON DELETE CASCADE
            );
            CREATE TABLE IF NOT EXISTS volumes (
                id TEXT PRIMARY KEY, bookId TEXT NOT NULL, title TEXT NOT NULL,
                `order` INTEGER NOT NULL DEFAULT 0, createdAt INTEGER NOT NULL DEFAULT 0,
                FOREIGN KEY (bookId) REFERENCES books(id) ON DELETE CASCADE
            );
            CREATE TABLE IF NOT EXISTS bookUtils (
                id TEXT PRIMARY KEY, BookID TEXT NOT NULL, image TEXT NOT NULL,
                type TEXT NOT NULL, description TEXT NOT NULL, list TEXT NOT NULL,
                createTime TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS bookAgent (
                id TEXT PRIMARY KEY, bookId TEXT NOT NULL, title TEXT NOT NULL DEFAULT '',
                messages TEXT NOT NULL DEFAULT '[]', status TEXT NOT NULL DEFAULT 'running',
                createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL,
                FOREIGN KEY (bookId) REFERENCES books(id) ON DELETE CASCADE
            );
        ")?;
        Ok(())
    }

    fn run_migrations(&self) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        let migrations = [
            "ALTER TABLE books ADD COLUMN volumes TEXT NOT NULL DEFAULT '[]'",
            "ALTER TABLE books ADD COLUMN settings TEXT NOT NULL DEFAULT '{}'",
            "ALTER TABLE books ADD COLUMN tags TEXT NOT NULL DEFAULT '[]'",
            "ALTER TABLE books ADD COLUMN description TEXT NOT NULL DEFAULT ''",
            "ALTER TABLE books ADD COLUMN createdAt INTEGER NOT NULL DEFAULT 0",
            "ALTER TABLE books ADD COLUMN updatedAt INTEGER NOT NULL DEFAULT 0",
        ];
        for sql in &migrations {
            let _ = conn.execute_batch(sql);
        }
        Ok(())
    }

    // ========== Memory ==========
    pub fn get_all_memories(&self) -> Result<Vec<Memory>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare("SELECT id, isFolder, title, fileUrl, parentId, created, updated, visitedTime, size, starred FROM memorys ORDER BY created DESC")?;
        let rows = stmt.query_map([], |row| {
            Ok(Memory {
                id: row.get(0)?, is_folder: row.get(1)?, title: row.get(2)?,
                file_url: row.get(3)?, parent_id: row.get(4)?, created: row.get(5)?,
                updated: row.get(6)?, visited_time: row.get(7)?, size: row.get(8)?,
                starred: row.get(9)?,
            })
        })?.collect::<Result<Vec<_>>>()?;
        Ok(rows)
    }

    pub fn get_memory_by_id(&self, id: &str) -> Result<Memory> {
        let conn = self.conn.lock().unwrap();
        let now = chrono::Utc::now().timestamp_millis();
        conn.execute("UPDATE memorys SET visitedTime = ?1 WHERE id = ?2", params![now, id])?;
        let mut stmt = conn.prepare("SELECT id, isFolder, title, fileUrl, parentId, created, updated, visitedTime, size, starred FROM memorys WHERE id = ?1")?;
        stmt.query_row(params![id], |row| {
            Ok(Memory {
                id: row.get(0)?, is_folder: row.get(1)?, title: row.get(2)?,
                file_url: row.get(3)?, parent_id: row.get(4)?, created: row.get(5)?,
                updated: row.get(6)?, visited_time: row.get(7)?, size: row.get(8)?,
                starred: row.get(9)?,
            })
        })
    }

    pub fn get_memory_children(&self, parent_id: &str) -> Result<Vec<Memory>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare("SELECT id, isFolder, title, fileUrl, parentId, created, updated, visitedTime, size, starred FROM memorys WHERE parentId = ?1 ORDER BY created DESC")?;
        let rows = stmt.query_map(params![parent_id], |row| {
            Ok(Memory {
                id: row.get(0)?, is_folder: row.get(1)?, title: row.get(2)?,
                file_url: row.get(3)?, parent_id: row.get(4)?, created: row.get(5)?,
                updated: row.get(6)?, visited_time: row.get(7)?, size: row.get(8)?,
                starred: row.get(9)?,
            })
        })?.collect::<Result<Vec<_>>>()?;
        Ok(rows)
    }

    pub fn get_recent_memories(&self) -> Result<Vec<Memory>> {
        let conn = self.conn.lock().unwrap();
        let five_days_ago = chrono::Utc::now().timestamp_millis() - 5 * 24 * 3600 * 1000;
        let mut stmt = conn.prepare("SELECT id, isFolder, title, fileUrl, parentId, created, updated, visitedTime, size, starred FROM memorys WHERE visitedTime > ?1 AND isFolder = 0 ORDER BY visitedTime DESC")?;
        let rows = stmt.query_map(params![five_days_ago], |row| {
            Ok(Memory {
                id: row.get(0)?, is_folder: row.get(1)?, title: row.get(2)?,
                file_url: row.get(3)?, parent_id: row.get(4)?, created: row.get(5)?,
                updated: row.get(6)?, visited_time: row.get(7)?, size: row.get(8)?,
                starred: row.get(9)?,
            })
        })?.collect::<Result<Vec<_>>>()?;
        Ok(rows)
    }

    pub fn get_starred_memories(&self) -> Result<Vec<Memory>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare("SELECT id, isFolder, title, fileUrl, parentId, created, updated, visitedTime, size, starred FROM memorys WHERE starred = 1 ORDER BY created DESC")?;
        let rows = stmt.query_map([], |row| {
            Ok(Memory {
                id: row.get(0)?, is_folder: row.get(1)?, title: row.get(2)?,
                file_url: row.get(3)?, parent_id: row.get(4)?, created: row.get(5)?,
                updated: row.get(6)?, visited_time: row.get(7)?, size: row.get(8)?,
                starred: row.get(9)?,
            })
        })?.collect::<Result<Vec<_>>>()?;
        Ok(rows)
    }

    pub fn create_memory(&self, m: &CreateMemory) -> Result<Memory> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO memorys (id, isFolder, title, fileUrl, parentId, created, updated, visitedTime, size, starred) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)",
            params![m.id, m.is_folder, m.title, m.file_url, m.parent_id, m.created, m.updated, m.visited_time, m.size, m.starred.unwrap_or(0)],
        )?;
        drop(conn);
        self.get_memory_by_id(&m.id)
    }

    pub fn update_memory(&self, id: &str, m: &UpdateMemory) -> Result<Memory> {
        let conn = self.conn.lock().unwrap();
        let now = chrono::Utc::now().timestamp_millis();
        conn.execute("UPDATE memorys SET updated = ?1, visitedTime = ?2 WHERE id = ?3", params![now, now, id])?;
        if let Some(ref title) = m.title {
            conn.execute("UPDATE memorys SET title = ?1 WHERE id = ?2", params![title, id])?;
        }
        if let Some(ref file_url) = m.file_url {
            conn.execute("UPDATE memorys SET fileUrl = ?1 WHERE id = ?2", params![file_url, id])?;
        }
        if let Some(ref parent_id) = m.parent_id {
            conn.execute("UPDATE memorys SET parentId = ?1 WHERE id = ?2", params![parent_id, id])?;
        }
        if let Some(size) = m.size {
            conn.execute("UPDATE memorys SET size = ?1 WHERE id = ?2", params![size, id])?;
        }
        drop(conn);
        self.get_memory_by_id(id)
    }

    pub fn delete_memory(&self, id: &str) -> Result<Option<String>> {
        let conn = self.conn.lock().unwrap();
        let file_url: Option<String> = conn.query_row(
            "SELECT fileUrl FROM memorys WHERE id = ?1", params![id], |row| row.get(0)
        )?;
        conn.execute("DELETE FROM memorys WHERE id = ?1", params![id])?;
        Ok(file_url)
    }

    pub fn toggle_star(&self, id: &str) -> Result<Memory> {
        let conn = self.conn.lock().unwrap();
        conn.execute("UPDATE memorys SET starred = CASE WHEN starred = 1 THEN 0 ELSE 1 END WHERE id = ?1", params![id])?;
        drop(conn);
        self.get_memory_by_id(id)
    }

    // ========== Diary ==========
    pub fn get_diary(&self, id: &str) -> Result<Diary> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare("SELECT id, monthDiarys FROM diarys WHERE id = ?1")?;
        stmt.query_row(params![id], |row| {
            Ok(Diary { id: row.get(0)?, month_diarys: row.get(1)? })
        })
    }

    pub fn upsert_diary(&self, id: &str, month_diarys: &str) -> Result<Diary> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO diarys (id, monthDiarys) VALUES (?1, ?2) ON CONFLICT(id) DO UPDATE SET monthDiarys = ?2",
            params![id, month_diarys],
        )?;
        drop(conn);
        self.get_diary(id)
    }

    // ========== Session ==========
    pub fn get_all_sessions(&self) -> Result<Vec<Session>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare("SELECT id, title, lastUpdated, messages, description FROM sessions ORDER BY lastUpdated DESC")?;
        let rows = stmt.query_map([], |row| {
            let last_updated_str: String = row.get(2)?;
            let messages_str: String = row.get(3)?;
            let last_updated: serde_json::Value = serde_json::from_str(&last_updated_str).unwrap_or(serde_json::Value::Null);
            let messages: serde_json::Value = serde_json::from_str(&messages_str).unwrap_or(serde_json::json!([]));
            Ok(Session { id: row.get(0)?, title: row.get(1)?, last_updated, messages, description: row.get(4)? })
        })?.collect::<Result<Vec<_>>>()?;
        Ok(rows)
    }

    pub fn get_session_by_id(&self, id: &str) -> Result<Session> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare("SELECT id, title, lastUpdated, messages, description FROM sessions WHERE id = ?1")?;
        stmt.query_row(params![id], |row| {
            let last_updated_str: String = row.get(2)?;
            let messages_str: String = row.get(3)?;
            let last_updated: serde_json::Value = serde_json::from_str(&last_updated_str).unwrap_or(serde_json::Value::Null);
            let messages: serde_json::Value = serde_json::from_str(&messages_str).unwrap_or(serde_json::json!([]));
            Ok(Session { id: row.get(0)?, title: row.get(1)?, last_updated, messages, description: row.get(4)? })
        })
    }

    pub fn create_session(&self, s: &CreateSession) -> Result<Session> {
        let conn = self.conn.lock().unwrap();
        let last_updated_str = s.last_updated.to_string();
        let messages_str = s.messages.to_string();
        conn.execute(
            "INSERT INTO sessions (id, title, lastUpdated, messages, description) VALUES (?1,?2,?3,?4,?5)",
            params![s.id, s.title, last_updated_str, messages_str, s.description],
        )?;
        drop(conn);
        self.get_session_by_id(&s.id)
    }

    pub fn update_session(&self, id: &str, s: &UpdateSession) -> Result<Session> {
        let conn = self.conn.lock().unwrap();
        if let Some(ref title) = s.title { conn.execute("UPDATE sessions SET title = ?1 WHERE id = ?2", params![title, id])?; }
        if let Some(ref lu) = s.last_updated { conn.execute("UPDATE sessions SET lastUpdated = ?1 WHERE id = ?2", params![lu.to_string(), id])?; }
        if let Some(ref msgs) = s.messages { conn.execute("UPDATE sessions SET messages = ?1 WHERE id = ?2", params![msgs.to_string(), id])?; }
        if let Some(ref desc) = s.description { conn.execute("UPDATE sessions SET description = ?1 WHERE id = ?2", params![desc, id])?; }
        drop(conn);
        self.get_session_by_id(id)
    }

    pub fn delete_session(&self, id: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM sessions WHERE id = ?1", params![id])?;
        Ok(())
    }

    // ========== Agent ==========
    pub fn get_all_agents(&self) -> Result<Vec<MyAgent>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare("SELECT id, name, description, content FROM agents")?;
        let rows = stmt.query_map([], |row| {
            Ok(MyAgent { id: row.get(0)?, name: row.get(1)?, description: row.get(2)?, content: row.get(3)? })
        })?.collect::<Result<Vec<_>>>()?;
        Ok(rows)
    }

    pub fn create_agent(&self, a: &CreateAgent) -> Result<MyAgent> {
        let conn = self.conn.lock().unwrap();
        conn.execute("INSERT INTO agents (id, name, description, content) VALUES (?1,?2,?3,?4)", params![a.id, a.name, a.description, a.content])?;
        Ok(MyAgent { id: a.id.clone(), name: a.name.clone(), description: a.description.clone(), content: a.content.clone() })
    }

    pub fn update_agent(&self, id: &str, a: &UpdateAgent) -> Result<MyAgent> {
        let conn = self.conn.lock().unwrap();
        let exists: bool = conn.query_row("SELECT COUNT(*) > 0 FROM agents WHERE id = ?1", params![id], |row| row.get(0))?;
        if !exists {
            return Err(rusqlite::Error::QueryReturnedNoRows);
        }
        if let Some(ref name) = a.name { conn.execute("UPDATE agents SET name = ?1 WHERE id = ?2", params![name, id])?; }
        if let Some(ref desc) = a.description { conn.execute("UPDATE agents SET description = ?1 WHERE id = ?2", params![desc, id])?; }
        if let Some(ref content) = a.content { conn.execute("UPDATE agents SET content = ?1 WHERE id = ?2", params![content, id])?; }
        let mut stmt = conn.prepare("SELECT id, name, description, content FROM agents WHERE id = ?1")?;
        stmt.query_row(params![id], |row| {
            Ok(MyAgent { id: row.get(0)?, name: row.get(1)?, description: row.get(2)?, content: row.get(3)? })
        })
    }

    pub fn delete_agent(&self, id: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM agents WHERE id = ?1", params![id])?;
        Ok(())
    }

    // ========== Book ==========
    pub fn get_all_books(&self) -> Result<Vec<Book>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare("SELECT id, title, cover, tags, settings, description, createdAt, updatedAt FROM books ORDER BY updatedAt DESC")?;
        let rows = stmt.query_map([], |row| {
            let tags_str: String = row.get(3)?;
            let settings_str: String = row.get(4)?;
            let tags: serde_json::Value = serde_json::from_str(&tags_str).unwrap_or(serde_json::json!([]));
            let settings: serde_json::Value = serde_json::from_str(&settings_str).unwrap_or(serde_json::json!({}));
            Ok(Book { id: row.get(0)?, title: row.get(1)?, cover: row.get(2)?, tags, settings, description: row.get(5)?, created_at: row.get(6)?, updated_at: row.get(7)? })
        })?.collect::<Result<Vec<_>>>()?;
        Ok(rows)
    }

    pub fn get_book_by_id(&self, id: &str) -> Result<Book> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare("SELECT id, title, cover, tags, settings, description, createdAt, updatedAt FROM books WHERE id = ?1")?;
        stmt.query_row(params![id], |row| {
            let tags_str: String = row.get(3)?;
            let settings_str: String = row.get(4)?;
            let tags: serde_json::Value = serde_json::from_str(&tags_str).unwrap_or(serde_json::json!([]));
            let settings: serde_json::Value = serde_json::from_str(&settings_str).unwrap_or(serde_json::json!({}));
            Ok(Book { id: row.get(0)?, title: row.get(1)?, cover: row.get(2)?, tags, settings, description: row.get(5)?, created_at: row.get(6)?, updated_at: row.get(7)? })
        })
    }

    pub fn get_book_detail(&self, id: &str) -> Result<BookDetail> {
        let book = self.get_book_by_id(id)?;
        let chapters = self.get_chapters_by_book(id)?;
        let volumes = self.get_volumes_by_book(id)?;
        let chapter_meta: Vec<ChapterMeta> = chapters.into_iter().map(|c| ChapterMeta {
            id: c.id, book_id: c.book_id, title: c.title, word_count: c.word_count,
            volume_id: c.volume_id, order: c.order, created_at: c.created_at, updated_at: c.updated_at, metadata: c.metadata,
        }).collect();
        Ok(BookDetail { id: book.id, title: book.title, cover: book.cover, tags: book.tags, settings: book.settings, description: book.description, created_at: book.created_at, updated_at: book.updated_at, chapters: chapter_meta, volumes })
    }

    pub fn create_book(&self, b: &CreateBook) -> Result<BookDetail> {
        let conn = self.conn.lock().unwrap();
        let now = chrono::Utc::now().timestamp_millis();
        let tags = b.tags.as_ref().map(|v| v.to_string()).unwrap_or_else(|| "[]".to_string());
        let settings = b.settings.as_ref().map(|v| v.to_string()).unwrap_or_else(|| "{}".to_string());
        let description = b.description.as_deref().unwrap_or("");
        conn.execute(
            "INSERT INTO books (id, title, cover, tags, settings, description, createdAt, updatedAt) VALUES (?1,?2,?3,?4,?5,?6,?7,?8)",
            params![b.id, b.title, b.cover.as_deref().unwrap_or(""), tags, settings, description, now, now],
        )?;
        let chapter_id = uuid::Uuid::new_v4().to_string();
        let ch_title = "第1章";
        conn.execute(
            "INSERT INTO chapters (id, bookId, title, content, wordCount, `order`, createdAt, updatedAt) VALUES (?1,?2,?3,'',0,1,?4,?5)",
            params![chapter_id, b.id, ch_title, now, now],
        )?;
        drop(conn);
        self.get_book_detail(&b.id)
    }

    pub fn update_book(&self, id: &str, b: &UpdateBook) -> Result<Book> {
        let conn = self.conn.lock().unwrap();
        let now = chrono::Utc::now().timestamp_millis();
        if let Some(ref title) = b.title { conn.execute("UPDATE books SET title = ?1, updatedAt = ?2 WHERE id = ?3", params![title, now, id])?; }
        if let Some(ref cover) = b.cover { conn.execute("UPDATE books SET cover = ?1, updatedAt = ?2 WHERE id = ?3", params![cover, now, id])?; }
        if let Some(ref tags) = b.tags { conn.execute("UPDATE books SET tags = ?1, updatedAt = ?2 WHERE id = ?3", params![tags.to_string(), now, id])?; }
        if let Some(ref settings) = b.settings { conn.execute("UPDATE books SET settings = ?1, updatedAt = ?2 WHERE id = ?3", params![settings.to_string(), now, id])?; }
        if let Some(ref desc) = b.description { conn.execute("UPDATE books SET description = ?1, updatedAt = ?2 WHERE id = ?3", params![desc, now, id])?; }
        drop(conn);
        self.get_book_by_id(id)
    }

    pub fn delete_book(&self, id: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM bookAgent WHERE bookId = ?1", params![id])?;
        conn.execute("DELETE FROM chapters WHERE bookId = ?1", params![id])?;
        conn.execute("DELETE FROM volumes WHERE bookId = ?1", params![id])?;
        conn.execute("DELETE FROM books WHERE id = ?1", params![id])?;
        Ok(())
    }

    // ========== Chapter ==========
    pub fn get_chapters_by_book(&self, book_id: &str) -> Result<Vec<Chapter>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare("SELECT id, bookId, title, content, wordCount, volumeId, `order`, createdAt, updatedAt, metadata FROM chapters WHERE bookId = ?1 ORDER BY `order` ASC")?;
        let rows = stmt.query_map(params![book_id], |row| {
            let metadata_str: Option<String> = row.get(9)?;
            let metadata: Option<serde_json::Value> = metadata_str.and_then(|s| serde_json::from_str(&s).ok());
            Ok(Chapter { id: row.get(0)?, book_id: row.get(1)?, title: row.get(2)?, content: row.get(3)?, word_count: row.get(4)?, volume_id: row.get(5)?, order: row.get(6)?, created_at: row.get(7)?, updated_at: row.get(8)?, metadata })
        })?.collect::<Result<Vec<_>>>()?;
        Ok(rows)
    }

    pub fn get_chapter_by_id(&self, id: &str) -> Result<Chapter> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare("SELECT id, bookId, title, content, wordCount, volumeId, `order`, createdAt, updatedAt, metadata FROM chapters WHERE id = ?1")?;
        stmt.query_row(params![id], |row| {
            let metadata_str: Option<String> = row.get(9)?;
            let metadata: Option<serde_json::Value> = metadata_str.and_then(|s| serde_json::from_str(&s).ok());
            Ok(Chapter { id: row.get(0)?, book_id: row.get(1)?, title: row.get(2)?, content: row.get(3)?, word_count: row.get(4)?, volume_id: row.get(5)?, order: row.get(6)?, created_at: row.get(7)?, updated_at: row.get(8)?, metadata })
        })
    }

    pub fn create_chapter(&self, c: &CreateChapter) -> Result<Chapter> {
        let conn = self.conn.lock().unwrap();
        let now = chrono::Utc::now().timestamp_millis();
        let id = c.id.clone().unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
        let content = c.content.as_deref().unwrap_or("");
        let word_count = c.word_count.unwrap_or(0);
        let metadata = c.metadata.as_ref().map(|v| v.to_string()).unwrap_or_else(|| "{}".to_string());
        // 获取最大 order
        let max_order: i64 = conn.query_row("SELECT COALESCE(MAX(`order`), 0) FROM chapters WHERE bookId = ?1", params![c.book_id], |row| row.get(0))?;
        let order = c.order.unwrap_or(max_order + 1);
        conn.execute(
            "INSERT INTO chapters (id, bookId, title, content, wordCount, volumeId, `order`, createdAt, updatedAt, metadata) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)",
            params![id, c.book_id, c.title, content, word_count, c.volume_id, order, now, now, metadata],
        )?;
        drop(conn);
        self.get_chapter_by_id(&id)
    }

    pub fn update_chapter(&self, id: &str, c: &UpdateChapter) -> Result<Chapter> {
        let conn = self.conn.lock().unwrap();
        let now = chrono::Utc::now().timestamp_millis();
        if let Some(ref title) = c.title { conn.execute("UPDATE chapters SET title = ?1, updatedAt = ?2 WHERE id = ?3", params![title, now, id])?; }
        if let Some(ref content) = c.content { conn.execute("UPDATE chapters SET content = ?1, updatedAt = ?2 WHERE id = ?3", params![content, now, id])?; }
        if let Some(word_count) = c.word_count { conn.execute("UPDATE chapters SET wordCount = ?1, updatedAt = ?2 WHERE id = ?3", params![word_count, now, id])?; }
        if let Some(ref volume_id) = c.volume_id { conn.execute("UPDATE chapters SET volumeId = ?1, updatedAt = ?2 WHERE id = ?3", params![volume_id, now, id])?; }
        if let Some(order) = c.order { conn.execute("UPDATE chapters SET `order` = ?1, updatedAt = ?2 WHERE id = ?3", params![order, now, id])?; }
        if let Some(ref metadata) = c.metadata { conn.execute("UPDATE chapters SET metadata = ?1, updatedAt = ?2 WHERE id = ?3", params![metadata.to_string(), now, id])?; }
        drop(conn);
        self.get_chapter_by_id(id)
    }

    pub fn delete_chapter(&self, id: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM chapters WHERE id = ?1", params![id])?;
        Ok(())
    }

    // ========== Volume ==========
    pub fn get_volumes_by_book(&self, book_id: &str) -> Result<Vec<Volume>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare("SELECT id, bookId, title, `order`, createdAt FROM volumes WHERE bookId = ?1 ORDER BY `order` ASC")?;
        let rows = stmt.query_map(params![book_id], |row| {
            Ok(Volume { id: row.get(0)?, book_id: row.get(1)?, title: row.get(2)?, order: row.get(3)?, created_at: row.get(4)? })
        })?.collect::<Result<Vec<_>>>()?;
        Ok(rows)
    }

    pub fn get_volume_by_id(&self, id: &str) -> Result<Volume> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare("SELECT id, bookId, title, `order`, createdAt FROM volumes WHERE id = ?1")?;
        stmt.query_row(params![id], |row| {
            Ok(Volume { id: row.get(0)?, book_id: row.get(1)?, title: row.get(2)?, order: row.get(3)?, created_at: row.get(4)? })
        })
    }

    pub fn create_volume(&self, v: &CreateVolume) -> Result<Volume> {
        let conn = self.conn.lock().unwrap();
        let now = chrono::Utc::now().timestamp_millis();
        let id = v.id.clone().unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
        let max_order: i64 = conn.query_row("SELECT COALESCE(MAX(`order`), 0) FROM volumes WHERE bookId = ?1", params![v.book_id], |row| row.get(0))?;
        let order = v.order.unwrap_or(max_order + 1);
        conn.execute("INSERT INTO volumes (id, bookId, title, `order`, createdAt) VALUES (?1,?2,?3,?4,?5)", params![id, v.book_id, v.title, order, now])?;
        drop(conn);
        self.get_volume_by_id(&id)
    }

    pub fn update_volume(&self, id: &str, v: &UpdateVolume) -> Result<Volume> {
        let conn = self.conn.lock().unwrap();
        if let Some(ref title) = v.title { conn.execute("UPDATE volumes SET title = ?1 WHERE id = ?2", params![title, id])?; }
        if let Some(order) = v.order { conn.execute("UPDATE volumes SET `order` = ?1 WHERE id = ?2", params![order, id])?; }
        drop(conn);
        self.get_volume_by_id(id)
    }

    pub fn delete_volume(&self, id: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM volumes WHERE id = ?1", params![id])?;
        Ok(())
    }

    // ========== BookAgent ==========
    pub fn get_book_agents(&self, book_id: &str) -> Result<Vec<BookAgent>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare("SELECT id, bookId, title, messages, status, createdAt, updatedAt FROM bookAgent WHERE bookId = ?1 ORDER BY createdAt DESC")?;
        let rows = stmt.query_map(params![book_id], |row| {
            let messages_str: String = row.get(3)?;
            let messages: serde_json::Value = serde_json::from_str(&messages_str).unwrap_or(serde_json::json!([]));
            Ok(BookAgent { id: row.get(0)?, book_id: row.get(1)?, title: row.get(2)?, messages, status: row.get(4)?, created_at: row.get(5)?, updated_at: row.get(6)? })
        })?.collect::<Result<Vec<_>>>()?;
        Ok(rows)
    }

    pub fn get_book_agent_by_id(&self, id: &str) -> Result<BookAgent> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare("SELECT id, bookId, title, messages, status, createdAt, updatedAt FROM bookAgent WHERE id = ?1")?;
        stmt.query_row(params![id], |row| {
            let messages_str: String = row.get(3)?;
            let messages: serde_json::Value = serde_json::from_str(&messages_str).unwrap_or(serde_json::json!([]));
            Ok(BookAgent { id: row.get(0)?, book_id: row.get(1)?, title: row.get(2)?, messages, status: row.get(4)?, created_at: row.get(5)?, updated_at: row.get(6)? })
        })
    }

    pub fn create_book_agent(&self, a: &CreateBookAgent) -> Result<BookAgent> {
        let conn = self.conn.lock().unwrap();
        let now = chrono::Utc::now().timestamp_millis();
        let title = a.title.as_deref().unwrap_or("");
        let messages = a.messages.as_ref().map(|v| v.to_string()).unwrap_or_else(|| "[]".to_string());
        let status = a.status.as_deref().unwrap_or("running");
        conn.execute("INSERT INTO bookAgent (id, bookId, title, messages, status, createdAt, updatedAt) VALUES (?1,?2,?3,?4,?5,?6,?7)", params![a.id, a.book_id, title, messages, status, now, now])?;
        drop(conn);
        self.get_book_agent_by_id(&a.id)
    }

    pub fn update_book_agent(&self, id: &str, a: &UpdateBookAgent) -> Result<BookAgent> {
        let conn = self.conn.lock().unwrap();
        let now = chrono::Utc::now().timestamp_millis();
        if let Some(ref title) = a.title { conn.execute("UPDATE bookAgent SET title = ?1, updatedAt = ?2 WHERE id = ?3", params![title, now, id])?; }
        if let Some(ref messages) = a.messages { conn.execute("UPDATE bookAgent SET messages = ?1, updatedAt = ?2 WHERE id = ?3", params![messages.to_string(), now, id])?; }
        if let Some(ref status) = a.status { conn.execute("UPDATE bookAgent SET status = ?1, updatedAt = ?2 WHERE id = ?3", params![status, now, id])?; }
        drop(conn);
        self.get_book_agent_by_id(id)
    }

    pub fn delete_book_agent(&self, id: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM bookAgent WHERE id = ?1", params![id])?;
        Ok(())
    }

    pub fn delete_book_agents(&self, book_id: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM bookAgent WHERE bookId = ?1", params![book_id])?;
        Ok(())
    }

    // ========== Storage ==========
    pub fn get_database_size(&self, db_path: &str) -> u64 {
        std::fs::metadata(db_path).map(|m| m.len()).unwrap_or(0)
    }

    pub fn export_all(&self) -> Result<serde_json::Value> {
        let memories = self.get_all_memories()?;
        let diarys = {
            let conn = self.conn.lock().unwrap();
            let mut stmt = conn.prepare("SELECT id, monthDiarys FROM diarys")?;
            let rows = stmt.query_map([], |row| {
                Ok(Diary { id: row.get(0)?, month_diarys: row.get(1)? })
            })?.collect::<Result<Vec<_>>>()?;
            rows
        };
        let sessions = self.get_all_sessions()?;
        let agents = self.get_all_agents()?;
        let books = self.get_all_books()?;
        let chapters = {
            let conn = self.conn.lock().unwrap();
            let mut stmt = conn.prepare("SELECT id, bookId, title, content, wordCount, volumeId, `order`, createdAt, updatedAt, metadata FROM chapters ORDER BY `order` ASC")?;
            let rows = stmt.query_map([], |row| {
                let metadata_str: Option<String> = row.get(9)?;
                let metadata: Option<serde_json::Value> = metadata_str.and_then(|s| serde_json::from_str(&s).ok());
                Ok(Chapter { id: row.get(0)?, book_id: row.get(1)?, title: row.get(2)?, content: row.get(3)?, word_count: row.get(4)?, volume_id: row.get(5)?, order: row.get(6)?, created_at: row.get(7)?, updated_at: row.get(8)?, metadata })
            })?.collect::<Result<Vec<_>>>()?;
            rows
        };
        let volumes = {
            let conn = self.conn.lock().unwrap();
            let mut stmt = conn.prepare("SELECT id, bookId, title, `order`, createdAt FROM volumes ORDER BY `order` ASC")?;
            let rows = stmt.query_map([], |row| {
                Ok(Volume { id: row.get(0)?, book_id: row.get(1)?, title: row.get(2)?, order: row.get(3)?, created_at: row.get(4)? })
            })?.collect::<Result<Vec<_>>>()?;
            rows
        };
        let book_agents = {
            let conn = self.conn.lock().unwrap();
            let mut stmt = conn.prepare("SELECT id, bookId, title, messages, status, createdAt, updatedAt FROM bookAgent")?;
            let rows = stmt.query_map([], |row| {
                let messages_str: String = row.get(3)?;
                let messages: serde_json::Value = serde_json::from_str(&messages_str).unwrap_or(serde_json::json!([]));
                Ok(BookAgent { id: row.get(0)?, book_id: row.get(1)?, title: row.get(2)?, messages, status: row.get(4)?, created_at: row.get(5)?, updated_at: row.get(6)? })
            })?.collect::<Result<Vec<_>>>()?;
            rows
        };

        Ok(serde_json::json!({
            "memories": memories,
            "diarys": diarys,
            "sessions": sessions,
            "agents": agents,
            "books": books,
            "chapters": chapters,
            "volumes": volumes,
            "bookAgents": book_agents,
        }))
    }

    pub fn import_all(&self, data: &serde_json::Value) -> Result<()> {
        let conn = self.conn.lock().unwrap();

        // 清空所有表
        conn.execute_batch("DELETE FROM bookAgent; DELETE FROM volumes; DELETE FROM chapters; DELETE FROM books; DELETE FROM agents; DELETE FROM sessions; DELETE FROM diarys; DELETE FROM memorys;")?;

        // 导入 memories
        if let Some(memories) = data.get("memories").and_then(|v| v.as_array()) {
            for m in memories {
                let id = m.get("id").and_then(|v| v.as_str()).unwrap_or("");
                let is_folder = m.get("isFolder").and_then(|v| v.as_i64()).unwrap_or(0);
                let title = m.get("title").and_then(|v| v.as_str()).unwrap_or("");
                let file_url = m.get("fileUrl").and_then(|v| v.as_str());
                let parent_id = m.get("parentId").and_then(|v| v.as_str());
                let created = m.get("created").and_then(|v| v.as_i64()).unwrap_or(0);
                let updated = m.get("updated").and_then(|v| v.as_i64()).unwrap_or(0);
                let visited_time = m.get("visitedTime").and_then(|v| v.as_i64());
                let size = m.get("size").and_then(|v| v.as_i64());
                let starred = m.get("starred").and_then(|v| v.as_i64()).unwrap_or(0);
                let _ = conn.execute(
                    "INSERT INTO memorys (id, isFolder, title, fileUrl, parentId, created, updated, visitedTime, size, starred) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)",
                    params![id, is_folder, title, file_url, parent_id, created, updated, visited_time, size, starred],
                );
            }
        }

        // 导入 diarys
        if let Some(diarys) = data.get("diarys").and_then(|v| v.as_array()) {
            for d in diarys {
                let id = d.get("id").and_then(|v| v.as_str()).unwrap_or("");
                let month_diarys = d.get("monthDiarys").map(|v| v.to_string()).unwrap_or_else(|| "[]".to_string());
                let _ = conn.execute(
                    "INSERT INTO diarys (id, monthDiarys) VALUES (?1, ?2) ON CONFLICT(id) DO UPDATE SET monthDiarys = ?2",
                    params![id, month_diarys],
                );
            }
        }

        // 导入 sessions
        if let Some(sessions) = data.get("sessions").and_then(|v| v.as_array()) {
            for s in sessions {
                let id = s.get("id").and_then(|v| v.as_str()).unwrap_or("");
                let title = s.get("title").and_then(|v| v.as_str()).unwrap_or("");
                let last_updated = s.get("lastUpdated").map(|v| v.to_string()).unwrap_or_else(|| "null".to_string());
                let messages = s.get("messages").map(|v| v.to_string()).unwrap_or_else(|| "[]".to_string());
                let description = s.get("description").and_then(|v| v.as_str());
                let _ = conn.execute(
                    "INSERT INTO sessions (id, title, lastUpdated, messages, description) VALUES (?1,?2,?3,?4,?5)",
                    params![id, title, last_updated, messages, description],
                );
            }
        }

        // 导入 agents
        if let Some(agents) = data.get("agents").and_then(|v| v.as_array()) {
            for a in agents {
                let id = a.get("id").and_then(|v| v.as_str()).unwrap_or("");
                let name = a.get("name").and_then(|v| v.as_str()).unwrap_or("");
                let description = a.get("description").and_then(|v| v.as_str()).unwrap_or("");
                let content = a.get("content").and_then(|v| v.as_str()).unwrap_or("");
                let _ = conn.execute(
                    "INSERT INTO agents (id, name, description, content) VALUES (?1,?2,?3,?4)",
                    params![id, name, description, content],
                );
            }
        }

        // 导入 books
        if let Some(books) = data.get("books").and_then(|v| v.as_array()) {
            for b in books {
                let id = b.get("id").and_then(|v| v.as_str()).unwrap_or("");
                let title = b.get("title").and_then(|v| v.as_str()).unwrap_or("");
                let cover = b.get("cover").and_then(|v| v.as_str()).unwrap_or("");
                let tags = b.get("tags").map(|v| v.to_string()).unwrap_or_else(|| "[]".to_string());
                let settings = b.get("settings").map(|v| v.to_string()).unwrap_or_else(|| "{}".to_string());
                let description = b.get("description").and_then(|v| v.as_str()).unwrap_or("");
                let created_at = b.get("createdAt").and_then(|v| v.as_i64()).unwrap_or(0);
                let updated_at = b.get("updatedAt").and_then(|v| v.as_i64()).unwrap_or(0);
                let _ = conn.execute(
                    "INSERT INTO books (id, title, cover, tags, settings, description, createdAt, updatedAt) VALUES (?1,?2,?3,?4,?5,?6,?7,?8)",
                    params![id, title, cover, tags, settings, description, created_at, updated_at],
                );
            }
        }

        // 导入 chapters
        if let Some(chapters) = data.get("chapters").and_then(|v| v.as_array()) {
            for c in chapters {
                let id = c.get("id").and_then(|v| v.as_str()).unwrap_or("");
                let book_id = c.get("bookId").and_then(|v| v.as_str()).unwrap_or("");
                let title = c.get("title").and_then(|v| v.as_str()).unwrap_or("");
                let content = c.get("content").and_then(|v| v.as_str()).unwrap_or("");
                let word_count = c.get("wordCount").and_then(|v| v.as_i64()).unwrap_or(0);
                let volume_id = c.get("volumeId").and_then(|v| v.as_str());
                let order = c.get("order").and_then(|v| v.as_i64()).unwrap_or(0);
                let created_at = c.get("createdAt").and_then(|v| v.as_i64()).unwrap_or(0);
                let updated_at = c.get("updatedAt").and_then(|v| v.as_i64()).unwrap_or(0);
                let metadata = c.get("metadata").map(|v| v.to_string());
                let _ = conn.execute(
                    "INSERT INTO chapters (id, bookId, title, content, wordCount, volumeId, `order`, createdAt, updatedAt, metadata) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)",
                    params![id, book_id, title, content, word_count, volume_id, order, created_at, updated_at, metadata],
                );
            }
        }

        // 导入 volumes
        if let Some(volumes) = data.get("volumes").and_then(|v| v.as_array()) {
            for v in volumes {
                let id = v.get("id").and_then(|v| v.as_str()).unwrap_or("");
                let book_id = v.get("bookId").and_then(|v| v.as_str()).unwrap_or("");
                let title = v.get("title").and_then(|v| v.as_str()).unwrap_or("");
                let order = v.get("order").and_then(|v| v.as_i64()).unwrap_or(0);
                let created_at = v.get("createdAt").and_then(|v| v.as_i64()).unwrap_or(0);
                let _ = conn.execute(
                    "INSERT INTO volumes (id, bookId, title, `order`, createdAt) VALUES (?1,?2,?3,?4,?5)",
                    params![id, book_id, title, order, created_at],
                );
            }
        }

        // 导入 bookAgent
        if let Some(book_agents) = data.get("bookAgents").and_then(|v| v.as_array()) {
            for a in book_agents {
                let id = a.get("id").and_then(|v| v.as_str()).unwrap_or("");
                let book_id = a.get("bookId").and_then(|v| v.as_str()).unwrap_or("");
                let title = a.get("title").and_then(|v| v.as_str()).unwrap_or("");
                let messages = a.get("messages").map(|v| v.to_string()).unwrap_or_else(|| "[]".to_string());
                let status = a.get("status").and_then(|v| v.as_str()).unwrap_or("running");
                let created_at = a.get("createdAt").and_then(|v| v.as_i64()).unwrap_or(0);
                let updated_at = a.get("updatedAt").and_then(|v| v.as_i64()).unwrap_or(0);
                let _ = conn.execute(
                    "INSERT INTO bookAgent (id, bookId, title, messages, status, createdAt, updatedAt) VALUES (?1,?2,?3,?4,?5,?6,?7)",
                    params![id, book_id, title, messages, status, created_at, updated_at],
                );
            }
        }

        Ok(())
    }

    pub fn search_book(&self, book_id: &str, keyword: &str) -> Result<Vec<serde_json::Value>> {
        let chapters = self.get_chapters_by_book(book_id)?;
        let mut results = Vec::new();
        let keyword_lower = keyword.to_lowercase();

        for chapter in chapters {
            let content_lower = chapter.content.to_lowercase();
            if let Some(pos) = content_lower.find(&keyword_lower) {
                let start = floor_char_boundary(&chapter.content, pos.saturating_sub(50));
                let end = ceil_char_boundary(&chapter.content, (pos + keyword.len() + 50).min(chapter.content.len()));
                let context = chapter.content[start..end].to_string();
                results.push(serde_json::json!({
                    "volumeId":chapter.volume_id,
                    "chapterId": chapter.id,
                    "chapterTitle": chapter.title,
                    "keyword": keyword,
                    "context": context,
                    "position": pos,
                }));
            }
        }

        Ok(results)
    }
}

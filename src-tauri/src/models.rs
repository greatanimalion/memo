use serde::{Deserialize, Serialize};

// ========== Memory ==========
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Memory {
    pub id: String,
    #[serde(rename = "isFolder")]
    pub is_folder: i32,
    pub title: String,
    #[serde(rename = "fileUrl")]
    pub file_url: Option<String>,
    #[serde(rename = "parentId")]
    pub parent_id: Option<String>,
    pub created: i64,
    pub updated: i64,
    #[serde(rename = "visitedTime")]
    pub visited_time: Option<i64>,
    pub size: Option<i64>,
    pub starred: i32,
}

#[derive(Debug, Deserialize)]
pub struct CreateMemory {
    pub id: String,
    #[serde(rename = "isFolder")]
    pub is_folder: i32,
    pub title: String,
    #[serde(rename = "fileUrl")]
    pub file_url: Option<String>,
    #[serde(rename = "parentId")]
    pub parent_id: Option<String>,
    pub created: i64,
    pub updated: i64,
    #[serde(rename = "visitedTime")]
    pub visited_time: Option<i64>,
    pub size: Option<i64>,
    pub starred: i32,
}

#[derive(Debug, Deserialize)]
pub struct UpdateMemory {
    pub title: Option<String>,
    #[serde(rename = "fileUrl")]
    pub file_url: Option<String>,
    #[serde(rename = "parentId")]
    pub parent_id: Option<String>,
    #[allow(dead_code)]
    pub content: Option<String>,
}

// ========== Diary ==========
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Diary {
    pub id: String,
    #[serde(rename = "monthDiarys")]
    pub month_diarys: String,
}

// ========== Session ==========
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Session {
    pub id: String,
    pub title: String,
    #[serde(rename = "lastUpdated")]
    pub last_updated: String,
    pub messages: String,
    pub description: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateSession {
    pub id: String,
    pub title: String,
    #[serde(rename = "lastUpdated")]
    pub last_updated: String,
    pub messages: String,
    pub description: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateSession {
    pub title: Option<String>,
    #[serde(rename = "lastUpdated")]
    pub last_updated: Option<String>,
    pub messages: Option<String>,
    pub description: Option<String>,
}

// ========== Agent ==========
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MyAgent {
    pub id: String,
    pub name: String,
    pub description: String,
    pub content: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateAgent {
    pub id: String,
    pub name: String,
    pub description: String,
    pub content: String,
}

#[derive(Debug, Deserialize)]
pub struct UpdateAgent {
    pub name: Option<String>,
    pub description: Option<String>,
    pub content: Option<String>,
}

// ========== Book ==========
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Book {
    pub id: String,
    pub title: String,
    pub cover: String,
    pub tags: String,
    pub settings: String,
    pub description: String,
    #[serde(rename = "createdAt")]
    pub created_at: i64,
    #[serde(rename = "updatedAt")]
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BookDetail {
    pub id: String,
    pub title: String,
    pub cover: String,
    pub tags: String,
    pub settings: String,
    pub description: String,
    #[serde(rename = "createdAt")]
    pub created_at: i64,
    #[serde(rename = "updatedAt")]
    pub updated_at: i64,
    pub chapters: Vec<ChapterMeta>,
    pub volumes: Vec<Volume>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChapterMeta {
    pub id: String,
    #[serde(rename = "bookId")]
    pub book_id: String,
    pub title: String,
    #[serde(rename = "wordCount")]
    pub word_count: i64,
    #[serde(rename = "volumeId")]
    pub volume_id: Option<String>,
    pub order: i64,
    #[serde(rename = "createdAt")]
    pub created_at: i64,
    #[serde(rename = "updatedAt")]
    pub updated_at: i64,
    pub metadata: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateBook {
    pub id: String,
    pub title: String,
    pub cover: Option<String>,
    pub tags: Option<String>,
    pub settings: Option<String>,
    pub description: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateBook {
    pub title: Option<String>,
    pub cover: Option<String>,
    pub tags: Option<String>,
    pub settings: Option<String>,
    pub description: Option<String>,
}

// ========== Chapter ==========
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Chapter {
    pub id: String,
    #[serde(rename = "bookId")]
    pub book_id: String,
    pub title: String,
    pub content: String,
    #[serde(rename = "wordCount")]
    pub word_count: i64,
    #[serde(rename = "volumeId")]
    pub volume_id: Option<String>,
    pub order: i64,
    #[serde(rename = "createdAt")]
    pub created_at: i64,
    #[serde(rename = "updatedAt")]
    pub updated_at: i64,
    pub metadata: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateChapter {
    pub id: Option<String>,
    #[serde(rename = "bookId")]
    pub book_id: String,
    pub title: String,
    pub content: Option<String>,
    #[serde(rename = "wordCount")]
    pub word_count: Option<i64>,
    #[serde(rename = "volumeId")]
    pub volume_id: Option<String>,
    pub order: Option<i64>,
    pub metadata: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateChapter {
    pub title: Option<String>,
    pub content: Option<String>,
    #[serde(rename = "wordCount")]
    pub word_count: Option<i64>,
    #[serde(rename = "volumeId")]
    pub volume_id: Option<String>,
    pub order: Option<i64>,
    pub metadata: Option<String>,
}

// ========== Volume ==========
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Volume {
    pub id: String,
    #[serde(rename = "bookId")]
    pub book_id: String,
    pub title: String,
    pub order: i64,
    #[serde(rename = "createdAt")]
    pub created_at: i64,
}

#[derive(Debug, Deserialize)]
pub struct CreateVolume {
    pub id: Option<String>,
    #[serde(rename = "bookId")]
    pub book_id: String,
    pub title: String,
    pub order: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateVolume {
    pub title: Option<String>,
    pub order: Option<i64>,
}

// ========== BookAgent ==========
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BookAgent {
    pub id: String,
    #[serde(rename = "bookId")]
    pub book_id: String,
    pub title: String,
    pub messages: String,
    pub status: String,
    #[serde(rename = "createdAt")]
    pub created_at: i64,
    #[serde(rename = "updatedAt")]
    pub updated_at: i64,
}

#[derive(Debug, Deserialize)]
pub struct CreateBookAgent {
    pub id: String,
    #[serde(rename = "bookId")]
    pub book_id: String,
    pub title: Option<String>,
    pub messages: Option<String>,
    pub status: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateBookAgent {
    pub title: Option<String>,
    pub messages: Option<String>,
    pub status: Option<String>,
}

// ========== AI ==========
#[derive(Debug, Deserialize)]
pub struct ChatStreamRequest {
    pub prompt: String,
    pub history: Option<Vec<ChatMessage>>,
    pub model: String,
    #[serde(rename = "apiKey")]
    pub api_key: String,
    #[serde(rename = "requestId")]
    #[allow(dead_code)]
    pub request_id: String,
    #[serde(rename = "systemPrompt")]
    pub system_prompt: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ChatAgentRequest {
    pub prompt: String,
    pub history: Option<Vec<ChatMessage>>,
    pub model: String,
    #[serde(rename = "apiKey")]
    pub api_key: String,
    #[serde(rename = "systemPrompt")]
    pub system_prompt: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

// ========== API Response ==========
#[derive(Debug, Serialize)]
#[allow(dead_code)]
pub struct ApiResponse<T: Serialize> {
    pub code: u16,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<T>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[allow(dead_code)]
impl<T: Serialize> ApiResponse<T> {
    pub fn success(data: T) -> Self {
        Self { code: 200, data: Some(data), message: None, error: None }
    }
    pub fn created(data: T) -> Self {
        Self { code: 201, data: Some(data), message: None, error: None }
    }
}

#[allow(dead_code)]
impl ApiResponse<()> {
    pub fn error(code: u16, msg: &str) -> Self {
        Self { code, data: None, message: None, error: Some(msg.to_string()) }
    }
    pub fn not_found() -> Self {
        Self { code: 404, data: None, message: None, error: Some("Not found".to_string()) }
    }
}

use axum::{Router, Json, extract::{Path, State}, response::IntoResponse, routing::{get, post}};
use std::sync::Arc;
use super::{AppState, ok, created, err};

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/api/memorys", get(list_memories).post(create_memory))
        .route("/api/memorys/get_children/:id", get(get_memory_children))
        .route("/api/memorys/:id", get(get_memory).put(update_memory).delete(delete_memory))
        .route("/api/memorys_recent", get(get_recent_memories))
        .route("/api/memorys_starred", get(get_starred_memories))
        .route("/api/memory/star/:id", post(toggle_star))
}

async fn list_memories(State(s): State<Arc<AppState>>) -> impl IntoResponse {
    match s.db.get_all_memories() {
        Ok(list) => ok(list),
        Err(e) => err(500, &e.to_string()),
    }
}

async fn get_memory(State(s): State<Arc<AppState>>, Path(id): Path<String>) -> impl IntoResponse {
    match s.db.get_memory_by_id(&id) {
        Ok(m) => ok(m),
        Err(e) => err(500, &e.to_string()),
    }
}

async fn get_memory_children(State(s): State<Arc<AppState>>, Path(id): Path<String>) -> impl IntoResponse {
    match s.db.get_memory_children(&id) {
        Ok(list) => ok(list),
        Err(e) => err(500, &e.to_string()),
    }
}

async fn get_recent_memories(State(s): State<Arc<AppState>>) -> impl IntoResponse {
    match s.db.get_recent_memories() {
        Ok(list) => ok(list),
        Err(e) => err(500, &e.to_string()),
    }
}

async fn get_starred_memories(State(s): State<Arc<AppState>>) -> impl IntoResponse {
    match s.db.get_starred_memories() {
        Ok(list) => ok(list),
        Err(e) => err(500, &e.to_string()),
    }
}

async fn create_memory(State(s): State<Arc<AppState>>, Json(body): Json<crate::models::CreateMemory>) -> impl IntoResponse {
    let mut body = body;
    if body.is_folder == 0 && body.file_url.is_none() {
        let now = chrono::Utc::now();
        let date_dir = format!("{}/{:02}/{:02}", now.format("%Y"), now.format("%m"), now.format("%d"));
        let file_dir = format!("{}/uploads/files/{}", s.upload_dir, date_dir);
        let _ = std::fs::create_dir_all(&file_dir);
        let filename = format!("{}.html", body.id);
        let filepath = format!("{}/{}", file_dir, filename);
        let _ = std::fs::write(&filepath, "");
        body.file_url = Some(format!("/uploads/files/{}/{}", date_dir, filename));
    }
    match s.db.create_memory(&body) {
        Ok(m) => created(m),
        Err(e) => err(500, &e.to_string()),
    }
}

async fn update_memory(State(s): State<Arc<AppState>>, Path(id): Path<String>, Json(body): Json<crate::models::UpdateMemory>) -> impl IntoResponse {
    if let Some(ref content) = body.content {
        if let Ok(m) = s.db.get_memory_by_id(&id) {
            if let Some(ref file_url) = m.file_url {
                let full_path = format!("{}{}", s.upload_dir, file_url);
                let _ = std::fs::write(&full_path, content);
            }
        }
    }
    match s.db.update_memory(&id, &body) {
        Ok(m) => ok(m),
        Err(e) => err(500, &e.to_string()),
    }
}

async fn delete_memory(State(s): State<Arc<AppState>>, Path(id): Path<String>) -> impl IntoResponse {
    match s.db.delete_memory(&id) {
        Ok(file_url) => {
            if let Some(url) = file_url {
                let full_path = format!("{}{}", s.upload_dir, url);
                let _ = std::fs::remove_file(&full_path);
                if let Some(parent) = std::path::Path::new(&full_path).parent() {
                    let _ = std::fs::remove_dir(parent);
                }
            }
            ok(serde_json::json!(null))
        }
        Err(e) => err(500, &e.to_string()),
    }
}

async fn toggle_star(State(s): State<Arc<AppState>>, Path(id): Path<String>) -> impl IntoResponse {
    match s.db.toggle_star(&id) {
        Ok(m) => ok(m),
        Err(e) => err(500, &e.to_string()),
    }
}

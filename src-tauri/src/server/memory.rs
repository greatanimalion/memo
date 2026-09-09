use axum::{Router, Json, extract::{Path, State}, response::IntoResponse, routing::{get, post}};
use std::sync::Arc;
use super::{AppState, ok, created, err};

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/api/memorys", get(list_memories).post(create_memory))
        .route("/api/memorys/{id}", get(get_memory).put(update_memory).delete(delete_memory))
        .route("/api/memorys/get_children/{id}", get(get_memory_children))
        .route("/api/memorys_recent", get(get_recent_memories))
        .route("/api/memorys_starred", get(get_starred_memories))
        .route("/api/memory/star/{id}", post(toggle_star))
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
    match s.db.create_memory(&body) {
        Ok(m) => created(m),
        Err(e) => err(500, &e.to_string()),
    }
}

async fn update_memory(State(s): State<Arc<AppState>>, Path(id): Path<String>, Json(body): Json<crate::models::UpdateMemory>) -> impl IntoResponse {
    match s.db.update_memory(&id, &body) {
        Ok(m) => ok(m),
        Err(e) => err(500, &e.to_string()),
    }
}

async fn delete_memory(State(s): State<Arc<AppState>>, Path(id): Path<String>) -> impl IntoResponse {
    match s.db.delete_memory(&id) {
        Ok(()) => ok(serde_json::json!(null)),
        Err(e) => err(500, &e.to_string()),
    }
}

async fn toggle_star(State(s): State<Arc<AppState>>, Path(id): Path<String>) -> impl IntoResponse {
    match s.db.toggle_star(&id) {
        Ok(m) => ok(m),
        Err(e) => err(500, &e.to_string()),
    }
}

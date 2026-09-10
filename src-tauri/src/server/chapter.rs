use axum::{Router, Json, extract::{Path, State}, response::IntoResponse, routing::{get, post}};
use std::sync::Arc;
use super::{AppState, ok, created, err};

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/api/books/:book_id/chapters", get(list_chapters))
        .route("/api/chapters/:id", get(get_chapter).put(update_chapter).delete(delete_chapter))
        .route("/api/chapters", post(create_chapter))
}

async fn list_chapters(State(s): State<Arc<AppState>>, Path(book_id): Path<String>) -> impl IntoResponse {
    match s.db.get_chapters_by_book(&book_id) {
        Ok(list) => ok(list),
        Err(e) => err(500, &e.to_string()),
    }
}

async fn get_chapter(State(s): State<Arc<AppState>>, Path(id): Path<String>) -> impl IntoResponse {
    match s.db.get_chapter_by_id(&id) {
        Ok(c) => ok(c),
        Err(e) => err(500, &e.to_string()),
    }
}

async fn create_chapter(State(s): State<Arc<AppState>>, Json(body): Json<crate::models::CreateChapter>) -> impl IntoResponse {
    match s.db.create_chapter(&body) {
        Ok(c) => created(c),
        Err(e) => err(500, &e.to_string()),
    }
}

async fn update_chapter(State(s): State<Arc<AppState>>, Path(id): Path<String>, Json(body): Json<crate::models::UpdateChapter>) -> impl IntoResponse {
    match s.db.update_chapter(&id, &body) {
        Ok(c) => ok(c),
        Err(e) => err(500, &e.to_string()),
    }
}

async fn delete_chapter(State(s): State<Arc<AppState>>, Path(id): Path<String>) -> impl IntoResponse {
    match s.db.delete_chapter(&id) {
        Ok(()) => ok(serde_json::json!(null)),
        Err(e) => err(500, &e.to_string()),
    }
}

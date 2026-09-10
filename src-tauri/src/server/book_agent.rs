use axum::{Router, Json, extract::{Path, State}, response::IntoResponse, routing::{get, post}};
use std::sync::Arc;
use super::{AppState, ok, created, err};

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/api/books/:book_id/agents", get(list_book_agents).delete(delete_all_book_agents))
        .route("/api/book-agents/:id", get(get_book_agent).put(update_book_agent).delete(delete_book_agent))
        .route("/api/book-agents", post(create_book_agent))
}

async fn list_book_agents(State(s): State<Arc<AppState>>, Path(book_id): Path<String>) -> impl IntoResponse {
    match s.db.get_book_agents(&book_id) {
        Ok(list) => ok(list),
        Err(e) => err(500, &e.to_string()),
    }
}

async fn get_book_agent(State(s): State<Arc<AppState>>, Path(id): Path<String>) -> impl IntoResponse {
    match s.db.get_book_agent_by_id(&id) {
        Ok(a) => ok(a),
        Err(e) => err(500, &e.to_string()),
    }
}

async fn create_book_agent(State(s): State<Arc<AppState>>, Json(body): Json<crate::models::CreateBookAgent>) -> impl IntoResponse {
    match s.db.create_book_agent(&body) {
        Ok(a) => created(a),
        Err(e) => err(500, &e.to_string()),
    }
}

async fn update_book_agent(State(s): State<Arc<AppState>>, Path(id): Path<String>, Json(body): Json<crate::models::UpdateBookAgent>) -> impl IntoResponse {
    match s.db.update_book_agent(&id, &body) {
        Ok(a) => ok(a),
        Err(e) => err(500, &e.to_string()),
    }
}

async fn delete_book_agent(State(s): State<Arc<AppState>>, Path(id): Path<String>) -> impl IntoResponse {
    match s.db.delete_book_agent(&id) {
        Ok(()) => ok(serde_json::json!(null)),
        Err(e) => err(500, &e.to_string()),
    }
}

async fn delete_all_book_agents(State(s): State<Arc<AppState>>, Path(book_id): Path<String>) -> impl IntoResponse {
    match s.db.delete_book_agents(&book_id) {
        Ok(()) => ok(serde_json::json!(null)),
        Err(e) => err(500, &e.to_string()),
    }
}

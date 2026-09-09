use axum::{Router, Json, extract::{Path, State}, response::IntoResponse, routing::get};
use std::sync::Arc;
use super::{AppState, ok, created, err};

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/api/books", get(list_books).post(create_book))
        .route("/api/books/{id}", get(get_book).put(update_book).delete(delete_book))
        .route("/api/books/{id}/detail", get(get_book_detail))
}

async fn list_books(State(s): State<Arc<AppState>>) -> impl IntoResponse {
    match s.db.get_all_books() {
        Ok(list) => ok(list),
        Err(e) => err(500, &e.to_string()),
    }
}

async fn get_book(State(s): State<Arc<AppState>>, Path(id): Path<String>) -> impl IntoResponse {
    match s.db.get_book_by_id(&id) {
        Ok(b) => ok(b),
        Err(e) => err(500, &e.to_string()),
    }
}

async fn get_book_detail(State(s): State<Arc<AppState>>, Path(id): Path<String>) -> impl IntoResponse {
    match s.db.get_book_detail(&id) {
        Ok(d) => ok(d),
        Err(e) => err(500, &e.to_string()),
    }
}

async fn create_book(State(s): State<Arc<AppState>>, Json(body): Json<crate::models::CreateBook>) -> impl IntoResponse {
    match s.db.create_book(&body) {
        Ok(b) => created(b),
        Err(e) => err(500, &e.to_string()),
    }
}

async fn update_book(State(s): State<Arc<AppState>>, Path(id): Path<String>, Json(body): Json<crate::models::UpdateBook>) -> impl IntoResponse {
    match s.db.update_book(&id, &body) {
        Ok(b) => ok(b),
        Err(e) => err(500, &e.to_string()),
    }
}

async fn delete_book(State(s): State<Arc<AppState>>, Path(id): Path<String>) -> impl IntoResponse {
    match s.db.delete_book(&id) {
        Ok(()) => ok(serde_json::json!(null)),
        Err(e) => err(500, &e.to_string()),
    }
}

use axum::{Router, Json, extract::{Path, State}, response::IntoResponse, routing::{get, post}};
use std::sync::Arc;
use super::{AppState, ok, created, err};

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/api/books/{book_id}/volumes", get(list_volumes))
        .route("/api/volumes/{id}", get(get_volume).put(update_volume).delete(delete_volume))
        .route("/api/volumes", post(create_volume))
}

async fn list_volumes(State(s): State<Arc<AppState>>, Path(book_id): Path<String>) -> impl IntoResponse {
    match s.db.get_volumes_by_book(&book_id) {
        Ok(list) => ok(list),
        Err(e) => err(500, &e.to_string()),
    }
}

async fn get_volume(State(s): State<Arc<AppState>>, Path(id): Path<String>) -> impl IntoResponse {
    match s.db.get_volume_by_id(&id) {
        Ok(v) => ok(v),
        Err(e) => err(500, &e.to_string()),
    }
}

async fn create_volume(State(s): State<Arc<AppState>>, Json(body): Json<crate::models::CreateVolume>) -> impl IntoResponse {
    match s.db.create_volume(&body) {
        Ok(v) => created(v),
        Err(e) => err(500, &e.to_string()),
    }
}

async fn update_volume(State(s): State<Arc<AppState>>, Path(id): Path<String>, Json(body): Json<crate::models::UpdateVolume>) -> impl IntoResponse {
    match s.db.update_volume(&id, &body) {
        Ok(v) => ok(v),
        Err(e) => err(500, &e.to_string()),
    }
}

async fn delete_volume(State(s): State<Arc<AppState>>, Path(id): Path<String>) -> impl IntoResponse {
    match s.db.delete_volume(&id) {
        Ok(()) => ok(serde_json::json!(null)),
        Err(e) => err(500, &e.to_string()),
    }
}

use axum::{Router, Json, extract::{Path, State}, response::IntoResponse, routing::get};
use std::sync::Arc;
use super::{AppState, ok, created, err};

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/api/sessions", get(list_sessions).post(create_session))
        .route("/api/sessions/{id}", get(get_session).put(update_session).delete(delete_session))
}

async fn list_sessions(State(s): State<Arc<AppState>>) -> impl IntoResponse {
    match s.db.get_all_sessions() {
        Ok(list) => ok(list),
        Err(e) => err(500, &e.to_string()),
    }
}

async fn get_session(State(s): State<Arc<AppState>>, Path(id): Path<String>) -> impl IntoResponse {
    match s.db.get_session_by_id(&id) {
        Ok(s) => ok(s),
        Err(e) => err(500, &e.to_string()),
    }
}

async fn create_session(State(s): State<Arc<AppState>>, Json(body): Json<crate::models::CreateSession>) -> impl IntoResponse {
    match s.db.create_session(&body) {
        Ok(s) => created(s),
        Err(e) => err(500, &e.to_string()),
    }
}

async fn update_session(State(s): State<Arc<AppState>>, Path(id): Path<String>, Json(body): Json<crate::models::UpdateSession>) -> impl IntoResponse {
    match s.db.update_session(&id, &body) {
        Ok(s) => ok(s),
        Err(e) => err(500, &e.to_string()),
    }
}

async fn delete_session(State(s): State<Arc<AppState>>, Path(id): Path<String>) -> impl IntoResponse {
    match s.db.delete_session(&id) {
        Ok(()) => ok(serde_json::json!(null)),
        Err(e) => err(500, &e.to_string()),
    }
}

use axum::{Router, Json, extract::State, response::IntoResponse, routing::{get, post}};
use std::sync::Arc;
use super::{AppState, ok, err};

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/api/memorySize", get(get_memory_size))
        .route("/api/storage", get(export_all))
        .route("/api/storage/restore", post(import_all))
}

async fn get_memory_size(State(s): State<Arc<AppState>>) -> impl IntoResponse {
    let size = s.db.get_database_size(&s.db_path);
    ok(size)
}

async fn export_all(State(s): State<Arc<AppState>>) -> impl IntoResponse {
    match s.db.export_all() {
        Ok(data) => ok(data),
        Err(e) => err(500, &e.to_string()),
    }
}

#[derive(Debug, serde::Deserialize)]
pub struct RestoreRequest {
    #[serde(rename = "restoreData")]
    pub restore_data: serde_json::Value,
}

async fn import_all(State(s): State<Arc<AppState>>, Json(body): Json<RestoreRequest>) -> impl IntoResponse {
    match s.db.import_all(&body.restore_data) {
        Ok(()) => ok(serde_json::json!(null)),
        Err(e) => err(500, &e.to_string()),
    }
}

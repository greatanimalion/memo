use axum::{Router, Json, extract::{Path, State}, response::IntoResponse, routing::get};
use std::sync::Arc;
use super::{AppState, ok, err};

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/api/diarys/{id}", get(get_diary).put(upsert_diary))
}

async fn get_diary(State(s): State<Arc<AppState>>, Path(id): Path<String>) -> impl IntoResponse {
    match s.db.get_diary(&id) {
        Ok(d) => ok(d),
        Err(_) => err(404, "Diary not found"),
    }
}

async fn upsert_diary(State(s): State<Arc<AppState>>, Path(id): Path<String>, Json(body): Json<serde_json::Value>) -> impl IntoResponse {
    let month_diarys = body.get("monthDiarys").and_then(|v| v.as_str()).unwrap_or("[]");
    match s.db.upsert_diary(&id, month_diarys) {
        Ok(d) => ok(d),
        Err(e) => err(500, &e.to_string()),
    }
}

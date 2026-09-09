use axum::{Router, extract::State, response::IntoResponse, routing::get};
use std::sync::Arc;
use super::{AppState, ok};

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/api/memorySize", get(get_memory_size))
}

async fn get_memory_size(State(s): State<Arc<AppState>>) -> impl IntoResponse {
    let size = s.db.get_database_size(&s.db_path);
    ok(size)
}

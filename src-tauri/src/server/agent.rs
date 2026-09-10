use axum::{Router, Json, extract::{Path, State}, response::IntoResponse, routing::{get, put}};
use std::sync::Arc;
use super::{AppState, ok, created, err};

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/api/agents", get(list_agents).post(create_agent))
        .route("/api/agents/:id", put(update_agent).delete(delete_agent))
}

async fn list_agents(State(s): State<Arc<AppState>>) -> impl IntoResponse {
    match s.db.get_all_agents() {
        Ok(list) => ok(list),
        Err(e) => err(500, &e.to_string()),
    }
}

async fn create_agent(State(s): State<Arc<AppState>>, Json(body): Json<crate::models::CreateAgent>) -> impl IntoResponse {
    match s.db.create_agent(&body) {
        Ok(a) => created(a),
        Err(e) => err(500, &e.to_string()),
    }
}

async fn update_agent(State(s): State<Arc<AppState>>, Path(id): Path<String>, Json(body): Json<crate::models::UpdateAgent>) -> impl IntoResponse {
    match s.db.update_agent(&id, &body) {
        Ok(a) => ok(a),
        Err(e) => err(500, &e.to_string()),
    }
}

async fn delete_agent(State(s): State<Arc<AppState>>, Path(id): Path<String>) -> impl IntoResponse {
    match s.db.delete_agent(&id) {
        Ok(()) => ok(serde_json::json!(null)),
        Err(e) => err(500, &e.to_string()),
    }
}

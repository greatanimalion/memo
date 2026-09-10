pub mod memory;
pub mod diary;
pub mod session;
pub mod agent;
pub mod book;
pub mod chapter;
pub mod volume;
pub mod book_agent;
pub mod ai;
pub mod storage;
pub mod upload;

use axum::{Router, Json, http::StatusCode};
use std::sync::Arc;
use tower_http::cors::{CorsLayer, Any};

use crate::db::Database;

pub struct AppState {
    pub db: Arc<Database>,
    pub db_path: String,
    pub upload_dir: String,
}

pub fn build_router(state: Arc<AppState>) -> Router {
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    Router::new()
        .merge(memory::router())
        .merge(diary::router())
        .merge(session::router())
        .merge(agent::router())
        .merge(book::router())
        .merge(chapter::router())
        .merge(volume::router())
        .merge(book_agent::router())
        .merge(ai::router())
        .merge(storage::router())
        .merge(upload::router(&state.upload_dir))
        .with_state(state)
        .layer(cors)
}

pub fn ok<T: serde::Serialize>(data: T) -> (StatusCode, Json<serde_json::Value>) {
    (StatusCode::OK, Json(serde_json::json!({"code": 200, "data": data})))
}

pub fn created<T: serde::Serialize>(data: T) -> (StatusCode, Json<serde_json::Value>) {
    (StatusCode::CREATED, Json(serde_json::json!({"code": 201, "data": data})))
}

pub fn err(code: u16, msg: &str) -> (StatusCode, Json<serde_json::Value>) {
    (StatusCode::from_u16(code).unwrap_or(StatusCode::INTERNAL_SERVER_ERROR), Json(serde_json::json!({"code": code, "error": msg})))
}

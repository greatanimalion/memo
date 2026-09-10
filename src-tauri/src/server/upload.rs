use axum::{Router, Json, extract::{State, Multipart}, response::IntoResponse, routing::post};
use serde::Deserialize;
use std::sync::Arc;
use super::{AppState, ok, err};

pub fn router(upload_dir: &str) -> Router<Arc<AppState>> {
    let serve_path = format!("{}/uploads", upload_dir);
    Router::new()
        .route("/upload", post(upload_file))
        .route("/deleteFile", post(delete_file).delete(delete_file))
        .nest_service("/uploads", tower_http::services::ServeDir::new(&serve_path))
}

async fn upload_file(State(s): State<Arc<AppState>>, mut multipart: Multipart) -> impl IntoResponse {
    while let Some(field) = multipart.next_field().await.unwrap_or(None) {
        let name = field.file_name().unwrap_or("unknown").to_string();
        let ext = std::path::Path::new(&name)
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("bin");
        let now = chrono::Utc::now();
        let date_dir = format!("{}/{:02}/{:02}", now.format("%Y"), now.format("%m"), now.format("%d"));
        let upload_dir = format!("{}/uploads/images/{}", s.upload_dir, date_dir);
        std::fs::create_dir_all(&upload_dir).ok();
        let filename = format!("{}-{}.{}", name.trim_end_matches(&format!(".{}", ext)), chrono::Utc::now().timestamp_millis(), ext);
        let filepath = format!("{}/{}", upload_dir, filename);
        match field.bytes().await {
            Ok(bytes) => {
                if std::fs::write(&filepath, &bytes).is_ok() {
                    let relative_url = format!("/uploads/images/{}/{}", date_dir, filename);
                    return ok(serde_json::json!({
                        "url": relative_url,
                        "filename": filename,
                        "originalname": name,
                    }));
                }
            }
            Err(e) => return err(500, &e.to_string()),
        }
    }
    err(400, "No file uploaded")
}

#[derive(Debug, Deserialize)]
struct DeleteFileRequest {
    #[serde(rename = "filePath")]
    file_path: String,
}

async fn delete_file(State(s): State<Arc<AppState>>, Json(body): Json<DeleteFileRequest>) -> impl IntoResponse {
    let full_path = format!("{}/uploads{}", s.upload_dir, body.file_path);
    if std::fs::remove_file(&full_path).is_err() {
        return err(404, "File not found");
    }
    ok(serde_json::json!(null))
}

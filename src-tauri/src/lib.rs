mod db;
mod models;
pub mod server;

use std::fs;
use std::sync::Arc;
use tauri::Manager;

use db::Database;
use server::AppState;

#[tauri::command]
fn minimize_window(app: tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.minimize();
    }
}

#[tauri::command]
fn maximize_window(app: tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        if w.is_maximized().unwrap_or(false) {
            let _ = w.unmaximize();
        } else {
            let _ = w.maximize();
        }
    }
}

#[tauri::command]
fn close_window(app: tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.close();
    }
}

#[tauri::command]
fn hide_window(app: tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.hide();
    }
}

#[tauri::command]
fn show_window(app: tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.set_focus();
    }
}

#[tauri::command]
fn is_maximized(app: tauri::AppHandle) -> bool {
    app.get_webview_window("main")
        .and_then(|w| w.is_maximized().ok())
        .unwrap_or(false)
}

#[tauri::command]
fn write_file(file_path: String, content: String) -> Result<(), String> {
    if let Some(parent) = std::path::Path::new(&file_path).parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&file_path, &content).map_err(|e| e.to_string())
}

#[tauri::command]
fn read_file(file_path: String) -> Result<String, String> {
    fs::read_to_string(&file_path).map_err(|e| e.to_string())
}

#[tauri::command]
fn save_image(img_data: String, file_path: String) -> Result<(), String> {
    let base64_data = img_data
        .trim_start_matches("data:image/png;base64,")
        .trim_start_matches("data:image/jpeg;base64,")
        .trim_start_matches("data:image/gif;base64,");

    use base64::Engine;
    let decoded = base64::engine::general_purpose::STANDARD
        .decode(base64_data)
        .map_err(|e| e.to_string())?;

    if let Some(parent) = std::path::Path::new(&file_path).parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    fs::write(&file_path, &decoded).map_err(|e| e.to_string())
}

/// Set Per-Monitor DPI awareness on Windows to fix blurry WebView2 rendering.
/// Must be called before any windows are created.
#[cfg(target_os = "windows")]
fn set_dpi_awareness() {
    use std::ffi::c_void;

    type HMODULE = *mut c_void;
    type BOOL = i32;

    #[link(name = "kernel32")]
    extern "system" {
        fn GetModuleHandleW(name: *const u16) -> HMODULE;
    }
    #[link(name = "user32")]
    extern "system" {
        fn SetProcessDpiAwarenessContext(value: *const c_void) -> BOOL;
    }

    const DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2: *const c_void = -4isize as *const c_void;

    unsafe {
        let user32 = GetModuleHandleW(
            [b'u', b's', b'e', b'r', b'3', b'2', 0]
                .as_ptr()
                .cast(),
        );
        if !user32.is_null() {
            SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);
        }
    }
}

#[cfg(not(target_os = "windows"))]
fn set_dpi_awareness() {}

fn get_data_dir() -> String {
    // 生产环境: 系统根目录/.MemoryData
    // 开发环境: 项目目录/src/main/data
    if cfg!(debug_assertions) {
        let manifest_dir = env!("CARGO_MANIFEST_DIR");
        let project_root = std::path::Path::new(manifest_dir).parent().unwrap();
        project_root.join("src/main/data").to_string_lossy().to_string()
    } else {
        let root = if cfg!(target_os = "windows") {
            std::env::var("SystemDrive").unwrap_or_else(|_| "C:".to_string())
        } else {
            "/".to_string()
        };
        format!("{}\\.MemoryData", root)
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    set_dpi_awareness();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            minimize_window,
            maximize_window,
            close_window,
            hide_window,
            show_window,
            is_maximized,
            write_file,
            read_file,
            save_image,
        ])
        .setup(|_app| {
            let data_dir = get_data_dir();
            let db_path = format!("{}/storage.db", data_dir);
            let upload_dir = data_dir.clone();

            // 确保目录存在
            fs::create_dir_all(&data_dir).ok();
            fs::create_dir_all(format!("{}/uploads/images", data_dir)).ok();
            fs::create_dir_all(format!("{}/uploads/files", data_dir)).ok();

            // 初始化数据库
            let database = Database::new(&db_path).expect("Failed to initialize database");
            let state = Arc::new(AppState {
                db: Arc::new(database),
                db_path,
                upload_dir,
            });

            // 在后台启动 Axum HTTP 服务器
            tauri::async_runtime::spawn(async move {
                let router = server::build_router(state);
                let listener = tokio::net::TcpListener::bind("0.0.0.0:32068")
                    .await
                    .expect("Failed to bind to port 32068");
                println!("[Tauri] Rust API server running on http://localhost:32068");
                axum::serve(listener, router).await.expect("Server failed");
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

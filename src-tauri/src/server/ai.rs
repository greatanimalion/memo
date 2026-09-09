use axum::{Router, Json, extract::Query, response::{IntoResponse, Sse}, routing::{get, post}};
use std::collections::HashMap;
use std::convert::Infallible;
use std::sync::Arc;
use tokio_stream::StreamExt;
use super::{AppState, ok};

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/api/chat-stream", post(chat_stream))
        .route("/api/chat-agent", post(chat_agent))
        .route("/api/chat-cancel", get(chat_cancel))
        .route("/api/book-agent", post(book_agent))
}

fn get_api_url(model: &str) -> String {
    match model {
        "qwen-plus" => "https://dashscope.aliyuncs.com/compatible-mode/v1".to_string(),
        "glm-5.1" => "https://open.bigmodel.cn/api/paas/v4".to_string(),
        "deepseek-chat" | "deepseek-v4-flash" => "https://api.deepseek.com".to_string(),
        _ => "https://openrouter.ai/api/v1".to_string(),
    }
}

fn get_model_id(model: &str) -> String {
    match model {
        "openRouter" => "openai/gpt-5.2".to_string(),
        other => other.to_string(),
    }
}

async fn chat_stream(Json(body): Json<crate::models::ChatStreamRequest>) -> impl IntoResponse {
    let url = get_api_url(&body.model);
    let model = get_model_id(&body.model);
    let api_key = body.api_key.clone();
    let prompt = body.prompt.clone();
    let history = body.history.unwrap_or_default();
    let system_prompt = body.system_prompt.unwrap_or_default();

    let stream = async_stream::stream! {
        let client = reqwest::Client::new();
        let mut messages = Vec::new();
        if !system_prompt.is_empty() {
            messages.push(serde_json::json!({"role": "system", "content": system_prompt}));
        }
        for msg in &history {
            messages.push(serde_json::json!({"role": msg.role, "content": msg.content}));
        }
        messages.push(serde_json::json!({"role": "user", "content": prompt}));

        let body_payload = serde_json::json!({
            "model": model,
            "messages": messages,
            "stream": true,
        });

        let res = client.post(format!("{}/chat/completions", url))
            .header("Authorization", format!("Bearer {}", api_key))
            .header("Content-Type", "application/json")
            .json(&body_payload)
            .send()
            .await;

        match res {
            Ok(resp) => {
                let mut resp_stream = resp.bytes_stream();
                while let Some(chunk) = resp_stream.next().await {
                    if let Ok(bytes) = chunk {
                        let text = String::from_utf8_lossy(&bytes).to_string();
                        for line in text.lines() {
                            if let Some(data) = line.strip_prefix("data: ") {
                                if data == "[DONE]" {
                                    yield Ok::<_, Infallible>(axum::response::sse::Event::default()
                                        .event("done")
                                        .data("[DONE]"));
                                } else if let Ok(v) = serde_json::from_str::<serde_json::Value>(data) {
                                    if let Some(delta) = v["choices"][0]["delta"]["content"].as_str() {
                                        yield Ok::<_, Infallible>(axum::response::sse::Event::default()
                                            .event("message")
                                            .data(delta.to_string()));
                                    }
                                }
                            }
                        }
                    }
                }
            }
            Err(e) => {
                yield Ok::<_, Infallible>(axum::response::sse::Event::default()
                    .event("error")
                    .data(e.to_string()));
            }
        }
        yield Ok::<_, Infallible>(axum::response::sse::Event::default().event("done").data("[DONE]"));
    };

    Sse::new(stream).keep_alive(axum::response::sse::KeepAlive::default())
}

async fn chat_agent(Json(body): Json<crate::models::ChatAgentRequest>) -> impl IntoResponse {
    chat_stream(Json(crate::models::ChatStreamRequest {
        prompt: body.prompt,
        history: body.history,
        model: body.model,
        api_key: body.api_key,
        request_id: uuid::Uuid::new_v4().to_string(),
        system_prompt: body.system_prompt,
    })).await.into_response()
}

async fn book_agent(Json(body): Json<serde_json::Value>) -> impl IntoResponse {
    let prompt = body["prompt"].as_str().unwrap_or("").to_string();

    let stream = async_stream::stream! {
        yield Ok::<_, Infallible>(axum::response::sse::Event::default()
            .event("agent")
            .data(serde_json::json!({"name": "orchestrator"}).to_string()));
        yield Ok::<_, Infallible>(axum::response::sse::Event::default()
            .event("message")
            .data(format!("Book agent received: {}", prompt)));
        yield Ok::<_, Infallible>(axum::response::sse::Event::default().event("done").data("[DONE]"));
    };

    Sse::new(stream).keep_alive(axum::response::sse::KeepAlive::default())
}

async fn chat_cancel(Query(_params): Query<HashMap<String, String>>) -> impl IntoResponse {
    ok(serde_json::json!({"success": true, "message": "Cancel requested"}))
}

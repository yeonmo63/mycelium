use crate::db::DbPool;
use axum::{extract::State, response::IntoResponse, Json};
use serde_json::{json, Value};
use std::path::PathBuf;

pub async fn get_auth_status(
    State((_, config_dir)): State<(DbPool, PathBuf)>,
) -> impl IntoResponse {
    let config_path = config_dir.join("config.json");
    let mut use_pin = false;

    if let Ok(content) = std::fs::read_to_string(config_path) {
        if let Ok(json) = serde_json::from_str::<Value>(&content) {
            use_pin = json
                .get("mobile_use_pin")
                .and_then(|v| v.as_bool())
                .unwrap_or(false);
        }
    }

    Json(json!({ "require_pin": use_pin }))
}

pub async fn verify_pin(
    State((_, config_dir)): State<(DbPool, PathBuf)>,
    Json(payload): Json<Value>,
) -> impl IntoResponse {
    let input_pin = payload.get("pin").and_then(|v| v.as_str()).unwrap_or("");
    let config_path = config_dir.join("config.json");
    let mut stored_pin = "".to_string();

    if let Ok(content) = std::fs::read_to_string(config_path) {
        if let Ok(json) = serde_json::from_str::<Value>(&content) {
            stored_pin = json
                .get("mobile_access_pin")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
        }
    }

    if !stored_pin.is_empty() && stored_pin == input_pin {
        Json(json!({ "success": true, "username": "현장관리자", "role": "admin" }))
    } else {
        Json(json!({ "success": false, "error": "PIN 번호가 일치하지 않습니다." }))
    }
}

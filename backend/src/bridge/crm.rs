use crate::commands::consultation::create_consultation_internal;
use crate::db::DbPool;
use axum::{extract::State, response::IntoResponse, Json};
use serde_json::{json, Value};
use std::path::PathBuf;

pub async fn create_consultation_bridge(
    State((pool, _)): State<(DbPool, PathBuf)>,
    Json(payload): Json<Value>,
) -> impl IntoResponse {
    let customer_id = payload
        .get("customerId")
        .and_then(|v| v.as_str())
        .map(|v| v.to_string());
    let guest_name = payload
        .get("guestName")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let contact = payload
        .get("contact")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let channel = payload
        .get("channel")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let counselor_name = payload
        .get("counselorName")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let category = payload
        .get("category")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let title = payload
        .get("title")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let content = payload
        .get("content")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let priority = payload
        .get("priority")
        .and_then(|v| v.as_str())
        .unwrap_or("보통")
        .to_string();

    match create_consultation_internal(
        &pool,
        customer_id,
        guest_name,
        contact,
        channel,
        counselor_name,
        category,
        title,
        content,
        priority,
    )
    .await
    {
        Ok(id) => Json(json!({ "success": true, "consultId": id })),
        Err(e) => Json(json!({ "success": false, "error": e.to_string() })),
    }
}

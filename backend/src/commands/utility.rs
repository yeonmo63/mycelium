#![allow(non_snake_case)]
use crate::db::DbPool;
use crate::error::{MyceliumError, MyceliumResult};
use crate::state::AppState;
use axum::{
    extract::{State, Path},
    Json,
};
use serde::{Deserialize, Serialize};

#[derive(sqlx::FromRow, Serialize)]
struct ColumnName {
    column_name: String,
}

#[derive(Deserialize)]
pub struct DebugSchemaRequest {
    pub table_name: String,
}

pub async fn debug_db_schema(
    State(state): State<AppState>,
    Json(payload): Json<DebugSchemaRequest>,
) -> MyceliumResult<Json<Vec<String>>> {
    let rows: Vec<ColumnName> =
        sqlx::query_as("SELECT column_name FROM information_schema.columns WHERE table_name = $1")
            .bind(payload.table_name)
            .fetch_all(&state.pool)
            .await?;

    Ok(Json(rows.into_iter().map(|r| r.column_name).collect()))
}

/* 
// Commented out until we setup migration logic via API if needed
pub async fn init_db_schema(state: State<'_, DbPool>) -> MyceliumResult<()> {
    // Logic migration code...
    Ok(())
}
*/

pub async fn open_external_url(Json(payload): Json<serde_json::Value>) -> MyceliumResult<Json<()>> {
    let url = payload.get("url").and_then(|v| v.as_str()).unwrap_or("");
    if !url.is_empty() {
        open::that(url).map_err(|e| MyceliumError::Internal(format!("Failed to open URL: {}", e)))?;
    }
    Ok(Json(()))
}

/*
// Restart is not supported in standard web server typically, or requires supervisor
pub async fn restart_app(app: tauri::AppHandle) {
    app.restart();
}
*/

/*
// Requires filesystem access logic suitable for server
pub async fn save_qr_image(...) -> MyceliumResult<String> {
   ...
}
*/

pub async fn generate_qr_code(_data: String) -> MyceliumResult<Json<String>> {
    Ok(Json("QR Code Logic Placeholder".to_string()))
}

pub async fn greet(Path(name): Path<String>) -> Json<String> {
    Json(format!("Hello, {}! You've been greeted from Axum Backend!", name))
}

use axum::extract::{State as AxumState, Json};
use crate::state::AppState;
use crate::error::{MyceliumResult, MyceliumError};
use crate::commands::backup::auto::{run_daily_custom_backup, get_auto_backups};
use crate::commands::backup::models::AutoBackupItem;
use crate::commands::backup::logic::restore_database;
use crate::commands::backup::maintenance::{run_db_maintenance, cleanup_old_logs};
use crate::commands::backup::status::get_backup_status as get_status_cmd;
use crate::commands::config::get_app_config_dir;
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Deserialize)]
pub struct RunBackupPayload {
    #[serde(default)]
    pub is_incremental: bool,
    #[serde(default)]
    pub use_compression: bool,
}

#[derive(Deserialize)]
pub struct RestorePayload {
    pub path: String,
}

#[derive(Deserialize)]
pub struct CleanupPayload {
    pub months: i32,
}

#[derive(Deserialize)]
pub struct SavePathPayload {
    pub path: String,
}

pub async fn get_auto_backups_axum() -> MyceliumResult<Json<Vec<AutoBackupItem>>> {
    let app = ();
    let result = get_auto_backups(app).await?;
    Ok(Json(result))
}

pub async fn run_daily_custom_backup_axum(
    AxumState(state): AxumState<AppState>,
    Json(payload): Json<RunBackupPayload>
) -> MyceliumResult<Json<String>> {
    let app = ();
    let result = run_daily_custom_backup(app, &state.pool, payload.is_incremental, payload.use_compression).await?;
    Ok(Json(result))
}

pub async fn restore_database_axum(
    AxumState(state): AxumState<AppState>,
    Json(payload): Json<RestorePayload>
) -> MyceliumResult<Json<String>> {
    let app = ();
    let result = restore_database(app, &state.pool, payload.path).await?;
    Ok(Json(result))
}

pub async fn run_db_maintenance_axum(
    AxumState(state): AxumState<AppState>
) -> MyceliumResult<Json<String>> {
    let app = ();
    let result = run_db_maintenance(app, &state.pool).await?;
    Ok(Json(result))
}

pub async fn cleanup_old_logs_axum(
    AxumState(state): AxumState<AppState>,
    Json(payload): Json<CleanupPayload>
) -> MyceliumResult<Json<u64>> {
    let app = ();
    let result = cleanup_old_logs(app, &state.pool, payload.months).await?;
    Ok(Json(result))
}

pub async fn get_internal_backup_path_axum() -> MyceliumResult<Json<String>> {
    let dir = get_app_config_dir()?.join("daily_backups");
    Ok(Json(dir.to_string_lossy().to_string()))
}

fn get_config_path() -> MyceliumResult<std::path::PathBuf> {
    get_app_config_dir().map(|d| d.join("config.json"))
}

pub async fn get_external_backup_path_axum() -> MyceliumResult<Json<String>> {
    let path = get_config_path()?;
    if path.exists() {
        let content = std::fs::read_to_string(&path).map_err(|e| MyceliumError::Internal(e.to_string()))?;
        let json: Value = serde_json::from_str(&content).unwrap_or(serde_json::json!({}));
        let ext_path = json["external_backup_path"].as_str().unwrap_or("").to_string();
        Ok(Json(ext_path))
    } else {
        Ok(Json("".to_string()))
    }
}

pub async fn save_external_backup_path_axum(Json(payload): Json<SavePathPayload>) -> MyceliumResult<Json<()>> {
    let path = get_config_path()?;
    let mut json: Value = if path.exists() {
        let content = std::fs::read_to_string(&path).map_err(|e| MyceliumError::Internal(e.to_string()))?;
        serde_json::from_str(&content).unwrap_or(serde_json::json!({}))
    } else {
        serde_json::json!({})
    };
    
    json["external_backup_path"] = serde_json::Value::String(payload.path);
    
    std::fs::write(&path, serde_json::to_string_pretty(&json).map_err(|e| MyceliumError::Internal(e.to_string()))?)
        .map_err(|e| MyceliumError::Internal(e.to_string()))?;
    Ok(Json(()))
}

pub async fn get_backup_status_axum() -> MyceliumResult<Json<Value>> {
    let app = ();
    let status = get_status_cmd(app).await?;
    Ok(Json(status))
}

pub async fn cancel_backup_restore_axum() -> MyceliumResult<Json<()>> {
    Ok(Json(()))
}

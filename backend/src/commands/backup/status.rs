use crate::commands::backup::models::DbLocationInfo;
use crate::db::DbPool;
use crate::error::{MyceliumError, MyceliumResult};
use crate::stubs::{Manager, State};
use chrono::Datelike;

pub async fn check_db_location(state: State<'_, DbPool>) -> MyceliumResult<DbLocationInfo> {
    let pool = &*state;

    // 1. Query PostgreSQL for server address
    let server_addr: Option<(Option<String>,)> = sqlx::query_as("SELECT inet_server_addr()::text")
        .fetch_optional(pool)
        .await
        .map_err(|e| MyceliumError::Internal(format!("Failed to query server address: {}", e)))?;

    let db_host = server_addr
        .and_then(|r| r.0)
        .unwrap_or_else(|| "localhost".to_string());

    // 2. Check if it's a local connection
    let is_local = db_host.is_empty()
        || db_host == "localhost"
        || db_host == "127.0.0.1"
        || db_host == "::1"
        || (db_host.starts_with("192.168.") && db_host == get_local_ip().unwrap_or_default());

    // 3. Determine if this is the DB server (Simply based on connectivity for now)
    let is_db_server = is_local;

    // 4. Create message (Now allowing backup from all locations)
    let message = if is_db_server {
        "이 PC는 메인 DB 서버(또는 로컬 접속)입니다.".to_string()
    } else {
        format!(
            "원격 DB 서버({})에 연결되어 있습니다. 현재 PC에서 자유롭게 백업/복구가 가능합니다.",
            db_host
        )
    };

    Ok(DbLocationInfo {
        is_local,
        is_db_server,
        can_backup: true, // ALWAYS TRUE to unlock for all computers
        db_host,
        message,
    })
}

// Helper function to get local IP
pub fn get_local_ip() -> Option<String> {
    #[cfg(target_os = "windows")]
    {
        if let Ok(output) = std::process::Command::new("ipconfig").output() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            for line in stdout.lines() {
                if line.contains("IPv4") && line.contains("192.168.") {
                    if let Some(ip) = line.split(':').nth(1) {
                        return Some(ip.trim().to_string());
                    }
                }
            }
        }
    }
    None
}

pub fn get_last_backup_at(app: &crate::stubs::AppHandle) -> Option<chrono::NaiveDateTime> {
    if let Ok(config_dir) = app.path().app_config_dir() {
        let config_path = config_dir.join("config.json");
        if config_path.exists() {
            if let Ok(content) = std::fs::read_to_string(&config_path) {
                if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                    if let Some(ts) = json.get("last_backup_at").and_then(|v| v.as_str()) {
                        return chrono::NaiveDateTime::parse_from_str(ts, "%Y-%m-%dT%H:%M:%S").ok();
                    }
                }
            }
        }
    }
    None
}

pub fn update_last_backup_at(
    app: &crate::stubs::AppHandle,
    ts: chrono::NaiveDateTime,
) -> MyceliumResult<()> {
    let config_dir = app
        .path()
        .app_config_dir()
        .map_err(|e| MyceliumError::Internal(e.to_string()))?;
    let config_path = config_dir.join("config.json");
    let mut config_data = if config_path.exists() {
        let content = std::fs::read_to_string(&config_path)
            .map_err(|e| MyceliumError::Internal(e.to_string()))?;
        serde_json::from_str::<serde_json::Value>(&content).unwrap_or(serde_json::json!({}))
    } else {
        serde_json::json!({})
    };
    config_data["last_backup_at"] = serde_json::json!(ts.format("%Y-%m-%dT%H:%M:%S").to_string());
    let content = serde_json::to_string_pretty(&config_data)
        .map_err(|e| MyceliumError::Internal(e.to_string()))?;
    std::fs::write(&config_path, content).map_err(|e| MyceliumError::Internal(e.to_string()))?;
    Ok(())
}

pub async fn get_backup_status(app: crate::stubs::AppHandle) -> MyceliumResult<serde_json::Value> {
    let last_at = get_last_backup_at(&app);
    Ok(serde_json::json!({
        "last_backup_at": last_at.map(|ts| ts.format("%Y-%m-%dT%H:%M:%S").to_string()),
        "day_of_week": chrono::Local::now().weekday().to_string(),
        "is_friday": chrono::Local::now().weekday() == chrono::Weekday::Fri
    }))
}

pub fn get_internal_backup_path(app: crate::stubs::AppHandle) -> MyceliumResult<String> {
    if let Ok(config_dir) = app.path().app_config_dir() {
        let daily_dir = config_dir.join("daily_backups");
        return Ok(daily_dir.to_string_lossy().to_string());
    }
    Err(MyceliumError::Internal("Config dir not found".to_string()))
}

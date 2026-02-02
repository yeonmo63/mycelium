#![allow(non_snake_case)]
use crate::db::{
    CompanyInfo, Consultation, Customer, CustomerAddress, CustomerLedger, CustomerLog, DbPool,
    Event, Expense, ExperienceProgram, InventoryLog, Product, ProductPriceHistory, Sales, Schedule,
    User, Vendor,
};
use crate::error::{MyceliumError, MyceliumResult};
use crate::{BACKUP_CANCELLED, DB_MODIFIED, IS_EXITING};
use chrono::{Datelike, NaiveDate, NaiveDateTime};
use flate2::read::GzDecoder;
use flate2::write::GzEncoder;
use flate2::Compression;
use futures_util::StreamExt;
use std::io::{BufRead, BufWriter, Read, Write};
use std::sync::atomic::Ordering;
use tauri::{command, Emitter, Manager, State};

// Helper Structs
#[derive(Debug, serde::Serialize, serde::Deserialize)]
pub struct AutoBackupItem {
    pub name: String,
    pub path: String,
    pub created_at: String,
    pub timestamp: i64,
    pub backup_type: String, // "자동" or "일일"
}

// DB Location Information
#[derive(Debug, serde::Serialize)]
pub struct DbLocationInfo {
    is_local: bool,
    is_db_server: bool,
    can_backup: bool,
    db_host: String,
    message: String,
}

#[derive(Debug, serde::Serialize, serde::Deserialize, sqlx::FromRow)]
pub struct DeletionLog {
    pub log_id: i32,
    pub table_name: String,
    pub record_id: String,
    pub deleted_info: Option<String>,
    pub deleted_by: Option<String>,
    pub deleted_at: Option<NaiveDateTime>,
}

#[derive(Debug, serde::Serialize, serde::Deserialize, sqlx::FromRow)]
pub struct PurchaseBackup {
    pub purchase_id: Option<i32>,
    pub vendor_id: Option<i32>,
    pub purchase_date: Option<NaiveDate>,
    pub item_name: String,
    pub specification: Option<String>,
    pub quantity: i32,
    pub unit_price: i32,
    pub total_amount: i32,
    pub payment_status: Option<String>,
    pub memo: Option<String>,
    pub inventory_synced: Option<bool>,
    pub material_item_id: Option<i32>,
    pub created_at: Option<NaiveDateTime>,
    pub updated_at: Option<NaiveDateTime>,
}

#[derive(Debug, serde::Serialize, serde::Deserialize, sqlx::FromRow)]
pub struct ExperienceReservationBackup {
    pub reservation_id: i32,
    pub program_id: i32,
    pub customer_id: Option<String>,
    pub guest_name: String,
    pub guest_contact: String,
    pub reservation_date: NaiveDate,
    pub reservation_time: chrono::NaiveTime,
    pub participant_count: i32,
    pub total_amount: i32,
    pub status: String,
    pub payment_status: String,
    pub memo: Option<String>,
    pub created_at: Option<NaiveDateTime>,
    pub updated_at: Option<NaiveDateTime>,
}

#[derive(Debug, serde::Serialize, serde::Deserialize, sqlx::FromRow)]
pub struct SalesClaimBackup {
    pub claim_id: i32,
    pub sales_id: String,
    pub customer_id: Option<String>,
    pub claim_type: String,
    pub claim_status: String,
    pub reason_category: String,
    pub quantity: i32,
    pub refund_amount: i32,
    pub is_inventory_recovered: bool,
    pub memo: Option<String>,
    pub created_at: Option<chrono::NaiveDateTime>,
    pub updated_at: Option<chrono::NaiveDateTime>,
}

#[command]
pub async fn cancel_backup_restore() {
    BACKUP_CANCELLED.store(true, Ordering::Relaxed);
    println!("[System] Cancellation requested by user.");
}

#[command]
pub async fn confirm_exit(app: tauri::AppHandle, skip_auto_backup: bool) -> MyceliumResult<()> {
    // Prevent re-entry
    if IS_EXITING.load(Ordering::Relaxed) {
        return Ok(());
    }
    IS_EXITING.store(true, Ordering::Relaxed);

    // 0. Check if skip requested or no changes detected
    if skip_auto_backup || !DB_MODIFIED.load(Ordering::Relaxed) {
        std::process::exit(0);
    }

    if let Ok(config_dir) = app.path().app_config_dir() {
        let backup_dir = config_dir.join("backups");
        if !backup_dir.exists() {
            let _ = std::fs::create_dir_all(&backup_dir);
        }

        let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S");
        let day_of_week = chrono::Local::now().weekday();

        // Friday is Full Backup, other days are skip or Incremental
        let since = if day_of_week == chrono::Weekday::Fri {
            None
        } else {
            get_last_backup_at(&app)
        };

        let backup_file_prefix = if since.is_none() {
            "full_backup"
        } else {
            "inc_backup"
        };
        let backup_file_name = format!("{}_{}.json.gz", backup_file_prefix, timestamp);
        let backup_path = backup_dir.join(&backup_file_name);

        if let Some(pool) = app.try_state::<DbPool>() {
            match backup_database_internal(
                Some(app.clone()),
                &*pool,
                backup_path.to_string_lossy().to_string(),
                since,
                true, // use_compression (default for exit)
            )
            .await
            {
                Ok(_msg) => {
                    let _ = update_last_backup_at(&app, chrono::Local::now().naive_local());
                }
                Err(e) => eprintln!("[Auto-Backup] Failed: {}", e),
            }
        }
    }

    // Forcefully kill the process at OS level
    std::process::exit(0);
}

#[command]
pub async fn trigger_auto_backup(
    app: tauri::AppHandle,
    state: State<'_, DbPool>,
) -> MyceliumResult<String> {
    if !DB_MODIFIED.load(Ordering::Relaxed) {
        return Ok("No changes".to_string());
    }

    if let Ok(config_dir) = app.path().app_config_dir() {
        let backup_dir = config_dir.join("backups");
        if !backup_dir.exists() {
            let _ = std::fs::create_dir_all(&backup_dir);
        }

        let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S");
        let backup_file_name = format!("auto_backup_{}.json.gz", timestamp);
        let backup_path = backup_dir.join(&backup_file_name);

        match backup_database(
            app.clone(),
            state.clone(),
            backup_path.to_string_lossy().to_string(),
            true, // is_incremental
            true, // use_compression (default)
        )
        .await
        {
            Ok(_) => {
                DB_MODIFIED.store(false, Ordering::Relaxed);

                // --- External Cloud Backup Branch ---
                if let Ok(config_dir) = app.path().app_config_dir() {
                    let config_path = config_dir.join("config.json");
                    if config_path.exists() {
                        if let Ok(content) = std::fs::read_to_string(&config_path) {
                            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                                if let Some(ext_path) =
                                    json.get("external_backup_path").and_then(|v| v.as_str())
                                {
                                    if !ext_path.trim().is_empty() {
                                        let ext_dir = std::path::Path::new(ext_path);
                                        if ext_dir.exists() {
                                            let ext_backup_path = ext_dir.join(backup_file_name);
                                            let _ = backup_database(
                                                app.clone(),
                                                state.clone(),
                                                ext_backup_path.to_string_lossy().to_string(),
                                                true, // is_incremental
                                                true, // use_compression
                                            )
                                            .await;
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
                // ------------------------------------

                if let Ok(entries) = std::fs::read_dir(&backup_dir) {
                    let mut backups: Vec<_> = entries
                        .filter_map(|e| e.ok())
                        .filter(|e| {
                            e.file_name().to_string_lossy().starts_with("auto_backup_")
                                && (e.file_name().to_string_lossy().ends_with(".sql")
                                    || e.file_name().to_string_lossy().ends_with(".gz"))
                        })
                        .collect();
                    backups.sort_by_key(|b| std::cmp::Reverse(b.file_name()));
                    for backup in backups.iter().skip(30) {
                        let _ = std::fs::remove_file(backup.path());
                    }
                }
                Ok(format!("Backup created: {:?}", backup_path))
            }
            Err(e) => Err(MyceliumError::Internal(format!("Backup failed: {}", e))),
        }
    } else {
        Err(MyceliumError::Internal("Config dir not found".to_string()))
    }
}

#[command]
pub async fn restore_database_sql(
    state: State<'_, DbPool>,
    path: String,
) -> MyceliumResult<String> {
    let sql = std::fs::read_to_string(&path)
        .map_err(|e| MyceliumError::Internal(format!("Failed to read SQL file: {}", e)))?;

    let mut conn = state.acquire().await?;
    sqlx::query(&sql).execute(&mut *conn).await?;

    Ok("복구가 완료되었습니다. 서비스를 다시 시작해 주세요.".to_string())
}

#[command]
pub async fn delete_backup(path: String) -> MyceliumResult<()> {
    std::fs::remove_file(path)
        .map_err(|e| MyceliumError::Internal(format!("Failed to delete backup file: {}", e)))?;
    Ok(())
}

fn format_and_push(
    list: &mut Vec<AutoBackupItem>,
    path: std::path::PathBuf,
    datetime: chrono::DateTime<chrono::Local>,
    b_type: String,
) {
    let now = chrono::Local::now();
    let diff = now.signed_duration_since(datetime);
    let ago = if diff.num_seconds() < 60 {
        format!("{}초 전", diff.num_seconds())
    } else if diff.num_minutes() < 60 {
        format!("{}분 전", diff.num_minutes())
    } else if diff.num_hours() < 24 {
        format!("{}시간 전", diff.num_hours())
    } else {
        format!("{}일 전", diff.num_days())
    };

    let formatted = format!("{} ({})", datetime.format("%Y-%m-%d %H:%M:%S"), ago);

    list.push(AutoBackupItem {
        name: path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string(),
        path: path.to_string_lossy().to_string(),
        created_at: formatted,
        timestamp: datetime.timestamp(),
        backup_type: b_type,
    });
}

#[command]
pub async fn get_auto_backups(app: tauri::AppHandle) -> MyceliumResult<Vec<AutoBackupItem>> {
    let mut list = Vec::new();

    if let Ok(config_dir) = app.path().app_config_dir() {
        // 1. Auto Backups
        let backup_dir = config_dir.join("backups");
        if backup_dir.exists() {
            if let Ok(entries) = std::fs::read_dir(&backup_dir) {
                for entry in entries.filter_map(|e| e.ok()) {
                    let fname = entry.file_name().to_string_lossy().to_string();
                    if fname.starts_with("auto_backup_")
                        && (fname.ends_with(".sql") || fname.ends_with(".gz"))
                    {
                        if let Ok(metadata) = entry.metadata() {
                            if let Ok(modified) = metadata.modified() {
                                let datetime: chrono::DateTime<chrono::Local> = modified.into();
                                format_and_push(
                                    &mut list,
                                    entry.path(),
                                    datetime,
                                    "자동".to_string(),
                                );
                            }
                        }
                    }
                }
            }
        }

        // 2. Daily Backups
        let daily_dir = config_dir.join("daily_backups");
        if daily_dir.exists() {
            if let Ok(entries) = std::fs::read_dir(&daily_dir) {
                for entry in entries.filter_map(|e| e.ok()) {
                    let fname = entry.file_name().to_string_lossy().to_string();
                    if fname.starts_with("daily_backup_")
                        && (fname.ends_with(".sql") || fname.ends_with(".gz"))
                    {
                        if let Ok(metadata) = entry.metadata() {
                            if let Ok(modified) = metadata.modified() {
                                let datetime: chrono::DateTime<chrono::Local> = modified.into();
                                format_and_push(
                                    &mut list,
                                    entry.path(),
                                    datetime,
                                    "일일".to_string(),
                                );
                            }
                        }
                    }
                }
            }
        }
    }

    // Sort desc by timestamp
    list.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
    Ok(list)
}

#[command]
pub async fn get_internal_backup_path(app: tauri::AppHandle) -> MyceliumResult<String> {
    if let Ok(config_dir) = app.path().app_config_dir() {
        let daily_dir = config_dir.join("daily_backups");
        return Ok(daily_dir.to_string_lossy().to_string());
    }
    Err(MyceliumError::Internal("Config dir not found".to_string()))
}

#[command]
pub async fn run_daily_custom_backup(
    app: tauri::AppHandle,
    state: State<'_, DbPool>,
    is_incremental: bool,
    use_compression: bool,
) -> MyceliumResult<String> {
    run_backup_logic(app, state, is_incremental, use_compression, true).await
}

#[command]
pub async fn check_daily_backup(
    app: tauri::AppHandle,
    state: State<'_, DbPool>,
) -> MyceliumResult<String> {
    run_backup_logic(app, state, true, true, false).await
}

async fn run_backup_logic(
    app: tauri::AppHandle,
    state: State<'_, DbPool>,
    is_incremental: bool,
    use_compression: bool,
    force: bool,
) -> MyceliumResult<String> {
    if let Ok(config_dir) = app.path().app_config_dir() {
        let daily_dir = config_dir.join("daily_backups");
        if !daily_dir.exists() {
            let _ = std::fs::create_dir_all(&daily_dir);
        }

        let today = chrono::Local::now().format("%Y%m%d").to_string();
        let daily_extension = if use_compression { "json.gz" } else { "json" };
        let daily_filename = format!("daily_backup_{}.{}", today, daily_extension);
        let daily_path = daily_dir.join(&daily_filename);

        // Run if forced (manual button) OR if file doesn't exist (auto)
        if force || !daily_path.exists() {
            match backup_database(
                app.clone(),
                state.clone(),
                daily_path.to_string_lossy().to_string(),
                is_incremental,
                use_compression,
            )
            .await
            {
                Ok(msg) => {
                    // --- External Cloud Backup Branch ---
                    let config_path = config_dir.join("config.json");
                    if let Ok(content) = std::fs::read_to_string(&config_path) {
                        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                            if let Some(ext_path) =
                                json.get("external_backup_path").and_then(|v| v.as_str())
                            {
                                if !ext_path.trim().is_empty() {
                                    let ext_dir = std::path::Path::new(ext_path);
                                    if ext_dir.exists() {
                                        let ext_daily_dir = ext_dir.join("daily");
                                        let _ = std::fs::create_dir_all(&ext_daily_dir);
                                        let ext_backup_path = ext_daily_dir.join(&daily_filename);
                                        let _ = std::fs::copy(&daily_path, ext_backup_path);
                                    }
                                }
                            }
                        }
                    }

                    // Cleanup old daily backups (Keep 90 days)
                    if let Ok(entries) = std::fs::read_dir(&daily_dir) {
                        let mut backups: Vec<_> = entries
                            .filter_map(|e| e.ok())
                            .filter(|e| {
                                let fname_os = e.file_name();
                                let fname = fname_os.to_string_lossy();
                                fname.starts_with("daily_backup_")
                                    && (fname.ends_with(".sql") || fname.ends_with(".gz"))
                            })
                            .collect();

                        backups.sort_by_key(|b| b.file_name());

                        if backups.len() > 90 {
                            let to_delete = backups.len() - 90;
                            for b in backups.iter().take(to_delete) {
                                let _ = std::fs::remove_file(b.path());
                            }
                        }
                    }
                    return Ok(msg);
                }
                Err(e) => {
                    return Err(MyceliumError::Internal(format!(
                        "Daily backup failed: {}",
                        e
                    )))
                }
            }
        }
        Ok("Today's backup already exists".to_string())
    } else {
        Err(MyceliumError::Internal("Config dir not found".to_string()))
    }
}

// REST OF THE FILE TO BE ADDED

#[command]
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

    println!("[DB Location] db_host: {}", db_host);

    // 2. Check if it's a local connection
    let is_local = db_host.is_empty()
        || db_host == "localhost"
        || db_host == "127.0.0.1"
        || db_host == "::1"
        || (db_host.starts_with("192.168.") && db_host == get_local_ip().unwrap_or_default());

    println!("[DB Location] is_local: {}", is_local);

    // 3. Determine if this is the DB server (Simply based on connectivity for now)
    let is_db_server = is_local;

    println!(
        "[DB Location] is_db_server: {}, host: {}",
        is_db_server, db_host
    );

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
fn get_local_ip() -> Option<String> {
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

fn format_number(n: i64) -> String {
    let s = n.abs().to_string();
    let mut result = String::new();
    let chars: Vec<char> = s.chars().collect();
    let len = chars.len();
    for (i, &c) in chars.iter().enumerate() {
        if i > 0 && (len - i) % 3 == 0 {
            result.push(',');
        }
        result.push(c);
    }
    if n < 0 {
        format!("-{}", result)
    } else {
        result
    }
}

#[command]
pub async fn backup_database(
    app: tauri::AppHandle,
    state: State<'_, DbPool>,
    path: String,
    is_incremental: bool,
    use_compression: bool,
) -> MyceliumResult<String> {
    let since = if is_incremental {
        get_last_backup_at(&app)
    } else {
        None
    };

    let result =
        backup_database_internal(Some(app.clone()), &*state, path, since, use_compression).await?;

    // Update last backup time on success
    let _ = update_last_backup_at(&app, chrono::Local::now().naive_local());

    Ok(result)
}

fn get_last_backup_at(app: &tauri::AppHandle) -> Option<chrono::NaiveDateTime> {
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

fn update_last_backup_at(app: &tauri::AppHandle, ts: chrono::NaiveDateTime) -> MyceliumResult<()> {
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

#[command]
pub async fn get_backup_status(app: tauri::AppHandle) -> MyceliumResult<serde_json::Value> {
    let last_at = get_last_backup_at(&app);
    Ok(serde_json::json!({
        "last_backup_at": last_at.map(|ts| ts.format("%Y-%m-%dT%H:%M:%S").to_string()),
        "day_of_week": chrono::Local::now().weekday().to_string(),
        "is_friday": chrono::Local::now().weekday() == chrono::Weekday::Fri
    }))
}

async fn backup_database_internal(
    app: Option<tauri::AppHandle>,
    pool: &DbPool,
    path: String,
    since: Option<chrono::NaiveDateTime>,
    use_compression: bool,
) -> MyceliumResult<String> {
    println!("[Backup] Starting database backup to: {}", path);

    let emit_progress = |processed: i64, total: i64, message: &str| {
        if let Some(ref handle) = app {
            let progress = if total > 0 {
                ((processed as f64 / total as f64) * 100.0) as i32
            } else {
                0
            };
            let _ = handle.emit(
                "backup-progress",
                serde_json::json!({
                    "progress": progress,
                    "message": message,
                    "processed": processed,
                    "total": total
                }),
            );
        }
    };

    BACKUP_CANCELLED.store(false, Ordering::Relaxed);
    emit_progress(0, 1, "데이터 개수 확인 중...");

    // Count records actually needing backup
    let count_query = |table: &str| {
        if let Some(s) = since {
            format!(
                "SELECT COUNT(*) FROM {} WHERE updated_at > '{}'",
                table,
                s.format("%Y-%m-%d %H:%M:%S")
            )
        } else {
            format!("SELECT COUNT(*) FROM {}", table)
        }
    };

    let count_users: (i64,) = sqlx::query_as(&count_query("users"))
        .fetch_one(pool)
        .await?;
    let count_products: (i64,) = sqlx::query_as(&count_query("products"))
        .fetch_one(pool)
        .await?;
    let count_customers: (i64,) = sqlx::query_as(&count_query("customers"))
        .fetch_one(pool)
        .await?;
    let count_addresses: (i64,) = sqlx::query_as(&count_query("customer_addresses"))
        .fetch_one(pool)
        .await?;
    let count_sales: (i64,) = sqlx::query_as(&count_query("sales"))
        .fetch_one(pool)
        .await?;
    let count_events: (i64,) = sqlx::query_as(&count_query("event"))
        .fetch_one(pool)
        .await?;
    let count_schedules: (i64,) = sqlx::query_as(&count_query("schedules"))
        .fetch_one(pool)
        .await?;
    let count_company: (i64,) = sqlx::query_as(&count_query("company_info"))
        .fetch_one(pool)
        .await?;
    let count_expenses: (i64,) = sqlx::query_as(&count_query("expenses"))
        .fetch_one(pool)
        .await?;
    let count_purchases: (i64,) = sqlx::query_as(&count_query("purchases"))
        .fetch_one(pool)
        .await?;
    let count_consultations: (i64,) = sqlx::query_as(&count_query("consultations"))
        .fetch_one(pool)
        .await?;
    let count_claims: (i64,) = sqlx::query_as(&count_query("sales_claims"))
        .fetch_one(pool)
        .await?;
    let count_inventory: (i64,) = sqlx::query_as(&count_query("inventory_logs"))
        .fetch_one(pool)
        .await?;
    let count_ledger: (i64,) = sqlx::query_as(&count_query("customer_ledger"))
        .fetch_one(pool)
        .await?;
    let count_customer_logs: (i64,) = sqlx::query_as(&if let Some(s) = since {
        format!(
            "SELECT COUNT(*) FROM customer_logs WHERE changed_at > '{}'",
            s.format("%Y-%m-%d %H:%M:%S")
        )
    } else {
        "SELECT COUNT(*) FROM customer_logs".to_string()
    })
    .fetch_one(pool)
    .await?;
    let count_vendors: (i64,) = sqlx::query_as(&count_query("vendors"))
        .fetch_one(pool)
        .await?;
    let count_exp_programs: (i64,) = sqlx::query_as(&count_query("experience_programs"))
        .fetch_one(pool)
        .await?;
    let count_exp_reservations: (i64,) = sqlx::query_as(&count_query("experience_reservations"))
        .fetch_one(pool)
        .await?;
    let count_price_history: (i64,) = sqlx::query_as(&if let Some(s) = since {
        format!(
            "SELECT COUNT(*) FROM product_price_history WHERE changed_at > '{}'",
            s.format("%Y-%m-%d %H:%M:%S")
        )
    } else {
        "SELECT COUNT(*) FROM product_price_history".to_string()
    })
    .fetch_one(pool)
    .await?;
    let count_deletions: (i64,) = if let Some(s) = since {
        sqlx::query_as(&format!(
            "SELECT COUNT(*) FROM deletion_log WHERE deleted_at > '{}'",
            s.format("%Y-%m-%d %H:%M:%S")
        ))
        .fetch_one(pool)
        .await?
    } else {
        sqlx::query_as("SELECT COUNT(*) FROM deletion_log")
            .fetch_one(pool)
            .await?
    };

    let total_records = count_users.0
        + count_products.0
        + count_customers.0
        + count_addresses.0
        + count_sales.0
        + count_events.0
        + count_schedules.0
        + count_company.0
        + count_expenses.0
        + count_purchases.0
        + count_consultations.0
        + count_claims.0
        + count_inventory.0
        + count_ledger.0
        + count_customer_logs.0
        + count_vendors.0
        + count_exp_programs.0
        + count_exp_reservations.0
        + count_price_history.0
        + count_deletions.0;

    let mut processed = 0i64;

    let file = std::fs::File::create(&path)
        .map_err(|e| MyceliumError::Internal(format!("Failed to create file: {}", e)))?;

    let mut writer: BufWriter<Box<dyn std::io::Write + Send>> = if use_compression {
        let encoder = GzEncoder::new(file, Compression::fast());
        BufWriter::with_capacity(1024 * 1024, Box::new(encoder))
    } else {
        BufWriter::with_capacity(1024 * 1024, Box::new(file))
    };

    writeln!(writer, "{{").map_err(|e| MyceliumError::Internal(e.to_string()))?;
    writeln!(writer, "  \"version\": \"2.2\",")
        .map_err(|e| MyceliumError::Internal(e.to_string()))?;
    writeln!(writer, "  \"total_records\": {},", total_records)
        .map_err(|e| MyceliumError::Internal(e.to_string()))?;
    writeln!(
        writer,
        "  \"timestamp\": \"{}\",",
        chrono::Local::now().to_rfc3339()
    )
    .map_err(|e| MyceliumError::Internal(e.to_string()))?;
    writeln!(writer, "  \"is_incremental\": {},", since.is_some())
        .map_err(|e| MyceliumError::Internal(e.to_string()))?;
    if let Some(s) = since {
        writeln!(
            writer,
            "  \"since\": \"{}\",",
            s.format("%Y-%m-%dT%H:%M:%S")
        )
        .map_err(|e| MyceliumError::Internal(e.to_string()))?;
    } else {
        writeln!(writer, "  \"since\": null,")
            .map_err(|e| MyceliumError::Internal(e.to_string()))?;
    }

    macro_rules! batch_table_internal {
        ($table:expr, $type:ty, $query:expr, $field:expr, $msg:expr, $count:expr, $time_col:expr) => {{
            println!("[Backup] Start: Table {}", $table);
            emit_progress(processed, total_records, $msg);
            write!(writer, "  \"{}\": [\n", $field)
                .map_err(|e| MyceliumError::Internal(e.to_string()))?;
            let mut first_record = true;
            let base_query = if let Some(s) = since {
                format!(
                    "{} WHERE {} > '{}'",
                    $query,
                    $time_col,
                    s.format("%Y-%m-%d %H:%M:%S")
                )
            } else {
                $query.to_string()
            };
            let mut rows = sqlx::query_as::<_, $type>(&base_query).fetch(pool);
            while let Some(record) = rows.next().await {
                if BACKUP_CANCELLED.load(Ordering::Relaxed) {
                    println!("[Backup] CANCELLED during table {}", $table);
                    return Err(MyceliumError::Internal(
                        "사용자에 의해 백업이 중단되었습니다.".to_string(),
                    ));
                }
                let record = record.map_err(|e| {
                    MyceliumError::Internal(format!("Fetch from {} failed: {}", $table, e))
                })?;

                if !first_record {
                    write!(writer, ",\n").map_err(|e| MyceliumError::Internal(e.to_string()))?;
                }
                first_record = false;

                write!(writer, "    ").map_err(|e| MyceliumError::Internal(e.to_string()))?;
                serde_json::to_writer(&mut writer, &record)
                    .map_err(|e| MyceliumError::Internal(e.to_string()))?;
                processed += 1;

                if processed % 10000 == 0 {
                    emit_progress(
                        processed,
                        total_records,
                        &format!(
                            "{} ({}/{})",
                            $msg,
                            format_number(processed),
                            format_number(total_records)
                        ),
                    );
                }
            }
            emit_progress(processed, total_records, $msg);
            writeln!(writer, "\n  ],").map_err(|e| MyceliumError::Internal(e.to_string()))?;
            println!("[Backup] End: Table {} (Records: {})", $table, $count);
        }};
    }

    batch_table_internal!(
        "users",
        User,
        "SELECT * FROM users",
        "users",
        "사용자 정보 백업 중",
        count_users.0,
        "updated_at"
    );
    batch_table_internal!(
        "products",
        Product,
        "SELECT * FROM products",
        "products",
        "상품 정보 백업 중",
        count_products.0,
        "updated_at"
    );
    batch_table_internal!(
        "customers",
        Customer,
        "SELECT * FROM customers",
        "customers",
        "고객 정보 백업 중",
        count_customers.0,
        "updated_at"
    );
    batch_table_internal!(
        "customer_addresses",
        CustomerAddress,
        "SELECT * FROM customer_addresses",
        "customer_addresses",
        "배송지 정보 백업 중",
        count_addresses.0,
        "updated_at"
    );
    batch_table_internal!(
        "sales",
        Sales,
        "SELECT * FROM sales",
        "sales",
        "판매 내역 백업 중",
        count_sales.0,
        "updated_at"
    );
    batch_table_internal!(
        "event",
        Event,
        "SELECT * FROM event",
        "events",
        "행사 정보 백업 중",
        count_events.0,
        "updated_at"
    );
    batch_table_internal!(
        "schedules",
        Schedule,
        "SELECT * FROM schedules",
        "schedules",
        "일정 정보 백업 중",
        count_schedules.0,
        "updated_at"
    );
    batch_table_internal!(
        "company_info",
        CompanyInfo,
        "SELECT * FROM company_info",
        "company_info",
        "회사 정보 백업 중",
        count_company.0,
        "updated_at"
    );
    batch_table_internal!(
        "expenses",
        Expense,
        "SELECT * FROM expenses",
        "expenses",
        "지출 내역 백업 중",
        count_expenses.0,
        "updated_at"
    );
    batch_table_internal!(
        "purchases",
        PurchaseBackup,
        "SELECT * FROM purchases",
        "purchases",
        "구매 내역 백업 중",
        count_purchases.0,
        "updated_at"
    );
    batch_table_internal!(
        "consultations",
        Consultation,
        "SELECT * FROM consultations",
        "consultations",
        "상담 내역 백업 중",
        count_consultations.0,
        "updated_at"
    );
    batch_table_internal!(
        "sales_claims",
        SalesClaimBackup,
        "SELECT * FROM sales_claims",
        "sales_claims",
        "판매 클레임 백업 중",
        count_claims.0,
        "updated_at"
    );
    batch_table_internal!(
        "inventory_logs",
        InventoryLog,
        "SELECT * FROM inventory_logs",
        "inventory_logs",
        "재고 로그 백업 중",
        count_inventory.0,
        "created_at"
    );
    batch_table_internal!(
        "customer_ledger",
        CustomerLedger,
        "SELECT * FROM customer_ledger",
        "customer_ledger",
        "고객 원장 백업 중",
        count_ledger.0,
        "updated_at"
    );
    batch_table_internal!(
        "customer_logs",
        CustomerLog,
        "SELECT * FROM customer_logs",
        "customer_logs",
        "고객 변경 이력 백업 중",
        count_customer_logs.0,
        "changed_at"
    );
    batch_table_internal!(
        "vendors",
        Vendor,
        "SELECT * FROM vendors",
        "vendors",
        "거래처 정보 백업 중",
        count_vendors.0,
        "updated_at"
    );
    batch_table_internal!(
        "experience_programs",
        ExperienceProgram,
        "SELECT * FROM experience_programs",
        "experience_programs",
        "체험 프로그램 백업 중",
        count_exp_programs.0,
        "updated_at"
    );
    batch_table_internal!(
        "experience_reservations",
        ExperienceReservationBackup,
        "SELECT * FROM experience_reservations",
        "experience_reservations",
        "체험 예약 백업 중",
        count_exp_reservations.0,
        "updated_at"
    );

    batch_table_internal!(
        "product_price_history",
        ProductPriceHistory,
        "SELECT * FROM product_price_history",
        "product_price_history",
        "가격 변경 이력 백업 중",
        count_price_history.0,
        "changed_at"
    );

    // Deletion Logs - Always included to maintain audit trail
    batch_table_internal!(
        "deletion_log",
        DeletionLog,
        "SELECT log_id, table_name, record_id, deleted_info, deleted_by, deleted_at FROM deletion_log",
        "deletions",
        "삭제 이력 백업 중",
        count_deletions.0,
        "deleted_at"
    );

    writeln!(writer, "  \"backup_complete\": true")
        .map_err(|e| MyceliumError::Internal(e.to_string()))?;
    writeln!(writer, "}}").map_err(|e| MyceliumError::Internal(e.to_string()))?;

    // Flush the buffer and finish compression if needed
    let inner = writer
        .into_inner()
        .map_err(|e| MyceliumError::Internal(format!("Failed to flush buffer: {}", e)))?;

    drop(inner);

    emit_progress(total_records, total_records, "백업 완료!");
    let success_msg = format!(
        "백업이 완료되었습니다: {} ({} 레코드)",
        path,
        format_number(total_records)
    );
    println!("[Backup] {}", success_msg);
    Ok(success_msg)
}

#[command]
pub async fn restore_database(
    app: tauri::AppHandle,
    state: State<'_, DbPool>,
    path: String,
) -> MyceliumResult<String> {
    let pool = &*state;

    let emit_progress = |processed: i64, total: i64, message: &str| {
        let progress = if total > 0 {
            let p = ((processed as f64 / total as f64) * 100.0) as i32;
            p.clamp(0, 100)
        } else {
            0
        };
        let _ = app.emit(
            "restore-progress",
            serde_json::json!({
                "progress": progress,
                "message": message,
                "processed": processed,
                "total": if total > 0 { total } else { processed + 1000 }
            }),
        );
    };

    // 1. Detect Incremental / Full and Total Filesize
    let (is_incremental, total_bytes, is_gzipped) = {
        let mut magic = [0u8; 2];
        let mut f =
            std::fs::File::open(&path).map_err(|e| MyceliumError::Internal(e.to_string()))?;
        let is_gzipped_inner = f.read_exact(&mut magic).is_ok() && magic == [0x1f, 0x8b];
        let file_size = std::fs::File::open(&path)
            .map_err(|e| MyceliumError::Internal(e.to_string()))?
            .metadata()
            .map_err(|e| MyceliumError::Internal(e.to_string()))?
            .len();

        // Peek for incremental flag
        let reader: Box<dyn std::io::Read> = if is_gzipped_inner {
            Box::new(GzDecoder::new(
                std::fs::File::open(&path).map_err(|e| MyceliumError::Internal(e.to_string()))?,
            ))
        } else {
            Box::new(
                std::fs::File::open(&path).map_err(|e| MyceliumError::Internal(e.to_string()))?,
            )
        };
        let mut r = std::io::BufReader::new(reader);
        let mut header_buf = vec![0u8; 4096];
        let n = r.read(&mut header_buf).unwrap_or(0);
        let s = String::from_utf8_lossy(&header_buf[..n]);
        let inc = s.contains("\"is_incremental\": true");

        println!(
            "[Restore] Header analysis: is_incremental={}, total_file_size={}",
            inc, file_size
        );
        (inc, file_size, is_gzipped_inner)
    };

    let start_time = chrono::Local::now().timestamp_millis();

    let mut tx = pool.begin().await?;

    // Set short lock timeout and disable triggers for performance
    let _ = sqlx::query("SET lock_timeout = '30s'")
        .execute(&mut *tx)
        .await;
    // session_replication_role is set to LOCAL so it only affects this transaction
    let _ = sqlx::query("SET LOCAL session_replication_role = 'replica'")
        .execute(&mut *tx)
        .await;

    if !is_incremental {
        if BACKUP_CANCELLED.load(Ordering::Relaxed) {
            return Err(MyceliumError::Internal(
                "복구가 취소되었습니다.".to_string(),
            ));
        }

        // 1.1 Force disconnect other connections to acquire exclusive lock for TRUNCATE
        emit_progress(
            0,
            total_bytes as i64,
            "다른 연결 종료 중 (배타적 권한 획득)...",
        );
        let _ = sqlx::query(
            "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid()"
        )
        .execute(&mut *tx)
        .await;

        emit_progress(0, total_bytes as i64, "기존 데이터 삭제 중 (전체 복구)...");
        println!("[Restore] Truncating tables for full restore...");
        sqlx::query("TRUNCATE TABLE users, products, customers, customer_addresses, sales, event, schedules, company_info, expenses, purchases, consultations, sales_claims, inventory_logs, customer_ledger, customer_logs, vendors, experience_programs, experience_reservations, product_price_history, deletion_log RESTART IDENTITY CASCADE")
            .execute(&mut *tx)
            .await
            .map_err(|e| {
                println!("[Restore] Truncate failed: {}", e);
                MyceliumError::Internal(format!("데이터 삭제 실패: 다른 사용자가 데이터를 사용 중입니다. 모든 창을 닫고 다시 시도해 주세요. (에러: {})", e))
            })?;
    }

    // 2. Open Stream with Byte Counter
    struct CountingReader<R: Read> {
        inner: R,
        count: std::sync::Arc<std::sync::atomic::AtomicU64>,
    }
    impl<R: Read> Read for CountingReader<R> {
        fn read(&mut self, buf: &mut [u8]) -> std::io::Result<usize> {
            let result = self.inner.read(buf);
            if let Ok(n) = result {
                self.count.fetch_add(n as u64, Ordering::Relaxed);
            }
            result
        }
    }

    let byte_count = std::sync::Arc::new(std::sync::atomic::AtomicU64::new(0));
    let file = std::fs::File::open(&path).map_err(|e| MyceliumError::Internal(e.to_string()))?;

    let base_reader = CountingReader {
        inner: file,
        count: byte_count.clone(),
    };

    let reader: Box<dyn std::io::Read + Send> = if is_gzipped {
        Box::new(GzDecoder::new(base_reader))
    } else {
        Box::new(base_reader)
    };
    let mut reader = std::io::BufReader::with_capacity(2 * 1024 * 1024, reader);

    let mut processed = 0i64;

    macro_rules! restore_table {
        ($marker:expr, $type:ty, $msg:expr, $item:ident, $tx:ident, $logic:block) => {{
            if BACKUP_CANCELLED.load(Ordering::Relaxed) {
                return Err(MyceliumError::Internal("복구가 취소되었습니다.".to_string()));
            }

            let mut current_bytes = byte_count.load(Ordering::Relaxed);
            emit_progress(
                current_bytes as i64,
                total_bytes as i64,
                &format!("{} 찾는 중...", $msg),
            );

            let target1 = format!("\"{}\": [", $marker);
            let target2 = if $marker.ends_with('s') {
                format!("\"{}\": [", &$marker[..$marker.len() - 1])
            } else {
                format!("\"{}\"s: [", $marker)
            };

            let mut found = false;
            let mut line = String::new();
            let mut search_count = 0;

            // 1. Search for marker line
            while !found {
                search_count += 1;
                if search_count % 500 == 0 {
                    if BACKUP_CANCELLED.load(Ordering::Relaxed) {
                        return Err(MyceliumError::Internal("복구가 취소되었습니다.".to_string()));
                    }
                    current_bytes = byte_count.load(Ordering::Relaxed);
                    emit_progress(
                        current_bytes as i64,
                        total_bytes as i64,
                        &format!("{} 분석 중...", $msg),
                    );
                }
                line.clear();
                if reader.read_line(&mut line).unwrap_or(0) == 0 { break; }
                let trimmed_line = line.trim();
                // Check if line contains start marker
                if trimmed_line.contains(&target1) || trimmed_line.contains(&target2) {
                    found = true;
                    println!("[Restore] Table '{}' marker found.", $marker);
                }

                if found {
                    // Process if the first record is on the same line as the marker
                    if let Some(pos) = line.find('[') {
                        let after_marker = line[pos + 1..].trim();
                        if after_marker.starts_with('{') {
                            let clean = after_marker.trim_end_matches(',').trim_end_matches(']').trim();
                            if !clean.is_empty() {
                                if let Ok(u) = serde_json::from_str::<$type>(clean) {
                                    let $item = u;
                                    let $tx = &mut tx;
                                    $logic;
                                    processed += 1;
                                    // record_count is managed in the loop below, but we handle the first one here
                                }
                            }
                        }
                    }
                    break;
                }
                line.clear();
            }

            if found {
                let mut record_count = 0;
                // If we processed one inline, we should count it, but record_count is local to this block
                // Let's just make it simpler.
                loop {
                    line.clear();
                    if reader.read_line(&mut line).unwrap_or(0) == 0 { break; }
                    let trimmed = line.trim();
                    if trimmed.is_empty() || trimmed == "," || trimmed == "[" { continue; }

                    // Critical: if we find the end of the array ']', stop this table
                    if trimmed.starts_with(']') {
                        println!("[Restore] Table '{}' end found. (Records: {})", $marker, record_count);
                        break;
                    }

                    if BACKUP_CANCELLED.load(Ordering::Relaxed) {
                        return Err(MyceliumError::Internal("복구가 취소되었습니다.".to_string()));
                    }

                    // Clean the line for JSON parsing (remove trailing/leading commas)
                    let clean = trimmed.trim_start_matches(',').trim_end_matches(',');
                    if clean.is_empty() || clean == "{" || clean == "}" { continue; }

                    let item_res: Result<$type, _> = serde_json::from_str(clean);
                    let $item = match item_res {
                        Ok(v) => v,
                        Err(e) => {
                            // If it's just the end brace of the main object, it might be the end of file
                            if clean == "}" { break; }
                            println!("[Restore] JSON Error in {}: {}. Line: {}", $marker, e, clean);
                            return Err(MyceliumError::Internal(format!("데이터 분석 오류 ({}): {}", $marker, e)));
                        }
                    };

                    let $tx = &mut tx;
                    $logic;

                    record_count += 1;
                    processed += 1;
                    if record_count % 10000 == 0 {
                        current_bytes = byte_count.load(Ordering::Relaxed);
                        let _ = app.emit(
                            "restore-progress",
                            serde_json::json!({
                                "progress": ((current_bytes as f64 / total_bytes as f64) * 100.0).clamp(0.0, 100.0) as i32,
                                "message": format!("{} ({}건 복구 완료)", $msg, format_number(record_count)),
                                "processed": current_bytes,
                                "total": total_bytes,
                                "startTime": start_time
                            }),
                        );
                    }
                }
                println!("[Restore] Table '{}' restoration finished.", $marker);
            }
        }};
    }

    // USERS
    restore_table!("users", User, "사용자 정보 복구 중", u, t, {
        sqlx::query("INSERT INTO users (id, username, password_hash, role, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (username) DO UPDATE SET password_hash=EXCLUDED.password_hash, updated_at=EXCLUDED.updated_at")
            .bind(u.id).bind(u.username).bind(u.password_hash).bind(u.role).bind(u.created_at).bind(u.updated_at)
            .execute(&mut **t).await?;
    });

    // PRODUCTS
    restore_table!("products", Product, "상품 정보 복구 중", p, t, {
        sqlx::query("INSERT INTO products (product_id, product_name, specification, unit_price, stock_quantity, safety_stock, cost_price, material_id, material_ratio, item_type, product_code, status, updated_at) 
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) 
             ON CONFLICT (product_id) DO UPDATE SET product_name=EXCLUDED.product_name, status=EXCLUDED.status, updated_at=EXCLUDED.updated_at")
            .bind(p.product_id).bind(p.product_name).bind(p.specification).bind(p.unit_price).bind(p.stock_quantity).bind(p.safety_stock).bind(p.cost_price).bind(p.material_id).bind(p.material_ratio).bind(p.item_type).bind(p.product_code).bind(p.status).bind(p.updated_at)
            .execute(&mut **t).await?;
    });

    // CUSTOMERS
    restore_table!("customers", Customer, "고객 정보 복구 중", c, t, {
        sqlx::query("INSERT INTO customers (customer_id, customer_name, mobile_number, membership_level, phone_number, email, zip_code, address_primary, address_detail, anniversary_date, anniversary_type, marketing_consent, acquisition_channel, pref_product_type, pref_package_type, family_type, health_concern, sub_interest, purchase_cycle, memo, current_balance, join_date, status, created_at, updated_at) 
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25) 
             ON CONFLICT (customer_id) DO UPDATE SET customer_name=EXCLUDED.customer_name, status=EXCLUDED.status, updated_at=EXCLUDED.updated_at")
            .bind(c.customer_id).bind(c.customer_name).bind(c.mobile_number).bind(c.membership_level).bind(c.phone_number).bind(c.email).bind(c.zip_code).bind(c.address_primary).bind(c.address_detail).bind(c.anniversary_date).bind(c.anniversary_type).bind(c.marketing_consent).bind(c.acquisition_channel).bind(c.pref_product_type).bind(c.pref_package_type).bind(c.family_type).bind(c.health_concern).bind(c.sub_interest).bind(c.purchase_cycle).bind(c.memo).bind(c.current_balance).bind(c.join_date).bind(c.status).bind(c.created_at).bind(c.updated_at)
            .execute(&mut **t).await?;
    });

    // ADDRESSES
    restore_table!(
        "customer_addresses",
        CustomerAddress,
        "배송지 정보 복구 중",
        a,
        t,
        {
            sqlx::query("INSERT INTO customer_addresses (address_id, customer_id, address_alias, recipient_name, mobile_number, zip_code, address_primary, address_detail, is_default, shipping_memo, created_at, updated_at) 
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) 
             ON CONFLICT (address_id) DO UPDATE SET address_primary=EXCLUDED.address_primary, updated_at=EXCLUDED.updated_at")
            .bind(a.address_id).bind(a.customer_id).bind(a.address_alias).bind(a.recipient_name).bind(a.mobile_number).bind(a.zip_code).bind(a.address_primary).bind(a.address_detail).bind(a.is_default).bind(a.shipping_memo).bind(a.created_at).bind(a.updated_at)
            .execute(&mut **t).await?;
        }
    );

    // SALES
    restore_table!("sales", Sales, "판매 내역 복구 중", s, t, {
        sqlx::query("INSERT INTO sales (sales_id, customer_id, status, order_date, product_name, specification, unit_price, quantity, total_amount, discount_rate, courier_name, tracking_number, memo, shipping_name, shipping_zip_code, shipping_address_primary, shipping_address_detail, shipping_mobile_number, shipping_date, paid_amount, payment_status, updated_at, product_code, product_id) 
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24) 
             ON CONFLICT (sales_id) DO UPDATE SET status=EXCLUDED.status, updated_at=EXCLUDED.updated_at")
            .bind(&s.sales_id).bind(&s.customer_id).bind(&s.status).bind(s.order_date).bind(&s.product_name).bind(&s.specification).bind(s.unit_price).bind(s.quantity).bind(s.total_amount).bind(s.discount_rate).bind(&s.courier_name).bind(&s.tracking_number).bind(&s.memo).bind(&s.shipping_name).bind(&s.shipping_zip_code).bind(&s.shipping_address_primary).bind(&s.shipping_address_detail).bind(&s.shipping_mobile_number).bind(s.shipping_date).bind(s.paid_amount).bind(&s.payment_status).bind(s.updated_at).bind(&s.product_code).bind(s.product_id)
            .execute(&mut **t).await?;
    });

    // EVENTS
    restore_table!("events", Event, "행사 정보 복구 중", e, t, {
        sqlx::query("INSERT INTO event (event_id, event_name, organizer, manager_name, manager_contact, location_address, location_detail, start_date, end_date, memo, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT (event_id) DO UPDATE SET event_name=EXCLUDED.event_name, updated_at=EXCLUDED.updated_at")
            .bind(e.event_id).bind(e.event_name).bind(e.organizer).bind(e.manager_name).bind(e.manager_contact).bind(e.location_address).bind(e.location_detail).bind(e.start_date).bind(e.end_date).bind(e.memo).bind(e.created_at).bind(e.updated_at)
            .execute(&mut **t).await?;
    });

    // SCHEDULES
    restore_table!("schedules", Schedule, "일정 정보 복구 중", s, t, {
        sqlx::query("INSERT INTO schedules (schedule_id, title, description, start_time, end_time, status, created_at, updated_at, related_type, related_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (schedule_id) DO UPDATE SET title=EXCLUDED.title, updated_at=EXCLUDED.updated_at")
            .bind(s.schedule_id).bind(s.title).bind(s.description).bind(s.start_time).bind(s.end_time).bind(s.status).bind(s.created_at).bind(s.updated_at).bind(s.related_type).bind(s.related_id)
            .execute(&mut **t).await?;
    });

    // COMPANY_INFO
    restore_table!(
        "company_info",
        CompanyInfo,
        "회사 정보 복구 중",
        c,
        t,
        {
            sqlx::query("INSERT INTO company_info (id, company_name, representative_name, address, business_type, item, phone_number, mobile_number, business_reg_number, registration_date, memo, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) ON CONFLICT (id) DO UPDATE SET company_name=EXCLUDED.company_name, updated_at=EXCLUDED.updated_at")
            .bind(c.id).bind(c.company_name).bind(c.representative_name).bind(c.address).bind(c.business_type).bind(c.item).bind(c.phone_number).bind(c.mobile_number).bind(c.business_reg_number).bind(c.registration_date).bind(c.memo).bind(c.created_at).bind(c.updated_at)
            .execute(&mut **t).await?;
        }
    );

    // EXPENSES
    restore_table!("expenses", Expense, "지출 내역 복구 중", e, t, {
        sqlx::query("INSERT INTO expenses (expense_id, expense_date, category, memo, amount, payment_method, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (expense_id) DO UPDATE SET amount=EXCLUDED.amount, updated_at=EXCLUDED.updated_at")
            .bind(e.expense_id).bind(e.expense_date).bind(e.category).bind(e.memo).bind(e.amount).bind(e.payment_method).bind(e.created_at).bind(e.updated_at)
            .execute(&mut **t).await?;
    });

    // PURCHASES
    restore_table!(
        "purchases",
        PurchaseBackup,
        "구매 내역 복구 중",
        p,
        t,
        {
            sqlx::query("INSERT INTO purchases (purchase_id, purchase_date, vendor_id, item_name, specification, quantity, unit_price, total_amount, payment_status, memo, inventory_synced, material_item_id, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) ON CONFLICT (purchase_id) DO UPDATE SET total_amount=EXCLUDED.total_amount, updated_at=EXCLUDED.updated_at")
            .bind(p.purchase_id).bind(p.purchase_date).bind(p.vendor_id).bind(p.item_name).bind(p.specification).bind(p.quantity).bind(p.unit_price).bind(p.total_amount).bind(p.payment_status).bind(p.memo).bind(p.inventory_synced).bind(p.material_item_id).bind(p.created_at).bind(p.updated_at)
            .execute(&mut **t).await?;
        }
    );

    // CONSULTATIONS
    restore_table!(
        "consultations",
        Consultation,
        "상담 내역 복구 중",
        c,
        t,
        {
            sqlx::query("INSERT INTO consultations (consult_id, customer_id, guest_name, contact, channel, counselor_name, category, title, content, answer, status, priority, consult_date, follow_up_date, created_at, updated_at, sentiment) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) ON CONFLICT (consult_id) DO UPDATE SET status=EXCLUDED.status, updated_at=EXCLUDED.updated_at")
            .bind(c.consult_id).bind(c.customer_id).bind(c.guest_name).bind(c.contact).bind(c.channel).bind(c.counselor_name).bind(c.category).bind(c.title).bind(c.content).bind(c.answer).bind(c.status).bind(c.priority).bind(c.consult_date).bind(c.follow_up_date).bind(c.created_at).bind(c.updated_at).bind(c.sentiment)
            .execute(&mut **t).await?;
        }
    );

    // CLAIMS
    restore_table!(
        "sales_claims",
        SalesClaimBackup,
        "클레임 내역 복구 중",
        c,
        t,
        {
            sqlx::query("INSERT INTO sales_claims (claim_id, sales_id, customer_id, claim_type, claim_status, reason_category, quantity, refund_amount, is_inventory_recovered, memo, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT (claim_id) DO UPDATE SET claim_status=EXCLUDED.claim_status, updated_at=EXCLUDED.updated_at")
            .bind(c.claim_id).bind(c.sales_id).bind(c.customer_id).bind(c.claim_type).bind(c.claim_status).bind(c.reason_category).bind(c.quantity).bind(c.refund_amount).bind(c.is_inventory_recovered).bind(c.memo).bind(c.created_at).bind(c.updated_at)
            .execute(&mut **t).await?;
        }
    );

    // INVENTORY
    restore_table!(
        "inventory_logs",
        InventoryLog,
        "재고 로그 복구 중",
        l,
        t,
        {
            sqlx::query("INSERT INTO inventory_logs (log_id, product_id, product_name, specification, product_code, change_type, change_quantity, current_stock, reference_id, memo, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT (log_id) DO UPDATE SET current_stock=EXCLUDED.current_stock, updated_at=EXCLUDED.updated_at")
            .bind(l.log_id).bind(l.product_id).bind(l.product_name).bind(l.specification).bind(l.product_code).bind(l.change_type).bind(l.change_quantity).bind(l.current_stock).bind(l.reference_id).bind(l.memo).bind(l.created_at).bind(l.updated_at)
            .execute(&mut **t).await?;
        }
    );

    // LEDGER
    restore_table!(
        "customer_ledger",
        CustomerLedger,
        "고객 원장 복구 중",
        l,
        t,
        {
            sqlx::query("INSERT INTO customer_ledger (ledger_id, customer_id, transaction_date, transaction_type, amount, description, reference_id, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (ledger_id) DO UPDATE SET amount=EXCLUDED.amount, updated_at=EXCLUDED.updated_at")
            .bind(l.ledger_id).bind(l.customer_id).bind(l.transaction_date).bind(l.transaction_type).bind(l.amount).bind(l.description).bind(l.reference_id).bind(l.created_at).bind(l.updated_at)
            .execute(&mut **t).await?;
        }
    );

    // CUSTOMER LOGS
    restore_table!(
        "customer_logs",
        CustomerLog,
        "고객 변경 이력 복구 중",
        l,
        t,
        {
            sqlx::query("INSERT INTO customer_logs (log_id, customer_id, field_name, old_value, new_value, changed_at, changed_by) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (log_id) DO NOTHING")
            .bind(l.log_id).bind(l.customer_id).bind(l.field_name).bind(l.old_value).bind(l.new_value).bind(l.changed_at).bind(l.changed_by)
            .execute(&mut **t).await?;
        }
    );

    // VENDORS
    restore_table!("vendors", Vendor, "거래처 정보 복구 중", v, t, {
        sqlx::query("INSERT INTO vendors (vendor_id, vendor_name, business_number, representative, mobile_number, email, address, main_items, memo, is_active, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT (vendor_id) DO UPDATE SET vendor_name=EXCLUDED.vendor_name, updated_at=EXCLUDED.updated_at")
            .bind(v.vendor_id).bind(v.vendor_name).bind(v.business_number).bind(v.representative).bind(v.mobile_number).bind(v.email).bind(v.address).bind(v.main_items).bind(v.memo).bind(v.is_active).bind(v.created_at).bind(v.updated_at)
            .execute(&mut **t).await?;
    });

    // EXPERIENCE PROGRAMS
    restore_table!(
        "experience_programs",
        ExperienceProgram,
        "체험 프로그램 복구 중",
        p,
        t,
        {
            sqlx::query("INSERT INTO experience_programs (program_id, program_name, description, duration_min, max_capacity, price_per_person, is_active, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (program_id) DO UPDATE SET program_name=EXCLUDED.program_name, updated_at=EXCLUDED.updated_at")
            .bind(p.program_id).bind(p.program_name).bind(p.description).bind(p.duration_min).bind(p.max_capacity).bind(p.price_per_person).bind(p.is_active).bind(p.created_at).bind(p.updated_at)
            .execute(&mut **t).await?;
        }
    );

    // EXPERIENCE RESERVATIONS
    restore_table!(
        "experience_reservations",
        ExperienceReservationBackup,
        "체험 예약 복구 중",
        r,
        t,
        {
            sqlx::query("INSERT INTO experience_reservations (reservation_id, program_id, customer_id, guest_name, guest_contact, reservation_date, reservation_time, participant_count, total_amount, status, payment_status, memo, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) ON CONFLICT (reservation_id) DO UPDATE SET status=EXCLUDED.status, updated_at=EXCLUDED.updated_at")
            .bind(r.reservation_id).bind(r.program_id).bind(r.customer_id).bind(r.guest_name).bind(r.guest_contact).bind(r.reservation_date).bind(r.reservation_time).bind(r.participant_count).bind(r.total_amount).bind(r.status).bind(r.payment_status).bind(r.memo).bind(r.created_at).bind(r.updated_at)
            .execute(&mut **t).await?;
        }
    );

    // PRODUCT PRICE HISTORY
    restore_table!(
        "product_price_history",
        ProductPriceHistory,
        "가격 변경 이력 복구 중",
        h,
        t,
        {
            sqlx::query("INSERT INTO product_price_history (history_id, product_id, old_price, new_price, reason, changed_at) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (history_id) DO NOTHING")
            .bind(h.history_id).bind(h.product_id).bind(h.old_price).bind(h.new_price).bind(h.reason).bind(h.changed_at)
            .execute(&mut **t).await?;
        }
    );

    // DELETIONS
    restore_table!("deletions", DeletionLog, "삭제 이력 반영 중", d, t, {
        // 1. Restore the log entry itself (Audit Trail)
        sqlx::query("INSERT INTO deletion_log (log_id, table_name, record_id, deleted_info, deleted_by, deleted_at) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (log_id) DO NOTHING")
            .bind(d.log_id).bind(d.table_name.clone()).bind(d.record_id.clone()).bind(d.deleted_info).bind(d.deleted_by).bind(d.deleted_at)
            .execute(&mut **t).await?;

        // 2. Perform actual deletion if incremental (In full restore, records are already correct)
        if is_incremental {
            let id_col = match d.table_name.as_str() {
                "sales" => "sales_id",
                "products" => "product_id",
                "customers" => "customer_id",
                _ => "id",
            };
            sqlx::query(&format!(
                "DELETE FROM {} WHERE {} = $1",
                d.table_name, id_col
            ))
            .bind(d.record_id)
            .execute(&mut **t)
            .await
            .ok();
        }
    });

    // Final Stage: Commit and Indexing
    println!("[Restore] All tables processed. Committing transaction and updating indexes...");
    emit_progress(
        total_bytes as i64,
        total_bytes as i64,
        "데이터 최종 승인 및 색인(Index) 최적화 중... (거의 다 되었습니다!)",
    );

    tx.commit().await?;

    // 4. Run ANALYZE to update statistics for the query planner after bulk insert
    println!("[Restore] Running ANALYZE for query optimization...");
    let _ = sqlx::query("ANALYZE").execute(pool).await;

    // 5. Safety Check: Ensure at least one admin user exists
    let admin_username = std::env::var("ADMIN_USER").unwrap_or_else(|_| "admin".to_string());
    let admin_exists: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM users WHERE username = $1")
        .bind(&admin_username)
        .fetch_one(pool)
        .await
        .unwrap_or((0,));

    if admin_exists.0 == 0 {
        println!(
            "[Restore] Admin user '{}' missing. Seeding default...",
            admin_username
        );
        let admin_password = std::env::var("ADMIN_PASS").unwrap_or_else(|_| "admin".to_string());
        if let Ok(password_hash) = bcrypt::hash(&admin_password, bcrypt::DEFAULT_COST) {
            // We use a query that doesn't rely on a specific ID to avoid conflicts, or handle conflict
            let _ = sqlx::query("INSERT INTO users (username, password_hash, role) VALUES ($1, $2, $3) ON CONFLICT (username) DO NOTHING")
                .bind(&admin_username)
                .bind(password_hash)
                .bind("admin")
                .execute(pool)
                .await;
        }
    }

    let (company_count,): (i64,) = sqlx::query_as("SELECT COUNT(*) FROM company_info")
        .fetch_one(pool)
        .await
        .unwrap_or((0,));
    if company_count == 0 {
        println!("[Restore] Seeding default company info...");
        let _ = sqlx::query("INSERT INTO company_info (company_name) VALUES ($1)")
            .bind("(주)대관령송암버섯")
            .execute(pool)
            .await;
    }

    Ok(format!(
        "성공적으로 {}건의 데이터를 복구했습니다.",
        processed
    ))
}

#[command]
pub async fn reset_database(state: State<'_, DbPool>) -> MyceliumResult<String> {
    // 1. Truncate ALL tables including users and company_info
    // Added users and company_info to the list as per user request
    let sql = "TRUNCATE TABLE 
        sales, customers, event, products, 
        schedules, inventory_logs, consultations, 
        sales_claims, customer_ledger, customer_addresses,
        experience_programs, experience_reservations, 
        vendors, purchases, expenses, deletion_log,
        product_price_history, customer_logs,
        users, company_info
        RESTART IDENTITY CASCADE";

    sqlx::query(sql).execute(&*state).await?;

    // 2. Re-create default Admin user (admin / admin)
    // The user explicitly requested: "id: admin, pw: admin만 남기로"
    let password_hash = bcrypt::hash("admin", bcrypt::DEFAULT_COST)
        .map_err(|e| MyceliumError::Internal(e.to_string()))?;

    sqlx::query("INSERT INTO users (username, password_hash, role) VALUES ($1, $2, $3)")
        .bind("admin")
        .bind(password_hash)
        .bind("admin")
        .execute(&*state)
        .await?;

    Ok("데이터 초기화가 완료되었습니다.\n모든 데이터가 삭제되고 초기 관리자(admin) 계정만 생성되었습니다.".to_string())
}

#[command]
pub async fn cleanup_old_logs(state: State<'_, DbPool>, months: i32) -> MyceliumResult<u64> {
    let mut tx = state.begin().await?;

    // 1. Delete old customer logs
    let res1 = sqlx::query(
        "DELETE FROM customer_logs WHERE changed_at < NOW() - ($1 || ' month')::interval",
    )
    .bind(months)
    .execute(&mut *tx)
    .await?;

    // 2. Delete old inventory logs
    let res2 = sqlx::query(
        "DELETE FROM inventory_logs WHERE created_at < NOW() - ($1 || ' month')::interval",
    )
    .bind(months)
    .execute(&mut *tx)
    .await?;

    let total = res1.rows_affected() + res2.rows_affected();
    tx.commit().await?;

    Ok(total)
}

#[command]
pub async fn run_db_maintenance(state: State<'_, DbPool>) -> MyceliumResult<String> {
    // 1. Run Log Cleanup (Default 12 months for safety)
    let _ =
        sqlx::query("DELETE FROM customer_logs WHERE changed_at < NOW() - INTERVAL '12 months'")
            .execute(&*state)
            .await;

    let _ =
        sqlx::query("DELETE FROM inventory_logs WHERE created_at < NOW() - INTERVAL '12 months'")
            .execute(&*state)
            .await;

    // 2. Postgres optimization: VACUUM (ANALYZE)
    sqlx::query("VACUUM ANALYZE").execute(&*state).await?;

    Ok("DB 최적화가 완료되었습니다.\n(1년 이상 된 로그 정리 및 인덱스 재구성)".to_string())
}

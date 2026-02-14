use crate::commands::backup::logic::{backup_database, backup_database_internal};
use crate::commands::backup::models::AutoBackupItem;
use crate::commands::backup::status::{get_last_backup_at, update_last_backup_at};
use crate::db::DbPool;
use crate::error::{MyceliumError, MyceliumResult};
use crate::{BACKUP_CANCELLED, DB_MODIFIED, IS_EXITING};
use chrono::Datelike;
use std::sync::atomic::Ordering;
use crate::stubs::{command, AppHandle, Manager, State, check_admin};


pub async fn cancel_backup_restore() {
    BACKUP_CANCELLED.store(true, Ordering::Relaxed);
    println!("[System] Cancellation requested by user.");
}


pub async fn confirm_exit(app: crate::stubs::AppHandle, skip_auto_backup: bool) -> MyceliumResult<()> {
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


pub async fn trigger_auto_backup(
    app: crate::stubs::AppHandle,
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
            &state,
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
                                                &state,
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

pub fn format_and_push(
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


pub async fn get_auto_backups(app: crate::stubs::AppHandle) -> MyceliumResult<Vec<AutoBackupItem>> {
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


pub async fn run_daily_custom_backup(
    app: AppHandle,
    state: State<'_, DbPool>,
    is_incremental: bool,
    use_compression: bool,
) -> MyceliumResult<String> {
    check_admin(&app)?;
    run_backup_logic(app, state, is_incremental, use_compression, true).await
}


pub async fn check_daily_backup(
    app: crate::stubs::AppHandle,
    state: State<'_, DbPool>,
) -> MyceliumResult<String> {
    run_backup_logic(app, state, true, true, false).await
}

async fn run_backup_logic(
    app: crate::stubs::AppHandle,
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
                &state,
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


pub async fn delete_backup(app: AppHandle, path: String) -> MyceliumResult<()> {
    check_admin(&app)?;
    std::fs::remove_file(path)
        .map_err(|e| MyceliumError::Internal(format!("Failed to delete backup file: {}", e)))?;
    Ok(())
}

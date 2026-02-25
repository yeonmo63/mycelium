use crate::commands;
use crate::state::AppState;
use axum::{
    routing::{get, post},
    Router,
};

pub fn router() -> Router<AppState> {
    Router::new()
        .route(
            "/api/backup/auto",
            get(commands::backup::web::get_auto_backups_axum),
        )
        .route(
            "/api/backup/run",
            post(commands::backup::web::run_daily_custom_backup_axum),
        )
        .route(
            "/api/backup/restore",
            post(commands::backup::web::restore_database_axum),
        )
        .route(
            "/api/backup/maintenance",
            post(commands::backup::web::run_db_maintenance_axum),
        )
        .route(
            "/api/backup/cleanup",
            post(commands::backup::web::cleanup_old_logs_axum),
        )
        .route(
            "/api/backup/path/internal",
            get(commands::backup::web::get_internal_backup_path_axum),
        )
        .route(
            "/api/backup/path/external",
            get(commands::backup::web::get_external_backup_path_axum)
                .post(commands::backup::web::save_external_backup_path_axum),
        )
        .route(
            "/api/backup/status",
            get(commands::backup::web::get_backup_status_axum),
        )
        .route(
            "/api/backup/cancel",
            post(commands::backup::web::cancel_backup_restore_axum),
        )
        .route(
            "/api/backup/progress",
            get(commands::backup::web::get_live_progress_axum),
        )
        .route(
            "/api/backup/cleanup-files",
            post(commands::backup::web::cleanup_old_backups_axum),
        )
}

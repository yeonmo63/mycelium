#![allow(unused_imports, dead_code, unused_variables, non_snake_case)]
use axum::{
    routing::{get, post},
    Router,
};
use std::net::SocketAddr;
use tower_http::cors::{Any, CorsLayer};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};
use dotenvy::dotenv;
use std::env;

mod db;
mod error;
mod commands;
mod state;
mod stubs;
#[macro_use]
mod stubs_macros;

use state::{AppState, SessionState, SetupStatus};
use std::sync::{Arc, Mutex, atomic::AtomicBool};

pub static DB_MODIFIED: AtomicBool = AtomicBool::new(false);
pub static IS_EXITING: AtomicBool = AtomicBool::new(false);
pub static BACKUP_CANCELLED: AtomicBool = AtomicBool::new(false);

#[tokio::main]
async fn main() {
    dotenv().ok();
    
    // Initialize tracing
    tracing_subscriber::registry()
        .with(tracing_subscriber::EnvFilter::new(
            env::var("RUST_LOG").unwrap_or_else(|_| "info".into()),
        ))
        .with(tracing_subscriber::fmt::layer())
        .init();

    tracing::info!("Starting Celium Backend...");

    // Initialize Database
    let database_url = env::var("DATABASE_URL").unwrap_or_else(|_| {
        tracing::warn!("DATABASE_URL not found in env, using default local postgres");
        "postgresql://postgres:ryu134^11@@localhost:5432/mycelium".to_string()
    });

    let pool = match db::init_pool(&database_url).await {
        Ok(pool) => {
            tracing::info!("Database connection established");
            if let Err(e) = db::init_database(&pool).await {
                tracing::error!("Failed to run migrations: {}", e);
            }
            pool
        }
        Err(e) => {
            tracing::error!("Failed to connect to database: {}", e);
            return;
        }
    };

    // Initialize Global App State
    let app_state = AppState {
        pool: pool.clone(),
        setup_status: Arc::new(Mutex::new(SetupStatus::Configured)),
        session: Arc::new(Mutex::new(SessionState::default())),
    };

    // Build our application with routes
    let app = Router::new()
        .route("/", get(root))
        // Utility Routes
        .route("/api/utility/greet/:name", get(commands::utility::greet))
        .route("/api/utility/debug_db_schema", post(commands::utility::debug_db_schema))
        // Auth & Config Routes
        .route("/api/auth/status", get(commands::config::check_setup_status))
        .route("/api/auth/login", post(commands::config::login))
        .route("/api/auth/logout", post(commands::config::logout))
        .route("/api/auth/check", get(commands::config::check_auth_status))
        .route("/api/auth/users", get(commands::config::get_all_users))
        .route("/api/auth/users/create", post(commands::config::create_user))
        .route("/api/auth/users/update", post(commands::config::update_user))
        .route("/api/auth/users/delete", post(commands::config::delete_user))
        .route("/api/auth/verify-admin", post(commands::config::verify_admin_password))
        .route("/api/auth/company", get(commands::config::get_company_info))
        .route("/api/auth/company/save", post(commands::config::save_company_info))
        // Dashboard Routes
        .route("/api/dashboard/stats", get(commands::dashboard::get_dashboard_stats))
        .route("/api/dashboard/priority-stats", get(commands::dashboard::get_dashboard_priority_stats))
        .route("/api/dashboard/secondary-stats", get(commands::dashboard::get_dashboard_secondary_stats))
        .route("/api/dashboard/recent-sales", get(commands::dashboard::get_recent_sales))
        .route("/api/dashboard/weekly-sales", get(commands::dashboard::get_weekly_sales_data))
        .route("/api/dashboard/report", post(commands::dashboard::get_business_report_data))
        .route("/api/dashboard/ten-year-stats", get(commands::dashboard::get_ten_year_sales_stats))
        .route("/api/dashboard/cohort-stats", post(commands::dashboard::get_monthly_sales_by_cohort))
        .route("/api/dashboard/daily-stats", post(commands::dashboard::get_daily_sales_stats_by_month))
        .route("/api/dashboard/top-profitable", get(commands::dashboard::get_top_profit_products))
        .route("/api/dashboard/top-qty", get(commands::dashboard::get_top3_products_by_qty))
        .route("/api/dashboard/schedule-stats", get(commands::dashboard::get_dashboard_schedule_stats))
        // Product & Preset Routes
        .route("/api/product/list", get(commands::product::get_product_list_axum))
        .route("/api/product/create", post(commands::product::create_product_axum))
        .route("/api/product/update", post(commands::product::update_product_axum))
        .route("/api/product/delete", post(commands::product::delete_product_axum))
        .route("/api/product/discontinue", post(commands::product::discontinue_product_axum))
        .route("/api/product/history", get(commands::product::get_product_history_axum))
        .route("/api/product/bom", get(commands::product::get_product_bom_axum))
        .route("/api/product/bom/save", post(commands::product::save_product_bom_axum))
        // Experience Routes
        .route("/api/experience/programs", get(commands::experience::get_experience_programs_axum))
        .route("/api/experience/programs/create", post(commands::experience::create_experience_program_axum))
        .route("/api/experience/programs/update", post(commands::experience::update_experience_program_axum))
        .route("/api/experience/programs/delete", post(commands::experience::delete_experience_program_axum))
        // Settings & Integrations
        .route("/api/settings/integrations", get(commands::config::get_all_integrations_config_axum))
        .route("/api/settings/integrations/gemini", post(commands::config::save_gemini_api_key_axum))
        .route("/api/settings/integrations/sms", post(commands::config::save_sms_config_axum))
        .route("/api/settings/integrations/naver", post(commands::config::save_naver_keys_axum))
        .route("/api/settings/integrations/mall", post(commands::config::save_mall_keys_axum))
        .route("/api/settings/integrations/courier", post(commands::config::save_courier_config_axum))
        .route("/api/settings/integrations/tax", post(commands::config::save_tax_filing_config_axum))
        // Message Templates
        .route("/api/settings/templates", get(commands::config::get_message_templates_axum))
        .route("/api/settings/templates/save", post(commands::config::save_message_templates_axum))
        .route("/api/settings/templates/reset", post(commands::config::reset_message_templates_axum))
        // Backup & Restore
        .route("/api/backup/auto", get(commands::backup::web::get_auto_backups_axum))
        .route("/api/backup/run", post(commands::backup::web::run_daily_custom_backup_axum))
        .route("/api/backup/restore", post(commands::backup::web::restore_database_axum))
        .route("/api/backup/maintenance", post(commands::backup::web::run_db_maintenance_axum))
        .route("/api/backup/cleanup", post(commands::backup::web::cleanup_old_logs_axum))
        .route("/api/backup/path/internal", get(commands::backup::web::get_internal_backup_path_axum))
        .route("/api/backup/path/external", get(commands::backup::web::get_external_backup_path_axum).post(commands::backup::web::save_external_backup_path_axum))
        .route("/api/backup/status", get(commands::backup::web::get_backup_status_axum))
        .route("/api/backup/cancel", post(commands::backup::web::cancel_backup_restore_axum))
        // Presets & Reset
        .route("/api/preset/list", get(commands::preset::get_custom_presets_axum))
        .route("/api/preset/apply", post(commands::preset::apply_preset_axum))
        .route("/api/preset/save", post(commands::preset::save_current_as_preset_axum))
        .route("/api/preset/delete", post(commands::preset::delete_custom_preset_axum))
        .route("/api/preset/data", get(commands::preset::get_preset_data_axum))
        .route("/api/preset/reset", post(commands::backup::maintenance::reset_database_axum))
        // Mobile Config
        .route("/api/mobile/config", get(commands::config::get_mobile_config_axum))
        .route("/api/mobile/config/save", post(commands::config::save_mobile_config_axum))
        .route("/api/mobile/local-ip", get(commands::config::get_local_ip_axum))
        // Production
        .route("/api/production/spaces", get(commands::production::space::get_production_spaces_axum))
        // IoT
        .route("/api/iot/sensors", get(commands::iot::get_sensors_axum))
        .route("/api/iot/sensors/save", post(commands::iot::save_sensor_axum))
        .route("/api/iot/sensors/delete", post(commands::iot::delete_sensor_axum))
        .layer(
            CorsLayer::new()
                .allow_origin(Any)
                .allow_methods(Any)
                .allow_headers(Any),
        )
        .with_state(app_state);

    // Run it
    let port = env::var("PORT").unwrap_or_else(|_| "3000".to_string());
    let addr_str = format!("0.0.0.0:{}", port);
    let addr = addr_str.parse::<SocketAddr>().expect("Invalid address");
    
    tracing::info!("listening on {}", addr);
    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

async fn root() -> &'static str {
    "Hello, Celium is running!"
}

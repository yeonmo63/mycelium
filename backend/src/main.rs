#![allow(unused_imports, dead_code, unused_variables, non_snake_case)]
use axum::http::{header, StatusCode, Uri};
use axum::response::IntoResponse;
use axum::{
    routing::{get, post},
    Router,
};
use dotenvy::dotenv;
use rust_embed::RustEmbed;
use std::env;
use std::net::SocketAddr;
use tower_http::cors::{Any, CorsLayer};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

mod commands;
mod db;
mod error;
mod state;
mod stubs;
#[macro_use]
mod stubs_macros;
mod bridge;
mod embedded_db;

use state::{AppState, SessionState, SetupStatus};
use std::sync::{atomic::AtomicBool, Arc, Mutex};

pub static DB_MODIFIED: AtomicBool = AtomicBool::new(false);
pub static IS_EXITING: AtomicBool = AtomicBool::new(false);
pub static BACKUP_CANCELLED: AtomicBool = AtomicBool::new(false);

#[tokio::main]
async fn main() {
    dotenv().ok();

    // Initialize tracing
    tracing_subscriber::registry()
        .with(tracing_subscriber::EnvFilter::new(
            env::var("RUST_LOG")
                .unwrap_or_else(|_| "info,sqlx=warn,sqlx::postgres::notice=warn".into()),
        ))
        .with(tracing_subscriber::fmt::layer())
        .init();

    tracing::info!("Starting Celium Backend...");

    // Initialize Database
    // Initialize Database (Lazy connect)
    // We try to connect. If it fails (e.g. wrong port/credentials), we still start the server
    // but in "NotConfigured" mode so the user can see the Setup Wizard.
    let database_url = env::var("DATABASE_URL").unwrap_or_else(|_| {
        tracing::warn!("DATABASE_URL not found in env, using default local postgres");
        "postgresql://postgres:ryu134^11@@localhost:5432/mycelium".to_string()
    });

    let pool = match db::init_pool(&database_url).await {
        Ok(pool) => pool,
        Err(e) => {
            // This should rarely happen with lazy connect unless URL syntax is invalid
            tracing::error!("Failed to create pool: {}", e);
            return;
        }
    };

    // Check connection validity
    let setup_status = if let Ok(_) = pool.acquire().await {
        tracing::info!("Database connection established");
        if let Err(e) = db::init_database(&pool).await {
            tracing::error!("Failed to run migrations: {}", e);
            // Non-critical migration failure? Or maybe just warn?
            // If migrations fail, we might want to let user re-setup or check logs.
        }
        SetupStatus::Configured
    } else {
        tracing::warn!("Failed to connect to database. Starting in Setup Mode.");
        SetupStatus::NotConfigured
    };

    // Initialize Global App State
    let app_state = AppState {
        pool: pool.clone(),
        setup_status: Arc::new(Mutex::new(setup_status)),
        session: Arc::new(Mutex::new(SessionState::default())),
    };

    // Build bridge router (for sales, customers, shipments, etc.)
    let config_dir = env::var("APPDATA")
        .map(|p| std::path::PathBuf::from(p).join("com.mycelium"))
        .unwrap_or_else(|_| std::path::PathBuf::from("."));
    let bridge_router = bridge::create_mobile_router(pool.clone(), config_dir);

    // Build our application with routes
    let app = Router::new()
        // .route("/", get(root)) // 이 줄을 주석 처리하거나 삭제합니다.
        // Utility Routes
        .route("/api/utility/greet/:name", get(commands::utility::greet))
        .route(
            "/api/utility/debug_db_schema",
            post(commands::utility::debug_db_schema),
        )
        // Auth & Config Routes
        .route(
            "/api/auth/status",
            get(commands::config::check_setup_status),
        )
        .route("/api/setup/system", post(commands::config::setup_system))
        .route("/api/auth/login", post(commands::config::login))
        .route("/api/auth/logout", post(commands::config::logout))
        .route("/api/auth/check", get(commands::config::check_auth_status))
        .route("/api/auth/users", get(commands::config::get_all_users))
        .route(
            "/api/auth/users/create",
            post(commands::config::create_user),
        )
        .route(
            "/api/auth/users/update",
            post(commands::config::update_user),
        )
        .route(
            "/api/auth/users/delete",
            post(commands::config::delete_user),
        )
        .route(
            "/api/auth/verify-admin",
            post(commands::config::verify_admin_password),
        )
        .route("/api/auth/company", get(commands::config::get_company_info))
        .route(
            "/api/auth/company/save",
            post(commands::config::save_company_info),
        )
        // Dashboard Routes
        .route(
            "/api/dashboard/stats",
            get(commands::dashboard::get_dashboard_stats),
        )
        .route(
            "/api/dashboard/priority-stats",
            get(commands::dashboard::get_dashboard_priority_stats),
        )
        .route(
            "/api/dashboard/secondary-stats",
            get(commands::dashboard::get_dashboard_secondary_stats),
        )
        .route(
            "/api/dashboard/recent-sales",
            get(commands::dashboard::get_recent_sales),
        )
        .route(
            "/api/dashboard/weekly-sales",
            get(commands::dashboard::get_weekly_sales_data),
        )
        .route(
            "/api/dashboard/report",
            post(commands::dashboard::get_business_report_data),
        )
        .route(
            "/api/dashboard/ten-year-stats",
            get(commands::dashboard::get_ten_year_sales_stats),
        )
        .route(
            "/api/dashboard/cohort-stats",
            post(commands::dashboard::get_monthly_sales_by_cohort),
        )
        .route(
            "/api/dashboard/daily-stats",
            post(commands::dashboard::get_daily_sales_stats_by_month),
        )
        .route(
            "/api/dashboard/top-profitable",
            get(commands::dashboard::get_top_profit_products),
        )
        .route(
            "/api/dashboard/top-qty",
            get(commands::dashboard::get_top3_products_by_qty),
        )
        .route(
            "/api/dashboard/schedule-stats",
            get(commands::dashboard::get_dashboard_schedule_stats),
        )
        // Manual Sales
        .route(
            "/api/sales/create",
            post(commands::sales::order::create_sale_axum),
        )
        .route(
            "/api/sales/daily",
            get(commands::sales::query::get_daily_receipts_axum),
        )
        .route(
            "/api/sales/search-all",
            get(commands::sales::query::search_sales_by_any_axum),
        )
        // Product & Preset Routes
        .route(
            "/api/product/list",
            get(commands::product::get_product_list_axum),
        )
        .route(
            "/api/product/create",
            post(commands::product::create_product_axum),
        )
        .route(
            "/api/product/update",
            post(commands::product::update_product_axum),
        )
        .route(
            "/api/product/delete",
            post(commands::product::delete_product_axum),
        )
        .route(
            "/api/product/discontinue",
            post(commands::product::discontinue_product_axum),
        )
        .route(
            "/api/product/history",
            get(commands::product::get_product_history_axum),
        )
        .route(
            "/api/product/bom",
            get(commands::product::get_product_bom_axum),
        )
        .route(
            "/api/product/bom/save",
            post(commands::product::save_product_bom_axum),
        )
        .route(
            "/api/product/freshness",
            get(commands::product::get_product_freshness_axum),
        )
        .route(
            "/api/product/logs",
            get(commands::product::get_inventory_logs_axum),
        )
        .route(
            "/api/product/stock/adjust",
            post(commands::product::adjust_product_stock_axum),
        )
        .route(
            "/api/product/stock/convert",
            post(commands::product::batch_convert_stock_axum),
        )
        // Experience Routes
        .route(
            "/api/experience/programs",
            get(commands::experience::get_experience_programs_axum),
        )
        .route(
            "/api/experience/programs/create",
            post(commands::experience::create_experience_program_axum),
        )
        .route(
            "/api/experience/programs/update",
            post(commands::experience::update_experience_program_axum),
        )
        .route(
            "/api/experience/programs/delete",
            post(commands::experience::delete_experience_program_axum),
        )
        // Event Routes
        .route("/api/event/list", get(commands::event::get_all_events_axum))
        .route(
            "/api/event/create",
            post(commands::event::create_event_axum),
        )
        .route(
            "/api/event/update",
            post(commands::event::update_event_axum),
        )
        .route(
            "/api/event/delete",
            post(commands::event::delete_event_axum),
        )
        // Customer Routes
        .route(
            "/api/customer/search/name",
            get(commands::customer::search_customers_by_name_axum),
        )
        .route(
            "/api/customer/search/mobile",
            get(commands::customer::search_customers_by_mobile_axum),
        )
        .route(
            "/api/customer/create",
            post(commands::customer::create_customer_axum),
        )
        .route(
            "/api/customer/update",
            post(commands::customer::update_customer_axum),
        )
        .route(
            "/api/customer/get",
            get(commands::customer::get_customer_axum),
        )
        .route(
            "/api/customer/addresses",
            get(commands::customer::get_customer_addresses_axum),
        )
        .route(
            "/api/customer/logs",
            get(commands::customer::get_customer_logs_axum),
        )
        .route(
            "/api/customer/delete",
            post(commands::customer::delete_customer_axum),
        )
        .route(
            "/api/customer/reactivate",
            post(commands::customer::reactivate_customer_axum),
        )
        .route(
            "/api/customer/address/create",
            post(commands::customer::create_customer_address_axum),
        )
        .route(
            "/api/customer/address/update",
            post(commands::customer::update_customer_address_axum),
        )
        .route(
            "/api/customer/address/delete",
            post(commands::customer::delete_customer_address_axum),
        )
        .route(
            "/api/customer/address/set-default",
            post(commands::customer::set_default_customer_address_axum),
        )
        .route(
            "/api/customer/sales",
            get(commands::customer::get_sales_by_customer_id_axum),
        )
        .route(
            "/api/customer/ai-insight",
            get(commands::customer::get_customer_ai_insight_axum),
        )
        // Customer Batch Operations
        .route(
            "/api/customer/batch/search",
            get(commands::customer::search_customers_by_date_axum),
        )
        .route(
            "/api/customer/batch/dormant",
            get(commands::customer::search_dormant_customers_axum),
        )
        .route(
            "/api/customer/batch/delete",
            post(commands::customer::delete_customers_batch_axum),
        )
        .route(
            "/api/customer/batch/reactivate",
            post(commands::customer::reactivate_customers_batch_axum),
        )
        .route(
            "/api/customer/best",
            get(commands::customer::search_best_customers_axum),
        )
        .route(
            "/api/customer/batch/membership",
            post(commands::customer::update_customer_membership_batch_axum),
        )
        // Sales Ledger Routes
        .route(
            "/api/sales/ledger/debtors",
            get(commands::ledger::get_customers_with_debt_axum),
        )
        .route(
            "/api/sales/ledger",
            get(commands::ledger::get_customer_ledger_axum),
        )
        .route(
            "/api/sales/ledger/create",
            post(commands::ledger::create_ledger_entry_axum),
        )
        .route(
            "/api/sales/ledger/update",
            post(commands::ledger::update_ledger_entry_axum),
        )
        .route(
            "/api/sales/ledger/delete",
            post(commands::ledger::delete_ledger_entry_axum),
        )
        // Consultation / CRM Routes
        .route(
            "/api/crm/consultations",
            get(commands::consultation::get_consultations_axum),
        )
        .route(
            "/api/crm/consultations/update",
            post(commands::consultation::update_consultation_axum),
        )
        .route(
            "/api/crm/consultations/delete",
            get(commands::consultation::delete_consultation_axum),
        )
        .route(
            "/api/crm/ai/briefing",
            get(commands::ai::get_consultation_briefing_axum),
        )
        .route(
            "/api/crm/ai/summary",
            get(commands::ai::get_pending_consultations_summary_axum),
        )
        .route(
            "/api/crm/ai/advisor",
            post(commands::ai::get_consultation_ai_advisor_axum),
        )
        .route(
            "/api/crm/special-care",
            get(commands::crm::get_special_care_customers_axum),
        )
        // AI Routes
        .route(
            "/api/ai/business-card",
            post(commands::ai::parse_business_card_ai_axum),
        )
        // Settings & Integrations
        .route(
            "/api/settings/integrations",
            get(commands::config::get_all_integrations_config_axum),
        )
        .route(
            "/api/settings/integrations/gemini",
            post(commands::config::save_gemini_api_key_axum),
        )
        .route(
            "/api/settings/integrations/sms",
            post(commands::config::save_sms_config_axum),
        )
        .route(
            "/api/settings/integrations/naver",
            post(commands::config::save_naver_keys_axum),
        )
        .route(
            "/api/settings/integrations/mall",
            post(commands::config::save_mall_keys_axum),
        )
        .route(
            "/api/settings/integrations/courier",
            post(commands::config::save_courier_config_axum),
        )
        .route(
            "/api/settings/integrations/tax",
            post(commands::config::save_tax_filing_config_axum),
        )
        // Message Templates
        .route(
            "/api/settings/templates",
            get(commands::config::get_message_templates_axum),
        )
        .route(
            "/api/settings/templates/save",
            post(commands::config::save_message_templates_axum),
        )
        .route(
            "/api/settings/templates/reset",
            post(commands::config::reset_message_templates_axum),
        )
        // Backup & Restore
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
        // Presets & Reset
        .route(
            "/api/preset/list",
            get(commands::preset::get_custom_presets_axum),
        )
        .route(
            "/api/preset/apply",
            post(commands::preset::apply_preset_axum),
        )
        .route(
            "/api/preset/save",
            post(commands::preset::save_current_as_preset_axum),
        )
        .route(
            "/api/preset/delete",
            post(commands::preset::delete_custom_preset_axum),
        )
        .route(
            "/api/preset/data",
            get(commands::preset::get_preset_data_axum),
        )
        .route(
            "/api/preset/reset",
            post(commands::backup::maintenance::reset_database_axum),
        )
        // Mobile Config
        .route(
            "/api/mobile/config",
            get(commands::config::get_mobile_config_axum),
        )
        .route(
            "/api/mobile/config/save",
            post(commands::config::save_mobile_config_axum),
        )
        .route(
            "/api/mobile/local-ip",
            get(commands::config::get_local_ip_axum),
        )
        // Production
        .route(
            "/api/production/spaces",
            get(commands::production::space::get_production_spaces_axum),
        )
        .route(
            "/api/production/spaces/save",
            post(commands::production::space::save_production_space_axum),
        )
        .route(
            "/api/production/spaces/delete/:id",
            post(commands::production::space::delete_production_space_axum),
        )
        .route(
            "/api/production/batches",
            get(commands::production::batch::get_production_batches_axum),
        )
        .route(
            "/api/production/batches/save",
            post(commands::production::batch::save_production_batch_axum),
        )
        .route(
            "/api/production/batches/delete/:id",
            post(commands::production::batch::delete_production_batch_axum),
        )
        .route(
            "/api/production/logs",
            get(commands::production::log::get_farming_logs_axum),
        )
        .route(
            "/api/production/logs/save",
            post(commands::production::log::save_farming_log_axum),
        )
        .route(
            "/api/production/logs/delete/:id",
            post(commands::production::log::delete_farming_log_axum),
        )
        .route(
            "/api/production/harvest",
            get(commands::production::harvest::get_harvest_records_axum),
        )
        .route(
            "/api/production/harvest/save",
            post(commands::production::harvest::save_harvest_record_axum),
        )
        .route(
            "/api/production/harvest/delete/:id",
            post(commands::production::harvest::delete_harvest_record_axum),
        )
        // Production Media
        .route(
            "/api/production/media/upload",
            post(commands::production::media::upload_media_axum),
        )
        .route(
            "/api/production/media/:filename",
            get(commands::production::media::serve_media_axum),
        )
        // IoT
        .route("/api/iot/sensors", get(commands::iot::get_sensors_axum))
        .route(
            "/api/iot/sensors/save",
            post(commands::iot::save_sensor_axum),
        )
        .route(
            "/api/iot/sensors/delete",
            post(commands::iot::delete_sensor_axum),
        )
        .layer(
            CorsLayer::new()
                .allow_origin(Any)
                .allow_methods(Any)
                .allow_headers(Any),
        )
        .with_state(app_state)
        .merge(bridge_router)
        .fallback(static_handler);

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

#[derive(RustEmbed)]
#[folder = "../frontend/dist/"]
struct Assets;

async fn static_handler(uri: Uri) -> impl IntoResponse {
    let path = uri.path().trim_start_matches('/');

    if path.is_empty() || path == "index.html" {
        return index_html().await;
    }

    match Assets::get(path) {
        Some(content) => {
            let mime = mime_guess::from_path(path).first_or_octet_stream();
            ([(header::CONTENT_TYPE, mime.as_ref())], content.data).into_response()
        }
        None => {
            // If it's a file request (has extension) but not found, return 404
            if path.contains('.') {
                return (StatusCode::NOT_FOUND, "Not Found").into_response();
            }
            // For SPA roots, return index.html
            index_html().await
        }
    }
}

async fn index_html() -> axum::response::Response {
    match Assets::get("index.html") {
        Some(content) => ([(header::CONTENT_TYPE, "text/html")], content.data).into_response(),
        None => (StatusCode::NOT_FOUND, "index.html not found").into_response(),
    }
}

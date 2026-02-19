#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")] // 콘솔 창 숨기기 설정
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

use single_instance::SingleInstance;
use tray_icon::{
    menu::{Menu, MenuEvent, MenuItem, PredefinedMenuItem},
    TrayIconBuilder,
};

mod commands;
mod db;
mod error;
mod state;
mod stubs;
#[macro_use]
mod stubs_macros;
mod bridge;
mod embedded_db;
mod proxy;

use state::{AppState, SessionState, SetupStatus};
use std::sync::{atomic::AtomicBool, Arc, Mutex};

pub static DB_MODIFIED: AtomicBool = AtomicBool::new(false);
pub static IS_EXITING: AtomicBool = AtomicBool::new(false);
pub static BACKUP_CANCELLED: AtomicBool = AtomicBool::new(false);
fn main() {
    // 0. Load environment variables
    load_env();

    // 0.1 Start Caddy Proxy for HTTPS (Tailscale)
    proxy::start_caddy();

    // 1. Single Instance Check
    let instance = SingleInstance::new("com.mycelium.smartfarm.backend").unwrap();
    if !instance.is_single() {
        println!("Another instance is already running. Opening dashboard and exiting.");
        let port = std::env::var("PORT").unwrap_or_else(|_| "3000".to_string());
        let _ = open::that(format!("http://localhost:{}", port));
        return;
    }

    // 2. Setup Tray Icon
    let event_loop = tao::event_loop::EventLoopBuilder::new().build();

    let tray_menu = Menu::new();
    let show_item = MenuItem::new("대시보드 열기", true, None);
    let quit_item = MenuItem::new("종료", true, None);

    let _ = tray_menu.append_items(&[&show_item, &PredefinedMenuItem::separator(), &quit_item]);

    // Load icon
    let icon_bytes = include_bytes!("../icons/icon.ico");

    let icon_image = image::load_from_memory(icon_bytes)
        .expect("Failed to load icon")
        .to_rgba8();
    let (width, height) = icon_image.dimensions();
    let tray_icon = tray_icon::Icon::from_rgba(icon_image.into_raw(), width, height)
        .expect("Failed to create icon");

    let _tray_icon = TrayIconBuilder::new()
        .with_menu(Box::new(tray_menu))
        .with_tooltip("Mycelium Smart Farm")
        .with_icon(tray_icon)
        .build()
        .unwrap();

    // 2. Start Axum in a background thread
    std::thread::spawn(move || {
        let rt = tokio::runtime::Runtime::new().unwrap();
        rt.block_on(async {
            run_server().await;
        });
    });

    // 3. Tray Event Loop
    let menu_channel = MenuEvent::receiver();

    event_loop.run(move |_event, _, control_flow| {
        *control_flow = tao::event_loop::ControlFlow::Wait;

        if let Ok(event) = menu_channel.try_recv() {
            if event.id == show_item.id() {
                let _ = open::that("http://localhost:3000");
            } else if event.id == quit_item.id() {
                proxy::stop_caddy();
                std::process::exit(0);
            }
        }
    });
}

async fn run_server() {
    // .env should be loaded at this point from main ideally, but let's keep it here for now or ensure it is called.
    // Actually, let's move the env loading to a separate function and call it at the start of main.
    load_env();

    // Initialize tracing
    tracing_subscriber::registry()
        .with(tracing_subscriber::EnvFilter::new(
            env::var("RUST_LOG")
                .unwrap_or_else(|_| "info,sqlx=error,sqlx::postgres::notice=error".into()),
        ))
        .with(tracing_subscriber::fmt::layer().with_ansi(true))
        .init();

    // Print Startup Splash
    println!(
        r#"
    __  ___                     _   _                 
   /  |/  /_  ___________  ____/ /(_)_  ______ ___    
  / /|_/ / / / / ___/ _ \/ / / / / / / / / __ `__ \   
 / /  / / /_/ / /__/  __/ /_/ / / / /_/ / / / / / /   
/_/  /_/\__, /\___/\___/\__,_/_/_/\__,_/_/ /_/ /_/    
       /____/                                         

    "#
    );
    println!("--------------------------------------------------");
    println!("  CELIUM INTELLIGENT FARM SYSTEM - BACKEND        ");
    println!("  Status: INITIALIZING...                         ");
    println!(
        "  Listen: http://0.0.0.0:{}                       ",
        env::var("PORT").unwrap_or_else(|_| "3000".to_string())
    );
    println!("--------------------------------------------------");

    tracing::info!("Starting Celium Backend core services...");

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
        }

        // Start Background Simulation Task
        let sim_pool = pool.clone();
        tokio::spawn(async move {
            tracing::info!("Starting IoT simulation background loop...");
            // Run immediately once, then every 30 minutes
            let mut interval = tokio::time::interval(std::time::Duration::from_secs(1800));
            loop {
                interval.tick().await;
                if let Err(e) = commands::iot::record_simulated_readings(&sim_pool).await {
                    tracing::error!("Failed to record simulated readings: {}", e);
                }
            }
        });

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
    let config_dir =
        commands::config::get_app_config_dir().unwrap_or_else(|_| std::path::PathBuf::from("."));
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
        // System Routes
        .route(
            "/api/system/check-update",
            get(commands::system::check_for_updates),
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
        .route(
            "/api/auth/verify",
            post(commands::config::verify_mobile_pin),
        )
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
        .route(
            "/api/config/weather/save",
            post(commands::config::save_weather_config_axum),
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
            "/api/product/forecast-alerts",
            get(commands::product::get_inventory_forecast_alerts_axum),
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
        .route(
            "/api/experience/reservations/create",
            post(commands::experience::create_experience_reservation_axum),
        )
        .route(
            "/api/experience/reservations",
            get(commands::experience::get_experience_reservations_axum),
        )
        .route(
            "/api/experience/reservations/update",
            post(commands::experience::update_experience_reservation_axum),
        )
        .route(
            "/api/experience/reservations/delete",
            post(commands::experience::delete_experience_reservation_axum),
        )
        .route(
            "/api/experience/reservations/status",
            post(commands::experience::update_experience_status_axum),
        )
        .route(
            "/api/experience/reservations/payment",
            post(commands::experience::update_experience_payment_status_axum),
        )
        // Schedule Routes
        .route(
            "/api/schedule/list",
            get(commands::schedule::get_schedules_axum),
        )
        .route(
            "/api/schedule/create",
            post(commands::schedule::create_schedule_axum),
        )
        .route(
            "/api/schedule/update",
            post(commands::schedule::update_schedule_axum),
        )
        .route(
            "/api/schedule/delete",
            post(commands::schedule::delete_schedule_axum),
        )
        .route(
            "/api/schedule/anniversary",
            get(commands::schedule::get_upcoming_anniversaries_axum),
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
        // Finance Routes (Vendors & Purchases)
        .route(
            "/api/finance/vendors",
            get(commands::finance::get_vendor_list_axum),
        )
        .route(
            "/api/finance/vendors/save",
            post(commands::finance::save_vendor_axum),
        )
        .route(
            "/api/finance/vendors/delete",
            post(commands::finance::delete_vendor_axum),
        )
        .route(
            "/api/finance/purchases",
            get(commands::finance::get_purchase_list_axum),
        )
        .route(
            "/api/finance/purchases/save",
            post(commands::finance::save_purchase_axum),
        )
        .route(
            "/api/finance/purchases/delete",
            post(commands::finance::delete_purchase_axum),
        )
        // Expense Routes
        .route(
            "/api/finance/expenses",
            get(commands::finance::get_expense_list_axum),
        )
        .route(
            "/api/finance/expenses/save",
            post(commands::finance::save_expense_axum),
        )
        .route(
            "/api/finance/expenses/delete",
            post(commands::finance::delete_expense_axum),
        )
        // Finance Report Routes
        .route(
            "/api/finance/report/pdf",
            get(commands::finance::generate_finance_report_axum),
        )
        // Tax Report Routes
        .route(
            "/api/finance/tax/report",
            get(commands::sales::query::get_tax_report_v2_axum),
        )
        .route(
            "/api/finance/tax/submit",
            post(commands::sales::query::submit_tax_report_axum),
        )
        // Finance Analysis Routes
        .route(
            "/api/finance/analysis/monthly-pl",
            get(commands::finance::get_monthly_pl_report_axum),
        )
        .route(
            "/api/finance/analysis/cost-breakdown",
            get(commands::finance::get_cost_breakdown_stats_axum),
        )
        .route(
            "/api/finance/analysis/vendor-ranking",
            get(commands::finance::get_vendor_purchase_ranking_axum),
        )
        .route(
            "/api/finance/analysis/product-stats",
            get(commands::finance::get_product_sales_stats_axum),
        )
        .route(
            "/api/finance/analysis/product-monthly",
            get(commands::finance::get_product_monthly_analysis_axum),
        )
        .route(
            "/api/finance/analysis/product-trend",
            get(commands::finance::get_product_10yr_sales_stats_axum),
        )
        .route(
            "/api/finance/analysis/region-stats",
            get(commands::analysis::get_sales_by_region_analysis_axum),
        )
        .route(
            "/api/finance/analysis/profit-margin",
            get(commands::finance::get_profit_margin_analysis_axum),
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
            "/api/crm/claim-targets",
            get(commands::crm::get_claim_targets_axum),
        )
        .route(
            "/api/crm/sms/send",
            post(commands::crm::send_sms_simulation_axum),
        )
        .route(
            "/api/crm/special-care",
            get(commands::crm::get_special_care_customers_axum),
        )
        .route(
            "/api/crm/rfm-analysis",
            get(commands::crm::get_rfm_analysis_axum),
        )
        .route(
            "/api/crm/update-level",
            post(commands::crm::update_customer_level_axum),
        )
        .route(
            "/api/crm/update-memo-batch",
            post(commands::customer::update_customer_memo_batch_axum),
        )
        .route(
            "/api/crm/product-associations",
            get(commands::crm::get_product_associations_axum),
        )
        .route(
            "/api/finance/membership-sales",
            get(commands::finance::get_membership_sales_analysis_axum),
        )
        .route(
            "/api/crm/repurchase",
            get(commands::crm::get_repurchase_candidates_axum),
        )
        // AI Routes
        .route(
            "/api/ai/business-card",
            post(commands::ai::parse_business_card_ai_axum),
        )
        .route("/api/ai/gemini", post(commands::ai::call_gemini_ai_axum))
        .route(
            "/api/ai/forecast",
            post(commands::ai::get_ai_demand_forecast_axum),
        )
        .route(
            "/api/ai/marketing-proposal",
            post(commands::ai::get_ai_marketing_proposal_axum),
        )
        .route(
            "/api/ai/detailed-plan",
            post(commands::ai::get_ai_detailed_plan_axum),
        )
        .route(
            "/api/ai/behavior",
            get(commands::ai::get_ai_behavior_strategy_axum),
        )
        .route(
            "/api/ai/repurchase",
            get(commands::ai::get_ai_repurchase_analysis_axum),
        )
        .route(
            "/api/ai/naver-search",
            post(commands::ai::fetch_naver_search_axum),
        )
        .route(
            "/api/ai/online-sentiment",
            post(commands::ai::analyze_online_sentiment_axum),
        )
        .route(
            "/api/ai/weather-advice",
            get(commands::ai::get_weather_marketing_advice_axum),
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
        .route(
            "/api/iot/latest",
            get(commands::iot::get_latest_readings_axum),
        )
        .route("/api/iot/push", post(commands::iot::push_sensor_data_axum))
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

fn load_env() {
    // Load .env from executable's directory first (critical for shortcuts/auto-start),
    // then fall back to CWD-based loading.
    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            let env_path = exe_dir.join(".env");
            if env_path.exists() {
                let _ = dotenvy::from_path(&env_path);
            } else {
                dotenv().ok();
            }
        } else {
            dotenv().ok();
        }
    } else {
        dotenv().ok();
    }
}

async fn index_html() -> axum::response::Response {
    match Assets::get("index.html") {
        Some(content) => ([(header::CONTENT_TYPE, "text/html")], content.data).into_response(),
        None => (StatusCode::NOT_FOUND, "index.html not found").into_response(),
    }
}

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
mod state; // Add state module

use state::{AppState, SessionState, SetupStatus};
use std::sync::{Arc, Mutex};

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

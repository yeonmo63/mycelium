#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")] // 콘솔 창 숨기기 설정
#![allow(dead_code, unused_variables, non_snake_case)]
use axum::http::{header, StatusCode, Uri};
use axum::response::IntoResponse;
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
mod business_logic_tests;
mod embedded_db;
pub mod middleware;
mod routes;

async fn log_requests(
    req: axum::extract::Request,
    next: axum::middleware::Next,
) -> impl IntoResponse {
    let method = req.method().clone();
    let uri = req.uri().clone();

    // Determine log path in writable app config dir
    let log_path = commands::config::get_app_config_dir()
        .map(|p| p.join("api_requests.log"))
        .unwrap_or_else(|_| std::path::PathBuf::from("api_requests.log"));

    let log_line = format!(">>> Request: {} {}\n", method, uri);
    let _ = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_path)
        .and_then(|mut f| {
            use std::io::Write;
            let _ = f.write_all(log_line.as_bytes());
            Ok(())
        });

    tracing::info!(">>> Request: {} {}", method, uri);
    let res = next.run(req).await;
    let res_log = format!("<<< Response: {} for {} {}\n", res.status(), method, uri);
    let _ = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_path)
        .and_then(|mut f| {
            use std::io::Write;
            let _ = f.write_all(res_log.as_bytes());
            Ok(())
        });

    tracing::info!("<<< Response: {} for {} {}", res.status(), method, uri);
    res
}

use state::{AppState, SessionState, SetupStatus};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex,
};

pub static DB_MODIFIED: AtomicBool = AtomicBool::new(false);
pub static IS_EXITING: AtomicBool = AtomicBool::new(false);
pub static BACKUP_CANCELLED: AtomicBool = AtomicBool::new(false);
fn main() {
    // 0. Load environment variables
    load_env();

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
                // Perform final automatic backup before exit
                IS_EXITING.store(true, Ordering::Relaxed);

                let rt = tokio::runtime::Runtime::new().unwrap();
                rt.block_on(async {
                    let config_dir = commands::config::get_app_config_dir()
                        .unwrap_or_else(|_| std::path::PathBuf::from("."));
                    let database_url =
                        env::var("DATABASE_URL").expect("DATABASE_URL must be set in .env");
                    if let Ok(pool) = db::init_pool(&database_url).await {
                        // Final backup on exit if Friday or every time?
                        // The original logic was Friday = Full, others = Incremental.
                        // But for now let's just use trigger_auto_backup logic if changes exist.
                        let _ =
                            commands::backup::auto::trigger_auto_backup(&config_dir, &pool).await;
                    }
                });

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

    let database_url = env::var("DATABASE_URL").unwrap_or_else(|_| {
        tracing::error!("DATABASE_URL not found in env! Please run setup.");
        // Fallback to a non-password URL or just empty to force failure
        "postgresql://postgres@localhost:5432/mycelium".to_string()
    });

    let pool = match db::init_pool(&database_url).await {
        Ok(pool) => pool,
        Err(e) => {
            tracing::error!("Failed to create pool: {}", e);
            return;
        }
    };

    let config_dir =
        commands::config::get_app_config_dir().unwrap_or_else(|_| std::path::PathBuf::from("."));

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
            let mut interval = tokio::time::interval(std::time::Duration::from_secs(1800));
            loop {
                interval.tick().await;
                if let Err(e) = commands::iot::record_simulated_readings(&sim_pool).await {
                    tracing::error!("Failed to record simulated readings: {}", e);
                }
            }
        });

        // Start Auto-Backup Task
        let backup_pool = pool.clone();
        let backup_config_dir = config_dir.clone();
        tokio::spawn(async move {
            tracing::info!("Starting Auto-Backup background loop...");
            // Run every 6 hours
            let mut interval = tokio::time::interval(std::time::Duration::from_secs(21600));
            loop {
                interval.tick().await;
                if let Err(e) =
                    commands::backup::auto::trigger_auto_backup(&backup_config_dir, &backup_pool)
                        .await
                {
                    tracing::error!("Auto-backup background task failed: {}", e);
                }
            }
        });

        SetupStatus::Configured
    } else {
        tracing::warn!("Failed to connect to database. Starting in Setup Mode.");
        SetupStatus::NotConfigured
    };

    let app_state = AppState {
        pool: pool.clone(),
        config_dir: config_dir.clone(),
        setup_status: Arc::new(Mutex::new(setup_status)),
        session: Arc::new(Mutex::new(SessionState::default())),
    };

    // Start Session/Login Block Cleanup Task
    let cleanup_pool = pool.clone();
    tokio::spawn(async move {
        tracing::info!("Starting Session cleanup background loop...");
        // Run every 1 hour
        let mut interval = tokio::time::interval(std::time::Duration::from_secs(3600));
        loop {
            interval.tick().await;
            tracing::debug!("Cleaning up expired sessions and blocks...");

            // Delete expired sessions
            let _ = sqlx::query("DELETE FROM user_sessions WHERE expires_at < CURRENT_TIMESTAMP")
                .execute(&cleanup_pool)
                .await;

            // Delete old login attempts (those not blocked and older than 1 day)
            let _ = sqlx::query("DELETE FROM login_attempts WHERE is_blocked = FALSE AND last_attempt < CURRENT_TIMESTAMP - INTERVAL '1 day'")
                .execute(&cleanup_pool)
                .await;

            // Unblock accounts if time passed
            let _ = sqlx::query("UPDATE login_attempts SET is_blocked = FALSE, attempt_count = 0 WHERE is_blocked = TRUE AND blocked_until < CURRENT_TIMESTAMP")
                .execute(&cleanup_pool)
                .await;
        }
    });

    // Build bridge router (for sales, customers, shipments, etc.)
    let bridge_router = bridge::create_mobile_router::<AppState>();

    // Build our application with routes
    let app = routes::create_router()
        .merge(bridge_router)
        .route_layer(axum::middleware::from_fn(
            crate::middleware::auth::auth_middleware,
        ))
        .layer(axum::middleware::from_fn(
            crate::middleware::response::wrap_response_middleware,
        ))
        .layer(axum::middleware::from_fn(log_requests))
        .layer(
            // allow_origin(Any) is necessary for mobile devices connecting via LAN IP
            // Security is maintained via mandatory JWT authentication on all sensitive routes
            CorsLayer::new()
                .allow_origin(Any)
                .allow_methods(Any)
                .allow_headers(Any),
        )
        .with_state(app_state)
        .fallback(static_handler);

    // Run it
    let port = env::var("PORT").unwrap_or_else(|_| "3000".to_string());
    let addr_str = format!("0.0.0.0:{}", port);
    let addr = addr_str.parse::<SocketAddr>().expect("Invalid address");

    tracing::info!("listening on {}", addr);
    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
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

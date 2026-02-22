use crate::commands;
use crate::state::AppState;
use axum::{
    routing::{get, post},
    Router,
};

pub fn router() -> Router<AppState> {
    Router::new()
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
        .route("/api/ping", get(commands::config::ping))
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
}

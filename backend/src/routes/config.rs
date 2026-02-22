use crate::commands;
use crate::state::AppState;
use axum::{
    routing::{get, post},
    Router,
};

pub fn router() -> Router<AppState> {
    Router::new()
        // Integrations
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
}

use crate::commands;
use crate::state::AppState;
use axum::{
    routing::{get, post},
    Router,
};

pub fn router() -> Router<AppState> {
    Router::new()
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
}

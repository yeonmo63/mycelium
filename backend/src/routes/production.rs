use crate::commands;
use crate::state::AppState;
use axum::{
    routing::{get, post},
    Router,
};

pub fn router() -> Router<AppState> {
    Router::new()
        // Spaces
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
        // Batches
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
        // Logs
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
        // Harvest
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
}

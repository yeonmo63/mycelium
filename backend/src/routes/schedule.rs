use crate::commands;
use crate::state::AppState;
use axum::{
    routing::{get, post},
    Router,
};

pub fn router() -> Router<AppState> {
    Router::new()
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
}

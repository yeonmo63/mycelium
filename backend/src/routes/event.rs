use crate::commands;
use crate::state::AppState;
use axum::{
    routing::{get, post},
    Router,
};

pub fn router() -> Router<AppState> {
    Router::new()
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
}

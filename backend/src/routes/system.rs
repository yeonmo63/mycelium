use crate::commands;
use crate::state::AppState;
use axum::{routing::get, Router};

pub fn router() -> Router<AppState> {
    Router::new().route(
        "/api/system/check-update",
        get(commands::system::check_for_updates),
    )
}

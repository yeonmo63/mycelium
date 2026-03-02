use crate::commands;
use crate::state::AppState;
use axum::{
    routing::{get, post},
    Router,
};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/utility/greet/{name}", get(commands::utility::greet))
        .route(
            "/api/utility/debug_db_schema",
            post(commands::utility::debug_db_schema),
        )
}

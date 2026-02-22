use crate::commands;
use crate::state::AppState;
use axum::{
    routing::{get, post},
    Router,
};

pub fn router() -> Router<AppState> {
    Router::new()
        .route(
            "/api/experience/programs",
            get(commands::experience::get_experience_programs_axum),
        )
        .route(
            "/api/experience/programs/create",
            post(commands::experience::create_experience_program_axum),
        )
        .route(
            "/api/experience/programs/update",
            post(commands::experience::update_experience_program_axum),
        )
        .route(
            "/api/experience/programs/delete",
            post(commands::experience::delete_experience_program_axum),
        )
        .route(
            "/api/experience/reservations/create",
            post(commands::experience::create_experience_reservation_axum),
        )
        .route(
            "/api/experience/reservations",
            get(commands::experience::get_experience_reservations_axum),
        )
        .route(
            "/api/experience/reservations/update",
            post(commands::experience::update_experience_reservation_axum),
        )
        .route(
            "/api/experience/reservations/delete",
            post(commands::experience::delete_experience_reservation_axum),
        )
        .route(
            "/api/experience/reservations/status",
            post(commands::experience::update_experience_status_axum),
        )
        .route(
            "/api/experience/reservations/payment",
            post(commands::experience::update_experience_payment_status_axum),
        )
}

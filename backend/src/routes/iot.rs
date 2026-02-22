use crate::commands;
use crate::state::AppState;
use axum::{
    routing::{get, post},
    Router,
};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/iot/sensors", get(commands::iot::get_sensors_axum))
        .route(
            "/api/iot/sensors/save",
            post(commands::iot::save_sensor_axum),
        )
        .route(
            "/api/iot/sensors/delete",
            post(commands::iot::delete_sensor_axum),
        )
        .route(
            "/api/iot/latest",
            get(commands::iot::get_latest_readings_axum),
        )
        .route("/api/iot/push", post(commands::iot::push_sensor_data_axum))
}

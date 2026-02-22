use crate::commands;
use crate::state::AppState;
use axum::{
    routing::{get, post},
    Router,
};

pub fn router() -> Router<AppState> {
    Router::new()
        .route(
            "/api/product/list",
            get(commands::product::get_product_list_axum),
        )
        .route(
            "/api/product/create",
            post(commands::product::create_product_axum),
        )
        .route(
            "/api/product/update",
            post(commands::product::update_product_axum),
        )
        .route(
            "/api/product/delete",
            post(commands::product::delete_product_axum),
        )
        .route(
            "/api/product/discontinue",
            post(commands::product::discontinue_product_axum),
        )
        .route(
            "/api/product/history",
            get(commands::product::get_product_history_axum),
        )
        .route(
            "/api/product/bom",
            get(commands::product::get_product_bom_axum),
        )
        .route(
            "/api/product/bom/save",
            post(commands::product::save_product_bom_axum),
        )
        .route(
            "/api/product/freshness",
            get(commands::product::get_product_freshness_axum),
        )
        .route(
            "/api/product/forecast-alerts",
            get(commands::product::get_inventory_forecast_alerts_axum),
        )
        .route(
            "/api/product/logs",
            get(commands::product::get_inventory_logs_axum),
        )
        .route(
            "/api/product/stock/adjust",
            post(commands::product::adjust_product_stock_axum),
        )
        .route(
            "/api/product/stock/convert",
            post(commands::product::batch_convert_stock_axum),
        )
}

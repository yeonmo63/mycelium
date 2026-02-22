use crate::commands;
use crate::state::AppState;
use axum::{
    routing::{get, post},
    Router,
};

pub fn router() -> Router<AppState> {
    Router::new()
        .route(
            "/api/sales/create",
            post(commands::sales::order::create_sale_axum),
        )
        .route(
            "/api/sales/daily",
            get(commands::sales::query::get_daily_receipts_axum),
        )
        .route(
            "/api/sales/search-all",
            get(commands::sales::query::search_sales_by_any_axum),
        )
}

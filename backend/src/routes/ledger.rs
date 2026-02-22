use crate::commands;
use crate::state::AppState;
use axum::{
    routing::{get, post},
    Router,
};

pub fn router() -> Router<AppState> {
    Router::new()
        .route(
            "/api/sales/ledger/debtors",
            get(commands::ledger::get_customers_with_debt_axum),
        )
        .route(
            "/api/sales/ledger",
            get(commands::ledger::get_customer_ledger_axum),
        )
        .route(
            "/api/sales/ledger/create",
            post(commands::ledger::create_ledger_entry_axum),
        )
        .route(
            "/api/sales/ledger/update",
            post(commands::ledger::update_ledger_entry_axum),
        )
        .route(
            "/api/sales/ledger/delete",
            post(commands::ledger::delete_ledger_entry_axum),
        )
}

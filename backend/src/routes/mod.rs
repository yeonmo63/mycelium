use crate::state::AppState;
use axum::Router;

pub mod ai;
pub mod auth;
pub mod backup;
pub mod config;
pub mod customer;
pub mod dashboard;
pub mod event;
pub mod experience;
pub mod finance;
pub mod iot;
pub mod ledger;
pub mod preset;
pub mod product;
pub mod production;
pub mod sales;
pub mod schedule;
pub mod system;
pub mod utility;

pub fn create_router() -> Router<AppState> {
    Router::new()
        .merge(utility::router())
        .merge(system::router())
        .merge(auth::router())
        .merge(dashboard::router())
        .merge(sales::router())
        .merge(product::router())
        .merge(experience::router())
        .merge(schedule::router())
        .merge(event::router())
        .merge(customer::router())
        .merge(production::router())
        .merge(iot::router())
        .merge(finance::router())
        .merge(ai::router())
        .merge(ledger::router())
        .merge(config::router())
        .merge(backup::router())
        .merge(preset::router())
}

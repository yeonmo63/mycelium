use crate::db::DbPool;
use axum::{
    routing::{get, post},
    Router,
};

pub mod auth;
pub mod crm;
pub mod customer;
pub mod dashboard;
pub mod event;
pub mod product;
pub mod production;
pub mod sales;

pub fn create_mobile_router<S>() -> Router<S>
where
    S: Clone + Send + Sync + 'static,
    (DbPool, std::path::PathBuf): axum::extract::FromRef<S>,
    DbPool: axum::extract::FromRef<S>,
{
    Router::new()
        // Sales - Special Events
        .route(
            "/api/sales/special/list",
            get(sales::get_special_sales_bridge),
        )
        .route(
            "/api/sales/special/batch",
            post(sales::save_special_sales_batch_bridge),
        )
        // External Mall (Still handled by commands::sales directly if needed, or move to sales bridge)
        .route(
            "/api/sales/external/fetch",
            get(crate::commands::sales::external::fetch_external_mall_orders_axum),
        )
        .route(
            "/api/sales/batch-save",
            post(sales::save_general_sales_batch_bridge),
        )
        // Customers
        .route("/api/customers/search", get(customer::search_customers))
        .route(
            "/api/customers/addresses",
            get(customer::get_customer_addresses_bridge),
        )
        .route(
            "/api/customers/create",
            post(customer::create_customer_bridge),
        )
        // Sales - Query & Shipments
        .route("/api/sales/query/date", get(sales::get_sales_on_date))
        .route("/api/sales/shipments", get(sales::get_shipments_bridge))
        .route(
            "/api/sales/update-status",
            post(sales::update_sale_status_bridge),
        )
        .route(
            "/api/sales/complete-shipment",
            post(sales::complete_shipment_bridge),
        )
        .route("/api/sales/sync-courier", post(sales::sync_courier_bridge))
        // Sales Claims
        .route("/api/sales/claims", get(sales::get_sales_claims_bridge))
        .route(
            "/api/sales/claims/create",
            post(sales::create_sales_claim_bridge),
        )
        .route(
            "/api/sales/claims/process",
            post(sales::process_sales_claim_bridge),
        )
        .route(
            "/api/sales/claims/update",
            post(sales::update_sales_claim_bridge),
        )
        .route(
            "/api/sales/claims/delete",
            post(sales::delete_sales_claim_bridge),
        )
        .route("/api/sales/detail", get(sales::get_sale_detail_bridge))
        .route("/api/sales/search", get(sales::search_sales_bridge))
        // CRM
        .route(
            "/api/crm/consultations/create",
            post(crm::create_consultation_bridge),
        )
    // Auth and other duplicated endpoints removed
}

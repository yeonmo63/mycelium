use crate::commands;
use crate::state::AppState;
use axum::{
    routing::{get, post},
    Router,
};

pub fn router() -> Router<AppState> {
    Router::new()
        // Vendors
        .route(
            "/api/finance/vendors",
            get(commands::finance::get_vendor_list_axum),
        )
        .route(
            "/api/finance/vendors/save",
            post(commands::finance::save_vendor_axum),
        )
        .route(
            "/api/finance/vendors/delete",
            post(commands::finance::delete_vendor_axum),
        )
        // Purchases
        .route(
            "/api/finance/purchases",
            get(commands::finance::get_purchase_list_axum),
        )
        .route(
            "/api/finance/purchases/save",
            post(commands::finance::save_purchase_axum),
        )
        .route(
            "/api/finance/purchases/delete",
            post(commands::finance::delete_purchase_axum),
        )
        // Expenses
        .route(
            "/api/finance/expenses",
            get(commands::finance::get_expense_list_axum),
        )
        .route(
            "/api/finance/expenses/save",
            post(commands::finance::save_expense_axum),
        )
        .route(
            "/api/finance/expenses/delete",
            post(commands::finance::delete_expense_axum),
        )
        // Reports & Analysis
        .route(
            "/api/finance/report/pdf",
            get(commands::finance::generate_finance_report_axum),
        )
        .route(
            "/api/finance/tax/report",
            get(commands::sales::query::get_tax_report_v2_axum),
        )
        .route(
            "/api/finance/tax/submit",
            post(commands::sales::query::submit_tax_report_axum),
        )
        .route(
            "/api/finance/analysis/monthly-pl",
            get(commands::finance::get_monthly_pl_report_axum),
        )
        .route(
            "/api/finance/analysis/cost-breakdown",
            get(commands::finance::get_cost_breakdown_stats_axum),
        )
        .route(
            "/api/finance/analysis/vendor-ranking",
            get(commands::finance::get_vendor_purchase_ranking_axum),
        )
        .route(
            "/api/finance/analysis/product-stats",
            get(commands::finance::get_product_sales_stats_axum),
        )
        .route(
            "/api/finance/analysis/product-monthly",
            get(commands::finance::get_product_monthly_analysis_axum),
        )
        .route(
            "/api/finance/analysis/product-trend",
            get(commands::finance::get_product_10yr_sales_stats_axum),
        )
        .route(
            "/api/finance/analysis/region-stats",
            get(commands::analysis::get_sales_by_region_analysis_axum),
        )
        .route(
            "/api/finance/analysis/profit-margin",
            get(commands::finance::get_profit_margin_analysis_axum),
        )
        .route(
            "/api/finance/membership-sales",
            get(commands::finance::get_membership_sales_analysis_axum),
        )
}

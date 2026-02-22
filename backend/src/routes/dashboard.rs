use crate::commands;
use crate::state::AppState;
use axum::{
    routing::{get, post},
    Router,
};

pub fn router() -> Router<AppState> {
    Router::new()
        .route(
            "/api/dashboard/stats",
            get(commands::dashboard::get_dashboard_stats),
        )
        .route(
            "/api/dashboard/priority-stats",
            get(commands::dashboard::get_dashboard_priority_stats),
        )
        .route(
            "/api/dashboard/secondary-stats",
            get(commands::dashboard::get_dashboard_secondary_stats),
        )
        .route(
            "/api/dashboard/recent-sales",
            get(commands::dashboard::get_recent_sales),
        )
        .route(
            "/api/dashboard/weekly-sales",
            get(commands::dashboard::get_weekly_sales_data),
        )
        .route(
            "/api/dashboard/report",
            post(commands::dashboard::get_business_report_data),
        )
        .route(
            "/api/dashboard/ten-year-stats",
            get(commands::dashboard::get_ten_year_sales_stats),
        )
        .route(
            "/api/dashboard/cohort-stats",
            post(commands::dashboard::get_monthly_sales_by_cohort),
        )
        .route(
            "/api/dashboard/daily-stats",
            post(commands::dashboard::get_daily_sales_stats_by_month),
        )
        .route(
            "/api/dashboard/top-profitable",
            get(commands::dashboard::get_top_profit_products),
        )
        .route(
            "/api/dashboard/top-qty",
            get(commands::dashboard::get_top3_products_by_qty),
        )
        .route(
            "/api/dashboard/schedule-stats",
            get(commands::dashboard::get_dashboard_schedule_stats),
        )
}

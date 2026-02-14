use crate::db::{
    DashboardStats, DbPool, MonthlyCohortStats, ProductSalesStats, ProfitAnalysisResult, Sales,
    TenYearSalesStats,
};
use crate::error::MyceliumResult;
use crate::state::AppState;
use axum::{extract::State, Json};
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, sqlx::FromRow)]
pub struct WeeklySales {
    pub date: String,
    pub total: Option<i64>,
}

#[derive(Serialize, Deserialize)]
pub struct BusinessReportData {
    pub period_label: String,
    pub total_sales: i64,
    pub total_orders: i64,
    pub new_customers: i64,
    pub top_products: Vec<ProductSalesStats>,
    pub top_profitable: Vec<ProfitAnalysisResult>,
}

pub async fn get_dashboard_schedule_stats(State(state): State<AppState>) -> MyceliumResult<Json<i64>> {
    let today = chrono::Local::now().date_naive();
    let count: (i64,) = sqlx::query_as(
        "SELECT COUNT(*) FROM schedules WHERE start_time < ($1 + interval '1 day')::timestamp AND end_time >= $1::timestamp"
    )
    .bind(today)
    .fetch_one(&state.pool)
    .await
    .unwrap_or((0,));

    Ok(Json(count.0))
}

pub async fn get_dashboard_stats(State(state): State<AppState>) -> MyceliumResult<Json<DashboardStats>> {
    let today = chrono::Local::now().date_naive();

    let sql = r#"
        WITH sales_stats AS (
            SELECT 
                SUM(total_amount) FILTER (WHERE order_date = $1 AND status != '취소') as today_sales,
                COUNT(*) FILTER (WHERE order_date = $1 AND status != '취소') as today_orders,
                COUNT(*) FILTER (WHERE status NOT IN ('배송완료', '취소')) as pending
            FROM sales
        ),
        customer_stats AS (
            SELECT 
                COUNT(*) FILTER (WHERE join_date = $1) as new_today,
                COUNT(*) as total_all,
                COUNT(*) FILTER (WHERE status = '정상') as normal,
                COUNT(*) FILTER (WHERE status = '말소') as dormant
            FROM customers
        ),
        schedule_count AS (
            SELECT COUNT(*) as today_schedules 
            FROM schedules 
            WHERE start_time < ($1 + interval '1 day')::timestamp AND end_time >= $1::timestamp
        ),
        exp_stats AS (
            SELECT COUNT(*) as today_exp 
            FROM experience_reservations 
            WHERE reservation_date = $1 AND status != '취소'
        ),
        inv_stats AS (
            SELECT COUNT(*) as low_stock 
            FROM products 
            WHERE stock_quantity <= safety_stock
        ),
        consult_stats AS (
            SELECT COUNT(*) as pending_consults 
            FROM consultations 
            WHERE status IN ('접수', '처리중')
        )
        SELECT 
            CAST(COALESCE(ss.today_sales, 0) AS BIGINT) as total_sales_amount,
            CAST(ss.today_orders AS BIGINT) as total_orders,
            CAST(cs.new_today AS BIGINT) as total_customers,
            CAST(cs.total_all AS BIGINT) as total_customers_all_time,
            CAST(cs.normal AS BIGINT) as normal_customers_count,
            CAST(cs.dormant AS BIGINT) as dormant_customers_count,
            CAST(ss.pending AS BIGINT) as pending_orders,
            CAST(sc.today_schedules AS BIGINT) as today_schedule_count,
            CAST(es.today_exp AS BIGINT) as experience_reservation_count,
            CAST(is_stat.low_stock AS BIGINT) as low_stock_count,
            CAST(cons.pending_consults AS BIGINT) as pending_consultation_count
        FROM sales_stats ss, customer_stats cs, schedule_count sc, exp_stats es, inv_stats is_stat, consult_stats cons
    "#;

    match tokio::time::timeout(
        std::time::Duration::from_secs(15),
        sqlx::query_as::<_, DashboardStats>(sql)
            .bind(today)
            .fetch_one(&state.pool),
    )
    .await
    {
        Ok(Ok(stats)) => Ok(Json(stats)),
        Ok(Err(e)) => {
            eprintln!("Dashboard Stats Error: {:?}", e);
            Ok(Json(DashboardStats::default()))
        }
        Err(_) => {
            eprintln!("Dashboard Stats Timeout");
            Ok(Json(DashboardStats::default()))
        }
    }
}

pub async fn get_dashboard_priority_stats(
    State(state): State<AppState>,
) -> MyceliumResult<Json<DashboardStats>> {
    let today = chrono::Local::now().date_naive();
    let sql = r#"
        SELECT 
            (SELECT CAST(COALESCE(SUM(total_amount), 0) AS BIGINT) FROM sales WHERE order_date = $1 AND status != '취소') as total_sales_amount,
            (SELECT COUNT(*) FROM sales WHERE order_date = $1 AND status != '취소') as total_orders,
            (SELECT COUNT(*) FROM customers WHERE join_date = $1) as total_customers,
            (SELECT COUNT(*) FROM customers) as total_customers_all_time,
            (SELECT COUNT(*) FROM customers WHERE status = '정상') as normal_customers_count,
            (SELECT COUNT(*) FROM customers WHERE status = '말소') as dormant_customers_count,
            (SELECT COUNT(*) FROM sales WHERE status NOT IN ('배송완료', '취소')) as pending_orders,
            (SELECT COUNT(*) FROM schedules WHERE start_time < ($1 + interval '1 day')::timestamp AND end_time >= $1::timestamp) as today_schedule_count,
            NULL::bigint as experience_reservation_count,
            NULL::bigint as low_stock_count,
            NULL::bigint as pending_consultation_count
    "#;

    let stats = sqlx::query_as::<_, DashboardStats>(sql)
        .bind(today)
        .fetch_one(&state.pool)
        .await
        .unwrap_or_default();

    Ok(Json(stats))
}

pub async fn get_dashboard_secondary_stats(
    State(state): State<AppState>,
) -> MyceliumResult<Json<DashboardStats>> {
    let today = chrono::Local::now().date_naive();
    let sql = r#"
        SELECT 
            NULL::bigint as total_sales_amount,
            NULL::bigint as total_orders,
            NULL::bigint as total_customers,
            NULL::bigint as total_customers_all_time,
            NULL::bigint as normal_customers_count,
            NULL::bigint as dormant_customers_count,
            NULL::bigint as pending_orders,
            NULL::bigint as today_schedule_count,
            (SELECT COUNT(*) FROM experience_reservations WHERE reservation_date = $1 AND status != '취소') as experience_reservation_count,
            (SELECT COUNT(*) FROM products WHERE stock_quantity <= safety_stock) as low_stock_count,
            (SELECT COUNT(*) FROM consultations WHERE status IN ('접수', '처리중')) as pending_consultation_count
    "#;

    let stats = sqlx::query_as::<_, DashboardStats>(sql)
        .bind(today)
        .fetch_one(&state.pool)
        .await
        .unwrap_or_default();

    Ok(Json(stats))
}

#[derive(Deserialize)]
pub struct BusinessReportRequest {
    pub period: String,
}

pub async fn get_business_report_data(
    State(state): State<AppState>,
    Json(payload): Json<BusinessReportRequest>,
) -> MyceliumResult<Json<BusinessReportData>> {
    let period = payload.period;
    let today = chrono::Local::now().date_naive();
    let start_date = if period == "weekly" {
        today - chrono::Duration::days(7)
    } else {
        today - chrono::Duration::days(30)
    };

    let stats_row: (Option<i64>, Option<i64>, Option<i64>) = sqlx::query_as(
        r#"
        SELECT 
            (SELECT CAST(SUM(total_amount) AS BIGINT) FROM sales WHERE order_date >= $1 AND status != '취소') as total_sales,
            (SELECT COUNT(*) FROM sales WHERE order_date >= $1 AND status != '취소') as total_orders,
            (SELECT COUNT(*) FROM customers WHERE join_date >= $1) as new_customers
        "#
    )
    .bind(start_date)
    .fetch_one(&state.pool)
    .await?;

    let top_products = sqlx::query_as::<_, ProductSalesStats>(
        r#"
        SELECT 
            COALESCE(s.product_name, p.product_name) || COALESCE(' (' || s.specification || ')', '') as product_name,
            MAX(p.product_id) as product_id,
            COUNT(*) as record_count,
            CAST(SUM(s.quantity) AS BIGINT) as total_quantity, 
            CAST(SUM(s.total_amount) AS BIGINT) as total_amount
        FROM sales s
        LEFT JOIN products p ON (s.product_id = p.product_id OR (s.product_id IS NULL AND s.product_name = p.product_name AND s.specification IS NOT DISTINCT FROM p.specification))
        WHERE s.order_date >= $1 AND s.status != '취소'
        GROUP BY 1 ORDER BY total_quantity DESC LIMIT 3
        "#,
    )
    .bind(start_date)
    .fetch_all(&state.pool)
    .await?;

    let top_profitable = sqlx::query_as::<_, ProfitAnalysisResult>(
        r#"
        SELECT 
            COALESCE(s.product_name, p.product_name) || COALESCE(' (' || s.specification || ')', '') as product_name,
            COUNT(*) as record_count,
            CAST(SUM(s.quantity) AS BIGINT) as total_quantity,
            CAST(SUM(s.total_amount) AS BIGINT) as total_revenue,
            CAST(COALESCE(MAX(p.cost_price), 0) AS BIGINT) as unit_cost,
            CAST(SUM(s.quantity * COALESCE(p.cost_price, 0)) AS BIGINT) as total_cost,
            CAST(SUM(s.total_amount) - SUM(s.quantity * COALESCE(p.cost_price, 0)) AS BIGINT) as net_profit,
            CASE WHEN SUM(s.total_amount) > 0 THEN 
                (CAST(SUM(s.total_amount) - SUM(s.quantity * COALESCE(p.cost_price, 0)) AS DOUBLE PRECISION) / CAST(SUM(s.total_amount) AS DOUBLE PRECISION)) * 100.0
            ELSE 0.0 END as margin_rate
        FROM sales s
        LEFT JOIN products p ON (s.product_id = p.product_id OR (s.product_id IS NULL AND s.product_name = p.product_name AND s.specification IS NOT DISTINCT FROM p.specification))
        WHERE s.order_date >= $1 AND s.status != '취소'
        GROUP BY 1 ORDER BY net_profit DESC LIMIT 3
        "#,
    )
    .bind(start_date)
    .fetch_all(&state.pool)
    .await?;

    Ok(Json(BusinessReportData {
        period_label: if period == "weekly" {
            "지난 7일"
        } else {
            "지난 30일"
        }
        .to_string(),
        total_sales: stats_row.0.unwrap_or(0),
        total_orders: stats_row.1.unwrap_or(0),
        new_customers: stats_row.2.unwrap_or(0),
        top_products,
        top_profitable,
    }))
}

pub async fn get_recent_sales(State(state): State<AppState>) -> MyceliumResult<Json<Vec<Sales>>> {
    let sales = sqlx::query_as::<_, Sales>(
        "SELECT s.*, c.customer_name 
         FROM sales s
         LEFT JOIN customers c ON s.customer_id = c.customer_id
         ORDER BY s.order_date DESC, s.sales_id DESC LIMIT 5",
    )
    .fetch_all(&state.pool)
    .await?;

    Ok(Json(sales))
}

pub async fn get_weekly_sales_data(State(state): State<AppState>) -> MyceliumResult<Json<Vec<WeeklySales>>> {
    let sql = r#"
        SELECT 
            TO_CHAR(d, 'MM-DD') as date,
            CAST(COALESCE(SUM(s.total_amount), 0) AS BIGINT) as total
        FROM generate_series(CURRENT_DATE - interval '6 days', CURRENT_DATE, '1 day') d
        LEFT JOIN sales s ON s.order_date = d::date AND s.status != '취소'
        GROUP BY d
        ORDER BY d
    "#;

    let rows = sqlx::query_as::<_, WeeklySales>(sql)
        .fetch_all(&state.pool)
        .await
        .unwrap_or_default();

    Ok(Json(rows))
}

pub async fn get_ten_year_sales_stats(
    State(state): State<AppState>,
) -> MyceliumResult<Json<Vec<TenYearSalesStats>>> {
    let sql = r#"
        WITH RECURSIVE years AS (
            SELECT CAST(TO_CHAR(CURRENT_DATE, 'YYYY') AS INTEGER) - i AS year
            FROM generate_series(0, 9) i
        )
        SELECT 
            y.year::TEXT as year,
            COALESCE(COUNT(s.sales_id), 0) as record_count,
            COALESCE(SUM(s.quantity), 0) as total_quantity,
            COALESCE(SUM(s.total_amount), 0) as total_amount
        FROM years y
        LEFT JOIN sales s ON TO_CHAR(s.order_date, 'YYYY') = y.year::TEXT
        GROUP BY y.year
        ORDER BY y.year ASC
    "#;

    let stats = sqlx::query_as::<_, TenYearSalesStats>(sql)
        .fetch_all(&state.pool)
        .await?;

    Ok(Json(stats))
}

#[derive(Deserialize)]
pub struct CohortRequest {
    pub year: String,
}

pub async fn get_monthly_sales_by_cohort(
    State(state): State<AppState>,
    Json(payload): Json<CohortRequest>,
) -> MyceliumResult<Json<Vec<MonthlyCohortStats>>> {
    let year = payload.year;
    if year.len() != 4 {
        return Err(crate::error::MyceliumError::Validation("Invalid year format".to_string()));
    }

    let sql = r#"
        WITH RECURSIVE months(m) AS (
            SELECT 1 UNION ALL SELECT m + 1 FROM months WHERE m < 12
        ),
        target_months AS (
            SELECT TO_CHAR(TO_DATE($1 || '-' || m, 'YYYY-MM'), 'YYYY-MM') as yyyymm 
            FROM months
        )
        SELECT 
            tm.yyyymm,
            COALESCE(COUNT(s.sales_id), 0) as record_count,
            COALESCE(SUM(s.quantity), 0) as total_quantity,
            COALESCE(SUM(s.total_amount), 0) as total_amount
        FROM target_months tm
        LEFT JOIN sales s ON TO_CHAR(s.order_date, 'YYYY-MM') = tm.yyyymm
        GROUP BY tm.yyyymm
        ORDER BY tm.yyyymm ASC
    "#;

    let stats = sqlx::query_as::<_, MonthlyCohortStats>(sql)
        .bind(year)
        .fetch_all(&state.pool)
        .await?;

    Ok(Json(stats))
}

#[derive(Deserialize)]
pub struct DailyStatsRequest {
    pub year_month: String, // "2024-01"
}

pub async fn get_daily_sales_stats_by_month(
    State(state): State<AppState>,
    Json(payload): Json<DailyStatsRequest>,
) -> MyceliumResult<Json<Vec<MonthlyCohortStats>>> {
    let year_month = payload.year_month;
    if year_month.len() != 7 {
        return Err(crate::error::MyceliumError::Validation(
            "Invalid year_month format (Expected YYYY-MM)".to_string(),
        ));
    }

    let sql = r#"
        WITH days AS (
            SELECT generate_series(
                ($1 || '-01')::date,
                (($1 || '-01')::date + interval '1 month' - interval '1 day')::date,
                '1 day'::interval
            )::date as d
        )
        SELECT 
            d::text as yyyymm,
            COALESCE(COUNT(s.sales_id), 0) as record_count,
            COALESCE(SUM(s.quantity), 0) as total_quantity,
            COALESCE(SUM(s.total_amount), 0) as total_amount
        FROM days
        LEFT JOIN sales s ON s.order_date = d AND s.status != '취소'
        GROUP BY d
        ORDER BY d ASC
    "#;

    let stats = sqlx::query_as::<_, MonthlyCohortStats>(sql)
        .bind(year_month)
        .fetch_all(&state.pool)
        .await?;

    Ok(Json(stats))
}

pub async fn get_top_profit_products(
    State(state): State<AppState>,
) -> MyceliumResult<Json<Vec<ProfitAnalysisResult>>> {
    let today = chrono::Local::now().date_naive();
    let sql = r#"
        SELECT 
            COALESCE(s.product_name, p.product_name) || COALESCE(' (' || s.specification || ')', '') as product_name,
            COUNT(*) as record_count,
            CAST(SUM(s.quantity) AS BIGINT) as total_quantity,
            CAST(SUM(s.total_amount) AS BIGINT) as total_revenue,
            CAST(COALESCE(MAX(p.cost_price), 0) AS BIGINT) as unit_cost,
            CAST(SUM(s.quantity * COALESCE(p.cost_price, 0)) AS BIGINT) as total_cost,
            CAST(SUM(s.total_amount) - SUM(s.quantity * COALESCE(p.cost_price, 0)) AS BIGINT) as net_profit,
            CASE 
                WHEN SUM(s.total_amount) > 0 THEN 
                    (CAST(SUM(s.total_amount) - SUM(s.quantity * COALESCE(p.cost_price, 0)) AS DOUBLE PRECISION) / CAST(SUM(s.total_amount) AS DOUBLE PRECISION)) * 100.0
                ELSE 0.0
            END as margin_rate
        FROM sales s
        LEFT JOIN products p ON (s.product_id = p.product_id OR (s.product_id IS NULL AND s.product_name = p.product_name AND s.specification IS NOT DISTINCT FROM p.specification))
        WHERE s.order_date >= date_trunc('month', $1)
          AND s.order_date < (date_trunc('month', $1) + interval '1 month')
          AND s.status != '취소'
        GROUP BY 1
        ORDER BY net_profit DESC
        LIMIT 5
    "#;

    let results = sqlx::query_as::<_, ProfitAnalysisResult>(sql)
        .bind(today)
        .fetch_all(&state.pool)
        .await?;

    Ok(Json(results))
}

pub async fn get_top3_products_by_qty(
    State(state): State<AppState>,
) -> MyceliumResult<Json<Vec<ProductSalesStats>>> {
    let today = chrono::Local::now().date_naive();
    let query = r#"
        SELECT 
            COALESCE(s.product_name, p.product_name) || COALESCE(' (' || s.specification || ')', '') as product_name,
            MAX(p.product_id) as product_id,
            COUNT(*) as record_count,
            CAST(SUM(s.quantity) AS BIGINT) as total_quantity, 
            CAST(SUM(s.total_amount) AS BIGINT) as total_amount
        FROM sales s
        LEFT JOIN products p ON (s.product_id = p.product_id OR (s.product_id IS NULL AND s.product_name = p.product_name AND s.specification IS NOT DISTINCT FROM p.specification))
        WHERE s.order_date >= date_trunc('month', $1)
        AND s.order_date < (date_trunc('month', $1) + interval '1 month')
        AND s.status != '취소'
        GROUP BY 1
        ORDER BY total_quantity DESC
        LIMIT 3
    "#;

    let stats = sqlx::query_as::<_, ProductSalesStats>(query)
        .bind(today)
        .fetch_all(&state.pool)
        .await?;

    Ok(Json(stats))
}

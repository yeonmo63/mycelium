use crate::db::{
    DashboardStats, DbPool, MonthlyCohortStats, ProductSalesStats, ProfitAnalysisResult, Sales,
    TenYearSalesStats,
};
use crate::error::{MyceliumError, MyceliumResult};
use tauri::{command, State};

#[derive(serde::Serialize, sqlx::FromRow)]
pub struct WeeklySales {
    date: String,
    total: Option<i64>,
}

#[derive(serde::Serialize)]
pub struct BusinessReportData {
    pub period_label: String,
    pub total_sales: i64,
    pub total_orders: i64,
    pub new_customers: i64,
    pub top_products: Vec<ProductSalesStats>,
    pub top_profitable: Vec<ProfitAnalysisResult>,
}

#[command]
pub async fn get_dashboard_stats(state: State<'_, DbPool>) -> MyceliumResult<DashboardStats> {
    let today = chrono::Local::now().date_naive();
    eprintln!("Dashboard: Fetching stats for date: {}", today);

    // Timeout (15s) - return empty stats on timeout to keep UI responsive
    match tokio::time::timeout(std::time::Duration::from_secs(15), async {
        sqlx::query_as(
            r#"
            SELECT 
                (SELECT CAST(COALESCE(SUM(total_amount), 0) AS BIGINT) FROM sales WHERE order_date = $1 AND status != '취소') as total_sales_amount,
                (SELECT COUNT(*) FROM sales WHERE order_date = $1 AND status != '취소') as total_orders,
                (SELECT COUNT(*) FROM customers WHERE join_date = $1) as total_customers,
                (SELECT COUNT(*) FROM customers) as total_customers_all_time,
                (SELECT COUNT(*) FROM customers WHERE status = '정상') as normal_customers_count,
                (SELECT COUNT(*) FROM customers WHERE status = '말소') as dormant_customers_count,
                (SELECT COUNT(*) FROM sales WHERE status NOT IN ('배송완료', '취소')) as pending_orders,
                (SELECT COUNT(*) FROM schedules WHERE start_time < ($1 + interval '1 day')::timestamp AND end_time >= $1::timestamp) as today_schedule_count,
                (SELECT COUNT(*) FROM experience_reservations WHERE reservation_date = $1 AND status != '취소') as experience_reservation_count,
                (SELECT COUNT(*) FROM products WHERE stock_quantity <= safety_stock) as low_stock_count,
                (SELECT COUNT(*) FROM consultations WHERE status IN ('접수', '처리중')) as pending_consultation_count
        "#,
        )
        .bind(today)
        .fetch_one(&*state)
        .await
    }).await {
        Ok(Ok(stats)) => Ok(stats),
        Ok(Err(e)) => {
            eprintln!("Dashboard Stats Error: {:?}", e);
            // Return empty stats on DB error to keep UI functional
            Ok(DashboardStats::default())
        },
        Err(_) => {
            eprintln!("Dashboard Stats Timeout: Returning empty stats.");
            Ok(DashboardStats::default())
        }
    }
}

#[command]
pub async fn get_business_report_data(
    state: State<'_, DbPool>,
    period: String, // "weekly" or "monthly"
) -> MyceliumResult<BusinessReportData> {
    let today = chrono::Local::now().date_naive();
    let start_date = if period == "weekly" {
        today - chrono::Duration::days(7)
    } else {
        today - chrono::Duration::days(30)
    };

    // 1. Basic Stats
    let stats_row: (Option<i64>, Option<i64>, Option<i64>) = sqlx::query_as(
        r#"
        SELECT 
            (SELECT CAST(SUM(total_amount) AS BIGINT) FROM sales WHERE order_date >= $1 AND status != '취소') as total_sales,
            (SELECT COUNT(*) FROM sales WHERE order_date >= $1 AND status != '취소') as total_orders,
            (SELECT COUNT(*) FROM customers WHERE join_date >= $1) as new_customers
        "#
    )
    .bind(start_date)
    .fetch_one(&*state)
    .await?;

    // 2. Top Products by Quantity
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
    .fetch_all(&*state)
    .await?;

    // 3. Top Profitable Products
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
    .fetch_all(&*state)
    .await?;

    Ok(BusinessReportData {
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
    })
}

#[command]
pub async fn get_recent_sales(state: State<'_, DbPool>) -> MyceliumResult<Vec<Sales>> {
    let sales = sqlx::query_as::<_, Sales>(
        "SELECT s.*, c.customer_name 
         FROM sales s
         LEFT JOIN customers c ON s.customer_id = c.customer_id
         ORDER BY s.order_date DESC LIMIT 5",
    )
    .fetch_all(&*state)
    .await?;

    Ok(sales)
}

#[command]
pub async fn get_weekly_sales_data(state: State<'_, DbPool>) -> MyceliumResult<Vec<WeeklySales>> {
    let mut results = Vec::new();
    let today = chrono::Local::now().date_naive();

    // Timeout (15s) - return empty on timeout
    match tokio::time::timeout(std::time::Duration::from_secs(15), async {
        for i in (0..7).rev() {
            let date = today - chrono::Duration::days(i);
            let date_str = date.format("%m-%d").to_string();

            let total: (i64,) = sqlx::query_as(
                "SELECT COALESCE(SUM(total_amount), 0) FROM sales WHERE order_date = $1 AND status != '취소'"
            )
            .bind(date)
            .fetch_one(&*state)
            .await
            .unwrap_or((0,));

            results.push(WeeklySales {
                date: date_str,
                total: Some(total.0),
            });
        }
        Ok::<Vec<WeeklySales>, sqlx::Error>(results)
    }).await {
        Ok(Ok(res)) => Ok(res),
        Ok(Err(e)) => Err(MyceliumError::Database(e)),
        Err(_) => {
            eprintln!("Weekly Sales Timeout: Database is busy.");
            Ok(Vec::new()) // Return empty list on timeout
        }
    }
}

#[command]
pub async fn get_ten_year_sales_stats(
    state: State<'_, DbPool>,
) -> MyceliumResult<Vec<TenYearSalesStats>> {
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
        .fetch_all(&*state)
        .await?;

    Ok(stats)
}

#[command]
pub async fn get_monthly_sales_by_cohort(
    pool: State<'_, DbPool>,
    year: String,
) -> MyceliumResult<Vec<MonthlyCohortStats>> {
    if year.len() != 4 {
        return Err(MyceliumError::Validation("Invalid year format".to_string()));
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
        .fetch_all(&*pool)
        .await?;

    Ok(stats)
}

#[command]
pub async fn get_daily_sales_stats_by_month(
    pool: State<'_, DbPool>,
    year_month: String, // "2024-01"
) -> MyceliumResult<Vec<MonthlyCohortStats>> {
    if year_month.len() != 7 {
        return Err(MyceliumError::Validation(
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
        .fetch_all(&*pool)
        .await?;

    Ok(stats)
}

#[command]
pub async fn get_top_profit_products(
    state: State<'_, DbPool>,
) -> MyceliumResult<Vec<ProfitAnalysisResult>> {
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
        .fetch_all(&*state)
        .await?;

    Ok(results)
}

#[command]
pub async fn get_top3_products_by_qty(
    state: State<'_, DbPool>,
) -> MyceliumResult<Vec<ProductSalesStats>> {
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
        .fetch_all(&*state)
        .await?;

    Ok(stats)
}

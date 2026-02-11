use crate::db::{DashboardStats, DbPool};
use axum::{
    extract::State,
    http::header,
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use serde_json::{json, Value};

pub fn create_mobile_router(pool: DbPool) -> Router {
    Router::new()
        .route("/api/dashboard/priority-stats", get(get_priority_stats))
        .route("/api/dashboard/secondary-stats", get(get_secondary_stats))
        .route("/api/dashboard/weekly-sales", get(get_weekly_sales))
        .route("/api/dashboard/top-products", get(get_top_products))
        .route("/api/dashboard/top-profitable", get(get_top_profitable))
        .route("/api/production/spaces", get(get_spaces))
        .route("/api/production/batches", get(get_batches))
        .route("/api/farming/save-log", post(save_farming_log))
        .route("/api/production/save-harvest", post(save_harvest))
        .with_state(pool)
}

async fn get_priority_stats(State(pool): State<DbPool>) -> impl IntoResponse {
    let today = chrono::Local::now().date_naive();
    println!("Mobile API: Fetching Priority Stats for {}", today);

    // Using IDENTICAL query as PC (CTE-based for reliability)
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
        )
        SELECT 
            CAST(COALESCE(ss.today_sales, 0) AS BIGINT) as total_sales_amount,
            CAST(COALESCE(ss.today_orders, 0) AS BIGINT) as total_orders,
            CAST(COALESCE(cs.new_today, 0) AS BIGINT) as total_customers,
            CAST(COALESCE(cs.total_all, 0) AS BIGINT) as total_customers_all_time,
            CAST(COALESCE(cs.normal, 0) AS BIGINT) as normal_customers_count,
            CAST(COALESCE(cs.dormant, 0) AS BIGINT) as dormant_customers_count,
            CAST(COALESCE(ss.pending, 0) AS BIGINT) as pending_orders,
            CAST(COALESCE(sc.today_schedules, 0) AS BIGINT) as today_schedule_count,
            NULL::bigint as experience_reservation_count,
            NULL::bigint as low_stock_count,
            NULL::bigint as pending_consultation_count
        FROM sales_stats ss, customer_stats cs, schedule_count sc
    "#;

    let res = sqlx::query_as::<_, DashboardStats>(sql)
        .bind(today)
        .fetch_one(&pool)
        .await;

    match res {
        Ok(stats) => {
            println!(
                "Mobile API: Priority Stats -> Sales: {:?}, Orders: {:?}",
                stats.total_sales_amount, stats.total_orders
            );
            (
                [(header::CACHE_CONTROL, "no-cache, no-store, must-revalidate")],
                Json(json!(stats)),
            )
                .into_response()
        }
        Err(e) => {
            eprintln!("Mobile API: Priority Stats ERROR: {:?}", e);
            (
                [(header::CACHE_CONTROL, "no-cache, no-store, must-revalidate")],
                Json(json!(DashboardStats::default())),
            )
                .into_response()
        }
    }
}

async fn get_secondary_stats(State(pool): State<DbPool>) -> impl IntoResponse {
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

    let res = sqlx::query_as::<_, DashboardStats>(sql)
        .bind(today)
        .fetch_one(&pool)
        .await
        .unwrap_or_default();

    (
        [(header::CACHE_CONTROL, "no-cache, no-store, must-revalidate")],
        Json(json!(res)),
    )
}

async fn get_weekly_sales(State(pool): State<DbPool>) -> impl IntoResponse {
    let today = chrono::Local::now().date_naive();
    let sql = r#"
        SELECT 
            TO_CHAR(d, 'MM-DD') as date,
            CAST(COALESCE(SUM(s.total_amount), 0) AS BIGINT) as total
        FROM generate_series($1 - interval '6 days', $1, '1 day') d
        LEFT JOIN sales s ON s.order_date = d::date AND s.status != '취소'
        GROUP BY d
        ORDER BY d
    "#;

    let rows: Vec<(String, i64)> = sqlx::query_as(sql)
        .bind(today)
        .fetch_all(&pool)
        .await
        .unwrap_or_default();

    let res: Vec<Value> = rows
        .into_iter()
        .map(|(date, total)| json!({ "date": date, "total": total }))
        .collect();

    (
        [(header::CACHE_CONTROL, "no-cache, no-store, must-revalidate")],
        Json(json!(res)),
    )
}

async fn get_top_products(State(pool): State<DbPool>) -> impl IntoResponse {
    let today = chrono::Local::now().date_naive();
    let query = r#"
        SELECT 
            COALESCE(s.product_name, p.product_name) || COALESCE(' (' || s.specification || ')', '') as product_name,
            CAST(SUM(s.quantity) AS BIGINT) as total_quantity
        FROM sales s
        LEFT JOIN products p ON (s.product_id = p.product_id OR (s.product_id IS NULL AND s.product_name = p.product_name AND s.specification IS NOT DISTINCT FROM p.specification))
        WHERE s.order_date >= date_trunc('month', $1)
        AND s.order_date < (date_trunc('month', $1) + interval '1 month')
        AND s.status != '취소'
        GROUP BY 1
        ORDER BY total_quantity DESC
        LIMIT 3
    "#;

    let rows: Vec<(String, i64)> = sqlx::query_as(query)
        .bind(today)
        .fetch_all(&pool)
        .await
        .unwrap_or_default();

    let res: Vec<Value> = rows
        .into_iter()
        .map(|(name, qty)| json!({ "product_name": name, "total_quantity": qty }))
        .collect();

    (
        [(header::CACHE_CONTROL, "no-cache, no-store, must-revalidate")],
        Json(json!(res)),
    )
}

async fn get_top_profitable(State(pool): State<DbPool>) -> impl IntoResponse {
    let today = chrono::Local::now().date_naive();
    let sql = r#"
        SELECT 
            COALESCE(s.product_name, p.product_name) || COALESCE(' (' || s.specification || ')', '') as product_name,
            CAST(SUM(s.total_amount) - SUM(s.quantity * COALESCE(p.cost_price, 0)) AS BIGINT) as net_profit
        FROM sales s
        LEFT JOIN products p ON (s.product_id = p.product_id OR (s.product_id IS NULL AND s.product_name = p.product_name AND s.specification IS NOT DISTINCT FROM p.specification))
        WHERE s.order_date >= date_trunc('month', $1)
          AND s.order_date < (date_trunc('month', $1) + interval '1 month')
          AND s.status != '취소'
        GROUP BY 1
        ORDER BY net_profit DESC
        LIMIT 5
    "#;

    let rows: Vec<(String, i64)> = sqlx::query_as(sql)
        .bind(today)
        .fetch_all(&pool)
        .await
        .unwrap_or_default();

    let res: Vec<Value> = rows
        .into_iter()
        .map(|(name, profit)| json!({ "product_name": name, "net_profit": profit }))
        .collect();

    (
        [(header::CACHE_CONTROL, "no-cache, no-store, must-revalidate")],
        Json(json!(res)),
    )
}

async fn get_spaces(State(pool): State<DbPool>) -> Json<Value> {
    let rows =
        sqlx::query("SELECT space_id, space_name FROM production_spaces ORDER BY space_name")
            .fetch_all(&pool)
            .await
            .unwrap_or_default();

    let res: Vec<Value> = rows.into_iter().map(|r| {
        use sqlx::Row;
        json!({ "space_id": r.get::<i32, _>("space_id"), "space_name": r.get::<String, _>("space_name") })
    }).collect();
    Json(json!(res))
}

async fn get_batches(State(pool): State<DbPool>) -> Json<Value> {
    let rows = sqlx::query("SELECT batch_id, batch_code, status FROM production_batches WHERE status != 'completed' ORDER BY start_date DESC")
        .fetch_all(&pool)
        .await
        .unwrap_or_default();

    let res: Vec<Value> = rows
        .into_iter()
        .map(|r| {
            use sqlx::Row;
            json!({
                "batch_id": r.get::<i32, _>("batch_id"),
                "batch_code": r.get::<String, _>("batch_code"),
                "status": r.get::<String, _>("status")
            })
        })
        .collect();
    Json(json!(res))
}

async fn save_farming_log(State(pool): State<DbPool>, Json(payload): Json<Value>) -> Json<Value> {
    let log = payload.get("log").unwrap_or(&payload);
    let res = sqlx::query(
        "INSERT INTO farming_logs (batch_id, space_id, log_date, worker_name, work_type, work_content, env_data) 
         VALUES ($1, $2, $3, $4, $5, $6, $7)"
    )
    .bind(log.get("batch_id").and_then(|v| v.as_i64()).map(|v| v as i32))
    .bind(log.get("space_id").and_then(|v| v.as_i64()).map(|v| v as i32))
    .bind(log.get("log_date").and_then(|v| v.as_str()).unwrap_or(""))
    .bind(log.get("worker_name").and_then(|v| v.as_str()).unwrap_or(""))
    .bind(log.get("work_type").and_then(|v| v.as_str()).unwrap_or(""))
    .bind(log.get("work_content").and_then(|v| v.as_str()).unwrap_or(""))
    .bind(log.get("env_data").unwrap_or(&json!({})))
    .execute(&pool)
    .await;

    match res {
        Ok(_) => Json(json!({ "success": true })),
        Err(e) => Json(json!({ "success": false, "error": e.to_string() })),
    }
}

async fn save_harvest(State(pool): State<DbPool>, Json(payload): Json<Value>) -> Json<Value> {
    let rec = payload.get("record").unwrap_or(&payload);
    let res = sqlx::query(
        "INSERT INTO harvest_records (batch_id, harvest_date, quantity, defective_quantity, loss_quantity, unit, grade, memo) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)"
    )
    .bind(rec.get("batch_id").and_then(|v| v.as_i64()).map(|v| v as i32))
    .bind(rec.get("harvest_date").and_then(|v| v.as_str()).unwrap_or(""))
    .bind(rec.get("quantity").and_then(|v| v.as_f64()).unwrap_or(0.0))
    .bind(rec.get("defective_quantity").and_then(|v| v.as_f64()).unwrap_or(0.0))
    .bind(rec.get("loss_quantity").and_then(|v| v.as_f64()).unwrap_or(0.0))
    .bind(rec.get("unit").and_then(|v| v.as_str()).unwrap_or("kg"))
    .bind(rec.get("grade").and_then(|v| v.as_str()).unwrap_or(""))
    .bind(rec.get("memo").and_then(|v| v.as_str()).unwrap_or(""))
    .execute(&pool)
    .await;

    match res {
        Ok(_) => Json(json!({ "success": true })),
        Err(e) => Json(json!({ "success": false, "error": e.to_string() })),
    }
}

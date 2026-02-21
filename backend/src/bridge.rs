use crate::commands::consultation::create_consultation_internal;
use crate::commands::courier::batch_sync_courier_statuses_internal;
use crate::commands::event::search_events_by_name_internal;
use crate::commands::logistics::{get_shipments_by_status_internal, PendingShipment};
use crate::commands::sales::batch::{
    save_general_sales_batch_internal, save_special_sales_batch, GeneralSalesBatchItem,
    SpecialEventInput, SpecialSaleInput,
};
use crate::commands::sales::claim::{
    create_sales_claim_internal, delete_sales_claim_internal, get_sales_claims_internal,
    process_sales_claim_internal, update_sales_claim_internal,
};
use crate::commands::sales::external::fetch_external_mall_orders_axum;
use crate::commands::sales::query::{
    get_sale_detail_internal, get_sales_by_event_id_and_date_range_internal,
    search_sales_by_any_internal,
};
use crate::db::{Customer, CustomerAddress, DashboardStats, DbPool, Sales};
use axum::{
    extract::{Query, State},
    http::header,
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::PathBuf;

pub fn create_mobile_router(pool: DbPool, config_dir: PathBuf) -> Router {
    Router::new()
        // Sales - Special Events
        .route("/api/events/search", get(search_events_bridge))
        .route("/api/sales/special/list", get(get_special_sales_bridge))
        .route(
            "/api/sales/special/batch",
            post(save_special_sales_batch_bridge),
        )
        // External Mall
        .route(
            "/api/sales/external/fetch",
            get(fetch_external_mall_orders_axum),
        )
        .route(
            "/api/sales/batch-save",
            post(save_general_sales_batch_bridge),
        )
        // Customers
        .route("/api/customers/search", get(search_customers))
        .route(
            "/api/customers/addresses",
            get(get_customer_addresses_bridge),
        )
        .route("/api/customers/create", post(create_customer_bridge))
        // Sales - Query & Shipments
        .route("/api/sales/query/date", get(get_sales_on_date))
        .route("/api/sales/shipments", get(get_shipments_bridge))
        .route("/api/sales/update-status", post(update_sale_status_bridge))
        .route(
            "/api/sales/complete-shipment",
            post(complete_shipment_bridge),
        )
        .route("/api/sales/sync-courier", post(sync_courier_bridge))
        // Sales Claims
        .route("/api/sales/claims", get(get_sales_claims_bridge))
        .route("/api/sales/claims/create", post(create_sales_claim_bridge))
        .route(
            "/api/sales/claims/process",
            post(process_sales_claim_bridge),
        )
        .route("/api/sales/claims/update", post(update_sales_claim_bridge))
        .route("/api/sales/claims/delete", post(delete_sales_claim_bridge))
        .route("/api/sales/detail", get(get_sale_detail_bridge))
        .route("/api/sales/search", get(search_sales_bridge))
        .route(
            "/api/crm/consultations/create",
            post(create_consultation_bridge),
        )
        .with_state((pool, config_dir))
}

// ... (Existing handlers omitted for brevity, adding new ones at the end) ...

async fn get_sales_claims_bridge(
    State((pool, _)): State<(DbPool, PathBuf)>,
    Query(params): Query<HashMap<String, String>>,
) -> impl IntoResponse {
    let start_date = params.get("startDate").cloned();
    let end_date = params.get("endDate").cloned();

    match get_sales_claims_internal(&pool, start_date, end_date).await {
        Ok(data) => Json(json!(data)),
        Err(e) => Json(json!({ "success": false, "error": e.to_string() })),
    }
}

async fn create_sales_claim_bridge(
    State((pool, _)): State<(DbPool, PathBuf)>,
    Json(payload): Json<Value>,
) -> impl IntoResponse {
    let sales_id = payload
        .get("salesId")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let customer_id = payload
        .get("customerId")
        .and_then(|v| v.as_str())
        .map(|v| v.to_string());
    let claim_type = payload
        .get("claimType")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let reason_category = payload
        .get("reasonCategory")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let quantity = payload
        .get("quantity")
        .and_then(|v| v.as_i64())
        .unwrap_or(0) as i32;
    let memo = payload
        .get("memo")
        .and_then(|v| v.as_str())
        .map(|v| v.to_string());

    match create_sales_claim_internal(
        &pool,
        sales_id,
        customer_id,
        claim_type,
        reason_category,
        quantity,
        memo,
    )
    .await
    {
        Ok(id) => Json(json!({ "success": true, "claimId": id })),
        Err(e) => Json(json!({ "success": false, "error": e.to_string() })),
    }
}

async fn process_sales_claim_bridge(
    State((pool, _)): State<(DbPool, PathBuf)>,
    Json(payload): Json<Value>,
) -> impl IntoResponse {
    let claim_id = payload.get("claimId").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
    let claim_status = payload
        .get("claimStatus")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let is_inventory_recovered = payload
        .get("isInventoryRecovered")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    let refund_amount = payload
        .get("refundAmount")
        .and_then(|v| v.as_i64())
        .unwrap_or(0) as i32;

    match process_sales_claim_internal(
        &pool,
        claim_id,
        claim_status,
        is_inventory_recovered,
        refund_amount,
    )
    .await
    {
        Ok(_) => Json(json!({ "success": true })),
        Err(e) => Json(json!({ "success": false, "error": e.to_string() })),
    }
}

async fn update_sales_claim_bridge(
    State((pool, _)): State<(DbPool, PathBuf)>,
    Json(payload): Json<Value>,
) -> impl IntoResponse {
    let claim_id = payload.get("claimId").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
    let reason_category = payload
        .get("reasonCategory")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let quantity = payload
        .get("quantity")
        .and_then(|v| v.as_i64())
        .unwrap_or(0) as i32;
    let memo = payload
        .get("memo")
        .and_then(|v| v.as_str())
        .map(|v| v.to_string());

    match update_sales_claim_internal(&pool, claim_id, reason_category, quantity, memo).await {
        Ok(_) => Json(json!({ "success": true })),
        Err(e) => Json(json!({ "success": false, "error": e.to_string() })),
    }
}

async fn delete_sales_claim_bridge(
    State((pool, _)): State<(DbPool, PathBuf)>,
    Json(payload): Json<Value>,
) -> impl IntoResponse {
    let claim_id = payload.get("claimId").and_then(|v| v.as_i64()).unwrap_or(0) as i32;

    match delete_sales_claim_internal(&pool, claim_id).await {
        Ok(_) => Json(json!({ "success": true })),
        Err(e) => Json(json!({ "success": false, "error": e.to_string() })),
    }
}

async fn get_sale_detail_bridge(
    State((pool, _)): State<(DbPool, PathBuf)>,
    Query(params): Query<HashMap<String, String>>,
) -> impl IntoResponse {
    let sales_id = params.get("salesId").cloned().unwrap_or_default();
    match get_sale_detail_internal(&pool, sales_id).await {
        Ok(data) => Json(json!(data)),
        Err(e) => Json(json!({ "success": false, "error": e.to_string() })),
    }
}

async fn search_sales_bridge(
    State((pool, _)): State<(DbPool, PathBuf)>,
    Query(params): Query<HashMap<String, String>>,
) -> impl IntoResponse {
    let query = params.get("query").cloned().unwrap_or_default();
    // period param is ignored in current internal function, but could be added later
    match search_sales_by_any_internal(&pool, query).await {
        Ok(data) => Json(json!(data)),
        Err(e) => Json(json!({ "success": false, "error": e.to_string() })),
    }
}

async fn create_consultation_bridge(
    State((pool, _)): State<(DbPool, PathBuf)>,
    Json(payload): Json<Value>,
) -> impl IntoResponse {
    let customer_id = payload
        .get("customerId")
        .and_then(|v| v.as_str())
        .map(|v| v.to_string());
    let guest_name = payload
        .get("guestName")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let contact = payload
        .get("contact")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let channel = payload
        .get("channel")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let counselor_name = payload
        .get("counselorName")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let category = payload
        .get("category")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let title = payload
        .get("title")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let content = payload
        .get("content")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let priority = payload
        .get("priority")
        .and_then(|v| v.as_str())
        .unwrap_or("보통")
        .to_string();

    match create_consultation_internal(
        &pool,
        customer_id,
        guest_name,
        contact,
        channel,
        counselor_name,
        category,
        title,
        content,
        priority,
    )
    .await
    {
        Ok(id) => Json(json!({ "success": true, "consultId": id })),
        Err(e) => Json(json!({ "success": false, "error": e.to_string() })),
    }
}

async fn search_customers(
    State((pool, _)): State<(DbPool, PathBuf)>,
    Query(params): Query<HashMap<String, String>>,
) -> impl IntoResponse {
    let name = params.get("name").cloned().unwrap_or_default();
    let query =
        "SELECT * FROM customers WHERE customer_name LIKE $1 OR mobile_number LIKE $1 LIMIT 50";
    let filter = format!("%{}%", name);
    let rows = sqlx::query_as::<_, Customer>(query)
        .bind(filter)
        .fetch_all(&pool)
        .await
        .unwrap_or_default();
    Json(json!(rows))
}

async fn get_customer_addresses_bridge(
    State((pool, _)): State<(DbPool, PathBuf)>,
    Query(params): Query<HashMap<String, String>>,
) -> impl IntoResponse {
    let cid = params.get("customerId").cloned().unwrap_or_default();
    let rows = sqlx::query_as::<_, CustomerAddress>(
        "SELECT * FROM customer_addresses WHERE customer_id = $1",
    )
    .bind(cid)
    .fetch_all(&pool)
    .await
    .unwrap_or_default();
    Json(json!(rows))
}

async fn get_sales_on_date(
    State((pool, _)): State<(DbPool, PathBuf)>,
    Query(params): Query<HashMap<String, String>>,
) -> impl IntoResponse {
    let cid = params.get("customerId").cloned().unwrap_or_default();
    let date_str = params.get("date").cloned().unwrap_or_default();
    let date = chrono::NaiveDate::parse_from_str(&date_str, "%Y-%m-%d")
        .unwrap_or_else(|_| chrono::Local::now().date_naive());

    let rows = sqlx::query_as::<_, Sales>(
        "SELECT * FROM sales WHERE customer_id = $1 AND order_date = $2 AND status != '취소'",
    )
    .bind(cid)
    .bind(date)
    .fetch_all(&pool)
    .await
    .unwrap_or_default();
    Json(json!(rows))
}

async fn save_general_sales_batch_bridge(
    State((pool, _)): State<(DbPool, PathBuf)>,
    Json(payload): Json<Value>,
) -> impl IntoResponse {
    // payload: { items: [...], deleted_ids: [...] }
    let items_val = payload.get("items");
    let deleted_val = payload.get("deleted_ids");

    let items: Vec<GeneralSalesBatchItem> = if let Some(iv) = items_val {
        serde_json::from_value(iv.clone()).unwrap_or_default()
    } else {
        vec![]
    };

    let deleted_ids: Vec<String> = if let Some(dv) = deleted_val {
        serde_json::from_value(dv.clone()).unwrap_or_default()
    } else {
        vec![]
    };

    let res = save_general_sales_batch_internal(&pool, items, deleted_ids).await;

    match res {
        Ok(_) => Json(json!({ "success": true })),
        Err(e) => Json(json!({ "success": false, "error": e.to_string() })),
    }
}

async fn get_auth_status(State((_, config_dir)): State<(DbPool, PathBuf)>) -> impl IntoResponse {
    let config_path = config_dir.join("config.json");
    let mut use_pin = false;

    if let Ok(content) = std::fs::read_to_string(config_path) {
        if let Ok(json) = serde_json::from_str::<Value>(&content) {
            use_pin = json
                .get("mobile_use_pin")
                .and_then(|v| v.as_bool())
                .unwrap_or(false);
        }
    }

    Json(json!({ "require_pin": use_pin }))
}

async fn verify_pin(
    State((_, config_dir)): State<(DbPool, PathBuf)>,
    Json(payload): Json<Value>,
) -> impl IntoResponse {
    let input_pin = payload.get("pin").and_then(|v| v.as_str()).unwrap_or("");
    let config_path = config_dir.join("config.json");
    let mut stored_pin = "".to_string();

    if let Ok(content) = std::fs::read_to_string(config_path) {
        if let Ok(json) = serde_json::from_str::<Value>(&content) {
            stored_pin = json
                .get("mobile_access_pin")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
        }
    }

    if !stored_pin.is_empty() && stored_pin == input_pin {
        Json(json!({ "success": true, "username": "현장관리자", "role": "admin" }))
    } else {
        Json(json!({ "success": false, "error": "PIN 번호가 일치하지 않습니다." }))
    }
}

async fn get_priority_stats(State((pool, _)): State<(DbPool, PathBuf)>) -> impl IntoResponse {
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

async fn get_secondary_stats(State((pool, _)): State<(DbPool, PathBuf)>) -> impl IntoResponse {
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

async fn get_weekly_sales(State((pool, _)): State<(DbPool, PathBuf)>) -> impl IntoResponse {
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

async fn get_top_products(State((pool, _)): State<(DbPool, PathBuf)>) -> impl IntoResponse {
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

async fn get_top_profitable(State((pool, _)): State<(DbPool, PathBuf)>) -> impl IntoResponse {
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

async fn get_spaces(State((pool, _)): State<(DbPool, PathBuf)>) -> Json<Value> {
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

async fn get_batches(State((pool, _)): State<(DbPool, PathBuf)>) -> Json<Value> {
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

async fn save_farming_log(
    State((pool, _)): State<(DbPool, PathBuf)>,
    Json(payload): Json<Value>,
) -> Json<Value> {
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

async fn save_harvest(
    State((pool, _)): State<(DbPool, PathBuf)>,
    Json(payload): Json<Value>,
) -> Json<Value> {
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

async fn get_all_events_bridge(State((pool, _)): State<(DbPool, PathBuf)>) -> impl IntoResponse {
    let res = sqlx::query_as::<_, crate::db::Event>("SELECT * FROM event ORDER BY start_date DESC")
        .fetch_all(&pool)
        .await;

    match res {
        Ok(events) => Json(json!(events)),
        Err(_) => Json(json!([])),
    }
}

async fn get_product_list_bridge(State((pool, _)): State<(DbPool, PathBuf)>) -> impl IntoResponse {
    let res = sqlx::query_as::<_, crate::db::Product>(
        "SELECT * FROM products WHERE status = '판매중' AND (item_type = 'product' OR item_type IS NULL) ORDER BY product_name",
    )
    .fetch_all(&pool)
    .await;

    match res {
        Ok(products) => Json(json!(products)),
        Err(_) => Json(json!([])),
    }
}

async fn create_customer_bridge(
    State((pool, _)): State<(DbPool, PathBuf)>,
    Json(payload): Json<Value>,
) -> impl IntoResponse {
    let name = payload.get("name").and_then(|v| v.as_str()).unwrap_or("");
    let mobile = payload.get("mobile").and_then(|v| v.as_str()).unwrap_or("");
    let phone = payload.get("phone").and_then(|v| v.as_str()).unwrap_or("");
    let level = payload
        .get("level")
        .and_then(|v| v.as_str())
        .unwrap_or("일반");
    let zip = payload.get("zip").and_then(|v| v.as_str()).unwrap_or("");
    let addr1 = payload.get("addr1").and_then(|v| v.as_str()).unwrap_or("");
    let addr2 = payload.get("addr2").and_then(|v| v.as_str()).unwrap_or("");
    let memo = payload.get("memo").and_then(|v| v.as_str()).unwrap_or("");
    let join_date_str = payload
        .get("joinDate")
        .and_then(|v| v.as_str())
        .unwrap_or("");

    let join_date = chrono::NaiveDate::parse_from_str(join_date_str, "%Y-%m-%d")
        .unwrap_or_else(|_| chrono::Local::now().date_naive());

    // Generate Customer ID
    let today_str = chrono::Local::now().format("%Y%m%d").to_string();
    let prefix = format!("C-{}", today_str);
    let like_query = format!("{}%", prefix);

    let last_id: Option<(String,)> = sqlx::query_as("SELECT customer_id FROM customers WHERE customer_id LIKE $1 ORDER BY customer_id DESC LIMIT 1")
        .bind(&like_query).fetch_optional(&pool).await.unwrap_or_default();

    let next_seq = match last_id {
        Some((lid,)) => {
            lid.split('-')
                .last()
                .unwrap_or("0")
                .parse::<i32>()
                .unwrap_or(0)
                + 1
        }
        None => 1,
    };
    let new_cid = format!("{}-{:05}", prefix, next_seq);

    let res = sqlx::query("INSERT INTO customers (customer_id, customer_name, customer_level, address_primary, address_detail, mobile_number, phone_number, memo, join_date, zip_code, status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, '정상')")
        .bind(&new_cid).bind(name).bind(level).bind(addr1).bind(addr2).bind(mobile).bind(phone).bind(memo).bind(join_date).bind(zip).execute(&pool).await;

    match res {
        Ok(_) => Json(json!({ "success": true, "customerId": new_cid })),
        Err(e) => Json(json!({ "success": false, "error": e.to_string() })),
    }
}

async fn get_shipments_bridge(
    State((pool, _)): State<(DbPool, PathBuf)>,
    Query(params): Query<HashMap<String, String>>,
) -> impl IntoResponse {
    let status = params
        .get("status")
        .cloned()
        .unwrap_or_else(|| "전체".to_string());
    let search = params.get("search").cloned().filter(|s| !s.is_empty());
    let start_date = params.get("startDate").cloned();
    let end_date = params.get("endDate").cloned();

    match get_shipments_by_status_internal(&pool, status, search, start_date, end_date).await {
        Ok(data) => Json(json!(data)),
        Err(_) => Json(json!([])),
    }
}

async fn update_sale_status_bridge(
    State((pool, _)): State<(DbPool, PathBuf)>,
    Json(payload): Json<Value>,
) -> impl IntoResponse {
    let sales_id = payload
        .get("salesId")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let status = payload.get("status").and_then(|v| v.as_str()).unwrap_or("");

    if sales_id.is_empty() || status.is_empty() {
        return Json(json!({ "success": false, "error": "Invalid arguments" }));
    }

    let res = sqlx::query("UPDATE sales SET status = $1 WHERE sales_id = $2")
        .bind(status)
        .bind(sales_id)
        .execute(&pool)
        .await;

    match res {
        Ok(_) => Json(json!({ "success": true })),
        Err(e) => Json(json!({ "success": false, "error": e.to_string() })),
    }
}

async fn complete_shipment_bridge(
    State((pool, _)): State<(DbPool, PathBuf)>,
    Json(payload): Json<Value>,
) -> impl IntoResponse {
    let sales_id = payload
        .get("salesId")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let carrier = payload
        .get("carrier")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let tracking_val = payload.get("trackingNumber");
    let tracking = if tracking_val.is_some() && !tracking_val.unwrap().is_null() {
        tracking_val.and_then(|v| v.as_str())
    } else {
        None
    };

    let shipping_date_str = payload
        .get("shippingDate")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let shipping_date = chrono::NaiveDate::parse_from_str(shipping_date_str, "%Y-%m-%d")
        .unwrap_or_else(|_| chrono::Local::now().date_naive());

    let res = sqlx::query("UPDATE sales SET status = '배송중', courier_name = $1, tracking_number = $2, shipping_date = $3 WHERE sales_id = $4")
        .bind(carrier)
        .bind(tracking)
        .bind(shipping_date)
        .bind(sales_id)
        .execute(&pool)
        .await;

    match res {
        Ok(_) => Json(json!({ "success": true })),
        Err(e) => Json(json!({ "success": false, "error": e.to_string() })),
    }
}

async fn sync_courier_bridge(
    State((pool, config_dir)): State<(DbPool, PathBuf)>,
) -> impl IntoResponse {
    match batch_sync_courier_statuses_internal(&pool, &config_dir).await {
        Ok(count) => Json(json!({ "success": true, "count": count })),
        Err(e) => Json(json!({ "success": false, "error": e.to_string() })),
    }
}

async fn search_events_bridge(
    State((pool, _)): State<(DbPool, PathBuf)>,
    Query(params): Query<HashMap<String, String>>,
) -> impl IntoResponse {
    let name = params
        .get("name")
        .or(params.get("query"))
        .cloned()
        .unwrap_or_default();
    match search_events_by_name_internal(&pool, name).await {
        Ok(data) => Json(json!(data)),
        Err(e) => Json(json!({ "success": false, "error": e.to_string() })),
    }
}

async fn get_special_sales_bridge(
    State((pool, _)): State<(DbPool, PathBuf)>,
    Query(params): Query<HashMap<String, String>>,
) -> impl IntoResponse {
    let event_id = params.get("eventId").cloned().unwrap_or_default();
    let start_date = params.get("startDate").cloned().unwrap_or_default();
    let end_date = params.get("endDate").cloned().unwrap_or_default();

    match get_sales_by_event_id_and_date_range_internal(&pool, event_id, start_date, end_date).await
    {
        Ok(data) => Json(json!(data)),
        Err(e) => Json(json!({ "success": false, "error": e.to_string() })),
    }
}

#[derive(serde::Deserialize)]
struct SpecialBatchPayload {
    event: SpecialEventInput,
    sales: Vec<SpecialSaleInput>,
    #[serde(default)]
    deletedSalesIds: Vec<String>,
}

async fn save_special_sales_batch_bridge(
    State((pool, _)): State<(DbPool, PathBuf)>,
    Json(payload): Json<SpecialBatchPayload>,
) -> impl IntoResponse {
    match save_special_sales_batch(&pool, payload.event, payload.sales, payload.deletedSalesIds)
        .await
    {
        Ok(id) => Json(json!(id)),
        Err(e) => Json(json!({ "success": false, "error": e.to_string() })),
    }
}

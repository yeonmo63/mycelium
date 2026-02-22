use crate::db::{Customer, CustomerAddress, DbPool};
use axum::{
    extract::{Query, State},
    response::IntoResponse,
    Json,
};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::PathBuf;

pub async fn search_customers(
    State((pool, _)): State<(DbPool, PathBuf)>,
    Query(params): Query<HashMap<String, String>>,
) -> impl IntoResponse {
    let name = params
        .get("name")
        .or(params.get("query"))
        .cloned()
        .unwrap_or_default();
    let query =
        "SELECT * FROM customers WHERE customer_name ILIKE $1 OR mobile_number ILIKE $1 LIMIT 50";
    let filter = format!("%{}%", name);
    let rows = sqlx::query_as::<_, Customer>(query)
        .bind(filter)
        .fetch_all(&pool)
        .await
        .unwrap_or_default();
    Json(json!(rows))
}

pub async fn get_customer_addresses_bridge(
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

pub async fn create_customer_bridge(
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

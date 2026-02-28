use crate::commands::courier::batch_sync_courier_statuses_internal;
use crate::commands::logistics::get_shipments_by_status_internal;
use crate::commands::sales::batch::{
    save_general_sales_batch_internal, save_special_sales_batch, GeneralSalesBatchItem,
    SpecialEventInput, SpecialSaleInput,
};
use crate::commands::sales::claim::{
    create_sales_claim_internal, delete_sales_claim_internal, get_sales_claims_internal,
    process_sales_claim_internal, update_sales_claim_internal,
};
use crate::commands::sales::query::{
    get_sale_detail_internal, get_sales_by_event_id_and_date_range_internal,
    search_sales_by_any_internal,
};
use crate::db::{DbPool, Sales};
use crate::middleware::auth::Claims;
use axum::{
    extract::{Query, State},
    response::IntoResponse,
    Extension, Json,
};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::PathBuf;

pub async fn get_sales_claims_bridge(
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

pub async fn create_sales_claim_bridge(
    State((pool, _)): State<(DbPool, PathBuf)>,
    Extension(claims): Extension<Claims>,
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

    let username = claims.username.as_deref().unwrap_or("Admin");

    match create_sales_claim_internal(
        &pool,
        username,
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

pub async fn process_sales_claim_bridge(
    State((pool, _)): State<(DbPool, PathBuf)>,
    Extension(claims): Extension<Claims>,
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

    let username = claims.username.as_deref().unwrap_or("Admin");

    match process_sales_claim_internal(
        &pool,
        username,
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

pub async fn update_sales_claim_bridge(
    State((pool, _)): State<(DbPool, PathBuf)>,
    Extension(claims): Extension<Claims>,
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

    let username = claims.username.as_deref().unwrap_or("Admin");

    match update_sales_claim_internal(&pool, username, claim_id, reason_category, quantity, memo)
        .await
    {
        Ok(_) => Json(json!({ "success": true })),
        Err(e) => Json(json!({ "success": false, "error": e.to_string() })),
    }
}

pub async fn delete_sales_claim_bridge(
    State((pool, _)): State<(DbPool, PathBuf)>,
    Extension(claims): Extension<Claims>,
    Json(payload): Json<Value>,
) -> impl IntoResponse {
    let claim_id = payload.get("claimId").and_then(|v| v.as_i64()).unwrap_or(0) as i32;

    let username = claims.username.as_deref().unwrap_or("Admin");

    match delete_sales_claim_internal(&pool, username, claim_id).await {
        Ok(_) => Json(json!({ "success": true })),
        Err(e) => Json(json!({ "success": false, "error": e.to_string() })),
    }
}

pub async fn get_sale_detail_bridge(
    State((pool, _)): State<(DbPool, PathBuf)>,
    Query(params): Query<HashMap<String, String>>,
) -> impl IntoResponse {
    let sales_id = params.get("salesId").cloned().unwrap_or_default();
    match get_sale_detail_internal(&pool, sales_id).await {
        Ok(data) => Json(json!(data)),
        Err(e) => Json(json!({ "success": false, "error": e.to_string() })),
    }
}

pub async fn search_sales_bridge(
    State((pool, _)): State<(DbPool, PathBuf)>,
    Query(params): Query<HashMap<String, String>>,
) -> impl IntoResponse {
    let query = params.get("query").cloned().unwrap_or_default();
    match search_sales_by_any_internal(&pool, query).await {
        Ok(data) => Json(json!(data)),
        Err(e) => Json(json!({ "success": false, "error": e.to_string() })),
    }
}

pub async fn get_sales_on_date(
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

pub async fn save_general_sales_batch_bridge(
    State((pool, _)): State<(DbPool, PathBuf)>,
    Json(payload): Json<Value>,
) -> impl IntoResponse {
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

pub async fn get_shipments_bridge(
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

pub async fn update_sale_status_bridge(
    State((pool, _)): State<(DbPool, PathBuf)>,
    Extension(claims): Extension<Claims>,
    Json(payload): Json<Value>,
) -> impl IntoResponse {
    let sales_id = payload
        .get("salesId")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let status = payload.get("status").and_then(|v| v.as_str()).unwrap_or("");
    let username = claims.username.as_deref().unwrap_or("Admin");

    if sales_id.is_empty() || status.is_empty() {
        return Json(json!({ "success": false, "error": "Invalid arguments" }));
    }

    let mut tx = match pool.begin().await {
        Ok(t) => t,
        Err(e) => return Json(json!({ "success": false, "error": e.to_string() })),
    };

    if let Err(e) = crate::db::set_db_user_context(&mut *tx, username).await {
        return Json(json!({ "success": false, "error": e.to_string() }));
    }

    let res = sqlx::query("UPDATE sales SET status = $1 WHERE sales_id = $2")
        .bind(status)
        .bind(sales_id)
        .execute(&mut *tx)
        .await;

    match res {
        Ok(_) => {
            let _ = tx.commit().await;
            Json(json!({ "success": true }))
        }
        Err(e) => Json(json!({ "success": false, "error": e.to_string() })),
    }
}

pub async fn complete_shipment_bridge(
    State((pool, _)): State<(DbPool, PathBuf)>,
    Extension(claims): Extension<Claims>,
    Json(payload): Json<Value>,
) -> impl IntoResponse {
    let sales_id = payload
        .get("salesId")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let carrier = payload
        .get("carrier")
        .and_then(|v| v.as_str())
        .map(|v| v.to_string());
    let tracking_val = payload.get("trackingNumber");
    let tracking = if tracking_val.is_some() && !tracking_val.unwrap().is_null() {
        tracking_val.and_then(|v| v.as_str()).map(|v| v.to_string())
    } else {
        None
    };

    let shipping_date_str = payload
        .get("shippingDate")
        .and_then(|v| v.as_str())
        .unwrap_or("");

    let username = claims.username.as_deref().unwrap_or("Admin");

    match crate::commands::sales::order::complete_shipment(
        crate::stubs::State::from(&pool),
        username,
        sales_id,
        None, // memo
        carrier,
        tracking,
        Some(shipping_date_str.to_string()),
    )
    .await
    {
        Ok(_) => Json(json!({ "success": true })),
        Err(e) => Json(json!({ "success": false, "error": e.to_string() })),
    }
}

pub async fn sync_courier_bridge(
    State((pool, config_dir)): State<(DbPool, PathBuf)>,
) -> impl IntoResponse {
    match batch_sync_courier_statuses_internal(&pool, &config_dir).await {
        Ok(count) => Json(json!({ "success": true, "count": count })),
        Err(e) => Json(json!({ "success": false, "error": e.to_string() })),
    }
}

pub async fn get_special_sales_bridge(
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
pub struct SpecialBatchPayload {
    pub event: SpecialEventInput,
    pub sales: Vec<SpecialSaleInput>,
    #[serde(default)]
    pub deletedSalesIds: Vec<String>,
}

pub async fn save_special_sales_batch_bridge(
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

pub async fn delete_sale_bridge(
    State((pool, _)): State<(DbPool, std::path::PathBuf)>,
    Extension(claims): Extension<Claims>,
    Json(payload): Json<Value>,
) -> impl IntoResponse {
    let sales_id = payload
        .get("salesId")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    if sales_id.is_empty() {
        return Json(json!({ "success": false, "error": "Missing salesId" }));
    }

    let username = claims.username.as_deref().unwrap_or("Admin");

    match crate::commands::sales::order::delete_sale(
        crate::stubs::State::from(&pool),
        username,
        sales_id.to_string(),
    )
    .await
    {
        Ok(_) => Json(json!({ "success": true })),
        Err(e) => Json(json!({ "success": false, "error": e.to_string() })),
    }
}

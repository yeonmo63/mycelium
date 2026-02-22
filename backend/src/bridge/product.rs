use crate::db::DbPool;
use axum::{extract::State, response::IntoResponse, Json};
use serde_json::json;
use std::path::PathBuf;

pub async fn get_product_list_bridge(
    State((pool, _)): State<(DbPool, PathBuf)>,
) -> impl IntoResponse {
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

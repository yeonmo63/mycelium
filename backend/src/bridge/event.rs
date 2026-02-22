use crate::db::DbPool;
use axum::{extract::State, response::IntoResponse, Json};
use serde_json::json;
use std::path::PathBuf;

pub async fn get_all_events_bridge(
    State((pool, _)): State<(DbPool, PathBuf)>,
) -> impl IntoResponse {
    let res = sqlx::query_as::<_, crate::db::Event>("SELECT * FROM event ORDER BY start_date DESC")
        .fetch_all(&pool)
        .await;

    match res {
        Ok(events) => Json(json!(events)),
        Err(_) => Json(json!([])),
    }
}

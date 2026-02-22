use crate::db::DbPool;
use axum::{extract::State, Json};
use serde_json::{json, Value};
use std::path::PathBuf;

pub async fn get_spaces(State((pool, _)): State<(DbPool, PathBuf)>) -> Json<Value> {
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

pub async fn get_batches(State((pool, _)): State<(DbPool, PathBuf)>) -> Json<Value> {
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

pub async fn save_farming_log(
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

pub async fn save_harvest(
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

use crate::db::{DbPool, FarmingLog};
use crate::error::MyceliumResult;
use crate::middleware::auth::Claims;
use crate::state::AppState;
use crate::stubs::State;
use axum::extract::{Json, Query, State as AxumState};
use axum::Extension;
use serde::Deserialize;
use sqlx::{query, query_as};

pub async fn get_farming_logs(
    state: State<'_, DbPool>,
    batch_id: Option<i32>,
    space_id: Option<i32>,
    start_date: Option<String>,
    end_date: Option<String>,
) -> MyceliumResult<Vec<FarmingLog>> {
    let pool = &*state;

    let logs = query_as::<_, FarmingLog>(
        "SELECT * FROM farming_logs 
         WHERE ($1::INT IS NULL OR batch_id = $1)
           AND ($2::INT IS NULL OR space_id = $2)
           AND ($3::TEXT IS NULL OR log_date >= $3::DATE)
           AND ($4::TEXT IS NULL OR log_date <= $4::DATE)
         ORDER BY log_date DESC, log_id DESC",
    )
    .bind(batch_id)
    .bind(space_id)
    .bind(start_date)
    .bind(end_date)
    .fetch_all(pool)
    .await?;

    Ok(logs)
}

pub async fn save_farming_log(
    state: State<'_, DbPool>,
    username: &str,
    log: FarmingLog,
) -> MyceliumResult<()> {
    let pool = &*state;
    let mut tx = pool.begin().await?;
    crate::db::set_db_user_context(&mut *tx, username).await?;

    if log.log_id > 0 {
        query(
            "UPDATE farming_logs SET batch_id = $1, space_id = $2, log_date = $3, worker_name = $4, work_type = $5, work_content = $6, input_materials = $7, env_data = $8, photos = $9, updated_at = CURRENT_TIMESTAMP WHERE log_id = $10"
        )
        .bind(log.batch_id)
        .bind(log.space_id)
        .bind(log.log_date)
        .bind(&log.worker_name)
        .bind(&log.work_type)
        .bind(&log.work_content)
        .bind(&log.input_materials)
        .bind(&log.env_data)
        .bind(&log.photos)
        .bind(log.log_id)
        .execute(&mut *tx)
        .await?;
    } else {
        query(
            "INSERT INTO farming_logs (batch_id, space_id, log_date, worker_name, work_type, work_content, input_materials, env_data, photos) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)"
        )
        .bind(log.batch_id)
        .bind(log.space_id)
        .bind(log.log_date)
        .bind(&log.worker_name)
        .bind(&log.work_type)
        .bind(&log.work_content)
        .bind(&log.input_materials)
        .bind(&log.env_data)
        .bind(&log.photos)
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await?;
    Ok(())
}

pub async fn delete_farming_log(
    state: State<'_, DbPool>,
    username: &str,
    log_id: i32,
) -> MyceliumResult<()> {
    let pool = &*state;
    let mut tx = pool.begin().await?;
    crate::db::set_db_user_context(&mut *tx, username).await?;

    query("DELETE FROM farming_logs WHERE log_id = $1")
        .bind(log_id)
        .execute(&mut *tx)
        .await?;

    tx.commit().await?;
    Ok(())
}

#[derive(Deserialize)]
#[allow(non_snake_case)] // Allow mixed case if frontend sends camelCase
pub struct GetFarmingLogsRequest {
    pub batchId: Option<i32>,
    pub spaceId: Option<i32>,
    pub startDate: Option<String>,
    pub endDate: Option<String>,
}

pub async fn get_farming_logs_axum(
    AxumState(state): AxumState<AppState>,
    Query(params): Query<GetFarmingLogsRequest>,
) -> MyceliumResult<Json<Vec<FarmingLog>>> {
    let pool = &state.pool;

    let logs = query_as::<_, FarmingLog>(
        "SELECT * FROM farming_logs 
         WHERE ($1::INT IS NULL OR batch_id = $1)
           AND ($2::INT IS NULL OR space_id = $2)
           AND ($3::TEXT IS NULL OR log_date >= $3::DATE)
           AND ($4::TEXT IS NULL OR log_date <= $4::DATE)
         ORDER BY log_date DESC, log_id DESC",
    )
    .bind(params.batchId)
    .bind(params.spaceId)
    .bind(params.startDate)
    .bind(params.endDate)
    .fetch_all(pool)
    .await?;

    Ok(Json(logs))
}

pub async fn save_farming_log_axum(
    AxumState(state): AxumState<AppState>,
    Extension(claims): Extension<Claims>,
    Json(log): Json<FarmingLog>,
) -> MyceliumResult<Json<()>> {
    let username = claims.username.as_deref().unwrap_or("Admin");
    save_farming_log(crate::stubs::State::from(&state.pool), username, log).await?;
    Ok(Json(()))
}

#[derive(Deserialize)]
pub struct DeleteLogRequest {
    pub id: i32,
}

pub async fn delete_farming_log_body_axum(
    AxumState(state): AxumState<AppState>,
    Extension(claims): Extension<Claims>,
    Json(payload): Json<DeleteLogRequest>,
) -> MyceliumResult<Json<()>> {
    let username = claims.username.as_deref().unwrap_or("Admin");
    delete_farming_log(crate::stubs::State::from(&state.pool), username, payload.id).await?;
    Ok(Json(()))
}

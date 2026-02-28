use crate::db::{DbPool, ProductionBatch};
use crate::error::MyceliumResult;
use crate::middleware::auth::Claims;
use crate::state::AppState;
use crate::stubs::State;
use axum::extract::{Json, State as AxumState};
use axum::Extension;
use sqlx::{query, query_as};

pub async fn get_production_batches(
    state: State<'_, DbPool>,
) -> MyceliumResult<Vec<ProductionBatch>> {
    let pool = &*state;
    let batches =
        query_as::<_, ProductionBatch>("SELECT * FROM production_batches ORDER BY start_date DESC")
            .fetch_all(pool)
            .await?;
    Ok(batches)
}

pub async fn save_production_batch(
    state: State<'_, DbPool>,
    username: &str,
    batch: ProductionBatch,
) -> MyceliumResult<()> {
    let pool = &*state;
    let mut tx = pool.begin().await?;
    crate::db::set_db_user_context(&mut *tx, username).await?;

    if batch.batch_id > 0 {
        query(
            "UPDATE production_batches SET batch_code = $1, product_id = $2, space_id = $3, start_date = $4, end_date = $5, expected_harvest_date = $6, status = $7, initial_quantity = $8, unit = $9, updated_at = CURRENT_TIMESTAMP WHERE batch_id = $10"
        )
        .bind(&batch.batch_code)
        .bind(batch.product_id)
        .bind(batch.space_id)
        .bind(batch.start_date)
        .bind(batch.end_date)
        .bind(batch.expected_harvest_date)
        .bind(&batch.status)
        .bind(&batch.initial_quantity)
        .bind(&batch.unit)
        .bind(batch.batch_id)
        .execute(&mut *tx)
        .await?;
    } else {
        query(
            "INSERT INTO production_batches (batch_code, product_id, space_id, start_date, end_date, expected_harvest_date, status, initial_quantity, unit) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)"
        )
        .bind(&batch.batch_code)
        .bind(batch.product_id)
        .bind(batch.space_id)
        .bind(batch.start_date)
        .bind(batch.end_date)
        .bind(batch.expected_harvest_date)
        .bind(&batch.status)
        .bind(&batch.initial_quantity)
        .bind(&batch.unit)
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await?;
    Ok(())
}

pub async fn delete_production_batch(
    state: State<'_, DbPool>,
    username: &str,
    batch_id: i32,
) -> MyceliumResult<()> {
    let pool = &*state;
    let mut tx = pool.begin().await?;
    crate::db::set_db_user_context(&mut *tx, username).await?;

    query("DELETE FROM production_batches WHERE batch_id = $1")
        .bind(batch_id)
        .execute(&mut *tx)
        .await?;

    tx.commit().await?;
    Ok(())
}

pub async fn get_production_batches_axum(
    AxumState(state): AxumState<AppState>,
) -> MyceliumResult<Json<Vec<ProductionBatch>>> {
    let pool = &state.pool;
    let batches =
        query_as::<_, ProductionBatch>("SELECT * FROM production_batches ORDER BY start_date DESC")
            .fetch_all(pool)
            .await?;
    Ok(Json(batches))
}

pub async fn save_production_batch_axum(
    AxumState(state): AxumState<AppState>,
    Extension(claims): Extension<Claims>,
    Json(batch): Json<ProductionBatch>,
) -> MyceliumResult<Json<()>> {
    let username = claims.username.as_deref().unwrap_or("Admin");
    save_production_batch(crate::stubs::State::from(&state.pool), username, batch).await?;
    Ok(Json(()))
}

#[derive(serde::Deserialize)]
pub struct DeleteRequest {
    pub id: i32,
}

pub async fn delete_production_batch_body_axum(
    AxumState(state): AxumState<AppState>,
    Extension(claims): Extension<Claims>,
    Json(payload): Json<DeleteRequest>,
) -> MyceliumResult<Json<()>> {
    let username = claims.username.as_deref().unwrap_or("Admin");
    delete_production_batch(crate::stubs::State::from(&state.pool), username, payload.id).await?;
    Ok(Json(()))
}

use crate::db::{DbPool, FarmingLog};
use crate::error::MyceliumResult;
use sqlx::{query, query_as};
use tauri::{command, State};

#[command]
pub async fn get_farming_logs(
    state: State<'_, DbPool>,
    batch_id: Option<i32>,
    space_id: Option<i32>,
    start_date: Option<String>,
    end_date: Option<String>,
) -> MyceliumResult<Vec<FarmingLog>> {
    let pool = state.inner();

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

#[command]
pub async fn save_farming_log(state: State<'_, DbPool>, log: FarmingLog) -> MyceliumResult<()> {
    let pool = state.inner();
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
        .execute(pool)
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
        .execute(pool)
        .await?;
    }
    Ok(())
}

#[command]
pub async fn delete_farming_log(state: State<'_, DbPool>, log_id: i32) -> MyceliumResult<()> {
    let pool = state.inner();
    query("DELETE FROM farming_logs WHERE log_id = $1")
        .bind(log_id)
        .execute(pool)
        .await?;
    Ok(())
}

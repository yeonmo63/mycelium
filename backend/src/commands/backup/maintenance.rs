use crate::db::DbPool;
use crate::error::MyceliumResult;

// Using global stubs
use crate::stubs::{check_admin, AppHandle, State, TauriState};
use axum::extract::{Json, State as AxumState};

#[allow(dead_code)]
pub async fn reset_database(
    app: AppHandle,
    state: TauriState<'_, DbPool>,
) -> MyceliumResult<String> {
    let _ = app;
    internal_reset_database(&state).await
}

pub async fn reset_database_axum(
    AxumState(state): AxumState<crate::state::AppState>,
) -> MyceliumResult<Json<String>> {
    let msg = internal_reset_database(&state.pool).await?;
    Ok(Json(msg))
}

async fn internal_reset_database(pool: &sqlx::Pool<sqlx::Postgres>) -> MyceliumResult<String> {
    let mut conn = pool.acquire().await?;

    // List of tables to truncate (preserving schema)
    let tables = vec![
        "sales",
        "inventory_logs",
        "customer_ledger",
        "customers",
        "customer_addresses",
        "experience_reservations",
        "expenses",
        "purchases",
        "consultations",
        "farming_logs",
        "harvest_records",
        "production_batches",
        "deletion_log",
        "experience_programs",
        "product_price_history",
        "product_bom",
        "products",
        "production_spaces",
        "custom_presets",
        "vendors",
        "event",
        "schedules",
        "sensor_readings",
        "sensors",
        "sms_logs",
        "customer_logs",
        "system_logs",
    ];

    for table in tables {
        sqlx::query(&format!("TRUNCATE TABLE {} CASCADE", table))
            .execute(&mut *conn)
            .await?;
    }

    Ok("데이터베이스가 초기화되었습니다.".to_string())
}

pub async fn cleanup_old_logs(
    app: AppHandle,
    state: State<'_, DbPool>,
    months: i32,
) -> MyceliumResult<u64> {
    check_admin(&app)?;
    let pool = &*state;
    let mut total_deleted = 0;

    let target_date = chrono::Local::now()
        .naive_local()
        .checked_sub_months(chrono::Months::new(months as u32))
        .unwrap_or_default();

    // Cleanup deletion log older than N months
    let res: sqlx::postgres::PgQueryResult =
        sqlx::query("DELETE FROM deletion_log WHERE deleted_at < $1")
            .bind(target_date)
            .execute(pool)
            .await?;
    total_deleted += res.rows_affected();

    // Cleanup inventory logs older than N months
    let res: sqlx::postgres::PgQueryResult =
        sqlx::query("DELETE FROM inventory_logs WHERE created_at < $1")
            .bind(target_date)
            .execute(pool)
            .await?;
    total_deleted += res.rows_affected();

    // Cleanup system audit logs older than N months
    let res: sqlx::postgres::PgQueryResult =
        sqlx::query("DELETE FROM system_logs WHERE created_at < $1")
            .bind(target_date)
            .execute(pool)
            .await?;
    total_deleted += res.rows_affected();

    // Cleanup sensor readings older than N months
    let res: sqlx::postgres::PgQueryResult =
        sqlx::query("DELETE FROM sensor_readings WHERE recorded_at < $1")
            .bind(target_date)
            .execute(pool)
            .await?;
    total_deleted += res.rows_affected();

    // Cleanup SMS logs older than N months
    let res: sqlx::postgres::PgQueryResult = sqlx::query("DELETE FROM sms_logs WHERE sent_at < $1")
        .bind(target_date)
        .execute(pool)
        .await?;
    total_deleted += res.rows_affected();
    Ok(total_deleted)
}

pub async fn run_db_maintenance(
    app: AppHandle,
    state: State<'_, DbPool>,
) -> MyceliumResult<String> {
    check_admin(&app)?;
    let pool = &*state;
    let mut conn = pool.acquire().await?;

    // 1. Vacuum analyze
    sqlx::query("VACUUM ANALYZE").execute(&mut *conn).await?;

    // 2. Reindex (Optional, can be slow)
    // sqlx::query("REINDEX DATABASE mycelium").execute(&mut *conn).await?;

    Ok("데이터베이스 최적화가 완료되었습니다.".to_string())
}

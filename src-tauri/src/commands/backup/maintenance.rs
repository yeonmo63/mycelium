use crate::db::DbPool;
use crate::error::MyceliumResult;
use tauri::{command, State};

#[command]
pub async fn reset_database(state: State<'_, DbPool>) -> MyceliumResult<String> {
    let pool = state.inner();
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
    ];

    for table in tables {
        sqlx::query(&format!("TRUNCATE TABLE {} CASCADE", table))
            .execute(&mut *conn)
            .await?;
    }

    Ok("데이터베이스가 초기화되었습니다.".to_string())
}

#[command]
pub async fn cleanup_old_logs(state: State<'_, DbPool>, months: i32) -> MyceliumResult<u64> {
    let pool = state.inner();
    let mut total_deleted = 0;

    let target_date = chrono::Local::now()
        .naive_local()
        .checked_sub_months(chrono::Months::new(months as u32))
        .unwrap_or_default();

    // Cleanup deletion log older than N months
    let res = sqlx::query("DELETE FROM deletion_log WHERE deleted_at < $1")
        .bind(target_date)
        .execute(pool)
        .await?;
    total_deleted += res.rows_affected();

    // Cleanup inventory logs older than N months
    let res = sqlx::query("DELETE FROM inventory_logs WHERE created_at < $1")
        .bind(target_date)
        .execute(pool)
        .await?;
    total_deleted += res.rows_affected();

    Ok(total_deleted)
}

#[command]
pub async fn run_db_maintenance(state: State<'_, DbPool>) -> MyceliumResult<String> {
    let pool = state.inner();
    let mut conn = pool.acquire().await?;

    // 1. Vacuum analyze
    sqlx::query("VACUUM ANALYZE").execute(&mut *conn).await?;

    // 2. Reindex (Optional, can be slow)
    // sqlx::query("REINDEX DATABASE mycelium").execute(&mut *conn).await?;

    Ok("데이터베이스 최적화가 완료되었습니다.".to_string())
}

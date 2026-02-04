use crate::db::{DbPool, FarmingLog, HarvestRecord, ProductionBatch, ProductionSpace};
use crate::error::MyceliumResult;
use crate::DB_MODIFIED;
use std::sync::atomic::Ordering;
use tauri::{command, State};

// --- Production Spaces ---

#[command]
pub async fn get_production_spaces(
    state: State<'_, DbPool>,
) -> MyceliumResult<Vec<ProductionSpace>> {
    Ok(sqlx::query_as::<_, ProductionSpace>(
        "SELECT * FROM production_spaces ORDER BY space_name ASC",
    )
    .fetch_all(&*state)
    .await?)
}

#[command]
pub async fn save_production_space(
    state: State<'_, DbPool>,
    space: ProductionSpace,
) -> MyceliumResult<()> {
    DB_MODIFIED.store(true, Ordering::Relaxed);
    if space.space_id > 0 {
        sqlx::query("UPDATE production_spaces SET space_name=$1, space_type=$2, location_info=$3, area_size=$4, area_unit=$5, is_active=$6, memo=$7 WHERE space_id=$8")
            .bind(space.space_name)
            .bind(space.space_type)
            .bind(space.location_info)
            .bind(space.area_size)
            .bind(space.area_unit)
            .bind(space.is_active)
            .bind(space.memo)
            .bind(space.space_id)
            .execute(&*state).await?;
    } else {
        sqlx::query("INSERT INTO production_spaces (space_name, space_type, location_info, area_size, area_unit, is_active, memo) VALUES ($1,$2,$3,$4,$5,$6,$7)")
            .bind(space.space_name)
            .bind(space.space_type)
            .bind(space.location_info)
            .bind(space.area_size)
            .bind(space.area_unit)
            .bind(space.is_active)
            .bind(space.memo)
            .execute(&*state).await?;
    }
    Ok(())
}

#[command]
pub async fn delete_production_space(
    state: State<'_, DbPool>,
    space_id: i32,
) -> MyceliumResult<()> {
    DB_MODIFIED.store(true, Ordering::Relaxed);
    sqlx::query("DELETE FROM production_spaces WHERE space_id = $1")
        .bind(space_id)
        .execute(&*state)
        .await?;
    Ok(())
}

// --- Production Batches ---

#[command]
pub async fn get_production_batches(
    state: State<'_, DbPool>,
) -> MyceliumResult<Vec<ProductionBatch>> {
    Ok(sqlx::query_as::<_, ProductionBatch>(
        "SELECT * FROM production_batches ORDER BY start_date DESC",
    )
    .fetch_all(&*state)
    .await?)
}

#[command]
pub async fn save_production_batch(
    state: State<'_, DbPool>,
    batch: ProductionBatch,
) -> MyceliumResult<()> {
    DB_MODIFIED.store(true, Ordering::Relaxed);
    if batch.batch_id > 0 {
        sqlx::query("UPDATE production_batches SET batch_code=$1, product_id=$2, space_id=$3, start_date=$4, end_date=$5, expected_harvest_date=$6, status=$7, initial_quantity=$8, unit=$9 WHERE batch_id=$10")
            .bind(batch.batch_code).bind(batch.product_id).bind(batch.space_id).bind(batch.start_date).bind(batch.end_date).bind(batch.expected_harvest_date).bind(batch.status).bind(batch.initial_quantity).bind(batch.unit).bind(batch.batch_id)
            .execute(&*state).await?;
    } else {
        sqlx::query("INSERT INTO production_batches (batch_code, product_id, space_id, start_date, end_date, expected_harvest_date, status, initial_quantity, unit) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)")
            .bind(batch.batch_code).bind(batch.product_id).bind(batch.space_id).bind(batch.start_date).bind(batch.end_date).bind(batch.expected_harvest_date).bind(batch.status).bind(batch.initial_quantity).bind(batch.unit)
            .execute(&*state).await?;
    }
    Ok(())
}

// --- Farming Logs ---

#[command]
pub async fn get_farming_logs(
    state: State<'_, DbPool>,
    batch_id: Option<i32>,
    space_id: Option<i32>,
) -> MyceliumResult<Vec<FarmingLog>> {
    let mut query = String::from("SELECT * FROM farming_logs WHERE 1=1");
    if batch_id.is_some() {
        query.push_str(" AND batch_id = $1");
    }
    if space_id.is_some() {
        query.push_str(" AND space_id = $2");
    }
    query.push_str(" ORDER BY log_date DESC, created_at DESC");

    let mut q = sqlx::query_as::<_, FarmingLog>(&query);
    if let Some(bid) = batch_id {
        q = q.bind(bid);
    }
    if let Some(sid) = space_id {
        q = q.bind(sid);
    }

    Ok(q.fetch_all(&*state).await?)
}

#[command]
pub async fn save_farming_log(state: State<'_, DbPool>, log: FarmingLog) -> MyceliumResult<()> {
    DB_MODIFIED.store(true, Ordering::Relaxed);
    if log.log_id > 0 {
        sqlx::query("UPDATE farming_logs SET batch_id=$1, space_id=$2, log_date=$3, worker_name=$4, work_type=$5, work_content=$6, input_materials=$7, env_data=$8, photos=$9 WHERE log_id=$10")
            .bind(log.batch_id).bind(log.space_id).bind(log.log_date).bind(log.worker_name).bind(log.work_type).bind(log.work_content).bind(log.input_materials).bind(log.env_data).bind(log.photos).bind(log.log_id)
            .execute(&*state).await?;
    } else {
        sqlx::query("INSERT INTO farming_logs (batch_id, space_id, log_date, worker_name, work_type, work_content, input_materials, env_data, photos) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)")
            .bind(log.batch_id).bind(log.space_id).bind(log.log_date).bind(log.worker_name).bind(log.work_type).bind(log.work_content).bind(log.input_materials).bind(log.env_data).bind(log.photos)
            .execute(&*state).await?;
    }
    Ok(())
}

use rust_decimal::prelude::ToPrimitive;

// --- Harvest Records ---

#[command]
pub async fn get_harvest_records(
    state: State<'_, DbPool>,
    batch_id: Option<i32>,
) -> MyceliumResult<Vec<HarvestRecord>> {
    let sql = if batch_id.is_some() {
        "SELECT * FROM harvest_records WHERE batch_id = $1 ORDER BY harvest_date DESC"
    } else {
        "SELECT * FROM harvest_records ORDER BY harvest_date DESC"
    };

    let mut q = sqlx::query_as::<_, HarvestRecord>(sql);
    if let Some(bid) = batch_id {
        q = q.bind(bid);
    }

    Ok(q.fetch_all(&*state).await?)
}

#[command]
pub async fn save_harvest_record(
    state: State<'_, DbPool>,
    record: HarvestRecord,
    complete_batch: bool,
) -> MyceliumResult<()> {
    let mut tx = state.begin().await?;

    // 1. Insert harvest record
    sqlx::query("INSERT INTO harvest_records (batch_id, harvest_date, quantity, unit, grade, traceability_code, memo) VALUES ($1,$2,$3,$4,$5,$6,$7)")
        .bind(record.batch_id).bind(record.harvest_date).bind(record.quantity).bind(&record.unit).bind(record.grade).bind(record.traceability_code).bind(record.memo)
        .execute(&mut *tx).await?;

    // 2. Find product_id from batch
    let batch_info: (Option<i32>,) =
        sqlx::query_as("SELECT product_id FROM production_batches WHERE batch_id = $1")
            .bind(record.batch_id)
            .fetch_one(&mut *tx)
            .await?;

    if let Some(product_id) = batch_info.0 {
        let qty = record.quantity;
        let qty_i32 = qty.to_i32().unwrap_or(0);

        // 3. Update product stock
        let updated: (i32,) = sqlx::query_as("UPDATE products SET stock_quantity = COALESCE(stock_quantity, 0) + $1 WHERE product_id = $2 RETURNING stock_quantity")
            .bind(qty_i32)
            .bind(product_id)
            .fetch_one(&mut *tx).await?;
        let current_stock = updated.0;

        // 4. Log inventory
        sqlx::query("INSERT INTO inventory_logs (product_id, product_name, specification, product_code, change_type, change_quantity, current_stock, memo, reference_id) 
                     SELECT p.product_id, p.product_name, p.specification, p.product_code, '생산입고', $1, $2, $3, 'PROCESS' FROM products p WHERE p.product_id = $4")
            .bind(qty_i32)
            .bind(current_stock)
            .bind(format!("배치 {} 수확 입고 (단위: {})", record.batch_id.unwrap_or(0), record.unit))
            .bind(product_id)
            .execute(&mut *tx).await?;
    }

    // 5. Update batch status if requested
    if complete_batch {
        sqlx::query(
            "UPDATE production_batches SET status = 'completed', end_date = $1 WHERE batch_id = $2",
        )
        .bind(record.harvest_date)
        .bind(record.batch_id)
        .execute(&mut *tx)
        .await?;
    }

    tx.commit().await?;
    DB_MODIFIED.store(true, Ordering::Relaxed);
    Ok(())
}

#[command]
pub async fn delete_production_batch(
    state: State<'_, DbPool>,
    batch_id: i32,
) -> MyceliumResult<()> {
    DB_MODIFIED.store(true, Ordering::Relaxed);
    sqlx::query("DELETE FROM production_batches WHERE batch_id = $1")
        .bind(batch_id)
        .execute(&*state)
        .await?;
    Ok(())
}

#[command]
pub async fn delete_farming_log(state: State<'_, DbPool>, log_id: i32) -> MyceliumResult<()> {
    DB_MODIFIED.store(true, Ordering::Relaxed);
    sqlx::query("DELETE FROM farming_logs WHERE log_id = $1")
        .bind(log_id)
        .execute(&*state)
        .await?;
    Ok(())
}

#[command]
pub async fn delete_harvest_record(
    state: State<'_, DbPool>,
    harvest_id: i32,
) -> MyceliumResult<()> {
    DB_MODIFIED.store(true, Ordering::Relaxed);
    sqlx::query("DELETE FROM harvest_records WHERE harvest_id = $1")
        .bind(harvest_id)
        .execute(&*state)
        .await?;
    Ok(())
}

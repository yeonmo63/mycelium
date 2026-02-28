use crate::db::{DbPool, HarvestRecord};
use crate::error::MyceliumResult;
use sqlx::{query, query_as};
use crate::stubs::State;
use crate::state::AppState;
use axum::extract::{State as AxumState, Json, Query};
use axum::Extension;
use crate::middleware::auth::Claims;
use serde::Deserialize;


pub async fn get_harvest_records(
    state: State<'_, DbPool>,
    batch_id: Option<i32>,
) -> MyceliumResult<Vec<HarvestRecord>> {
    let pool = &*state;
    let records = if let Some(bid) = batch_id {
        query_as::<_, HarvestRecord>(
            "SELECT * FROM harvest_records WHERE batch_id = $1 ORDER BY harvest_date DESC",
        )
        .bind(bid)
        .fetch_all(pool)
        .await?
    } else {
        query_as::<_, HarvestRecord>(
            "SELECT * FROM harvest_records ORDER BY harvest_date DESC LIMIT 50",
        )
        .fetch_all(pool)
        .await?
    };
    Ok(records)
}


pub async fn save_harvest_record(
    state: State<'_, DbPool>,
    username: &str,
    record: HarvestRecord,
    complete_batch: Option<bool>,
) -> MyceliumResult<()> {
    let pool = &*state;
    let mut tx = pool.begin().await?;
    crate::db::set_db_user_context(&mut *tx, username).await?;

    // 1. Get Product ID from Batch
    let batch_info: (i32, String) =
        sqlx::query_as("SELECT product_id, batch_code FROM production_batches WHERE batch_id = $1")
            .bind(record.batch_id)
            .fetch_one(&mut *tx)
            .await?;

    let product_id = batch_info.0;
    let b_code = batch_info.1;

    // 2. Save Harvest Record
    let def_qty = record.defective_quantity.unwrap_or(rust_decimal::Decimal::ZERO);
    let loss_qty = record.loss_quantity.unwrap_or(rust_decimal::Decimal::ZERO);

    if record.harvest_id > 0 {
        sqlx::query(
            "UPDATE harvest_records SET 
                batch_id = $1, harvest_date = $2, quantity = $3, unit = $4, grade = $5, 
                traceability_code = $6, memo = $7, package_count = $8, weight_per_package = $9, 
                package_unit = $10, defective_quantity = $11, loss_quantity = $12, updated_at = CURRENT_TIMESTAMP WHERE harvest_id = $13",
        )
        .bind(record.batch_id)
        .bind(record.harvest_date)
        .bind(&record.quantity)
        .bind(&record.unit)
        .bind(&record.grade)
        .bind(&record.traceability_code)
        .bind(&record.memo)
        .bind(record.package_count)
        .bind(&record.weight_per_package)
        .bind(&record.package_unit)
        .bind(&def_qty)
        .bind(&loss_qty)
        .bind(record.harvest_id)
        .execute(&mut *tx)
        .await?;
    } else {
        sqlx::query(
            "INSERT INTO harvest_records (
                batch_id, harvest_date, quantity, unit, grade, traceability_code, memo, 
                package_count, weight_per_package, package_unit, defective_quantity, loss_quantity
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)",
        )
        .bind(record.batch_id)
        .bind(record.harvest_date)
        .bind(&record.quantity)
        .bind(&record.unit)
        .bind(&record.grade)
        .bind(&record.traceability_code)
        .bind(&record.memo)
        .bind(record.package_count)
        .bind(&record.weight_per_package)
        .bind(&record.package_unit)
        .bind(&def_qty)
        .bind(&loss_qty)
        .execute(&mut *tx)
        .await?;
    }

    // 3. Update Product Stock and Logs (Only for NEW records to avoid double counting)
    if record.harvest_id == 0 {
        apply_harvest_inventory_changes(&mut tx, product_id, &b_code, &record).await?;
    }

    // 4. Handle Batch Completion
    if complete_batch.unwrap_or(false) {
        sqlx::query(
            "UPDATE production_batches SET status = 'completed', end_date = $1 WHERE batch_id = $2",
        )
        .bind(record.harvest_date)
        .bind(record.batch_id)
        .execute(&mut *tx)
        .await?;
    }

    tx.commit().await?;
    Ok(())
}


pub async fn save_harvest_batch(
    state: State<'_, DbPool>,
    username: &str,
    records: Vec<HarvestRecord>,
) -> MyceliumResult<()> {
    let pool = &*state;
    let mut tx = pool.begin().await?;
    crate::db::set_db_user_context(&mut *tx, username).await?;

    for record in records {
        // 1. Get Product ID from Batch
        let batch_info: (i32, String) = sqlx::query_as(
            "SELECT product_id, batch_code FROM production_batches WHERE batch_id = $1",
        )
        .bind(record.batch_id)
        .fetch_one(&mut *tx)
        .await?;

        let product_id = batch_info.0;
        let b_code = batch_info.1;

        let def_qty = record.defective_quantity.unwrap_or(rust_decimal::Decimal::ZERO);
        let loss_qty = record.loss_quantity.unwrap_or(rust_decimal::Decimal::ZERO);

        // 2. Insert Harvest Record
        sqlx::query(
            "INSERT INTO harvest_records (
                batch_id, harvest_date, quantity, unit, grade, traceability_code, memo, 
                package_count, weight_per_package, package_unit, defective_quantity, loss_quantity
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)",
        )
        .bind(record.batch_id)
        .bind(record.harvest_date)
        .bind(&record.quantity)
        .bind(&record.unit)
        .bind(&record.grade)
        .bind(&record.traceability_code)
        .bind(&record.memo)
        .bind(record.package_count)
        .bind(&record.weight_per_package)
        .bind(&record.package_unit)
        .bind(&def_qty)
        .bind(&loss_qty)
        .execute(&mut *tx)
        .await?;

        // 3. Update Product Stock and Logs
        apply_harvest_inventory_changes(&mut tx, product_id, &b_code, &record).await?;
    }

    tx.commit().await?;
    Ok(())
}


pub async fn delete_harvest_record(
    state: State<'_, DbPool>,
    username: &str,
    harvest_id: i32,
) -> MyceliumResult<()> {
    let pool = &*state;
    let mut tx = pool.begin().await?;
    crate::db::set_db_user_context(&mut *tx, username).await?;

    query("DELETE FROM harvest_records WHERE harvest_id = $1")
        .bind(harvest_id)
        .execute(&mut *tx)
        .await?;
    
    tx.commit().await?;
    Ok(())
}

#[derive(Deserialize)]
#[allow(non_snake_case)]
pub struct GetHarvestRecordsRequest {
    pub batchId: Option<i32>,
}

pub async fn get_harvest_records_axum(
    AxumState(state): AxumState<AppState>,
    Query(params): Query<GetHarvestRecordsRequest>,
) -> MyceliumResult<Json<Vec<HarvestRecord>>> {
    let pool = &state.pool;
    let records = if let Some(bid) = params.batchId {
        query_as::<_, HarvestRecord>(
            "SELECT * FROM harvest_records WHERE batch_id = $1 ORDER BY harvest_date DESC",
        )
        .bind(bid)
        .fetch_all(pool)
        .await?
    } else {
        query_as::<_, HarvestRecord>(
            "SELECT * FROM harvest_records ORDER BY harvest_date DESC LIMIT 50",
        )
        .fetch_all(pool)
        .await?
    };
    Ok(Json(records))
}

#[derive(Deserialize)]
#[allow(non_snake_case)]
pub struct SaveHarvestRecordRequest {
    pub record: HarvestRecord,
    pub completeBatch: Option<bool>,
}

pub async fn save_harvest_record_axum(
    AxumState(state): AxumState<AppState>,
    Extension(claims): Extension<Claims>,
    Json(payload): Json<SaveHarvestRecordRequest>,
) -> MyceliumResult<Json<()>> {
    let username = claims.username.as_deref().unwrap_or("Admin");
    save_harvest_record(
        crate::stubs::State::from(&state.pool),
        username,
        payload.record,
        payload.completeBatch,
    )
    .await?;
    Ok(Json(()))
}

#[derive(Deserialize)]
pub struct DeleteHarvestRequest {
    pub harvestId: i32,
}

pub async fn delete_harvest_record_body_axum(
    AxumState(state): AxumState<AppState>,
    Extension(claims): Extension<Claims>,
    Json(payload): Json<DeleteHarvestRequest>,
) -> MyceliumResult<Json<()>> {
    let username = claims.username.as_deref().unwrap_or("Admin");
    delete_harvest_record(
        crate::stubs::State::from(&state.pool),
        username,
        payload.harvestId,
    )
    .await?;
    Ok(Json(()))
}

async fn apply_harvest_inventory_changes(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    product_id: i32,
    batch_code: &str,
    record: &HarvestRecord,
) -> MyceliumResult<()> {
    let qty_f64: f64 = record.quantity.to_string().parse().unwrap_or(0.0);
    let def_qty_f64: f64 = record.defective_quantity.unwrap_or(rust_decimal::Decimal::ZERO).to_string().parse().unwrap_or(0.0);
    let loss_qty_f64: f64 = record.loss_quantity.unwrap_or(rust_decimal::Decimal::ZERO).to_string().parse().unwrap_or(0.0);

    // 1. Update Main Product Stock
    sqlx::query(
        "UPDATE products SET stock_quantity = stock_quantity + $1 WHERE product_id = $2",
    )
    .bind(qty_f64 as i32)
    .bind(product_id)
    .execute(&mut **tx)
    .await?;

    let product: (String, Option<String>) =
        sqlx::query_as("SELECT product_name, specification FROM products WHERE product_id = $1")
            .bind(product_id)
            .fetch_one(&mut **tx)
            .await?;

    // Log Main Product (Standard)
    sqlx::query(
        "INSERT INTO inventory_logs (product_id, product_name, specification, change_type, change_quantity, current_stock, memo, reference_id) 
         VALUES ($1, $2, $3, '입고', $4, (SELECT stock_quantity FROM products WHERE product_id = $1), $5, $6)"
    )
    .bind(product_id)
    .bind(&product.0)
    .bind(&product.1)
    .bind(qty_f64 as i32)
    .bind(format!("수확 입고 [정품] (배치: {})", batch_code))
    .bind(format!("HARVEST_{}", batch_code))
    .execute(&mut **tx).await?;

    // Log Non-standard (Defective)
    if def_qty_f64 > 0.0 {
        sqlx::query(
            "INSERT INTO inventory_logs (product_id, product_name, specification, change_type, change_quantity, current_stock, memo, reference_id) 
             VALUES ($1, $2, $3, '비상품', $4, (SELECT stock_quantity FROM products WHERE product_id = $1), $5, $6)"
        )
        .bind(product_id)
        .bind(&product.0)
        .bind(&product.1)
        .bind(def_qty_f64 as i32)
        .bind(0) 
        .bind(format!("수확 발생 [비상품/파지] (배치: {})", batch_code))
        .bind(format!("HARVEST_NON_{}", batch_code))
        .execute(&mut **tx).await?;
    }

    // Log Loss
    if loss_qty_f64 > 0.0 {
        sqlx::query(
            "INSERT INTO inventory_logs (product_id, product_name, specification, change_type, change_quantity, current_stock, memo, reference_id) 
             VALUES ($1, $2, $3, '손실', $4, (SELECT stock_quantity FROM products WHERE product_id = $1), $5, $6)"
        )
        .bind(product_id)
        .bind(&product.0)
        .bind(&product.1)
        .bind(-(loss_qty_f64 as i32))
        .bind(0) 
        .bind(format!("수확 중 손실 발생 (배치: {})", batch_code))
        .bind(format!("HARVEST_LOSS_{}", batch_code))
        .execute(&mut **tx).await?;
    }

    // 2. Handle BOM deduction for auxiliary materials
    // Fetch BOM items
    let bom_items: Vec<(i32, f64)> = sqlx::query_as("SELECT material_id, ratio FROM product_bom WHERE product_id = $1")
        .bind(product_id)
        .fetch_all(&mut **tx)
        .await?;

    let reference_id = format!("HARVEST_{}", batch_code);

    if !bom_items.is_empty() {
        for (mat_id, ratio) in bom_items {
            let deduction = (qty_f64 * ratio).ceil() as i32;
            if deduction == 0 { continue; }

            // Deduct from stock
            let mat_info: (String, Option<String>, i32) = sqlx::query_as(
                "UPDATE products SET stock_quantity = stock_quantity - $1 WHERE product_id = $2 RETURNING product_name, specification, stock_quantity"
            )
            .bind(deduction)
            .bind(mat_id)
            .fetch_one(&mut **tx)
            .await?;

            // Log change
            sqlx::query(
                "INSERT INTO inventory_logs (product_id, product_name, specification, change_type, change_quantity, current_stock, reference_id, memo)
                 VALUES ($1, $2, $3, '출고', $4, $5, $6, $7)"
            )
            .bind(mat_id)
            .bind(&mat_info.0)
            .bind(&mat_info.1)
            .bind(-deduction)
            .bind(mat_info.2)
            .bind(&reference_id)
            .bind(format!("수확 시 부자재 자동 차감 (제품: {})", product.0))
            .execute(&mut **tx)
            .await?;
        }
    } else {
        // Fallback to legacy Auxiliary Material (single item)
        let legacy_aux: Option<(i32, f64)> = sqlx::query_as("SELECT aux_material_id, aux_material_ratio FROM products WHERE product_id = $1 AND aux_material_id IS NOT NULL")
            .bind(product_id)
            .fetch_optional(&mut **tx)
            .await?;

        if let Some((mat_id, ratio)) = legacy_aux {
            let deduction = (qty_f64 * ratio).ceil() as i32;
            if deduction > 0 {
                let mat_info: (String, Option<String>, i32) = sqlx::query_as(
                    "UPDATE products SET stock_quantity = stock_quantity - $1 WHERE product_id = $2 RETURNING product_name, specification, stock_quantity"
                )
                .bind(deduction)
                .bind(mat_id)
                .fetch_one(&mut **tx)
                .await?;

                sqlx::query(
                    "INSERT INTO inventory_logs (product_id, product_name, specification, change_type, change_quantity, current_stock, reference_id, memo)
                     VALUES ($1, $2, $3, '출고', $4, $5, $6, $7)"
                )
                .bind(mat_id)
                .bind(&mat_info.0)
                .bind(&mat_info.1)
                .bind(-deduction)
                .bind(mat_info.2)
                .bind(&reference_id)
                .bind(format!("수확 시 부자재 자동 차감 (Legacy, 제품: {})", product.0))
                .execute(&mut **tx)
                .await?;
            }
        }
    }

    Ok(())
}

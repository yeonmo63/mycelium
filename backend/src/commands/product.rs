#![allow(non_snake_case)]
use crate::db::{
    DbPool, InventoryAlert, InventoryLog, Product, ProductHistoryItem, ProductPriceHistory,
};
use crate::error::{MyceliumError, MyceliumResult};
use crate::DB_MODIFIED;
use chrono::NaiveDateTime;
use sqlx;
use std::sync::atomic::Ordering;
// Using global stubs
use crate::stubs::{AppHandle, State as TauriState, command, check_admin};
use crate::commands::config::check_admin as config_check_admin;
use axum::extract::{State as AxumState, Json};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};


#[allow(dead_code)]
pub async fn get_product_list(state: TauriState<'_, DbPool>) -> MyceliumResult<Vec<Product>> {
    let products = sqlx::query_as::<_, Product>("SELECT * FROM products ORDER BY product_name")
        .fetch_all(&*state)
        .await?;

    Ok(products)
}

// Axum Handler
pub async fn get_product_list_axum(AxumState(state): AxumState<crate::state::AppState>) -> MyceliumResult<Json<Vec<Product>>> {
    let products = sqlx::query_as::<_, Product>("SELECT * FROM products ORDER BY product_name")
        .fetch_all(&state.pool)
        .await?;
    tracing::info!("Fetched {} products from database", products.len());
    Ok(Json(products))
}


#[derive(serde::Serialize, sqlx::FromRow)]
pub struct ProductFreshness {
    pub product_id: i32,
    pub product_name: String,
    pub stock_quantity: i32,
    pub last_in_date: Option<NaiveDateTime>,
}


pub async fn get_product_freshness(
    state: TauriState<'_, DbPool>,
) -> MyceliumResult<Vec<ProductFreshness>> {
    let rows = sqlx::query_as::<_, ProductFreshness>(
        r#"
        SELECT p.product_id, p.product_name, p.stock_quantity, MAX(l.created_at) as last_in_date 
        FROM products p
        LEFT JOIN inventory_logs l ON p.product_id = l.product_id AND l.change_quantity > 0
        WHERE p.status != '단종상품'
        GROUP BY p.product_id
        HAVING p.stock_quantity > 0
        "#,
    )
    .fetch_all(&*state)
    .await?;

    Ok(rows)
}


pub async fn get_discontinued_product_names(
    pool: TauriState<'_, DbPool>,
) -> MyceliumResult<Vec<String>> {
    let sql = r#"
        SELECT product_name FROM (
            SELECT DISTINCT product_name FROM sales
            UNION
            SELECT DISTINCT product_name FROM inventory_logs
        ) AS combined
        WHERE NOT EXISTS (
            SELECT 1 FROM products p WHERE p.product_name = combined.product_name
        )
        ORDER BY product_name
    "#;

    let rows = sqlx::query_scalar::<_, String>(sql)
        .fetch_all(&*pool)
        .await?;

    Ok(rows)
}


pub async fn consolidate_products(
    _app: AppHandle,
    pool: TauriState<'_, DbPool>,
    oldProductId: i32,
    newProductId: i32,
    syncNames: Option<bool>,
) -> MyceliumResult<()> {
    // config_check_admin(&app)?;
    let mut tx = pool.begin().await?;
    let sync = syncNames.unwrap_or(false);

    let old_p: Product = sqlx::query_as("SELECT * FROM products WHERE product_id = $1")
        .bind(oldProductId)
        .fetch_one(&mut *tx)
        .await?;

    let new_p: Product = sqlx::query_as("SELECT * FROM products WHERE product_id = $1")
        .bind(newProductId)
        .fetch_one(&mut *tx)
        .await?;

    if sync {
        sqlx::query(
            "UPDATE sales SET product_id = $1, product_name = $2, specification = $3, product_code = $4 
             WHERE product_id = $5 OR (product_id IS NULL AND product_name = $6 AND specification IS NOT DISTINCT FROM $7)"
        )
        .bind(newProductId).bind(&new_p.product_name).bind(&new_p.specification).bind(&new_p.product_code)
        .bind(oldProductId).bind(&old_p.product_name).bind(&old_p.specification)
        .execute(&mut *tx).await?;

        sqlx::query(
            "UPDATE inventory_logs SET product_id = $1, product_name = $2, specification = $3, product_code = $4 
             WHERE product_id = $5 OR (product_id IS NULL AND product_name = $6 AND specification IS NOT DISTINCT FROM $7)"
        )
        .bind(newProductId).bind(&new_p.product_name).bind(&new_p.specification).bind(&new_p.product_code)
        .bind(oldProductId).bind(&old_p.product_name).bind(&old_p.specification)
        .execute(&mut *tx).await?;
    } else {
        sqlx::query(
            "UPDATE sales SET product_id = $1 
             WHERE product_id = $2",
        )
        .bind(newProductId)
        .bind(oldProductId)
        .execute(&mut *tx)
        .await?;

        sqlx::query(
            "UPDATE inventory_logs SET product_id = $1 
             WHERE product_id = $2",
        )
        .bind(newProductId)
        .bind(oldProductId)
        .execute(&mut *tx)
        .await?;
    }

    let old_qty = old_p.stock_quantity.unwrap_or(0);
    if old_qty != 0 {
        sqlx::query(
            "UPDATE products SET stock_quantity = stock_quantity + $1 WHERE product_id = $2",
        )
        .bind(old_qty)
        .bind(newProductId)
        .execute(&mut *tx)
        .await?;

        sqlx::query(
            "INSERT INTO inventory_logs (product_id, product_name, specification, product_code, change_type, change_quantity, current_stock, memo) 
             VALUES ($1, $2, $3, $4, '조정', $5, (SELECT stock_quantity FROM products WHERE product_id = $1), $6)"
        )
        .bind(newProductId)
        .bind(&new_p.product_name)
        .bind(&new_p.specification)
        .bind(&new_p.product_code)
        .bind(old_qty)
        .bind(format!("상품 병합으로 인한 재고 흡수 (원본: {} [{}])", old_p.product_name, oldProductId))
        .execute(&mut *tx)
        .await?;
    }

    sqlx::query("UPDATE products SET status = '단종상품', memo = COALESCE(memo, '') || $1 WHERE product_id = $2")
        .bind(format!(" | {}에 상품 ID:{}로 병합됨", chrono::Local::now().format("%Y-%m-%d"), newProductId))
        .bind(oldProductId)
        .execute(&mut *tx)
        .await?;

    tx.commit().await?;
    Ok(())
}


pub async fn create_product(
    app: AppHandle,
    state: TauriState<'_, DbPool>,
    productName: String,
    specification: Option<String>,
    unitPrice: i32,
    stockQuantity: Option<i32>,
    safetyStock: Option<i32>,
    costPrice: Option<i32>,
    materialId: Option<i32>,
    materialRatio: Option<f64>,
    auxMaterialId: Option<i32>,
    auxMaterialRatio: Option<f64>,
    itemType: Option<String>,
    productCode: Option<String>,
    category: Option<String>,
    taxType: Option<String>,
    taxExemptValue: Option<i32>,
) -> MyceliumResult<i32> {
    // config_check_admin(&app)?;
    DB_MODIFIED.store(true, Ordering::Relaxed);
    let mut tx = state.begin().await?;

    let row: (i32,) = sqlx::query_as(
        "INSERT INTO products (
            product_name, specification, unit_price, stock_quantity, safety_stock, 
            cost_price, material_id, material_ratio, aux_material_id, aux_material_ratio, 
            item_type, product_code, category, tax_type, tax_exempt_value
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) RETURNING product_id"
    )
    .bind(&productName)
    .bind(&specification)
    .bind(unitPrice)
    .bind(stockQuantity.unwrap_or(0))
    .bind(safetyStock.unwrap_or(10))
    .bind(costPrice.unwrap_or(0))
    .bind(materialId)
    .bind(materialRatio)
    .bind(auxMaterialId)
    .bind(auxMaterialRatio)
    .bind(itemType.unwrap_or_else(|| "product".to_string()))
    .bind(&productCode)
    .bind(&category)
    .bind(taxType.unwrap_or_else(|| "면세".to_string()))
    .bind(taxExemptValue.unwrap_or(0))
    .fetch_one(&mut *tx)
    .await?;

    let product_id = row.0;

    // 2. Initial Inventory Log
    if stockQuantity.unwrap_or(0) != 0 {
        sqlx::query(
            "INSERT INTO inventory_logs (product_id, product_name, specification, product_code, change_type, change_quantity, current_stock, memo) 
             VALUES ($1, $2, $3, $4, '초기재고', $5, $5, '상품 신규 생성')"
        )
        .bind(product_id)
        .bind(&productName)
        .bind(&specification)
        .bind(&productCode)
        .bind(stockQuantity.unwrap_or(0))
        .execute(&mut *tx)
        .await?;
    }

    tx.commit().await?;
    Ok(product_id)
}


pub async fn update_product(
    app: AppHandle,
    state: TauriState<'_, DbPool>,
    productId: i32,
    productName: String,
    specification: Option<String>,
    unitPrice: i32,
    stockQuantity: Option<i32>,
    safetyStock: Option<i32>,
    costPrice: Option<i32>,
    materialId: Option<i32>,
    materialRatio: Option<f64>,
    auxMaterialId: Option<i32>,
    auxMaterialRatio: Option<f64>,
    itemType: Option<String>,
    status: Option<String>,
    syncSalesNames: Option<bool>,
    category: Option<String>,
    taxType: Option<String>,
    taxExemptValue: Option<i32>,
) -> MyceliumResult<()> {
    // config_check_admin(&app)?;
    let mut tx = state.begin().await?;
    let sync = syncSalesNames.unwrap_or(false);
    let cost = costPrice.unwrap_or(0);
    let ratio = materialRatio.unwrap_or(1.0);
    let aux_ratio = auxMaterialRatio.unwrap_or(1.0);
    let status_val = status.unwrap_or_else(|| "판매중".to_string());
    let tax_type_val = taxType.unwrap_or_else(|| "면세".to_string());

    let old: Product = sqlx::query_as("SELECT * FROM products WHERE product_id = $1")
        .bind(productId)
        .fetch_one(&mut *tx)
        .await?;

    if let Some(qty) = stockQuantity {
        sqlx::query(
            "UPDATE products SET product_name = $1, specification = $2, unit_price = $3, stock_quantity = $4, safety_stock = $5, cost_price = $6, material_id = $7, material_ratio = $8, aux_material_id = $9, aux_material_ratio = $10, item_type = $11, status = $12, category = $13, tax_type = $14, tax_exempt_value = $15 WHERE product_id = $16",
        )
        .bind(&productName).bind(&specification).bind(unitPrice).bind(qty).bind(safetyStock.unwrap_or(10)).bind(cost).bind(materialId).bind(ratio).bind(auxMaterialId).bind(aux_ratio).bind(itemType.clone().unwrap_or_else(|| "product".to_string())).bind(&status_val).bind(&category).bind(&tax_type_val).bind(taxExemptValue.unwrap_or(0)).bind(productId)
        .execute(&mut *tx).await?;
    } else {
        sqlx::query(
            "UPDATE products SET 
                product_name = $1, specification = $2, unit_price = $3, 
                safety_stock = $4, cost_price = $5, material_id = $6, material_ratio = $7, 
                aux_material_id = $8, aux_material_ratio = $9, item_type = $10, 
                status = $11, product_code = $12, category = $13, tax_type = $14, tax_exempt_value = $15
             WHERE product_id = $16"
        )
        .bind(&productName)
        .bind(&specification)
        .bind(unitPrice)
        .bind(safetyStock.unwrap_or(10))
        .bind(costPrice.unwrap_or(0))
        .bind(materialId)
        .bind(materialRatio)
        .bind(auxMaterialId)
        .bind(auxMaterialRatio)
        .bind(itemType.unwrap_or_else(|| "product".to_string()))
        .bind(&status_val)
        .bind(&old.product_code) 
        .bind(&category)
        .bind(&tax_type_val)
        .bind(taxExemptValue.unwrap_or(0))
        .bind(productId)
        .execute(&mut *tx).await?;
    }

    let mut changes = Vec::new();
    if old.product_name != productName {
        changes.push(format!(
            "상품명: '{}' -> '{}'",
            old.product_name, productName
        ));
    }
    if old.specification != specification {
        changes.push(format!(
            "규격: '{}' -> '{}'",
            old.specification.as_deref().unwrap_or(""),
            specification.as_deref().unwrap_or("")
        ));
    }
    if old.status.as_deref().unwrap_or("판매중") != status_val {
        changes.push(format!(
            "상태: '{}' -> '{}'",
            old.status.as_deref().unwrap_or("판매중"),
            status_val
        ));
    }
    if old.cost_price.unwrap_or(0) != cost {
        changes.push(format!("원가: {} -> {}", old.cost_price.unwrap_or(0), cost));
    }
    if old.safety_stock.unwrap_or(10) != safetyStock.unwrap_or(10) {
        changes.push(format!(
            "안전재고: {} -> {}",
            old.safety_stock.unwrap_or(10),
            safetyStock.unwrap_or(10)
        ));
    }
    if old.category != category {
        changes.push(format!(
            "카테고리: '{}' -> '{}'",
            old.category.as_deref().unwrap_or(""),
            category.as_deref().unwrap_or("")
        ));
    }

    if !changes.is_empty() {
        let memo = changes.join(" | ");
        sqlx::query(
            "INSERT INTO inventory_logs (product_id, product_name, specification, product_code, change_type, change_quantity, current_stock, memo) 
             VALUES ($1, $2, $3, $4, '정보변경', 0, $5, $6)"
        )
        .bind(productId)
        .bind(&productName)
        .bind(&specification)
        .bind(&old.product_code)
        .bind(old.stock_quantity.unwrap_or(0))
        .bind(memo)
        .execute(&mut *tx)
        .await?;

        if sync {
            sqlx::query("UPDATE sales SET product_name = $1, specification = $2, product_code = $3 WHERE product_id = $4")
            .bind(&productName).bind(&specification).bind(&old.product_code).bind(productId)
            .execute(&mut *tx).await?;

            sqlx::query("UPDATE inventory_logs SET product_name = $1, specification = $2, product_code = $3 WHERE product_id = $4")
            .bind(&productName).bind(&specification).bind(&old.product_code).bind(productId)
            .execute(&mut *tx).await?;
        }
    }

    tx.commit().await?;
    Ok(())
}


pub async fn discontinue_product(app: AppHandle, state: TauriState<'_, DbPool>, productId: i32) -> MyceliumResult<()> {
    // config_check_admin(&app)?;
    DB_MODIFIED.store(true, Ordering::Relaxed);
    let mut tx = state.begin().await?;

    let product: Product = sqlx::query_as("SELECT * FROM products WHERE product_id = $1")
        .bind(productId)
        .fetch_one(&mut *tx)
        .await?;

    sqlx::query("UPDATE products SET status = '단종상품' WHERE product_id = $1")
        .bind(productId)
        .execute(&mut *tx)
        .await?;

    sqlx::query(
        "INSERT INTO inventory_logs (product_id, product_name, specification, product_code, change_type, change_quantity, current_stock, memo) 
         VALUES ($1, $2, $3, $4, '상태변경', 0, $5, '상품이 단종 처리되었습니다.')"
    )
    .bind(productId)
    .bind(&product.product_name)
    .bind(&product.specification)
    .bind(&product.product_code)
    .bind(product.stock_quantity.unwrap_or(0))
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;
    Ok(())
}


pub async fn delete_product(app: AppHandle, state: TauriState<'_, DbPool>, productId: i32) -> MyceliumResult<()> {
    // config_check_admin(&app)?;
    let sales_count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM sales WHERE product_id = $1")
        .bind(productId)
        .fetch_one(&*state)
        .await?;

    if sales_count.0 > 0 {
        return Err(MyceliumError::Validation("HAS_HISTORY".to_string()));
    }

    let log_count: (i64,) = sqlx::query_as(
        "SELECT COUNT(*) FROM inventory_logs WHERE product_id = $1 AND change_type != '상태변경'",
    )
    .bind(productId)
    .fetch_one(&*state)
    .await?;

    if log_count.0 > 0 {
        return Err(MyceliumError::Validation("HAS_HISTORY".to_string()));
    }

    // Check if used as a material in any BOM
    let bom_usage: (i64,) =
        sqlx::query_as("SELECT COUNT(*) FROM product_bom WHERE material_id = $1")
            .bind(productId)
            .fetch_one(&*state)
            .await?;

    if bom_usage.0 > 0 {
        return Err(MyceliumError::Validation("USED_AS_BOM".to_string()));
    }

    DB_MODIFIED.store(true, Ordering::Relaxed);
    let mut tx = state.begin().await?;

    sqlx::query("DELETE FROM inventory_logs WHERE product_id = $1")
        .bind(productId)
        .execute(&mut *tx)
        .await?;

    sqlx::query("DELETE FROM products WHERE product_id = $1")
        .bind(productId)
        .execute(&mut *tx)
        .await?;

    tx.commit().await?;
    Ok(())
}


pub async fn hard_delete_product(app: AppHandle, state: TauriState<'_, DbPool>, productId: i32) -> MyceliumResult<()> {
    // config_check_admin(&app)?;
    DB_MODIFIED.store(true, Ordering::Relaxed);
    let mut tx = state.begin().await?;

    sqlx::query("DELETE FROM sales WHERE product_id = $1")
        .bind(productId)
        .execute(&mut *tx)
        .await?;
    sqlx::query("DELETE FROM inventory_logs WHERE product_id = $1")
        .bind(productId)
        .execute(&mut *tx)
        .await?;
    sqlx::query("DELETE FROM product_price_history WHERE product_id = $1")
        .bind(productId)
        .execute(&mut *tx)
        .await?;
    sqlx::query("DELETE FROM products WHERE product_id = $1")
        .bind(productId)
        .execute(&mut *tx)
        .await?;

    tx.commit().await?;
    Ok(())
}


pub async fn get_product_price_history(
    state: TauriState<'_, DbPool>,
    productId: i32,
) -> MyceliumResult<Vec<ProductPriceHistory>> {
    Ok(sqlx::query_as::<_, ProductPriceHistory>(
        "SELECT * FROM product_price_history WHERE product_id = $1 ORDER BY changed_at DESC",
    )
    .bind(productId)
    .fetch_all(&*state)
    .await?)
}


pub async fn get_product_history(
    state: TauriState<'_, DbPool>,
    productId: i32,
) -> MyceliumResult<Vec<ProductHistoryItem>> {
    let mut history = Vec::new();

    let prices: Vec<ProductPriceHistory> =
        sqlx::query_as("SELECT * FROM product_price_history WHERE product_id = $1")
            .bind(productId)
            .fetch_all(&*state)
            .await?;

    for p in prices {
        history.push(ProductHistoryItem {
            history_type: "가격변경".to_string(),
            date: p.changed_at.format("%Y-%m-%d %H:%M").to_string(),
            title: "판매가 변경".to_string(),
            description: p.reason.unwrap_or_else(|| "가격 수정".to_string()),
            old_value: Some(p.old_price.to_string()),
            new_value: Some(p.new_price.to_string()),
            change_amount: p.new_price - p.old_price,
        });
    }

    let logs: Vec<(NaiveDateTime, String, i32, String)> = sqlx::query_as(
        r#"
        SELECT created_at, change_type, change_quantity, memo 
        FROM inventory_logs 
        WHERE product_id = $1 
        AND change_type IN ('상품등록', '정보변경', '상태변경', '재고조정', '초기재고')
        ORDER BY created_at DESC
        "#,
    )
    .bind(productId)
    .fetch_all(&*state)
    .await?;

    for (date, c_type, qty, memo) in logs {
        history.push(ProductHistoryItem {
            history_type: match c_type.as_str() {
                "상품등록" => "생성",
                "정보변경" => "수정",
                "상태변경" => "상태",
                _ => "재고",
            }
            .to_string(),
            date: date.format("%Y-%m-%d %H:%M").to_string(),
            title: c_type,
            description: memo,
            old_value: None,
            new_value: None,
            change_amount: qty,
        });
    }

    history.sort_by(|a, b| b.date.cmp(&a.date));
    Ok(history)
}


pub async fn update_product_stock(
    app: AppHandle,
    state: TauriState<'_, DbPool>,
    productId: i32,
    newQty: i32,
    reason: String,
) -> MyceliumResult<()> {
    // config_check_admin(&app)?;
    DB_MODIFIED.store(true, Ordering::Relaxed);
    let mut tx = state.begin().await?;

    let product: Product = sqlx::query_as("SELECT * FROM products WHERE product_id = $1")
        .bind(productId)
        .fetch_one(&mut *tx)
        .await?;

    let old_qty = product.stock_quantity.unwrap_or(0);

    sqlx::query("UPDATE products SET stock_quantity = $1 WHERE product_id = $2")
        .bind(newQty)
        .bind(productId)
        .execute(&mut *tx)
        .await?;

    sqlx::query("INSERT INTO inventory_logs (product_id, product_name, specification, product_code, change_type, change_quantity, current_stock, memo) VALUES ($1, $2, $3, $4, '조정', $5, $6, $7)")
        .bind(productId)
        .bind(&product.product_name)
        .bind(&product.specification)
        .bind(&product.product_code)
        .bind(newQty - old_qty)
        .bind(newQty)
        .bind(reason)
        .execute(&mut *tx)
        .await?;

    tx.commit().await?;
    Ok(())
}


pub async fn convert_stock(
    app: AppHandle,
    state: TauriState<'_, DbPool>,
    materialId: i32,
    productId: i32,
    convertQty: i32,
    materialDeductQty: Option<i32>,
    memo: String,
) -> MyceliumResult<()> {
    // config_check_admin(&app)?;
    DB_MODIFIED.store(true, Ordering::Relaxed);
    let mut tx = state.begin().await?;

    let material: Product = sqlx::query_as("SELECT * FROM products WHERE product_id = $1")
        .bind(materialId)
        .fetch_one(&mut *tx)
        .await?;

    let product: Product = sqlx::query_as("SELECT * FROM products WHERE product_id = $1")
        .bind(productId)
        .fetch_one(&mut *tx)
        .await?;

    let ratio = product.material_ratio.unwrap_or(1.0);
    // Use user input if provided, otherwise calculate
    let deduct = materialDeductQty.unwrap_or_else(|| (convertQty as f64 * ratio).ceil() as i32);
    let expected_deduct = (convertQty as f64 * ratio).ceil() as i32;

    if material.stock_quantity.unwrap_or(0) < deduct {
        return Err(MyceliumError::Validation(format!(
            "원자재 재고가 부족합니다. (필요: {}, 현재: {})",
            deduct,
            material.stock_quantity.unwrap_or(0)
        )));
    }

    let m_new_qty = material.stock_quantity.unwrap_or(0) - deduct;
    let p_new_qty = product.stock_quantity.unwrap_or(0) + convertQty;

    let m_actual_id = material.product_id.unwrap_or(0);
    let m_name = material.product_name;
    let m_spec = material.specification;
    let m_code = material.product_code;
    let p_name = product.product_name;
    let p_spec = product.specification;
    let m_deduct = deduct;

    // Calculate Yield/Loss info for memo
    let yield_info = if deduct != expected_deduct {
        let diff = deduct - expected_deduct;
        if diff > 0 {
            format!("(Loss: {} 추가소모)", diff)
        } else {
            format!("(Save: {} 절감)", -diff)
        }
    } else {
        "".to_string()
    };

    sqlx::query("UPDATE products SET stock_quantity = $1 WHERE product_id = $2")
        .bind(m_new_qty)
        .bind(materialId)
        .execute(&mut *tx)
        .await?;
    sqlx::query("UPDATE products SET stock_quantity = $1 WHERE product_id = $2")
        .bind(p_new_qty)
        .bind(productId)
        .execute(&mut *tx)
        .await?;

    sqlx::query("INSERT INTO inventory_logs (product_id, product_name, specification, product_code, change_type, change_quantity, current_stock, memo, reference_id) VALUES ($1, $2, $3, $4, '출고', $5, $6, $7, 'CONVERT_OUT')")
    .bind(m_actual_id).bind(&m_name).bind(&m_spec).bind(&m_code).bind(-m_deduct).bind(m_new_qty).bind(format!("가공 전환: {} 제작용 원자재 소모 {}", p_name, yield_info))
    .execute(&mut *tx).await?;

    let p_code: Option<String> =
        sqlx::query_scalar("SELECT product_code FROM products WHERE product_id = $1")
            .bind(productId)
            .fetch_one(&mut *tx)
            .await?;
    sqlx::query("INSERT INTO inventory_logs (product_id, product_name, specification, product_code, change_type, change_quantity, current_stock, memo, reference_id) VALUES ($1, $2, $3, $4, '입고', $5, $6, $7, 'CONVERT_IN')")
    .bind(productId).bind(&p_name).bind(&p_spec).bind(&p_code).bind(convertQty).bind(p_new_qty).bind(format!("가공 완료: {}", memo))
    .execute(&mut *tx).await?;

    tx.commit().await?;

    Ok(())
}


pub async fn adjust_product_stock(
    app: AppHandle,
    state: TauriState<'_, DbPool>,
    productId: i32,
    changeQty: i32,
    memo: String,
    reasonCategory: Option<String>,
) -> MyceliumResult<()> {
    // config_check_admin(&app)?;
    DB_MODIFIED.store(true, Ordering::Relaxed);
    let mut tx = state.begin().await?;

    let product: Product = sqlx::query_as("SELECT product_id, product_name, specification, product_code, stock_quantity, unit_price FROM products WHERE product_id = $1")
        .bind(productId).fetch_one(&mut *tx).await?;

    let new_qty = product.stock_quantity.unwrap_or(0) + changeQty;
    sqlx::query("UPDATE products SET stock_quantity = $1 WHERE product_id = $2")
        .bind(new_qty)
        .bind(productId)
        .execute(&mut *tx)
        .await?;

    let log_type = if let Some(ref cat) = reasonCategory {
        if !cat.is_empty() && cat != "단순오차" {
            cat.clone()
        } else if changeQty > 0 {
            "입고".to_string()
        } else {
            "조정".to_string()
        }
    } else if changeQty > 0 {
        "입고".to_string()
    } else {
        "조정".to_string()
    };

    sqlx::query("INSERT INTO inventory_logs (product_id, product_name, specification, product_code, change_type, change_quantity, current_stock, memo, reference_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'MANUAL')")
    .bind(productId).bind(&product.product_name).bind(&product.specification).bind(&product.product_code).bind(&log_type).bind(changeQty).bind(new_qty).bind(&memo).execute(&mut *tx).await?;

    // --- GAP/HACCP Integration ---
    if let Some(ref cat) = reasonCategory {
        if cat == "수확" && changeQty > 0 {
            // 1. Try to find the latest active batch for this product to associate with
            let batch: Option<(i32, Option<i32>)> = sqlx::query_as("SELECT batch_id, space_id FROM production_batches WHERE product_id = $1 AND status != 'completed' ORDER BY start_date DESC LIMIT 1")
                .bind(productId)
                .fetch_optional(&mut *tx).await?;

            let (batch_id, space_id) = match batch {
                Some((bid, sid)) => (Some(bid), sid),
                None => (None, None),
            };

            // 2. Insert into harvest_records (5th tab)
            sqlx::query("INSERT INTO harvest_records (batch_id, harvest_date, quantity, unit, grade, memo) VALUES ($1, CURRENT_DATE, $2, $3, 'A', $4)")
                .bind(batch_id)
                .bind(changeQty as f64)
                .bind(product.specification.as_deref().unwrap_or("kg"))
                .bind(&memo)
                .execute(&mut *tx).await?;

            // 3. Get representative name
            let rep_name = sqlx::query_scalar::<_, String>(
                "SELECT representative_name FROM company_info LIMIT 1",
            )
            .fetch_optional(&mut *tx)
            .await?
            .unwrap_or_else(|| "시스템자동".to_string());

            // 4. Insert into farming_logs (4th tab - GAP/HACCP)
            sqlx::query("INSERT INTO farming_logs (batch_id, space_id, log_date, work_type, work_content, worker_name) VALUES ($1, $2, CURRENT_DATE, 'harvest', $3, $4)")
                .bind(batch_id)
                .bind(space_id)
                .bind(format!("[자동] 수확 입고: {} (수량: {}{}) - {}", 
                    &product.product_name, 
                    changeQty, 
                    product.specification.as_deref().unwrap_or(""),
                    if memo.is_empty() { "기록 없음" } else { &memo }))
                .bind(rep_name)
                .execute(&mut *tx).await?;
        }
    }

    tx.commit().await?;

    Ok(())
}


pub async fn get_inventory_logs(
    state: TauriState<'_, DbPool>,
    limit: i64,
    itemType: Option<String>,
) -> MyceliumResult<Vec<InventoryLog>> {
    let base_sql = r#"
        SELECT l.* FROM inventory_logs l 
        LEFT JOIN products p ON l.product_id = p.product_id 
        WHERE 1=1
    "#;

    if let Some(t) = itemType {
        let sql = format!("{} AND (p.item_type = $1 OR ($1 = 'product' AND p.item_type IS NULL)) ORDER BY l.created_at DESC LIMIT $2", base_sql);
        let rows = sqlx::query_as::<_, InventoryLog>(&sql)
            .bind(t)
            .bind(limit)
            .fetch_all(&*state)
            .await?;
        Ok(rows)
    } else {
        let sql = format!("{} ORDER BY l.created_at DESC LIMIT $1", base_sql);
        let rows = sqlx::query_as::<_, InventoryLog>(&sql)
            .bind(limit)
            .fetch_all(&*state)
            .await?;
        Ok(rows)
    }
}


pub async fn get_inventory_forecast_alerts(
    state: TauriState<'_, DbPool>,
) -> MyceliumResult<Vec<InventoryAlert>> {
    let sql = r#"
        WITH consumption AS (
            SELECT 
                COALESCE(product_id, 0) as product_id,
                product_name,
                specification,
                SUM(quantity) as total_qty, 
                COUNT(DISTINCT order_date) as days_active
            FROM sales 
            WHERE order_date >= NOW() - INTERVAL '30 days' AND status != '취소' 
            GROUP BY product_id, product_name, specification
        )
        SELECT p.product_id, p.product_name, p.specification, p.stock_quantity, p.safety_stock,
            COALESCE(CAST(c.total_qty AS DOUBLE PRECISION) / NULLIF(c.days_active, 0), 0.0) as daily_avg_consumption,
            CAST(CASE WHEN COALESCE(c.total_qty, 0) > 0 THEN CAST(p.stock_quantity AS INTEGER) / (CAST(c.total_qty AS FLOAT) / 30.0) ELSE 999 END AS INTEGER) as days_remaining,
            COALESCE(p.item_type, 'product') as item_type
        FROM products p 
        LEFT JOIN consumption c ON (p.product_id = c.product_id OR (c.product_id = 0 AND p.product_name = c.product_name AND p.specification IS NOT DISTINCT FROM c.specification))
        WHERE p.status = '판매중' ORDER BY stock_quantity ASC LIMIT 10
    "#;

    Ok(sqlx::query_as::<_, InventoryAlert>(sql)
        .fetch_all(&*state)
        .await?)
}
#[derive(serde::Deserialize)]
pub struct BomItemInput {
    pub material_id: i32,
    pub ratio: f64,
}

#[derive(serde::Deserialize)]
pub struct BomDeductionInput {
    pub material_id: i32,
    pub quantity: i32,
}


pub async fn get_product_bom(
    pool: TauriState<'_, DbPool>,
    productId: i32,
) -> MyceliumResult<Vec<crate::db::ProductBomJoin>> {
    let sql = r#"
        SELECT b.id, b.product_id, b.material_id, b.ratio, 
               p.product_name, p.specification, p.stock_quantity, p.item_type
        FROM product_bom b
        JOIN products p ON b.material_id = p.product_id
        WHERE b.product_id = $1
    "#;

    let rows = sqlx::query_as::<_, crate::db::ProductBomJoin>(sql)
        .bind(productId)
        .fetch_all(&*pool)
        .await?;

    if !rows.is_empty() {
        return Ok(rows);
    }

    // Fallback: Check legacy columns (material_id, aux_material_id)
    let p: Option<(Option<i32>, Option<f64>, Option<i32>, Option<f64>)> = 
        sqlx::query_as("SELECT material_id, material_ratio, aux_material_id, aux_material_ratio FROM products WHERE product_id = $1")
        .bind(productId)
        .fetch_optional(&*pool)
        .await?;

    let mut list = Vec::new();
    if let Some((m_id, m_ratio, a_id, a_ratio)) = p {
        // 1. Aux Material (Packaging/Box)
        if let Some(aid) = a_id {
            let m = sqlx::query_as::<_, (String, Option<String>, i32, Option<String>)>("SELECT product_name, specification, stock_quantity, item_type FROM products WHERE product_id = $1")
                .bind(aid)
                .fetch_optional(&*pool)
                .await?;

            if let Some((name, spec, stock, itype)) = m {
                list.push(crate::db::ProductBomJoin {
                    id: 0, // Dummy ID
                    product_id: productId,
                    material_id: aid,
                    ratio: a_ratio.unwrap_or(1.0),
                    product_name: name,
                    specification: spec,
                    stock_quantity: stock,
                    item_type: itype,
                });
            }
        }

        // 2. Main Material (Raw)
        if let Some(mid) = m_id {
            let m = sqlx::query_as::<_, (String, Option<String>, i32, Option<String>)>("SELECT product_name, specification, stock_quantity, item_type FROM products WHERE product_id = $1")
                .bind(mid)
                .fetch_optional(&*pool)
                .await?;

            if let Some((name, spec, stock, itype)) = m {
                list.push(crate::db::ProductBomJoin {
                    id: 0, // Dummy ID
                    product_id: productId,
                    material_id: mid,
                    ratio: m_ratio.unwrap_or(1.0),
                    product_name: name,
                    specification: spec,
                    stock_quantity: stock,
                    item_type: itype,
                });
            }
        }
    }

    Ok(list)
}


pub async fn save_product_bom(
    pool: TauriState<'_, DbPool>,
    productId: i32,
    bomList: Vec<BomItemInput>,
) -> MyceliumResult<()> {
    // DB_MODIFIED.store(true, Ordering::Relaxed); // Optional unless strictly needed
    let mut tx = pool.begin().await?;

    // 1. Delete existing BOM
    sqlx::query("DELETE FROM product_bom WHERE product_id = $1")
        .bind(productId)
        .execute(&mut *tx)
        .await?;

    // 2. Insert new items
    for item in bomList {
        sqlx::query("INSERT INTO product_bom (product_id, material_id, ratio) VALUES ($1, $2, $3)")
            .bind(productId)
            .bind(item.material_id)
            .bind(item.ratio)
            .execute(&mut *tx)
            .await?;
    }

    tx.commit().await?;
    Ok(())
}

#[derive(serde::Deserialize)]
pub struct BatchTargetInput {
    pub product_id: i32,
    pub quantity: i32,
}


pub async fn batch_convert_stock(
    pool: TauriState<'_, DbPool>,
    targets: Vec<BatchTargetInput>,
    deductions: Vec<BomDeductionInput>,
    memo: String,
) -> MyceliumResult<()> {
    DB_MODIFIED.store(true, Ordering::Relaxed);
    let mut tx = pool.begin().await?;

    // 1. Produce Targets
    for target in &targets {
        if target.quantity <= 0 {
            continue;
        }

        let product: Product = sqlx::query_as("SELECT * FROM products WHERE product_id = $1")
            .bind(target.product_id)
            .fetch_one(&mut *tx)
            .await?;

        let p_new_qty = product.stock_quantity.unwrap_or(0) + target.quantity;
        sqlx::query("UPDATE products SET stock_quantity = $1 WHERE product_id = $2")
            .bind(p_new_qty)
            .bind(target.product_id)
            .execute(&mut *tx)
            .await?;

        // Log for Product Increase
        sqlx::query("INSERT INTO inventory_logs (product_id, product_name, specification, product_code, change_type, change_quantity, current_stock, memo, reference_id) VALUES ($1, $2, $3, $4, '입고', $5, $6, $7, 'CONVERT_IN')")
            .bind(target.product_id)
            .bind(&product.product_name)
            .bind(&product.specification)
            .bind(&product.product_code)
            .bind(target.quantity)
            .bind(p_new_qty)
            .bind(format!("배치 생산 완료: {}", memo))
            .execute(&mut *tx)
            .await?;
    }

    // 2. Deduct Materials
    for deduct in &deductions {
        if deduct.quantity <= 0 {
            continue;
        }

        let material: Product = sqlx::query_as("SELECT * FROM products WHERE product_id = $1")
            .bind(deduct.material_id)
            .fetch_one(&mut *tx)
            .await?;

        if material.stock_quantity.unwrap_or(0) < deduct.quantity {
            return Err(MyceliumError::Validation(format!(
                "자재 재고 부족: {} (필요: {}, 현재: {})",
                material.product_name,
                deduct.quantity,
                material.stock_quantity.unwrap_or(0)
            )));
        }

        let m_new_qty = material.stock_quantity.unwrap_or(0) - deduct.quantity;
        sqlx::query("UPDATE products SET stock_quantity = $1 WHERE product_id = $2")
            .bind(m_new_qty)
            .bind(deduct.material_id)
            .execute(&mut *tx)
            .await?;

        // Summary of targets for the log
        let target_names = targets
            .iter()
            .map(|t| format!("{} {}개", t.product_id, t.quantity)) // Simplified for now, we'll log more detail in full implementation if needed
            .collect::<Vec<_>>()
            .join(", ");

        sqlx::query("INSERT INTO inventory_logs (product_id, product_name, specification, product_code, change_type, change_quantity, current_stock, memo, reference_id) VALUES ($1, $2, $3, $4, '출고', $5, $6, $7, 'CONVERT_OUT')")
            .bind(deduct.material_id)
            .bind(&material.product_name)
            .bind(&material.specification)
            .bind(&material.product_code)
            .bind(-deduct.quantity)
            .bind(m_new_qty)
            .bind(format!("배치 가공 소모 (Targets: {})", target_names))
            .execute(&mut *tx)
            .await?;
    }

    // 3. GAP/HACCP Log for the whole batch
    sqlx::query("INSERT INTO farming_logs (log_date, worker_name, work_type, work_content) VALUES (CURRENT_DATE, '시스템자동', 'process', $1)")
        .bind(format!("[자동] 통합 상품화/가공 완료 - {}", memo))
        .execute(&mut *tx).await?;

    tx.commit().await?;
    Ok(())
}


pub async fn convert_stock_bom(
    pool: TauriState<'_, DbPool>,
    productId: i32,
    produceQty: i32,
    deductions: Vec<BomDeductionInput>,
    memo: String,
) -> MyceliumResult<()> {
    DB_MODIFIED.store(true, Ordering::Relaxed);
    let mut tx = pool.begin().await?;

    // 1. Get Product Info
    let product: Product = sqlx::query_as("SELECT * FROM products WHERE product_id = $1")
        .bind(productId)
        .fetch_one(&mut *tx)
        .await?;

    // 2. Main Product Stock Increase
    let p_new_qty = product.stock_quantity.unwrap_or(0) + produceQty;
    sqlx::query("UPDATE products SET stock_quantity = $1 WHERE product_id = $2")
        .bind(p_new_qty)
        .bind(productId)
        .execute(&mut *tx)
        .await?;

    let p_code = product.product_code;

    // Log for Product Increase
    sqlx::query("INSERT INTO inventory_logs (product_id, product_name, specification, product_code, change_type, change_quantity, current_stock, memo, reference_id) VALUES ($1, $2, $3, $4, '입고', $5, $6, $7, 'CONVERT_IN')")
        .bind(productId)
        .bind(&product.product_name)
        .bind(&product.specification)
        .bind(&p_code)
        .bind(produceQty)
        .bind(p_new_qty)
        .bind(format!("가공 완료(BOM): {}", memo))
        .execute(&mut *tx)
        .await?;

    // 3. Deductions (Materials)
    for deduct in &deductions {
        if deduct.quantity <= 0 {
            continue;
        }

        let material: Product = sqlx::query_as("SELECT * FROM products WHERE product_id = $1")
            .bind(deduct.material_id)
            .fetch_one(&mut *tx)
            .await?;

        if material.stock_quantity.unwrap_or(0) < deduct.quantity {
            // Rollback is implicit on error
            return Err(MyceliumError::Validation(format!(
                "자재 재고 부족: {} (필요: {}, 현재: {})",
                material.product_name,
                deduct.quantity,
                material.stock_quantity.unwrap_or(0)
            )));
        }

        let m_new_qty = material.stock_quantity.unwrap_or(0) - deduct.quantity;

        sqlx::query("UPDATE products SET stock_quantity = $1 WHERE product_id = $2")
            .bind(m_new_qty)
            .bind(deduct.material_id)
            .execute(&mut *tx)
            .await?;

        // Log for Material Decrease
        sqlx::query("INSERT INTO inventory_logs (product_id, product_name, specification, product_code, change_type, change_quantity, current_stock, memo, reference_id) VALUES ($1, $2, $3, $4, '출고', $5, $6, $7, 'CONVERT_OUT')")
            .bind(deduct.material_id)
            .bind(&material.product_name)
            .bind(&material.specification)
            .bind(&material.product_code)
            .bind(-deduct.quantity) // Negative for decrease
            .bind(m_new_qty)
            .bind(format!("가공 소모: {} 생산", product.product_name))
            .execute(&mut *tx)
            .await?;
    }

    // 4. GAP/HACCP Integration - Log the processing activity
    // Try to find if any material has a batch associated (to link the processing to a location)
    let mut space_id = None;
    let mut batch_id = None;
    for deduct in &deductions {
        let b_info: Option<(i32, Option<i32>)> = sqlx::query_as("SELECT batch_id, space_id FROM production_batches WHERE product_id = $1 ORDER BY start_date DESC LIMIT 1")
            .bind(deduct.material_id)
            .fetch_optional(&mut *tx).await?;
        if let Some((bid, sid)) = b_info {
            batch_id = Some(bid);
            space_id = sid;
            break;
        }
    }

    sqlx::query("INSERT INTO farming_logs (batch_id, space_id, log_date, work_type, work_content, worker_name) VALUES ($1, $2, CURRENT_DATE, 'process', $3, '시스템자동')")
        .bind(batch_id)
        .bind(space_id)
        .bind(format!("[자동] 상품화 가공: {} {}개 생산 (메모: {})", &product.product_name, produceQty, memo))
        .execute(&mut *tx).await?;

    tx.commit().await?;
    Ok(())
}

// --- Axum Handlers ---

#[derive(Deserialize)]
#[allow(non_snake_case)]
pub struct CreateProductRequest {
    pub productName: String,
    pub specification: Option<String>,
    pub unitPrice: i32,
    pub stockQuantity: Option<i32>,
    pub safetyStock: Option<i32>,
    pub costPrice: Option<i32>,
    pub materialId: Option<i32>,
    pub materialRatio: Option<f64>,
    pub auxMaterialId: Option<i32>,
    pub auxMaterialRatio: Option<f64>,
    pub itemType: Option<String>,
    pub productCode: Option<String>,
    pub category: Option<String>,
    pub taxType: Option<String>,
    pub taxExemptValue: Option<i32>,
}

pub async fn create_product_axum(
    AxumState(state): AxumState<crate::state::AppState>,
    Json(payload): Json<CreateProductRequest>,
) -> MyceliumResult<Json<i32>> {
    DB_MODIFIED.store(true, Ordering::Relaxed);
    let mut tx = state.pool.begin().await?;

    let row: (i32,) = sqlx::query_as(
        "INSERT INTO products (
            product_name, specification, unit_price, stock_quantity, safety_stock, 
            cost_price, material_id, material_ratio, aux_material_id, aux_material_ratio, 
            item_type, product_code, category, tax_type, tax_exempt_value
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) RETURNING product_id"
    )
    .bind(&payload.productName)
    .bind(&payload.specification)
    .bind(payload.unitPrice)
    .bind(payload.stockQuantity.unwrap_or(0))
    .bind(payload.safetyStock.unwrap_or(10))
    .bind(payload.costPrice.unwrap_or(0))
    .bind(payload.materialId)
    .bind(payload.materialRatio)
    .bind(payload.auxMaterialId)
    .bind(payload.auxMaterialRatio)
    .bind(payload.itemType.clone().unwrap_or_else(|| "product".to_string()))
    .bind(&payload.productCode)
    .bind(&payload.category)
    .bind(payload.taxType.unwrap_or_else(|| "면세".to_string()))
    .bind(payload.taxExemptValue.unwrap_or(0))
    .fetch_one(&mut *tx)
    .await?;

    let product_id = row.0;

    if payload.stockQuantity.unwrap_or(0) != 0 {
        sqlx::query(
            "INSERT INTO inventory_logs (product_id, product_name, specification, product_code, change_type, change_quantity, current_stock, memo) 
             VALUES ($1, $2, $3, $4, '초기재고', $5, $5, '상품 신규 생성')"
        )
        .bind(product_id)
        .bind(&payload.productName)
        .bind(&payload.specification)
        .bind(&payload.productCode)
        .bind(payload.stockQuantity.unwrap_or(0))
        .execute(&mut *tx)
        .await?;
    }

    tx.commit().await?;
    Ok(Json(product_id))
}

#[derive(Deserialize)]
#[allow(non_snake_case)]
pub struct UpdateProductRequest {
    pub productId: i32,
    pub productName: String,
    pub specification: Option<String>,
    pub unitPrice: i32,
    pub stockQuantity: Option<i32>,
    pub safetyStock: Option<i32>,
    pub costPrice: Option<i32>,
    pub materialId: Option<i32>,
    pub materialRatio: Option<f64>,
    pub auxMaterialId: Option<i32>,
    pub auxMaterialRatio: Option<f64>,
    pub itemType: Option<String>,
    pub status: Option<String>,
    pub syncSalesNames: Option<bool>,
    pub category: Option<String>,
    pub taxType: Option<String>,
    pub taxExemptValue: Option<i32>,
}

pub async fn update_product_axum(
    AxumState(state): AxumState<crate::state::AppState>,
    Json(payload): Json<UpdateProductRequest>,
) -> MyceliumResult<Json<()>> {
    let mut tx = state.pool.begin().await?;
    let sync = payload.syncSalesNames.unwrap_or(false);
    let cost = payload.costPrice.unwrap_or(0);
    let ratio = payload.materialRatio.unwrap_or(1.0);
    let aux_ratio = payload.auxMaterialRatio.unwrap_or(1.0);
    let status_val = payload.status.unwrap_or_else(|| "판매중".to_string());
    let tax_type_val = payload.taxType.unwrap_or_else(|| "면세".to_string());

    let old: Product = sqlx::query_as("SELECT * FROM products WHERE product_id = $1")
        .bind(payload.productId)
        .fetch_one(&mut *tx)
        .await?;

    if let Some(qty) = payload.stockQuantity {
        sqlx::query(
            "UPDATE products SET product_name = $1, specification = $2, unit_price = $3, stock_quantity = $4, safety_stock = $5, cost_price = $6, material_id = $7, material_ratio = $8, aux_material_id = $9, aux_material_ratio = $10, item_type = $11, status = $12, category = $13, tax_type = $14, tax_exempt_value = $15 WHERE product_id = $16",
        )
        .bind(&payload.productName).bind(&payload.specification).bind(payload.unitPrice).bind(qty).bind(payload.safetyStock.unwrap_or(10)).bind(cost).bind(payload.materialId).bind(ratio).bind(payload.auxMaterialId).bind(aux_ratio).bind(payload.itemType.clone().unwrap_or_else(|| "product".to_string())).bind(&status_val).bind(&payload.category).bind(&tax_type_val).bind(payload.taxExemptValue.unwrap_or(0)).bind(payload.productId)
        .execute(&mut *tx).await?;
    } else {
        sqlx::query(
            "UPDATE products SET 
                product_name = $1, specification = $2, unit_price = $3, 
                safety_stock = $4, cost_price = $5, material_id = $6, material_ratio = $7, 
                aux_material_id = $8, aux_material_ratio = $9, item_type = $10, 
                status = $11, category = $12, tax_type = $13, tax_exempt_value = $14
             WHERE product_id = $15"
        )
        .bind(&payload.productName)
        .bind(&payload.specification)
        .bind(payload.unitPrice)
        .bind(payload.safetyStock.unwrap_or(10))
        .bind(payload.costPrice.unwrap_or(0))
        .bind(payload.materialId)
        .bind(payload.materialRatio)
        .bind(payload.auxMaterialId)
        .bind(payload.auxMaterialRatio)
        .bind(payload.itemType.unwrap_or_else(|| "product".to_string()))
        .bind(&status_val)
        .bind(&payload.category)
        .bind(&tax_type_val)
        .bind(payload.taxExemptValue.unwrap_or(0))
        .bind(payload.productId)
        .execute(&mut *tx).await?;
    }

    let mut changes = Vec::new();
    if old.product_name != payload.productName {
        changes.push(format!(
            "상품명: '{}' -> '{}'",
            old.product_name, payload.productName
        ));
    }
    if old.specification != payload.specification {
        changes.push(format!(
            "규격: '{}' -> '{}'",
            old.specification.as_deref().unwrap_or(""),
            payload.specification.as_deref().unwrap_or("")
        ));
    }
    if old.status.as_deref().unwrap_or("판매중") != status_val {
        changes.push(format!(
            "상태: '{}' -> '{}'",
            old.status.as_deref().unwrap_or("판매중"),
            status_val
        ));
    }
    if old.cost_price.unwrap_or(0) != cost {
        changes.push(format!("원가: {} -> {}", old.cost_price.unwrap_or(0), cost));
    }
    if old.safety_stock.unwrap_or(10) != payload.safetyStock.unwrap_or(10) {
        changes.push(format!(
            "안전재고: {} -> {}",
            old.safety_stock.unwrap_or(10),
            payload.safetyStock.unwrap_or(10)
        ));
    }

    if !changes.is_empty() {
        let memo = changes.join(" | ");
        sqlx::query(
            "INSERT INTO inventory_logs (product_id, product_name, specification, product_code, change_type, change_quantity, current_stock, memo) 
             VALUES ($1, $2, $3, $4, '정보변경', 0, $5, $6)"
        )
        .bind(payload.productId)
        .bind(&payload.productName)
        .bind(&payload.specification)
        .bind(&old.product_code)
        .bind(old.stock_quantity.unwrap_or(0))
        .bind(memo)
        .execute(&mut *tx)
        .await?;

        if sync {
            sqlx::query("UPDATE sales SET product_name = $1, specification = $2, product_code = $3 WHERE product_id = $4")
            .bind(&payload.productName).bind(&payload.specification).bind(&old.product_code).bind(payload.productId)
            .execute(&mut *tx).await?;

            sqlx::query("UPDATE inventory_logs SET product_name = $1, specification = $2, product_code = $3 WHERE product_id = $4")
            .bind(&payload.productName).bind(&payload.specification).bind(&old.product_code).bind(payload.productId)
            .execute(&mut *tx).await?;
        }
    }

    tx.commit().await?;
    Ok(Json(()))
}

#[derive(Deserialize)]
pub struct IdRequest {
    pub productId: i32,
}

pub async fn discontinue_product_axum(
    AxumState(state): AxumState<crate::state::AppState>,
    Json(payload): Json<IdRequest>,
) -> MyceliumResult<Json<()>> {
    DB_MODIFIED.store(true, Ordering::Relaxed);
    let mut tx = state.pool.begin().await?;

    let product: Product = sqlx::query_as("SELECT * FROM products WHERE product_id = $1")
        .bind(payload.productId)
        .fetch_one(&mut *tx)
        .await?;

    sqlx::query("UPDATE products SET status = '단종상품' WHERE product_id = $1")
        .bind(payload.productId)
        .execute(&mut *tx)
        .await?;

    sqlx::query(
        "INSERT INTO inventory_logs (product_id, product_name, specification, product_code, change_type, change_quantity, current_stock, memo) 
         VALUES ($1, $2, $3, $4, '상태변경', 0, $5, '상품이 단종 처리되었습니다.')"
    )
    .bind(payload.productId)
    .bind(&product.product_name)
    .bind(&product.specification)
    .bind(&product.product_code)
    .bind(product.stock_quantity.unwrap_or(0))
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;
    Ok(Json(()))
}

pub async fn delete_product_axum(
    AxumState(state): AxumState<crate::state::AppState>,
    Json(payload): Json<IdRequest>,
) -> MyceliumResult<Json<()>> {
    let sales_count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM sales WHERE product_id = $1")
        .bind(payload.productId)
        .fetch_one(&state.pool)
        .await?;

    if sales_count.0 > 0 {
        return Err(MyceliumError::Validation("HAS_HISTORY".to_string()));
    }

    let log_count: (i64,) = sqlx::query_as(
        "SELECT COUNT(*) FROM inventory_logs WHERE product_id = $1 AND change_type != '상태변경'",
    )
    .bind(payload.productId)
    .fetch_one(&state.pool)
    .await?;

    if log_count.0 > 0 {
        return Err(MyceliumError::Validation("HAS_HISTORY".to_string()));
    }

    // Check if used as a material in any BOM
    let bom_usage: (i64,) =
        sqlx::query_as("SELECT COUNT(*) FROM product_bom WHERE material_id = $1")
            .bind(payload.productId)
            .fetch_one(&state.pool)
            .await?;

    if bom_usage.0 > 0 {
        return Err(MyceliumError::Validation("USED_AS_BOM".to_string()));
    }

    DB_MODIFIED.store(true, Ordering::Relaxed);
    let mut tx = state.pool.begin().await?;

    sqlx::query("DELETE FROM inventory_logs WHERE product_id = $1")
        .bind(payload.productId)
        .execute(&mut *tx)
        .await?;

    sqlx::query("DELETE FROM products WHERE product_id = $1")
        .bind(payload.productId)
        .execute(&mut *tx)
        .await?;

    tx.commit().await?;
    Ok(Json(()))
}

pub async fn get_product_history_axum(
    AxumState(state): AxumState<crate::state::AppState>,
    axum::extract::Query(payload): axum::extract::Query<IdRequest>,
) -> MyceliumResult<Json<Vec<ProductHistoryItem>>> {
    let productId = payload.productId;
    let mut history = Vec::new();

    let prices: Vec<ProductPriceHistory> =
        sqlx::query_as("SELECT * FROM product_price_history WHERE product_id = $1")
            .bind(productId)
            .fetch_all(&state.pool)
            .await?;

    for p in prices {
        history.push(ProductHistoryItem {
            history_type: "가격변경".to_string(),
            date: p.changed_at.format("%Y-%m-%d %H:%M").to_string(),
            title: "판매가 변경".to_string(),
            description: p.reason.unwrap_or_else(|| "가격 수정".to_string()),
            old_value: Some(p.old_price.to_string()),
            new_value: Some(p.new_price.to_string()),
            change_amount: p.new_price - p.old_price,
        });
    }

    let logs: Vec<(NaiveDateTime, String, i32, String)> = sqlx::query_as(
        r#"
        SELECT created_at, change_type, change_quantity, memo 
        FROM inventory_logs 
        WHERE product_id = $1 
        AND change_type IN ('상품등록', '정보변경', '상태변경', '재고조정', '초기재고')
        ORDER BY created_at DESC
        "#,
    )
    .bind(productId)
    .fetch_all(&state.pool)
    .await?;

    for (date, c_type, qty, memo) in logs {
        history.push(ProductHistoryItem {
            history_type: match c_type.as_str() {
                "상품등록" => "생성",
                "정보변경" => "수정",
                "상태변경" => "상태",
                _ => "재고",
            }
            .to_string(),
            date: date.format("%Y-%m-%d %H:%M").to_string(),
            title: c_type,
            description: memo,
            old_value: None,
            new_value: None,
            change_amount: qty,
        });
    }

    history.sort_by(|a, b| b.date.cmp(&a.date));
    Ok(Json(history))
}

pub async fn get_product_bom_axum(
    AxumState(state): AxumState<crate::state::AppState>,
    axum::extract::Query(payload): axum::extract::Query<IdRequest>,
) -> MyceliumResult<Json<Vec<crate::db::ProductBomJoin>>> {
    let productId = payload.productId;
    let sql = r#"
        SELECT b.id, b.product_id, b.material_id, b.ratio, 
               p.product_name, p.specification, p.stock_quantity, p.item_type
        FROM product_bom b
        JOIN products p ON b.material_id = p.product_id
        WHERE b.product_id = $1
    "#;

    let rows = sqlx::query_as::<_, crate::db::ProductBomJoin>(sql)
        .bind(productId)
        .fetch_all(&state.pool)
        .await?;

    if !rows.is_empty() {
        return Ok(Json(rows));
    }

    // Fallback: Check legacy columns
    let p: Option<(Option<i32>, Option<f64>, Option<i32>, Option<f64>)> = 
        sqlx::query_as("SELECT material_id, material_ratio, aux_material_id, aux_material_ratio FROM products WHERE product_id = $1")
        .bind(productId)
        .fetch_optional(&state.pool)
        .await?;

    let mut list = Vec::new();
    if let Some((m_id, m_ratio, a_id, a_ratio)) = p {
        if let Some(aid) = a_id {
            let m = sqlx::query_as::<_, (String, Option<String>, i32, Option<String>)>("SELECT product_name, specification, stock_quantity, item_type FROM products WHERE product_id = $1")
                .bind(aid)
                .fetch_optional(&state.pool)
                .await?;

            if let Some((name, spec, stock, itype)) = m {
                list.push(crate::db::ProductBomJoin {
                    id: 0,
                    product_id: productId,
                    material_id: aid,
                    ratio: a_ratio.unwrap_or(1.0),
                    product_name: name,
                    specification: spec,
                    stock_quantity: stock,
                    item_type: itype,
                });
            }
        }

        if let Some(mid) = m_id {
            let m = sqlx::query_as::<_, (String, Option<String>, i32, Option<String>)>("SELECT product_name, specification, stock_quantity, item_type FROM products WHERE product_id = $1")
                .bind(mid)
                .fetch_optional(&state.pool)
                .await?;

            if let Some((name, spec, stock, itype)) = m {
                list.push(crate::db::ProductBomJoin {
                    id: 0,
                    product_id: productId,
                    material_id: mid,
                    ratio: m_ratio.unwrap_or(1.0),
                    product_name: name,
                    specification: spec,
                    stock_quantity: stock,
                    item_type: itype,
                });
            }
        }
    }

    Ok(Json(list))
}

#[derive(Deserialize)]
#[allow(non_snake_case)]
pub struct SaveBomRequest {
    pub productId: i32,
    pub bomList: Vec<BomItemInput>,
}

pub async fn save_product_bom_axum(
    AxumState(state): AxumState<crate::state::AppState>,
    Json(payload): Json<SaveBomRequest>,
) -> MyceliumResult<Json<()>> {
    let mut tx = state.pool.begin().await?;

    sqlx::query("DELETE FROM product_bom WHERE product_id = $1")
        .bind(payload.productId)
        .execute(&mut *tx)
        .await?;

    for item in payload.bomList {
        sqlx::query("INSERT INTO product_bom (product_id, material_id, ratio) VALUES ($1, $2, $3)")
            .bind(payload.productId)
            .bind(item.material_id)
            .bind(item.ratio)
            .execute(&mut *tx)
            .await?;
    }

    tx.commit().await?;
    Ok(Json(()))
}


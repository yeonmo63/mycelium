#![allow(non_snake_case)]
use crate::db::{
    DbPool, InventoryAlert, InventoryLog, Product, ProductHistoryItem, ProductPriceHistory,
};
use crate::DB_MODIFIED;
use chrono::NaiveDateTime;
use sqlx;
use std::sync::atomic::Ordering;
use tauri::{command, State};

#[command]
pub async fn get_product_list(state: State<'_, DbPool>) -> Result<Vec<Product>, String> {
    let products = sqlx::query_as::<_, Product>(
        "SELECT product_id, product_name, specification, unit_price, stock_quantity, safety_stock, cost_price, material_id, material_ratio, item_type, product_code, status FROM products ORDER BY product_name"
    )
    .fetch_all(&*state)
    .await
    .map_err(|e: sqlx::Error| e.to_string())?;

    Ok(products)
}

#[command]
pub async fn get_discontinued_product_names(
    pool: State<'_, DbPool>,
) -> Result<Vec<String>, String> {
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
        .await
        .map_err(|e| e.to_string())?;

    Ok(rows)
}

#[command]
pub async fn consolidate_products(
    pool: State<'_, DbPool>,
    oldProductId: i32,
    newProductId: i32,
    syncNames: Option<bool>,
) -> Result<(), String> {
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    let sync = syncNames.unwrap_or(false);

    let old_p: Product = sqlx::query_as("SELECT * FROM products WHERE product_id = $1")
        .bind(oldProductId)
        .fetch_one(&mut *tx)
        .await
        .map_err(|e| format!("Source product not found: {}", e))?;

    let new_p: Product = sqlx::query_as("SELECT * FROM products WHERE product_id = $1")
        .bind(newProductId)
        .fetch_one(&mut *tx)
        .await
        .map_err(|e| format!("Target product not found: {}", e))?;

    if sync {
        sqlx::query(
            "UPDATE sales SET product_id = $1, product_name = $2, specification = $3, product_code = $4 
             WHERE product_id = $5 OR (product_id IS NULL AND product_name = $6 AND specification IS NOT DISTINCT FROM $7)"
        )
        .bind(newProductId).bind(&new_p.product_name).bind(&new_p.specification).bind(&new_p.product_code)
        .bind(oldProductId).bind(&old_p.product_name).bind(&old_p.specification)
        .execute(&mut *tx).await.map_err(|e| e.to_string())?;

        sqlx::query(
            "UPDATE inventory_logs SET product_id = $1, product_name = $2, specification = $3, product_code = $4 
             WHERE product_id = $5 OR (product_id IS NULL AND product_name = $6 AND specification IS NOT DISTINCT FROM $7)"
        )
        .bind(newProductId).bind(&new_p.product_name).bind(&new_p.specification).bind(&new_p.product_code)
        .bind(oldProductId).bind(&old_p.product_name).bind(&old_p.specification)
        .execute(&mut *tx).await.map_err(|e| e.to_string())?;
    } else {
        sqlx::query(
            "UPDATE sales SET product_id = $1 
             WHERE product_id = $2",
        )
        .bind(newProductId)
        .bind(oldProductId)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

        sqlx::query(
            "UPDATE inventory_logs SET product_id = $1 
             WHERE product_id = $2",
        )
        .bind(newProductId)
        .bind(oldProductId)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }

    let old_qty = old_p.stock_quantity.unwrap_or(0);
    if old_qty != 0 {
        sqlx::query(
            "UPDATE products SET stock_quantity = stock_quantity + $1 WHERE product_id = $2",
        )
        .bind(old_qty)
        .bind(newProductId)
        .execute(&mut *tx)
        .await
        .map_err(|e| format!("Stock merging failed: {}", e))?;

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
        .await
        .map_err(|e| e.to_string())?;
    }

    sqlx::query("UPDATE products SET status = '단종상품', memo = COALESCE(memo, '') || $1 WHERE product_id = $2")
        .bind(format!(" | {}에 상품 ID:{}로 병합됨", chrono::Local::now().format("%Y-%m-%d"), newProductId))
        .bind(oldProductId)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(())
}

#[command]
pub async fn create_product(
    state: State<'_, DbPool>,
    productName: String,
    specification: Option<String>,
    unitPrice: i32,
    stockQuantity: Option<i32>,
    safetyStock: Option<i32>,
    costPrice: Option<i32>,
    materialId: Option<i32>,
    materialRatio: Option<f64>,
    itemType: Option<String>,
    productCode: Option<String>,
) -> Result<i32, String> {
    DB_MODIFIED.store(true, Ordering::Relaxed);
    let mut tx = state.begin().await.map_err(|e| e.to_string())?;

    let row: (i32,) = sqlx::query_as(
        "INSERT INTO products (product_name, specification, unit_price, stock_quantity, safety_stock, cost_price, material_id, material_ratio, item_type, product_code) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING product_id"
    )
    .bind(&productName)
    .bind(&specification)
    .bind(unitPrice)
    .bind(stockQuantity.unwrap_or(0))
    .bind(safetyStock.unwrap_or(0))
    .bind(costPrice.unwrap_or(0))
    .bind(materialId)
    .bind(materialRatio)
    .bind(itemType.unwrap_or("product".to_string()))
    .bind(&productCode)
    .fetch_one(&mut *tx)
    .await
    .map_err(|e: sqlx::Error| e.to_string())?;

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
        .await
        .map_err(|e| e.to_string())?;
    }

    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(product_id)
}

#[command]
pub async fn update_product(
    state: State<'_, DbPool>,
    productId: i32,
    productName: String,
    specification: Option<String>,
    unitPrice: i32,
    stockQuantity: Option<i32>,
    safetyStock: Option<i32>,
    costPrice: Option<i32>,
    materialId: Option<i32>,
    materialRatio: Option<f64>,
    itemType: Option<String>,
    status: Option<String>,
    syncSalesNames: Option<bool>,
) -> Result<(), String> {
    let mut tx = state.begin().await.map_err(|e| e.to_string())?;
    let sync = syncSalesNames.unwrap_or(false);
    let cost = costPrice.unwrap_or(0);
    let ratio = materialRatio.unwrap_or(1.0);
    let status_val = status.unwrap_or_else(|| "판매중".to_string());

    let old: Product = sqlx::query_as("SELECT * FROM products WHERE product_id = $1")
        .bind(productId)
        .fetch_one(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    if let Some(qty) = stockQuantity {
        sqlx::query(
            "UPDATE products SET product_name = $1, specification = $2, unit_price = $3, stock_quantity = $4, safety_stock = $5, cost_price = $6, material_id = $7, material_ratio = $8, item_type = $9, status = $10 WHERE product_id = $11",
        )
        .bind(&productName).bind(&specification).bind(unitPrice).bind(qty).bind(safetyStock.unwrap_or(10)).bind(cost).bind(materialId).bind(ratio).bind(itemType.clone().unwrap_or_else(|| "product".to_string())).bind(&status_val).bind(productId)
        .execute(&mut *tx).await.map_err(|e| e.to_string())?;
    } else {
        sqlx::query(
            "UPDATE products SET product_name = $1, specification = $2, unit_price = $3, safety_stock = $4, cost_price = $5, material_id = $6, material_ratio = $7, item_type = $8, status = $9 WHERE product_id = $10",
        )
        .bind(&productName).bind(&specification).bind(unitPrice).bind(safetyStock.unwrap_or(10)).bind(cost).bind(materialId).bind(ratio).bind(itemType.clone().unwrap_or_else(|| "product".to_string())).bind(&status_val).bind(productId)
        .execute(&mut *tx).await.map_err(|e| e.to_string())?;
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
        .await
        .map_err(|e| e.to_string())?;

        if sync {
            sqlx::query("UPDATE sales SET product_name = $1, specification = $2, product_code = $3 WHERE product_id = $4")
            .bind(&productName).bind(&specification).bind(&old.product_code).bind(productId)
            .execute(&mut *tx).await.map_err(|e| e.to_string())?;

            sqlx::query("UPDATE inventory_logs SET product_name = $1, specification = $2, product_code = $3 WHERE product_id = $4")
            .bind(&productName).bind(&specification).bind(&old.product_code).bind(productId)
            .execute(&mut *tx).await.map_err(|e| e.to_string())?;
        }
    }

    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(())
}

#[command]
pub async fn discontinue_product(state: State<'_, DbPool>, productId: i32) -> Result<(), String> {
    DB_MODIFIED.store(true, Ordering::Relaxed);
    let mut tx = state.begin().await.map_err(|e| e.to_string())?;

    let product: Product = sqlx::query_as("SELECT * FROM products WHERE product_id = $1")
        .bind(productId)
        .fetch_one(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    sqlx::query("UPDATE products SET status = '단종상품' WHERE product_id = $1")
        .bind(productId)
        .execute(&mut *tx)
        .await
        .map_err(|e: sqlx::Error| e.to_string())?;

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
    .await
    .map_err(|e| e.to_string())?;

    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(())
}

#[command]
pub async fn delete_product(state: State<'_, DbPool>, productId: i32) -> Result<(), String> {
    let sales_count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM sales WHERE product_id = $1")
        .bind(productId)
        .fetch_one(&*state)
        .await
        .map_err(|e| e.to_string())?;

    if sales_count.0 > 0 {
        return Err("HAS_HISTORY".to_string());
    }

    let log_count: (i64,) = sqlx::query_as(
        "SELECT COUNT(*) FROM inventory_logs WHERE product_id = $1 AND change_type != '상태변경'",
    )
    .bind(productId)
    .fetch_one(&*state)
    .await
    .map_err(|e| e.to_string())?;

    if log_count.0 > 0 {
        return Err("HAS_HISTORY".to_string());
    }

    DB_MODIFIED.store(true, Ordering::Relaxed);
    let mut tx = state.begin().await.map_err(|e| e.to_string())?;

    sqlx::query("DELETE FROM inventory_logs WHERE product_id = $1")
        .bind(productId)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    sqlx::query("DELETE FROM products WHERE product_id = $1")
        .bind(productId)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(())
}

#[command]
pub async fn hard_delete_product(state: State<'_, DbPool>, productId: i32) -> Result<(), String> {
    DB_MODIFIED.store(true, Ordering::Relaxed);
    let mut tx = state.begin().await.map_err(|e| e.to_string())?;

    sqlx::query("DELETE FROM sales WHERE product_id = $1")
        .bind(productId)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    sqlx::query("DELETE FROM inventory_logs WHERE product_id = $1")
        .bind(productId)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    sqlx::query("DELETE FROM product_price_history WHERE product_id = $1")
        .bind(productId)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    sqlx::query("DELETE FROM products WHERE product_id = $1")
        .bind(productId)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(())
}

#[command]
pub async fn get_product_price_history(
    state: State<'_, DbPool>,
    productId: i32,
) -> Result<Vec<ProductPriceHistory>, String> {
    sqlx::query_as::<_, ProductPriceHistory>(
        "SELECT * FROM product_price_history WHERE product_id = $1 ORDER BY changed_at DESC",
    )
    .bind(productId)
    .fetch_all(&*state)
    .await
    .map_err(|e| e.to_string())
}

#[command]
pub async fn get_product_history(
    state: State<'_, DbPool>,
    productId: i32,
) -> Result<Vec<ProductHistoryItem>, String> {
    let mut history = Vec::new();

    let prices: Vec<ProductPriceHistory> =
        sqlx::query_as("SELECT * FROM product_price_history WHERE product_id = $1")
            .bind(productId)
            .fetch_all(&*state)
            .await
            .map_err(|e| e.to_string())?;

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
    .await
    .map_err(|e| e.to_string())?;

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

#[command]
pub async fn update_product_stock(
    state: State<'_, DbPool>,
    productId: i32,
    newQty: i32,
    reason: String,
) -> Result<(), String> {
    DB_MODIFIED.store(true, Ordering::Relaxed);
    let mut tx = state.begin().await.map_err(|e| e.to_string())?;

    let product: Product = sqlx::query_as("SELECT * FROM products WHERE product_id = $1")
        .bind(productId)
        .fetch_one(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    let old_qty = product.stock_quantity.unwrap_or(0);

    sqlx::query("UPDATE products SET stock_quantity = $1 WHERE product_id = $2")
        .bind(newQty)
        .bind(productId)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    sqlx::query("INSERT INTO inventory_logs (product_id, product_name, specification, product_code, change_type, change_quantity, current_stock, memo) VALUES ($1, $2, $3, $4, '조정', $5, $6, $7)")
        .bind(productId)
        .bind(&product.product_name)
        .bind(&product.specification)
        .bind(&product.product_code)
        .bind(newQty - old_qty)
        .bind(newQty)
        .bind(reason)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(())
}

#[command]
pub async fn convert_stock(
    state: State<'_, DbPool>,
    materialId: i32,
    productId: i32,
    convertQty: i32,
    memo: String,
) -> Result<(), String> {
    DB_MODIFIED.store(true, Ordering::Relaxed);
    let mut tx = state.begin().await.map_err(|e| e.to_string())?;

    let material: Product = sqlx::query_as("SELECT * FROM products WHERE product_id = $1")
        .bind(materialId)
        .fetch_one(&mut *tx)
        .await
        .map_err(|e| format!("Material not found: {}", e))?;

    let product: Product = sqlx::query_as("SELECT * FROM products WHERE product_id = $1")
        .bind(productId)
        .fetch_one(&mut *tx)
        .await
        .map_err(|e| format!("Product not found: {}", e))?;

    let ratio = product.material_ratio.unwrap_or(1.0);
    let deduct = (convertQty as f64 * ratio).ceil() as i32;

    if material.stock_quantity.unwrap_or(0) < deduct {
        return Err(format!(
            "원자재 재고가 부족합니다. (필요: {}, 현재: {})",
            deduct,
            material.stock_quantity.unwrap_or(0)
        ));
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

    sqlx::query("UPDATE products SET stock_quantity = $1 WHERE product_id = $2")
        .bind(m_new_qty)
        .bind(materialId)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    sqlx::query("UPDATE products SET stock_quantity = $1 WHERE product_id = $2")
        .bind(p_new_qty)
        .bind(productId)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    sqlx::query("INSERT INTO inventory_logs (product_id, product_name, specification, product_code, change_type, change_quantity, current_stock, memo, reference_id) VALUES ($1, $2, $3, $4, '출고', $5, $6, $7, 'CONVERT_OUT')")
    .bind(m_actual_id).bind(&m_name).bind(&m_spec).bind(&m_code).bind(-m_deduct).bind(m_new_qty).bind(format!("가공 전환: {} 제작용 원자재 소모", p_name))
    .execute(&mut *tx).await.map_err(|e| e.to_string())?;

    let p_code: Option<String> =
        sqlx::query_scalar("SELECT product_code FROM products WHERE product_id = $1")
            .bind(productId)
            .fetch_one(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
    sqlx::query("INSERT INTO inventory_logs (product_id, product_name, specification, product_code, change_type, change_quantity, current_stock, memo, reference_id) VALUES ($1, $2, $3, $4, '입고', $5, $6, $7, 'CONVERT_IN')")
    .bind(productId).bind(&p_name).bind(&p_spec).bind(&p_code).bind(convertQty).bind(p_new_qty).bind(format!("가공 완료: {}", memo))
    .execute(&mut *tx).await.map_err(|e| e.to_string())?;

    tx.commit().await.map_err(|e| e.to_string())?;

    Ok(())
}

#[command]
pub async fn adjust_product_stock(
    state: State<'_, DbPool>,
    productId: i32,
    changeQty: i32,
    memo: String,
    reasonCategory: Option<String>,
) -> Result<(), String> {
    DB_MODIFIED.store(true, Ordering::Relaxed);
    let mut tx = state.begin().await.map_err(|e| e.to_string())?;

    let product: Product = sqlx::query_as("SELECT product_id, product_name, specification, product_code, stock_quantity FROM products WHERE product_id = $1")
        .bind(productId).fetch_one(&mut *tx).await.map_err(|e| e.to_string())?;

    let new_qty = product.stock_quantity.unwrap_or(0) + changeQty;
    sqlx::query("UPDATE products SET stock_quantity = $1 WHERE product_id = $2")
        .bind(new_qty)
        .bind(productId)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    let log_type = if let Some(cat) = reasonCategory {
        if !cat.is_empty() && cat != "단순오차" {
            cat
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

    sqlx::query("INSERT INTO inventory_logs (product_id, product_name, specification, product_code, change_type, change_quantity, current_stock, memo, reference_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'ADJUST')")
    .bind(productId).bind(&product.product_name).bind(&product.specification).bind(&product.product_code).bind(log_type).bind(changeQty).bind(new_qty).bind(memo).execute(&mut *tx).await.map_err(|e| e.to_string())?;

    tx.commit().await.map_err(|e| e.to_string())?;

    Ok(())
}

#[command]
pub async fn get_inventory_logs(
    state: State<'_, DbPool>,
    limit: i64,
    itemType: Option<String>,
) -> Result<Vec<InventoryLog>, String> {
    let base_sql = r#"
        SELECT l.* FROM inventory_logs l 
        LEFT JOIN products p ON l.product_id = p.product_id 
        WHERE l.created_at >= CURRENT_TIMESTAMP - INTERVAL '24 hours'
    "#;

    if let Some(t) = itemType {
        let sql = format!("{} AND (p.item_type = $1 OR ($1 = 'product' AND p.item_type IS NULL)) ORDER BY l.created_at DESC LIMIT $2", base_sql);
        sqlx::query_as::<_, InventoryLog>(&sql)
            .bind(t)
            .bind(limit)
            .fetch_all(&*state)
            .await
            .map_err(|e| e.to_string())
    } else {
        let sql = format!("{} ORDER BY l.created_at DESC LIMIT $1", base_sql);
        sqlx::query_as::<_, InventoryLog>(&sql)
            .bind(limit)
            .fetch_all(&*state)
            .await
            .map_err(|e| e.to_string())
    }
}

#[command]
pub async fn get_inventory_forecast_alerts(
    state: State<'_, DbPool>,
) -> Result<Vec<InventoryAlert>, String> {
    let sql = r#"
        WITH consumption AS (
            SELECT product_name, SUM(quantity) as total_qty, COUNT(DISTINCT order_date) as days_active
            FROM sales WHERE order_date >= NOW() - INTERVAL '30 days' AND status != '취소' GROUP BY product_name
        )
        SELECT p.product_id, p.product_name, p.specification, p.stock_quantity, p.safety_stock,
            COALESCE(CAST(c.total_qty AS DOUBLE PRECISION) / NULLIF(c.days_active, 0), 0.0) as daily_avg_consumption,
            CAST(CASE WHEN COALESCE(c.total_qty, 0) > 0 THEN CAST(p.stock_quantity AS INTEGER) / (CAST(c.total_qty AS FLOAT) / 30.0) ELSE 999 END AS INTEGER) as days_remaining,
            COALESCE(p.item_type, 'product') as item_type
        FROM products p LEFT JOIN consumption c ON p.product_name = c.product_name
        WHERE p.status = '판매중' ORDER BY stock_quantity ASC LIMIT 10
    "#;

    sqlx::query_as::<_, InventoryAlert>(sql)
        .fetch_all(&*state)
        .await
        .map_err(|e| e.to_string())
}

use crate::db::DbPool;
use crate::error::{MyceliumError, MyceliumResult};
use crate::stubs::State;
use crate::DB_MODIFIED;
use chrono::Local;
use std::sync::atomic::Ordering;

use super::utils::{calculate_bom_tax_distribution, calculate_tax_from_total, parse_date_safe};

pub async fn create_sale(
    state: State<'_, DbPool>,
    customer_id: Option<String>,
    product_name: String,
    specification: Option<String>,
    quantity: i32,
    unit_price: i32,
    total_amount: i32,
    order_date: String,
    memo: Option<String>,
    status: Option<String>,
) -> MyceliumResult<String> {
    create_sale_internal(
        &*state,
        customer_id,
        product_name,
        specification,
        quantity,
        unit_price,
        total_amount,
        order_date,
        memo,
        status,
        None,
        None,
        None,
        None,
        None,
        None,
        None, // Missing shipping info in original signature
    )
    .await
}

// Internal implementation that takes &DbPool
pub async fn create_sale_internal(
    pool: &DbPool,
    customer_id: Option<String>,
    product_name: String,
    specification: Option<String>,
    quantity: i32,
    unit_price: i32,
    total_amount: i32,
    order_date: String,
    memo: Option<String>,
    status: Option<String>,
    // Add shipping params that were missing in original tauri command but present in Axum/Usage
    shipping_name: Option<String>,
    shipping_zip_code: Option<String>,
    shipping_address_primary: Option<String>,
    shipping_address_detail: Option<String>,
    shipping_mobile_number: Option<String>,
    shipping_date: Option<String>,
    paid_amount: Option<i32>,
) -> MyceliumResult<String> {
    DB_MODIFIED.store(true, Ordering::Relaxed);

    let sale_id = format!("S-{}", uuid::Uuid::new_v4().to_string()[..8].to_uppercase());

    let parsed_date = parse_date_safe(&order_date).unwrap_or_else(|| Local::now().date_naive());

    // Find product_id and tax_type
    let p_info: Option<(i32, Option<String>)> = sqlx::query_as(
        "SELECT product_id, tax_type FROM products WHERE product_name = $1 AND specification IS NOT DISTINCT FROM $2",
    )
    .bind(&product_name)
    .bind(&specification)
    .fetch_optional(pool)
    .await?;

    let product_id = p_info.as_ref().map(|r| r.0);
    let tax_type = p_info
        .as_ref()
        .and_then(|r| r.1.clone())
        .unwrap_or_else(|| "면세".to_string());

    let mut supply_value = total_amount;
    let mut vat_amount = 0;
    let mut tax_exempt_value = 0;
    let mut actual_tax_type = tax_type.clone();

    if let Some(pid) = product_id {
        if let Some((s, v, e)) = calculate_bom_tax_distribution(pool, pid, total_amount).await? {
            supply_value = s;
            vat_amount = v;
            tax_exempt_value = e;
            actual_tax_type = if e > 0 && (s + v) > 0 {
                "복합".to_string()
            } else if e > 0 {
                "면세".to_string()
            } else {
                "과세".to_string()
            };
        } else if tax_type == "과세" {
            let (s, v) = calculate_tax_from_total(total_amount);
            supply_value = s;
            vat_amount = v;
            tax_exempt_value = 0;
        }
    } else if tax_type == "과세" {
        let (s, v) = calculate_tax_from_total(total_amount);
        supply_value = s;
        vat_amount = v;
        tax_exempt_value = 0;
    }

    // Insert sale
    // Note: The original query didn't include shipping info, but we should add it if we want full feature parity with what frontend is sending
    // Frontend sends: shipping info.
    // The query below needs to be updated to include shipping columns if the table has them.
    // Checking `update_sale` below, the table HAS shipping_* columns.

    sqlx::query(
        "INSERT INTO sales (
            sales_id, customer_id, product_name, specification, quantity, unit_price, total_amount, 
            order_date, memo, status, product_id, supply_value, vat_amount, tax_type, tax_exempt_value,
            shipping_name, shipping_zip_code, shipping_address_primary, shipping_address_detail, shipping_mobile_number,
            paid_amount
        )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)"
    )
    .bind(&sale_id)
    .bind(customer_id)
    .bind(product_name)
    .bind(specification)
    .bind(quantity)
    .bind(unit_price)
    .bind(total_amount)
    .bind(parsed_date)
    .bind(memo)
    .bind(status.unwrap_or_else(|| "접수".to_string()))
    .bind(product_id)
    .bind(supply_value)
    .bind(vat_amount)
    .bind(actual_tax_type)
    .bind(tax_exempt_value)
    .bind(shipping_name)
    .bind(shipping_zip_code)
    .bind(shipping_address_primary)
    .bind(shipping_address_detail)
    .bind(shipping_mobile_number)
    .bind(paid_amount)
    .execute(pool)
    .await?;

    Ok(sale_id)
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateSaleRequest {
    pub customer_id: Option<serde_json::Value>, // Allow string or number
    pub product_name: String,
    pub specification: Option<String>,
    pub unit_price: i32,
    pub quantity: i32,
    pub total_amount: i32,
    pub status: Option<String>,
    pub memo: Option<String>,
    pub order_date_str: String,
    pub shipping_name: Option<String>,
    pub shipping_zip_code: Option<String>,
    pub shipping_address_primary: Option<String>,
    pub shipping_address_detail: Option<String>,
    pub shipping_mobile_number: Option<String>,
    pub shipping_date: Option<String>,
    pub paid_amount: Option<i32>,
}

pub async fn create_sale_axum(
    axum::extract::State(state): axum::extract::State<crate::state::AppState>,
    axum::Json(payload): axum::Json<CreateSaleRequest>,
) -> impl axum::response::IntoResponse {
    let customer_id_str = match payload.customer_id {
        Some(serde_json::Value::Number(n)) => Some(n.to_string()),
        Some(serde_json::Value::String(s)) => Some(s),
        _ => None,
    };

    match create_sale_internal(
        &state.pool,
        customer_id_str,
        payload.product_name,
        payload.specification,
        payload.quantity,
        payload.unit_price,
        payload.total_amount,
        payload.order_date_str,
        payload.memo,
        payload.status,
        payload.shipping_name,
        payload.shipping_zip_code,
        payload.shipping_address_primary,
        payload.shipping_address_detail,
        payload.shipping_mobile_number,
        payload.shipping_date,
        payload.paid_amount,
    )
    .await
    {
        Ok(id) => axum::Json(serde_json::json!({ "success": true, "saleId": id })),
        Err(e) => axum::Json(serde_json::json!({ "success": false, "error": e.to_string() })),
    }
}

pub async fn update_sale_status(
    state: State<'_, DbPool>,
    sales_id: String,
    status: String,
) -> MyceliumResult<()> {
    DB_MODIFIED.store(true, Ordering::Relaxed);
    sqlx::query("UPDATE sales SET status = $1 WHERE sales_id = $2")
        .bind(status)
        .bind(sales_id)
        .execute(&*state)
        .await?;
    Ok(())
}

pub async fn cancel_sale(state: State<'_, DbPool>, sales_id: String) -> MyceliumResult<()> {
    DB_MODIFIED.store(true, Ordering::Relaxed);
    sqlx::query("UPDATE sales SET status = '취소' WHERE sales_id = $1")
        .bind(sales_id)
        .execute(&*state)
        .await?;
    Ok(())
}

pub async fn delete_sale(state: State<'_, DbPool>, sales_id: String) -> MyceliumResult<()> {
    DB_MODIFIED.store(true, Ordering::Relaxed);
    sqlx::query("DELETE FROM sales WHERE sales_id = $1")
        .bind(sales_id)
        .execute(&*state)
        .await?;
    Ok(())
}

pub async fn update_sale(
    state: State<'_, DbPool>,
    sales_id: String,
    product_name: String,
    specification: Option<String>,
    quantity: i32,
    unit_price: i32,
    total_amount: i32,
    discount_rate: i32,
    memo: Option<String>,
    shipping_name: Option<String>,
    shipping_zip_code: Option<String>,
    shipping_address_primary: Option<String>,
    shipping_address_detail: Option<String>,
    shipping_mobile_number: Option<String>,
    status: String,
    payment_status: Option<String>,
    paid_amount: Option<i32>,
    shipping_date: Option<String>,
    customer_id: Option<String>,
    order_date: String,
) -> MyceliumResult<()> {
    DB_MODIFIED.store(true, Ordering::Relaxed);
    let mut tx = state.begin().await?;

    // Date parsing
    let shipping_date_parsed = match shipping_date {
        Some(s) if !s.is_empty() => Some(
            chrono::NaiveDate::parse_from_str(&s, "%Y-%m-%d")
                .map_err(|e| MyceliumError::Internal(format!("Invalid shipping date: {}", e)))?,
        ),
        _ => None,
    };
    let order_date_parsed = chrono::NaiveDate::parse_from_str(&order_date, "%Y-%m-%d")
        .map_err(|e| MyceliumError::Internal(format!("Invalid order date: {}", e)))?;

    // Resolve product_id
    let p_id_row: Option<(i32,)> = sqlx::query_as("SELECT product_id FROM products WHERE product_name = $1 AND specification IS NOT DISTINCT FROM $2")
        .bind(&product_name)
        .bind(&specification)
        .fetch_optional(&mut *tx)
        .await?;
    let product_id = p_id_row.map(|r| r.0);

    // Recalculate Tax
    let mut supply_value = total_amount;
    let mut vat_amount = 0;
    let mut tax_exempt_value = 0;
    let mut actual_tax_type = "면세".to_string();

    let p_info: Option<(String,)> =
        sqlx::query_as("SELECT tax_type FROM products WHERE product_id = $1")
            .bind(product_id)
            .fetch_optional(&mut *tx)
            .await?;
    let tax_type = p_info.map(|r| r.0).unwrap_or_else(|| "면세".to_string());

    if let Some(pid) = product_id {
        if let Some((s, v, e)) = calculate_bom_tax_distribution(&*state, pid, total_amount).await? {
            supply_value = s;
            vat_amount = v;
            tax_exempt_value = e;
            actual_tax_type = if e > 0 && (s + v) > 0 {
                "복합".to_string()
            } else if e > 0 {
                "면세".to_string()
            } else {
                "과세".to_string()
            };
        } else if tax_type == "과세" {
            let (s, v) = calculate_tax_from_total(total_amount);
            supply_value = s;
            vat_amount = v;
            tax_exempt_value = 0;
            actual_tax_type = "과세".to_string();
        }
    } else if tax_type == "과세" {
        let (s, v) = calculate_tax_from_total(total_amount);
        supply_value = s;
        vat_amount = v;
        tax_exempt_value = 0;
        actual_tax_type = "과세".to_string();
    }

    // Update
    sqlx::query(
        "UPDATE sales SET
            product_name = $1, specification = $2, quantity = $3, unit_price = $4, total_amount = $5,
            discount_rate = $6, memo = $7, shipping_name = $8, shipping_zip_code = $9,
            shipping_address_primary = $10, shipping_address_detail = $11, shipping_mobile_number = $12,
            status = $13, payment_status = $14, paid_amount = $15, shipping_date = $16,
            customer_id = $17, order_date = $18, product_id = $19, supply_value = $20, vat_amount = $21, tax_type = $22, tax_exempt_value = $23
        WHERE sales_id = $24"
    )
    .bind(product_name)
    .bind(specification)
    .bind(quantity)
    .bind(unit_price)
    .bind(total_amount)
    .bind(discount_rate)
    .bind(memo)
    .bind(shipping_name)
    .bind(shipping_zip_code)
    .bind(shipping_address_primary)
    .bind(shipping_address_detail)
    .bind(shipping_mobile_number)
    .bind(status)
    .bind(payment_status)
    .bind(paid_amount)
    .bind(shipping_date_parsed)
    .bind(customer_id)
    .bind(order_date_parsed)
    .bind(product_id)
    .bind(supply_value)
    .bind(vat_amount)
    .bind(actual_tax_type)
    .bind(tax_exempt_value)
    .bind(sales_id)
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;
    Ok(())
}

pub async fn complete_shipment(
    state: State<'_, DbPool>,
    sales_id: String,
    memo: Option<String>,
    carrier: Option<String>,
    tracking_number: Option<String>,
    shipping_date: Option<String>,
) -> MyceliumResult<()> {
    DB_MODIFIED.store(true, Ordering::Relaxed);

    let mut tx = state.begin().await?;

    let sale: Option<(String, i32, Option<String>)> =
        sqlx::query_as("SELECT status, total_amount, customer_id FROM sales WHERE sales_id = $1")
            .bind(&sales_id)
            .fetch_optional(&mut *tx)
            .await?;

    if let Some((status, amount, cust_id)) = sale {
        if status != "입금완료" {
            if let Some(cid) = cust_id {
                // 1. Record receivable in Ledger
                sqlx::query(
                    "INSERT INTO customer_ledger (customer_id, transaction_type, amount, description, reference_id, transaction_date)
                     VALUES ($1, '매출(미수)', $2, '배송 완료 (미수금 발생)', $3, CURRENT_DATE)"
                )
                .bind(&cid)
                .bind(amount)
                .bind(&sales_id)
                .execute(&mut *tx)
                .await?;

                // 2. Update Customer Balance logic (Sync with Ledger)
                sqlx::query("UPDATE customers SET current_balance = COALESCE(current_balance, 0) + $1 WHERE customer_id = $2")
                    .bind(amount)
                    .bind(&cid)
                    .execute(&mut *tx)
                    .await?;
            }
        }
    }

    let date_parsed = match shipping_date {
        Some(s) if !s.is_empty() => Some(
            chrono::NaiveDate::parse_from_str(&s, "%Y-%m-%d")
                .map_err(|e| MyceliumError::Internal(e.to_string()))?,
        ),
        _ => Some(chrono::Local::now().date_naive()),
    };

    sqlx::query(
        "UPDATE sales SET status = '배송중', memo = $1, courier_name = $2, tracking_number = $3, shipping_date = $4 WHERE sales_id = $5"
    )
    .bind(memo)
    .bind(carrier)
    .bind(tracking_number)
    .bind(date_parsed)
    .bind(sales_id)
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;
    Ok(())
}

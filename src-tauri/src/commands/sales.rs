#![allow(non_snake_case)]
use crate::db::{DbPool, Sales, SalesClaim};
use crate::error::{MyceliumError, MyceliumResult};
use crate::DB_MODIFIED;
use chrono::{NaiveDate, Utc};
use std::fs;
use std::sync::atomic::Ordering;
use tauri::{command, AppHandle, Manager, State};

// SPECIAL SALES BATCH SAVE STRUCTS
#[derive(serde::Deserialize)]
pub struct SpecialEventInput {
    pub event_id: Option<String>,
    pub event_name: String,
    pub organizer: Option<String>,
    pub manager_name: Option<String>,
    pub manager_contact: Option<String>,
    pub location_address: Option<String>,
    pub memo: Option<String>,
    pub start_date: Option<String>,
    pub end_date: Option<String>,
}

#[derive(serde::Deserialize)]
pub struct SpecialSaleInput {
    pub sales_id: Option<String>,
    pub order_date: String,
    pub product_name: String,
    pub specification: Option<String>,
    pub quantity: i32,
    pub unit_price: i32,
    pub discount_rate: Option<i32>,
    pub total_amount: Option<i32>,
    pub memo: Option<String>,
}

async fn calculate_bom_tax_distribution(
    pool: &sqlx::PgPool,
    product_id: i32,
    total_amount: i32,
) -> MyceliumResult<Option<(i32, i32, i32)>> {
    let rows: Vec<(f64, String, i32)> = sqlx::query_as(
        r#"
        SELECT b.ratio, p.tax_type, p.unit_price
        FROM product_bom b
        JOIN products p ON b.material_id = p.product_id
        WHERE b.product_id = $1
        "#,
    )
    .bind(product_id)
    .fetch_all(pool)
    .await?;

    if rows.is_empty() {
        return Ok(None);
    }

    let mut total_bom_value = 0.0;
    let mut taxable_bom_value = 0.0;

    for (ratio, tax_type, unit_price) in rows {
        let val = ratio * (unit_price as f64);
        total_bom_value += val;
        if tax_type == "과세" {
            taxable_bom_value += val;
        }
    }

    if total_bom_value <= 0.0 {
        return Ok(None);
    }

    let taxable_portion_ratio = taxable_bom_value / total_bom_value;
    let total_f = total_amount as f64;
    let taxable_total = total_f * taxable_portion_ratio;

    let vat = (taxable_total / 1.1 * 0.1).round() as i32;
    let taxable_supply = (taxable_total - vat as f64).round() as i32;
    let exempt_amount = total_amount - vat - taxable_supply;

    Ok(Some((taxable_supply, vat, exempt_amount)))
}

pub fn parse_date_safe(date_str: &str) -> Option<NaiveDate> {
    if date_str.trim().is_empty() {
        return None;
    }
    NaiveDate::parse_from_str(date_str, "%Y-%m-%d")
        .or_else(|_| NaiveDate::parse_from_str(date_str, "%Y%m%d"))
        .ok()
}

#[command]
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
    DB_MODIFIED.store(true, Ordering::Relaxed);

    let sale_id = format!("S-{}", uuid::Uuid::new_v4().to_string()[..8].to_uppercase());

    let parsed_date = parse_date_safe(&order_date).unwrap_or_else(|| Utc::now().date_naive());

    // Find product_id and tax_type
    let p_info: Option<(i32, Option<String>)> = sqlx::query_as(
        "SELECT product_id, tax_type FROM products WHERE product_name = $1 AND specification IS NOT DISTINCT FROM $2",
    )
    .bind(&product_name)
    .bind(&specification)
    .fetch_optional(&*state)
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
            let total = total_amount as f64;
            let supply = (total / 1.1).round() as i32;
            vat_amount = total_amount - supply;
            supply_value = supply;
            tax_exempt_value = 0;
        }
    } else if tax_type == "과세" {
        let total = total_amount as f64;
        let supply = (total / 1.1).round() as i32;
        vat_amount = total_amount - supply;
        supply_value = supply;
        tax_exempt_value = 0;
    }

    sqlx::query(
        "INSERT INTO sales (sales_id, customer_id, product_name, specification, quantity, unit_price, total_amount, order_date, memo, status, product_id, supply_value, vat_amount, tax_type, tax_exempt_value)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)"
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
    .execute(&*state)
    .await?;

    Ok(sale_id)
}

#[command]
pub async fn get_daily_sales(
    state: State<'_, DbPool>,
    date: String,
    filter: String,
) -> MyceliumResult<Vec<Sales>> {
    let mut sql = "SELECT * FROM sales".to_string();
    let parsed_date = NaiveDate::parse_from_str(&date, "%Y-%m-%d").unwrap_or_default();

    match filter.as_str() {
        "order_date" => {
            sql.push_str(" WHERE order_date = $1 ORDER BY sales_id DESC");
        }
        _ => {
            // Default to order_date
            sql.push_str(" WHERE order_date = $1 ORDER BY sales_id DESC");
        }
    }

    Ok(sqlx::query_as::<_, Sales>(&sql)
        .bind(parsed_date)
        .fetch_all(&*state)
        .await?)
}

#[command]
pub async fn search_sales_by_any(
    state: State<'_, DbPool>,
    query: String,
) -> MyceliumResult<Vec<Sales>> {
    let search_pattern = format!("%{}%", query);
    // Search in product_name, customer_name, shipping_name, memo, tracking_number
    let sql = r#"
        SELECT s.*, c.customer_name, c.mobile_number as customer_mobile
        FROM sales s
        LEFT JOIN customers c ON s.customer_id = c.customer_id
        WHERE s.product_name LIKE $1
           OR s.memo LIKE $1
           OR s.shipping_name LIKE $1
           OR s.tracking_number LIKE $1
           OR c.customer_name LIKE $1
           OR c.mobile_number LIKE $1
        ORDER BY s.order_date DESC
        LIMIT 100
    "#;

    Ok(sqlx::query_as::<_, Sales>(sql)
        .bind(search_pattern)
        .fetch_all(&*state)
        .await?)
}

#[command]
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

#[command]
pub async fn cancel_sale(state: State<'_, DbPool>, sales_id: String) -> MyceliumResult<()> {
    DB_MODIFIED.store(true, Ordering::Relaxed);
    sqlx::query("UPDATE sales SET status = '취소' WHERE sales_id = $1")
        .bind(sales_id)
        .execute(&*state)
        .await?;
    Ok(())
}

#[command]
pub async fn get_sales_by_event_id_and_date_range(
    state: State<'_, DbPool>,
    event_id: String,
    start_date: String,
    end_date: String,
) -> MyceliumResult<Vec<Sales>> {
    let start = NaiveDate::parse_from_str(&start_date, "%Y-%m-%d").unwrap_or_default();
    let end = NaiveDate::parse_from_str(&end_date, "%Y-%m-%d").unwrap_or_default();

    let sql = r#"
        SELECT s.*, '' as customer_name
        FROM sales s
        WHERE s.customer_id = $1
          AND s.order_date BETWEEN $2 AND $3
        ORDER BY s.order_date DESC
    "#;

    Ok(sqlx::query_as::<_, Sales>(sql)
        .bind(event_id)
        .bind(start)
        .bind(end)
        .fetch_all(&*state)
        .await?)
}

#[command]
pub async fn get_daily_receipts(
    state: State<'_, DbPool>,
    date: String,
) -> MyceliumResult<Vec<Sales>> {
    // Receipts usually mean paid sales
    let parsed_date = NaiveDate::parse_from_str(&date, "%Y-%m-%d").unwrap_or_default();
    let sql = r#"
        SELECT 
            s.*, 
            COALESCE(c.customer_name, e.event_name, '비회원') as customer_name
        FROM sales s
        LEFT JOIN customers c ON s.customer_id = c.customer_id
        LEFT JOIN event e ON s.customer_id = e.event_id
        WHERE s.order_date = $1
          AND s.status != '취소'
        ORDER BY s.sales_id DESC
    "#;
    Ok(sqlx::query_as::<_, Sales>(sql)
        .bind(parsed_date)
        .fetch_all(&*state)
        .await?)
}

#[command]
pub async fn delete_sale(state: State<'_, DbPool>, sales_id: String) -> MyceliumResult<()> {
    DB_MODIFIED.store(true, Ordering::Relaxed);
    sqlx::query("DELETE FROM sales WHERE sales_id = $1")
        .bind(sales_id)
        .execute(&*state)
        .await?;
    Ok(())
}

#[command]
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
            NaiveDate::parse_from_str(&s, "%Y-%m-%d")
                .map_err(|e| MyceliumError::Internal(format!("Invalid shipping date: {}", e)))?,
        ),
        _ => None,
    };
    let order_date_parsed = NaiveDate::parse_from_str(&order_date, "%Y-%m-%d")
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
            let total = total_amount as f64;
            let supply = (total / 1.1).round() as i32;
            vat_amount = total_amount - supply;
            supply_value = supply;
            tax_exempt_value = 0;
            actual_tax_type = "과세".to_string();
        }
    } else if tax_type == "과세" {
        let total = total_amount as f64;
        let supply = (total / 1.1).round() as i32;
        vat_amount = total_amount - supply;
        supply_value = supply;
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

#[command]
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
            NaiveDate::parse_from_str(&s, "%Y-%m-%d")
                .map_err(|e| MyceliumError::Internal(e.to_string()))?,
        ),
        _ => Some(chrono::Utc::now().date_naive()),
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

#[command]
pub async fn get_sales_claims(
    state: State<'_, DbPool>,
    start_date: Option<String>,
    end_date: Option<String>,
) -> MyceliumResult<Vec<SalesClaim>> {
    let mut sql = r#"
        SELECT c.*, s.product_name, s.customer_id as sales_customer_id
        FROM sales_claims c
        JOIN sales s ON c.sales_id = s.sales_id
    "#
    .to_string();

    let rows = if let (Some(s), Some(e)) = (start_date, end_date) {
        let sd = NaiveDate::parse_from_str(&s, "%Y-%m-%d").unwrap_or_default();
        let ed = NaiveDate::parse_from_str(&e, "%Y-%m-%d").unwrap_or_default();
        sql.push_str(" WHERE c.created_at::date BETWEEN $1 AND $2 ORDER BY c.created_at DESC");
        sqlx::query_as::<_, SalesClaim>(&sql)
            .bind(sd)
            .bind(ed)
            .fetch_all(&*state)
            .await
    } else {
        sql.push_str(" ORDER BY c.created_at DESC LIMIT 100");
        sqlx::query_as::<_, SalesClaim>(&sql)
            .fetch_all(&*state)
            .await
    }?;

    Ok(rows)
}

#[command]
pub async fn create_sales_claim(
    state: State<'_, DbPool>,
    sales_id: String,
    customer_id: Option<String>,
    claim_type: String,
    reason_category: String,
    quantity: i32,
    memo: Option<String>,
) -> MyceliumResult<i32> {
    DB_MODIFIED.store(true, Ordering::Relaxed);
    let row: (i32,) = sqlx::query_as(
        "INSERT INTO sales_claims (sales_id, customer_id, claim_type, reason_category, quantity, memo) 
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING claim_id"
    )
    .bind(sales_id)
    .bind(customer_id)
    .bind(claim_type)
    .bind(reason_category)
    .bind(quantity)
    .bind(memo)
    .fetch_one(&*state)
    .await?;

    Ok(row.0)
}

#[command]
pub async fn process_sales_claim(
    state: State<'_, DbPool>,
    claim_id: i32,
    claim_status: String,
    is_inventory_recovered: bool,
    refund_amount: i32,
) -> MyceliumResult<()> {
    DB_MODIFIED.store(true, Ordering::Relaxed);
    let mut tx = state.begin().await?;

    let claim: SalesClaim = sqlx::query_as("SELECT * FROM sales_claims WHERE claim_id = $1")
        .bind(claim_id)
        .fetch_one(&mut *tx)
        .await?;

    sqlx::query("UPDATE sales_claims SET claim_status = $1, is_inventory_recovered = $2, refund_amount = $3 WHERE claim_id = $4")
        .bind(&claim_status)
        .bind(is_inventory_recovered)
        .bind(refund_amount)
        .bind(claim_id)
        .execute(&mut *tx)
        .await?;

    if claim_status == "완료" {
        let new_sales_status = match claim.claim_type.as_str() {
            "취소" => "취소",
            "반품" => "반품완료",
            "교환" => "교환완료",
            _ => "완료",
        };

        sqlx::query("UPDATE sales SET status = $1 WHERE sales_id = $2")
            .bind(new_sales_status)
            .bind(&claim.sales_id)
            .execute(&mut *tx)
            .await?;
    }

    tx.commit().await?;
    Ok(())
}

#[command]
pub async fn delete_sales_claim(state: State<'_, DbPool>, claim_id: i32) -> MyceliumResult<()> {
    DB_MODIFIED.store(true, Ordering::Relaxed);
    sqlx::query("DELETE FROM sales_claims WHERE claim_id = $1")
        .bind(claim_id)
        .execute(&*state)
        .await?;
    Ok(())
}

#[command]
pub async fn update_sales_claim(
    state: State<'_, DbPool>,
    claim_id: i32,
    reason_category: String,
    quantity: i32,
    memo: Option<String>,
) -> MyceliumResult<()> {
    DB_MODIFIED.store(true, Ordering::Relaxed);
    sqlx::query("UPDATE sales_claims SET reason_category = $1, quantity = $2, memo = $3 WHERE claim_id = $4")
        .bind(reason_category)
        .bind(quantity)
        .bind(memo)
        .bind(claim_id)
        .execute(&*state)
        .await?;
    Ok(())
}

#[command]
pub async fn get_sale_detail(
    state: State<'_, DbPool>,
    sales_id: String,
) -> MyceliumResult<Option<Sales>> {
    Ok(sqlx::query_as::<_, Sales>(
        r#"
        SELECT s.*, c.customer_name 
        FROM sales s
        LEFT JOIN customers c ON s.customer_id = c.customer_id
        WHERE s.sales_id = $1
        "#,
    )
    .bind(sales_id)
    .fetch_optional(&*state)
    .await?)
}

#[command]
pub async fn get_customer_sales_on_date(
    state: State<'_, DbPool>,
    customer_id: String,
    date: String,
) -> MyceliumResult<Vec<Sales>> {
    // Parse date for validation, though we pass string to SQL
    let parsed_date = NaiveDate::parse_from_str(&date, "%Y-%m-%d")
        .map_err(|e| MyceliumError::Internal(format!("Invalid date format: {}", e)))?;

    Ok(sqlx::query_as::<_, Sales>(
        "SELECT s.*, c.customer_name 
         FROM sales s
         LEFT JOIN customers c ON s.customer_id = c.customer_id
         WHERE s.customer_id = $1 
         AND s.order_date = $2 
         ORDER BY s.sales_id ASC",
    )
    .bind(customer_id)
    .bind(parsed_date)
    .fetch_all(&*state)
    .await?)
}

#[command]
pub async fn get_customer_sales_history(
    state: State<'_, DbPool>,
    customer_id: String,
) -> MyceliumResult<Vec<Sales>> {
    Ok(sqlx::query_as::<_, Sales>(
        "SELECT * FROM sales WHERE customer_id = $1 ORDER BY order_date DESC",
    )
    .bind(customer_id)
    .fetch_all(&*state)
    .await?)
}

// BATCH SPECIAL SALES
#[command]
pub async fn save_special_sales_batch(
    state: State<'_, DbPool>,
    event: SpecialEventInput,
    sales: Vec<SpecialSaleInput>,
    deleted_sales_ids: Vec<String>,
) -> MyceliumResult<String> {
    let mut tx = state.begin().await?;

    // 1. Resolve Event ID (Create or Update)
    let event_id = if let Some(eid) = &event.event_id {
        if eid.trim().is_empty() {
            // Logic for New Event (Same as create_event)
            let now = Utc::now();
            let date_str = now.format("%Y%m%d").to_string();
            let last_record: Option<(String,)> = sqlx::query_as(
                "SELECT event_id FROM event WHERE event_id LIKE $1 ORDER BY event_id DESC LIMIT 1",
            )
            .bind(format!("{}%", date_str))
            .fetch_optional(&mut *tx)
            .await?;

            let next_val = match last_record {
                Some((last_id,)) => {
                    let parts: Vec<&str> = last_id.split('-').collect();
                    if let Some(suffix) = parts.last() {
                        suffix.parse::<i32>().unwrap_or(10000) + 1
                    } else {
                        10001
                    }
                }
                None => 10001,
            };
            let new_eid = format!("{}-{}", date_str, next_val);

            // Insert New Event
            let start_date_parsed = match &event.start_date {
                Some(s) if !s.is_empty() => {
                    Some(NaiveDate::parse_from_str(s, "%Y-%m-%d").unwrap_or_default())
                }
                _ => None,
            };
            let end_date_parsed = match &event.end_date {
                Some(s) if !s.is_empty() => {
                    Some(NaiveDate::parse_from_str(s, "%Y-%m-%d").unwrap_or_default())
                }
                _ => None,
            };

            sqlx::query(
                "INSERT INTO event (
                    event_id, event_name, organizer, manager_name, manager_contact,
                    location_address, start_date, end_date, memo
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
            )
            .bind(&new_eid)
            .bind(&event.event_name)
            .bind(&event.organizer)
            .bind(&event.manager_name)
            .bind(&event.manager_contact)
            .bind(&event.location_address)
            .bind(start_date_parsed)
            .bind(end_date_parsed)
            .bind(&event.memo)
            .execute(&mut *tx)
            .await?;

            new_eid
        } else {
            // Update Existing Event
            let start_date_parsed = match &event.start_date {
                Some(s) if !s.is_empty() => {
                    Some(NaiveDate::parse_from_str(s, "%Y-%m-%d").unwrap_or_default())
                }
                _ => None,
            };
            let end_date_parsed = match &event.end_date {
                Some(s) if !s.is_empty() => {
                    Some(NaiveDate::parse_from_str(s, "%Y-%m-%d").unwrap_or_default())
                }
                _ => None,
            };

            sqlx::query(
                "UPDATE event SET 
                 event_name=$1, organizer=$2, manager_name=$3, manager_contact=$4, 
                 location_address=$5, start_date=$6, end_date=$7, memo=$8 
                 WHERE event_id=$9",
            )
            .bind(&event.event_name)
            .bind(&event.organizer)
            .bind(&event.manager_name)
            .bind(&event.manager_contact)
            .bind(&event.location_address)
            .bind(start_date_parsed)
            .bind(end_date_parsed)
            .bind(&event.memo)
            .bind(eid)
            .execute(&mut *tx)
            .await?;

            eid.clone()
        }
    } else {
        // Same new logic if None
        let now = Utc::now();
        let date_str = now.format("%Y%m%d").to_string();
        let last_record: Option<(String,)> = sqlx::query_as(
            "SELECT event_id FROM event WHERE event_id LIKE $1 ORDER BY event_id DESC LIMIT 1",
        )
        .bind(format!("{}%", date_str))
        .fetch_optional(&mut *tx)
        .await?;

        let next_val = match last_record {
            Some((last_id,)) => {
                let parts: Vec<&str> = last_id.split('-').collect();
                if let Some(suffix) = parts.last() {
                    suffix.parse::<i32>().unwrap_or(10000) + 1
                } else {
                    10001
                }
            }
            None => 10001,
        };
        let new_eid = format!("{}-{}", date_str, next_val);

        // Insert New Event
        let start_date_parsed = match &event.start_date {
            Some(s) if !s.is_empty() => {
                Some(NaiveDate::parse_from_str(s, "%Y-%m-%d").unwrap_or_default())
            }
            _ => None,
        };
        let end_date_parsed = match &event.end_date {
            Some(s) if !s.is_empty() => {
                Some(NaiveDate::parse_from_str(s, "%Y-%m-%d").unwrap_or_default())
            }
            _ => None,
        };

        sqlx::query(
            "INSERT INTO event (
                 event_id, event_name, organizer, manager_name, manager_contact,
                 location_address, start_date, end_date, memo
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
        )
        .bind(&new_eid)
        .bind(&event.event_name)
        .bind(&event.organizer)
        .bind(&event.manager_name)
        .bind(&event.manager_contact)
        .bind(&event.location_address)
        .bind(start_date_parsed)
        .bind(end_date_parsed)
        .bind(&event.memo)
        .execute(&mut *tx)
        .await?;

        new_eid
    };

    // 2. Handle Deletions
    for del_id in deleted_sales_ids {
        // Delete sale
        sqlx::query("DELETE FROM sales WHERE sales_id = $1")
            .bind(del_id)
            .execute(&mut *tx)
            .await?;
    }

    // 3. Handle Upserts
    // Pre-calculate next Sales ID sequence for today
    let today_naive = Utc::now().date_naive();
    let today_str = today_naive.format("%Y%m%d").to_string();
    let sl_prefix = format!("{}-", today_str);
    let sl_like = format!("{}%", sl_prefix);

    let last_sale_rec: Option<(String,)> = sqlx::query_as(
        "SELECT sales_id FROM sales WHERE sales_id LIKE $1 ORDER BY sales_id DESC LIMIT 1",
    )
    .bind(&sl_like)
    .fetch_optional(&mut *tx)
    .await?;

    let mut next_seq = match last_sale_rec {
        Some((lid,)) => {
            let parts: Vec<&str> = lid.split('-').collect();
            if let Some(num_str) = parts.last() {
                num_str.parse::<i32>().unwrap_or(0) + 1
            } else {
                1
            }
        }
        None => 1,
    };

    for sale in sales {
        let sale_date = NaiveDate::parse_from_str(&sale.order_date, "%Y-%m-%d")
            .unwrap_or_else(|_| Utc::now().date_naive());
        let total = sale
            .total_amount
            .unwrap_or_else(|| sale.quantity * sale.unit_price);
        let discount = sale.discount_rate.unwrap_or(0);

        if let Some(sid) = &sale.sales_id {
            if !sid.is_empty() {
                // Find product_id and tax_type
                let p_info: Option<(i32, Option<String>)> = sqlx::query_as("SELECT product_id, tax_type FROM products WHERE product_name = $1 AND specification IS NOT DISTINCT FROM $2")
                    .bind(&sale.product_name).bind(&sale.specification).fetch_optional(&mut *tx).await?;
                let p_id = p_info.as_ref().map(|r| r.0);
                let tax_type = p_info
                    .as_ref()
                    .and_then(|r| r.1.clone())
                    .unwrap_or_else(|| "면세".to_string());

                let mut supply_value = total;
                let mut vat_amount = 0;
                let mut tax_exempt_value = 0;
                let mut actual_tax_type = tax_type.clone();

                if let Some(pid) = p_id {
                    if let Some((s, v, e)) =
                        calculate_bom_tax_distribution(&*state, pid, total).await?
                    {
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
                        let t = total as f64;
                        let s = (t / 1.1).round() as i32;
                        vat_amount = total - s;
                        supply_value = s;
                        tax_exempt_value = 0;
                    }
                } else if tax_type == "과세" {
                    let t = total as f64;
                    let s = (t / 1.1).round() as i32;
                    vat_amount = total - s;
                    supply_value = s;
                    tax_exempt_value = 0;
                }

                // Update Sale Record
                // We use '현장판매완료' status to distinguish from '배송완료'
                sqlx::query("UPDATE sales SET order_date=$1, product_name=$2, specification=$3, quantity=$4, unit_price=$5, total_amount=$6, discount_rate=$7, memo=$8, status='현장판매완료', shipping_date=$9, customer_id=$10, product_id=$11, supply_value=$12, vat_amount=$13, tax_type=$14, tax_exempt_value=$15 WHERE sales_id=$16")
                    .bind(sale_date)
                    .bind(&sale.product_name)
                    .bind(&sale.specification)
                    .bind(sale.quantity)
                    .bind(sale.unit_price)
                    .bind(total)
                    .bind(discount)
                    .bind(&sale.memo)
                    .bind(today_naive)
                    .bind(&event_id) // Link to Event ID
                    .bind(p_id)
                    .bind(supply_value)
                    .bind(vat_amount)
                    .bind(actual_tax_type)
                    .bind(tax_exempt_value)
                    .bind(sid)
                    .execute(&mut *tx)
                    .await?;
                continue;
            }
        }

        // Insert Path
        let new_sid = format!("{}{:05}", sl_prefix, next_seq);
        next_seq += 1;

        // Find product_id and tax_type
        let p_info: Option<(i32, Option<String>)> = sqlx::query_as("SELECT product_id, tax_type FROM products WHERE product_name = $1 AND specification IS NOT DISTINCT FROM $2")
            .bind(&sale.product_name).bind(&sale.specification).fetch_optional(&mut *tx).await?;
        let p_id = p_info.as_ref().map(|r| r.0);
        let tax_type = p_info
            .as_ref()
            .and_then(|r| r.1.clone())
            .unwrap_or_else(|| "면세".to_string());

        let mut supply_value = total;
        let mut vat_amount = 0;
        let mut tax_exempt_value = 0;
        let mut actual_tax_type = tax_type.clone();

        if let Some(pid) = p_id {
            if let Some((s, v, e)) = calculate_bom_tax_distribution(&*state, pid, total).await? {
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
                let t = total as f64;
                let s = (t / 1.1).round() as i32;
                vat_amount = total - s;
                supply_value = s;
                tax_exempt_value = 0;
            }
        } else if tax_type == "과세" {
            let t = total as f64;
            let s = (t / 1.1).round() as i32;
            vat_amount = total - s;
            supply_value = s;
            tax_exempt_value = 0;
        }

        sqlx::query("INSERT INTO sales (sales_id, customer_id, order_date, product_name, specification, quantity, unit_price, total_amount, discount_rate, memo, status, shipping_date, product_id, supply_value, vat_amount, tax_type, tax_exempt_value) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, '현장판매완료', $11, $12, $13, $14, $15, $16)")
        .bind(&new_sid)
        .bind(&event_id) // Link to Event ID
        .bind(sale_date)
        .bind(&sale.product_name)
        .bind(&sale.specification)
        .bind(sale.quantity)
        .bind(sale.unit_price)
        .bind(total)
        .bind(discount)
        .bind(&sale.memo)
        .bind(today_naive) // shipping_date = today for spot sales
        .bind(p_id)
        .bind(supply_value)
        .bind(vat_amount)
        .bind(actual_tax_type)
        .bind(tax_exempt_value)
        .execute(&mut *tx)
        .await?;
    }

    tx.commit().await?;

    Ok(event_id)
}

#[derive(serde::Deserialize, Debug)]
#[allow(non_snake_case)]
pub struct GeneralSalesBatchItem {
    pub salesId: Option<String>,
    pub customerId: String,
    pub productName: String,
    pub specification: Option<String>,
    pub unitPrice: i32,
    pub quantity: i32,
    pub totalAmount: i32,
    pub status: String,
    pub memo: Option<String>,
    pub orderDateStr: String,
    pub shippingName: Option<String>,
    pub shippingZipCode: Option<String>,
    pub shippingAddressPrimary: Option<String>,
    pub shippingAddressDetail: Option<String>,
    pub shippingMobileNumber: Option<String>,
    pub paidAmount: i32,
    pub paymentStatus: Option<String>,
    pub discountRate: i32,
    pub isDirty: String, // "true" or "false" string
}

#[command]
pub async fn save_general_sales_batch(
    state: State<'_, DbPool>,
    items: Vec<GeneralSalesBatchItem>,
    deleted_ids: Vec<String>,
) -> MyceliumResult<()> {
    let mut tx = state.begin().await?;

    // 1. Handle Deletions
    for del_id in deleted_ids {
        sqlx::query("DELETE FROM sales WHERE sales_id = $1")
            .bind(del_id)
            .execute(&mut *tx)
            .await?;
    }

    // 2. Prepare for ID generation
    let today_naive = Utc::now().date_naive();
    let today_str = today_naive.format("%Y%m%d").to_string();
    let sl_prefix = format!("{}-", today_str);
    let sl_like = format!("{}%", sl_prefix);

    let last_sale_rec: Option<(String,)> = sqlx::query_as(
        "SELECT sales_id FROM sales WHERE sales_id LIKE $1 ORDER BY sales_id DESC LIMIT 1",
    )
    .bind(&sl_like)
    .fetch_optional(&mut *tx)
    .await?;

    let mut next_seq = match last_sale_rec {
        Some((lid,)) => {
            let parts: Vec<&str> = lid.split('-').collect();
            if let Some(num_str) = parts.last() {
                num_str.parse::<i32>().unwrap_or(0) + 1
            } else {
                1
            }
        }
        None => 1,
    };

    // 3. Process Items
    for item in items {
        if item.salesId.is_some() && item.isDirty == "false" {
            continue;
        }

        let order_date_parsed =
            NaiveDate::parse_from_str(&item.orderDateStr, "%Y-%m-%d").unwrap_or(today_naive);

        // Find product info (id and tax_type)
        let p_info: Option<(i32, Option<String>)> = sqlx::query_as("SELECT product_id, tax_type FROM products WHERE product_name = $1 AND specification IS NOT DISTINCT FROM $2")
            .bind(&item.productName).bind(&item.specification).fetch_optional(&mut *tx).await?;
        let product_id = p_info.as_ref().map(|r| r.0);
        let tax_type = p_info
            .as_ref()
            .and_then(|r| r.1.clone())
            .unwrap_or_else(|| "면세".to_string());

        let mut supply_value = item.totalAmount;
        let mut vat_amount = 0;
        let mut tax_exempt_value = 0;
        let mut actual_tax_type = tax_type.clone();

        if let Some(pid) = product_id {
            if let Some((s, v, e)) =
                calculate_bom_tax_distribution(&*state, pid, item.totalAmount).await?
            {
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
                let total = item.totalAmount as f64;
                let supply = (total / 1.1).round() as i32;
                vat_amount = item.totalAmount - supply;
                supply_value = supply;
                tax_exempt_value = 0;
            }
        } else if tax_type == "과세" {
            let total = item.totalAmount as f64;
            let supply = (total / 1.1).round() as i32;
            vat_amount = item.totalAmount - supply;
            supply_value = supply;
            tax_exempt_value = 0;
        }

        if let Some(sid) = &item.salesId {
            if !sid.is_empty() {
                // Update
                sqlx::query(
                    "UPDATE sales SET
                        customer_id = $1, product_name = $2, specification = $3, quantity = $4, unit_price = $5,
                        total_amount = $6, status = $7, memo = $8, order_date = $9,
                        shipping_name = $10, shipping_zip_code = $11, shipping_address_primary = $12,
                        shipping_address_detail = $13, shipping_mobile_number = $14,
                        paid_amount = $15, payment_status = $16, discount_rate = $17, product_id = $18,
                        supply_value = $19, vat_amount = $20, tax_type = $21, tax_exempt_value = $22
                    WHERE sales_id = $23"
                )
                .bind(&item.customerId)
                .bind(&item.productName)
                .bind(&item.specification)
                .bind(item.quantity)
                .bind(item.unitPrice)
                .bind(item.totalAmount)
                .bind(&item.status)
                .bind(&item.memo)
                .bind(order_date_parsed)
                .bind(&item.shippingName)
                .bind(&item.shippingZipCode)
                .bind(&item.shippingAddressPrimary)
                .bind(&item.shippingAddressDetail)
                .bind(&item.shippingMobileNumber)
                .bind(item.paidAmount)
                .bind(&item.paymentStatus)
                .bind(item.discountRate)
                .bind(product_id)
                .bind(supply_value)
                .bind(vat_amount)
                .bind(actual_tax_type)
                .bind(tax_exempt_value)
                .bind(sid)
                .execute(&mut *tx).await?;

                continue;
            }
        }

        // Insert
        let new_sid = format!("{}{:05}", sl_prefix, next_seq);
        next_seq += 1;

        sqlx::query(
            "INSERT INTO sales (
                sales_id, customer_id, product_name, specification, quantity, unit_price,
                total_amount, status, memo, order_date,
                shipping_name, shipping_zip_code, shipping_address_primary, shipping_address_detail, shipping_mobile_number,
                paid_amount, payment_status, discount_rate, product_id, supply_value, vat_amount, tax_type, tax_exempt_value
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)"
        )
        .bind(&new_sid)
        .bind(&item.customerId)
        .bind(&item.productName)
        .bind(&item.specification)
        .bind(item.quantity)
        .bind(item.unitPrice)
        .bind(item.totalAmount)
        .bind(&item.status)
        .bind(&item.memo)
        .bind(order_date_parsed)
        .bind(&item.shippingName)
        .bind(&item.shippingZipCode)
        .bind(&item.shippingAddressPrimary)
        .bind(&item.shippingAddressDetail)
        .bind(&item.shippingMobileNumber)
        .bind(item.paidAmount)
        .bind(&item.paymentStatus)
        .bind(item.discountRate)
        .bind(product_id)
        .bind(supply_value)
        .bind(vat_amount)
        .bind(actual_tax_type)
        .bind(tax_exempt_value)
        .execute(&mut *tx).await?;
    }

    tx.commit().await?;
    DB_MODIFIED.store(true, Ordering::Relaxed);
    Ok(())
}
#[derive(serde::Serialize)]
pub struct MallOrderItem {
    pub orderId: String,
    pub customerName: String,
    pub receiverName: String,
    pub mobile: String,
    pub zip: String,
    pub address: String,
    pub mallProductName: String,
    pub qty: i32,
    pub unitPrice: i32,
}

#[command]
pub async fn fetch_external_mall_orders(
    app: AppHandle,
    mall_type: String,
) -> MyceliumResult<Vec<MallOrderItem>> {
    // 1. Get Keys
    let config_dir = app
        .path()
        .app_config_dir()
        .map_err(|e| MyceliumError::Internal(e.to_string()))?;
    let config_path = config_dir.join("config.json");

    if !config_path.exists() {
        return Err(MyceliumError::Internal("설정 파일이 없습니다.".to_string()));
    }

    let content =
        fs::read_to_string(&config_path).map_err(|e| MyceliumError::Internal(e.to_string()))?;
    let json: serde_json::Value = serde_json::from_str(&content).unwrap_or(serde_json::json!({}));

    // Placeholder for actual API implementation
    // Depending on mall_type, we would use naver_commerce_id/secret or coupang keys
    let _id = json
        .get(match mall_type.as_str() {
            "naver" => "naver_commerce_id",
            "coupang" => "coupang_access_key",
            _ => "",
        })
        .and_then(|v| v.as_str())
        .unwrap_or("");

    // For now, return empty or a "not implemented" error if key is missing
    if _id.is_empty() {
        return Err(MyceliumError::Internal(format!(
            "{} 연동 키가 설정되지 않았습니다.",
            mall_type
        )));
    }

    // Actual HTTP fetching would go here...
    Ok(vec![])
}

#[command]
pub async fn get_tax_report(
    state: State<'_, DbPool>,
    startDate: String,
    endDate: String,
) -> MyceliumResult<Vec<Sales>> {
    let rows = sqlx::query_as::<_, Sales>(
        "SELECT s.*, COALESCE(p.tax_type, '면세') as tax_type
         FROM sales s 
         LEFT JOIN products p ON s.product_id = p.product_id
         WHERE s.order_date BETWEEN $1::DATE AND $2::DATE 
         ORDER BY s.order_date ASC",
    )
    .bind(startDate)
    .bind(endDate)
    .fetch_all(&*state)
    .await?;
    Ok(rows)
}

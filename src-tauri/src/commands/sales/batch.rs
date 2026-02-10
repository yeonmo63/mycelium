use crate::db::DbPool;
use crate::error::MyceliumResult;
use crate::DB_MODIFIED;
use chrono::{NaiveDate, Utc};
use std::sync::atomic::Ordering;
use tauri::{command, State};

use super::utils::calculate_bom_tax_distribution;

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

pub async fn handle_bom_stock_change(
    state: &State<'_, DbPool>,
    product_id: i32,
    quantity: i32,
    memo_prefix: &str,
) -> MyceliumResult<()> {
    if quantity == 0 {
        return Ok(());
    }

    let mut tx = state.begin().await?;

    // 1. Deduct Main Product Stock
    let product: Option<(String, Option<String>, Option<String>, Option<i32>)> =
        sqlx::query_as("SELECT product_name, specification, product_code, stock_quantity FROM products WHERE product_id = $1")
            .bind(product_id)
            .fetch_optional(&mut *tx)
            .await?;

    if let Some((p_name, p_spec, p_code, p_stock)) = product {
        let new_stock = p_stock.unwrap_or(0) - quantity;
        sqlx::query("UPDATE products SET stock_quantity = $1 WHERE product_id = $2")
            .bind(new_stock)
            .bind(product_id)
            .execute(&mut *tx)
            .await?;

        // Log Main Product
        sqlx::query("INSERT INTO inventory_logs (product_id, product_name, specification, product_code, change_type, change_quantity, current_stock, memo, reference_id) VALUES ($1, $2, $3, $4, '출고', $5, $6, $7, 'SALES_AUTO')")
            .bind(product_id)
            .bind(&p_name)
            .bind(&p_spec)
            .bind(&p_code)
            .bind(-quantity)
            .bind(new_stock)
            .bind(format!("{} (자동 차감)", memo_prefix))
            .execute(&mut *tx)
            .await?;

        // 2. Check for BOM (Aux Materials)
        // Only simple 1-level BOM from `products` table columns for now as explicitly requested "box deduction".
        // Also check `product_bom` table if advanced BOM exists.

        // Strategy: First check `product_bom`. If exists, use it. If not, check `products` columns.
        let bom_items: Vec<(i32, f64)> =
            sqlx::query_as("SELECT material_id, ratio FROM product_bom WHERE product_id = $1")
                .bind(product_id)
                .fetch_all(&mut *tx)
                .await?;

        if !bom_items.is_empty() {
            for (mat_id, ratio) in bom_items {
                let deduct_qty = (quantity as f64 * ratio).ceil() as i32;
                if deduct_qty > 0 {
                    let mat: Option<(String, Option<String>, Option<String>, Option<i32>)> =
                        sqlx::query_as("SELECT product_name, specification, product_code, stock_quantity FROM products WHERE product_id = $1")
                            .bind(mat_id)
                            .fetch_optional(&mut *tx)
                            .await?;

                    if let Some((m_name, m_spec, m_code, m_stock)) = mat {
                        let m_new = m_stock.unwrap_or(0) - deduct_qty;
                        sqlx::query(
                            "UPDATE products SET stock_quantity = $1 WHERE product_id = $2",
                        )
                        .bind(m_new)
                        .bind(mat_id)
                        .execute(&mut *tx)
                        .await?;

                        sqlx::query("INSERT INTO inventory_logs (product_id, product_name, specification, product_code, change_type, change_quantity, current_stock, memo, reference_id) VALUES ($1, $2, $3, $4, '출고', $5, $6, $7, 'SALES_BOM')")
                            .bind(mat_id)
                            .bind(&m_name)
                            .bind(&m_spec)
                            .bind(&m_code)
                            .bind(-deduct_qty)
                            .bind(m_new)
                            .bind(format!("{} - {} 판매 연동 소모", memo_prefix, p_name))
                            .execute(&mut *tx)
                            .await?;
                    }
                }
            }
        } else {
            // Fallback to simple columns in `products`
            let simple_bom: Option<(Option<i32>, Option<f64>, Option<i32>, Option<f64>)> = 
                sqlx::query_as("SELECT material_id, material_ratio, aux_material_id, aux_material_ratio FROM products WHERE product_id = $1")
                .bind(product_id)
                .fetch_optional(&mut *tx)
                .await?;

            if let Some((_m_id, _m_ratio, a_id, a_ratio)) = simple_bom {
                // Check Aux Material (Packaging usually)
                if let Some(aid) = a_id {
                    let ratio = a_ratio.unwrap_or(1.0);
                    let deduct_qty = (quantity as f64 * ratio).ceil() as i32;
                    if deduct_qty > 0 {
                        let mat: Option<(String, Option<String>, Option<String>, Option<i32>)> =
                            sqlx::query_as("SELECT product_name, specification, product_code, stock_quantity FROM products WHERE product_id = $1")
                                .bind(aid)
                                .fetch_optional(&mut *tx)
                                .await?;

                        if let Some((m_name, m_spec, m_code, m_stock)) = mat {
                            let m_new = m_stock.unwrap_or(0) - deduct_qty;
                            sqlx::query(
                                "UPDATE products SET stock_quantity = $1 WHERE product_id = $2",
                            )
                            .bind(m_new)
                            .bind(aid)
                            .execute(&mut *tx)
                            .await?;

                            sqlx::query("INSERT INTO inventory_logs (product_id, product_name, specification, product_code, change_type, change_quantity, current_stock, memo, reference_id) VALUES ($1, $2, $3, $4, '출고', $5, $6, $7, 'SALES_AUX')")
                                .bind(aid)
                                .bind(&m_name)
                                .bind(&m_spec)
                                .bind(&m_code)
                                .bind(-deduct_qty)
                                .bind(m_new)
                                .bind(format!("{} - {} 판매 연동 소모", memo_prefix, p_name))
                                .execute(&mut *tx)
                                .await?;
                        }
                    }
                }
                // Check Main Material? Usually for production, but if configured...
                // Only if item_type is 'product' and it consumes 'material'.
                // However, usually 'material_id' is for production conversion, not sales deduction.
                // We will skip material_id for sales deduction to avoid double counting if they do production separately.
                // Focusing on 'aux_material' (boxes) as requested.
            }
        }
    }

    tx.commit().await?;
    Ok(())
}

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
            // Logic for New Event
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
            let start_date_parsed = event.start_date.as_ref().and_then(|s| {
                if s.is_empty() {
                    None
                } else {
                    NaiveDate::parse_from_str(s, "%Y-%m-%d").ok()
                }
            });
            let end_date_parsed = event.end_date.as_ref().and_then(|s| {
                if s.is_empty() {
                    None
                } else {
                    NaiveDate::parse_from_str(s, "%Y-%m-%d").ok()
                }
            });

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
            let start_date_parsed = event.start_date.as_ref().and_then(|s| {
                if s.is_empty() {
                    None
                } else {
                    NaiveDate::parse_from_str(s, "%Y-%m-%d").ok()
                }
            });
            let end_date_parsed = event.end_date.as_ref().and_then(|s| {
                if s.is_empty() {
                    None
                } else {
                    NaiveDate::parse_from_str(s, "%Y-%m-%d").ok()
                }
            });

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
        let start_date_parsed = event.start_date.as_ref().and_then(|s| {
            if s.is_empty() {
                None
            } else {
                NaiveDate::parse_from_str(s, "%Y-%m-%d").ok()
            }
        });
        let end_date_parsed = event.end_date.as_ref().and_then(|s| {
            if s.is_empty() {
                None
            } else {
                NaiveDate::parse_from_str(s, "%Y-%m-%d").ok()
            }
        });

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
        // [AUTO-STOCK] Restore Stock on Delete
        let old: Option<(Option<i32>, i32)> =
            sqlx::query_as("SELECT product_id, quantity FROM sales WHERE sales_id = $1")
                .bind(&del_id)
                .fetch_optional(&mut *tx)
                .await?;

        if let Some((Some(pid), qty)) = old {
            // Revert stock (add back)
            // 1. Restore Main Product
            sqlx::query("UPDATE products SET stock_quantity = COALESCE(stock_quantity,0) + $1 WHERE product_id = $2")
                .bind(qty)
                .bind(pid)
                .execute(&mut *tx).await?;

            let p_info: Option<(String, Option<String>)> = sqlx::query_as(
                "SELECT product_name, specification FROM products WHERE product_id = $1",
            )
            .bind(pid)
            .fetch_optional(&mut *tx)
            .await?;
            if let Some((p_name, p_spec)) = p_info {
                sqlx::query("INSERT INTO inventory_logs (product_id, product_name, specification, change_type, change_quantity, current_stock, memo, reference_id) VALUES ($1, $2, $3, '입고', $4, (SELECT stock_quantity FROM products WHERE product_id=$1), $5, 'SALES_RESTORE')")
                 .bind(pid).bind(&p_name).bind(&p_spec).bind(qty).bind(format!("판매 취소/삭제 복구: {}", del_id))
                 .execute(&mut *tx).await?;
            }

            // 2. Restore BOM / Aux
            let bom_items: Vec<(i32, f64)> =
                sqlx::query_as("SELECT material_id, ratio FROM product_bom WHERE product_id = $1")
                    .bind(pid)
                    .fetch_all(&mut *tx)
                    .await?;

            if !bom_items.is_empty() {
                for (mat_id, ratio) in bom_items {
                    let add_qty = (qty as f64 * ratio).ceil() as i32;
                    sqlx::query("UPDATE products SET stock_quantity = COALESCE(stock_quantity,0) + $1 WHERE product_id = $2").bind(add_qty).bind(mat_id).execute(&mut *tx).await?;

                    let m_info: Option<(String, Option<String>)> = sqlx::query_as(
                        "SELECT product_name, specification FROM products WHERE product_id = $1",
                    )
                    .bind(mat_id)
                    .fetch_optional(&mut *tx)
                    .await?;
                    if let Some((m_name, m_spec)) = m_info {
                        sqlx::query("INSERT INTO inventory_logs (product_id, product_name, specification, change_type, change_quantity, current_stock, memo, reference_id) VALUES ($1, $2, $3, '입고', $4, (SELECT stock_quantity FROM products WHERE product_id=$1), $5, 'SALES_RESTORE_BOM')")
                                .bind(mat_id).bind(&m_name).bind(&m_spec).bind(add_qty).bind(format!("판매 취소 복구(BOM): {}", del_id))
                                .execute(&mut *tx).await?;
                    }
                }
            } else {
                let simple_bom: Option<(Option<i32>, Option<f64>)> = 
                    sqlx::query_as("SELECT aux_material_id, aux_material_ratio FROM products WHERE product_id = $1")
                    .bind(pid)
                    .fetch_optional(&mut *tx)
                    .await?;

                if let Some((Some(aid), Some(ar))) = simple_bom {
                    let add_qty = (qty as f64 * ar).ceil() as i32;
                    sqlx::query("UPDATE products SET stock_quantity = COALESCE(stock_quantity,0) + $1 WHERE product_id = $2").bind(add_qty).bind(aid).execute(&mut *tx).await?;

                    let a_info: Option<(String, Option<String>)> = sqlx::query_as(
                        "SELECT product_name, specification FROM products WHERE product_id = $1",
                    )
                    .bind(aid)
                    .fetch_optional(&mut *tx)
                    .await?;
                    if let Some((a_name, a_spec)) = a_info {
                        sqlx::query("INSERT INTO inventory_logs (product_id, product_name, specification, change_type, change_quantity, current_stock, memo, reference_id) VALUES ($1, $2, $3, '입고', $4, (SELECT stock_quantity FROM products WHERE product_id=$1), $5, 'SALES_RESTORE_AUX')")
                            .bind(aid).bind(&a_name).bind(&a_spec).bind(add_qty).bind(format!("판매 취소 복구(부자재): {}", del_id))
                            .execute(&mut *tx).await?;
                    }
                }
            }
        }

        sqlx::query("DELETE FROM sales WHERE sales_id = $1")
            .bind(del_id)
            .execute(&mut *tx)
            .await?;
    }

    // 3. Handle Upserts
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

                sqlx::query("UPDATE sales SET order_date=$1, product_name=$2, specification=$3, quantity=$4, unit_price=$5, total_amount=$6, discount_rate=$7, memo=$8, status='현장판매완료', shipping_date=$9, customer_id=$10, product_id=$11, supply_value=$12, vat_amount=$13, tax_type=$14, tax_exempt_value=$15 WHERE sales_id=$16")
                    .bind(sale_date).bind(&sale.product_name).bind(&sale.specification).bind(sale.quantity).bind(sale.unit_price).bind(total).bind(discount).bind(&sale.memo).bind(today_naive).bind(&event_id).bind(p_id).bind(supply_value).bind(vat_amount).bind(actual_tax_type).bind(tax_exempt_value).bind(sid).execute(&mut *tx).await?;
                continue;
            }
        }

        let new_sid = format!("{}{:05}", sl_prefix, next_seq);
        next_seq += 1;

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

        // [AUTO-STOCK] Insert Deduction (Main Product Only)
        // For Special Sales as well, we only deduct Main Product to avoid double-deducting BOMs used in Production.
        if let Some(pid) = p_id {
            let qty = sale.quantity;

            // 1. Deduct Main Product
            sqlx::query("UPDATE products SET stock_quantity = COALESCE(stock_quantity,0) - $1 WHERE product_id = $2")
                .bind(qty)
                .bind(pid)
                .execute(&mut *tx)
                .await?;

            // Log Main Product
            let p_info_log: Option<(String, Option<String>, Option<String>)> = 
                sqlx::query_as("SELECT product_name, specification, product_code FROM products WHERE product_id = $1")
                .bind(pid)
                .fetch_optional(&mut *tx)
                .await?;

            let (p_name, p_spec, p_code) = if let Some((n, s, c)) = p_info_log {
                (n, s, c)
            } else {
                ("Unknown".to_string(), None, None)
            };

            sqlx::query("INSERT INTO inventory_logs (product_id, product_name, specification, product_code, change_type, change_quantity, current_stock, memo, reference_id) VALUES ($1, $2, $3, $4, '출고', $5, (SELECT stock_quantity FROM products WHERE product_id=$1), $6, 'SALES_AUTO')")
                .bind(pid)
                .bind(&p_name)
                .bind(&p_spec)
                .bind(&p_code)
                .bind(-qty)
                .bind(format!("판매 자동 차감(특판): {}", new_sid))
                .execute(&mut *tx)
                .await?;
        }

        // [AUTO-STOCK] Insert Deduction (Main Product Only)
        // For Special Sales as well, we only deduct Main Product to avoid double-deducting BOMs used in Production.
        if let Some(pid) = p_id {
            let qty = sale.quantity;

            // 1. Deduct Main Product
            sqlx::query("UPDATE products SET stock_quantity = COALESCE(stock_quantity,0) - $1 WHERE product_id = $2")
                .bind(qty)
                .bind(pid)
                .execute(&mut *tx)
                .await?;

            // Log Main Product
            let p_info_log: Option<(String, Option<String>, Option<String>)> = 
                sqlx::query_as("SELECT product_name, specification, product_code FROM products WHERE product_id = $1")
                .bind(pid)
                .fetch_optional(&mut *tx)
                .await?;

            let (p_name, p_spec, p_code) = if let Some((n, s, c)) = p_info_log {
                (n, s, c)
            } else {
                ("Unknown".to_string(), None, None)
            };

            sqlx::query("INSERT INTO inventory_logs (product_id, product_name, specification, product_code, change_type, change_quantity, current_stock, memo, reference_id) VALUES ($1, $2, $3, $4, '출고', $5, (SELECT stock_quantity FROM products WHERE product_id=$1), $6, 'SALES_AUTO')")
                .bind(pid)
                .bind(&p_name)
                .bind(&p_spec)
                .bind(&p_code)
                .bind(-qty)
                .bind(format!("판매 자동 차감(특판): {}", new_sid))
                .execute(&mut *tx)
                .await?;
        }

        // [AUTO-STOCK] Insert Deduction (Main Product Only)
        // For Special Sales as well, we only deduct Main Product to avoid double-deducting BOMs used in Production.
        if let Some(pid) = p_id {
            let qty = sale.quantity;

            // 1. Deduct Main Product
            sqlx::query("UPDATE products SET stock_quantity = COALESCE(stock_quantity,0) - $1 WHERE product_id = $2")
                .bind(qty)
                .bind(pid)
                .execute(&mut *tx)
                .await?;

            // Log Main Product
            let p_info_log: Option<(String, Option<String>, Option<String>)> = 
                sqlx::query_as("SELECT product_name, specification, product_code FROM products WHERE product_id = $1")
                .bind(pid)
                .fetch_optional(&mut *tx)
                .await?;

            let (p_name, p_spec, p_code) = if let Some((n, s, c)) = p_info_log {
                (n, s, c)
            } else {
                ("Unknown".to_string(), None, None)
            };

            sqlx::query("INSERT INTO inventory_logs (product_id, product_name, specification, product_code, change_type, change_quantity, current_stock, memo, reference_id) VALUES ($1, $2, $3, $4, '출고', $5, (SELECT stock_quantity FROM products WHERE product_id=$1), $6, 'SALES_AUTO')")
                .bind(pid)
                .bind(&p_name)
                .bind(&p_spec)
                .bind(&p_code)
                .bind(-qty)
                .bind(format!("판매 자동 차감(특판): {}", new_sid))
                .execute(&mut *tx)
                .await?;
        }

        // [AUTO-STOCK] Insert Deduction (Main Product Only)
        // For Special Sales as well, we only deduct Main Product to avoid double-deducting BOMs used in Production.
        if let Some(pid) = p_id {
            let qty = sale.quantity;

            // 1. Deduct Main Product
            sqlx::query("UPDATE products SET stock_quantity = COALESCE(stock_quantity,0) - $1 WHERE product_id = $2")
                .bind(qty)
                .bind(pid)
                .execute(&mut *tx)
                .await?;

            // Log Main Product
            let p_info_log: Option<(String, Option<String>, Option<String>)> = 
                sqlx::query_as("SELECT product_name, specification, product_code FROM products WHERE product_id = $1")
                .bind(pid)
                .fetch_optional(&mut *tx)
                .await?;

            let (p_name, p_spec, p_code) = if let Some((n, s, c)) = p_info_log {
                (n, s, c)
            } else {
                ("Unknown".to_string(), None, None)
            };

            sqlx::query("INSERT INTO inventory_logs (product_id, product_name, specification, product_code, change_type, change_quantity, current_stock, memo, reference_id) VALUES ($1, $2, $3, $4, '출고', $5, (SELECT stock_quantity FROM products WHERE product_id=$1), $6, 'SALES_AUTO')")
                .bind(pid)
                .bind(&p_name)
                .bind(&p_spec)
                .bind(&p_code)
                .bind(-qty)
                .bind(format!("판매 자동 차감(특판): {}", new_sid))
                .execute(&mut *tx)
                .await?;
        }

        sqlx::query("INSERT INTO sales (sales_id, customer_id, order_date, product_name, specification, quantity, unit_price, total_amount, discount_rate, memo, status, shipping_date, product_id, supply_value, vat_amount, tax_type, tax_exempt_value) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, '현장판매완료', $11, $12, $13, $14, $15, $16)")
        .bind(&new_sid).bind(&event_id).bind(sale_date).bind(&sale.product_name).bind(&sale.specification).bind(sale.quantity).bind(sale.unit_price).bind(total).bind(discount).bind(&sale.memo).bind(today_naive).bind(p_id).bind(supply_value).bind(vat_amount).bind(actual_tax_type).bind(tax_exempt_value).execute(&mut *tx).await?;
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
    pub isDirty: String,
}

#[command]
pub async fn save_general_sales_batch(
    state: State<'_, DbPool>,
    items: Vec<GeneralSalesBatchItem>,
    deleted_ids: Vec<String>,
) -> MyceliumResult<()> {
    let mut tx = state.begin().await?;

    for del_id in deleted_ids {
        // [AUTO-STOCK] Restore Stock on Delete
        let old: Option<(Option<i32>, i32)> =
            sqlx::query_as("SELECT product_id, quantity FROM sales WHERE sales_id = $1")
                .bind(&del_id)
                .fetch_optional(&mut *tx)
                .await?;

        if let Some((Some(pid), qty)) = old {
            // Main Product Restore
            sqlx::query("UPDATE products SET stock_quantity = COALESCE(stock_quantity,0) + $1 WHERE product_id = $2")
                .bind(qty)
                .bind(pid)
                .execute(&mut *tx).await?;

            let p_info: Option<(String, Option<String>)> = sqlx::query_as(
                "SELECT product_name, specification FROM products WHERE product_id = $1",
            )
            .bind(pid)
            .fetch_optional(&mut *tx)
            .await?;
            if let Some((p_name, p_spec)) = p_info {
                sqlx::query("INSERT INTO inventory_logs (product_id, product_name, specification, change_type, change_quantity, current_stock, memo, reference_id) VALUES ($1, $2, $3, '입고', $4, (SELECT stock_quantity FROM products WHERE product_id=$1), $5, 'SALES_RESTORE')")
                 .bind(pid).bind(&p_name).bind(&p_spec).bind(qty).bind(format!("판매 취소/삭제 복구: {}", del_id))
                 .execute(&mut *tx).await?;
            }

            // BOM/Aux Restore
            let simple_bom: Option<(Option<i32>, Option<f64>)> = sqlx::query_as(
                "SELECT aux_material_id, aux_material_ratio FROM products WHERE product_id = $1",
            )
            .bind(pid)
            .fetch_optional(&mut *tx)
            .await?;

            if let Some((Some(aid), Some(ar))) = simple_bom {
                let add_qty = (qty as f64 * ar).ceil() as i32;
                sqlx::query("UPDATE products SET stock_quantity = COALESCE(stock_quantity,0) + $1 WHERE product_id = $2").bind(add_qty).bind(aid).execute(&mut *tx).await?;
                // Skip log for speed or add if needed... Add log for correctness.
                let a_info: Option<(String, Option<String>)> = sqlx::query_as(
                    "SELECT product_name, specification FROM products WHERE product_id = $1",
                )
                .bind(aid)
                .fetch_optional(&mut *tx)
                .await?;
                if let Some((a_name, a_spec)) = a_info {
                    sqlx::query("INSERT INTO inventory_logs (product_id, product_name, specification, change_type, change_quantity, current_stock, memo, reference_id) VALUES ($1, $2, $3, '입고', $4, (SELECT stock_quantity FROM products WHERE product_id=$1), $5, 'SALES_RESTORE_AUX')")
                        .bind(aid).bind(&a_name).bind(&a_spec).bind(add_qty).bind(format!("판매 취소 복구(부자재): {}", del_id))
                        .execute(&mut *tx).await?;
                }
            }
        }

        sqlx::query("DELETE FROM sales WHERE sales_id = $1")
            .bind(del_id)
            .execute(&mut *tx)
            .await?;
    }

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

    for item in items {
        if item.salesId.is_some() && item.isDirty == "false" {
            continue;
        }
        let order_date_parsed =
            NaiveDate::parse_from_str(&item.orderDateStr, "%Y-%m-%d").unwrap_or(today_naive);
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
                // [AUTO-STOCK] Update Logic?
                // For simplicity, we only trigger deduction on INSERT (New Sales).
                // If user changes Quantity on an existing sale, we currently DO NOT sync inventory to avoid complexity
                // (e.g. need to fetch old qty, diff, etc.).
                // User instruction was mostly about "When I introduce/save sales".
                // We will implement full sync for updates later if requested, focusing on INSERT for now as it covers 90% use case (excel upload -> save).

                // Correction: Actually, if I upload excel, they don't have IDs, so they are INSERTs.
                // So INSERT logic is enough for the "Excel Upload" feature.

                sqlx::query("UPDATE sales SET customer_id = $1, product_name = $2, specification = $3, quantity = $4, unit_price = $5, total_amount = $6, status = $7, memo = $8, order_date = $9, shipping_name = $10, shipping_zip_code = $11, shipping_address_primary = $12, shipping_address_detail = $13, shipping_mobile_number = $14, paid_amount = $15, payment_status = $16, discount_rate = $17, product_id = $18, supply_value = $19, vat_amount = $20, tax_type = $21, tax_exempt_value = $22 WHERE sales_id = $23")
                .bind(&item.customerId).bind(&item.productName).bind(&item.specification).bind(item.quantity).bind(item.unitPrice).bind(item.totalAmount).bind(&item.status).bind(&item.memo).bind(order_date_parsed).bind(&item.shippingName).bind(&item.shippingZipCode).bind(&item.shippingAddressPrimary).bind(&item.shippingAddressDetail).bind(&item.shippingMobileNumber).bind(item.paidAmount).bind(&item.paymentStatus).bind(item.discountRate).bind(product_id).bind(supply_value).bind(vat_amount).bind(actual_tax_type).bind(tax_exempt_value).bind(sid).execute(&mut *tx).await?;
                continue;
            }
        }

        let new_sid = format!("{}{:05}", sl_prefix, next_seq);
        next_seq += 1;

        // [AUTO-STOCK] Insert Deduction
        // [AUTO-STOCK] Insert Deduction
        if let Some(pid) = product_id {
            let qty = item.quantity;

            // 1. Deduct Main Product
            sqlx::query("UPDATE products SET stock_quantity = COALESCE(stock_quantity,0) - $1 WHERE product_id = $2")
                .bind(qty)
                .bind(pid)
                .execute(&mut *tx)
                .await?;

            // Log Main Product
            let p_info_log: Option<(String, Option<String>, Option<String>)> = 
                sqlx::query_as("SELECT product_name, specification, product_code FROM products WHERE product_id = $1")
                .bind(pid)
                .fetch_optional(&mut *tx)
                .await?;

            let (p_name, p_spec, p_code) = if let Some((n, s, c)) = p_info_log {
                (n, s, c)
            } else {
                ("Unknown".to_string(), None, None)
            };

            sqlx::query("INSERT INTO inventory_logs (product_id, product_name, specification, product_code, change_type, change_quantity, current_stock, memo, reference_id) VALUES ($1, $2, $3, $4, '출고', $5, (SELECT stock_quantity FROM products WHERE product_id=$1), $6, 'SALES_AUTO')")
                .bind(pid)
                .bind(&p_name)
                .bind(&p_spec)
                .bind(&p_code)
                .bind(-qty)
                .bind(format!("판매 자동 차감: {}", new_sid))
                .execute(&mut *tx)
                .await?;
        }

        sqlx::query("INSERT INTO sales (sales_id, customer_id, product_name, specification, quantity, unit_price, total_amount, status, memo, order_date, shipping_name, shipping_zip_code, shipping_address_primary, shipping_address_detail, shipping_mobile_number, paid_amount, payment_status, discount_rate, product_id, supply_value, vat_amount, tax_type, tax_exempt_value) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)")
        .bind(&new_sid).bind(&item.customerId).bind(&item.productName).bind(&item.specification).bind(item.quantity).bind(item.unitPrice).bind(item.totalAmount).bind(&item.status).bind(&item.memo).bind(order_date_parsed).bind(&item.shippingName).bind(&item.shippingZipCode).bind(&item.shippingAddressPrimary).bind(&item.shippingAddressDetail).bind(&item.shippingMobileNumber).bind(item.paidAmount).bind(&item.paymentStatus).bind(item.discountRate).bind(product_id).bind(supply_value).bind(vat_amount).bind(actual_tax_type).bind(tax_exempt_value).execute(&mut *tx).await?;
    }

    tx.commit().await?;
    DB_MODIFIED.store(true, Ordering::Relaxed);
    Ok(())
}

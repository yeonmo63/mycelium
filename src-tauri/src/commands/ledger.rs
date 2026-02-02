#![allow(non_snake_case)]
use crate::db::Customer;
use crate::db::DbPool;
use crate::DB_MODIFIED;
use chrono::NaiveDate;
use std::sync::atomic::Ordering;
use tauri::{command, State};

#[command]
pub async fn get_customer_ledger(
    state: State<'_, DbPool>,
    customerId: String,
    startDate: Option<String>,
    endDate: Option<String>,
) -> Result<Vec<crate::db::CustomerLedgerEntry>, String> {
    let mut sql = r#"
        SELECT 
            ledger_id, 
            customer_id, 
            to_char(transaction_date, 'YYYY-MM-DD') as transaction_date,
            transaction_type, 
            amount, 
            description, 
            reference_id,
            SUM(amount) OVER (PARTITION BY customer_id ORDER BY transaction_date ASC, ledger_id ASC)::BIGINT as running_balance
        FROM customer_ledger 
        WHERE customer_id = $1
    "#.to_string();

    let rows = if let (Some(s), Some(e)) = (startDate, endDate) {
        let sd = NaiveDate::parse_from_str(&s, "%Y-%m-%d").unwrap_or_default();
        let ed = NaiveDate::parse_from_str(&e, "%Y-%m-%d").unwrap_or_default();
        sql.push_str(" AND transaction_date BETWEEN $2 AND $3");
        sql.push_str(" ORDER BY transaction_date DESC, ledger_id DESC");

        sqlx::query_as::<_, crate::db::CustomerLedgerEntry>(&sql)
            .bind(customerId)
            .bind(sd)
            .bind(ed)
            .fetch_all(&*state)
            .await
    } else {
        sql.push_str(" ORDER BY transaction_date DESC, ledger_id DESC");
        sqlx::query_as::<_, crate::db::CustomerLedgerEntry>(&sql)
            .bind(customerId)
            .fetch_all(&*state)
            .await
    };

    rows.map_err(|e| e.to_string())
}

#[command]
pub async fn create_ledger_entry(
    state: State<'_, DbPool>,
    customerId: String,
    transactionDate: String,
    transactionType: String, // '입금', '이월', '조정', '반품' etc
    amount: i32,
    description: Option<String>,
) -> Result<i32, String> {
    DB_MODIFIED.store(true, Ordering::Relaxed);

    // Rule:
    // '입금' (Payment) -> Should be negative effect on balance.
    // '조정' (Adjustment) -> Can be + or -.
    // '이월' (CarryOver) -> Positive (Debt).

    let final_amount = match transactionType.as_str() {
        "입금" => -amount.abs(), // Always negative
        "이월" => amount.abs(),  // Always positive
        "매출" => amount.abs(),
        "반품" | "매출취소" => -amount.abs(),
        _ => amount, // '조정' relies on input sign
    };

    let t_date = NaiveDate::parse_from_str(&transactionDate, "%Y-%m-%d")
        .map_err(|e| format!("Invalid date: {}", e))?;

    let mut tx = state.begin().await.map_err(|e| e.to_string())?;

    let row: (i32,) = sqlx::query_as(
        "INSERT INTO customer_ledger (customer_id, transaction_date, transaction_type, amount, description)
         VALUES ($1, $2, $3, $4, $5) RETURNING ledger_id"
    )
    .bind(&customerId)
    .bind(t_date)
    .bind(&transactionType)
    .bind(final_amount)
    .bind(description)
    .fetch_one(&mut *tx)
    .await
    .map_err(|e: sqlx::Error| e.to_string())?;

    // Update Customer Balance
    sqlx::query("UPDATE customers SET current_balance = COALESCE(current_balance, 0) + $1 WHERE customer_id = $2")
        .bind(final_amount)
        .bind(&customerId)
        .execute(&mut *tx)
        .await
        .map_err(|e: sqlx::Error| e.to_string())?;

    tx.commit().await.map_err(|e| e.to_string())?;

    Ok(row.0)
}

#[command]
pub async fn update_ledger_entry(
    state: State<'_, DbPool>,
    ledgerId: i32,
    transactionDate: String,
    transactionType: String, // '입금', '이월', '조정', '반품' etc
    amount: i32,
    description: Option<String>,
) -> Result<(), String> {
    DB_MODIFIED.store(true, Ordering::Relaxed);
    let mut tx = state.begin().await.map_err(|e| e.to_string())?;

    // 1. Get Old Entry
    let old_entry: (i32, String) =
        sqlx::query_as("SELECT amount, customer_id FROM customer_ledger WHERE ledger_id = $1")
            .bind(ledgerId)
            .fetch_one(&mut *tx)
            .await
            .map_err(|e| format!("Entry not found: {}", e))?;

    let old_amount = old_entry.0;
    let customer_id = old_entry.1;

    // 2. Calculate Final Amount based on Type (Same logic as Create)
    let final_amount = match transactionType.as_str() {
        "입금" => -amount.abs(), // Always negative
        "이월" => amount.abs(),  // Always positive
        "매출" => amount.abs(),
        "반품" | "매출취소" => -amount.abs(),
        _ => amount, // '조정' relies on input sign
    };

    let diff = final_amount - old_amount;

    let t_date = NaiveDate::parse_from_str(&transactionDate, "%Y-%m-%d")
        .map_err(|e| format!("Invalid date: {}", e))?;

    // 3. Update Ledger
    sqlx::query(
        "UPDATE customer_ledger SET transaction_date = $1, transaction_type = $2, amount = $3, description = $4 WHERE ledger_id = $5"
    )
    .bind(t_date)
    .bind(&transactionType)
    .bind(final_amount)
    .bind(description)
    .bind(ledgerId)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    // 4. Update Balance
    if diff != 0 {
        sqlx::query("UPDATE customers SET current_balance = COALESCE(current_balance, 0) + $1 WHERE customer_id = $2")
            .bind(diff)
            .bind(customer_id)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
    }

    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(())
}

#[command]
pub async fn delete_ledger_entry(state: State<'_, DbPool>, ledgerId: i32) -> Result<(), String> {
    DB_MODIFIED.store(true, Ordering::Relaxed);
    let mut tx = state.begin().await.map_err(|e| e.to_string())?;

    // 1. Get Old Entry
    let old_entry: (i32, String) =
        sqlx::query_as("SELECT amount, customer_id FROM customer_ledger WHERE ledger_id = $1")
            .bind(ledgerId)
            .fetch_one(&mut *tx)
            .await
            .map_err(|e| format!("Entry not found: {}", e))?;

    let amount = old_entry.0;
    let customer_id = old_entry.1;

    // 2. Delete
    sqlx::query("DELETE FROM customer_ledger WHERE ledger_id = $1")
        .bind(ledgerId)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    // 3. Update Balance (Reverse effect)
    sqlx::query("UPDATE customers SET current_balance = COALESCE(current_balance, 0) - $1 WHERE customer_id = $2")
        .bind(amount)
        .bind(customer_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(())
}

#[command]
pub async fn get_customers_with_debt(state: State<'_, DbPool>) -> Result<Vec<Customer>, String> {
    // 1. Sync current_balance from ledger sum for all customers to ensure integrity
    // This repairs any discrepancies caused by manual edits or bugs.
    sqlx::query(
        "UPDATE customers c SET current_balance = COALESCE((SELECT SUM(amount) FROM customer_ledger l WHERE l.customer_id = c.customer_id), 0)"
    )
    .execute(&*state)
    .await
    .map_err(|e| e.to_string())?;

    // 2. Fetch only customers with debt > 0 and active status
    let sql = r#"
        SELECT * FROM customers 
        WHERE current_balance > 0 AND status = '정상'
        ORDER BY current_balance DESC
    "#;

    sqlx::query_as::<_, Customer>(sql)
        .fetch_all(&*state)
        .await
        .map_err(|e| e.to_string())
}

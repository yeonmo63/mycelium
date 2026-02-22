#![allow(non_snake_case)]
use crate::db::Customer;
use crate::db::DbPool;
use crate::error::{MyceliumError, MyceliumResult};
use crate::stubs::State;
use crate::DB_MODIFIED;
use axum::extract::{Json, Query, State as AxumState};
use chrono::NaiveDate;
use std::sync::atomic::Ordering;

pub async fn get_customer_ledger(
    state: State<'_, DbPool>,
    customerId: String,
    startDate: Option<String>,
    endDate: Option<String>,
) -> MyceliumResult<Vec<crate::db::CustomerLedgerEntry>> {
    get_customer_ledger_internal(&*state, customerId, startDate, endDate).await
}

async fn get_customer_ledger_internal(
    pool: &DbPool,
    customerId: String,
    startDate: Option<String>,
    endDate: Option<String>,
) -> MyceliumResult<Vec<crate::db::CustomerLedgerEntry>> {
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

    if let (Some(s), Some(e)) = (startDate, endDate) {
        let sd = NaiveDate::parse_from_str(&s, "%Y-%m-%d")
            .map_err(|e| MyceliumError::Validation(format!("Invalid start date: {}", e)))?;
        let ed = NaiveDate::parse_from_str(&e, "%Y-%m-%d")
            .map_err(|e| MyceliumError::Validation(format!("Invalid end date: {}", e)))?;
        sql.push_str(" AND transaction_date BETWEEN $2 AND $3");
        sql.push_str(" ORDER BY transaction_date DESC, ledger_id DESC");

        Ok(sqlx::query_as::<_, crate::db::CustomerLedgerEntry>(&sql)
            .bind(customerId)
            .bind(sd)
            .bind(ed)
            .fetch_all(pool)
            .await?)
    } else {
        sql.push_str(" ORDER BY transaction_date DESC, ledger_id DESC");
        Ok(sqlx::query_as::<_, crate::db::CustomerLedgerEntry>(&sql)
            .bind(customerId)
            .fetch_all(pool)
            .await?)
    }
}

pub async fn create_ledger_entry(
    state: State<'_, DbPool>,
    customerId: String,
    transactionDate: String,
    transactionType: String, // '입금', '이월', '조정', '반품' etc
    amount: i32,
    description: Option<String>,
) -> MyceliumResult<i32> {
    create_ledger_entry_internal(
        &*state,
        customerId,
        transactionDate,
        transactionType,
        amount,
        description,
    )
    .await
}

async fn create_ledger_entry_internal(
    pool: &DbPool,
    customerId: String,
    transactionDate: String,
    transactionType: String,
    amount: i32,
    description: Option<String>,
) -> MyceliumResult<i32> {
    DB_MODIFIED.store(true, Ordering::Relaxed);

    let final_amount = match transactionType.as_str() {
        "입금" => -amount.abs(), // Always negative
        "이월" => amount.abs(),  // Always positive
        "매출" => amount.abs(),
        "반품" | "매출취소" => -amount.abs(),
        _ => amount, // '조정' -> use sign as is
    };

    let t_date = NaiveDate::parse_from_str(&transactionDate, "%Y-%m-%d")
        .map_err(|e| MyceliumError::Validation(format!("Invalid date: {}", e)))?;

    let mut tx = pool.begin().await?;

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
    .await?;

    // Update Customer Balance
    sqlx::query("UPDATE customers SET current_balance = COALESCE(current_balance, 0) + $1 WHERE customer_id = $2")
        .bind(final_amount)
        .bind(&customerId)
        .execute(&mut *tx)
        .await?;

    tx.commit().await?;

    Ok(row.0)
}

pub async fn update_ledger_entry(
    state: State<'_, DbPool>,
    ledgerId: i32,
    transactionDate: String,
    transactionType: String, // '입금', '이월', '조정', '반품' etc
    amount: i32,
    description: Option<String>,
) -> MyceliumResult<()> {
    update_ledger_entry_internal(
        &*state,
        ledgerId,
        transactionDate,
        transactionType,
        amount,
        description,
    )
    .await
}

async fn update_ledger_entry_internal(
    pool: &DbPool,
    ledgerId: i32,
    transactionDate: String,
    transactionType: String,
    amount: i32,
    description: Option<String>,
) -> MyceliumResult<()> {
    DB_MODIFIED.store(true, Ordering::Relaxed);
    let mut tx = pool.begin().await?;

    // 1. Get Old Entry
    let old_entry: Option<(i32, String)> =
        sqlx::query_as("SELECT amount, customer_id FROM customer_ledger WHERE ledger_id = $1")
            .bind(ledgerId)
            .fetch_optional(&mut *tx)
            .await?;

    let (old_amount, customer_id) = match old_entry {
        Some(entry) => entry,
        None => return Err(MyceliumError::Validation("Ledger entry not found".into())),
    };

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
        .map_err(|e| MyceliumError::Validation(format!("Invalid date: {}", e)))?;

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
    .await?;

    // 4. Update Balance
    if diff != 0 {
        sqlx::query("UPDATE customers SET current_balance = COALESCE(current_balance, 0) + $1 WHERE customer_id = $2")
            .bind(diff)
            .bind(&customer_id)
            .execute(&mut *tx)
            .await?;
    }

    tx.commit().await?;
    Ok(())
}

pub async fn delete_ledger_entry(state: State<'_, DbPool>, ledgerId: i32) -> MyceliumResult<()> {
    delete_ledger_entry_internal(&*state, ledgerId).await
}

async fn delete_ledger_entry_internal(pool: &DbPool, ledgerId: i32) -> MyceliumResult<()> {
    DB_MODIFIED.store(true, Ordering::Relaxed);
    let mut tx = pool.begin().await?;

    // 1. Get Old Entry
    let old_entry: Option<(i32, String)> =
        sqlx::query_as("SELECT amount, customer_id FROM customer_ledger WHERE ledger_id = $1")
            .bind(ledgerId)
            .fetch_optional(&mut *tx)
            .await?;

    let (amount, customer_id) = match old_entry {
        Some(entry) => entry,
        None => return Err(MyceliumError::Validation("Ledger entry not found".into())),
    };

    // 2. Delete
    sqlx::query("DELETE FROM customer_ledger WHERE ledger_id = $1")
        .bind(ledgerId)
        .execute(&mut *tx)
        .await?;

    // 3. Update Balance (Reverse effect)
    sqlx::query("UPDATE customers SET current_balance = COALESCE(current_balance, 0) - $1 WHERE customer_id = $2")
        .bind(amount)
        .bind(customer_id)
        .execute(&mut *tx)
        .await?;

    tx.commit().await?;
    Ok(())
}

pub async fn get_customers_with_debt(state: State<'_, DbPool>) -> MyceliumResult<Vec<Customer>> {
    get_customers_with_debt_internal(&*state).await
}

async fn get_customers_with_debt_internal(pool: &DbPool) -> MyceliumResult<Vec<Customer>> {
    // 1. Sync current_balance from ledger sum for all customers to ensure integrity
    sqlx::query(
        "UPDATE customers c SET current_balance = COALESCE((SELECT SUM(amount) FROM customer_ledger l WHERE l.customer_id = c.customer_id), 0)"
    )
    .execute(pool)
    .await?;

    // 2. Fetch only customers with debt > 0 and active status
    let sql = r#"
        SELECT * FROM customers 
        WHERE current_balance > 0 AND status = '정상'
        ORDER BY current_balance DESC
    "#;

    Ok(sqlx::query_as::<_, Customer>(sql).fetch_all(pool).await?)
}

// --- Axum Handlers ---

#[derive(serde::Deserialize)]
pub struct LedgerSearchQuery {
    pub customer_id: String,
    pub start_date: Option<String>,
    pub end_date: Option<String>,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateLedgerEntryInput {
    pub customer_id: String,
    pub transaction_date: String,
    pub transaction_type: String,
    pub amount: i32,
    pub description: Option<String>,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateLedgerEntryInput {
    pub ledger_id: i32,
    pub transaction_date: String,
    pub transaction_type: String,
    pub amount: i32,
    pub description: Option<String>,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteLedgerEntryInput {
    pub ledger_id: i32,
}

pub async fn get_customers_with_debt_axum(
    AxumState(state): AxumState<crate::state::AppState>,
) -> MyceliumResult<Json<Vec<Customer>>> {
    let customers = get_customers_with_debt_internal(&state.pool).await?;
    Ok(Json(customers))
}

pub async fn get_customer_ledger_axum(
    AxumState(state): AxumState<crate::state::AppState>,
    Query(query): Query<LedgerSearchQuery>,
) -> MyceliumResult<Json<Vec<crate::db::CustomerLedgerEntry>>> {
    let ledger = get_customer_ledger_internal(
        &state.pool,
        query.customer_id,
        query.start_date,
        query.end_date,
    )
    .await?;
    Ok(Json(ledger))
}

pub async fn create_ledger_entry_axum(
    AxumState(state): AxumState<crate::state::AppState>,
    Json(input): Json<CreateLedgerEntryInput>,
) -> MyceliumResult<Json<i32>> {
    let id = create_ledger_entry_internal(
        &state.pool,
        input.customer_id,
        input.transaction_date,
        input.transaction_type,
        input.amount,
        input.description,
    )
    .await?;
    Ok(Json(id))
}

pub async fn update_ledger_entry_axum(
    AxumState(state): AxumState<crate::state::AppState>,
    Json(input): Json<UpdateLedgerEntryInput>,
) -> MyceliumResult<Json<()>> {
    update_ledger_entry_internal(
        &state.pool,
        input.ledger_id,
        input.transaction_date,
        input.transaction_type,
        input.amount,
        input.description,
    )
    .await?;
    Ok(Json(()))
}

pub async fn delete_ledger_entry_axum(
    AxumState(state): AxumState<crate::state::AppState>,
    Json(input): Json<DeleteLedgerEntryInput>,
) -> MyceliumResult<Json<()>> {
    delete_ledger_entry_internal(&state.pool, input.ledger_id).await?;
    Ok(Json(()))
}

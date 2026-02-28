use crate::db::{DbPool, SalesClaim};
use crate::error::MyceliumResult;
use crate::stubs::State;
use crate::DB_MODIFIED;
use chrono::NaiveDate;
use std::sync::atomic::Ordering;

pub async fn get_sales_claims(
    state: State<'_, DbPool>,
    start_date: Option<String>,
    end_date: Option<String>,
) -> MyceliumResult<Vec<SalesClaim>> {
    get_sales_claims_internal(&state, start_date, end_date).await
}

pub async fn get_sales_claims_internal(
    pool: &DbPool,
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
            .fetch_all(pool)
            .await
    } else {
        sql.push_str(" ORDER BY c.created_at DESC LIMIT 100");
        sqlx::query_as::<_, SalesClaim>(&sql).fetch_all(pool).await
    }?;

    Ok(rows)
}

pub async fn create_sales_claim(
    state: State<'_, DbPool>,
    username: &str,
    sales_id: String,
    customer_id: Option<String>,
    claim_type: String,
    reason_category: String,
    quantity: i32,
    memo: Option<String>,
) -> MyceliumResult<i32> {
    create_sales_claim_internal(
        &state,
        username,
        sales_id,
        customer_id,
        claim_type,
        reason_category,
        quantity,
        memo,
    )
    .await
}

pub async fn create_sales_claim_internal(
    pool: &DbPool,
    username: &str,
    sales_id: String,
    customer_id: Option<String>,
    claim_type: String,
    reason_category: String,
    quantity: i32,
    memo: Option<String>,
) -> MyceliumResult<i32> {
    DB_MODIFIED.store(true, Ordering::Relaxed);
    let mut tx = pool.begin().await?;
    crate::db::set_db_user_context(&mut *tx, username).await?;

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
    .fetch_one(&mut *tx)
    .await?;

    tx.commit().await?;
    Ok(row.0)
}

pub async fn process_sales_claim(
    state: State<'_, DbPool>,
    username: &str,
    claim_id: i32,
    claim_status: String,
    is_inventory_recovered: bool,
    refund_amount: i32,
) -> MyceliumResult<()> {
    process_sales_claim_internal(
        &state,
        username,
        claim_id,
        claim_status,
        is_inventory_recovered,
        refund_amount,
    )
    .await
}

pub async fn process_sales_claim_internal(
    pool: &DbPool,
    username: &str,
    claim_id: i32,
    claim_status: String,
    is_inventory_recovered: bool,
    refund_amount: i32,
) -> MyceliumResult<()> {
    DB_MODIFIED.store(true, Ordering::Relaxed);
    let mut tx = pool.begin().await?;
    crate::db::set_db_user_context(&mut *tx, username).await?;

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

pub async fn delete_sales_claim(
    state: State<'_, DbPool>,
    username: &str,
    claim_id: i32,
) -> MyceliumResult<()> {
    delete_sales_claim_internal(&state, username, claim_id).await
}

pub async fn delete_sales_claim_internal(
    pool: &DbPool,
    username: &str,
    claim_id: i32,
) -> MyceliumResult<()> {
    DB_MODIFIED.store(true, Ordering::Relaxed);
    let mut tx = pool.begin().await?;
    crate::db::set_db_user_context(&mut *tx, username).await?;

    sqlx::query("DELETE FROM sales_claims WHERE claim_id = $1")
        .bind(claim_id)
        .execute(&mut *tx)
        .await?;

    tx.commit().await?;
    Ok(())
}

pub async fn update_sales_claim(
    state: State<'_, DbPool>,
    username: &str,
    claim_id: i32,
    reason_category: String,
    quantity: i32,
    memo: Option<String>,
) -> MyceliumResult<()> {
    update_sales_claim_internal(&state, username, claim_id, reason_category, quantity, memo).await
}

pub async fn update_sales_claim_internal(
    pool: &DbPool,
    username: &str,
    claim_id: i32,
    reason_category: String,
    quantity: i32,
    memo: Option<String>,
) -> MyceliumResult<()> {
    DB_MODIFIED.store(true, Ordering::Relaxed);
    let mut tx = pool.begin().await?;
    crate::db::set_db_user_context(&mut *tx, username).await?;

    sqlx::query("UPDATE sales_claims SET reason_category = $1, quantity = $2, memo = $3 WHERE claim_id = $4")
        .bind(reason_category)
        .bind(quantity)
        .bind(memo)
        .bind(claim_id)
        .execute(&mut *tx)
        .await?;

    tx.commit().await?;
    Ok(())
}

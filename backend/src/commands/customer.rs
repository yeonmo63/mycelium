#![allow(non_snake_case)]
use crate::db::{BestCustomer, Customer, CustomerAddress, CustomerLog, DbPool, Sales};

use axum::{
    extract::{Query, State as AxumState},
    Json,
};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiCustomerInsight {
    pub keywords: Vec<String>,
    pub ice_breaking: String,
    pub sales_tip: String,
}

#[derive(Deserialize)]
pub struct CustomerSearchQuery {
    #[serde(alias = "name", alias = "mobile")]
    pub query: String,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomerInput {
    pub customer_id: Option<String>,
    #[serde(alias = "name")]
    pub customer_name: String,
    #[serde(alias = "mobile")]
    pub mobile_number: String,
    pub membership_level: Option<String>,
    pub phone_number: Option<String>,
    pub email: Option<String>,
    pub zip_code: Option<String>,
    pub address_primary: Option<String>,
    pub address_detail: Option<String>,
    pub memo: Option<String>,
    pub anniversary_date: Option<String>,
    pub anniversary_type: Option<String>,
    pub marketing_consent: Option<bool>,
    pub acquisition_channel: Option<String>,
    pub pref_product_type: Option<String>,
    pub pref_package_type: Option<String>,
    pub family_type: Option<String>,
    pub health_concern: Option<String>,
    pub sub_interest: Option<bool>,
    pub purchase_cycle: Option<String>,
    pub status: Option<String>,
}

#[derive(Deserialize)]
pub struct CustomerIdQuery {
    #[serde(alias = "customerId", alias = "customer_id")]
    pub customer_id: String,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AddressInput {
    pub address_id: Option<i32>,
    pub customer_id: String,
    pub alias: String,
    pub recipient: String,
    pub mobile: String,
    pub zip: Option<String>,
    pub addr1: String,
    pub addr2: Option<String>,
    pub is_default: bool,
    pub memo: Option<String>,
}

#[derive(Deserialize)]
pub struct AddressDeleteInput {
    pub address_id: i32,
}

#[derive(Deserialize)]
pub struct CustomerDeleteInput {
    pub customer_id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetDefaultAddressInput {
    pub customer_id: String,
    pub address_id: i32,
}
use crate::commands::ai::call_gemini_ai_internal;
use crate::commands::config::get_gemini_api_key;
use crate::error::{MyceliumError, MyceliumResult};
use crate::DB_MODIFIED;

use crate::stubs::State;
use sqlx;
use std::sync::atomic::Ordering;

pub async fn get_customer_ai_insight(
    app: crate::stubs::AppHandle,
    state: State<'_, DbPool>,
    customerId: String,
) -> MyceliumResult<AiCustomerInsight> {
    let api_key = get_gemini_api_key()
        .ok_or_else(|| MyceliumError::Internal("Gemini API 키가 설정되지 않았습니다.".into()))?;

    // 1. Fetch Customer Info
    let customer: Customer = sqlx::query_as("SELECT * FROM customers WHERE customer_id = $1")
        .bind(&customerId)
        .fetch_one(&*state)
        .await?;

    // 2. Fetch Recent Sales
    let sales: Vec<Sales> = sqlx::query_as(
        "SELECT * FROM sales WHERE customer_id = $1 ORDER BY order_date DESC LIMIT 5",
    )
    .bind(&customerId)
    .fetch_all(&*state)
    .await
    .unwrap_or_default();

    let sales_summary = if sales.is_empty() {
        "No purchase history".to_string()
    } else {
        sales
            .iter()
            .map(|s| {
                format!(
                    "{} (Qty: {}, Amt: {})",
                    s.product_name, s.quantity, s.total_amount
                )
            })
            .collect::<Vec<_>>()
            .join(", ")
    };

    // 3. Fetch Experience History
    let exp_count: (i64,) = sqlx::query_as(
        "SELECT COUNT(*) FROM experience_reservations WHERE customer_id = $1 AND status = '완료'",
    )
    .bind(&customerId)
    .fetch_one(&*state)
    .await
    .unwrap_or((0,));

    // 4. Fetch Claim History
    let claim_count: (i64,) =
        sqlx::query_as("SELECT COUNT(*) FROM sales_claims WHERE customer_id = $1")
            .bind(&customerId)
            .fetch_one(&*state)
            .await
            .unwrap_or((0,));

    let prompt = format!(
        "You are a sales expert. Here is customer profile and history:\n\
        Name: {}\n\
        Membership: {}\n\
        Address: {}\n\
        Recent Sales: {}\n\
        Experience Reservations: {} times\n\
        Claim History (Cancellation/Return): {} times\n\n\
        Please analyze this customer and provide:\n\
        1. 3 representative keywords (starting with #)\n\
        2. A natural ice-breaking sentence for opening a conversation\n\
        3. A specific sales tip based on their buying pattern and claim history.\n\
        If claim history > 0, provide carefully crafted tips for sensitive customer care.\n\
        Return as JSON with keys: keywords (array), ice_breaking (string), sales_tip (string). Use Korean.",
        customer.customer_name,
        customer.membership_level.unwrap_or_else(|| "일반".to_string()),
        customer.address_primary.unwrap_or_else(|| "-".to_string()),
        sales_summary,
        exp_count.0,
        claim_count.0
    );

    // 5. Call AI
    let result_json = call_gemini_ai_internal(Some(&*state), &api_key, &prompt).await?;

    // 6. Parse
    Ok(serde_json::from_str(&result_json)
        .map_err(|e| MyceliumError::Internal(format!("AI 응답 파싱 실패: {}", e)))?)
}

pub async fn search_customers_by_name(
    state: State<'_, DbPool>,
    name: String,
) -> MyceliumResult<Vec<Customer>> {
    Ok(sqlx::query_as::<_, Customer>(
        "SELECT * FROM customers WHERE customer_name LIKE $1 ORDER BY customer_name",
    )
    .bind(format!("%{}%", name))
    .fetch_all(&*state)
    .await?)
}

pub async fn search_customers_by_mobile(
    state: State<'_, DbPool>,
    mobile: String,
) -> MyceliumResult<Vec<Customer>> {
    Ok(sqlx::query_as::<_, Customer>(
        "SELECT * FROM customers WHERE mobile_number LIKE $1 ORDER BY customer_name",
    )
    .bind(format!("%{}%", mobile))
    .fetch_all(&*state)
    .await?)
}

pub async fn get_customer(
    state: State<'_, DbPool>,
    customerId: String,
) -> MyceliumResult<Customer> {
    Ok(
        sqlx::query_as::<_, Customer>("SELECT * FROM customers WHERE customer_id = $1")
            .bind(customerId)
            .fetch_one(&*state)
            .await?,
    )
}

pub async fn create_customer(
    state: State<'_, DbPool>,
    customerName: String,
    mobileNumber: String,
    membershipLevel: Option<String>,
    phoneNumber: Option<String>,
    email: Option<String>,
    zipCode: Option<String>,
    addressPrimary: Option<String>,
    addressDetail: Option<String>,
    memo: Option<String>,
    anniversaryDate: Option<String>,
    anniversaryType: Option<String>,
    marketingConsent: Option<bool>,
    acquisitionChannel: Option<String>,
    prefProductType: Option<String>,
    prefPackageType: Option<String>,
    familyType: Option<String>,
    healthConcern: Option<String>,
    subInterest: Option<bool>,
    purchaseCycle: Option<String>,
) -> MyceliumResult<String> {
    DB_MODIFIED.store(true, Ordering::Relaxed);

    // 1. Generate ID (CUID-XXXXXX)
    let new_id = format!("C-{}", uuid::Uuid::new_v4().to_string()[..8].to_uppercase());

    let a_date = if let Some(ref d) = anniversaryDate {
        if d.is_empty() {
            None
        } else {
            crate::commands::sales::utils::parse_date_safe(d)
        }
    } else {
        None
    };

    // 2. Insert
    sqlx::query(
        "INSERT INTO customers (
            customer_id, customer_name, mobile_number, membership_level, phone_number, email, 
            zip_code, address_primary, address_detail, memo, anniversary_date, anniversary_type, 
            marketing_consent, acquisition_channel, join_date, status,
            pref_product_type, pref_package_type, family_type, health_concern, sub_interest, purchase_cycle
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, CURRENT_DATE, '정상', $15, $16, $17, $18, $19, $20)"
    )
    .bind(&new_id)
    .bind(&customerName)
    .bind(&mobileNumber)
    .bind(membershipLevel.unwrap_or_else(|| "일반".to_string()))
    .bind(phoneNumber)
    .bind(email)
    .bind(zipCode)
    .bind(addressPrimary)
    .bind(addressDetail)
    .bind(memo)
    .bind(a_date)
    .bind(anniversaryType)
    .bind(marketingConsent.unwrap_or(false))
    .bind(acquisitionChannel)
    .bind(prefProductType)
    .bind(prefPackageType)
    .bind(familyType)
    .bind(healthConcern)
    .bind(subInterest.unwrap_or(false))
    .bind(purchaseCycle)
    .execute(&*state)
    .await?;

    Ok(new_id)
}

pub async fn update_customer(
    state: State<'_, DbPool>,
    customerId: String,
    customerName: String,
    mobileNumber: String,
    membershipLevel: Option<String>,
    phoneNumber: Option<String>,
    email: Option<String>,
    zipCode: Option<String>,
    addressPrimary: Option<String>,
    addressDetail: Option<String>,
    memo: Option<String>,
    anniversaryDate: Option<String>,
    anniversaryType: Option<String>,
    marketingConsent: Option<bool>,
    acquisitionChannel: Option<String>,
    status: Option<String>,
    prefProductType: Option<String>,
    prefPackageType: Option<String>,
    familyType: Option<String>,
    healthConcern: Option<String>,
    subInterest: Option<bool>,
    purchaseCycle: Option<String>,
) -> MyceliumResult<()> {
    DB_MODIFIED.store(true, Ordering::Relaxed);
    let mut tx = state.begin().await?;

    // Enable Audit Context (Tauri context uses "Admin" by default)
    crate::db::set_db_user_context(&mut *tx, "Admin").await?;

    let a_date = if let Some(ref d) = anniversaryDate {
        if d.is_empty() {
            None
        } else {
            crate::commands::sales::utils::parse_date_safe(d)
        }
    } else {
        None
    };

    // 2. Perform Update - Trigger trg_log_customer_changes will handle audit logging
    sqlx::query(
        "UPDATE customers SET 
            customer_name = $1, mobile_number = $2, membership_level = $3, phone_number = $4, email = $5, 
            zip_code = $6, address_primary = $7, address_detail = $8, memo = $9, anniversary_date = $10, 
            anniversary_type = $11, marketing_consent = $12, acquisition_channel = $13, status = $14,
            pref_product_type = $16, pref_package_type = $17, family_type = $18, health_concern = $19, 
            sub_interest = $20, purchase_cycle = $21
        WHERE customer_id = $15"
    )
    .bind(&customerName)
    .bind(&mobileNumber)
    .bind(membershipLevel.clone().unwrap_or_else(|| "일반".to_string()))
    .bind(phoneNumber)
    .bind(email)
    .bind(zipCode)
    .bind(addressPrimary)
    .bind(addressDetail)
    .bind(memo)
    .bind(a_date)
    .bind(anniversaryType)
    .bind(marketingConsent.unwrap_or(false))
    .bind(acquisitionChannel)
    .bind(status.unwrap_or_else(|| "정상".to_string()))
    .bind(&customerId)
    .bind(prefProductType)
    .bind(prefPackageType)
    .bind(familyType)
    .bind(healthConcern)
    .bind(subInterest.unwrap_or(false))
    .bind(purchaseCycle)
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;
    Ok(())
}

pub async fn get_customer_logs(
    state: State<'_, DbPool>,
    customerId: String,
) -> MyceliumResult<Vec<CustomerLog>> {
    Ok(sqlx::query_as::<_, CustomerLog>(
        "SELECT * FROM customer_logs WHERE customer_id = $1 ORDER BY changed_at DESC",
    )
    .bind(customerId)
    .fetch_all(&*state)
    .await?)
}

pub async fn delete_customer(state: State<'_, DbPool>, customerId: String) -> MyceliumResult<()> {
    DB_MODIFIED.store(true, Ordering::Relaxed);
    let mut tx = state.begin().await?;

    crate::db::set_db_user_context(&mut *tx, "Admin").await?;

    sqlx::query("UPDATE customers SET status = '말소' WHERE customer_id = $1")
        .bind(customerId)
        .execute(&mut *tx)
        .await?;

    tx.commit().await?;
    Ok(())
}

pub async fn reactivate_customer(
    state: State<'_, DbPool>,
    customerId: String,
) -> MyceliumResult<()> {
    DB_MODIFIED.store(true, Ordering::Relaxed);
    let mut tx = state.begin().await?;

    crate::db::set_db_user_context(&mut *tx, "Admin").await?;

    sqlx::query("UPDATE customers SET status = '정상' WHERE customer_id = $1")
        .bind(customerId)
        .execute(&mut *tx)
        .await?;

    tx.commit().await?;
    Ok(())
}

pub async fn delete_customers_batch(
    state: State<'_, DbPool>,
    ids: Vec<String>,
    permanent: bool,
    also_delete_sales: bool,
) -> MyceliumResult<()> {
    DB_MODIFIED.store(true, Ordering::Relaxed);
    let mut tx = state.begin().await?;

    crate::db::set_db_user_context(&mut *tx, "Admin").await?;

    if permanent {
        if also_delete_sales {
            sqlx::query("DELETE FROM sales WHERE customer_id = ANY($1)")
                .bind(&ids)
                .execute(&mut *tx)
                .await?;
        }
        sqlx::query("DELETE FROM customers WHERE customer_id = ANY($1)")
            .bind(&ids)
            .execute(&mut *tx)
            .await?;
    } else {
        sqlx::query("UPDATE customers SET status = '말소' WHERE customer_id = ANY($1)")
            .bind(&ids)
            .execute(&mut *tx)
            .await?;
    }

    tx.commit().await?;
    Ok(())
}

pub async fn reactivate_customers_batch(
    state: State<'_, DbPool>,
    ids: Vec<String>,
) -> MyceliumResult<()> {
    DB_MODIFIED.store(true, Ordering::Relaxed);
    let mut tx = state.begin().await?;

    crate::db::set_db_user_context(&mut *tx, "Admin").await?;

    sqlx::query("UPDATE customers SET status = '정상' WHERE customer_id = ANY($1)")
        .bind(&ids)
        .execute(&mut *tx)
        .await?;

    tx.commit().await?;
    Ok(())
}

pub async fn create_customer_address(
    state: State<'_, DbPool>,
    customerId: String,
    addressAlias: String,
    recipientName: String,
    mobileNumber: String,
    zipCode: Option<String>,
    addressPrimary: String,
    addressDetail: Option<String>,
    isDefault: bool,
    shippingMemo: Option<String>,
) -> MyceliumResult<i32> {
    DB_MODIFIED.store(true, Ordering::Relaxed);
    let mut tx = state.begin().await?;

    // 1. If is_default is true, unset other default addresses for this customer
    if isDefault {
        sqlx::query("UPDATE customer_addresses SET is_default = FALSE WHERE customer_id = $1")
            .bind(&customerId)
            .execute(&mut *tx)
            .await?;
    }

    // 2. Insert
    let row: (i32,) = sqlx::query_as(
        "INSERT INTO customer_addresses (
            customer_id, address_alias, recipient_name, mobile_number, zip_code, 
            address_primary, address_detail, is_default, shipping_memo
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING address_id",
    )
    .bind(&customerId)
    .bind(&addressAlias)
    .bind(&recipientName)
    .bind(&mobileNumber)
    .bind(zipCode)
    .bind(&addressPrimary)
    .bind(addressDetail)
    .bind(isDefault)
    .bind(shippingMemo)
    .fetch_one(&mut *tx)
    .await?;

    tx.commit().await?;
    Ok(row.0)
}

pub async fn update_customer_address(
    state: State<'_, DbPool>,
    addressId: i32,
    addressAlias: String,
    recipientName: String,
    mobileNumber: String,
    zipCode: Option<String>,
    addressPrimary: String,
    addressDetail: Option<String>,
    isDefault: bool,
    shippingMemo: Option<String>,
) -> MyceliumResult<()> {
    DB_MODIFIED.store(true, Ordering::Relaxed);
    let mut tx = state.begin().await?;

    // 1. Get customer_id for this address
    let customer_id: (String,) =
        sqlx::query_as("SELECT customer_id FROM customer_addresses WHERE address_id = $1")
            .bind(addressId)
            .fetch_one(&mut *tx)
            .await?;

    // 2. If is_default is true, unset other default addresses
    if isDefault {
        sqlx::query("UPDATE customer_addresses SET is_default = FALSE WHERE customer_id = $1")
            .bind(&customer_id.0)
            .execute(&mut *tx)
            .await?;
    }

    // 3. Update
    sqlx::query(
        "UPDATE customer_addresses SET 
            address_alias = $1, recipient_name = $2, mobile_number = $3, zip_code = $4, 
            address_primary = $5, address_detail = $6, is_default = $7, shipping_memo = $8
        WHERE address_id = $9",
    )
    .bind(&addressAlias)
    .bind(&recipientName)
    .bind(&mobileNumber)
    .bind(zipCode)
    .bind(&addressPrimary)
    .bind(addressDetail)
    .bind(isDefault)
    .bind(shippingMemo)
    .bind(addressId)
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;
    Ok(())
}

pub async fn get_customer_addresses(
    state: State<'_, DbPool>,
    customer_id: String,
) -> MyceliumResult<Vec<CustomerAddress>> {
    Ok(sqlx::query_as::<_, CustomerAddress>(
        "SELECT * FROM customer_addresses WHERE customer_id = $1 ORDER BY is_default DESC, address_alias ASC",
    )
    .bind(customer_id)
    .fetch_all(&*state)
    .await?)
}

pub async fn delete_customer_address(
    state: State<'_, DbPool>,
    address_id: i32,
) -> MyceliumResult<()> {
    DB_MODIFIED.store(true, Ordering::Relaxed);
    sqlx::query("DELETE FROM customer_addresses WHERE address_id = $1")
        .bind(address_id)
        .execute(&*state)
        .await?;
    Ok(())
}

pub async fn set_default_customer_address(
    state: State<'_, DbPool>,
    customer_id: String,
    address_id: i32,
) -> MyceliumResult<()> {
    DB_MODIFIED.store(true, Ordering::Relaxed);
    let mut tx = state.begin().await?;

    sqlx::query("UPDATE customer_addresses SET is_default = FALSE WHERE customer_id = $1")
        .bind(&customer_id)
        .execute(&mut *tx)
        .await?;

    sqlx::query("UPDATE customer_addresses SET is_default = TRUE WHERE address_id = $1")
        .bind(address_id)
        .execute(&mut *tx)
        .await?;

    tx.commit().await?;
    Ok(())
}

pub async fn search_customers_by_date(
    state: State<'_, DbPool>,
    start: String,
    end: String,
    keyword: Option<String>,
    membershipLevel: Option<String>,
) -> MyceliumResult<Vec<Customer>> {
    // Explicitly cast parameters to ::DATE to avoid "operator does not exist: date >= text"
    let mut sql =
        "SELECT * FROM customers WHERE join_date BETWEEN $1::DATE AND $2::DATE".to_string();
    let mut binders = Vec::new();
    binders.push(start);
    binders.push(end);

    let mut bind_idx = 3;

    if let Some(ref k) = keyword {
        if !k.trim().is_empty() {
            sql.push_str(&format!(
                " AND (customer_name LIKE ${} OR mobile_number LIKE ${})",
                bind_idx, bind_idx
            ));
            binders.push(format!("%{}%", k.trim()));
            bind_idx += 1;
        }
    }

    if let Some(ref lvl) = membershipLevel {
        if !lvl.trim().is_empty() {
            sql.push_str(&format!(" AND membership_level = ${}", bind_idx));
            binders.push(lvl.trim().to_string());
        }
    }

    sql.push_str(" ORDER BY join_date DESC");

    let mut query = sqlx::query_as::<_, Customer>(&sql);
    for b in binders {
        query = query.bind(b);
    }

    Ok(query.fetch_all(&*state).await?)
}

pub async fn search_dormant_customers(
    state: State<'_, DbPool>,
    daysThreshold: i32,
) -> MyceliumResult<Vec<Customer>> {
    let sql = r#"
        SELECT c.* FROM customers c
        WHERE c.status = '정상' 
        AND NOT EXISTS (
            SELECT 1 FROM sales s 
            WHERE s.customer_id = c.customer_id 
            AND s.order_date >= CURRENT_DATE - ($1 || ' days')::interval
            AND s.status != '취소'
        )
        AND c.join_date < CURRENT_DATE - ($1 || ' days')::interval
        ORDER BY c.join_date ASC
    "#;

    Ok(sqlx::query_as::<_, Customer>(sql)
        .bind(daysThreshold)
        .fetch_all(&*state)
        .await?)
}

pub async fn check_duplicate_customer(
    state: State<'_, DbPool>,
    name: String,
    mobile: String,
) -> MyceliumResult<Option<Customer>> {
    Ok(sqlx::query_as::<_, Customer>(
        "SELECT * FROM customers WHERE customer_name = $1 AND mobile_number = $2",
    )
    .bind(name)
    .bind(mobile)
    .fetch_optional(&*state)
    .await?)
}

pub async fn search_best_customers(
    state: State<'_, DbPool>,
    minQty: i64,
    minAmt: i64,
    logic: String, // "AND" or "OR"
) -> MyceliumResult<Vec<BestCustomer>> {
    let filter_sql = if logic == "OR" {
        "HAVING SUM(s.quantity) >= $1 OR SUM(s.total_amount) >= $2"
    } else {
        "HAVING SUM(s.quantity) >= $1 AND SUM(s.total_amount) >= $2"
    };

    let sql = format!(
        r#"
        SELECT 
            c.customer_id, 
            c.customer_name, 
            c.mobile_number, 
            c.membership_level, 
            c.address_primary, 
            c.address_detail,
            COUNT(s.sales_id) as total_orders,
            SUM(s.quantity) as total_qty,
            SUM(s.total_amount) as total_amount
        FROM customers c
        JOIN sales s ON c.customer_id = s.customer_id
        WHERE s.status NOT IN ('취소', '반품', '반품완료')
        GROUP BY c.customer_id, c.customer_name, c.mobile_number, c.membership_level, c.address_primary, c.address_detail
        {}
        ORDER BY total_amount DESC
        "#,
        filter_sql
    );

    Ok(sqlx::query_as::<_, BestCustomer>(&sql)
        .bind(minQty)
        .bind(minAmt)
        .fetch_all(&*state)
        .await?)
}

pub async fn update_customer_membership_batch(
    state: State<'_, DbPool>,
    customerIds: Vec<String>,
    newLevel: String,
) -> MyceliumResult<()> {
    DB_MODIFIED.store(true, Ordering::Relaxed);
    sqlx::query("UPDATE customers SET membership_level = $1 WHERE customer_id = ANY($2)")
        .bind(newLevel)
        .bind(&customerIds)
        .execute(&*state)
        .await?;
    Ok(())
}

pub async fn update_customer_memo_batch(
    state: State<'_, DbPool>,
    customerIds: Vec<String>,
    newMemo: String,
    append: bool,
) -> MyceliumResult<()> {
    DB_MODIFIED.store(true, Ordering::Relaxed);
    let mut tx = state.begin().await?;

    crate::db::set_db_user_context(&mut *tx, "Admin").await?;

    if append {
        sqlx::query("UPDATE customers SET memo = COALESCE(memo, '') || '\n' || $1 WHERE customer_id = ANY($2)")
            .bind(newMemo)
            .bind(&customerIds)
            .execute(&mut *tx)
            .await?;
    } else {
        sqlx::query("UPDATE customers SET memo = $1 WHERE customer_id = ANY($2)")
            .bind(newMemo)
            .bind(&customerIds)
            .execute(&mut *tx)
            .await?;
    }

    tx.commit().await?;
    Ok(())
}

pub async fn get_sales_by_customer_id(
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

// Axum Handlers

pub async fn search_customers_by_name_axum(
    AxumState(state): AxumState<crate::state::AppState>,
    Query(params): Query<CustomerSearchQuery>,
) -> MyceliumResult<Json<Vec<Customer>>> {
    let customers = sqlx::query_as::<_, Customer>(
        "SELECT * FROM customers WHERE customer_name LIKE $1 ORDER BY customer_name",
    )
    .bind(format!("%{}%", params.query))
    .fetch_all(&state.pool)
    .await?;
    Ok(Json(customers))
}

pub async fn search_customers_by_mobile_axum(
    AxumState(state): AxumState<crate::state::AppState>,
    Query(params): Query<CustomerSearchQuery>,
) -> MyceliumResult<Json<Vec<Customer>>> {
    let customers = sqlx::query_as::<_, Customer>(
        "SELECT * FROM customers WHERE mobile_number LIKE $1 ORDER BY customer_name",
    )
    .bind(format!("%{}%", params.query))
    .fetch_all(&state.pool)
    .await?;
    Ok(Json(customers))
}

pub async fn create_customer_axum(
    AxumState(state): AxumState<crate::state::AppState>,
    Json(input): Json<CustomerInput>,
) -> MyceliumResult<Json<String>> {
    DB_MODIFIED.store(true, Ordering::Relaxed);

    // 1. Generate ID (CUID-XXXXXX)
    let new_id = format!("C-{}", uuid::Uuid::new_v4().to_string()[..8].to_uppercase());

    let a_date = if let Some(ref d) = input.anniversary_date {
        if d.is_empty() {
            None
        } else {
            crate::commands::sales::utils::parse_date_safe(d)
        }
    } else {
        None
    };

    // 2. Insert
    sqlx::query(
        "INSERT INTO customers (
            customer_id, customer_name, mobile_number, membership_level, phone_number, email, 
            zip_code, address_primary, address_detail, memo, anniversary_date, anniversary_type, 
            marketing_consent, acquisition_channel, join_date, status,
            pref_product_type, pref_package_type, family_type, health_concern, sub_interest, purchase_cycle
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, CURRENT_DATE, '정상', $15, $16, $17, $18, $19, $20)"
    )
    .bind(&new_id)
    .bind(&input.customer_name)
    .bind(&input.mobile_number)
    .bind(input.membership_level.unwrap_or_else(|| "일반".to_string()))
    .bind(input.phone_number)
    .bind(input.email)
    .bind(input.zip_code)
    .bind(input.address_primary)
    .bind(input.address_detail)
    .bind(input.memo)
    .bind(a_date)
    .bind(input.anniversary_type)
    .bind(input.marketing_consent.unwrap_or(false))
    .bind(input.acquisition_channel)
    .bind(input.pref_product_type)
    .bind(input.pref_package_type)
    .bind(input.family_type)
    .bind(input.health_concern)
    .bind(input.sub_interest.unwrap_or(false))
    .bind(input.purchase_cycle)
    .execute(&state.pool)
    .await?;

    Ok(Json(new_id))
}

pub async fn update_customer_axum(
    AxumState(state): AxumState<crate::state::AppState>,
    Json(input): Json<CustomerInput>,
) -> MyceliumResult<Json<()>> {
    let customer_id = input.customer_id.ok_or(MyceliumError::Validation(
        "Customer ID is required for update".into(),
    ))?;

    DB_MODIFIED.store(true, Ordering::Relaxed);
    let mut tx = state.pool.begin().await?;

    // 1. Get Old Data for logging
    let old: Customer = sqlx::query_as("SELECT * FROM customers WHERE customer_id = $1")
        .bind(&customer_id)
        .fetch_one(&mut *tx)
        .await?;

    let a_date = if let Some(ref d) = input.anniversary_date {
        if d.is_empty() {
            None
        } else {
            crate::commands::sales::utils::parse_date_safe(d)
        }
    } else {
        None
    };

    // 2. Perform Update
    sqlx::query(
        "UPDATE customers SET 
            customer_name = $1, mobile_number = $2, membership_level = $3, phone_number = $4, email = $5, 
            zip_code = $6, address_primary = $7, address_detail = $8, memo = $9, anniversary_date = $10, 
            anniversary_type = $11, marketing_consent = $12, acquisition_channel = $13, status = $14,
            pref_product_type = $16, pref_package_type = $17, family_type = $18, health_concern = $19, 
            sub_interest = $20, purchase_cycle = $21
        WHERE customer_id = $15"
    )
    .bind(&input.customer_name)
    .bind(&input.mobile_number)
    .bind(input.membership_level.clone().unwrap_or_else(|| "일반".to_string()))
    .bind(input.phone_number)
    .bind(input.email)
    .bind(input.zip_code)
    .bind(input.address_primary)
    .bind(input.address_detail)
    .bind(input.memo)
    .bind(a_date)
    .bind(input.anniversary_type)
    .bind(input.marketing_consent.unwrap_or(false))
    .bind(input.acquisition_channel)
    .bind(input.status.unwrap_or_else(|| "정상".to_string()))
    .bind(&customer_id)
    .bind(input.pref_product_type)
    .bind(input.pref_package_type)
    .bind(input.family_type)
    .bind(input.health_concern)
    .bind(input.sub_interest.unwrap_or(false))
    .bind(input.purchase_cycle)
    .execute(&mut *tx)
    .await?;

    // 3. Log Changes (Selective)
    let mut changes = Vec::new();
    if old.customer_name != input.customer_name {
        changes.push((
            "customer_name",
            old.customer_name,
            input.customer_name.clone(),
        ));
    }
    if old.mobile_number != input.mobile_number {
        changes.push((
            "mobile_number",
            old.mobile_number,
            input.mobile_number.clone(),
        ));
    }
    if old.membership_level.as_deref().unwrap_or("")
        != input.membership_level.as_deref().unwrap_or("일반")
    {
        changes.push((
            "membership_level",
            old.membership_level.unwrap_or_default(),
            input
                .membership_level
                .clone()
                .unwrap_or_else(|| "일반".to_string()),
        ));
    }

    for (field, old_v, new_v) in changes {
        sqlx::query(
            "INSERT INTO customer_logs (customer_id, field_name, old_value, new_value) VALUES ($1, $2, $3, $4)"
        )
        .bind(&customer_id)
        .bind(field)
        .bind(old_v)
        .bind(new_v)
        .execute(&mut *tx)
        .await?;
    }

    tx.commit().await?;
    Ok(Json(()))
}

pub async fn get_customer_axum(
    AxumState(state): AxumState<crate::state::AppState>,
    Query(params): Query<CustomerIdQuery>,
) -> MyceliumResult<Json<Customer>> {
    let customer = sqlx::query_as::<_, Customer>("SELECT * FROM customers WHERE customer_id = $1")
        .bind(params.customer_id)
        .fetch_one(&state.pool)
        .await?;
    Ok(Json(customer))
}

pub async fn get_customer_addresses_axum(
    AxumState(state): AxumState<crate::state::AppState>,
    Query(params): Query<CustomerIdQuery>,
) -> MyceliumResult<Json<Vec<CustomerAddress>>> {
    let addresses = sqlx::query_as::<_, CustomerAddress>(
        "SELECT * FROM customer_addresses WHERE customer_id = $1 ORDER BY is_default DESC, address_alias ASC",
    )
    .bind(params.customer_id)
    .fetch_all(&state.pool)
    .await?;
    Ok(Json(addresses))
}

pub async fn get_customer_logs_axum(
    AxumState(state): AxumState<crate::state::AppState>,
    Query(params): Query<CustomerIdQuery>,
) -> MyceliumResult<Json<Vec<CustomerLog>>> {
    let logs = sqlx::query_as::<_, CustomerLog>(
        "SELECT * FROM customer_logs WHERE customer_id = $1 ORDER BY changed_at DESC",
    )
    .bind(params.customer_id)
    .fetch_all(&state.pool)
    .await?;
    Ok(Json(logs))
}

pub async fn delete_customer_axum(
    AxumState(state): AxumState<crate::state::AppState>,
    Json(input): Json<CustomerDeleteInput>,
) -> MyceliumResult<Json<()>> {
    DB_MODIFIED.store(true, Ordering::Relaxed);
    sqlx::query("UPDATE customers SET status = '말소' WHERE customer_id = $1")
        .bind(input.customer_id)
        .execute(&state.pool)
        .await?;
    Ok(Json(()))
}

pub async fn reactivate_customer_axum(
    AxumState(state): AxumState<crate::state::AppState>,
    Json(input): Json<CustomerDeleteInput>,
) -> MyceliumResult<Json<()>> {
    DB_MODIFIED.store(true, Ordering::Relaxed);
    sqlx::query("UPDATE customers SET status = '정상' WHERE customer_id = $1")
        .bind(input.customer_id)
        .execute(&state.pool)
        .await?;
    Ok(Json(()))
}

pub async fn create_customer_address_axum(
    AxumState(state): AxumState<crate::state::AppState>,
    Json(input): Json<AddressInput>,
) -> MyceliumResult<Json<i32>> {
    DB_MODIFIED.store(true, Ordering::Relaxed);
    let mut tx = state.pool.begin().await?;

    if input.is_default {
        sqlx::query("UPDATE customer_addresses SET is_default = FALSE WHERE customer_id = $1")
            .bind(&input.customer_id)
            .execute(&mut *tx)
            .await?;
    }

    let row: (i32,) = sqlx::query_as(
        "INSERT INTO customer_addresses (
            customer_id, address_alias, recipient_name, mobile_number, zip_code, 
            address_primary, address_detail, is_default, shipping_memo
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING address_id",
    )
    .bind(&input.customer_id)
    .bind(&input.alias)
    .bind(&input.recipient)
    .bind(&input.mobile)
    .bind(input.zip)
    .bind(&input.addr1)
    .bind(input.addr2)
    .bind(input.is_default)
    .bind(input.memo)
    .fetch_one(&mut *tx)
    .await?;

    tx.commit().await?;
    Ok(Json(row.0))
}

pub async fn update_customer_address_axum(
    AxumState(state): AxumState<crate::state::AppState>,
    Json(input): Json<AddressInput>,
) -> MyceliumResult<Json<()>> {
    let address_id = input
        .address_id
        .ok_or(MyceliumError::Validation("Address ID is required".into()))?;
    DB_MODIFIED.store(true, Ordering::Relaxed);
    let mut tx = state.pool.begin().await?;

    let customer_id: (String,) =
        sqlx::query_as("SELECT customer_id FROM customer_addresses WHERE address_id = $1")
            .bind(address_id)
            .fetch_one(&mut *tx)
            .await?;

    if input.is_default {
        sqlx::query("UPDATE customer_addresses SET is_default = FALSE WHERE customer_id = $1")
            .bind(&customer_id.0)
            .execute(&mut *tx)
            .await?;
    }

    sqlx::query(
        "UPDATE customer_addresses SET 
            address_alias = $1, recipient_name = $2, mobile_number = $3, zip_code = $4, 
            address_primary = $5, address_detail = $6, is_default = $7, shipping_memo = $8
        WHERE address_id = $9",
    )
    .bind(&input.alias)
    .bind(&input.recipient)
    .bind(&input.mobile)
    .bind(input.zip)
    .bind(&input.addr1)
    .bind(input.addr2)
    .bind(input.is_default)
    .bind(input.memo)
    .bind(address_id)
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;
    Ok(Json(()))
}

pub async fn delete_customer_address_axum(
    AxumState(state): AxumState<crate::state::AppState>,
    Json(input): Json<AddressDeleteInput>,
) -> MyceliumResult<Json<()>> {
    DB_MODIFIED.store(true, Ordering::Relaxed);
    sqlx::query("DELETE FROM customer_addresses WHERE address_id = $1")
        .bind(input.address_id)
        .execute(&state.pool)
        .await?;
    Ok(Json(()))
}

pub async fn set_default_customer_address_axum(
    AxumState(state): AxumState<crate::state::AppState>,
    Json(input): Json<SetDefaultAddressInput>,
) -> MyceliumResult<Json<()>> {
    DB_MODIFIED.store(true, Ordering::Relaxed);
    let mut tx = state.pool.begin().await?;

    sqlx::query("UPDATE customer_addresses SET is_default = FALSE WHERE customer_id = $1")
        .bind(&input.customer_id)
        .execute(&mut *tx)
        .await?;

    sqlx::query("UPDATE customer_addresses SET is_default = TRUE WHERE address_id = $1")
        .bind(input.address_id)
        .execute(&mut *tx)
        .await?;

    tx.commit().await?;
    Ok(Json(()))
}

pub async fn get_sales_by_customer_id_axum(
    AxumState(state): AxumState<crate::state::AppState>,
    Query(params): Query<CustomerIdQuery>,
) -> MyceliumResult<Json<Vec<Sales>>> {
    let sales = sqlx::query_as::<_, Sales>(
        "SELECT * FROM sales WHERE customer_id = $1 ORDER BY order_date DESC",
    )
    .bind(params.customer_id)
    .fetch_all(&state.pool)
    .await?;
    Ok(Json(sales))
}

pub async fn get_customer_ai_insight_axum(
    AxumState(state): AxumState<crate::state::AppState>,
    Query(params): Query<CustomerIdQuery>,
) -> MyceliumResult<Json<AiCustomerInsight>> {
    let api_key = get_gemini_api_key()
        .ok_or_else(|| MyceliumError::Internal("Gemini API 키가 설정되지 않았습니다.".into()))?;

    // 1. Fetch Customer Info
    let customer: Customer = sqlx::query_as("SELECT * FROM customers WHERE customer_id = $1")
        .bind(&params.customer_id)
        .fetch_one(&state.pool)
        .await?;

    // 2. Fetch Recent Sales
    let sales: Vec<Sales> = sqlx::query_as(
        "SELECT * FROM sales WHERE customer_id = $1 ORDER BY order_date DESC LIMIT 5",
    )
    .bind(&params.customer_id)
    .fetch_all(&state.pool)
    .await
    .unwrap_or_default();

    let sales_summary = if sales.is_empty() {
        "No purchase history".to_string()
    } else {
        sales
            .iter()
            .map(|s| {
                format!(
                    "{} (Qty: {}, Amt: {})",
                    s.product_name, s.quantity, s.total_amount
                )
            })
            .collect::<Vec<_>>()
            .join(", ")
    };

    // 3. Fetch Experience History
    let exp_count: (i64,) = sqlx::query_as(
        "SELECT COUNT(*) FROM experience_reservations WHERE customer_id = $1 AND status = '완료'",
    )
    .bind(&params.customer_id)
    .fetch_one(&state.pool)
    .await
    .unwrap_or((0,));

    // 4. Fetch Claim History
    let claim_count: (i64,) =
        sqlx::query_as("SELECT COUNT(*) FROM sales_claims WHERE customer_id = $1")
            .bind(&params.customer_id)
            .fetch_one(&state.pool)
            .await
            .unwrap_or((0,));

    let prompt = format!(
        "You are a sales expert. Here is customer profile and history:\n\
        Name: {}\n\
        Membership: {}\n\
        Address: {}\n\
        Recent Sales: {}\n\
        Experience Reservations: {} times\n\
        Claim History (Cancellation/Return): {} times\n\n\
        Please analyze this customer and provide:\n\
        1. 3 representative keywords (starting with #)\n\
        2. A natural ice-breaking sentence for opening a conversation\n\
        3. A specific sales tip based on their buying pattern and claim history.\n\
        If claim history > 0, provide carefully crafted tips for sensitive customer care.\n\
        Return as JSON with keys: keywords (array), ice_breaking (string), sales_tip (string). Use Korean.",
        customer.customer_name,
        customer.membership_level.unwrap_or_else(|| "일반".to_string()),
        customer.address_primary.unwrap_or_else(|| "-".to_string()),
        sales_summary,
        exp_count.0,
        claim_count.0
    );

    // 5. Call AI
    let result_json = call_gemini_ai_internal(Some(&state.pool), &api_key, &prompt).await?;

    // 6. Parse
    Ok(Json(serde_json::from_str(&result_json).map_err(|e| {
        MyceliumError::Internal(format!("AI 응답 파싱 실패: {}", e))
    })?))
}

// --- Axum Handlers for Batch Operations ---

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchByDateQuery {
    pub start: Option<String>,
    pub end: Option<String>,
    pub keyword: Option<String>,
    pub membership_level: Option<String>,
}

pub async fn search_customers_by_date_axum(
    AxumState(state): AxumState<crate::state::AppState>,
    Query(params): Query<SearchByDateQuery>,
) -> MyceliumResult<Json<Vec<Customer>>> {
    let start = params.start.unwrap_or_else(|| "1900-01-01".to_string());
    let end = params.end.unwrap_or_else(|| "2999-12-31".to_string());

    let mut sql =
        "SELECT * FROM customers WHERE join_date BETWEEN $1::DATE AND $2::DATE".to_string();
    let mut binders: Vec<String> = Vec::new();
    binders.push(start);
    binders.push(end);

    let mut bind_idx = 3;

    if let Some(ref k) = params.keyword {
        if !k.trim().is_empty() {
            sql.push_str(&format!(
                " AND (customer_name LIKE ${} OR mobile_number LIKE ${})",
                bind_idx, bind_idx
            ));
            binders.push(format!("%{}%", k.trim()));
            bind_idx += 1;
        }
    }

    if let Some(ref lvl) = params.membership_level {
        if !lvl.trim().is_empty() {
            sql.push_str(&format!(" AND membership_level = ${}", bind_idx));
            binders.push(lvl.trim().to_string());
        }
    }

    sql.push_str(" ORDER BY join_date DESC");

    let mut query = sqlx::query_as::<_, Customer>(&sql);
    for b in &binders {
        query = query.bind(b);
    }

    Ok(Json(query.fetch_all(&state.pool).await?))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DormantSearchQuery {
    pub days_threshold: Option<i32>,
}

pub async fn search_dormant_customers_axum(
    AxumState(state): AxumState<crate::state::AppState>,
    Query(params): Query<DormantSearchQuery>,
) -> MyceliumResult<Json<Vec<Customer>>> {
    let days = params.days_threshold.unwrap_or(1095); // default ~3 years

    let sql = r#"
        SELECT c.* FROM customers c
        WHERE c.status = '정상' 
        AND NOT EXISTS (
            SELECT 1 FROM sales s 
            WHERE s.customer_id = c.customer_id 
            AND s.order_date >= CURRENT_DATE - ($1 || ' days')::interval
            AND s.status != '취소'
        )
        AND c.join_date < CURRENT_DATE - ($1 || ' days')::interval
        ORDER BY c.join_date ASC
    "#;

    Ok(Json(
        sqlx::query_as::<_, Customer>(sql)
            .bind(days)
            .fetch_all(&state.pool)
            .await?,
    ))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchDeleteInput {
    pub ids: Vec<String>,
    pub permanent: bool,
    pub also_delete_sales: bool,
}

pub async fn delete_customers_batch_axum(
    AxumState(state): AxumState<crate::state::AppState>,
    Json(input): Json<BatchDeleteInput>,
) -> MyceliumResult<Json<()>> {
    DB_MODIFIED.store(true, Ordering::Relaxed);
    let mut tx = state.pool.begin().await?;

    if input.permanent {
        if input.also_delete_sales {
            sqlx::query("DELETE FROM sales WHERE customer_id = ANY($1)")
                .bind(&input.ids)
                .execute(&mut *tx)
                .await?;
        }
        sqlx::query("DELETE FROM customer_ledger WHERE customer_id = ANY($1)")
            .bind(&input.ids)
            .execute(&mut *tx)
            .await?;
        sqlx::query("DELETE FROM customer_logs WHERE customer_id = ANY($1)")
            .bind(&input.ids)
            .execute(&mut *tx)
            .await?;
        sqlx::query("DELETE FROM customer_addresses WHERE customer_id = ANY($1)")
            .bind(&input.ids)
            .execute(&mut *tx)
            .await?;
        sqlx::query("DELETE FROM customers WHERE customer_id = ANY($1)")
            .bind(&input.ids)
            .execute(&mut *tx)
            .await?;
    } else {
        sqlx::query("UPDATE customers SET status = '말소' WHERE customer_id = ANY($1)")
            .bind(&input.ids)
            .execute(&mut *tx)
            .await?;
    }

    tx.commit().await?;
    Ok(Json(()))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchReactivateInput {
    pub ids: Vec<String>,
}

pub async fn reactivate_customers_batch_axum(
    AxumState(state): AxumState<crate::state::AppState>,
    Json(input): Json<BatchReactivateInput>,
) -> MyceliumResult<Json<()>> {
    DB_MODIFIED.store(true, Ordering::Relaxed);
    sqlx::query("UPDATE customers SET status = '정상' WHERE customer_id = ANY($1)")
        .bind(&input.ids)
        .execute(&state.pool)
        .await?;
    Ok(Json(()))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BestCustomerQuery {
    pub min_qty: i64,
    pub min_amt: i64,
    pub logic: String,
}

pub async fn search_best_customers_axum(
    AxumState(state): AxumState<crate::state::AppState>,
    Query(params): Query<BestCustomerQuery>,
) -> MyceliumResult<Json<Vec<BestCustomer>>> {
    let filter_sql = if params.logic == "OR" {
        "HAVING SUM(s.quantity) >= $1 OR SUM(s.total_amount) >= $2"
    } else {
        "HAVING SUM(s.quantity) >= $1 AND SUM(s.total_amount) >= $2"
    };

    let sql = format!(
        r#"
        SELECT 
            c.customer_id, 
            c.customer_name, 
            c.mobile_number, 
            c.membership_level, 
            c.address_primary, 
            c.address_detail,
            COUNT(s.sales_id) as total_orders,
            SUM(s.quantity) as total_qty,
            SUM(s.total_amount) as total_amount
        FROM customers c
        JOIN sales s ON c.customer_id = s.customer_id
        WHERE s.status NOT IN ('취소', '반품', '반품완료')
        GROUP BY c.customer_id, c.customer_name, c.mobile_number, c.membership_level, c.address_primary, c.address_detail
        {}
        ORDER BY total_amount DESC
        "#,
        filter_sql
    );

    let customers = sqlx::query_as::<_, BestCustomer>(&sql)
        .bind(params.min_qty)
        .bind(params.min_amt)
        .fetch_all(&state.pool)
        .await?;

    Ok(Json(customers))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateMembershipBatchInput {
    pub customer_ids: Vec<String>,
    pub new_level: String,
}

pub async fn update_customer_membership_batch_axum(
    AxumState(state): AxumState<crate::state::AppState>,
    Json(input): Json<UpdateMembershipBatchInput>,
) -> MyceliumResult<Json<()>> {
    DB_MODIFIED.store(true, Ordering::Relaxed);
    sqlx::query("UPDATE customers SET membership_level = $1 WHERE customer_id = ANY($2)")
        .bind(input.new_level)
        .bind(&input.customer_ids)
        .execute(&state.pool)
        .await?;
    Ok(Json(()))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateMemoBatchRequest {
    pub customer_ids: Vec<String>,
    pub new_memo: String,
    pub append: bool,
}

pub async fn update_customer_memo_batch_axum(
    AxumState(state): AxumState<crate::state::AppState>,
    Json(payload): Json<UpdateMemoBatchRequest>,
) -> MyceliumResult<Json<()>> {
    update_customer_memo_batch(
        crate::stubs::State::from(&state.pool),
        payload.customer_ids,
        payload.new_memo,
        payload.append,
    )
    .await?;
    Ok(Json(()))
}

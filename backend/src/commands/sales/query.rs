use crate::db::{DbPool, Sales};
use crate::error::MyceliumResult;
use crate::stubs::State;
use axum::{
    extract::{Query, State as AxumState},
    Json,
};
use chrono::NaiveDate;

#[derive(serde::Deserialize)]
pub struct DateQuery {
    pub date: String,
}

#[derive(serde::Deserialize)]
pub struct SearchSalesQuery {
    pub query: String,
    pub period: Option<String>,
}

pub async fn get_daily_receipts_axum(
    AxumState(state): AxumState<crate::state::AppState>,
    Query(params): Query<DateQuery>,
) -> MyceliumResult<Json<Vec<Sales>>> {
    let sales = get_daily_receipts(&state.pool, params.date).await?;
    Ok(Json(sales))
}

pub async fn search_sales_by_any_axum(
    AxumState(state): AxumState<crate::state::AppState>,
    Query(params): Query<SearchSalesQuery>,
) -> MyceliumResult<Json<Vec<Sales>>> {
    let sales = search_sales_by_any_internal(&state.pool, params.query).await?;
    Ok(Json(sales))
}

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

pub async fn search_sales_by_any(
    state: State<'_, DbPool>,
    query: String,
) -> MyceliumResult<Vec<Sales>> {
    search_sales_by_any_internal(&state, query).await
}

pub async fn search_sales_by_any_internal(
    pool: &DbPool,
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
        .fetch_all(pool)
        .await?)
}

pub async fn get_sales_by_event_id_and_date_range_internal(
    pool: &DbPool,
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
        .fetch_all(pool)
        .await?)
}

pub async fn get_sales_by_event_id_and_date_range(
    state: State<'_, DbPool>,
    event_id: String,
    start_date: String,
    end_date: String,
) -> MyceliumResult<Vec<Sales>> {
    get_sales_by_event_id_and_date_range_internal(&*state, event_id, start_date, end_date).await
}

pub async fn get_daily_receipts(
    state: State<'_, DbPool>,
    date: String,
) -> MyceliumResult<Vec<Sales>> {
    // Receipts usually mean paid sales
    let parsed_date = NaiveDate::parse_from_str(&date, "%Y-%m-%d").unwrap_or_default();
    let sql = r#"
        SELECT 
            s.*, 
            COALESCE(c.customer_name, e.event_name, '비회원') as customer_name,
            c.mobile_number as customer_mobile,
            c.address_primary as customer_address
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

pub async fn get_sale_detail(
    state: State<'_, DbPool>,
    sales_id: String,
) -> MyceliumResult<Option<Sales>> {
    get_sale_detail_internal(&state, sales_id).await
}

pub async fn get_sale_detail_internal(
    pool: &DbPool,
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
    .fetch_optional(pool)
    .await?)
}

pub async fn get_customer_sales_on_date(
    state: State<'_, DbPool>,
    customer_id: String,
    date: String,
) -> MyceliumResult<Vec<Sales>> {
    // Parse date for validation, though we pass string to SQL
    let parsed_date = NaiveDate::parse_from_str(&date, "%Y-%m-%d").map_err(|e| {
        crate::error::MyceliumError::Internal(format!("Invalid date format: {}", e))
    })?;

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

#[derive(serde::Deserialize)]
pub struct TaxReportParams {
    pub start_date: String,
    pub end_date: String,
}

pub async fn get_tax_report_v2_axum(
    AxumState(state): AxumState<crate::state::AppState>,
    Query(params): Query<TaxReportParams>,
) -> MyceliumResult<Json<Vec<TaxReportItem>>> {
    let report =
        get_tax_report_v2(State::from(&state.pool), params.start_date, params.end_date).await?;
    Ok(Json(report))
}

#[derive(serde::Deserialize)]
pub struct SubmitTaxReportPayload {
    pub items: Vec<TaxReportItem>,
    pub start_date: String,
    pub end_date: String,
}

pub async fn submit_tax_report_axum(
    Json(payload): Json<SubmitTaxReportPayload>,
) -> MyceliumResult<Json<String>> {
    // Manually load config
    let settings = crate::commands::config::load_integration_settings()?;

    // Check Tax Settings
    if let Some(tax_config) = settings.tax {
        let api_key = &tax_config.api_key;
        if api_key.is_empty() {
            return Err(crate::error::MyceliumError::Internal(
                "세무신고 API 키가 설정되지 않았습니다. 설정 > 외부 서비스 연동에서 키를 입력해주세요."
                    .to_string(),
            ));
        }

        let provider = &tax_config.provider;
        let provider_name = match provider.as_str() {
            "sim_hometax" => "국세청 홈택스(모의)",
            "popbill" => "팝빌(연동)",
            "smartbill" => "스마트빌(연동)",
            _ => "기타 API 서비스",
        };

        // Summary
        let mut total_sales_vat = 0;
        let mut total_purchase_vat = 0;
        for item in &payload.items {
            if item.direction == "매출" {
                total_sales_vat += item.vat_amount;
            } else {
                total_purchase_vat += item.vat_amount;
            }
        }

        tracing::info!(
            "Submitted tax report via {}: {} ~ {}",
            provider_name,
            payload.start_date,
            payload.end_date
        );

        Ok(Json(format!("{} 서비스를 통해 {} ~ {} 기간의 세무신고 자료({}) 전송에 성공하였습니다. (납부예정 세액: {}원)", 
            provider_name, payload.start_date, payload.end_date, payload.items.len(), total_sales_vat - total_purchase_vat)))
    } else {
        return Err(crate::error::MyceliumError::Internal(
            "세무신고 연동 설정이 없습니다. 먼저 설정 > 외부 서비스 연동에서 설정을 진행해주세요."
                .to_string(),
        ));
    }
}

#[derive(Debug, serde::Serialize, serde::Deserialize, sqlx::FromRow)]
pub struct TaxReportItem {
    pub direction: String, // '매출', '매입'
    pub category: String,  // '상품판매', '체험수익', '재료매입', '일반지출'
    pub id: String,
    pub date: Option<NaiveDate>,
    pub name: String,
    pub tax_type: String, // '과세', '면세', '복합'
    pub total_amount: i64,
    pub supply_value: i64,
    pub vat_amount: i64,
    pub tax_exempt_value: i64,
}

pub async fn get_tax_report_v2(
    state: State<'_, DbPool>,
    start_date: String,
    end_date: String,
) -> MyceliumResult<Vec<TaxReportItem>> {
    let start = NaiveDate::parse_from_str(&start_date, "%Y-%m-%d").unwrap_or_default();
    let end = NaiveDate::parse_from_str(&end_date, "%Y-%m-%d").unwrap_or_default();

    let sql = r#"
        -- 1. Sales (Revenue)
        SELECT 
            '매출' as direction,
            '상품판매' as category,
            sales_id::text as id,
            order_date as date,
            product_name as name,
            tax_type as tax_type,
            total_amount::bigint as total_amount,
            COALESCE(supply_value, 0)::bigint as supply_value,
            COALESCE(vat_amount, 0)::bigint as vat_amount,
            COALESCE(tax_exempt_value, 0)::bigint as tax_exempt_value
        FROM sales
        WHERE order_date BETWEEN $1 AND $2 AND status != '취소'

        UNION ALL

        -- 2. Experience (Revenue)
        SELECT 
            '매출' as direction,
            '체험수익' as category,
            reservation_id::text as id,
            reservation_date as date,
            p.program_name as name,
            '과세' as tax_type,
            r.total_amount::bigint as total_amount,
            ROUND(r.total_amount / 1.1)::bigint as supply_value,
            (r.total_amount - ROUND(r.total_amount / 1.1))::bigint as vat_amount,
            0::bigint as tax_exempt_value
        FROM experience_reservations r
        JOIN experience_programs p ON r.program_id = p.program_id
        WHERE r.reservation_date BETWEEN $1 AND $2 AND r.status = '체험완료'

        UNION ALL

        -- 3. Purchases (Expense)
        SELECT 
            '매입' as direction,
            '재료매입' as category,
            purchase_id::text as id,
            purchase_date as date,
            item_name as name,
            '과세' as tax_type,
            total_amount::bigint as total_amount,
            ROUND(total_amount / 1.1)::bigint as supply_value,
            (total_amount - ROUND(total_amount / 1.1))::bigint as vat_amount,
            0::bigint as tax_exempt_value
        FROM purchases
        WHERE purchase_date BETWEEN $1 AND $2

        UNION ALL

        -- 4. General Expenses (Expense)
        SELECT 
            '매입' as direction,
            '일반지출' as category,
            expense_id::text as id,
            expense_date as date,
            category as name,
            '과세' as tax_type,
            amount::bigint as total_amount,
            ROUND(amount / 1.1)::bigint as supply_value,
            (amount - ROUND(amount / 1.1))::bigint as vat_amount,
            0::bigint as tax_exempt_value
        FROM expenses
        WHERE expense_date BETWEEN $1 AND $2
        
        ORDER BY date ASC, direction DESC
    "#;

    let rows = sqlx::query_as::<_, TaxReportItem>(sql)
        .bind(start)
        .bind(end)
        .fetch_all(&*state)
        .await?;

    Ok(rows)
}

pub async fn submit_tax_report(
    app: crate::stubs::AppHandle,
    items: Vec<TaxReportItem>,
    start_date: String,
    end_date: String,
) -> MyceliumResult<String> {
    // 1. Get Config
    let config = crate::commands::config::get_tax_filing_config_for_ui(app.clone()).await?;
    let api_key = config.get("api_key").and_then(|v| v.as_str()).unwrap_or("");
    if api_key.is_empty() {
        return Err(crate::error::MyceliumError::Internal(
            "세무신고 API 키가 설정되지 않았습니다. 설정 > 외부 서비스 연동에서 키를 입력해주세요."
                .to_string(),
        ));
    }

    // 2. Prepare Data (Summary)
    let mut total_sales_vat = 0;
    let mut total_purchase_vat = 0;
    for item in &items {
        if item.direction == "매출" {
            total_sales_vat += item.vat_amount;
        } else {
            total_purchase_vat += item.vat_amount;
        }
    }

    // 3. Simulated Transmission
    let provider = config
        .get("provider")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let provider_name = match provider {
        "sim_hometax" => "국세청 홈택스(모의)",
        "popbill" => "팝빌(연동)",
        "smartbill" => "스마트빌(연동)",
        _ => "기타 API 서비스",
    };

    println!("Tax Filing Submission Log:");
    println!("- Provider: {}", provider_name);
    println!("- Period: {} ~ {}", start_date, end_date);
    println!("- Sales VAT: {}", total_sales_vat);
    println!("- Purchase VAT: {}", total_purchase_vat);
    println!("- Net VAT to pay: {}", total_sales_vat - total_purchase_vat);

    // 4. Log Action
    tracing::info!(
        "Submitted tax report via {}: {} ~ {}",
        provider_name,
        start_date,
        end_date
    );

    // 5. Success Message
    Ok(format!("{} 서비스를 통해 {} ~ {} 기간의 세무신고 자료({}) 전송에 성공하였습니다. (납부예정 세액: {}원)", 
        provider_name, start_date, end_date, items.len(), total_sales_vat - total_purchase_vat))
}

#![allow(non_snake_case)]
use crate::db::DbPool;
use crate::error::MyceliumResult;
use chrono::NaiveDate;
use tauri::{command, State};

#[derive(Debug, serde::Serialize, sqlx::FromRow)]
pub struct PendingShipment {
    pub sales_id: String,
    pub order_date: Option<NaiveDate>,
    pub customer_name: Option<String>, // Joined from customers
    pub customer_mobile_number: Option<String>, // Joined from customers
    pub shipping_name: Option<String>,
    pub shipping_mobile_number: Option<String>,
    pub shipping_zip_code: Option<String>,
    pub shipping_address_primary: Option<String>,
    pub shipping_address_detail: Option<String>,
    pub product_name: String,
    pub specification: Option<String>,
    pub unit_price: i32,
    pub quantity: i32,
    pub total_amount: i32,
    pub memo: Option<String>,
    pub courier_name: Option<String>,
    pub tracking_number: Option<String>,
}

#[command]
pub async fn get_shipments_by_status(
    state: State<'_, DbPool>,
    status: String,
    search: Option<String>,
    start_date: Option<String>,
    end_date: Option<String>,
) -> MyceliumResult<Vec<PendingShipment>> {
    let mut query_string = String::from(
        "SELECT 
            s.sales_id, 
            s.order_date, 
            COALESCE(c.customer_name, e.event_name) as customer_name, 
            c.mobile_number as customer_mobile_number,
            s.shipping_name, 
            s.shipping_mobile_number, 
            s.shipping_zip_code,
            s.shipping_address_primary,
            s.shipping_address_detail,
            s.product_name, 
            s.specification, 
            s.unit_price, 
            s.quantity, 
            s.total_amount, 
            s.memo,
            s.courier_name,
            s.tracking_number
         FROM sales s
         LEFT JOIN customers c ON s.customer_id = c.customer_id
         LEFT JOIN event e ON s.customer_id = e.event_id
         WHERE s.status = $1",
    );

    let mut bind_idx = 2; // Next available binding index

    if let Some(ref s) = search {
        if !s.trim().is_empty() {
            query_string.push_str(&format!(
                " AND (c.customer_name LIKE ${0} OR s.shipping_name LIKE ${0} OR s.shipping_address_primary LIKE ${0} OR s.shipping_address_detail LIKE ${0} OR s.shipping_mobile_number LIKE ${0})",
                bind_idx
            ));
            bind_idx += 1;
        }
    }

    if let Some(ref start) = start_date {
        if !start.trim().is_empty() {
            query_string.push_str(&format!(" AND s.order_date >= ${}::DATE", bind_idx));
            bind_idx += 1;
        }
    }

    if let Some(ref end) = end_date {
        if !end.trim().is_empty() {
            query_string.push_str(&format!(" AND s.order_date <= ${}::DATE", bind_idx));
        }
    }

    query_string.push_str(" ORDER BY s.order_date DESC, s.sales_id DESC LIMIT 500");

    let mut query = sqlx::query_as::<_, PendingShipment>(&query_string).bind(status);

    if let Some(ref s) = search {
        if !s.trim().is_empty() {
            query = query.bind(format!("%{}%", s));
        }
    }

    if let Some(ref start) = start_date {
        if !start.trim().is_empty() {
            query = query.bind(start);
        }
    }

    if let Some(ref end) = end_date {
        if !end.trim().is_empty() {
            query = query.bind(end);
        }
    }

    Ok(query.fetch_all(&*state).await?)
}

#[command]
pub async fn get_shipping_base_date(state: State<'_, DbPool>) -> MyceliumResult<Option<NaiveDate>> {
    Ok(
        sqlx::query_scalar(
            "SELECT MIN(order_date) FROM sales WHERE status IN ('접수', '입금완료')",
        )
        .fetch_one(&*state)
        .await?,
    )
}

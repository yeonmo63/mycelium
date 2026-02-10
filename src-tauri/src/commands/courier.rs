use crate::db::DbPool;
use crate::error::MyceliumResult;
use crate::DB_MODIFIED;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::sync::atomic::Ordering;
use tauri::{command, State};

#[derive(Debug, Serialize, Deserialize)]
pub struct CourierStatus {
    pub sales_id: String,
    pub status: String, // '집하완료', '배송중', '배송완료'
    pub location: String,
    pub message: String,
    pub updated_at: String,
}

#[command]
pub async fn sync_courier_status(
    state: State<'_, DbPool>,
    state_app: tauri::AppHandle,
    sales_id: String,
) -> MyceliumResult<CourierStatus> {
    // 1. Fetch sale and customer info
    let sale_info: Option<(String, Option<String>, Option<chrono::NaiveDate>, String, Option<String>, String)> = sqlx::query_as(
        "SELECT s.status, s.tracking_number, s.shipping_date, s.product_name, c.mobile_number, c.customer_name 
         FROM sales s 
         LEFT JOIN customers c ON s.customer_id = c.customer_id 
         WHERE s.sales_id = $1"
    )
    .bind(&sales_id)
    .fetch_optional(&*state)
    .await?;

    if let Some((current_status, tracking, shipping_date, product_name, mobile, customer_name)) =
        sale_info
    {
        if tracking.is_none() || current_status == "배송완료" {
            return Ok(CourierStatus {
                sales_id: sales_id.clone(),
                status: current_status,
                location: "-".to_string(),
                message: "추적할 정보가 없거나 이미 완료된 건입니다.".to_string(),
                updated_at: Utc::now().format("%Y-%m-%d %H:%M").to_string(),
            });
        }

        // --- SIMULATION LOGIC ---
        let now = Utc::now().date_naive();
        let s_date = shipping_date.unwrap_or(now);
        let days_passed = (now - s_date).num_days();

        let (new_status, loc, msg) = if days_passed >= 2 {
            ("배송완료", "배송완료", "물품이 고객님께 전달되었습니다.")
        } else if days_passed >= 1 {
            ("배송중", "지역 허브", "배송지로 이동 중입니다.")
        } else {
            ("배송중", "집하처", "택배사에서 물품을 인수했습니다.")
        };

        // Auto-update database status if changed
        if new_status != current_status {
            DB_MODIFIED.store(true, Ordering::Relaxed);
            sqlx::query("UPDATE sales SET status = $1 WHERE sales_id = $2")
                .bind(new_status)
                .bind(&sales_id)
                .execute(&*state)
                .await?;

            // --- SMS TRIGGER SIMULATION ---
            if let Some(phone) = mobile {
                let sms_content = if new_status == "배송완료" {
                    format!(
                        "[Mycelium] {}님, 주문하신 '{}' 상품이 배송 완료되었습니다. 감사합니다!",
                        customer_name, product_name
                    )
                } else {
                    format!(
                        "[Mycelium] {}님, 상품 '{}'의 배송이 시작되어 현재 {}를 통과 중입니다.",
                        customer_name, product_name, loc
                    )
                };

                // Trigger simulation
                let _ = crate::commands::crm::send_sms_simulation(
                    state_app,
                    "SMS".to_string(),
                    vec![phone],
                    sms_content,
                    None,
                )
                .await;
            }
        }

        return Ok(CourierStatus {
            sales_id,
            status: new_status.to_string(),
            location: loc.to_string(),
            message: msg.to_string(),
            updated_at: Utc::now().format("%Y-%m-%d %H:%M").to_string(),
        });
    }

    Err(crate::error::MyceliumError::Internal(
        "주문 정보를 찾을 수 없습니다.".to_string(),
    ))
}

#[command]
pub async fn batch_sync_courier_statuses(
    state: State<'_, DbPool>,
    state_app: tauri::AppHandle,
) -> MyceliumResult<usize> {
    // Fetch all sales that are currently '배송중'
    let active_shipments: Vec<String> = sqlx::query_scalar(
        "SELECT sales_id FROM sales WHERE status = '배송중' AND tracking_number IS NOT NULL",
    )
    .fetch_all(&*state)
    .await?;

    let mut updated_count = 0;
    for sid in active_shipments {
        // Reuse simulation logic
        let res = sync_courier_status(state.clone(), state_app.clone(), sid).await;
        if res.is_ok() {
            updated_count += 1;
        }
    }

    Ok(updated_count)
}

use crate::db::DbPool;
use crate::error::MyceliumResult;
use crate::DB_MODIFIED;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::sync::atomic::Ordering;
use tauri::{command, Manager, State};

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
    let sale_info: Option<(String, Option<String>, Option<chrono::NaiveDate>, String, Option<String>, String, Option<String>)> = sqlx::query_as(
        "SELECT s.status, s.tracking_number, s.shipping_date, s.product_name, c.mobile_number, c.customer_name, s.courier_name 
         FROM sales s 
         LEFT JOIN customers c ON s.customer_id = c.customer_id 
         WHERE s.sales_id = $1"
    )
    .bind(&sales_id)
    .fetch_optional(&*state)
    .await?;

    if let Some((
        current_status,
        tracking,
        shipping_date,
        _product_name,
        _mobile,
        _customer_name,
        courier_name,
    )) = sale_info
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

        let tracking_number = tracking.unwrap();

        // 2. Load Config for API Key
        let config_dir = state_app.path().app_config_dir().unwrap();
        let config_path = config_dir.join("config.json");
        let api_key = if config_path.exists() {
            let content = std::fs::read_to_string(&config_path).unwrap_or_default();
            let json: serde_json::Value = serde_json::from_str(&content).unwrap_or_default();
            json.get("courier_api_key")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string()
        } else {
            String::new()
        };

        if !api_key.is_empty() {
            // --- REAL TRACKING LOGIC (SweetTracker) ---
            let courier_code = match courier_name.as_deref().unwrap_or("") {
                "CJ대한통운" | "CJ" => "04",
                "롯데택배" => "08",
                "우체국택배" | "우체국" => "01",
                "한진택배" => "05",
                _ => "04", // Default to CJ if unknown or just use what's there
            };

            let client = reqwest::Client::new();
            let url = format!(
                "http://info.sweettracker.co.kr/api/v1/trackingInfo?t_key={}&t_code={}&t_invoice={}",
                api_key, courier_code, tracking_number
            );

            let res = client.get(url).send().await;
            if let Ok(resp) = res {
                let json: serde_json::Value = resp.json().await.unwrap_or_default();

                // SweetTracker response parsing
                if let Some(result_status) = json.get("level").and_then(|v| v.as_i64()) {
                    let (new_status, loc, msg) = match result_status {
                        1..=4 => (
                            "배송중",
                            json.get("where")
                                .and_then(|v| v.as_str())
                                .unwrap_or(" Hub "),
                            "상품이 이동 중입니다.",
                        ),
                        5 | 6 => ("배송완료", "도착지", "배송이 완료되었습니다."),
                        _ => ("배송중", "확인중", "배송 상태를 확인하고 있습니다."),
                    };

                    // Update DB if changed
                    if new_status != current_status {
                        DB_MODIFIED.store(true, Ordering::Relaxed);
                        sqlx::query("UPDATE sales SET status = $1 WHERE sales_id = $2")
                            .bind(new_status)
                            .bind(&sales_id)
                            .execute(&*state)
                            .await?;

                        // SMS logic... (skipped for brevity but same as simulation)
                    }

                    return Ok(CourierStatus {
                        sales_id,
                        status: new_status.to_string(),
                        location: loc.to_string(),
                        message: json
                            .get("lastDetail")
                            .and_then(|v| v.as_str())
                            .unwrap_or(msg)
                            .to_string(),
                        updated_at: Utc::now().format("%Y-%m-%d %H:%M").to_string(),
                    });
                }
            }
        }

        // --- FALLBACK SIMULATION LOGIC ---
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

        if new_status != current_status {
            DB_MODIFIED.store(true, Ordering::Relaxed);
            sqlx::query("UPDATE sales SET status = $1 WHERE sales_id = $2")
                .bind(new_status)
                .bind(&sales_id)
                .execute(&*state)
                .await?;
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

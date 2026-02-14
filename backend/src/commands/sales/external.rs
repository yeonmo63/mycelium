use crate::error::{MyceliumError, MyceliumResult};
use std::fs;
use tauri::{command, AppHandle, Manager};

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MallOrderItem {
    pub order_id: String,
    pub customer_name: String,
    pub receiver_name: String,
    pub mobile: String,
    pub zip: String,
    pub address: String,
    pub mall_product_name: String,
    pub qty: i32,
    pub unit_price: i32,
}

#[command]
pub async fn fetch_external_mall_orders(
    app: AppHandle,
    mall_type: String,
) -> MyceliumResult<Vec<MallOrderItem>> {
    // 1. Get Config
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

    // 2. Routing by Provider
    match mall_type.as_str() {
        "sabangnet" => {
            let api_key = json
                .get("sabangnet_api_key")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let company_id = json
                .get("sabangnet_id")
                .and_then(|v| v.as_str())
                .unwrap_or("");

            if api_key.is_empty() || company_id.is_empty() {
                return Err(MyceliumError::Internal("사방넷 연동을 위해 '설정 > API 키' 메뉴에서 인증코드와 회사 ID를 먼저 입력해주세요.".into()));
            }

            fetch_sabangnet_orders(api_key, company_id).await
        }
        "playauto" => {
            let api_key = json
                .get("playauto_api_key")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let member_id = json
                .get("playauto_id")
                .and_then(|v| v.as_str())
                .unwrap_or("");

            if api_key.is_empty() || member_id.is_empty() {
                return Err(MyceliumError::Internal("플레이오토 연동을 위해 '설정 > API 키' 메뉴에서 대행사 키와 계정 ID를 먼저 입력해주세요.".into()));
            }

            fetch_playauto_orders(api_key, member_id).await
        }
        "naver" => {
            let client_id = json
                .get("naver_commerce_id")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            if client_id.is_empty() {
                return Err(MyceliumError::Internal(
                    "네이버 커머스 API 연동 설정이 필요합니다.".into(),
                ));
            }
            // Existing placeholder for Naver
            Ok(vec![])
        }
        "coupang" => {
            let access_key = json
                .get("coupang_access_key")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            if access_key.is_empty() {
                return Err(MyceliumError::Internal(
                    "쿠팡 윙 API 연동 설정이 필요합니다.".into(),
                ));
            }
            // Existing placeholder for Coupang
            Ok(vec![])
        }
        _ => Err(MyceliumError::Internal(format!(
            "지원되지 않는 몰 타입입니다: {}",
            mall_type
        ))),
    }
}

/// Actual HTTP fetching logic for Sabangnet
async fn fetch_sabangnet_orders(
    api_key: &str,
    company_id: &str,
) -> MyceliumResult<Vec<MallOrderItem>> {
    println!(
        "System: Contacting Sabangnet API for company: {}...",
        company_id
    );

    // Sabangnet usually uses a specific XML endpoint for order retrieval
    let client = reqwest::Client::new();
    let res = client
        .get("https://api.sabangnet.co.kr/v1/orders") // Placeholder endpoint
        .query(&[("api_key", api_key), ("comp_id", company_id)])
        .send()
        .await;

    match res {
        Ok(resp) => {
            if resp.status().is_success() {
                // In real Sabangnet, we would parse XML/JSON.
                Ok(vec![])
            } else {
                Err(MyceliumError::Internal("사방넷 서버 응답 오류".into()))
            }
        }
        Err(e) => Err(MyceliumError::Internal(format!("사방넷 연결 실패: {}", e))),
    }
}

/// Actual HTTP fetching logic for PlayAuto
async fn fetch_playauto_orders(
    api_key: &str,
    member_id: &str,
) -> MyceliumResult<Vec<MallOrderItem>> {
    println!(
        "System: Contacting PlayAuto API for member: {}...",
        member_id
    );

    // PlayAuto typically uses a JSON API
    let client = reqwest::Client::new();
    let res = client
        .get("https://api.playauto.co.kr/v1/orders")
        .header("X-PlayAuto-Api-Key", api_key)
        .header("X-PlayAuto-Member-Id", member_id)
        .send()
        .await;

    match res {
        Ok(resp) => {
            if resp.status().is_success() {
                Ok(vec![])
            } else {
                Err(MyceliumError::Internal("플레이오토 서버 응답 오류".into()))
            }
        }
        Err(e) => Err(MyceliumError::Internal(format!(
            "플레이오토 연결 실패: {}",
            e
        ))),
    }
}

#![allow(non_snake_case)]
use crate::db::{init_pool, CompanyInfo, User};

use crate::error::{MyceliumError, MyceliumResult};
use crate::DB_MODIFIED;
use bcrypt::{hash, verify, DEFAULT_COST};
use futures_util::stream::{FuturesUnordered, StreamExt};
use regex::Regex;
use serde_json::{json, Value};
use std::fs;
use std::net::{IpAddr, Ipv4Addr, SocketAddr, UdpSocket};
use std::sync::atomic::Ordering;
use std::sync::Mutex;
use tauri::{command, AppHandle, Manager, State};
use tokio::net::TcpStream;
use tokio::time::{timeout, Duration};

#[derive(Default)]
pub struct SetupState {
    pub is_configured: Mutex<bool>,
}

#[command]
pub fn check_setup_status(state: State<'_, SetupState>) -> bool {
    *state.is_configured.lock().unwrap()
}

/// Helper to retrieve the database URL ONLY from config.json (Security Enforced)
pub fn get_db_url(app: &AppHandle) -> Result<String, String> {
    if let Ok(config_dir) = app.path().app_config_dir() {
        let config_path = config_dir.join("config.json");
        if config_path.exists() {
            if let Ok(content) = fs::read_to_string(&config_path) {
                if let Ok(json) = serde_json::from_str::<Value>(&content) {
                    if let Some(url) = json.get("database_url").and_then(|v| v.as_str()) {
                        let trimmed = url.trim();
                        if !trimmed.is_empty() {
                            return Ok(trimmed.to_string());
                        }
                    }
                }
            }
        }
    }
    Err("Configuration file (config.json) missing or database_url not set".to_string())
}

/// Detect the local IP address of this machine
pub fn get_local_ip() -> Option<String> {
    let socket = UdpSocket::bind("0.0.0.0:0").ok()?;
    socket.connect("8.8.8.8:80").ok()?;
    socket.local_addr().ok()?.ip().to_string().into()
}

/// Scan the current subnet for an open PostgreSQL port (default 5432)
pub async fn scan_network_for_postgres(port: u16) -> Option<String> {
    let local_ip = get_local_ip()?;
    let ip: Ipv4Addr = local_ip.parse().ok()?;
    let octets = ip.octets();

    let mut futures = FuturesUnordered::new();
    for i in 1..255 {
        let ip_to_check = Ipv4Addr::new(octets[0], octets[1], octets[2], i);
        let addr = SocketAddr::new(IpAddr::V4(ip_to_check), port);

        futures.push(async move {
            match timeout(Duration::from_millis(200), TcpStream::connect(&addr)).await {
                Ok(Ok(_)) => Some(ip_to_check.to_string()),
                _ => None,
            }
        });
    }

    while let Some(res) = futures.next().await {
        if let Some(found_ip) = res {
            return Some(found_ip);
        }
    }
    None
}

/// Helper to update the database_url's IP in config.json if it has changed
pub async fn update_db_ip_in_config(app: &AppHandle) -> MyceliumResult<()> {
    if let Ok(config_dir) = app.path().app_config_dir() {
        let config_path = config_dir.join("config.json");
        if config_path.exists() {
            if let Ok(content) = fs::read_to_string(&config_path) {
                if let Ok(mut config_data) = serde_json::from_str::<Value>(&content) {
                    if let Some(url) = config_data.get("database_url").and_then(|v| v.as_str()) {
                        let re = Regex::new(r"^(postgres://[^:]+:[^@]*@)([^:/]+)((?::\d+)?)(.*)$")
                            .unwrap();
                        if let Some(caps) = re.captures(url) {
                            let prefix = &caps[1];
                            let host = &caps[2];
                            let port_str = &caps[3];
                            let suffix = &caps[4];

                            let port = if port_str.is_empty() {
                                5432
                            } else {
                                port_str[1..].parse().unwrap_or(5432)
                            };

                            // 1. Try existing host first to avoid scanning if unnecessary
                            if timeout(
                                Duration::from_millis(150),
                                TcpStream::connect(format!("{}:{}", host, port)),
                            )
                            .await
                            .is_ok()
                            {
                                return Ok(());
                            }

                            // 2. Scan network if existing one is down
                            if let Some(new_ip) = scan_network_for_postgres(port).await {
                                let new_url = format!("{}{}{}{}", prefix, new_ip, port_str, suffix);
                                config_data["database_url"] = Value::String(new_url);
                                if let Ok(config_str) = serde_json::to_string_pretty(&config_data) {
                                    let _ = fs::write(&config_path, config_str);
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    Ok(())
}

#[command]
pub async fn refresh_database_ip(app: AppHandle) -> MyceliumResult<String> {
    update_db_ip_in_config(&app).await?;
    match get_db_url(&app) {
        Ok(url) => Ok(url),
        Err(_) => Ok("".to_string()),
    }
}

/// Helper to retrieve the Gemini API Key ONLY from config.json (Security Enforced)
pub fn get_gemini_api_key(app: &AppHandle) -> Option<String> {
    if let Ok(config_dir) = app.path().app_config_dir() {
        let config_path = config_dir.join("config.json");
        if config_path.exists() {
            if let Ok(content) = fs::read_to_string(&config_path) {
                if let Ok(json) = serde_json::from_str::<Value>(&content) {
                    if let Some(key) = json.get("gemini_api_key").and_then(|v| v.as_str()) {
                        let trimmed = key.trim().trim_matches(|c: char| {
                            c.is_whitespace() || c == '"' || c == '\'' || c == '\r' || c == '\n'
                        });
                        if !trimmed.is_empty() {
                            return Some(trimmed.to_string());
                        }
                    }
                }
            }
        }
    }
    None
}

#[command]
pub async fn get_gemini_api_key_for_ui(app: AppHandle) -> MyceliumResult<String> {
    Ok(get_gemini_api_key(&app).unwrap_or_default())
}

#[command]
pub async fn save_gemini_api_key(app: AppHandle, key: String) -> MyceliumResult<()> {
    let config_dir = app
        .path()
        .app_config_dir()
        .map_err(|e| MyceliumError::Internal(e.to_string()))?;
    let config_path = config_dir.join("config.json");

    let mut config_data = if config_path.exists() {
        let content =
            fs::read_to_string(&config_path).map_err(|e| MyceliumError::Internal(e.to_string()))?;
        serde_json::from_str::<Value>(&content).unwrap_or(json!({}))
    } else {
        json!({})
    };

    config_data["gemini_api_key"] = Value::String(key);

    let config_str = serde_json::to_string_pretty(&config_data)
        .map_err(|e| MyceliumError::Internal(e.to_string()))?;
    fs::write(&config_path, config_str).map_err(|e| MyceliumError::Internal(e.to_string()))?;

    // Also update current process env to take effect immediately
    if let Some(key_str) = config_data["gemini_api_key"].as_str() {
        std::env::set_var("GEMINI_API_KEY", key_str);
    }

    Ok(())
}

pub fn get_naver_keys(app: &AppHandle) -> (String, String) {
    let mut client_id = "".to_string();
    let mut client_secret = "".to_string();

    if let Ok(config_dir) = app.path().app_config_dir() {
        let config_path = config_dir.join("config.json");
        if config_path.exists() {
            if let Ok(content) = fs::read_to_string(&config_path) {
                if let Ok(json) = serde_json::from_str::<Value>(&content) {
                    if let Some(id) = json.get("naver_client_id").and_then(|v| v.as_str()) {
                        if !id.trim().is_empty() {
                            client_id = id.to_string();
                        }
                    }
                    if let Some(secret) = json.get("naver_client_secret").and_then(|v| v.as_str()) {
                        if !secret.trim().is_empty() {
                            client_secret = secret.to_string();
                        }
                    }
                }
            }
        }
    }
    (client_id, client_secret)
}

#[command]
pub async fn save_naver_keys(
    app: AppHandle,
    client_id: String,
    client_secret: String,
) -> MyceliumResult<()> {
    let config_dir = app
        .path()
        .app_config_dir()
        .map_err(|e| MyceliumError::Internal(e.to_string()))?;
    let config_path = config_dir.join("config.json");

    let mut config_data = if config_path.exists() {
        let content =
            fs::read_to_string(&config_path).map_err(|e| MyceliumError::Internal(e.to_string()))?;
        serde_json::from_str::<Value>(&content).unwrap_or(json!({}))
    } else {
        json!({})
    };

    config_data["naver_client_id"] = Value::String(client_id);
    config_data["naver_client_secret"] = Value::String(client_secret);

    let config_str = serde_json::to_string_pretty(&config_data)
        .map_err(|e| MyceliumError::Internal(e.to_string()))?;
    fs::write(&config_path, config_str).map_err(|e| MyceliumError::Internal(e.to_string()))?;

    Ok(())
}

#[derive(serde::Serialize, serde::Deserialize, Default)]
pub struct MallConfig {
    pub naver_commerce_id: String,
    pub naver_commerce_secret: String,
    pub coupang_access_key: String,
    pub coupang_secret_key: String,
    pub coupang_vendor_id: String,
}

#[command]
pub async fn save_mall_keys(app: AppHandle, config: MallConfig) -> MyceliumResult<()> {
    let config_dir = app
        .path()
        .app_config_dir()
        .map_err(|e| MyceliumError::Internal(e.to_string()))?;
    let config_path = config_dir.join("config.json");

    let mut config_data = if config_path.exists() {
        let content =
            fs::read_to_string(&config_path).map_err(|e| MyceliumError::Internal(e.to_string()))?;
        serde_json::from_str::<Value>(&content).unwrap_or(json!({}))
    } else {
        json!({})
    };

    config_data["naver_commerce_id"] = Value::String(config.naver_commerce_id);
    config_data["naver_commerce_secret"] = Value::String(config.naver_commerce_secret);
    config_data["coupang_access_key"] = Value::String(config.coupang_access_key);
    config_data["coupang_secret_key"] = Value::String(config.coupang_secret_key);
    config_data["coupang_vendor_id"] = Value::String(config.coupang_vendor_id);

    let config_str = serde_json::to_string_pretty(&config_data)
        .map_err(|e| MyceliumError::Internal(e.to_string()))?;
    fs::write(&config_path, config_str).map_err(|e| MyceliumError::Internal(e.to_string()))?;

    Ok(())
}

#[command]
pub async fn get_mall_config_for_ui(app: AppHandle) -> MyceliumResult<MallConfig> {
    let mut config = MallConfig::default();

    if let Ok(config_dir) = app.path().app_config_dir() {
        let config_path = config_dir.join("config.json");
        if config_path.exists() {
            if let Ok(content) = fs::read_to_string(&config_path) {
                if let Ok(json) = serde_json::from_str::<Value>(&content) {
                    config.naver_commerce_id = json
                        .get("naver_commerce_id")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string();
                    config.naver_commerce_secret = json
                        .get("naver_commerce_secret")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string();
                    config.coupang_access_key = json
                        .get("coupang_access_key")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string();
                    config.coupang_secret_key = json
                        .get("coupang_secret_key")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string();
                    config.coupang_vendor_id = json
                        .get("coupang_vendor_id")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string();
                }
            }
        }
    }
    Ok(config)
}

#[derive(serde::Serialize, serde::Deserialize, Default)]
pub struct CourierConfig {
    pub provider: String,
    pub api_key: String,
    pub client_id: Option<String>,
}

#[command]
pub async fn save_courier_config(app: AppHandle, config: CourierConfig) -> MyceliumResult<()> {
    let config_dir = app
        .path()
        .app_config_dir()
        .map_err(|e| MyceliumError::Internal(e.to_string()))?;
    let config_path = config_dir.join("config.json");

    let mut config_data = if config_path.exists() {
        let content =
            fs::read_to_string(&config_path).map_err(|e| MyceliumError::Internal(e.to_string()))?;
        serde_json::from_str::<Value>(&content).unwrap_or(json!({}))
    } else {
        json!({})
    };

    config_data["courier_provider"] = Value::String(config.provider);
    config_data["courier_api_key"] = Value::String(config.api_key);
    config_data["courier_client_id"] = Value::String(config.client_id.unwrap_or_default());

    let config_str = serde_json::to_string_pretty(&config_data)
        .map_err(|e| MyceliumError::Internal(e.to_string()))?;
    fs::write(&config_path, config_str).map_err(|e| MyceliumError::Internal(e.to_string()))?;

    Ok(())
}

#[command]
pub async fn get_courier_config_for_ui(app: AppHandle) -> MyceliumResult<CourierConfig> {
    let mut config = CourierConfig::default();

    if let Ok(config_dir) = app.path().app_config_dir() {
        let config_path = config_dir.join("config.json");
        if config_path.exists() {
            if let Ok(content) = fs::read_to_string(&config_path) {
                if let Ok(json) = serde_json::from_str::<Value>(&content) {
                    config.provider = json
                        .get("courier_provider")
                        .and_then(|v| v.as_str())
                        .unwrap_or("sweettracker")
                        .to_string();
                    config.api_key = json
                        .get("courier_api_key")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string();
                    config.client_id = json
                        .get("courier_client_id")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string());
                }
            }
        }
    }
    Ok(config)
}

fn get_default_templates() -> Value {
    json!({
        "default": [
            "안녕하세요, ${name}님! Mycelium 제니입니다~ 🍄\n항상 저희 농장을 아껴주셔서 감사 인사를 드립니다. 이번에 정말 품질 좋은 버섯이 수확되어 ${name}님이 생각나서 연락드렸어요. 필요하실 때 말씀해 주시면 정성을 다해 챙겨드리겠습니다! 🎁",
            "[Mycelium] ${name}님, 오늘 하루도 행복하신가요? 😊\n평소 우수 고객으로 저희 농장과 함께해 주셔서 특별히 감사의 마음을 담아 문자 드립니다. 늘 건강하시고, 조만간 다시 뵐 수 있기를 기대하겠습니다! 💙",
            "${name}님, 버섯 요리 생각날 때 되지 않으셨나요? 😉\nMycelium 제니가 제안드리는 제철 버섯 한 바구니! 지금이 딱 맛과 향이 절정일 때입니다. ${name}님과 같은 우수 고객님께는 더욱 신경 써서 보내드릴게요! 🍄🌱",
            "띵동~ ${name}님, Mycelium 제니입니다! ✨\n저희 농장을 잊고 지내신 건 아니시죠? 오늘 수확한 버섯들이 역대급으로 향이 좋습니다. 건강하고 즐거운 주말 보내세요! 🌻"
        ],
        "repurchase": [
            "[Mycelium] ${name}님, 버섯 떨어질 때 되지 않으셨나요? 😉\n제니가 AI로 분석해보니 지금쯤 향긋한 버섯 한 번 더 드시면 딱 좋을 시기더라구요! 오늘 주문하시면 최고 품질로 엄선해 보내드리겠습니다. 🍄",
            "안녕하세요 ${name}님, Mycelium 제니입니다! 🌱\n지난번에 드신 버섯은 만족스러우셨나요? 재구매를 고민 중이시라면 지금이 기회입니다! 오늘 수확한 싱싱한 버섯들이 주인을 기다리고 있어요. ✨",
            "[Mycelium] ${name}님만을 위한 특별한 제안! 🎁\n주기적으로 저희 농장을 찾아주셔서 감사합니다. 이번에 준비한 버섯 구성이 정말 알차니, 놓치지 마시고 꼭 다시 한 번 맛보셨으면 좋겠어요! 🍄✨"
        ],
        "churn": [
            "[Mycelium] ${name}님, 오랜만이에요! 제니가 많이 기다렸답니다. 🍄\n저희 농장을 잊으신 건 아니시죠? ${name}님을 위해 정성껏 준비한 특별 혜택이 있으니, 오랜만에 향긋한 버섯 내음 맡으러 오세요! 💙",
            "안녕하세요 ${name}님, Mycelium 제니입니다~ 🌱\n한동안 소식이 없으셔서 걱정했어요. 다시 뵙고 싶은 마음에 작은 성의를 준비했습니다. 궁금하신 점 있으시면 언제든 제니를 찾아주세요! 😊",
            "[Mycelium] 띵동! ${name}님을 위한 깜짝 선물이 도착했어요 🎁\n오랜만에 저희 버섯으로 풍성한 식탁을 만들어보시는 건 어떨까요? 항상 최상의 맛과 신선함으로 보답하겠습니다! ✨"
        ],
        "shipping_receipt": [
            "[Mycelium] 안녕하세요 ${name}님! 🍄\n주문하신 상품의 입금 확인이 늦어지고 있어 안내드립니다. 입금 확인 후 정성껏 포장하여 최대한 빠르게 발송해 드리겠습니다. 감사합니다. 😊"
        ],
        "shipping_paid": [
            "[Mycelium] 입금 확인 완료! 🍄\n${name}님, 주문하신 상품의 입금이 확인되었습니다. 오늘 중으로 가장 신선한 상품을 골라 정성스럽게 발송해 드릴 예정입니다. 조금만 기다려 주세요! ✨"
        ],
        "shipping_done": [
            "[Mycelium] 배송 시작 안내! 🚚\n${name}님, 주문하신 상품이 오늘 발송되었습니다. 신선함을 가득 담아 안전하게 전달해 드릴게요! 맛있게 드시고 늘 건강하세요. 🍄💙"
        ]
    })
}

#[command]
pub async fn get_message_templates(app: AppHandle) -> MyceliumResult<Value> {
    let config_dir = app
        .path()
        .app_config_dir()
        .map_err(|e| MyceliumError::Internal(e.to_string()))?;
    let template_path = config_dir.join("templates.json");

    if template_path.exists() {
        let content = fs::read_to_string(&template_path)
            .map_err(|e| MyceliumError::Internal(e.to_string()))?;
        Ok(serde_json::from_str::<Value>(&content).unwrap_or_else(|_| get_default_templates()))
    } else {
        Ok(get_default_templates())
    }
}

#[command]
pub async fn save_message_templates(app: AppHandle, templates: Value) -> MyceliumResult<()> {
    let config_dir = app
        .path()
        .app_config_dir()
        .map_err(|e| MyceliumError::Internal(e.to_string()))?;
    if !config_dir.exists() {
        fs::create_dir_all(&config_dir).map_err(|e| MyceliumError::Internal(e.to_string()))?;
    }
    let template_path = config_dir.join("templates.json");

    let content = serde_json::to_string_pretty(&templates)
        .map_err(|e| MyceliumError::Internal(e.to_string()))?;
    fs::write(&template_path, content).map_err(|e| MyceliumError::Internal(e.to_string()))?;

    Ok(())
}

#[command]
pub async fn reset_message_templates(app: AppHandle) -> MyceliumResult<Value> {
    let config_dir = app
        .path()
        .app_config_dir()
        .map_err(|e| MyceliumError::Internal(e.to_string()))?;
    let template_path = config_dir.join("templates.json");

    if template_path.exists() {
        let _ = fs::remove_file(&template_path);
    }

    Ok(get_default_templates())
}

#[command]
pub async fn save_external_backup_path(app: AppHandle, path: String) -> MyceliumResult<()> {
    let config_dir = app
        .path()
        .app_config_dir()
        .map_err(|e| MyceliumError::Internal(e.to_string()))?;
    let config_path = config_dir.join("config.json");

    let mut config_data = if config_path.exists() {
        let content =
            fs::read_to_string(&config_path).map_err(|e| MyceliumError::Internal(e.to_string()))?;
        serde_json::from_str::<Value>(&content).unwrap_or(json!({}))
    } else {
        json!({})
    };

    config_data["external_backup_path"] = Value::String(path);

    let config_str = serde_json::to_string_pretty(&config_data)
        .map_err(|e| MyceliumError::Internal(e.to_string()))?;
    fs::write(&config_path, config_str).map_err(|e| MyceliumError::Internal(e.to_string()))?;

    Ok(())
}

#[command]
pub async fn get_external_backup_path(app: AppHandle) -> MyceliumResult<String> {
    let config_dir = app
        .path()
        .app_config_dir()
        .map_err(|e| MyceliumError::Internal(e.to_string()))?;
    let config_path = config_dir.join("config.json");

    if config_path.exists() {
        let content =
            fs::read_to_string(&config_path).map_err(|e| MyceliumError::Internal(e.to_string()))?;
        let json: Value = serde_json::from_str(&content).unwrap_or(json!({}));
        if let Some(path) = json.get("external_backup_path").and_then(|v| v.as_str()) {
            return Ok(path.to_string());
        }
    }
    Ok("".to_string())
}

#[command]
pub async fn get_naver_client_id_for_ui(app: AppHandle) -> MyceliumResult<String> {
    let (id, _) = get_naver_keys(&app);
    Ok(id)
}

#[derive(serde::Serialize, serde::Deserialize)]
pub struct SmsConfig {
    #[serde(rename = "apiKey")]
    pub api_key: String,
    #[serde(rename = "senderNumber")]
    pub sender_number: String,
    pub provider: Option<String>,
}

#[command]
pub async fn save_sms_config(
    app: AppHandle,
    api_key: String,
    sender_number: String,
    provider: String,
) -> MyceliumResult<()> {
    let config_dir = app
        .path()
        .app_config_dir()
        .map_err(|e| MyceliumError::Internal(e.to_string()))?;
    let config_path = config_dir.join("config.json");

    let mut config_data = if config_path.exists() {
        let content =
            fs::read_to_string(&config_path).map_err(|e| MyceliumError::Internal(e.to_string()))?;
        serde_json::from_str::<Value>(&content).unwrap_or(json!({}))
    } else {
        json!({})
    };

    config_data["sms_api_key"] = Value::String(api_key);
    config_data["sms_sender_number"] = Value::String(sender_number);
    config_data["sms_provider"] = Value::String(provider);

    let config_str = serde_json::to_string_pretty(&config_data)
        .map_err(|e| MyceliumError::Internal(e.to_string()))?;
    fs::write(&config_path, config_str).map_err(|e| MyceliumError::Internal(e.to_string()))?;

    Ok(())
}

#[command]
pub async fn get_sms_config_for_ui(app: AppHandle) -> MyceliumResult<Option<SmsConfig>> {
    let config_dir = app
        .path()
        .app_config_dir()
        .map_err(|e| MyceliumError::Internal(e.to_string()))?;
    let config_path = config_dir.join("config.json");

    if !config_path.exists() {
        return Ok(None);
    }

    let content =
        fs::read_to_string(&config_path).map_err(|e| MyceliumError::Internal(e.to_string()))?;
    let config_data: Value = serde_json::from_str(&content).unwrap_or(json!({}));

    let api_key = config_data
        .get("sms_api_key")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    let sender_number = config_data
        .get("sms_sender_number")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    let provider = config_data
        .get("sms_provider")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    Ok(Some(SmsConfig {
        api_key,
        sender_number,
        provider,
    }))
}

#[command]
pub async fn setup_system(
    app_handle: AppHandle,
    db_user: String,
    db_pass: String,
    db_host: String,
    db_port: String,
    db_name: String,
    gemini_key: Option<String>,
) -> MyceliumResult<String> {
    // 1. Validate inputs
    if db_user.trim().is_empty() {
        return Err(MyceliumError::Validation(
            "Database user is required".to_string(),
        ));
    }
    if db_name.trim().is_empty() {
        return Err(MyceliumError::Validation(
            "Database name is required".to_string(),
        ));
    }
    // Simple validation to prevent injection in CREATE DATABASE
    if !db_name
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '_')
    {
        return Err(MyceliumError::Validation(
            "Database name must contain only alphanumeric characters and underscores.".to_string(),
        ));
    }

    // 2. Try to connect to 'postgres' database to create the new database
    let maintenance_url = format!(
        "postgres://{}:{}@{}:{}/postgres",
        db_user, db_pass, db_host, db_port
    );

    // We use a temporary connection just to create the DB
    use sqlx::Connection;
    use std::str::FromStr;
    let opts = sqlx::postgres::PgConnectOptions::from_str(&maintenance_url).map_err(
        |e: sqlx::Error| MyceliumError::Internal(format!("Invalid connection URL: {}", e)),
    )?;

    let mut conn = sqlx::postgres::PgConnection::connect_with(&opts)
        .await
        .map_err(|e: sqlx::Error| {
            MyceliumError::Internal(format!(
                "Failed to connect to PostgreSQL. Check credentials. Error: {}",
                e
            ))
        })?;

    // 3. Create Database if not exists
    let create_query = format!("CREATE DATABASE \"{}\"", db_name);
    let create_db_result = sqlx::query(&create_query).execute(&mut conn).await;

    match create_db_result {
        Ok(_) => {
            // Database created successfully
        }
        Err(e) => {
            let msg = e.to_string();
            if msg.contains("already exists") || msg.contains("이미 있음") {
                // println!("Database already exists, proceeding to configuration.");
            } else {
                return Err(MyceliumError::Database(e));
            }
        }
    }

    // 4. Create Configuration File (Persistent in AppData)
    let final_db_url = format!(
        "postgres://{}:{}@{}:{}/{}",
        db_user, db_pass, db_host, db_port, db_name
    );

    let config_dir = app_handle
        .path()
        .app_config_dir()
        .map_err(|e: tauri::Error| MyceliumError::Internal(e.to_string()))?;

    if !config_dir.exists() {
        fs::create_dir_all(&config_dir)
            .map_err(|e| MyceliumError::Internal(format!("Failed to create config dir: {}", e)))?;
    }

    let config_path = config_dir.join("config.json");

    let mut config_data = if config_path.exists() {
        let content = fs::read_to_string(&config_path).unwrap_or_else(|_| "{}".to_string());
        serde_json::from_str::<Value>(&content).unwrap_or(json!({}))
    } else {
        json!({})
    };

    config_data["database_url"] = Value::String(final_db_url.clone());

    if let Some(key) = gemini_key {
        let clean_key = key.trim();
        if !clean_key.is_empty() {
            config_data["gemini_api_key"] = Value::String(clean_key.to_string());
        }
    }
    let config_str = serde_json::to_string_pretty(&config_data)
        .map_err(|e: serde_json::Error| MyceliumError::Internal(e.to_string()))?;

    fs::write(&config_path, config_str)
        .map_err(|e| MyceliumError::Internal(format!("Failed to write config file: {}", e)))?;

    // 5. Initialize Schema
    let pool = init_pool(&final_db_url).await.map_err(|e| {
        MyceliumError::Internal(format!("Failed to connect to new database: {}", e))
    })?;
    crate::db::init_database(&pool)
        .await
        .map_err(|e| MyceliumError::Internal(format!("Failed to initialize schema: {}", e)))?;

    // Initialize App Plugin (for version checking)
    app_handle
        .plugin(tauri_plugin_app::init())
        .map_err(|e: tauri::Error| {
            MyceliumError::Internal(format!("Failed to initialize App plugin: {}", e))
        })?;

    // 6. Update State and Manage Pool
    app_handle.manage(pool);

    let setup_state = app_handle.state::<SetupState>();
    *setup_state.is_configured.lock().unwrap() = true;

    Ok("Database setup complete.".to_string())
}

#[command]
pub async fn get_company_info(
    state: State<'_, crate::db::DbPool>,
) -> MyceliumResult<Option<CompanyInfo>> {
    let pool = state.inner();
    let row = sqlx::query_as::<_, CompanyInfo>("SELECT * FROM company_info LIMIT 1")
        .fetch_optional(pool)
        .await?;
    Ok(row)
}

#[command]
pub async fn save_company_info(
    state: State<'_, crate::db::DbPool>,
    company_name: String,
    representative_name: Option<String>,
    phone_number: Option<String>,
    mobile_number: Option<String>,
    business_reg_number: Option<String>,
    registration_date: Option<String>,
    memo: Option<String>,
    address: Option<String>,
    business_type: Option<String>,
    item: Option<String>,
) -> MyceliumResult<()> {
    let reg_date = registration_date.and_then(|s| {
        chrono::NaiveDate::parse_from_str(&s, "%Y-%m-%d")
            .ok()
            .and_then(|d| d.and_hms_opt(0, 0, 0))
    });

    let pool = state.inner();

    // Check if exists
    let exists = sqlx::query("SELECT 1 FROM company_info LIMIT 1")
        .fetch_optional(pool)
        .await?;

    if exists.is_some() {
        sqlx::query(
            "UPDATE company_info SET 
             company_name = $1, representative_name = $2, phone_number = $3, 
             mobile_number = $4, business_reg_number = $5, registration_date = $6, memo = $7, 
             address = $8, business_type = $9, item = $10,
             updated_at = CURRENT_TIMESTAMP",
        )
        .bind(company_name)
        .bind(representative_name)
        .bind(phone_number)
        .bind(mobile_number)
        .bind(business_reg_number)
        .bind(reg_date)
        .bind(memo)
        .bind(address)
        .bind(business_type)
        .bind(item)
        .execute(pool)
        .await?;
    } else {
        sqlx::query(
            "INSERT INTO company_info 
             (company_name, representative_name, phone_number, mobile_number, 
              business_reg_number, registration_date, memo, address, business_type, item)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)",
        )
        .bind(company_name)
        .bind(representative_name)
        .bind(phone_number)
        .bind(mobile_number)
        .bind(business_reg_number)
        .bind(reg_date)
        .bind(memo)
        .bind(address)
        .bind(business_type)
        .bind(item)
        .execute(pool)
        .await?;
    }

    Ok(())
}

#[derive(Debug, serde::Serialize, serde::Deserialize)]
pub struct LoginResponse {
    pub success: bool,
    pub message: String,
    pub user_id: Option<i32>,
    pub username: Option<String>,
    pub role: Option<String>,
}

#[command]
pub async fn verify_admin_password(
    state: State<'_, crate::db::DbPool>,
    password: String,
) -> MyceliumResult<bool> {
    let user_result = sqlx::query_as::<_, User>(
        "SELECT id, username, password_hash, role, created_at, updated_at FROM users WHERE username = 'admin'",
    )
    .fetch_optional(&*state)
    .await?;

    match user_result {
        Some(user) => {
            if let Some(hash) = &user.password_hash {
                match verify(&password, hash) {
                    Ok(is_valid) => Ok(is_valid),
                    Err(_) => Err(MyceliumError::Auth(
                        "Password verification error".to_string(),
                    )),
                }
            } else {
                Err(MyceliumError::Auth(
                    "Admin user has no password set".to_string(),
                ))
            }
        }
        None => Err(MyceliumError::Auth("Admin user not found".to_string())),
    }
}

#[command]
pub async fn login(
    state: State<'_, crate::db::DbPool>,
    username: String,
    password: String,
) -> MyceliumResult<LoginResponse> {
    // Validate inputs
    if username.trim().is_empty() || password.trim().is_empty() {
        return Ok(LoginResponse {
            success: false,
            message: "아이디와 비밀번호를 입력해주세요.".to_string(),
            user_id: None,
            username: None,
            role: None,
        });
    }

    // Query user from database
    let user_result = sqlx::query_as::<_, User>(
        "SELECT id, username, password_hash, role, created_at, updated_at FROM users WHERE username = $1",
    )
    .bind(&username)
    .fetch_optional(&*state)
    .await?;

    match user_result {
        Some(user) => {
            // Verify password
            if let Some(password_hash) = &user.password_hash {
                match verify(&password, password_hash) {
                    Ok(is_valid) => {
                        if is_valid {
                            Ok(LoginResponse {
                                success: true,
                                message: "로그인 성공".to_string(),
                                user_id: Some(user.id),
                                username: Some(user.username.clone()),
                                role: Some(user.role.clone()),
                            })
                        } else {
                            Ok(LoginResponse {
                                success: false,
                                message: "비밀번호가 올바르지 않습니다.".to_string(),
                                user_id: None,
                                username: None,
                                role: None,
                            })
                        }
                    }
                    Err(_) => Ok(LoginResponse {
                        success: false,
                        message: "비밀번호 확인 중 오류가 발생했습니다.".to_string(),
                        user_id: None,
                        username: None,
                        role: None,
                    }),
                }
            } else {
                Ok(LoginResponse {
                    success: false,
                    message: "사용자 정보가 올바르지 않습니다.".to_string(),
                    user_id: None,
                    username: None,
                    role: None,
                })
            }
        }
        None => Ok(LoginResponse {
            success: false,
            message: "존재하지 않는 사용자입니다.".to_string(),
            user_id: None,
            username: None,
            role: None,
        }),
    }
}

#[command]
pub async fn change_password(
    state: State<'_, crate::db::DbPool>,
    username: String,
    old_password: String,
    new_password: String,
) -> MyceliumResult<String> {
    // Validate inputs
    if username.trim().is_empty()
        || old_password.trim().is_empty()
        || new_password.trim().is_empty()
    {
        return Err(MyceliumError::Validation(
            "모든 필드를 입력해주세요.".to_string(),
        ));
    }

    if new_password.len() < 4 {
        return Err(MyceliumError::Validation(
            "새 비밀번호는 최소 4자 이상이어야 합니다.".to_string(),
        ));
    }

    // Query user from database
    let user_result = sqlx::query_as::<_, User>(
        "SELECT id, username, password_hash, role, created_at FROM users WHERE username = $1",
    )
    .bind(&username)
    .fetch_optional(&*state)
    .await?;

    match user_result {
        Some(user) => {
            // Verify old password
            if let Some(password_hash) = &user.password_hash {
                match verify(&old_password, password_hash) {
                    Ok(is_valid) => {
                        if !is_valid {
                            return Err(MyceliumError::Auth(
                                "현재 비밀번호가 올바르지 않습니다.".to_string(),
                            ));
                        }
                    }
                    Err(_) => {
                        return Err(MyceliumError::Internal(
                            "비밀번호 확인 중 오류가 발생했습니다.".to_string(),
                        ))
                    }
                }
            } else {
                return Err(MyceliumError::Auth(
                    "사용자 정보가 올바르지 않습니다.".to_string(),
                ));
            }

            // Hash new password
            let new_password_hash = hash(&new_password, DEFAULT_COST)
                .map_err(|e| MyceliumError::Internal(format!("비밀번호 해시 생성 실패: {}", e)))?;

            // Update password in database
            DB_MODIFIED.store(true, Ordering::Relaxed);
            sqlx::query("UPDATE users SET password_hash = $1 WHERE username = $2")
                .bind(&new_password_hash)
                .bind(&username)
                .execute(&*state)
                .await?;

            Ok("비밀번호가 성공적으로 변경되었습니다.".to_string())
        }
        None => Err(MyceliumError::Auth(
            "존재하지 않는 사용자입니다.".to_string(),
        )),
    }
}

#[command]
pub async fn get_all_users(state: State<'_, crate::db::DbPool>) -> MyceliumResult<Vec<User>> {
    let users = sqlx::query_as::<_, User>(
        "SELECT id, username, password_hash, role, created_at, updated_at FROM users ORDER BY created_at DESC",
    )
    .fetch_all(&*state)
    .await?;

    Ok(users)
}

#[command]
pub async fn create_user(
    state: State<'_, crate::db::DbPool>,
    username: String,
    password: Option<String>,
    role: String,
) -> MyceliumResult<()> {
    if username.trim().is_empty() {
        return Err(MyceliumError::Validation(
            "아이디를 입력해주세요.".to_string(),
        ));
    }

    let password_hash = if let Some(pwd) = password {
        if pwd.trim().is_empty() {
            None
        } else {
            Some(hash(&pwd, DEFAULT_COST).map_err(|e| MyceliumError::Internal(e.to_string()))?)
        }
    } else {
        None
    };

    DB_MODIFIED.store(true, Ordering::Relaxed);
    sqlx::query("INSERT INTO users (username, password_hash, role) VALUES ($1, $2, $3)")
        .bind(username)
        .bind(password_hash)
        .bind(role)
        .execute(&*state)
        .await?;

    Ok(())
}

#[command]
pub async fn update_user(
    state: State<'_, crate::db::DbPool>,
    id: i32,
    username: String,
    password: Option<String>,
    role: String,
) -> MyceliumResult<()> {
    let password_hash = if let Some(pwd) = password {
        if pwd.trim().is_empty() {
            None
        } else {
            Some(hash(&pwd, DEFAULT_COST).map_err(|e| MyceliumError::Internal(e.to_string()))?)
        }
    } else {
        None
    };

    DB_MODIFIED.store(true, Ordering::Relaxed);
    if let Some(hash) = password_hash {
        sqlx::query("UPDATE users SET username = $1, password_hash = $2, role = $3 WHERE id = $4")
            .bind(username)
            .bind(hash)
            .bind(role)
            .bind(id)
            .execute(&*state)
            .await?;
    } else {
        sqlx::query("UPDATE users SET username = $1, role = $2 WHERE id = $3")
            .bind(username)
            .bind(role)
            .bind(id)
            .execute(&*state)
            .await?;
    }

    Ok(())
}

#[command]
pub async fn delete_user(state: State<'_, crate::db::DbPool>, id: i32) -> MyceliumResult<()> {
    DB_MODIFIED.store(true, Ordering::Relaxed);
    sqlx::query("DELETE FROM users WHERE id = $1")
        .bind(id)
        .execute(&*state)
        .await?;
    Ok(())
}

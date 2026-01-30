#![allow(clippy::too_many_arguments, clippy::type_complexity)]
pub mod analysis;
pub mod db;
pub mod ledger_cmds;
use analysis::{
    get_all_time_customer_analysis, get_order_value_distribution, get_sales_by_region_analysis,
    get_sales_period_analysis, sales_polars_analysis_v4,
};
use bcrypt::{hash, verify, DEFAULT_COST};
use chrono::{Datelike, Local, NaiveDate, NaiveDateTime, NaiveTime, Utc};
use db::Schedule;
use db::{
    init_pool, AiMarketingProposal, AnalyzedMention, ChurnRiskCustomer, CompanyInfo, Consultation,
    ConsultationAiAdvice, Customer, CustomerAddress, CustomerLifecycle, DashboardStats, DbPool,
    Event, Expense, ExperienceProgram, ExperienceReservation, InventoryAlert, InventorySyncItem,
    KeywordItem, LtvCustomer, MonthlyCohortStats, OnlineMentionInput, Product, ProductAssociation,
    ProductSalesStats, ProfitAnalysisResult, Purchase, RawRfmData, Sales, SalesClaim,
    SentimentAnalysisResult, StrategyItem, TenYearSalesStats, User, Vendor,
};
use flate2::read::GzDecoder;
use flate2::write::GzEncoder;
use flate2::Compression;
use futures_util::StreamExt;
use ledger_cmds::*;
use sqlx::ConnectOptions;
use sqlx::Connection;
use sqlx::FromRow;
use std::collections::HashMap;
use std::io::{BufRead, BufWriter, Read, Write};
use tauri::{Emitter, Manager, State};
// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/

#[tauri::command]
async fn save_qr_image(
    _app: tauri::AppHandle,
    base64_data: String,
    path: String,
) -> Result<(), String> {
    use base64::{engine::general_purpose, Engine as _};

    // Remove data:image/png;base64, prefix
    let data = base64_data
        .split(',')
        .next_back()
        .ok_or("Invalid image data")?;
    let bytes = general_purpose::STANDARD
        .decode(data)
        .map_err(|e| e.to_string())?;

    let mut file = std::fs::File::create(&path).map_err(|e| e.to_string())?;
    file.write_all(&bytes).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
async fn generate_qr_code(text: String) -> Result<String, String> {
    use base64::{engine::general_purpose, Engine as _};

    let png_bytes = qrcode_generator::to_png_to_vec(text, qrcode_generator::QrCodeEcc::Medium, 250)
        .map_err(|e| e.to_string())?;

    let base64_img = general_purpose::STANDARD.encode(png_bytes);
    Ok(format!("data:image/png;base64,{}", base64_img))
}

#[tauri::command]
async fn open_external_url(app: tauri::AppHandle, url: String) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[derive(Default)]
pub struct SetupState {
    pub is_configured: std::sync::Mutex<bool>,
}

#[tauri::command]
fn check_setup_status(state: State<'_, SetupState>) -> bool {
    *state.is_configured.lock().unwrap()
}

/// Helper to retrieve the database URL ONLY from config.json (Security Enforced)
fn get_db_url(app: &tauri::AppHandle) -> Result<String, String> {
    if let Ok(config_dir) = app.path().app_config_dir() {
        let config_path = config_dir.join("config.json");
        if config_path.exists() {
            if let Ok(content) = std::fs::read_to_string(&config_path) {
                if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
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

/// Helper to retrieve the Gemini API Key ONLY from config.json (Security Enforced)
fn get_gemini_api_key(app: &tauri::AppHandle) -> Option<String> {
    if let Ok(config_dir) = app.path().app_config_dir() {
        let config_path = config_dir.join("config.json");
        if config_path.exists() {
            if let Ok(content) = std::fs::read_to_string(&config_path) {
                if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
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

#[tauri::command]
async fn get_gemini_api_key_for_ui(app: tauri::AppHandle) -> Result<String, String> {
    Ok(get_gemini_api_key(&app).unwrap_or_default())
}

#[tauri::command]
async fn save_gemini_api_key(app: tauri::AppHandle, key: String) -> Result<(), String> {
    let config_dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    let config_path = config_dir.join("config.json");

    let mut config_data = if config_path.exists() {
        let content = std::fs::read_to_string(&config_path).map_err(|e| e.to_string())?;
        serde_json::from_str::<serde_json::Value>(&content).unwrap_or(serde_json::json!({}))
    } else {
        serde_json::json!({})
    };

    config_data["gemini_api_key"] = serde_json::Value::String(key);

    let config_str = serde_json::to_string_pretty(&config_data).map_err(|e| e.to_string())?;
    std::fs::write(&config_path, config_str).map_err(|e| e.to_string())?;

    // Also update current process env to take effect immediately
    std::env::set_var(
        "GEMINI_API_KEY",
        &config_data["gemini_api_key"].as_str().unwrap_or(""),
    );

    Ok(())
}

fn get_naver_keys(app: &tauri::AppHandle) -> (String, String) {
    let mut client_id = "".to_string();
    let mut client_secret = "".to_string();

    if let Ok(config_dir) = app.path().app_config_dir() {
        let config_path = config_dir.join("config.json");
        if config_path.exists() {
            if let Ok(content) = std::fs::read_to_string(&config_path) {
                if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
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

#[tauri::command]
async fn save_naver_keys(
    app: tauri::AppHandle,
    client_id: String,
    client_secret: String,
) -> Result<(), String> {
    let config_dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    let config_path = config_dir.join("config.json");

    let mut config_data = if config_path.exists() {
        let content = std::fs::read_to_string(&config_path).map_err(|e| e.to_string())?;
        serde_json::from_str::<serde_json::Value>(&content).unwrap_or(serde_json::json!({}))
    } else {
        serde_json::json!({})
    };

    config_data["naver_client_id"] = serde_json::Value::String(client_id);
    config_data["naver_client_secret"] = serde_json::Value::String(client_secret);

    let config_str = serde_json::to_string_pretty(&config_data).map_err(|e| e.to_string())?;
    std::fs::write(&config_path, config_str).map_err(|e| e.to_string())?;

    Ok(())
}

fn get_default_templates() -> serde_json::Value {
    serde_json::json!({
        "default": [
            "안녕하세요, ${name}님! 스마트 농장 제니입니다~ 🍄\n항상 저희 농장을 아껴주셔서 감사 인사를 드립니다. 이번에 정말 품질 좋은 버섯이 수확되어 ${name}님이 생각나서 연락드렸어요. 필요하실 때 말씀해 주시면 정성을 다해 챙겨드리겠습니다! 🎁",
            "[스마트 농장] ${name}님, 오늘 하루도 행복하신가요? 😊\n평소 우수 고객으로 저희 농장과 함께해 주셔서 특별히 감사의 마음을 담아 문자 드립니다. 늘 건강하시고, 조만간 다시 뵐 수 있기를 기대하겠습니다! 💙",
            "${name}님, 버섯 요리 생각날 때 되지 않으셨나요? 😉\n스마트 농장 제니가 제안드리는 제철 버섯 한 바구니! 지금이 딱 맛과 향이 절정일 때입니다. ${name}님과 같은 우수 고객님께는 더욱 신경 써서 보내드릴게요! 🍄🌱",
            "띵동~ ${name}님, 스마트 농장 제니입니다! ✨\n저희 농장을 잊고 지내신 건 아니시죠? 오늘 수확한 버섯들이 역대급으로 향이 좋습니다. 건강하고 즐거운 주말 보내세요! 🌻"
        ],
        "repurchase": [
            "[스마트 농장] ${name}님, 버섯 떨어질 때 되지 않으셨나요? 😉\n제니가 AI로 분석해보니 지금쯤 향긋한 버섯 한 번 더 드시면 딱 좋을 시기더라구요! 오늘 주문하시면 최고 품질로 엄선해 보내드리겠습니다. 🍄",
            "안녕하세요 ${name}님, 스마트 농장 제니입니다! 🌱\n지난번에 드신 버섯은 만족스러우셨나요? 재구매를 고민 중이시라면 지금이 기회입니다! 오늘 수확한 싱싱한 버섯들이 주인을 기다리고 있어요. ✨",
            "[스마트 농장] ${name}님만을 위한 특별한 제안! 🎁\n주기적으로 저희 농장을 찾아주셔서 감사합니다. 이번에 준비한 버섯 구성이 정말 알차니, 놓치지 마시고 꼭 다시 한 번 맛보셨으면 좋겠어요! 🍄✨"
        ],
        "churn": [
            "[스마트 농장] ${name}님, 오랜만이에요! 제니가 많이 기다렸답니다. 🍄\n저희 농장을 잊으신 건 아니시죠? ${name}님을 위해 정성껏 준비한 특별 혜택이 있으니, 오랜만에 향긋한 버섯 내음 맡으러 오세요! 💙",
            "안녕하세요 ${name}님, 스마트 농장 제니입니다~ 🌱\n한동안 소식이 없으셔서 걱정했어요. 다시 뵙고 싶은 마음에 작은 성의를 준비했습니다. 궁금하신 점 있으시면 언제든 제니를 찾아주세요! 😊",
            "[스마트 농장] 띵동! ${name}님을 위한 깜짝 선물이 도착했어요 🎁\n오랜만에 저희 버섯으로 풍성한 식탁을 만들어보시는 건 어떨까요? 항상 최상의 맛과 신선함으로 보답하겠습니다! ✨"
        ],
        "shipping_receipt": [
            "[스마트 농장] 안녕하세요 ${name}님! 🍄\n주문하신 상품의 입금 확인이 늦어지고 있어 안내드립니다. 입금 확인 후 정성껏 포장하여 최대한 빠르게 발송해 드리겠습니다. 감사합니다. 😊"
        ],
        "shipping_paid": [
            "[스마트 농장] 입금 확인 완료! 🍄\n${name}님, 주문하신 상품의 입금이 확인되었습니다. 오늘 중으로 가장 신선한 상품을 골라 정성스럽게 발송해 드릴 예정입니다. 조금만 기다려 주세요! ✨"
        ],
        "shipping_done": [
            "[스마트 농장] 배송 시작 안내! 🚚\n${name}님, 주문하신 상품이 오늘 발송되었습니다. 신선함을 가득 담아 안전하게 전달해 드릴게요! 맛있게 드시고 늘 건강하세요. 🍄💙"
        ]
    })
}

#[tauri::command]
async fn get_message_templates(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let config_dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    let template_path = config_dir.join("templates.json");

    if template_path.exists() {
        let content = std::fs::read_to_string(&template_path).map_err(|e| e.to_string())?;
        Ok(serde_json::from_str::<serde_json::Value>(&content)
            .unwrap_or_else(|_| get_default_templates()))
    } else {
        Ok(get_default_templates())
    }
}

#[tauri::command]
async fn save_message_templates(
    app: tauri::AppHandle,
    templates: serde_json::Value,
) -> Result<(), String> {
    let config_dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    if !config_dir.exists() {
        std::fs::create_dir_all(&config_dir).map_err(|e| e.to_string())?;
    }
    let template_path = config_dir.join("templates.json");

    let content = serde_json::to_string_pretty(&templates).map_err(|e| e.to_string())?;
    std::fs::write(&template_path, content).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
async fn reset_message_templates(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let config_dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    let template_path = config_dir.join("templates.json");

    if template_path.exists() {
        let _ = std::fs::remove_file(&template_path);
    }

    Ok(get_default_templates())
}

#[tauri::command]
async fn save_external_backup_path(app: tauri::AppHandle, path: String) -> Result<(), String> {
    let config_dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    let config_path = config_dir.join("config.json");

    let mut config_data = if config_path.exists() {
        let content = std::fs::read_to_string(&config_path).map_err(|e| e.to_string())?;
        serde_json::from_str::<serde_json::Value>(&content).unwrap_or(serde_json::json!({}))
    } else {
        serde_json::json!({})
    };

    config_data["external_backup_path"] = serde_json::Value::String(path);

    let config_str = serde_json::to_string_pretty(&config_data).map_err(|e| e.to_string())?;
    std::fs::write(&config_path, config_str).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
async fn get_external_backup_path(app: tauri::AppHandle) -> Result<String, String> {
    let config_dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    let config_path = config_dir.join("config.json");

    if config_path.exists() {
        let content = std::fs::read_to_string(&config_path).map_err(|e| e.to_string())?;
        let json: serde_json::Value =
            serde_json::from_str(&content).unwrap_or(serde_json::json!({}));
        if let Some(path) = json.get("external_backup_path").and_then(|v| v.as_str()) {
            return Ok(path.to_string());
        }
    }
    Ok("".to_string())
}

#[tauri::command]
async fn get_naver_client_id_for_ui(app: tauri::AppHandle) -> Result<String, String> {
    let (id, _) = get_naver_keys(&app);
    Ok(id)
}

#[derive(serde::Serialize, serde::Deserialize)]
struct SmsConfig {
    #[serde(rename = "apiKey")]
    api_key: String,
    #[serde(rename = "senderNumber")]
    sender_number: String,
    provider: Option<String>,
}

#[tauri::command]
async fn save_sms_config(
    app: tauri::AppHandle,
    api_key: String,
    sender_number: String,
    provider: String,
) -> Result<(), String> {
    let config_dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    let config_path = config_dir.join("config.json");

    let mut config_data = if config_path.exists() {
        let content = std::fs::read_to_string(&config_path).map_err(|e| e.to_string())?;
        serde_json::from_str::<serde_json::Value>(&content).unwrap_or(serde_json::json!({}))
    } else {
        serde_json::json!({})
    };

    config_data["sms_api_key"] = serde_json::Value::String(api_key);
    config_data["sms_sender_number"] = serde_json::Value::String(sender_number);
    config_data["sms_provider"] = serde_json::Value::String(provider);

    let config_str = serde_json::to_string_pretty(&config_data).map_err(|e| e.to_string())?;
    std::fs::write(&config_path, config_str).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
async fn get_sms_config_for_ui(app: tauri::AppHandle) -> Result<Option<SmsConfig>, String> {
    let config_dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    let config_path = config_dir.join("config.json");

    if !config_path.exists() {
        return Ok(None);
    }

    let content = std::fs::read_to_string(&config_path).map_err(|e| e.to_string())?;
    let config_data: serde_json::Value =
        serde_json::from_str(&content).unwrap_or(serde_json::json!({}));

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

#[tauri::command]
async fn setup_system(
    app_handle: tauri::AppHandle,
    db_user: String,
    db_pass: String,
    db_host: String,
    db_port: String,
    db_name: String,
    gemini_key: Option<String>,
) -> Result<String, String> {
    // 1. Validate inputs
    if db_user.trim().is_empty() {
        return Err("Database user is required".to_string());
    }
    if db_name.trim().is_empty() {
        return Err("Database name is required".to_string());
    }
    // Simple validation to prevent injection in CREATE DATABASE
    if !db_name
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '_')
    {
        return Err(
            "Database name must contain only alphanumeric characters and underscores.".to_string(),
        );
    }

    // 2. Try to connect to 'postgres' database to create the new database
    let maintenance_url = format!(
        "postgres://{}:{}@{}:{}/postgres",
        db_user, db_pass, db_host, db_port
    );

    // We use a temporary connection just to create the DB
    use std::str::FromStr;
    let opts = sqlx::postgres::PgConnectOptions::from_str(&maintenance_url)
        .map_err(|e: sqlx::Error| format!("Invalid connection URL: {}", e))?
        .log_statements(log::LevelFilter::Debug);

    let mut conn = sqlx::postgres::PgConnection::connect_with(&opts)
        .await
        .map_err(|e: sqlx::Error| {
            format!(
                "Failed to connect to PostgreSQL. Check credentials. Error: {}",
                e
            )
        })?;

    // 3. Create Database if not exists
    // Note: Parameter binding for identifiers (database name) is not supported in standard SQL.
    // We validated db_name above, so this formatted string is safe.
    let create_query = format!("CREATE DATABASE \"{}\"", db_name);
    let create_db_result = sqlx::query(&create_query).execute(&mut conn).await;

    match create_db_result {
        Ok(_) => {
            // Database created successfully
        }
        Err(e) => {
            let msg = e.to_string();
            // Check for English ("already exists") or Korean ("이미 있음") error messages
            if msg.contains("already exists") || msg.contains("이미 있음") {
                // println!("Database already exists, proceeding to configuration.");
            } else {
                return Err(format!("Failed to create database '{}': {}", db_name, e));
            }
        }
    }

    // 4. Create Configuration File (Persistent in AppData)
    let final_db_url = format!(
        "postgres://{}:{}@{}:{}/{}",
        db_user, db_pass, db_host, db_port, db_name
    );

    // Get App Config Directory
    let config_dir = app_handle
        .path()
        .app_config_dir()
        .map_err(|e: tauri::Error| e.to_string())?;

    if !config_dir.exists() {
        std::fs::create_dir_all(&config_dir)
            .map_err(|e| format!("Failed to create config dir: {}", e))?;
    }

    let config_path = config_dir.join("config.json");

    // Read existing config or create new object
    let mut config_data = if config_path.exists() {
        let content = std::fs::read_to_string(&config_path).unwrap_or_else(|_| "{}".to_string());
        serde_json::from_str::<serde_json::Value>(&content).unwrap_or(serde_json::json!({}))
    } else {
        serde_json::json!({})
    };

    // Update fields
    config_data["database_url"] = serde_json::Value::String(final_db_url.clone());

    if let Some(key) = gemini_key {
        let clean_key = key.trim();
        if !clean_key.is_empty() {
            config_data["gemini_api_key"] = serde_json::Value::String(clean_key.to_string());
        }
    }
    let config_str =
        serde_json::to_string_pretty(&config_data).map_err(|e: serde_json::Error| e.to_string())?;

    std::fs::write(&config_path, config_str)
        .map_err(|e| format!("Failed to write config file: {}", e))?;

    // 5. Initialize Schema
    // Now connect to the NEW database to create tables
    let pool = init_pool(&final_db_url)
        .await
        .map_err(|e: sqlx::Error| format!("Failed to connect to new database: {}", e))?;
    db::init_database(&pool)
        .await
        .map_err(|e| format!("Failed to initialize schema: {}", e))?;

    // Initialize App Plugin (for version checking)
    app_handle
        .plugin(tauri_plugin_app::init())
        .map_err(|e: tauri::Error| format!("Failed to initialize App plugin: {}", e))?;

    // 6. Update State and Manage Pool
    app_handle.manage(pool);

    let setup_state = app_handle.state::<SetupState>();
    *setup_state.is_configured.lock().unwrap() = true;

    Ok("Database setup complete.".to_string())
}

#[tauri::command]
async fn fetch_naver_search(
    app: tauri::AppHandle,
    query: String,
) -> Result<Vec<NaverItem>, String> {
    let (client_id, client_secret) = get_naver_keys(&app);

    let url = format!(
        "https://openapi.naver.com/v1/search/blog.json?query={}&display=10&sort=sim",
        urlencoding::encode(&query)
    );

    let client = reqwest::Client::new();
    let res = client
        .get(&url)
        .header("X-Naver-Client-Id", client_id)
        .header("X-Naver-Client-Secret", client_secret)
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    if !res.status().is_success() {
        return Err(format!("Naver API Error: {}", res.status()));
    }

    let search_result: NaverSearchResult = res
        .json()
        .await
        .map_err(|e| format!("Parse failed: {}", e))?;

    Ok(search_result.items)
}

#[derive(Debug, serde::Serialize, serde::Deserialize)]
struct NaverSearchResult {
    items: Vec<NaverItem>,
}

#[derive(Debug, serde::Serialize, serde::Deserialize)]
struct NaverItem {
    title: String,
    link: String,
    description: String,
    bloggername: Option<String>,
    postdate: String,
}

#[tauri::command]
async fn get_rfm_analysis(state: State<'_, DbPool>) -> Result<Vec<CustomerLifecycle>, String> {
    // 1. Fetch Aggregated Data
    let sql = r#"
        SELECT 
            c.customer_id,
            c.customer_name,
            c.mobile_number,
            c.membership_level,
            MAX(s.order_date) as last_order_date,
            COUNT(s.sales_id) as total_orders,
            CAST(COALESCE(SUM(s.total_amount), 0) AS BIGINT) as total_amount
        FROM customers c
        JOIN sales s ON c.customer_id = s.customer_id AND s.status IN ('배송완료', '완료')
        GROUP BY c.customer_id, c.customer_name, c.mobile_number, c.membership_level
        HAVING SUM(s.total_amount) > 0
    "#;

    let raw_data = sqlx::query_as::<_, RawRfmData>(sql)
        .fetch_all(&*state)
        .await
        .map_err(|e| e.to_string())?;

    if raw_data.is_empty() {
        return Ok(Vec::new());
    }

    // 2. Calculate RFM Scores in Rust
    let today = Local::now().date_naive();
    let mut customers: Vec<CustomerLifecycle> = Vec::new();

    let mut frequencies: Vec<i64> = raw_data.iter().map(|d| d.total_orders).collect();
    let mut monetary_values: Vec<i64> = raw_data.iter().map(|d| d.total_amount).collect();
    frequencies.sort_unstable();
    monetary_values.sort_unstable();

    let count = raw_data.len();

    let get_score = |value: i64, sorted_list: &Vec<i64>| -> i32 {
        let pos = sorted_list.binary_search(&value).unwrap_or_else(|x| x);
        let percentile = (pos as f64) / (count as f64);
        if percentile >= 0.8 {
            5
        } else if percentile >= 0.6 {
            4
        } else if percentile >= 0.4 {
            3
        } else if percentile >= 0.2 {
            2
        } else {
            1
        }
    };

    for d in raw_data {
        let days_since = match d.last_order_date {
            Some(date) => (today - date).num_days(),
            None => 9999,
        };

        let r_score = if days_since < 30 {
            5
        } else if days_since < 60 {
            4
        } else if days_since < 90 {
            3
        } else if days_since < 180 {
            2
        } else {
            1
        };

        let f_score = get_score(d.total_orders, &frequencies);
        let m_score = get_score(d.total_amount, &monetary_values);

        let avg_fm = (f_score + m_score) as f64 / 2.0;

        let segment = if r_score >= 4 && avg_fm >= 4.0 {
            "Champions"
        } else if r_score >= 3 && avg_fm >= 3.0 {
            "Loyal"
        } else if r_score >= 4 && avg_fm < 3.0 {
            "New / Potential"
        } else if r_score <= 2 && avg_fm >= 4.0 {
            "At Risk"
        } else if r_score <= 2 && avg_fm >= 2.0 {
            "Hibernating"
        } else {
            "Lost"
        };

        customers.push(CustomerLifecycle {
            customer_id: d.customer_id,
            customer_name: d.customer_name,
            mobile_number: d.mobile_number,
            membership_level: d.membership_level,
            last_order_date: d.last_order_date,
            total_orders: d.total_orders,
            total_amount: d.total_amount,
            days_since_last_order: days_since,
            rfm_segment: segment.to_string(),
            recency: r_score,
            frequency: f_score,
            monetary: m_score,
        });
    }

    customers.sort_by(|a, b| {
        let seg_rank = |s: &str| match s {
            "Champions" => 0,
            "At Risk" => 1,
            "Loyal" => 2,
            "New / Potential" => 3,
            "Hibernating" => 4,
            _ => 5,
        };

        let rank_a = seg_rank(&a.rfm_segment);
        let rank_b = seg_rank(&b.rfm_segment);

        if rank_a != rank_b {
            rank_a.cmp(&rank_b)
        } else {
            b.total_amount.cmp(&a.total_amount)
        }
    });

    Ok(customers)
}

#[tauri::command]
async fn update_customer_level(
    state: State<'_, DbPool>,
    customer_id: String,
    new_level: String,
) -> Result<(), String> {
    DB_MODIFIED.store(true, Ordering::Relaxed);
    sqlx::query("UPDATE customers SET membership_level = $1 WHERE customer_id = $2")
        .bind(new_level)
        .bind(customer_id)
        .execute(&*state)
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
async fn restart_app(app: tauri::AppHandle) {
    app.restart();
}

#[tauri::command]
async fn get_ai_marketing_proposal(
    app: tauri::AppHandle,
    state: tauri::State<'_, DbPool>,
    p1: String,
    p2: String,
) -> Result<AiMarketingProposal, String> {
    // 1. Calculate Confidence & Lift (Optimized: Combined Query)
    let (count_a, count_b, count_both, total_trans): (i64, i64, i64, i64) = sqlx::query_as(
        r#"
        SELECT
            (SELECT COUNT(DISTINCT (COALESCE(customer_id, 'GUEST') || order_date::text)) FROM sales WHERE product_name = $1) as count_a,
            (SELECT COUNT(DISTINCT (COALESCE(customer_id, 'GUEST') || order_date::text)) FROM sales WHERE product_name = $2) as count_b,
            (SELECT COUNT(*) FROM (
                SELECT COALESCE(customer_id, 'GUEST'), order_date FROM sales WHERE product_name = $1
                INTERSECT
                SELECT COALESCE(customer_id, 'GUEST'), order_date FROM sales WHERE product_name = $2
            ) AS both_trans) as count_both,
            (SELECT COUNT(DISTINCT (COALESCE(customer_id, 'GUEST') || order_date::text)) FROM sales) as total_trans
        "#
    )
    .bind(&p1)
    .bind(&p2)
    .fetch_one(&*state)
    .await
    .map_err(|e| e.to_string())?;

    if total_trans == 0 {
        return Err("거래 데이터가 충분하지 않습니다.".to_string());
    }

    let confidence = if count_a > 0 {
        (count_both as f64) / (count_a as f64)
    } else {
        0.0
    };
    let support_b = (count_b as f64) / (total_trans as f64);
    let lift = if support_b > 0.0 {
        confidence / support_b
    } else {
        0.0
    };

    // 2. Identify Top Segment
    let top_membership: String = sqlx::query_scalar(
        r#"
        SELECT COALESCE(c.membership_level, '일반')
        FROM customers c
        JOIN sales s ON c.customer_id = s.customer_id
        WHERE s.product_name IN ($1, $2)
        GROUP BY c.membership_level
        ORDER BY COUNT(*) DESC
        LIMIT 1
    "#,
    )
    .bind(&p1)
    .bind(&p2)
    .fetch_optional(&*state)
    .await
    .map_err(|e| e.to_string())?
    .unwrap_or_else(|| "일반".to_string());

    // 3. Identify Top Region
    let top_region: String = sqlx::query_scalar(
        r#"
        SELECT COALESCE(substring(address_primary from 1 for 6), '전국')
        FROM customers c
        JOIN sales s ON c.customer_id = s.customer_id
        WHERE s.product_name IN ($1, $2)
        GROUP BY 1
        ORDER BY COUNT(*) DESC
        LIMIT 1
    "#,
    )
    .bind(&p1)
    .bind(&p2)
    .fetch_optional(&*state)
    .await
    .map_err(|e| e.to_string())?
    .unwrap_or_else(|| "전국".to_string());

    // 4. Trend
    let count_recent: i64 = sqlx::query_scalar(r#"
        SELECT COUNT(*) FROM (
            SELECT COALESCE(customer_id, 'GUEST'), order_date FROM sales WHERE product_name = $1 AND order_date >= CURRENT_DATE - INTERVAL '30 days'
            INTERSECT
            SELECT COALESCE(customer_id, 'GUEST'), order_date FROM sales WHERE product_name = $2 AND order_date >= CURRENT_DATE - INTERVAL '30 days'
        ) AS recent_trans
    "#)
    .bind(&p1)
    .bind(&p2)
    .fetch_one(&*state)
    .await
    .map_err(|e| e.to_string())?;

    let trend_status = if count_recent > (count_both / 10) {
        "상승세"
    } else {
        "안정"
    };

    // 5. Gemini AI
    if let Some(api_key) = get_gemini_api_key(&app) {
        if !api_key.trim().is_empty() && api_key != "YOUR_GEMINI_API_KEY_HERE" {
            let prompt = format!(
                "Analyze the relationship between products '{}' and '{}' for a CSI manager application. \
                Stats: Confidence={:.1}%, Lift={:.2}, Top Membership Segment={}, Top Region={}, Trend={}. \
                Generate a marketing proposal in Korean. \
                Provide exactly 3 strategic items with title, description, and impact (High/Medium/Low). \
                Provide exactly 3 emotional and catchy ad copies. \
                Output format: JSON with fields 'strategies' (array of objects with title, description, impact) and 'ad_copies' (array of strings).",
                p1, p2, confidence * 100.0, lift, top_membership, top_region, trend_status
            );

            if let Ok(ai_content) = call_gemini_ai_internal(&api_key, &prompt).await {
                if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&ai_content) {
                    let mut strategies = Vec::new();
                    if let Some(strat_arr) = parsed.get("strategies").and_then(|a| a.as_array()) {
                        for s in strat_arr {
                            strategies.push(StrategyItem {
                                title: s
                                    .get("title")
                                    .and_then(|v| v.as_str())
                                    .unwrap_or("전략")
                                    .to_string(),
                                description: s
                                    .get("description")
                                    .and_then(|v| v.as_str())
                                    .unwrap_or("")
                                    .to_string(),
                                impact: s
                                    .get("impact")
                                    .and_then(|v| v.as_str())
                                    .unwrap_or("Medium")
                                    .to_string(),
                            });
                        }
                    }

                    let mut ad_copies = Vec::new();
                    if let Some(copy_arr) = parsed.get("ad_copies").and_then(|a| a.as_array()) {
                        for c in copy_arr {
                            if let Some(text) = c.as_str() {
                                ad_copies.push(text.to_string());
                            }
                        }
                    }

                    if !strategies.is_empty() && !ad_copies.is_empty() {
                        return Ok(AiMarketingProposal {
                            product_a: p1.clone(),
                            product_b: p2.clone(),
                            confidence_score: confidence * 100.0,
                            lift_score: lift,
                            top_membership,
                            top_region,
                            trend_status: trend_status.to_string(),
                            strategies,
                            ad_copies,
                        });
                    }
                }
            }
        }
    }

    // 6. Fallback
    Ok(AiMarketingProposal {
        product_a: p1.clone(),
        product_b: p2.clone(),
        confidence_score: confidence * 100.0,
        lift_score: lift,
        top_membership: top_membership.clone(),
        top_region: top_region.clone(),
        trend_status: trend_status.to_string(),
        strategies: vec![
            StrategyItem {
                title: format!("[Cross-Sell] {} 구매자 유인 마케팅", p1),
                description: format!("{}를 단독으로 자주 구매하는 고객들에게 {}의 장점을 부각시킨 쿠폰을 발행하여 교차 판매를 유도하세요.", p1, p2),
                impact: "높음".to_string(),
            },
            StrategyItem {
                title: "맞춤형 패키지 노출".to_string(),
                description: format!("{} 등급 고객군이 선호하는 두 상품의 세트 구성을 쇼핑몰 메인 상단에 배치하고 {} 지역 배송지에 타겟팅합니다.", top_membership, top_region),
                impact: "중간".to_string(),
            }
        ],
        ad_copies: vec![
            format!("오늘 저녁 식탁의 주인공! {}와 {}의 환상 조합", p1, p2),
            format!("{}를 고르셨나요? 단골들이 함께 찾는 {}도 잊지 마세요!", p1, p2),
            format!("데이터로 검증된 최고의 궁합! {} + {} 특별 세트", p1, p2),
        ],
    })
}

#[tauri::command]
async fn call_gemini_ai(app: tauri::AppHandle, prompt: String) -> Result<String, String> {
    let api_key = get_gemini_api_key(&app).ok_or("Gemini API 키가 설정되지 않았습니다.")?;
    call_gemini_ai_internal(&api_key, &prompt).await
}

async fn call_gemini_ai_internal(api_key: &str, prompt: &str) -> Result<String, String> {
    let clean_key = api_key.trim().trim_matches(|c: char| c == '"' || c == '\'');
    let client = reqwest::Client::new();

    // 1. Dynamic Model Discovery
    let mut models_to_try = Vec::new();

    // Try to fetch available models
    let list_url = format!(
        "https://generativelanguage.googleapis.com/v1beta/models?key={}",
        clean_key
    );

    if let Ok(resp) = client.get(&list_url).send().await {
        if resp.status().is_success() {
            if let Ok(json) = resp.json::<serde_json::Value>().await {
                if let Some(models) = json["models"].as_array() {
                    for model in models {
                        if let Some(name) = model["name"].as_str() {
                            // name is likely "models/gemini-1.5-flash"
                            // We need to check if it supports generateContent
                            let supported = model["supportedGenerationMethods"]
                                .as_array()
                                .map(|methods| {
                                    methods
                                        .iter()
                                        .any(|m| m.as_str() == Some("generateContent"))
                                })
                                .unwrap_or(false);

                            if supported && name.contains("gemini") {
                                // Extract short name if needed, or use full resource name
                                // The API accepts "models/gemini-..." or just "gemini-..."
                                // We'll store (version, model_name)
                                // Standardize on v1beta for now as it's most common for list
                                let short_name = name.trim_start_matches("models/");
                                models_to_try.push(("v1beta".to_string(), short_name.to_string()));
                            }
                        }
                    }
                }
            }
        }
    }

    // 2. Fallback / Priority Sorting
    // If discovery failed or returned nothing, use defaults.
    // Otherwise, we might want to prioritize specific "flash" or "pro" models if found.
    if models_to_try.is_empty() {
        models_to_try = vec![
            ("v1".to_string(), "gemini-1.5-flash".to_string()),
            ("v1beta".to_string(), "gemini-1.5-flash".to_string()),
            ("v1".to_string(), "gemini-1.5-flash-8b".to_string()),
            ("v1beta".to_string(), "gemini-1.5-pro-latest".to_string()),
        ];
    } else {
        // Simple heuristic sort: prioritize 'flash' then 'pro'
        models_to_try.sort_by(|a, b| {
            let a_score = if a.1.contains("flash") {
                2
            } else if a.1.contains("pro") {
                1
            } else {
                0
            };
            let b_score = if b.1.contains("flash") {
                2
            } else if b.1.contains("pro") {
                1
            } else {
                0
            };
            b_score.cmp(&a_score)
        });
    }

    let mut errors = Vec::new();

    for (version, model) in models_to_try {
        let url = format!(
            "https://generativelanguage.googleapis.com/{}/models/{}:generateContent?key={}",
            version, model, clean_key
        );

        let body = serde_json::json!({
            "contents": [{ "parts": [{ "text": prompt }] }]
        });

        let resp = match client.post(&url).json(&body).send().await {
            Ok(r) => r,
            Err(e) => {
                errors.push(format!("Network Error ({}): {}", model, e));
                continue;
            }
        };

        if resp.status().is_success() {
            let json: serde_json::Value = resp.json().await.unwrap_or_default();
            if let Some(content) = json["candidates"][0]["content"]["parts"][0]["text"].as_str() {
                let cleaned = content
                    .trim()
                    .trim_start_matches("```json")
                    .trim_start_matches("```")
                    .trim_end_matches("```")
                    .trim();
                return Ok(cleaned.to_string());
            } else {
                errors.push(format!("Empty response from {}", model));
            }
        } else {
            let status = resp.status();
            let error_text = resp.text().await.unwrap_or_default();

            // Check for quota/rate limit errors with user-friendly messages
            if status == reqwest::StatusCode::TOO_MANY_REQUESTS {
                return Err("AI_QUOTA_EXCEEDED: Gemini AI 사용 한도를 초과했습니다.\n\n일일 무료 한도가 소진되었거나, 분당 요청 제한에 도달했습니다. 잠시 후 다시 시도하거나, API 키 설정에서 유료 플랜으로 업그레이드하세요.".to_string());
            }

            if status == reqwest::StatusCode::FORBIDDEN {
                // Check if error message contains quota-related keywords
                if error_text.contains("quota")
                    || error_text.contains("limit")
                    || error_text.contains("exceeded")
                {
                    return Err("AI_QUOTA_EXCEEDED: Gemini AI 할당량이 초과되었습니다.\n\nAPI 키의 사용 한도가 소진되었습니다. Google AI Studio에서 사용량을 확인하거나, 새로운 API 키를 발급받으세요.".to_string());
                }
            }

            errors.push(format!(
                "API Error ({}): {} - {}",
                model, status, error_text
            ));

            // If we hit a 429 (Rate Limit), we should probably not spam other models with the same key
            if status == reqwest::StatusCode::TOO_MANY_REQUESTS {
                break;
            }
        }
    }

    Err(format!("AI 모델 연결 실패:\n{}", errors.join("\n")))
}

#[tauri::command]
async fn get_ai_detailed_plan(
    app: tauri::AppHandle,
    plan_type: String,
    p1: String,
    p2: String,
    strategy_title: String,
) -> Result<String, String> {
    let api_key = get_gemini_api_key(&app).ok_or("Gemini API 키가 설정되지 않았습니다.")?;

    let prompt = if plan_type == "VIRAL" {
        format!("{}와 {} 상품 조합의 마케팅 전략인 '{}'에 대한 바이럴 마케팅 계획을 수립해줘. 한국어로 구체적으로 작성하고 마크다운을 사용해.", p1, p2, strategy_title)
    } else {
        format!("{}와 {} 상품 조합의 마케팅 전략인 '{}'에 대한 단계별 실행 계획을 수립해줘. 한국어로 구체적으로 작성하고 마크다운을 사용해.", p1, p2, strategy_title)
    };

    call_gemini_ai_internal(&api_key, &prompt).await
}

#[derive(serde::Serialize, serde::Deserialize, Debug)]
struct ParsedBusinessCard {
    name: Option<String>,
    mobile: Option<String>,
    phone: Option<String>,
    email: Option<String>,
    company: Option<String>,
    job_title: Option<String>,
    address: Option<String>,
    memo: Option<String>,
}

async fn call_gemini_vision_ai(
    api_key: &str,
    prompt: &str,
    image_base64: &str,
    mime_type: &str,
) -> Result<String, String> {
    let clean_key = api_key.trim().trim_matches(|c: char| c == '"' || c == '\'');
    let client = reqwest::Client::new();

    // 1. Dynamic Discovery
    let mut models_to_try = Vec::new();
    let list_url = format!(
        "https://generativelanguage.googleapis.com/v1beta/models?key={}",
        clean_key
    );

    if let Ok(resp) = client.get(&list_url).send().await {
        if resp.status().is_success() {
            if let Ok(json) = resp.json::<serde_json::Value>().await {
                if let Some(models) = json["models"].as_array() {
                    for model in models {
                        if let Some(name) = model["name"].as_str() {
                            let supported = model["supportedGenerationMethods"]
                                .as_array()
                                .map(|methods| {
                                    methods
                                        .iter()
                                        .any(|m| m.as_str() == Some("generateContent"))
                                })
                                .unwrap_or(false);

                            if supported && name.contains("gemini") {
                                let short_name = name.trim_start_matches("models/");
                                // Vision works with flash or pro
                                if short_name.contains("flash") || short_name.contains("pro") {
                                    models_to_try
                                        .push(("v1beta".to_string(), short_name.to_string()));
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // 2. Fallbacks if discovery empty or fails
    if models_to_try.is_empty() {
        models_to_try = vec![
            ("v1".to_string(), "gemini-1.5-flash".to_string()),
            ("v1beta".to_string(), "gemini-1.5-flash".to_string()),
            ("v1".to_string(), "gemini-1.5-flash-8b".to_string()),
            ("v1beta".to_string(), "gemini-1.5-pro-latest".to_string()),
        ];
    } else {
        // Prioritize stable flash models over experimental ones
        models_to_try.sort_by(|a, b| {
            let get_score = |m: &str| {
                if m.contains("1.5-flash") && !m.contains("8b") {
                    10
                } else if m.contains("1.5-flash-8b") {
                    8
                } else if m.contains("2.0-flash") && !m.contains("exp") {
                    7
                } else if m.contains("pro") {
                    5
                } else if m.contains("exp") {
                    1
                }
                // Deprioritize experimental
                else {
                    3
                }
            };
            let a_score = get_score(&a.1);
            let b_score = get_score(&b.1);
            b_score.cmp(&a_score)
        });
    }

    let mut errors = Vec::new();

    for (version, model) in models_to_try {
        let url = format!(
            "https://generativelanguage.googleapis.com/{}/models/{}:generateContent?key={}",
            version, model, clean_key
        );

        let body = serde_json::json!({
            "contents": [{
                "parts": [
                    { "text": prompt },
                    {
                        "inline_data": {
                            "mime_type": mime_type,
                            "data": image_base64
                        }
                    }
                ]
            }]
        });

        let resp = match client.post(&url).json(&body).send().await {
            Ok(r) => r,
            Err(e) => {
                errors.push(format!("Network Error ({}): {}", model, e));
                continue;
            }
        };

        if resp.status().is_success() {
            let json: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
            if let Some(content) = json["candidates"][0]["content"]["parts"][0]["text"].as_str() {
                let cleaned = content
                    .trim()
                    .trim_start_matches("```json")
                    .trim_start_matches("```")
                    .trim_end_matches("```")
                    .trim();
                return Ok(cleaned.to_string());
            } else {
                errors.push(format!("Empty response from {}", model));
            }
        } else {
            let status = resp.status();
            let error_text = resp.text().await.unwrap_or_default();
            errors.push(format!(
                "API Error ({}): {} - {}",
                model, status, error_text
            ));

            // Continue to next model even on 429, as quota might be model-specific
            // (especially for experimental vs stable models)
            continue;
        }
    }

    Err(format!("AI 연결 실패:\n{}", errors.join("\n")))
}

#[tauri::command]
async fn parse_business_card_ai(
    app: tauri::AppHandle,
    image_base64: String,
    mime_type: String,
) -> Result<ParsedBusinessCard, String> {
    let api_key = get_gemini_api_key(&app).ok_or("Gemini API 키가 설정되지 않았습니다.")?;

    let prompt = "
    Analyze this business card image.
    Extract: name, mobile (010-xxxx-xxxx format), phone, email, company, job_title, address.
    Put everything else useful in 'memo'.
    Return JSON only with keys: name, mobile, phone, email, company, job_title, address, memo.
    Use null for missing fields.
    ";

    let json_str = call_gemini_vision_ai(&api_key, prompt, &image_base64, &mime_type).await?;

    let result: ParsedBusinessCard = serde_json::from_str(&json_str)
        .map_err(|e| format!("Parsing Error: {}. Raw: {}", e, json_str))?;

    Ok(result)
}

#[derive(serde::Serialize, serde::Deserialize)]
struct AiCustomerInsight {
    keywords: Vec<String>,
    ice_breaking: String,
    sales_tip: String,
}

#[tauri::command]
async fn get_customer_ai_insight(
    app: tauri::AppHandle,
    state: State<'_, DbPool>,
    customer_id: String,
) -> Result<AiCustomerInsight, String> {
    let api_key = get_gemini_api_key(&app).ok_or("Gemini API 키가 설정되지 않았습니다.")?;

    // 1. Fetch Customer Info
    let customer: Customer = sqlx::query_as("SELECT * FROM customers WHERE customer_id = $1")
        .bind(&customer_id)
        .fetch_optional(&*state)
        .await
        .map_err(|e| e.to_string())?
        .ok_or("고객을 찾을 수 없습니다.")?;

    // 2. Fetch Recent Sales
    // Note: Sales struct might be missing fields in query_as if not careful, but SELECT * usually works if struct matches table
    // We should strictly use a compatible struct or specific columns.
    // Assuming Sales struct matches table schema.
    let sales: Vec<Sales> = sqlx::query_as(
        "SELECT s.*, c.customer_name 
         FROM sales s 
         LEFT JOIN customers c ON s.customer_id = c.customer_id 
         WHERE s.customer_id = $1 
         ORDER BY s.order_date DESC LIMIT 5",
    )
    .bind(&customer_id)
    .fetch_all(&*state)
    .await
    .map_err(|e| e.to_string())?;

    // 3. Fetch Experience & Claim Logic
    let exp_count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM experience_reservations WHERE customer_id = $1")
            .bind(&customer_id)
            .fetch_one(&*state)
            .await
            .unwrap_or(0);

    let claim_count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM sales_claims WHERE customer_id = $1")
            .bind(&customer_id)
            .fetch_one(&*state)
            .await
            .unwrap_or(0);

    // 4. Construct Prompt
    let mut sales_summary = String::new();
    if sales.is_empty() {
        sales_summary = "구매 이력 없음.".to_string();
    } else {
        for s in sales {
            sales_summary.push_str(&format!("- {} ({}원)\n", s.product_name, s.total_amount));
        }
    }

    let prompt = format!(
        "Customer Profile:\n\
        Name: {}\n\
        Membership: {}\n\
        Address: {}\n\
        Recent Sales History:\n{}\n\
        Experience Reservations: {} times\n\
        Claim History (Cancellation/Return): {} times\n\n\
        Please analyze this customer and provide:\n\
        1. 3 representative keywords (starting with #)\n\
        2. A natural ice-breaking sentence for opening a conversation\n\
        3. A specific sales tip based on their buying pattern and claim history.\n\
        If claim history > 0, provide carefully crafted tips for sensitive customer care.\n\
        Return as JSON with keys: keywords (array), ice_breaking (string), sales_tip (string). Use Korean.",
        customer.customer_name,
        customer.membership_level.unwrap_or("일반".to_string()),
        customer.address_primary.unwrap_or("-".to_string()),
        sales_summary,
        exp_count,
        claim_count
    );

    // 5. Call AI
    let result_json = call_gemini_ai_internal(&api_key, &prompt).await?;

    // 6. Parse
    serde_json::from_str(&result_json).map_err(|e| format!("AI 응답 파싱 실패: {}", e))
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
async fn search_customers_by_name(
    state: State<'_, DbPool>,
    name: String,
) -> Result<Vec<Customer>, String> {
    sqlx::query_as::<_, Customer>(
        "SELECT * FROM customers WHERE customer_name LIKE $1 ORDER BY customer_name",
    )
    .bind(format!("%{}%", name))
    .fetch_all(&*state)
    .await
    .map_err(|e: sqlx::Error| e.to_string())
}

#[tauri::command]
async fn search_customers_by_mobile(
    state: State<'_, DbPool>,
    mobile: String,
) -> Result<Vec<Customer>, String> {
    sqlx::query_as::<_, Customer>(
        "SELECT * FROM customers WHERE mobile_number LIKE $1 ORDER BY customer_name",
    )
    .bind(format!("%{}%", mobile))
    .fetch_all(&*state)
    .await
    .map_err(|e: sqlx::Error| e.to_string())
}

#[tauri::command]
async fn get_customer(state: State<'_, DbPool>, id: String) -> Result<Customer, String> {
    sqlx::query_as::<_, Customer>("SELECT * FROM customers WHERE customer_id = $1")
        .bind(id)
        .fetch_one(&*state)
        .await
        .map_err(|e: sqlx::Error| e.to_string())
}

#[tauri::command]
async fn create_customer(
    state: State<'_, DbPool>,
    name: String,
    mobile: String,
    level: String,
    phone: Option<String>,
    email: Option<String>,
    zip: Option<String>,
    addr1: Option<String>,
    addr2: Option<String>,
    memo: Option<String>,
    join_date: Option<String>,
    anniversary_date: Option<String>,
    anniversary_type: Option<String>,
    marketing_consent: Option<bool>,
    acquisition_channel: Option<String>,
    pref_product_type: Option<String>,
    pref_package_type: Option<String>,
    family_type: Option<String>,
    health_concern: Option<String>,
    sub_interest: Option<bool>,
    purchase_cycle: Option<String>,
    initial_balance: Option<i32>,
) -> Result<String, String> {
    DB_MODIFIED.store(true, Ordering::Relaxed);

    // Sanitize optional strings: treat empty strings as None
    let phone = phone.filter(|s| !s.trim().is_empty());
    let email = email.filter(|s| !s.trim().is_empty());
    let zip = zip.filter(|s| !s.trim().is_empty());
    let addr1 = addr1.filter(|s| !s.trim().is_empty());
    let addr2 = addr2.filter(|s| !s.trim().is_empty());
    let memo = memo.filter(|s| !s.trim().is_empty());
    let anniversary_date = anniversary_date.filter(|s| !s.trim().is_empty());
    let anniversary_type = anniversary_type.filter(|s| !s.trim().is_empty());
    let acquisition_channel = acquisition_channel.filter(|s| !s.trim().is_empty());
    let pref_product_type = pref_product_type.filter(|s| !s.trim().is_empty());
    let pref_package_type = pref_package_type.filter(|s| !s.trim().is_empty());
    let family_type = family_type.filter(|s| !s.trim().is_empty());
    let health_concern = health_concern.filter(|s| !s.trim().is_empty());
    let purchase_cycle = purchase_cycle.filter(|s| !s.trim().is_empty());

    // 1. Generate Custom Sequence ID: YYYYMMDD-XXXX (Global Sequence)
    // Default to today if join_date is missing OR empty
    let date_str_standard = match join_date.as_deref() {
        Some(s) if !s.trim().is_empty() => s.to_string(),
        _ => Utc::now().format("%Y-%m-%d").to_string(),
    };
    // Convert YYYY-MM-DD to YYYYMMDD
    let date_prefix = date_str_standard.replace("-", "");

    // Find the last ID for THIS date to reset daily
    let last_record: Option<(String,)> =
        sqlx::query_as("SELECT customer_id FROM customers WHERE customer_id LIKE $1 ORDER BY customer_id DESC LIMIT 1")
            .bind(format!("{}%", date_prefix))
            .fetch_optional(&*state)
            .await
            .map_err(|e: sqlx::Error| e.to_string())?;

    let next_seq = match last_record {
        Some((last_id,)) => {
            // Extract suffix from "YYYYMMDD-XXXXX"
            let parts: Vec<&str> = last_id.split('-').collect();
            if let Some(last_num_str) = parts.last() {
                last_num_str.parse::<i32>().unwrap_or(0) + 1
            } else {
                1
            }
        }
        None => 1,
    };

    let customer_id = format!("{}-{:05}", date_prefix, next_seq);

    let mut tx = state.begin().await.map_err(|e| e.to_string())?;

    sqlx::query(
        "INSERT INTO customers (
            customer_id, customer_name, mobile_number, membership_level,
            phone_number, email, zip_code, address_primary, address_detail, memo, join_date,
            anniversary_date, anniversary_type, marketing_consent, acquisition_channel,
            pref_product_type, pref_package_type, family_type, health_concern, sub_interest, purchase_cycle,
            current_balance
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::date, $12::date, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)",
    )
    .bind(&customer_id)
    .bind(&name)
    .bind(&mobile)
    .bind(&level)
    .bind(&phone)
    .bind(&email)
    .bind(&zip)
    .bind(&addr1)
    .bind(&addr2)
    .bind(&memo)
    .bind(&date_str_standard)
    .bind(&anniversary_date)
    .bind(&anniversary_type)
    .bind(marketing_consent)
    .bind(&acquisition_channel)
    .bind(&pref_product_type)
    .bind(&pref_package_type)
    .bind(&family_type)
    .bind(&health_concern)
    .bind(sub_interest)
    .bind(&purchase_cycle)
    .bind(initial_balance.unwrap_or(0))
    .execute(&mut *tx)
    .await
    .map_err(|e: sqlx::Error| e.to_string())?;

    // 2. Automatically register as default shipping address if primary address exists
    if let Some(ref primary_addr) = addr1 {
        if !primary_addr.trim().is_empty() {
            sqlx::query(
                "INSERT INTO customer_addresses (
                    customer_id, address_alias, recipient_name, mobile_number,
                    zip_code, address_primary, address_detail, is_default
                ) VALUES ($1, '기본', $2, $3, $4, $5, $6, true)",
            )
            .bind(&customer_id)
            .bind(&name)
            .bind(&mobile)
            .bind(&zip)
            .bind(primary_addr)
            .bind(&addr2)
            .execute(&mut *tx)
            .await
            .map_err(|e: sqlx::Error| e.to_string())?;
        }
    }

    // 3. Insert Ledger if initial balance is set
    if let Some(bal) = initial_balance {
        if bal != 0 {
            sqlx::query(
                "INSERT INTO customer_ledger (customer_id, transaction_date, transaction_type, amount, description)
                 VALUES ($1, CURRENT_DATE, '이월', $2, '기초 이월 미수금')"
            )
            .bind(&customer_id)
            .bind(bal)
            .execute(&mut *tx)
            .await
            .map_err(|e: sqlx::Error| e.to_string())?;
        }
    }

    tx.commit().await.map_err(|e: sqlx::Error| e.to_string())?;

    Ok(customer_id)
}

#[tauri::command]
async fn update_customer(
    state: State<'_, DbPool>,
    id: String,
    name: String,
    mobile: String,
    level: String,
    phone: Option<String>,
    email: Option<String>,
    zip: Option<String>,
    addr1: Option<String>,
    addr2: Option<String>,
    memo: Option<String>,
    join_date: Option<String>,
    anniversary_date: Option<String>,
    anniversary_type: Option<String>,
    marketing_consent: Option<bool>,
    acquisition_channel: Option<String>,
    pref_product_type: Option<String>,
    pref_package_type: Option<String>,
    family_type: Option<String>,
    health_concern: Option<String>,
    sub_interest: Option<bool>,
    purchase_cycle: Option<String>,
) -> Result<(), String> {
    // Sanitize values: treat empty strings as None
    let phone = phone.filter(|s| !s.trim().is_empty());
    let email = email.filter(|s| !s.trim().is_empty());
    let zip = zip.filter(|s| !s.trim().is_empty());
    let addr1 = addr1.filter(|s| !s.trim().is_empty());
    let addr2 = addr2.filter(|s| !s.trim().is_empty());
    let memo = memo.filter(|s| !s.trim().is_empty());
    let anniversary_date = anniversary_date.filter(|s| !s.trim().is_empty());
    let anniversary_type = anniversary_type.filter(|s| !s.trim().is_empty());
    let acquisition_channel = acquisition_channel.filter(|s| !s.trim().is_empty());
    let pref_product_type = pref_product_type.filter(|s| !s.trim().is_empty());
    let pref_package_type = pref_package_type.filter(|s| !s.trim().is_empty());
    let family_type = family_type.filter(|s| !s.trim().is_empty());
    let health_concern = health_concern.filter(|s| !s.trim().is_empty());
    let purchase_cycle = purchase_cycle.filter(|s| !s.trim().is_empty());

    // Sanitize join_date: if empty, set to None so COALESCE uses existing value
    let join_date = match join_date.as_deref() {
        Some(s) if !s.trim().is_empty() => Some(s.to_string()),
        _ => None,
    };

    let result = sqlx::query(
        "UPDATE customers SET 
        customer_name = $1, 
        mobile_number = $2, 
        membership_level = $3,
        phone_number = $4, 
        email = $5,
        zip_code = $6, 
        address_primary = $7, 
        address_detail = $8, 
        memo = $9, 
        join_date = COALESCE($10::date, join_date),
        anniversary_date = $11::date,
        anniversary_type = $12,
        marketing_consent = $13,
        acquisition_channel = $14,
        pref_product_type = $15,
        pref_package_type = $16,
        family_type = $17,
        health_concern = $18,
        sub_interest = $19,
        purchase_cycle = $20
        WHERE customer_id = $21",
    )
    .bind(&name)
    .bind(&mobile)
    .bind(&level)
    .bind(&phone)
    .bind(&email)
    .bind(&zip)
    .bind(&addr1)
    .bind(&addr2)
    .bind(&memo)
    .bind(&join_date)
    .bind(anniversary_date)
    .bind(anniversary_type)
    .bind(marketing_consent)
    .bind(acquisition_channel)
    .bind(pref_product_type)
    .bind(pref_package_type)
    .bind(family_type)
    .bind(health_concern)
    .bind(sub_interest)
    .bind(purchase_cycle)
    .bind(&id)
    .execute(&*state)
    .await
    .map_err(|e: sqlx::Error| e.to_string())?;

    if result.rows_affected() == 0 {
        return Err(
            "수정할 고객을 찾을 수 없습니다. (ID가 유효하지 않거나 삭제되었을 수 있습니다)"
                .to_string(),
        );
    }

    // Always sync to '기본' (Basic residential) address to keep record updated
    sqlx::query(
        "UPDATE customer_addresses 
         SET zip_code = $1, address_primary = $2, address_detail = $3, recipient_name = $4, mobile_number = $5
         WHERE customer_id = $6 AND address_alias = '기본'"
    )
    .bind(&zip)
    .bind(&addr1)
    .bind(&addr2)
    .bind(&name)
    .bind(&mobile)
    .bind(&id)
    .execute(&*state)
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
async fn create_customer_address(
    state: State<'_, DbPool>,
    customer_id: String,
    alias: String,
    recipient: String,
    mobile: String,
    zip: Option<String>,
    addr1: String,
    addr2: Option<String>,
    is_default: bool,
    memo: Option<String>,
) -> Result<i32, String> {
    // If setting as default, ensure no other address is default
    if is_default {
        sqlx::query("UPDATE customer_addresses SET is_default = false WHERE customer_id = $1")
            .bind(&customer_id)
            .execute(&*state)
            .await
            .map_err(|e| e.to_string())?;
    }

    let row: (i32,) = sqlx::query_as(
        "INSERT INTO customer_addresses (
            customer_id, address_alias, recipient_name, mobile_number,
            zip_code, address_primary, address_detail, is_default, shipping_memo
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING address_id",
    )
    .bind(&customer_id) // Use reference
    .bind(alias)
    .bind(recipient)
    .bind(mobile)
    .bind(&zip) // Use reference
    .bind(&addr1) // Use reference
    .bind(&addr2) // Use reference
    .bind(is_default)
    .bind(memo)
    .fetch_one(&*state)
    .await
    .map_err(|e| e.to_string())?;

    Ok(row.0)
}

#[tauri::command]
async fn update_customer_address(
    state: State<'_, DbPool>,
    address_id: i32,
    customer_id: String,
    alias: String,
    recipient: String,
    mobile: String,
    zip: Option<String>,
    addr1: String,
    addr2: Option<String>,
    is_default: bool,
    memo: Option<String>,
) -> Result<(), String> {
    // 1. If setting as default, reset others
    if is_default {
        sqlx::query("UPDATE customer_addresses SET is_default = false WHERE customer_id = $1")
            .bind(&customer_id)
            .execute(&*state)
            .await
            .map_err(|e| e.to_string())?;
    }

    // 2. Update the address
    sqlx::query(
        "UPDATE customer_addresses SET
            address_alias = $1, recipient_name = $2, mobile_number = $3,
            zip_code = $4, address_primary = $5, address_detail = $6,
            is_default = $7, shipping_memo = $8
        WHERE address_id = $9",
    )
    .bind(alias)
    .bind(recipient)
    .bind(mobile)
    .bind(&zip)
    .bind(&addr1)
    .bind(&addr2)
    .bind(is_default)
    .bind(memo)
    .bind(address_id)
    .execute(&*state)
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
async fn get_customer_addresses(
    state: State<'_, DbPool>,
    customer_id: String,
) -> Result<Vec<CustomerAddress>, String> {
    sqlx::query_as::<_, CustomerAddress>(
        "SELECT * FROM customer_addresses WHERE customer_id = $1 ORDER BY created_at ASC",
    )
    .bind(customer_id)
    .fetch_all(&*state)
    .await
    .map_err(|e: sqlx::Error| e.to_string())
}

#[tauri::command]
async fn delete_customer_address(state: State<'_, DbPool>, address_id: i32) -> Result<(), String> {
    sqlx::query("DELETE FROM customer_addresses WHERE address_id = $1")
        .bind(address_id)
        .execute(&*state)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn set_default_customer_address(
    state: State<'_, DbPool>,
    customer_id: String,
    address_id: i32,
) -> Result<(), String> {
    // 1. Reset all to false
    sqlx::query("UPDATE customer_addresses SET is_default = false WHERE customer_id = $1")
        .bind(&customer_id)
        .execute(&*state)
        .await
        .map_err(|e| e.to_string())?;

    // 2. Set chosen to true
    sqlx::query("UPDATE customer_addresses SET is_default = true WHERE address_id = $1")
        .bind(address_id)
        .execute(&*state)
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
async fn delete_customer(state: State<'_, DbPool>, id: String) -> Result<(), String> {
    DB_MODIFIED.store(true, Ordering::Relaxed);
    let result = sqlx::query("DELETE FROM customers WHERE customer_id = $1")
        .bind(&id)
        .execute(&*state)
        .await
        .map_err(|e: sqlx::Error| e.to_string())?;

    if result.rows_affected() == 0 {
        return Err(format!(
            "삭제할 고객을 찾을 수 없습니다. (ID: {}, 이미 삭제되었거나 유효하지 않습니다)",
            id
        ));
    }

    Ok(())
}

#[tauri::command]
async fn delete_customers_batch(
    state: State<'_, DbPool>,
    ids: Vec<String>,
    also_delete_sales: bool,
) -> Result<(), String> {
    if ids.is_empty() {
        return Ok(());
    }

    DB_MODIFIED.store(true, Ordering::Relaxed);

    // 1. Optionally delete associated sales first
    if also_delete_sales {
        let mut sales_builder: sqlx::QueryBuilder<sqlx::Postgres> =
            sqlx::QueryBuilder::new("DELETE FROM sales WHERE customer_id IN (");
        let mut sep = sales_builder.separated(", ");
        for id in &ids {
            sep.push_bind(id);
        }
        sep.push_unseparated(")");
        sales_builder
            .build()
            .execute(&*state)
            .await
            .map_err(|e| e.to_string())?;
    }

    // 2. Delete the customers
    let mut query_builder: sqlx::QueryBuilder<sqlx::Postgres> =
        sqlx::QueryBuilder::new("DELETE FROM customers WHERE customer_id IN (");

    let mut separated = query_builder.separated(", ");
    for id in ids {
        separated.push_bind(id);
    }
    separated.push_unseparated(")");

    let query = query_builder.build();
    query.execute(&*state).await.map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
async fn get_dashboard_stats(state: State<'_, DbPool>) -> Result<DashboardStats, String> {
    // Use Local time to determine 'today'
    let today = chrono::Local::now().date_naive();

    // Consolidated query using explicit date parameter ($1) instead of CURRENT_DATE
    // We bind 'today' once, and it is used for all $1 placeholders
    let stats: DashboardStats = sqlx::query_as(r#"
        SELECT 
            (SELECT CAST(SUM(total_amount) AS BIGINT) FROM sales WHERE order_date = $1 AND status != '취소') as total_sales_amount,
            (SELECT COUNT(*) FROM sales WHERE order_date = $1 AND status != '취소') as total_orders,
            (SELECT COUNT(*) FROM customers WHERE join_date = $1) as total_customers,
            (SELECT COUNT(*) FROM customers) as total_customers_all_time,
            (SELECT COUNT(*) FROM sales WHERE status NOT IN ('배송완료', '취소')) as pending_orders,
            (SELECT COUNT(*) FROM schedules 
             WHERE start_time < ($1 + 1)::timestamp 
             AND end_time >= $1::timestamp) as today_schedule_count,
            (SELECT COUNT(*) FROM experience_reservations WHERE reservation_date = $1 AND status != '취소') as experience_reservation_count,
            (SELECT COUNT(*) FROM products WHERE stock_quantity <= safety_stock) as low_stock_count,
            (SELECT COUNT(*) FROM consultations WHERE status IN ('접수', '처리중')) as pending_consultation_count
    "#)
    .bind(today)
    .fetch_one(&*state)
    .await
    .map_err(|e| e.to_string())?;

    Ok(stats)
}

#[tauri::command]
async fn get_inventory_forecast_alerts(
    state: State<'_, DbPool>,
) -> Result<Vec<InventoryAlert>, String> {
    let sql = r#"
        WITH consumption AS (
            SELECT 
                product_name, 
                specification,
                SUM(ABS(change_quantity)) / 30.0 as daily_avg
            FROM inventory_logs
            WHERE created_at >= CURRENT_TIMESTAMP - INTERVAL '30 days'
              AND change_quantity < 0
            GROUP BY product_name, specification
        )
        SELECT 
            p.product_id,
            p.product_name,
            p.specification,
            p.stock_quantity,
            p.safety_stock,
            COALESCE(c.daily_avg, 0.0) as daily_avg_consumption,
            CASE 
                WHEN COALESCE(c.daily_avg, 0.0) > 0 THEN 
                    CAST(p.stock_quantity / c.daily_avg AS INTEGER)
                ELSE 999
            END as days_remaining,
            COALESCE(p.item_type, 'product') as item_type
        FROM products p
        LEFT JOIN consumption c 
            ON p.product_name = c.product_name 
            AND p.specification IS NOT DISTINCT FROM c.specification
        WHERE (p.stock_quantity <= p.safety_stock)
           OR (COALESCE(c.daily_avg, 0.0) > 0 AND (p.stock_quantity / c.daily_avg) <= 7)
        ORDER BY days_remaining ASC, p.product_name ASC
        LIMIT 10
    "#;

    sqlx::query_as::<_, InventoryAlert>(sql)
        .fetch_all(&*state)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_top_profit_products(
    state: State<'_, DbPool>,
) -> Result<Vec<ProfitAnalysisResult>, String> {
    let today = chrono::Local::now().date_naive();
    let sql = r#"
        SELECT 
            s.product_name,
            COUNT(*) as record_count,
            CAST(SUM(s.quantity) AS BIGINT) as total_quantity,
            CAST(SUM(s.total_amount) AS BIGINT) as total_revenue,
            CAST(COALESCE(p.cost_price, 0) AS BIGINT) as unit_cost,
            CAST(SUM(s.quantity * COALESCE(p.cost_price, 0)) AS BIGINT) as total_cost,
            CAST(SUM(s.total_amount) - SUM(s.quantity * COALESCE(p.cost_price, 0)) AS BIGINT) as net_profit,
            CASE 
                WHEN SUM(s.total_amount) > 0 THEN 
                    (CAST(SUM(s.total_amount) - SUM(s.quantity * COALESCE(p.cost_price, 0)) AS DOUBLE PRECISION) / CAST(SUM(s.total_amount) AS DOUBLE PRECISION)) * 100.0
                ELSE 0.0
            END as margin_rate
        FROM sales s
        LEFT JOIN products p ON s.product_name = p.product_name
        WHERE s.order_date >= date_trunc('month', $1)
          AND s.order_date < (date_trunc('month', $1) + interval '1 month')
          AND s.status != '취소'
        GROUP BY s.product_name, p.cost_price
        ORDER BY net_profit DESC
        LIMIT 5
    "#;

    sqlx::query_as::<_, ProfitAnalysisResult>(sql)
        .bind(today)
        .fetch_all(&*state)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_recent_sales(state: State<'_, DbPool>) -> Result<Vec<Sales>, String> {
    sqlx::query_as::<_, Sales>(
        "SELECT s.*, c.customer_name 
         FROM sales s
         LEFT JOIN customers c ON s.customer_id = c.customer_id
         ORDER BY s.order_date DESC LIMIT 5",
    )
    .fetch_all(&*state)
    .await
    .map_err(|e: sqlx::Error| e.to_string())
}

#[derive(serde::Serialize, FromRow)]
struct WeeklySales {
    date: String,
    total: Option<i64>,
}

#[tauri::command]
async fn get_weekly_sales_data(state: State<'_, DbPool>) -> Result<Vec<WeeklySales>, String> {
    let today = chrono::Local::now().date_naive();

    // Current Week: Sunday to Saturday
    // Using $1 (Local Today) instead of CURRENT_DATE
    let query = r#"
        WITH days AS (
            SELECT ($1 - n)::date AS day
            FROM generate_series(0, 6) n
        )
        SELECT 
            to_char(d.day, 'MM-DD') as date, 
            CAST(COALESCE(SUM(s.total_amount), 0) AS BIGINT) as total
        FROM days d
        LEFT JOIN sales s 
            ON s.order_date = d.day AND s.status != '취소'
        GROUP BY d.day
        ORDER BY d.day ASC
    "#;

    sqlx::query_as::<_, WeeklySales>(query)
        .bind(today)
        .fetch_all(&*state)
        .await
        .map_err(|e: sqlx::Error| e.to_string())
}

#[tauri::command]
async fn get_top3_products_by_qty(
    state: State<'_, DbPool>,
) -> Result<Vec<ProductSalesStats>, String> {
    let today = chrono::Local::now().date_naive();

    // Optimized range comparison for current month to use index on order_date
    // Using $1 (Local Today)
    let query = r#"
        SELECT 
            product_name, 
            COUNT(*) as record_count,
            CAST(SUM(quantity) AS BIGINT) as total_quantity, 
            CAST(SUM(total_amount) AS BIGINT) as total_amount
        FROM sales
        WHERE order_date >= date_trunc('month', $1)
        AND order_date < (date_trunc('month', $1) + interval '1 month')
        AND status != '취소'
        GROUP BY product_name
        ORDER BY total_quantity DESC
        LIMIT 3
    "#;

    sqlx::query_as::<_, ProductSalesStats>(query)
        .bind(today)
        .fetch_all(&*state)
        .await
        .map_err(|e: sqlx::Error| e.to_string())
}

#[tauri::command]
async fn search_customers_by_date(
    state: State<'_, DbPool>,
    start: String,
    end: String,
    keyword: Option<String>,
    membership_level: Option<String>,
) -> Result<Vec<Customer>, String> {
    // Base Query
    let mut query_str = String::from(
        "SELECT * FROM customers WHERE join_date >= $1::date AND join_date <= $2::date",
    );

    let mut param_index = 3;

    // Keyword Filter
    if let Some(ref k) = keyword {
        if !k.trim().is_empty() {
            query_str.push_str(&format!(
                " AND (customer_name LIKE ${} OR mobile_number LIKE ${})",
                param_index, param_index
            ));
            param_index += 1;
        }
    }

    // Membership Level Filter
    if let Some(ref l) = membership_level {
        if !l.trim().is_empty() {
            query_str.push_str(&format!(" AND membership_level = ${}", param_index));
            // param_index += 1; // Not needed if this is the last one, but good practice
        }
    }

    query_str.push_str(" ORDER BY join_date DESC");

    let mut query = sqlx::query_as::<_, Customer>(&query_str)
        .bind(start)
        .bind(end);

    if let Some(ref k) = keyword {
        if !k.trim().is_empty() {
            query = query.bind(format!("%{}%", k));
        }
    }

    if let Some(ref l) = membership_level {
        if !l.trim().is_empty() {
            query = query.bind(l);
        }
    }

    query
        .fetch_all(&*state)
        .await
        .map_err(|e: sqlx::Error| e.to_string())
}

#[tauri::command]
async fn search_dormant_customers(
    state: State<'_, DbPool>,
    days_threshold: i32,
) -> Result<Vec<Customer>, String> {
    // Finds customers who haven't ordered in X days, OR never ordered and were joined more than X days ago.
    let sql = r#"
        SELECT c.*
        FROM customers c
        LEFT JOIN (
            SELECT customer_id, MAX(order_date) as last_order
            FROM sales
            WHERE status != '취소'
            GROUP BY customer_id
        ) s ON c.customer_id = s.customer_id
        WHERE (s.last_order IS NULL AND (CURRENT_DATE - c.join_date) >= $1)
           OR (s.last_order IS NOT NULL AND (CURRENT_DATE - s.last_order) >= $1)
        ORDER BY COALESCE(s.last_order, c.join_date) ASC
    "#;

    sqlx::query_as::<_, Customer>(sql)
        .bind(days_threshold)
        .fetch_all(&*state)
        .await
        .map_err(|e: sqlx::Error| e.to_string())
}

#[tauri::command]
async fn check_duplicate_customer(
    state: State<'_, DbPool>,
    name: String,
) -> Result<Vec<Customer>, String> {
    sqlx::query_as::<_, Customer>("SELECT * FROM customers WHERE customer_name = $1")
        .bind(name)
        .fetch_all(&*state)
        .await
        .map_err(|e: sqlx::Error| e.to_string())
}

#[derive(serde::Serialize, sqlx::FromRow)]
pub struct BestCustomerResult {
    pub customer_id: String,
    pub customer_name: String,
    pub membership_level: String,
    pub mobile_number: Option<String>,
    pub address_primary: Option<String>,
    pub address_detail: Option<String>,
    pub total_orders: i64,
    pub total_qty: i64,
    pub total_amount: i64,
}

#[tauri::command]
async fn search_best_customers(
    state: State<'_, DbPool>,
    min_qty: i64,
    min_amt: i64,
    logic: String,
) -> Result<Vec<BestCustomerResult>, String> {
    let having_clause = if logic == "AND" {
        "HAVING COALESCE(SUM(s.quantity), 0) >= $1 AND COALESCE(SUM(s.total_amount), 0) >= $2"
    } else {
        "HAVING COALESCE(SUM(s.quantity), 0) >= $1 OR COALESCE(SUM(s.total_amount), 0) >= $2"
    };

    let sql = format!(
        r#"
        SELECT 
            c.customer_id, 
            c.customer_name, 
            COALESCE(c.membership_level, '일반') as membership_level, 
            c.mobile_number, 
            c.address_primary, 
            c.address_detail,
            CAST(COUNT(s.sales_id) AS BIGINT) as total_orders,
            CAST(COALESCE(SUM(s.quantity), 0) AS BIGINT) as total_qty,
            CAST(COALESCE(SUM(s.total_amount), 0) AS BIGINT) as total_amount
        FROM customers c
        LEFT JOIN sales s ON c.customer_id = s.customer_id AND s.status IN ('배송완료', '완료')
        GROUP BY c.customer_id, c.customer_name, c.membership_level, c.mobile_number, c.address_primary, c.address_detail
        {}
        ORDER BY total_amount DESC
    "#,
        having_clause
    );

    sqlx::query_as::<_, BestCustomerResult>(&sql)
        .bind(min_qty)
        .bind(min_amt)
        .fetch_all(&*state)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn update_customer_membership_batch(
    state: State<'_, DbPool>,
    customer_ids: Vec<String>,
    new_level: String,
) -> Result<(), String> {
    DB_MODIFIED.store(true, Ordering::Relaxed);
    let mut tx = state.begin().await.map_err(|e| e.to_string())?;

    sqlx::query("UPDATE customers SET membership_level = $1 WHERE customer_id = ANY($2)")
        .bind(new_level)
        .bind(customer_ids)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn get_sales_by_customer_id(
    state: State<'_, DbPool>,
    customer_id: String,
) -> Result<Vec<Sales>, String> {
    sqlx::query_as::<_, Sales>(
        "SELECT s.*, c.customer_name 
         FROM sales s
         LEFT JOIN customers c ON s.customer_id = c.customer_id
         WHERE s.customer_id = $1 
         ORDER BY s.order_date DESC",
    )
    .bind(customer_id)
    .fetch_all(&*state)
    .await
    .map_err(|e| e.to_string())
}

#[derive(serde::Serialize, sqlx::FromRow)]
struct MembershipAnalysisResult {
    membership_level: String,
    total_qty: i64,
    total_amount: i64,
    customer_count: i64,
}

#[tauri::command]
async fn get_membership_sales_analysis(
    state: State<'_, DbPool>,
    year: i32,
) -> Result<Vec<MembershipAnalysisResult>, String> {
    let sql = r#"
        SELECT 
            COALESCE(c.membership_level, 'Unknown') as membership_level,
            CAST(COALESCE(SUM(s.quantity), 0) AS BIGINT) as total_qty,
            CAST(COALESCE(SUM(s.total_amount), 0) AS BIGINT) as total_amount,
            COUNT(DISTINCT s.customer_id) as customer_count
        FROM sales s
        LEFT JOIN customers c ON s.customer_id = c.customer_id
        WHERE EXTRACT(YEAR FROM s.order_date) = $1 AND s.status IN ('배송완료', '완료')
        GROUP BY c.membership_level
        ORDER BY total_amount DESC
    "#;

    sqlx::query_as::<_, MembershipAnalysisResult>(sql)
        .bind(year)
        .fetch_all(&*state)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn create_sale(
    state: State<'_, DbPool>,
    customer_id: String,
    product_name: String,
    specification: Option<String>,
    unit_price: i32,
    quantity: i32,
    total_amount: i32,
    status: String,
    memo: Option<String>,
    order_date_str: String,
    shipping_name: Option<String>,
    shipping_zip_code: Option<String>,
    shipping_address_primary: Option<String>,
    shipping_address_detail: Option<String>,
    shipping_mobile_number: Option<String>,
    shipping_date: Option<String>,
    // New: Payment amount can be passed to immediately record a payment
    paid_amount: Option<i32>,
) -> Result<String, String> {
    DB_MODIFIED.store(true, Ordering::Relaxed);
    // Parse input date
    let order_date = NaiveDate::parse_from_str(&order_date_str, "%Y-%m-%d")
        .map_err(|e| format!("Invalid date format: {}", e))?;

    let shipping_date_parsed = match shipping_date {
        Some(s) if !s.is_empty() => Some(
            NaiveDate::parse_from_str(&s, "%Y-%m-%d")
                .map_err(|e| format!("Invalid shipping date format: {}", e))?,
        ),
        _ => None,
    };

    // Custom Sales ID Generation
    let date_str = order_date.format("%Y%m%d").to_string();
    let date_prefix = format!("{}-", date_str);

    let last_record: Option<(String,)> = sqlx::query_as(
        "SELECT sales_id FROM sales WHERE sales_id LIKE $1 ORDER BY sales_id DESC LIMIT 1",
    )
    .bind(format!("{}%", date_prefix))
    .fetch_optional(&*state)
    .await
    .map_err(|e| e.to_string())?;

    let next_seq = match last_record {
        Some((last_id,)) => {
            let parts: Vec<&str> = last_id.split('-').collect();
            if let Some(last_num_str) = parts.last() {
                last_num_str.parse::<i32>().unwrap_or(0) + 1
            } else {
                1
            }
        }
        None => 1,
    };

    let sales_id = format!("{}{:05}", date_prefix, next_seq);

    let mut tx = state.begin().await.map_err(|e| e.to_string())?;

    sqlx::query(
        "INSERT INTO sales (
            sales_id, customer_id, product_name, specification, unit_price, quantity, total_amount, status, order_date, memo,
            shipping_name, shipping_zip_code, shipping_address_primary, shipping_address_detail, shipping_mobile_number, shipping_date
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)",
    )
    .bind(&sales_id)
    .bind(&customer_id)
    .bind(&product_name)
    .bind(&specification)
    .bind(unit_price)
    .bind(quantity)
    .bind(total_amount)
    .bind(status)
    .bind(order_date)
    .bind(memo)
    .bind(shipping_name)
    .bind(shipping_zip_code)
    .bind(shipping_address_primary)
    .bind(shipping_address_detail)
    .bind(shipping_mobile_number)
    .bind(shipping_date_parsed)
    .execute(&mut *tx)
    .await
    .map_err(|e: sqlx::Error| e.to_string())?;

    // --- Customer Ledger Logic ---
    // 1. Record Sales (Account Receivable creates Debt) -> +Amount
    sqlx::query(
        "INSERT INTO customer_ledger (customer_id, transaction_date, transaction_type, amount, description, reference_id)
         VALUES ($1, $2, '매출', $3, $4, $5)"
    )
    .bind(&customer_id)
    .bind(order_date)
    .bind(total_amount)
    .bind(format!("매출 등록: {}", product_name))
    .bind(&sales_id)
    .execute(&mut *tx)
    .await
    .map_err(|e: sqlx::Error| e.to_string())?;

    // Update Customer Balance (+)
    sqlx::query("UPDATE customers SET current_balance = COALESCE(current_balance, 0) + $1 WHERE customer_id = $2")
        .bind(total_amount)
        .bind(&customer_id)
        .execute(&mut *tx)
        .await
        .map_err(|e: sqlx::Error| e.to_string())?;

    // 2. If 'paid_amount' is provided and > 0, Record Payment -> -Amount
    if let Some(payment) = paid_amount {
        if payment > 0 {
            sqlx::query(
                "INSERT INTO customer_ledger (customer_id, transaction_date, transaction_type, amount, description, reference_id)
                 VALUES ($1, $2, '입금', $3, $4, $5)"
            )
            .bind(&customer_id)
            .bind(order_date)
            .bind(-payment) // Negative for payment
            .bind("매출 동시 입금")
            .bind(&sales_id)
            .execute(&mut *tx)
            .await
            .map_err(|e: sqlx::Error| e.to_string())?;

            // Update Customer Balance (-)
            // Note: We bind POSITIVE payment value but subtract it, or bind NEGATIVE and add it.
            // Query logic: balance + (-payment)
            sqlx::query("UPDATE customers SET current_balance = COALESCE(current_balance, 0) - $1 WHERE customer_id = $2")
                .bind(payment)
                .bind(&customer_id)
                .execute(&mut *tx)
                .await
                .map_err(|e: sqlx::Error| e.to_string())?;
        }
    }

    // Stock deduction is now handled by DB trigger
    // sqlx::query("UPDATE products SET stock_quantity = stock_quantity - $1 WHERE product_name = $2 AND specification IS NOT DISTINCT FROM $3") ...

    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(sales_id)
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReceptionSaleInput {
    pub sales_id: Option<String>,
    pub customer_id: String,
    pub product_name: String,
    pub specification: Option<String>,
    pub unit_price: i32,
    pub quantity: i32,
    pub total_amount: i32,
    pub status: String,
    pub memo: Option<String>,
    pub order_date_str: String,
    pub shipping_name: Option<String>,
    pub shipping_zip_code: Option<String>,
    pub shipping_address_primary: Option<String>,
    pub shipping_address_detail: Option<String>,
    pub shipping_mobile_number: Option<String>,
    pub shipping_date: Option<String>,
    pub paid_amount: Option<i32>,
    pub payment_status: Option<String>,
    pub discount_rate: Option<i32>,
    pub is_dirty: String,
}

#[tauri::command]
async fn save_general_sales_batch(
    state: State<'_, DbPool>,
    items: Vec<ReceptionSaleInput>,
    deleted_ids: Vec<String>,
) -> Result<i32, String> {
    DB_MODIFIED.store(true, Ordering::Relaxed);
    let mut tx = state.begin().await.map_err(|e| e.to_string())?;
    let mut success_count = 0;

    // 1. Process Deletions
    for sid in deleted_ids {
        let old_sale: Option<(i32, String)> =
            sqlx::query_as("SELECT total_amount, customer_id FROM sales WHERE sales_id = $1")
                .bind(&sid)
                .fetch_optional(&mut *tx)
                .await
                .map_err(|e| e.to_string())?;

        if let Some((old_amount, old_customer_id)) = old_sale {
            sqlx::query("INSERT INTO customer_ledger (customer_id, transaction_date, transaction_type, amount, description, reference_id) VALUES ($1, CURRENT_DATE, '매출취소', $2, $3, $4)")
                .bind(&old_customer_id).bind(-old_amount).bind("매출 삭제").bind(&sid).execute(&mut *tx).await.map_err(|e| e.to_string())?;
            sqlx::query("UPDATE customers SET current_balance = COALESCE(current_balance, 0) - $1 WHERE customer_id = $2")
                .bind(old_amount).bind(&old_customer_id).execute(&mut *tx).await.map_err(|e| e.to_string())?;
            sqlx::query("DELETE FROM sales WHERE sales_id = $1")
                .bind(&sid)
                .execute(&mut *tx)
                .await
                .map_err(|e| e.to_string())?;
        }
    }

    // 2. Pre-calculate ID generation to avoid per-row DB hits (Optimization)
    // Most items in a batch will have the same date. Let's find the max seq per date used.
    use std::collections::HashMap;
    let mut next_seq_map: HashMap<String, i32> = HashMap::new();

    // 2-1. Collect dates that need new IDs
    for item in items
        .iter()
        .filter(|i| i.sales_id.is_none() || i.sales_id.as_ref().is_none_or(|s| s.trim().is_empty()))
    {
        let order_date = NaiveDate::parse_from_str(&item.order_date_str, "%Y-%m-%d")
            .map_err(|e| format!("Invalid date: {}", e))?;
        let date_key = order_date.format("%Y%m%d").to_string();

        if !next_seq_map.contains_key(&date_key) {
            // Get last ID for this date from DB (with row lock logic ideally, but transaction + desc limit is usually fine)
            let last_id_rec: Option<(String,)> = sqlx::query_as(
                "SELECT sales_id FROM sales WHERE sales_id LIKE $1 ORDER BY sales_id DESC LIMIT 1",
            )
            .bind(format!("{}-%", date_key))
            .fetch_optional(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;

            let last_num = match last_id_rec {
                Some((lid,)) => lid
                    .split('-')
                    .last()
                    .and_then(|s| s.parse::<i32>().ok())
                    .unwrap_or(0),
                None => 0,
            };
            next_seq_map.insert(date_key, last_num + 1);
        }
    }

    // 3. Process Upserts
    for item in items {
        let order_date = NaiveDate::parse_from_str(&item.order_date_str, "%Y-%m-%d")
            .map_err(|e| format!("Invalid date: {}", e))?;

        if let Some(sid) = &item.sales_id {
            if !sid.trim().is_empty() && item.is_dirty == "true" {
                // Update Logic (Already highly optimized)
                let old_sale: Option<(i32,)> =
                    sqlx::query_as("SELECT total_amount FROM sales WHERE sales_id = $1")
                        .bind(&sid)
                        .fetch_optional(&mut *tx)
                        .await
                        .map_err(|e| e.to_string())?;

                if let Some((old_amount,)) = old_sale {
                    let diff = item.total_amount - old_amount;
                    if diff != 0 {
                        sqlx::query("INSERT INTO customer_ledger (customer_id, transaction_date, transaction_type, amount, description, reference_id) VALUES ($1, CURRENT_DATE, '매출수정', $2, $3, $4)")
                            .bind(&item.customer_id).bind(diff).bind("매출 금액 수정").bind(&sid).execute(&mut *tx).await.map_err(|e| e.to_string())?;
                        sqlx::query("UPDATE customers SET current_balance = COALESCE(current_balance, 0) + $1 WHERE customer_id = $2")
                            .bind(diff).bind(&item.customer_id).execute(&mut *tx).await.map_err(|e| e.to_string())?;
                    }
                }

                sqlx::query("UPDATE sales SET product_name=$1, specification=$2, unit_price=$3, quantity=$4, total_amount=$5, status=$6, memo=$7, shipping_name=$8, shipping_zip_code=$9, shipping_address_primary=$10, shipping_address_detail=$11, shipping_mobile_number=$12, order_date=$13, shipping_date=$14, discount_rate=$15, paid_amount=$16, payment_status=$17 WHERE sales_id=$18")
                    .bind(&item.product_name).bind(&item.specification).bind(item.unit_price).bind(item.quantity).bind(item.total_amount).bind(&item.status).bind(&item.memo).bind(&item.shipping_name).bind(&item.shipping_zip_code).bind(&item.shipping_address_primary).bind(&item.shipping_address_detail).bind(&item.shipping_mobile_number).bind(order_date).bind(if item.status == "배송완료" { Some(order_date) } else { None }).bind(item.discount_rate.unwrap_or(0)).bind(item.paid_amount.unwrap_or(0)).bind(&item.payment_status).bind(&sid).execute(&mut *tx).await.map_err(|e| e.to_string())?;
                success_count += 1;
            }
        } else {
            // Create Logic (Optimized Version)
            let date_key = order_date.format("%Y%m%d").to_string();
            let next_num = next_seq_map
                .get_mut(&date_key)
                .ok_or("Failed to get sequence")?;
            let new_sid = format!("{}-{:05}", date_key, *next_num);
            *next_num += 1; // Increment for next item in same batch

            sqlx::query("INSERT INTO sales (sales_id, customer_id, product_name, specification, unit_price, quantity, total_amount, status, order_date, memo, shipping_name, shipping_zip_code, shipping_address_primary, shipping_address_detail, shipping_mobile_number, shipping_date, discount_rate, paid_amount, payment_status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)")
                .bind(&new_sid).bind(&item.customer_id).bind(&item.product_name).bind(&item.specification).bind(item.unit_price).bind(item.quantity).bind(item.total_amount).bind(&item.status).bind(order_date).bind(&item.memo).bind(&item.shipping_name).bind(&item.shipping_zip_code).bind(&item.shipping_address_primary).bind(&item.shipping_address_detail).bind(&item.shipping_mobile_number).bind(if item.status == "배송완료" { Some(order_date) } else { None }).bind(item.discount_rate.unwrap_or(0)).bind(item.paid_amount.unwrap_or(0)).bind(&item.payment_status).execute(&mut *tx).await.map_err(|e| e.to_string())?;

            sqlx::query("INSERT INTO customer_ledger (customer_id, transaction_date, transaction_type, amount, description, reference_id) VALUES ($1, $2, '매출', $3, $4, $5)")
                .bind(&item.customer_id).bind(order_date).bind(item.total_amount).bind(format!("매출 등록: {}", item.product_name)).bind(&new_sid).execute(&mut *tx).await.map_err(|e| e.to_string())?;
            sqlx::query("UPDATE customers SET current_balance = COALESCE(current_balance, 0) + $1 WHERE customer_id = $2")
                .bind(item.total_amount).bind(&item.customer_id).execute(&mut *tx).await.map_err(|e| e.to_string())?;

            if let Some(payment) = item.paid_amount {
                if payment > 0 {
                    sqlx::query("INSERT INTO customer_ledger (customer_id, transaction_date, transaction_type, amount, description, reference_id) VALUES ($1, $2, '입금', $3, '매출 동시 입금', $4)")
                        .bind(&item.customer_id).bind(order_date).bind(-payment).bind(&new_sid).execute(&mut *tx).await.map_err(|e| e.to_string())?;
                    sqlx::query("UPDATE customers SET current_balance = COALESCE(current_balance, 0) - $1 WHERE customer_id = $2")
                        .bind(payment).bind(&item.customer_id).execute(&mut *tx).await.map_err(|e| e.to_string())?;
                }
            }
            success_count += 1;
        }
    }

    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(success_count)
}

#[tauri::command]
async fn get_product_list(state: State<'_, DbPool>) -> Result<Vec<Product>, String> {
    let products = sqlx::query_as::<_, Product>(
        "SELECT product_id, product_name, specification, unit_price, stock_quantity, safety_stock, cost_price, material_id, material_ratio, item_type FROM products ORDER BY product_name"
    )
    .fetch_all(&*state)
    .await
    .map_err(|e: sqlx::Error| e.to_string())?;

    Ok(products)
}

#[tauri::command]
async fn get_discontinued_product_names(pool: State<'_, DbPool>) -> Result<Vec<String>, String> {
    let sql = r#"
        SELECT product_name FROM (
            SELECT DISTINCT product_name FROM sales
            UNION
            SELECT DISTINCT product_name FROM inventory_logs
        ) AS combined
        WHERE NOT EXISTS (
            SELECT 1 FROM products p WHERE p.product_name = combined.product_name
        )
        ORDER BY product_name
    "#;

    let rows = sqlx::query_scalar::<_, String>(sql)
        .fetch_all(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(rows)
}

#[tauri::command]
async fn consolidate_products(
    pool: State<'_, DbPool>,
    old_name: String,
    new_name: String,
) -> Result<(), String> {
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    // Update sales
    sqlx::query("UPDATE sales SET product_name = $1 WHERE product_name = $2")
        .bind(&new_name)
        .bind(&old_name)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    // Update inventory_logs
    sqlx::query("UPDATE inventory_logs SET product_name = $1 WHERE product_name = $2")
        .bind(&new_name)
        .bind(&old_name)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn get_user_list(state: State<'_, DbPool>) -> Result<Vec<User>, String> {
    sqlx::query_as::<_, User>(
        "SELECT id, username, password_hash, role, created_at, updated_at FROM users ORDER BY created_at DESC",
    )
    .fetch_all(&*state)
    .await
    .map_err(|e: sqlx::Error| e.to_string())
}

#[tauri::command]
async fn create_product(
    state: State<'_, DbPool>,
    product_name: String,
    specification: Option<String>,
    unit_price: i32,
    stock_quantity: Option<i32>,
    safety_stock: Option<i32>,
    cost_price: Option<i32>,
    material_id: Option<i32>,
    material_ratio: Option<f64>,
    item_type: Option<String>,
) -> Result<i32, String> {
    DB_MODIFIED.store(true, Ordering::Relaxed);
    let id: i32 = sqlx::query_scalar(
        "INSERT INTO products (product_name, specification, unit_price, stock_quantity, safety_stock, cost_price, material_id, material_ratio, item_type) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING product_id",
    )
    .bind(product_name)
    .bind(specification)
    .bind(unit_price)
    .bind(stock_quantity.unwrap_or(0))
    .bind(safety_stock.unwrap_or(10))
    .bind(cost_price.unwrap_or(0))
    .bind(material_id)
    .bind(material_ratio.unwrap_or(1.0))
    .bind(item_type.unwrap_or_else(|| "product".to_string()))
    .fetch_one(&*state)
    .await
    .map_err(|e: sqlx::Error| e.to_string())?;

    Ok(id)
}

#[tauri::command]
async fn update_product(
    state: State<'_, DbPool>,
    product_id: i32,
    product_name: String,
    specification: Option<String>,
    unit_price: i32,
    stock_quantity: Option<i32>,
    safety_stock: Option<i32>,
    cost_price: Option<i32>,
    material_id: Option<i32>,
    material_ratio: Option<f64>,
    item_type: Option<String>,
) -> Result<(), String> {
    DB_MODIFIED.store(true, Ordering::Relaxed);
    let cost = cost_price.unwrap_or(0);
    let ratio = material_ratio.unwrap_or(1.0);

    if let Some(qty) = stock_quantity {
        sqlx::query(
            "UPDATE products SET product_name = $1, specification = $2, unit_price = $3, stock_quantity = $4, safety_stock = $5, cost_price = $6, material_id = $7, material_ratio = $8, item_type = $9 WHERE product_id = $10",
        )
        .bind(product_name)
        .bind(specification)
        .bind(unit_price)
        .bind(qty)
        .bind(safety_stock.unwrap_or(10))
        .bind(cost)
        .bind(material_id)
        .bind(ratio)
        .bind(item_type.clone().unwrap_or_else(|| "product".to_string()))
        .bind(product_id)
        .execute(&*state)
        .await
        .map_err(|e: sqlx::Error| e.to_string())?;
    } else {
        sqlx::query(
            "UPDATE products SET product_name = $1, specification = $2, unit_price = $3, safety_stock = $4, cost_price = $5, material_id = $6, material_ratio = $7, item_type = $8 WHERE product_id = $9",
        )
        .bind(product_name)
        .bind(specification)
        .bind(unit_price)
        .bind(safety_stock.unwrap_or(10))
        .bind(cost)
        .bind(material_id)
        .bind(ratio)
        .bind(item_type.unwrap_or_else(|| "product".to_string()))
        .bind(product_id)
        .execute(&*state)
        .await
        .map_err(|e: sqlx::Error| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
async fn delete_product(state: State<'_, DbPool>, product_id: i32) -> Result<(), String> {
    DB_MODIFIED.store(true, Ordering::Relaxed);
    sqlx::query("DELETE FROM products WHERE product_id = $1")
        .bind(product_id)
        .execute(&*state)
        .await
        .map_err(|e: sqlx::Error| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn get_last_event(state: State<'_, DbPool>) -> Result<Option<Event>, String> {
    let event = sqlx::query_as::<_, Event>("SELECT * FROM event ORDER BY created_at DESC LIMIT 1")
        .fetch_optional(&*state)
        .await
        .map_err(|e: sqlx::Error| e.to_string())?;
    Ok(event)
}

#[derive(sqlx::FromRow)]
struct ColumnName {
    column_name: String,
}

#[tauri::command]
async fn debug_db_schema(
    state: State<'_, DbPool>,
    table_name: String,
) -> Result<Vec<String>, String> {
    let rows: Vec<ColumnName> =
        sqlx::query_as("SELECT column_name FROM information_schema.columns WHERE table_name = $1")
            .bind(table_name)
            .fetch_all(&*state)
            .await
            .map_err(|e: sqlx::Error| e.to_string())?;

    Ok(rows.into_iter().map(|r| r.column_name).collect())
}

#[tauri::command]
async fn create_event(
    state: State<'_, DbPool>,
    event_name: String,
    organizer: Option<String>,
    manager_name: Option<String>,
    manager_contact: Option<String>,
    location_address: Option<String>,
    location_detail: Option<String>,
    start_date: Option<String>,
    end_date: Option<String>,
    memo: Option<String>,
) -> Result<String, String> {
    // Generate ID: YYYYMMDD-1XXXX (Global Sequence)
    let now = Utc::now();
    let date_str = now.format("%Y%m%d").to_string(); // YYYYMMDD

    // Find the last ID for THIS date to reset daily (using 1XXXX range for events)
    let last_record: Option<(String,)> = sqlx::query_as(
        "SELECT event_id FROM event WHERE event_id LIKE $1 ORDER BY event_id DESC LIMIT 1",
    )
    .bind(format!("{}%", date_str))
    .fetch_optional(&*state)
    .await
    .map_err(|e: sqlx::Error| e.to_string())?;

    let next_val = match last_record {
        Some((last_id,)) => {
            // last_id example: "20240520-10001"
            let parts: Vec<&str> = last_id.split('-').collect();
            if let Some(suffix) = parts.last() {
                suffix.parse::<i32>().unwrap_or(10000) + 1
            } else {
                10001
            }
        }
        None => 10001,
    };

    let event_id = format!("{}-{}", date_str, next_val);

    // Date parsing
    let start_date_parsed = match start_date {
        Some(s) if !s.is_empty() => Some(
            NaiveDate::parse_from_str(&s, "%Y-%m-%d")
                .map_err(|e| format!("Invalid start date: {}", e))?,
        ),
        _ => None,
    };
    let end_date_parsed = match end_date {
        Some(s) if !s.is_empty() => Some(
            NaiveDate::parse_from_str(&s, "%Y-%m-%d")
                .map_err(|e| format!("Invalid end date: {}", e))?,
        ),
        _ => None,
    };

    sqlx::query(
        "INSERT INTO event (
            event_id, event_name, organizer, manager_name, manager_contact,
            location_address, location_detail, start_date, end_date, memo
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)",
    )
    .bind(&event_id)
    .bind(event_name)
    .bind(organizer)
    .bind(manager_name)
    .bind(manager_contact)
    .bind(location_address)
    .bind(location_detail)
    .bind(start_date_parsed)
    .bind(end_date_parsed)
    .bind(memo)
    .execute(&*state)
    .await
    .map_err(|e: sqlx::Error| e.to_string())?;

    Ok(event_id)
}

#[tauri::command]
async fn get_daily_sales(
    state: State<'_, DbPool>,
    date: String,
    filter: String,
    page: i32,
    page_size: i32,
) -> Result<(Vec<Sales>, i64), String> {
    let offset = (page - 1) * page_size;

    // 1. Get total count
    let mut count_query = String::from("SELECT COUNT(*) FROM sales WHERE order_date = $1::date");
    if filter == "general" {
        count_query.push_str(" AND SUBSTR(customer_id, 10, 1) = '0'");
    } else if filter == "special" {
        count_query.push_str(" AND SUBSTR(customer_id, 10, 1) = '1'");
    }

    let total_count: i64 = sqlx::query_scalar(&count_query)
        .bind(&date)
        .fetch_one(&*state)
        .await
        .map_err(|e| e.to_string())?;

    // 2. Get paged data
    let mut query_str = String::from(
        "SELECT s.*, c.customer_name 
         FROM sales s
         LEFT JOIN customers c ON s.customer_id = c.customer_id
         WHERE s.order_date = $1::date",
    );

    if filter == "general" {
        query_str.push_str(" AND SUBSTR(s.customer_id, 10, 1) = '0'");
    } else if filter == "special" {
        query_str.push_str(" AND SUBSTR(s.customer_id, 10, 1) = '1'");
    }

    query_str.push_str(" ORDER BY s.sales_id DESC LIMIT $2 OFFSET $3");

    let sales = sqlx::query_as::<_, Sales>(&query_str)
        .bind(date)
        .bind(page_size)
        .bind(offset)
        .fetch_all(&*state)
        .await
        .map_err(|e: sqlx::Error| e.to_string())?;

    Ok((sales, total_count))
}

#[tauri::command]
async fn search_sales_by_any(
    state: State<'_, DbPool>,
    query: String,
    period: String,
) -> Result<Vec<Sales>, String> {
    let trimmed = query.trim();
    if trimmed.is_empty() {
        return Ok(Vec::new());
    }

    // Optimized Search: Use LIKE instead of on-the-fly to_tsvector for better response on unindexed columns
    let like_query = format!("%{}%", trimmed);

    let period_clause = if period == "1year" {
        "AND s.order_date >= CURRENT_DATE - INTERVAL '1 year'"
    } else {
        ""
    };

    let sql = format!(
        r#"
        SELECT s.*, c.customer_name, c.mobile_number as customer_mobile, c.address_primary as customer_address
        FROM sales s
        LEFT JOIN customers c ON s.customer_id = c.customer_id
        WHERE (
            s.product_name LIKE $1 OR 
            s.shipping_name LIKE $1 OR 
            s.shipping_address_primary LIKE $1 OR
            s.shipping_address_detail LIKE $1 OR
            s.shipping_mobile_number LIKE $1 OR
            s.memo LIKE $1 OR
            c.customer_name LIKE $1 OR
            c.mobile_number LIKE $1
        ) {}
        ORDER BY s.order_date DESC
        LIMIT 300
    "#,
        period_clause
    );

    sqlx::query_as::<_, Sales>(&sql)
        .bind(like_query)
        .fetch_all(&*state)
        .await
        .map_err(|e: sqlx::Error| e.to_string())
}

#[tauri::command]
async fn get_repurchase_candidates(
    state: State<'_, DbPool>,
) -> Result<Vec<db::RepurchaseCandidate>, String> {
    // This logic mimics Python's logic but in simplified SQL+Rust
    // 1. Get customers with > 1 orders
    // 2. Calculate avg interval
    // 3. Compare with days since last order
    // 4. Return those who are close (e.g. within 7 days of predicted date)

    // We can do a complex query or just fetch and filter. Query is better.
    // Enhanced Query for PostgreSQL:
    let sql = r#"
    WITH OrderStats AS (
        SELECT 
            s.customer_id,
            MAX(c.customer_name) as customer_name,
            MAX(c.mobile_number) as mobile,
            MAX(s.order_date) as last_order_date,
            MIN(s.order_date) as first_order_date,
            COUNT(*) as total_orders,
            ((MAX(s.order_date) - MIN(s.order_date)) / NULLIF(COUNT(*) - 1, 0))::INTEGER as avg_interval 
        FROM sales s
        LEFT JOIN customers c ON s.customer_id = c.customer_id
        WHERE s.status NOT IN ('취소', '반품') AND s.customer_id IS NOT NULL
        GROUP BY s.customer_id
        HAVING COUNT(*) >= 2
    )
    SELECT 
        customer_id,
        COALESCE(customer_name, '알수없음') as customer_name,
        mobile as mobile_number,
        last_order_date,
        avg_interval as avg_interval_days,
        (avg_interval - (CURRENT_DATE - last_order_date))::INTEGER as predicted_days_remaining,
        (SELECT product_name FROM sales s2 WHERE s2.customer_id = os.customer_id ORDER BY order_date DESC LIMIT 1) as last_product,
        total_orders as purchase_count
    FROM OrderStats os
    WHERE (CURRENT_DATE - last_order_date) >= (avg_interval - 7)
    ORDER BY predicted_days_remaining ASC
    LIMIT 50
    "#;

    let rows: Vec<db::RepurchaseCandidate> = sqlx::query_as(sql)
        .fetch_all(&*state)
        .await
        .map_err(|e: sqlx::Error| e.to_string())?;

    Ok(rows)
}

#[tauri::command]
async fn search_events_by_name(
    state: State<'_, DbPool>,
    name: String,
) -> Result<Vec<Event>, String> {
    sqlx::query_as::<_, Event>(
        "SELECT * FROM event WHERE event_name ILIKE $1 ORDER BY start_date DESC",
    )
    .bind(format!("%{}%", name))
    .fetch_all(&*state)
    .await
    .map_err(|e: sqlx::Error| e.to_string())
}

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

#[tauri::command]
async fn init_db_schema(state: State<'_, DbPool>) -> Result<(), String> {
    DB_MODIFIED.store(true, Ordering::Relaxed);

    // 1. Products Table
    sqlx::query("ALTER TABLE products ADD COLUMN IF NOT EXISTS stock_quantity INTEGER DEFAULT 0")
        .execute(&*state)
        .await
        .map_err(|e| e.to_string())?;

    sqlx::query("ALTER TABLE products ADD COLUMN IF NOT EXISTS safety_stock INTEGER DEFAULT 10")
        .execute(&*state)
        .await
        .map_err(|e| e.to_string())?;

    sqlx::query("ALTER TABLE products ADD COLUMN IF NOT EXISTS material_id INTEGER REFERENCES products(product_id)")
        .execute(&*state).await.map_err(|e| e.to_string())?;

    sqlx::query("ALTER TABLE products ADD COLUMN IF NOT EXISTS material_ratio FLOAT DEFAULT 1.0")
        .execute(&*state)
        .await
        .map_err(|e| e.to_string())?;

    // 2. Purchases Table
    sqlx::query(
        "ALTER TABLE purchases ADD COLUMN IF NOT EXISTS inventory_synced BOOLEAN DEFAULT FALSE",
    )
    .execute(&*state)
    .await
    .map_err(|e| e.to_string())?;

    sqlx::query("ALTER TABLE purchases ADD COLUMN IF NOT EXISTS material_item_id INTEGER REFERENCES products(product_id)")
        .execute(&*state).await.map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
async fn update_product_stock(
    state: State<'_, DbPool>,
    product_id: i32,
    stock_quantity: i32,
) -> Result<(), String> {
    DB_MODIFIED.store(true, Ordering::Relaxed);
    sqlx::query("UPDATE products SET stock_quantity = $1 WHERE product_id = $2")
        .bind(stock_quantity)
        .bind(product_id)
        .execute(&*state)
        .await
        .map_err(|e: sqlx::Error| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn convert_stock(
    state: State<'_, DbPool>,
    product_id: i32,
    convert_qty: i32,
    memo: String,
) -> Result<(), String> {
    DB_MODIFIED.store(true, Ordering::Relaxed);
    let mut tx = state.begin().await.map_err(|e| e.to_string())?;

    // 1. Get Product info and its material link
    let product: (String, Option<String>, i32, Option<i32>, f64) = sqlx::query_as(
        "SELECT product_name, specification, stock_quantity, material_id, material_ratio FROM products WHERE product_id = $1",
    )
    .bind(product_id)
    .fetch_one(&mut *tx)
    .await
    .map_err(|e| format!("Product not found: {}", e))?;

    let p_name = product.0;
    let p_spec = product.1;
    let p_old_qty = product.2;
    let m_id = product
        .3
        .ok_or("The selected product has no linked material.")?;
    let m_ratio = product.4;

    // 2. Get Material info
    let material: (String, Option<String>, i32) = sqlx::query_as(
        "SELECT product_name, specification, stock_quantity FROM products WHERE product_id = $1",
    )
    .bind(m_id)
    .fetch_one(&mut *tx)
    .await
    .map_err(|e| format!("Material not found: {}", e))?;

    let m_name = material.0;
    let m_spec = material.1;
    let m_old_qty = material.2;

    // 3. Calculate changes
    let m_deduct = (convert_qty as f64 * m_ratio).ceil() as i32;
    let m_new_qty = m_old_qty - m_deduct;
    let p_new_qty = p_old_qty + convert_qty;

    // 4. Update stocks
    sqlx::query("UPDATE products SET stock_quantity = $1 WHERE product_id = $2")
        .bind(m_new_qty)
        .bind(m_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| format!("Material update failed: {}", e))?;

    sqlx::query("UPDATE products SET stock_quantity = $1 WHERE product_id = $2")
        .bind(p_new_qty)
        .bind(product_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| format!("Product update failed: {}", e))?;

    // 5. Logging
    let p_log_memo = format!("{} (자재 {} {}개 소모)", memo, m_name, m_deduct);
    sqlx::query(
        "INSERT INTO inventory_logs (product_name, specification, change_type, change_quantity, current_stock, reference_id, memo)
         VALUES ($1, $2, $3, $4, $5, $6, $7)"
    )
    .bind(&p_name)
    .bind(&p_spec)
    .bind("입고")
    .bind(convert_qty)
    .bind(p_new_qty)
    .bind("CONVERT")
    .bind(p_log_memo)
    .execute(&mut *tx)
    .await
    .map_err(|e| format!("Product log failed: {}", e))?;

    let m_log_memo = format!("생산 전환 소모 ({} 제작용)", p_name);
    sqlx::query(
        "INSERT INTO inventory_logs (product_name, specification, change_type, change_quantity, current_stock, reference_id, memo)
         VALUES ($1, $2, $3, $4, $5, $6, $7)"
    )
    .bind(&m_name)
    .bind(&m_spec)
    .bind("출고")
    .bind(-m_deduct)
    .bind(m_new_qty)
    .bind("CONVERT")
    .bind(m_log_memo)
    .execute(&mut *tx)
    .await
    .map_err(|e| format!("Material log failed: {}", e))?;

    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn adjust_product_stock(
    state: State<'_, DbPool>,
    product_id: i32,
    change_qty: i32,
    memo: String,
    reason_category: Option<String>, // New parameter for structured reason
) -> Result<(), String> {
    DB_MODIFIED.store(true, Ordering::Relaxed);
    let mut tx = state.begin().await.map_err(|e| e.to_string())?;

    // 1. Get current info
    let product: (String, Option<String>, i32) = sqlx::query_as(
        "SELECT product_name, specification, stock_quantity FROM products WHERE product_id = $1",
    )
    .bind(product_id)
    .fetch_one(&mut *tx)
    .await
    .map_err(|e| format!("Product not found: {}", e))?;

    let name = product.0;
    let spec = product.1;
    let old_qty = product.2;
    let new_qty = old_qty + change_qty;

    // 2. Update stock
    sqlx::query("UPDATE products SET stock_quantity = $1 WHERE product_id = $2")
        .bind(new_qty)
        .bind(product_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    // 3. Log with Category
    // Determine broad type (Deposit/Withdrawal/Adjustment) from qty sign,
    // but use reason_category for specific logic if provided.
    // Categories: '일반조정'(default), '폐기손실', '마케팅증정', '자가소비', etc.

    // If users select '폐기' or '증정', we map it to change_type in DB or memo?
    // Let's use change_type for the main category.
    let log_type = if let Some(cat) = reason_category {
        if !cat.is_empty() && cat != "단순오차" {
            cat // Use the specific category like '폐기' directly as change_type
        } else {
            // For simple adjustment, if it's negative -> '조정(-)', postive -> '조정(+)' or just '입고'
            if change_qty > 0 {
                "입고".to_string()
            } else {
                "조정".to_string()
            }
        }
    } else if change_qty > 0 {
        "입고".to_string()
    } else {
        "조정".to_string()
    };

    sqlx::query(
        "INSERT INTO inventory_logs (product_name, specification, change_type, change_quantity, current_stock, reference_id, memo)
         VALUES ($1, $2, $3, $4, $5, 'MANUAL', $6)"
    )
    .bind(name)
    .bind(spec)
    .bind(log_type)
    .bind(change_qty)
    .bind(new_qty)
    .bind(memo)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(())
}

#[derive(Debug, serde::Serialize, serde::Deserialize, sqlx::FromRow)]
pub struct InventoryLog {
    pub log_id: i32,
    pub product_name: String,
    pub specification: Option<String>,
    pub change_type: String,
    pub change_quantity: i32,
    pub current_stock: i32,
    pub reference_id: Option<String>,
    pub memo: Option<String>,
    pub created_at: Option<chrono::NaiveDateTime>,
    #[sqlx(default)]
    pub updated_at: Option<chrono::NaiveDateTime>,
}

#[tauri::command]
async fn get_inventory_logs(
    state: State<'_, DbPool>,
    limit: i64,
    item_type: Option<String>,
) -> Result<Vec<InventoryLog>, String> {
    // We'll show logs from the last 24 hours as per the UI label "변동 이력 (24h)"
    // If no recent logs, it might appear empty - this is logical.

    let base_sql = r#"
        SELECT l.* FROM inventory_logs l 
        LEFT JOIN products p ON TRIM(l.product_name) = TRIM(p.product_name) 
        WHERE l.created_at >= CURRENT_TIMESTAMP - INTERVAL '24 hours'
    "#;

    if let Some(t) = item_type {
        let sql = format!(
            "{} AND (p.item_type = $1 OR ($1 = 'product' AND p.item_type IS NULL)) 
             ORDER BY l.created_at DESC LIMIT $2",
            base_sql
        );
        sqlx::query_as::<_, InventoryLog>(&sql)
            .bind(t)
            .bind(limit)
            .fetch_all(&*state)
            .await
            .map_err(|e: sqlx::Error| e.to_string())
    } else {
        let sql = format!("{} ORDER BY l.created_at DESC LIMIT $1", base_sql);
        sqlx::query_as::<_, InventoryLog>(&sql)
            .bind(limit)
            .fetch_all(&*state)
            .await
            .map_err(|e: sqlx::Error| e.to_string())
    }
}

#[tauri::command]
async fn get_shipments_by_status(
    state: State<'_, DbPool>,
    status: String,
    search: Option<String>,
    start_date: Option<String>,
    end_date: Option<String>,
) -> Result<Vec<PendingShipment>, String> {
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

    // Simplified logic: just filter by status without complex date subqueries unless explicitly requested
    // Removed the slow subquery for "배송완료"/"취소" based on min "접수" date.

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

    query
        .fetch_all(&*state)
        .await
        .map_err(|e: sqlx::Error| e.to_string())
}

#[tauri::command]
async fn get_shipping_base_date(state: State<'_, DbPool>) -> Result<Option<NaiveDate>, String> {
    sqlx::query_scalar("SELECT MIN(order_date) FROM sales WHERE status IN ('접수', '입금완료')")
        .fetch_one(&*state)
        .await
        .map_err(|e: sqlx::Error| e.to_string())
}

#[tauri::command]
async fn get_daily_receipts(state: State<'_, DbPool>, date: String) -> Result<Vec<Sales>, String> {
    let parsed_date = NaiveDate::parse_from_str(&date, "%Y-%m-%d")
        .map_err(|e| format!("Invalid date format: {}", e))?;

    let receipts = sqlx::query_as::<_, Sales>(
        "SELECT s.*, COALESCE(c.customer_name, e.event_name) as customer_name 
         FROM sales s
         LEFT JOIN customers c ON s.customer_id = c.customer_id
         LEFT JOIN event e ON s.customer_id = e.event_id
         WHERE s.order_date = $1
         ORDER BY s.sales_id ASC",
    )
    .bind(parsed_date)
    .fetch_all(&*state)
    .await
    .map_err(|e: sqlx::Error| e.to_string())?;

    Ok(receipts)
}

#[tauri::command]
async fn update_sale_status(
    state: State<'_, DbPool>,
    sales_id: String,
    status: String,
) -> Result<(), String> {
    DB_MODIFIED.store(true, Ordering::Relaxed);
    sqlx::query("UPDATE sales SET status = $1 WHERE sales_id = $2")
        .bind(status)
        .bind(sales_id)
        .execute(&*state)
        .await
        .map_err(|e: sqlx::Error| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn cancel_sale(
    state: State<'_, DbPool>,
    sales_id: String,
    reason: String,
) -> Result<(), String> {
    DB_MODIFIED.store(true, Ordering::Relaxed);

    let mut tx = state.begin().await.map_err(|e| e.to_string())?;

    // 1. Get current sale info (product and quantity) to recover stock
    let sale: (String, i32, Option<String>) =
        sqlx::query_as("SELECT product_name, quantity, memo FROM sales WHERE sales_id = $1")
            .bind(&sales_id)
            .fetch_one(&mut *tx)
            .await
            .map_err(|e| format!("Sale not found: {}", e))?;

    let product_name = sale.0;
    let quantity = sale.1;
    let old_memo = sale.2.unwrap_or_default();
    let new_memo = format!("[취소사유: {}] {}", reason, old_memo);

    // 2. Update sale status and memo
    sqlx::query("UPDATE sales SET status = '취소', memo = $1 WHERE sales_id = $2")
        .bind(new_memo)
        .bind(&sales_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    // 3. Recover stock
    sqlx::query("UPDATE products SET stock_quantity = stock_quantity + $1 WHERE product_name = $2")
        .bind(quantity)
        .bind(product_name)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn get_sales_by_event_id_and_date_range(
    state: State<'_, DbPool>,
    event_id: String,
    start_date: Option<String>,
    end_date: Option<String>,
) -> Result<Vec<Sales>, String> {
    // Basic query
    let mut query_str = String::from(
        "SELECT s.*, c.customer_name 
         FROM sales s
         LEFT JOIN customers c ON s.customer_id = c.customer_id
         WHERE s.customer_id = $1",
    );

    // Add date range condition if both dates are provided
    if start_date.is_some() && end_date.is_some() {
        query_str.push_str(" AND s.order_date >= $2::date AND s.order_date <= $3::date");
    }

    query_str.push_str(" ORDER BY s.order_date ASC, s.sales_id ASC");

    let query = sqlx::query_as::<_, Sales>(&query_str).bind(event_id);

    let query = if let (Some(start), Some(end)) = (&start_date, &end_date) {
        query.bind(start).bind(end)
    } else {
        query
    };

    query
        .fetch_all(&*state)
        .await
        .map_err(|e: sqlx::Error| e.to_string())
}

#[tauri::command]
async fn delete_sale(state: State<'_, DbPool>, sales_id: String) -> Result<(), String> {
    DB_MODIFIED.store(true, Ordering::Relaxed);
    let mut tx = state
        .begin()
        .await
        .map_err(|e: sqlx::Error| e.to_string())?;

    // Get old amount/customer for ledger adjustment
    let (old_amount, old_customer_id): (i32, String) =
        sqlx::query_as("SELECT total_amount, customer_id FROM sales WHERE sales_id = $1")
            .bind(&sales_id)
            .fetch_one(&mut *tx)
            .await
            .map_err(|e: sqlx::Error| e.to_string())?;

    // Ledger Adjustment: Delete Sale -> Minus Amount (or inverse transaction)
    // We insert a '매출취소' transaction with negative amount
    sqlx::query(
        "INSERT INTO customer_ledger (customer_id, transaction_date, transaction_type, amount, description, reference_id)
         VALUES ($1, CURRENT_DATE, '매출취소', $2, $3, $4)"
    )
    .bind(&old_customer_id)
    .bind(-old_amount) // Negative 
    .bind("매출 삭제")
    .bind(&sales_id)
    .execute(&mut *tx)
    .await
    .map_err(|e: sqlx::Error| e.to_string())?;

    // Update Customer Balance (-)
    sqlx::query("UPDATE customers SET current_balance = COALESCE(current_balance, 0) - $1 WHERE customer_id = $2")
        .bind(old_amount)
        .bind(&old_customer_id)
        .execute(&mut *tx)
        .await
        .map_err(|e: sqlx::Error| e.to_string())?;

    // Get old quantity/product to restore stock (Just checking existence now, mainly)
    let (_old_product, _old_quantity, _old_specification): (String, i32, Option<String>) =
        sqlx::query_as(
            "SELECT product_name, quantity, specification FROM sales WHERE sales_id = $1",
        )
        .bind(&sales_id)
        .fetch_optional(&mut *tx)
        .await
        .map_err(|e: sqlx::Error| e.to_string())?
        .ok_or("Sale not found")?;

    sqlx::query("DELETE FROM sales WHERE sales_id = $1")
        .bind(&sales_id)
        .execute(&mut *tx)
        .await
        .map_err(|e: sqlx::Error| e.to_string())?;

    // Stock restoration is now handled by DB trigger
    // sqlx::query("UPDATE products SET stock_quantity = stock_quantity + $1 ...

    tx.commit().await.map_err(|e: sqlx::Error| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn get_sale_detail(state: State<'_, DbPool>, sales_id: String) -> Result<Sales, String> {
    sqlx::query_as::<_, Sales>(
        "SELECT s.*, c.customer_name 
         FROM sales s 
         LEFT JOIN customers c ON s.customer_id = c.customer_id 
         WHERE s.sales_id = $1 LIMIT 1",
    )
    .bind(sales_id.trim())
    .fetch_optional(&*state)
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "판매 정보를 찾을 수 없습니다.".to_string())
}

#[tauri::command]
async fn update_sale(
    state: State<'_, DbPool>,
    sales_id: String,
    customer_id: String,
    product_name: String,
    specification: Option<String>,
    unit_price: i32,
    quantity: i32,
    total_amount: i32,
    status: String,
    memo: Option<String>,
    shipping_name: Option<String>,
    shipping_zip_code: Option<String>,
    shipping_address_primary: Option<String>,
    shipping_address_detail: Option<String>,
    shipping_mobile_number: Option<String>,
    order_date_str: String,
) -> Result<(), String> {
    DB_MODIFIED.store(true, Ordering::Relaxed);
    let order_date = NaiveDate::parse_from_str(&order_date_str, "%Y-%m-%d")
        .map_err(|e| format!("Invalid date format: {}", e))?;

    let mut tx = state
        .begin()
        .await
        .map_err(|e: sqlx::Error| e.to_string())?;

    // Get old info for comparison if we wanted to adjust ledger automatically.
    // For now, complicated. Updating sales amount doesn't automatically update ledger in this simple version
    // UNLESS we explicitly handle it.
    // Ideally: Calculate difference (New Amount - Old Amount) and insert '조정(Correct)' transaction.

    let old_sale: Option<(i32, String)> =
        sqlx::query_as("SELECT total_amount, customer_id FROM sales WHERE sales_id = $1")
            .bind(&sales_id)
            .fetch_optional(&mut *tx)
            .await
            .map_err(|e: sqlx::Error| e.to_string())?;

    if let Some((old_amount, _old_customer_id)) = old_sale {
        // If customer changed, it's very complex. Assuming customer didn't change for MVP or handling it simply.
        // If amount changed:
        let diff = total_amount - old_amount;
        if diff != 0 {
            // Record adjustment in ledger
            sqlx::query(
                "INSERT INTO customer_ledger (customer_id, transaction_date, transaction_type, amount, description, reference_id)
                 VALUES ($1, CURRENT_DATE, '매출수정', $2, $3, $4)"
            )
            .bind(&customer_id)
            .bind(diff)
            .bind("매출 금액 수정")
            .bind(&sales_id)
            .execute(&mut *tx)
            .await
            .map_err(|e: sqlx::Error| e.to_string())?;

            // Update balance
            sqlx::query("UPDATE customers SET current_balance = COALESCE(current_balance, 0) + $1 WHERE customer_id = $2")
                .bind(diff)
                .bind(&customer_id)
                .execute(&mut *tx)
                .await
                .map_err(|e: sqlx::Error| e.to_string())?;
        }
    }

    sqlx::query(
        "UPDATE sales SET
            customer_id = $1, product_name = $2, specification = $3, unit_price = $4, quantity = $5, total_amount = $6,
            status = $7, memo = $8, shipping_name = $9, shipping_zip_code = $10,
            shipping_address_primary = $11, shipping_address_detail = $12, shipping_mobile_number = $13,
            order_date = $14,
            shipping_date = $14
        WHERE sales_id = $15"
    )
    .bind(customer_id)
    .bind(&product_name)
    .bind(&specification)
    .bind(unit_price)
    .bind(quantity)
    .bind(total_amount)
    .bind(status)
    .bind(memo)
    .bind(shipping_name)
    .bind(shipping_zip_code)
    .bind(shipping_address_primary)
    .bind(shipping_address_detail)
    .bind(shipping_mobile_number)
    .bind(order_date)
    .bind(&sales_id)
    .execute(&mut *tx)
    .await
    .map_err(|e: sqlx::Error| e.to_string())?;

    // Stock updates are now handled by DB trigger
    // sqlx::query("UPDATE products SET stock_quantity = stock_quantity + $1 ... (restore old)
    // sqlx::query("UPDATE products SET stock_quantity = stock_quantity - $1 ... (deduct new)

    tx.commit().await.map_err(|e: sqlx::Error| e.to_string())?;

    Ok(())
}

#[tauri::command]
async fn complete_shipment(
    state: State<'_, DbPool>,
    sales_id: String,
    memo: Option<String>,
    carrier: Option<String>,
    tracking_number: Option<String>,
    shipping_date: Option<String>,
) -> Result<(), String> {
    DB_MODIFIED.store(true, Ordering::Relaxed);

    // 1. Check current payment status and record receivable if needed
    // We need to know if the order was paid before shipping.
    // If status != '입금완료', we assume it's a credit sale (receivable).
    let sale_info: Option<(String, i32, Option<String>)> =
        sqlx::query_as("SELECT status, total_amount, customer_id FROM sales WHERE sales_id = $1")
            .bind(&sales_id)
            .fetch_optional(&*state)
            .await
            .map_err(|e| e.to_string())?;

    if let Some((current_status, amount, cust_id_opt)) = sale_info {
        if current_status != "입금완료" {
            // It's not paid yet, but we are shipping it. Record as receivable.
            if let Some(cust_id) = cust_id_opt {
                // Ensure customer_ledger exists (it was added recently)
                // We perform the INSERT. simple ledger logic:
                // type='매출(미수)', amount=amount (positive means receivable increased)
                let _ = sqlx::query(
                    "INSERT INTO customer_ledger (customer_id, type, amount, description, reference_id, transaction_date)
                     VALUES ($1, '매출(미수)', $2, '배송 완료 (미수금 발생)', $3, CURRENT_DATE)"
                )
                .bind(cust_id)
                .bind(amount as i32) // Schema uses INTEGER
                .bind(&sales_id)
                .execute(&*state)
                .await
                .map_err(|e| format!("Failed to record ledger: {}", e))?;
            }
        }
    }

    // 2. Proceed with Shipping Update
    // Parse shipping_date if provided, otherwise use current date (handled by COALESCE or logic)
    let shipping_date_parsed = match shipping_date {
        Some(s) if !s.is_empty() => Some(
            NaiveDate::parse_from_str(&s, "%Y-%m-%d")
                .map_err(|e| format!("Invalid shipping date format: {}", e))?,
        ),
        _ => None,
    };

    if let Some(date) = shipping_date_parsed {
        sqlx::query(
            "UPDATE sales SET 
             status = '배송중', 
             memo = $1, 
             courier_name = $2,
             tracking_number = $3,
             shipping_date = $4
             WHERE sales_id = $5",
        )
        .bind(memo)
        .bind(carrier)
        .bind(tracking_number)
        .bind(date)
        .bind(sales_id)
        .execute(&*state)
        .await
        .map_err(|e: sqlx::Error| e.to_string())?;
    } else {
        sqlx::query(
            "UPDATE sales SET 
             status = '배송중', 
             memo = $1, 
             courier_name = $2,
             tracking_number = $3,
             shipping_date = CURRENT_DATE
             WHERE sales_id = $4",
        )
        .bind(memo)
        .bind(carrier)
        .bind(tracking_number)
        .bind(sales_id)
        .execute(&*state)
        .await
        .map_err(|e: sqlx::Error| e.to_string())?;
    }

    Ok(())
}

#[tauri::command]
async fn get_customer_sales_history(
    state: State<'_, DbPool>,
    customer_id: String,
    date: String,
) -> Result<Vec<Sales>, String> {
    // Parse date for validation, though we pass string to SQL
    let parsed_date = NaiveDate::parse_from_str(&date, "%Y-%m-%d")
        .map_err(|e| format!("Invalid date format: {}", e))?;

    let sales = sqlx::query_as::<_, Sales>(
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
    .await
    .map_err(|e: sqlx::Error| e.to_string())?;

    Ok(sales)
}

#[tauri::command]
async fn update_event(
    state: State<'_, DbPool>,
    event_id: String,
    event_name: String,
    organizer: Option<String>,
    manager_name: Option<String>,
    manager_contact: Option<String>,
    location_address: Option<String>,
    location_detail: Option<String>,
    start_date: Option<String>,
    end_date: Option<String>,
    memo: Option<String>,
) -> Result<(), String> {
    DB_MODIFIED.store(true, Ordering::Relaxed);
    // Date parsing
    let start_date_parsed = match start_date {
        Some(s) if !s.is_empty() => Some(
            NaiveDate::parse_from_str(&s, "%Y-%m-%d")
                .map_err(|e| format!("Invalid start date: {}", e))?,
        ),
        _ => None,
    };
    let end_date_parsed = match end_date {
        Some(s) if !s.is_empty() => Some(
            NaiveDate::parse_from_str(&s, "%Y-%m-%d")
                .map_err(|e| format!("Invalid end date: {}", e))?,
        ),
        _ => None,
    };

    sqlx::query(
        "UPDATE event SET 
        event_name = $1, 
        organizer = $2, 
        manager_name = $3, 
        manager_contact = $4, 
        location_address = $5, 
        location_detail = $6, 
        start_date = $7, 
        end_date = $8, 
        memo = $9
        WHERE event_id = $10",
    )
    .bind(event_name)
    .bind(organizer)
    .bind(manager_name)
    .bind(manager_contact)
    .bind(location_address)
    .bind(location_detail)
    .bind(start_date_parsed)
    .bind(end_date_parsed)
    .bind(memo)
    .bind(event_id)
    .execute(&*state)
    .await
    .map_err(|e: sqlx::Error| e.to_string())?;

    Ok(())
}

#[tauri::command]
async fn get_all_events(state: State<'_, DbPool>) -> Result<Vec<Event>, String> {
    sqlx::query_as::<_, Event>("SELECT * FROM event ORDER BY start_date DESC")
        .fetch_all(&*state)
        .await
        .map_err(|e: sqlx::Error| e.to_string())
}

#[tauri::command]
async fn delete_event(state: State<'_, DbPool>, event_id: String) -> Result<(), String> {
    DB_MODIFIED.store(true, Ordering::Relaxed);
    sqlx::query("DELETE FROM event WHERE event_id = $1")
        .bind(event_id)
        .execute(&*state)
        .await
        .map_err(|e: sqlx::Error| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn login_user(
    state: State<'_, DbPool>,
    username: String,
    password: String,
) -> Result<User, String> {
    let user_opt: Option<User> = sqlx::query_as("SELECT * FROM users WHERE username = $1")
        .bind(&username)
        .fetch_optional(&*state)
        .await
        .map_err(|e: sqlx::Error| e.to_string())?;

    if let Some(user) = user_opt {
        if let Some(hash_str) = &user.password_hash {
            if verify(&password, hash_str).map_err(|e| e.to_string())? {
                Ok(user)
            } else {
                Err("비밀번호가 일치하지 않습니다.".to_string())
            }
        } else {
            Err("비밀번호가 설정되지 않은 사용자입니다.".to_string())
        }
    } else {
        Err("사용자를 찾을 수 없습니다.".to_string())
    }
}

use std::sync::atomic::{AtomicBool, Ordering};

static IS_EXITING: AtomicBool = AtomicBool::new(false);
pub static DB_MODIFIED: AtomicBool = AtomicBool::new(false);
static BACKUP_CANCELLED: AtomicBool = AtomicBool::new(false);

#[tauri::command]
async fn cancel_backup_restore() {
    BACKUP_CANCELLED.store(true, Ordering::Relaxed);
    println!("[System] Cancellation requested by user.");
}

#[tauri::command]
async fn confirm_exit(app: tauri::AppHandle) -> Result<(), String> {
    // 0. Check if DB was modified
    if !DB_MODIFIED.load(Ordering::Relaxed) {
        // println!("No changes detected. Skipping auto-backup.");
        IS_EXITING.store(true, Ordering::Relaxed);
        std::process::exit(0);
    }

    if let Ok(config_dir) = app.path().app_config_dir() {
        let backup_dir = config_dir.join("backups");
        if !backup_dir.exists() {
            let _ = std::fs::create_dir_all(&backup_dir);
        }

        let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S");
        let day_of_week = chrono::Local::now().weekday();

        // Friday is Full Backup, other days are skip or Incremental
        let since = if day_of_week == chrono::Weekday::Fri {
            // println!("[Auto-Backup] Friday detected. Performing FULL compressed backup.");
            None
        } else {
            // println!("[Auto-Backup] Performing INCREMENTAL compressed backup.");
            get_last_backup_at(&app)
        };

        let backup_file_prefix = if since.is_none() {
            "full_backup"
        } else {
            "inc_backup"
        };
        let backup_file_name = format!("{}_{}.json.gz", backup_file_prefix, timestamp);
        let backup_path = backup_dir.join(&backup_file_name);

        if let Some(pool) = app.try_state::<DbPool>() {
            match backup_database_internal(
                None, // Don't emit progress during exit for now, or use a dummy handle
                &*pool,
                backup_path.to_string_lossy().to_string(),
                since,
                true, // use_compression (default for exit)
            )
            .await
            {
                Ok(_msg) => {
                    // println!("[Auto-Backup] Success: {}", msg);
                    let _ = update_last_backup_at(&app, chrono::Local::now().naive_local());
                }
                Err(e) => eprintln!("[Auto-Backup] Failed: {}", e),
            }
        }
    }

    IS_EXITING.store(true, Ordering::Relaxed);
    // Forcefully kill the process at OS level
    std::process::exit(0);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            // Check if configured strictly via config.json
            let app_handle = app.app_handle().clone();
            let db_url = get_db_url(&app_handle).ok();
            let mut is_configured = false;

            if let Some(url) = db_url {
                let pool_res = tauri::async_runtime::block_on(async { init_pool(&url).await });

                if let Ok(pool) = pool_res {
                    app_handle.manage(pool.clone());
                    is_configured = true;
                    // Run database migrations in background thread to avoid blocking main thread
                    tauri::async_runtime::spawn(async move {
                        let _ = db::init_database(&pool).await;
                    });
                }
            }

            app_handle.manage(SetupState {
                is_configured: std::sync::Mutex::new(is_configured),
            });

            // Force window size and center
            if let Some(window) = app.get_webview_window("main") {
                #[cfg(target_os = "windows")]
                {
                    window
                        .with_webview(|webview| {
                            #[cfg(target_os = "windows")]
                            unsafe {
                                use webview2_com::Microsoft::Web::WebView2::Win32::{
                                    ICoreWebView2Controller, ICoreWebView2Settings4,
                                };
                                use windows::core::Interface;

                                if let Ok(controller) =
                                    webview.controller().cast::<ICoreWebView2Controller>()
                                {
                                    if let Ok(core) = controller.CoreWebView2() {
                                        if let Ok(settings) = core.Settings() {
                                            if let Ok(settings4) =
                                                settings.cast::<ICoreWebView2Settings4>()
                                            {
                                                let _ =
                                                    settings4.SetIsGeneralAutofillEnabled(false);
                                                let _ =
                                                    settings4.SetIsPasswordAutosaveEnabled(false);
                                            }
                                        }
                                    }
                                }
                            }
                        })
                        .unwrap_or_default();
                }
            }
            Ok(())
        })
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_app::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if IS_EXITING.load(Ordering::Relaxed) {
                    // Allow close
                } else {
                    api.prevent_close();
                    let _ = window.emit("window_close_requested", ());
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            check_setup_status,
            setup_system,
            greet,
            search_customers_by_name,
            search_customers_by_mobile,
            get_customer,
            create_customer,
            update_customer,
            delete_customer,
            delete_customers_batch,
            create_customer_address,
            update_customer_address,
            get_customer_addresses,
            delete_customer_address,
            set_default_customer_address,
            get_dashboard_stats,
            get_customer_ledger,
            create_ledger_entry,
            update_ledger_entry, // Added
            delete_ledger_entry, // Added
            get_customers_with_debt,
            get_recent_sales,
            get_weekly_sales_data,
            get_top3_products_by_qty,
            get_top_profit_products,
            search_customers_by_date,
            search_dormant_customers,
            check_duplicate_customer,
            search_best_customers,
            update_customer_membership_batch,
            get_sales_by_customer_id,
            create_sale,
            get_product_list,
            get_discontinued_product_names,
            consolidate_products,
            get_user_list,
            create_user,
            update_user,
            delete_user,
            get_company_info,
            save_company_info,
            create_product,
            update_product,
            delete_product,
            get_last_event,
            debug_db_schema,
            create_event,
            get_daily_sales,
            search_sales_by_any,
            search_events_by_name,
            init_db_schema,
            update_product_stock,
            adjust_product_stock, // Added
            convert_stock,        // Added
            get_inventory_logs,   // Added
            get_inventory_forecast_alerts,
            get_shipments_by_status,
            update_sale_status,
            cancel_sale,
            get_sales_by_event_id_and_date_range,
            get_daily_receipts,
            delete_sale,
            update_sale,
            complete_shipment,
            save_general_sales_batch,
            get_customer_sales_history,
            update_event,
            delete_event,
            get_ai_demand_forecast,
            get_all_events, // Added
            verify_admin_password,
            login_user,
            confirm_exit,
            backup_database,
            restore_database,
            reset_database,
            get_experience_programs,
            create_experience_program,
            update_experience_program,
            delete_experience_program,
            get_experience_reservations,
            create_experience_reservation,
            update_experience_reservation,
            delete_experience_reservation,
            update_experience_payment_status,
            update_experience_status,
            get_experience_dashboard_stats,
            get_product_sales_stats,
            get_ten_year_sales_stats,
            get_monthly_sales_by_cohort,
            get_product_10yr_sales_stats,
            get_product_monthly_analysis,
            get_schedules,
            create_schedule,
            update_schedule,
            delete_schedule,
            save_special_sales_batch,
            sales_polars_analysis_v4,
            get_all_time_customer_analysis,
            get_sales_by_region_analysis,
            get_order_value_distribution,
            get_sales_period_analysis,
            get_membership_sales_analysis,
            get_ltv_analysis,
            get_product_associations,
            get_churn_risk_customers,
            get_gemini_api_key_for_ui,
            save_gemini_api_key,
            get_sms_config_for_ui,
            save_sms_config,
            get_naver_client_id_for_ui,
            save_naver_keys,
            open_external_url,
            fetch_naver_search,
            get_ai_marketing_proposal,
            get_ai_detailed_plan,
            get_customer_ai_insight,
            get_rfm_analysis,
            update_customer_level,
            restart_app,
            get_shipping_base_date,
            run_db_maintenance,
            analyze_online_sentiment,
            get_morning_briefing,
            get_ai_repurchase_analysis,
            get_weather_marketing_advice,
            test_gemini_connection,
            create_consultation,
            get_consultations,
            update_consultation,
            delete_consultation,
            parse_business_card_ai,
            save_qr_image,
            generate_qr_code,
            get_upcoming_anniversaries,
            get_claim_customer_count,
            get_claim_targets,
            get_special_care_customers,
            create_sales_claim,
            get_sales_claims,
            process_sales_claim,
            delete_sales_claim,
            update_sales_claim,
            get_consultation_ai_advisor,
            get_sale_detail,
            call_gemini_ai,
            get_daily_sales_stats_by_month,
            send_sms_simulation,
            get_repurchase_candidates,
            get_profit_margin_analysis,
            get_consultation_briefing,
            get_pending_consultations_summary,
            get_ai_consultation_advice,
            get_vendor_list,
            save_vendor,
            delete_vendor,
            get_purchase_list,
            save_purchase,
            delete_purchase,
            get_expense_list,
            save_expense,
            delete_expense,
            get_monthly_pl_report,
            get_cost_breakdown_stats,
            get_vendor_purchase_ranking,
            trigger_auto_backup,
            get_auto_backups,
            restore_database_sql,
            delete_backup,
            check_daily_backup,
            save_external_backup_path,
            get_external_backup_path,
            login,
            change_password,
            get_all_users,
            get_message_templates,
            save_message_templates,
            reset_message_templates,
            check_db_location,
            get_backup_status,
            cancel_backup_restore,
            run_daily_custom_backup,
            get_internal_backup_path,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[tauri::command]
async fn trigger_auto_backup(
    app: tauri::AppHandle,
    state: State<'_, DbPool>,
) -> Result<String, String> {
    if !DB_MODIFIED.load(Ordering::Relaxed) {
        return Ok("No changes".to_string());
    }

    if let Ok(config_dir) = app.path().app_config_dir() {
        let backup_dir = config_dir.join("backups");
        if !backup_dir.exists() {
            let _ = std::fs::create_dir_all(&backup_dir);
        }

        let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S");
        let backup_file_name = format!("auto_backup_{}.json.gz", timestamp);
        let backup_path = backup_dir.join(&backup_file_name);

        match backup_database(
            app.clone(),
            state.clone(),
            backup_path.to_string_lossy().to_string(),
            true, // is_incremental
            true, // use_compression (default)
        )
        .await
        {
            Ok(_) => {
                DB_MODIFIED.store(false, Ordering::Relaxed);

                // --- External Cloud Backup Branch ---
                if let Ok(config_dir) = app.path().app_config_dir() {
                    let config_path = config_dir.join("config.json");
                    if config_path.exists() {
                        if let Ok(content) = std::fs::read_to_string(&config_path) {
                            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                                if let Some(ext_path) =
                                    json.get("external_backup_path").and_then(|v| v.as_str())
                                {
                                    if !ext_path.trim().is_empty() {
                                        let ext_dir = std::path::Path::new(ext_path);
                                        if ext_dir.exists() {
                                            let ext_backup_path = ext_dir.join(backup_file_name);
                                            let _ = backup_database(
                                                app.clone(),
                                                state.clone(),
                                                ext_backup_path.to_string_lossy().to_string(),
                                                true, // is_incremental
                                                true, // use_compression
                                            )
                                            .await;
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
                // ------------------------------------

                if let Ok(entries) = std::fs::read_dir(&backup_dir) {
                    let mut backups: Vec<_> = entries
                        .filter_map(|e| e.ok())
                        .filter(|e| {
                            e.file_name().to_string_lossy().starts_with("auto_backup_")
                                && e.file_name().to_string_lossy().ends_with(".sql")
                        })
                        .collect();
                    backups.sort_by_key(|b| std::cmp::Reverse(b.file_name()));
                    for backup in backups.iter().skip(30) {
                        let _ = std::fs::remove_file(backup.path());
                    }
                }
                Ok(format!("Backup created: {:?}", backup_path))
            }
            Err(e) => Err(format!("Backup failed: {}", e)),
        }
    } else {
        Err("Config dir not found".to_string())
    }
}

#[derive(Debug, serde::Serialize, serde::Deserialize)]
pub struct AutoBackupItem {
    pub name: String,
    pub path: String,
    pub created_at: String,
    pub timestamp: i64,
    pub backup_type: String, // "자동" or "일일"
}

#[tauri::command]
async fn restore_database_sql(state: State<'_, DbPool>, path: String) -> Result<String, String> {
    let sql = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;

    let mut conn = state.acquire().await.map_err(|e| e.to_string())?;
    sqlx::query(&sql)
        .execute(&mut *conn)
        .await
        .map_err(|e| e.to_string())?;

    Ok("복구가 완료되었습니다. 서비스를 다시 시작해 주세요.".to_string())
}

#[tauri::command]
async fn delete_backup(path: String) -> Result<(), String> {
    std::fs::remove_file(path).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn get_auto_backups(app: tauri::AppHandle) -> Result<Vec<AutoBackupItem>, String> {
    let mut list = Vec::new();

    if let Ok(config_dir) = app.path().app_config_dir() {
        // 1. Auto Backups
        let backup_dir = config_dir.join("backups");
        if backup_dir.exists() {
            if let Ok(entries) = std::fs::read_dir(&backup_dir) {
                for entry in entries.filter_map(|e| e.ok()) {
                    let fname = entry.file_name().to_string_lossy().to_string();
                    if fname.starts_with("auto_backup_")
                        && (fname.ends_with(".sql") || fname.ends_with(".gz"))
                    {
                        if let Ok(metadata) = entry.metadata() {
                            if let Ok(modified) = metadata.modified() {
                                let datetime: chrono::DateTime<chrono::Local> = modified.into();
                                format_and_push(
                                    &mut list,
                                    entry.path(),
                                    datetime,
                                    "자동".to_string(),
                                );
                            }
                        }
                    }
                }
            }
        }

        // 2. Daily Backups
        let daily_dir = config_dir.join("daily_backups");
        if daily_dir.exists() {
            if let Ok(entries) = std::fs::read_dir(&daily_dir) {
                for entry in entries.filter_map(|e| e.ok()) {
                    let fname = entry.file_name().to_string_lossy().to_string();
                    if fname.starts_with("daily_backup_")
                        && (fname.ends_with(".sql") || fname.ends_with(".gz"))
                    {
                        if let Ok(metadata) = entry.metadata() {
                            if let Ok(modified) = metadata.modified() {
                                let datetime: chrono::DateTime<chrono::Local> = modified.into();
                                format_and_push(
                                    &mut list,
                                    entry.path(),
                                    datetime,
                                    "일일".to_string(),
                                );
                            }
                        }
                    }
                }
            }
        }
    }

    // Sort desc by timestamp
    list.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
    Ok(list)
}

#[tauri::command]
async fn get_internal_backup_path(app: tauri::AppHandle) -> Result<String, String> {
    if let Ok(config_dir) = app.path().app_config_dir() {
        let daily_dir = config_dir.join("daily_backups");
        return Ok(daily_dir.to_string_lossy().to_string());
    }
    Err("Config dir not found".to_string())
}

fn format_and_push(
    list: &mut Vec<AutoBackupItem>,
    path: std::path::PathBuf,
    datetime: chrono::DateTime<chrono::Local>,
    b_type: String,
) {
    let now = chrono::Local::now();
    let diff = now.signed_duration_since(datetime);
    let ago = if diff.num_seconds() < 60 {
        format!("{}초 전", diff.num_seconds())
    } else if diff.num_minutes() < 60 {
        format!("{}분 전", diff.num_minutes())
    } else if diff.num_hours() < 24 {
        format!("{}시간 전", diff.num_hours())
    } else {
        format!("{}일 전", diff.num_days())
    };

    let formatted = format!("{} ({})", datetime.format("%Y-%m-%d %H:%M:%S"), ago);

    list.push(AutoBackupItem {
        name: path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string(),
        path: path.to_string_lossy().to_string(),
        created_at: formatted,
        timestamp: datetime.timestamp(),
        backup_type: b_type,
    });
}

#[tauri::command]
async fn run_daily_custom_backup(
    app: tauri::AppHandle,
    state: State<'_, DbPool>,
    is_incremental: bool,
    use_compression: bool,
) -> Result<String, String> {
    run_backup_logic(app, state, is_incremental, use_compression, true).await
}

#[tauri::command]
async fn check_daily_backup(
    app: tauri::AppHandle,
    state: State<'_, DbPool>,
) -> Result<String, String> {
    run_backup_logic(app, state, true, true, false).await
}

async fn run_backup_logic(
    app: tauri::AppHandle,
    state: State<'_, DbPool>,
    is_incremental: bool,
    use_compression: bool,
    force: bool,
) -> Result<String, String> {
    if let Ok(config_dir) = app.path().app_config_dir() {
        let daily_dir = config_dir.join("daily_backups");
        if !daily_dir.exists() {
            let _ = std::fs::create_dir_all(&daily_dir);
        }

        let today = chrono::Local::now().format("%Y%m%d").to_string();
        let daily_extension = if use_compression { "json.gz" } else { "json" };
        let daily_filename = format!("daily_backup_{}.{}", today, daily_extension);
        let daily_path = daily_dir.join(&daily_filename);

        // Run if forced (manual button) OR if file doesn't exist (auto)
        if force || !daily_path.exists() {
            match backup_database(
                app.clone(),
                state.clone(),
                daily_path.to_string_lossy().to_string(),
                is_incremental,
                use_compression,
            )
            .await
            {
                Ok(msg) => {
                    // --- External Cloud Backup Branch ---
                    let config_path = config_dir.join("config.json");
                    if let Ok(content) = std::fs::read_to_string(&config_path) {
                        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                            if let Some(ext_path) =
                                json.get("external_backup_path").and_then(|v| v.as_str())
                            {
                                if !ext_path.trim().is_empty() {
                                    let ext_dir = std::path::Path::new(ext_path);
                                    if ext_dir.exists() {
                                        let ext_daily_dir = ext_dir.join("daily");
                                        let _ = std::fs::create_dir_all(&ext_daily_dir);
                                        let ext_backup_path = ext_daily_dir.join(&daily_filename);
                                        let _ = std::fs::copy(&daily_path, ext_backup_path);
                                    }
                                }
                            }
                        }
                    }

                    // Cleanup old daily backups (Keep 90 days)
                    if let Ok(entries) = std::fs::read_dir(&daily_dir) {
                        let mut backups: Vec<_> = entries
                            .filter_map(|e| e.ok())
                            .filter(|e| {
                                let fname_os = e.file_name();
                                let fname = fname_os.to_string_lossy();
                                fname.starts_with("daily_backup_")
                                    && (fname.ends_with(".sql") || fname.ends_with(".gz"))
                            })
                            .collect();

                        backups.sort_by_key(|b| b.file_name());

                        if backups.len() > 90 {
                            let to_delete = backups.len() - 90;
                            for b in backups.iter().take(to_delete) {
                                let _ = std::fs::remove_file(b.path());
                            }
                        }
                    }
                    return Ok(msg);
                }
                Err(e) => return Err(format!("Daily backup failed: {}", e)),
            }
        }
        Ok("Today's backup already exists".to_string())
    } else {
        Err("Config dir not found".to_string())
    }
}

// BackupData removed as it is no longer used in streaming backup.

#[derive(Debug, serde::Serialize, serde::Deserialize, sqlx::FromRow)]
struct DeletionLog {
    pub table_name: String,
    pub record_id: String,
    pub deleted_at: Option<NaiveDateTime>,
}

// Backup-specific Purchase struct (without JOIN columns)
#[derive(Debug, serde::Serialize, serde::Deserialize, sqlx::FromRow)]
struct PurchaseBackup {
    pub purchase_id: Option<i32>,
    pub vendor_id: Option<i32>,
    pub purchase_date: Option<NaiveDate>,
    pub item_name: String,
    pub specification: Option<String>,
    pub quantity: i32,
    pub unit_price: i32,
    pub total_amount: i32,
    pub payment_status: Option<String>,
    pub memo: Option<String>,
    pub inventory_synced: Option<bool>,
    pub material_item_id: Option<i32>,
    pub created_at: Option<NaiveDateTime>,
    pub updated_at: Option<NaiveDateTime>,
}

// DB Location Information
#[derive(Debug, serde::Serialize)]
struct DbLocationInfo {
    is_local: bool,
    is_db_server: bool,
    can_backup: bool,
    db_host: String,
    message: String,
}

#[tauri::command]
async fn check_db_location(state: State<'_, DbPool>) -> Result<DbLocationInfo, String> {
    let pool = &*state;

    // 1. Query PostgreSQL for server address
    let server_addr: Option<(Option<String>,)> = sqlx::query_as("SELECT inet_server_addr()::text")
        .fetch_optional(pool)
        .await
        .map_err(|e| format!("Failed to query server address: {}", e))?;

    let db_host = server_addr
        .and_then(|r| r.0)
        .unwrap_or_else(|| "localhost".to_string());

    println!("[DB Location] db_host: {}", db_host);

    // 2. Check if it's a local connection
    let is_local = db_host.is_empty()
        || db_host == "localhost"
        || db_host == "127.0.0.1"
        || db_host == "::1"
        || db_host.starts_with("192.168.") && db_host == get_local_ip().unwrap_or_default();

    println!("[DB Location] is_local: {}", is_local);

    // 3. Determine if this is the DB server (Simply based on connectivity for now)
    let is_db_server = is_local;

    println!(
        "[DB Location] is_db_server: {}, host: {}",
        is_db_server, db_host
    );

    // 4. Create message (Now allowing backup from all locations)
    let message = if is_db_server {
        "이 PC는 메인 DB 서버(또는 로컬 접속)입니다.".to_string()
    } else {
        format!(
            "원격 DB 서버({})에 연결되어 있습니다. 현재 PC에서 자유롭게 백업/복구가 가능합니다.",
            db_host
        )
    };

    Ok(DbLocationInfo {
        is_local,
        is_db_server,
        can_backup: true, // ALWAYS TRUE to unlock for all computers
        db_host,
        message,
    })
}

// Helper function to get local IP
fn get_local_ip() -> Option<String> {
    #[cfg(target_os = "windows")]
    {
        if let Ok(output) = std::process::Command::new("ipconfig").output() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            for line in stdout.lines() {
                if line.contains("IPv4") && line.contains("192.168.") {
                    if let Some(ip) = line.split(':').nth(1) {
                        return Some(ip.trim().to_string());
                    }
                }
            }
        }
    }
    None
}

fn format_number(n: i64) -> String {
    let s = n.abs().to_string();
    let mut result = String::new();
    let chars: Vec<char> = s.chars().collect();
    let len = chars.len();
    for (i, &c) in chars.iter().enumerate() {
        if i > 0 && (len - i) % 3 == 0 {
            result.push(',');
        }
        result.push(c);
    }
    if n < 0 {
        format!("-{}", result)
    } else {
        result
    }
}

#[tauri::command]
async fn backup_database(
    app: tauri::AppHandle,
    state: State<'_, DbPool>,
    path: String,
    is_incremental: bool,
    use_compression: bool,
) -> Result<String, String> {
    let since = if is_incremental {
        get_last_backup_at(&app)
    } else {
        None
    };

    let result =
        backup_database_internal(Some(app.clone()), &*state, path, since, use_compression).await?;

    // Update last backup time on success
    let _ = update_last_backup_at(&app, chrono::Local::now().naive_local());

    Ok(result)
}

fn get_last_backup_at(app: &tauri::AppHandle) -> Option<chrono::NaiveDateTime> {
    if let Ok(config_dir) = app.path().app_config_dir() {
        let config_path = config_dir.join("config.json");
        if config_path.exists() {
            if let Ok(content) = std::fs::read_to_string(&config_path) {
                if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                    if let Some(ts) = json.get("last_backup_at").and_then(|v| v.as_str()) {
                        return chrono::NaiveDateTime::parse_from_str(ts, "%Y-%m-%dT%H:%M:%S").ok();
                    }
                }
            }
        }
    }
    None
}

fn update_last_backup_at(app: &tauri::AppHandle, ts: chrono::NaiveDateTime) -> Result<(), String> {
    let config_dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    let config_path = config_dir.join("config.json");
    let mut config_data = if config_path.exists() {
        let content = std::fs::read_to_string(&config_path).map_err(|e| e.to_string())?;
        serde_json::from_str::<serde_json::Value>(&content).unwrap_or(serde_json::json!({}))
    } else {
        serde_json::json!({})
    };
    config_data["last_backup_at"] = serde_json::json!(ts.format("%Y-%m-%dT%H:%M:%S").to_string());
    let content = serde_json::to_string_pretty(&config_data).map_err(|e| e.to_string())?;
    std::fs::write(&config_path, content).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn get_backup_status(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let last_at = get_last_backup_at(&app);
    Ok(serde_json::json!({
        "last_backup_at": last_at.map(|ts| ts.format("%Y-%m-%dT%H:%M:%S").to_string()),
        "day_of_week": chrono::Local::now().weekday().to_string(),
        "is_friday": chrono::Local::now().weekday() == chrono::Weekday::Fri
    }))
}

async fn backup_database_internal(
    app: Option<tauri::AppHandle>,
    pool: &DbPool,
    path: String,
    since: Option<chrono::NaiveDateTime>,
    use_compression: bool,
) -> Result<String, String> {
    println!("[Backup] Starting database backup to: {}", path);

    let emit_progress = |processed: i64, total: i64, message: &str| {
        if let Some(ref handle) = app {
            let progress = if total > 0 {
                ((processed as f64 / total as f64) * 100.0) as i32
            } else {
                0
            };
            let _ = handle.emit(
                "backup-progress",
                serde_json::json!({
                    "progress": progress,
                    "message": message,
                    "processed": processed,
                    "total": total
                }),
            );
        }
    };

    // ... (logic remains same but using emit_progress wrapper and pool argument)
    BACKUP_CANCELLED.store(false, Ordering::Relaxed);
    emit_progress(0, 1, "데이터 개수 확인 중...");

    // Count records actually needing backup
    let count_query = |table: &str| {
        if let Some(s) = since {
            format!(
                "SELECT COUNT(*) FROM {} WHERE updated_at > '{}'",
                table,
                s.format("%Y-%m-%d %H:%M:%S")
            )
        } else {
            format!("SELECT COUNT(*) FROM {}", table)
        }
    };

    let count_users: (i64,) = sqlx::query_as(&count_query("users"))
        .fetch_one(pool)
        .await
        .map_err(|e| e.to_string())?;
    let count_products: (i64,) = sqlx::query_as(&count_query("products"))
        .fetch_one(pool)
        .await
        .map_err(|e| e.to_string())?;
    let count_customers: (i64,) = sqlx::query_as(&count_query("customers"))
        .fetch_one(pool)
        .await
        .map_err(|e| e.to_string())?;
    let count_addresses: (i64,) = sqlx::query_as(&count_query("customer_addresses"))
        .fetch_one(pool)
        .await
        .map_err(|e| e.to_string())?;
    let count_sales: (i64,) = sqlx::query_as(&count_query("sales"))
        .fetch_one(pool)
        .await
        .map_err(|e| e.to_string())?;
    let count_events: (i64,) = sqlx::query_as(&count_query("event"))
        .fetch_one(pool)
        .await
        .map_err(|e| e.to_string())?;
    let count_schedules: (i64,) = sqlx::query_as(&count_query("schedules"))
        .fetch_one(pool)
        .await
        .map_err(|e| e.to_string())?;
    let count_company: (i64,) = sqlx::query_as(&count_query("company_info"))
        .fetch_one(pool)
        .await
        .map_err(|e| e.to_string())?;
    let count_expenses: (i64,) = sqlx::query_as(&count_query("expenses"))
        .fetch_one(pool)
        .await
        .map_err(|e| e.to_string())?;
    let count_purchases: (i64,) = sqlx::query_as(&count_query("purchases"))
        .fetch_one(pool)
        .await
        .map_err(|e| e.to_string())?;
    let count_consultations: (i64,) = sqlx::query_as(&count_query("consultations"))
        .fetch_one(pool)
        .await
        .map_err(|e| e.to_string())?;
    let count_claims: (i64,) = sqlx::query_as(&count_query("sales_claims"))
        .fetch_one(pool)
        .await
        .map_err(|e| e.to_string())?;
    let count_inventory: (i64,) = sqlx::query_as(&count_query("inventory_logs"))
        .fetch_one(pool)
        .await
        .map_err(|e| e.to_string())?;
    let count_deletions: (i64,) = if let Some(s) = since {
        sqlx::query_as(&format!(
            "SELECT COUNT(*) FROM deletion_log WHERE deleted_at > '{}'",
            s.format("%Y-%m-%d %H:%M:%S")
        ))
        .fetch_one(pool)
        .await
        .map_err(|e| e.to_string())?
    } else {
        (0,) // Full backup doesn't need deletion logs as it truncates everything
    };

    let total_records = count_users.0
        + count_products.0
        + count_customers.0
        + count_addresses.0
        + count_sales.0
        + count_events.0
        + count_schedules.0
        + count_company.0
        + count_expenses.0
        + count_purchases.0
        + count_consultations.0
        + count_claims.0
        + count_inventory.0
        + count_deletions.0;

    let mut processed = 0i64;

    let file = std::fs::File::create(&path).map_err(|e| format!("Failed to create file: {}", e))?;

    let mut writer: BufWriter<Box<dyn std::io::Write + Send>> = if use_compression {
        let encoder = GzEncoder::new(file, Compression::fast());
        BufWriter::with_capacity(1024 * 1024, Box::new(encoder))
    } else {
        BufWriter::with_capacity(1024 * 1024, Box::new(file))
    };

    writeln!(writer, "{{").map_err(|e| e.to_string())?;
    writeln!(writer, "  \"version\": \"2.2\",").map_err(|e| e.to_string())?;
    writeln!(writer, "  \"total_records\": {},", total_records).map_err(|e| e.to_string())?;
    writeln!(
        writer,
        "  \"timestamp\": \"{}\",",
        chrono::Local::now().to_rfc3339()
    )
    .map_err(|e| e.to_string())?;
    writeln!(writer, "  \"is_incremental\": {},", since.is_some()).map_err(|e| e.to_string())?;
    if let Some(s) = since {
        writeln!(
            writer,
            "  \"since\": \"{}\",",
            s.format("%Y-%m-%dT%H:%M:%S")
        )
        .map_err(|e| e.to_string())?;
    } else {
        writeln!(writer, "  \"since\": null,").map_err(|e| e.to_string())?;
    }

    macro_rules! batch_table_internal {
        ($table:expr, $type:ty, $query:expr, $field:expr, $msg:expr, $count:expr, $time_col:expr) => {{
            println!("[Backup] Start: Table {}", $table);
            emit_progress(processed, total_records, $msg);
            write!(writer, "  \"{}\": [", $field).map_err(|e| e.to_string())?;
            let mut first_record = true;
            let base_query = if let Some(s) = since {
                format!(
                    "{} WHERE {} > '{}'",
                    $query,
                    $time_col,
                    s.format("%Y-%m-%d %H:%M:%S")
                )
            } else {
                $query.to_string()
            };
            let mut rows = sqlx::query_as::<_, $type>(&base_query).fetch(pool);
            while let Some(record) = rows.next().await {
                if BACKUP_CANCELLED.load(Ordering::Relaxed) {
                    println!("[Backup] CANCELLED during table {}", $table);
                    return Err("사용자에 의해 백업이 중단되었습니다.".to_string());
                }
                let record = record.map_err(|e| format!("Fetch from {} failed: {}", $table, e))?;

                if !first_record {
                    write!(writer, ",\n").map_err(|e| e.to_string())?;
                }
                first_record = false;

                write!(writer, "    ").map_err(|e| e.to_string())?;
                serde_json::to_writer(&mut writer, &record).map_err(|e| e.to_string())?;
                processed += 1;

                if processed % 10000 == 0 {
                    emit_progress(
                        processed,
                        total_records,
                        &format!(
                            "{} ({}/{})",
                            $msg,
                            format_number(processed),
                            format_number(total_records)
                        ),
                    );
                }
            }
            emit_progress(processed, total_records, $msg);
            writeln!(writer, "\n  ],").map_err(|e| e.to_string())?;
            println!("[Backup] End: Table {} (Records: {})", $table, $count);
        }};
    }

    batch_table_internal!(
        "users",
        User,
        "SELECT * FROM users",
        "users",
        "사용자 정보 백업 중",
        count_users.0,
        "updated_at"
    );
    batch_table_internal!(
        "products",
        Product,
        "SELECT * FROM products",
        "products",
        "상품 정보 백업 중",
        count_products.0,
        "updated_at"
    );
    batch_table_internal!(
        "customers",
        Customer,
        "SELECT * FROM customers",
        "customers",
        "고객 정보 백업 중",
        count_customers.0,
        "updated_at"
    );
    batch_table_internal!(
        "customer_addresses",
        CustomerAddress,
        "SELECT * FROM customer_addresses",
        "customer_addresses",
        "배송지 정보 백업 중",
        count_addresses.0,
        "updated_at"
    );
    batch_table_internal!(
        "sales",
        Sales,
        "SELECT * FROM sales",
        "sales",
        "판매 내역 백업 중",
        count_sales.0,
        "updated_at"
    );
    batch_table_internal!(
        "event",
        Event,
        "SELECT * FROM event",
        "events",
        "행사 정보 백업 중",
        count_events.0,
        "updated_at"
    );
    batch_table_internal!(
        "schedules",
        Schedule,
        "SELECT * FROM schedules",
        "schedules",
        "일정 정보 백업 중",
        count_schedules.0,
        "updated_at"
    );
    batch_table_internal!(
        "company_info",
        CompanyInfo,
        "SELECT * FROM company_info",
        "company_info",
        "회사 정보 백업 중",
        count_company.0,
        "updated_at"
    );
    batch_table_internal!(
        "expenses",
        Expense,
        "SELECT * FROM expenses",
        "expenses",
        "지출 내역 백업 중",
        count_expenses.0,
        "updated_at"
    );
    batch_table_internal!(
        "purchases",
        PurchaseBackup,
        "SELECT * FROM purchases",
        "purchases",
        "구매 내역 백업 중",
        count_purchases.0,
        "updated_at"
    );
    batch_table_internal!(
        "consultations",
        Consultation,
        "SELECT * FROM consultations",
        "consultations",
        "상담 내역 백업 중",
        count_consultations.0,
        "updated_at"
    );
    batch_table_internal!(
        "sales_claims",
        SalesClaim,
        "SELECT * FROM sales_claims",
        "sales_claims",
        "판매 클레임 백업 중",
        count_claims.0,
        "updated_at"
    );
    batch_table_internal!(
        "inventory_logs",
        InventoryLog,
        "SELECT * FROM inventory_logs",
        "inventory_logs",
        "재고 로그 백업 중",
        count_inventory.0,
        "created_at"
    );

    // Deletion Logs - Only for Incremental
    if since.is_some() {
        batch_table_internal!(
            "deletion_log",
            DeletionLog,
            "SELECT table_name, record_id, deleted_at FROM deletion_log",
            "deletions",
            "삭제 이력 백업 중",
            count_deletions.0,
            "deleted_at"
        );
    } else {
        write!(writer, "  \"deletions\": []").map_err(|e| e.to_string())?;
    }

    writeln!(writer, "  \"backup_complete\": true").map_err(|e| e.to_string())?;
    writeln!(writer, "}}").map_err(|e| e.to_string())?;

    // Flush the buffer and finish compression if needed
    let inner = writer
        .into_inner()
        .map_err(|e| format!("Failed to flush buffer: {}", e))?;

    // We can't easily call .finish() on Box<dyn Write>, but we can handle it earlier
    // or just let it drop. For GzEncoder, it should flush on drop but .finish() is better.
    // However, our Boxed writer hides the .finish() method.
    // Let's use as_any or better, use a local variable for the encoder if possible.
    // For now, dropping the writer is usually enough for BufWriter + File/Encoder.
    drop(inner);

    emit_progress(total_records, total_records, "백업 완료!");
    let success_msg = format!(
        "백업이 완료되었습니다: {} ({} 레코드)",
        path,
        format_number(total_records)
    );
    println!("[Backup] {}", success_msg);
    Ok(success_msg)
}

#[tauri::command]
async fn restore_database(
    app: tauri::AppHandle,
    state: State<'_, DbPool>,
    path: String,
) -> Result<String, String> {
    let pool = &*state;

    let emit_progress = |processed: i64, total: i64, message: &str| {
        let progress = if total > 0 {
            ((processed as f64 / total as f64) * 100.0).clamp(0.0, 99.0) as i32
        } else {
            0
        };
        let _ = app.emit(
            "restore-progress",
            serde_json::json!({
                "progress": progress,
                "message": message,
                "processed": processed,
                "total": if total > 0 { total } else { processed + 1000 }
            }),
        );
    };

    // 1. Detect Incremental / Full and Total Filesize
    let (is_incremental, total_bytes, is_gzipped) = {
        let mut magic = [0u8; 2];
        let mut f = std::fs::File::open(&path).map_err(|e| e.to_string())?;
        let is_gzipped_inner = f.read_exact(&mut magic).is_ok() && magic == [0x1f, 0x8b];
        let file_size = std::fs::File::open(&path)
            .map_err(|e| e.to_string())?
            .metadata()
            .map_err(|e| e.to_string())?
            .len();

        // Peek for incremental flag
        let reader: Box<dyn std::io::Read> = if is_gzipped_inner {
            Box::new(GzDecoder::new(
                std::fs::File::open(&path).map_err(|e| e.to_string())?,
            ))
        } else {
            Box::new(std::fs::File::open(&path).map_err(|e| e.to_string())?)
        };
        let mut r = std::io::BufReader::new(reader);
        let mut header_buf = vec![0u8; 4096];
        let n = r.read(&mut header_buf).unwrap_or(0);
        let s = String::from_utf8_lossy(&header_buf[..n]);
        let inc = s.contains("\"is_incremental\": true");

        println!(
            "[Restore] Header analysis: is_incremental={}, total_file_size={}",
            inc, file_size
        );
        (inc, file_size, is_gzipped_inner)
    };

    let start_time = chrono::Local::now().timestamp_millis();

    let mut tx = pool.begin().await.map_err(|e| {
        println!("[Restore] Transaction start failed: {}", e);
        e.to_string()
    })?;

    // Set short lock timeout
    let _ = sqlx::query("SET lock_timeout = '10s'")
        .execute(&mut *tx)
        .await;

    if !is_incremental {
        if BACKUP_CANCELLED.load(Ordering::Relaxed) {
            return Err("복구가 취소되었습니다.".to_string());
        }

        // 1.1 Force disconnect other connections to acquire exclusive lock for TRUNCATE
        emit_progress(
            0,
            total_bytes as i64,
            "다른 연결 종료 중 (배타적 권한 획득)...",
        );
        let _ = sqlx::query(
            "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid()"
        )
        .execute(&mut *tx)
        .await;

        emit_progress(0, total_bytes as i64, "기존 데이터 삭제 중 (전체 복구)...");
        println!("[Restore] Truncating tables for full restore...");
        sqlx::query("TRUNCATE TABLE users, products, customers, customer_addresses, sales, event, schedules, company_info, expenses, purchases, consultations, sales_claims, inventory_logs RESTART IDENTITY CASCADE")
            .execute(&mut *tx)
            .await
            .map_err(|e| {
                println!("[Restore] Truncate failed: {}", e);
                format!("데이터 삭제 실패: 다른 사용자가 데이터를 사용 중입니다. 모든 창을 닫고 다시 시도해 주세요. (에러: {})", e)
            })?;
    }

    // 2. Open Stream with Byte Counter
    struct CountingReader<R: Read> {
        inner: R,
        count: std::sync::Arc<std::sync::atomic::AtomicU64>,
    }
    impl<R: Read> Read for CountingReader<R> {
        fn read(&mut self, buf: &mut [u8]) -> std::io::Result<usize> {
            let result = self.inner.read(buf);
            if let Ok(n) = result {
                self.count.fetch_add(n as u64, Ordering::Relaxed);
            }
            result
        }
    }

    let byte_count = std::sync::Arc::new(std::sync::atomic::AtomicU64::new(0));
    let file = std::fs::File::open(&path).map_err(|e| e.to_string())?;

    let base_reader = CountingReader {
        inner: file,
        count: byte_count.clone(),
    };

    let reader: Box<dyn std::io::Read + Send> = if is_gzipped {
        Box::new(GzDecoder::new(base_reader))
    } else {
        Box::new(base_reader)
    };
    let mut reader = std::io::BufReader::with_capacity(2 * 1024 * 1024, reader);

    let mut processed = 0i64;

    macro_rules! restore_table {
        ($marker:expr, $type:ty, $msg:expr, $item:ident, $tx:ident, $logic:block) => {{
            if BACKUP_CANCELLED.load(Ordering::Relaxed) {
                return Err("복구가 취소되었습니다.".to_string());
            }

            let mut current_bytes = byte_count.load(Ordering::Relaxed);
            emit_progress(
                current_bytes as i64,
                total_bytes as i64,
                &format!("{} 찾는 중...", $msg),
            );

            let target1 = format!("\"{}\": [", $marker);
            let target2 = if $marker.ends_with('s') {
                format!("\"{}\": [", &$marker[..$marker.len() - 1])
            } else {
                format!("\"{}\"s: [", $marker)
            };

            let mut found = false;
            let mut line = String::new();
            let mut search_count = 0;

            // 1. Search for marker line
            while !found {
                search_count += 1;
                if search_count % 500 == 0 {
                    if BACKUP_CANCELLED.load(Ordering::Relaxed) {
                        return Err("복구가 취소되었습니다.".to_string());
                    }
                    current_bytes = byte_count.load(Ordering::Relaxed);
                    emit_progress(
                        current_bytes as i64,
                        total_bytes as i64,
                        &format!("{} 분석 중...", $msg),
                    );
                }
                line.clear();
                if reader.read_line(&mut line).unwrap_or(0) == 0 { break; }
                let trimmed_line = line.trim();
                // Check if line contains start marker
                if trimmed_line.contains(&target1) || trimmed_line.contains(&target2) {
                    found = true;
                    println!("[Restore] Table '{}' start found.", $marker);

                    // If line contains more than just the marker, we need to process the rest
                    // But our backup puts results on separate lines or follows it.
                    // To be safe, if there's a '{' after the marker on the same line,
                    // we should handle it. However, read_line handles the \n.
                }
            }

            if found {
                let mut record_count = 0;
                loop {
                    line.clear();
                    if reader.read_line(&mut line).unwrap_or(0) == 0 { break; }
                    let trimmed = line.trim();
                    if trimmed.is_empty() || trimmed == "," || trimmed == "[" { continue; }

                    // Critical: if we find the end of the array ']', stop this table
                    if trimmed.starts_with(']') {
                        println!("[Restore] Table '{}' end found. (Records: {})", $marker, record_count);
                        break;
                    }

                    if BACKUP_CANCELLED.load(Ordering::Relaxed) {
                        return Err("복구가 취소되었습니다.".to_string());
                    }

                    // Clean the line for JSON parsing (remove trailing/leading commas)
                    let clean = trimmed.trim_start_matches(',').trim_end_matches(',');
                    if clean.is_empty() || clean == "{" || clean == "}" { continue; }

                    let item_res: Result<$type, _> = serde_json::from_str(clean);
                    let $item = match item_res {
                        Ok(v) => v,
                        Err(e) => {
                            // If it's just the end brace of the main object, it might be the end of file
                            if clean == "}" { break; }
                            println!("[Restore] JSON Error in {}: {}. Line: {}", $marker, e, clean);
                            return Err(format!("데이터 분석 오류 ({}): {}", $marker, e));
                        }
                    };

                    let $tx = &mut tx;
                    $logic;

                    record_count += 1;
                    processed += 1;
                    if record_count % 10000 == 0 {
                        current_bytes = byte_count.load(Ordering::Relaxed);
                        let _ = app.emit(
                            "restore-progress",
                            serde_json::json!({
                                "progress": ((current_bytes as f64 / total_bytes as f64) * 100.0).clamp(0.0, 99.0) as i32,
                                "message": format!("{} ({}건 복구 완료)", $msg, format_number(record_count)),
                                "processed": current_bytes,
                                "total": total_bytes,
                                "startTime": start_time
                            }),
                        );
                    }
                }
                println!("[Restore] Table '{}' restoration finished.", $marker);
            }
        }};
    }

    // USERS
    restore_table!("users", User, "사용자 정보 복구 중", u, t, {
        sqlx::query("INSERT INTO users (id, username, password_hash, role, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (username) DO UPDATE SET password_hash=EXCLUDED.password_hash, updated_at=EXCLUDED.updated_at")
            .bind(u.id).bind(u.username).bind(u.password_hash).bind(u.role).bind(u.created_at).bind(u.updated_at)
            .execute(&mut **t).await.map_err(|e| e.to_string())?;
    });

    // PRODUCTS
    restore_table!("products", Product, "상품 정보 복구 중", p, t, {
        sqlx::query("INSERT INTO products (product_id, product_name, specification, unit_price, stock_quantity, safety_stock, cost_price, material_id, material_ratio, item_type, updated_at) 
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) 
             ON CONFLICT (product_id) DO UPDATE SET product_name=EXCLUDED.product_name, updated_at=EXCLUDED.updated_at")
            .bind(p.product_id).bind(p.product_name).bind(p.specification).bind(p.unit_price).bind(p.stock_quantity).bind(p.safety_stock).bind(p.cost_price).bind(p.material_id).bind(p.material_ratio).bind(p.item_type).bind(p.updated_at)
            .execute(&mut **t).await.map_err(|e| e.to_string())?;
    });

    // CUSTOMERS
    restore_table!("customers", Customer, "고객 정보 복구 중", c, t, {
        sqlx::query("INSERT INTO customers (customer_id, customer_name, mobile_number, membership_level, phone_number, email, zip_code, address_primary, address_detail, anniversary_date, anniversary_type, marketing_consent, acquisition_channel, pref_product_type, pref_package_type, family_type, health_concern, sub_interest, purchase_cycle, memo, current_balance, join_date, created_at, updated_at) 
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24) 
             ON CONFLICT (customer_id) DO UPDATE SET customer_name=EXCLUDED.customer_name, updated_at=EXCLUDED.updated_at")
            .bind(c.customer_id).bind(c.customer_name).bind(c.mobile_number).bind(c.membership_level).bind(c.phone_number).bind(c.email).bind(c.zip_code).bind(c.address_primary).bind(c.address_detail).bind(c.anniversary_date).bind(c.anniversary_type).bind(c.marketing_consent).bind(c.acquisition_channel).bind(c.pref_product_type).bind(c.pref_package_type).bind(c.family_type).bind(c.health_concern).bind(c.sub_interest).bind(c.purchase_cycle).bind(c.memo).bind(c.current_balance).bind(c.join_date).bind(c.created_at).bind(c.updated_at)
            .execute(&mut **t).await.map_err(|e| e.to_string())?;
    });

    // ADDRESSES
    restore_table!(
        "customer_addresses",
        CustomerAddress,
        "배송지 정보 복구 중",
        a,
        t,
        {
            sqlx::query("INSERT INTO customer_addresses (address_id, customer_id, address_alias, recipient_name, mobile_number, zip_code, address_primary, address_detail, is_default, shipping_memo, created_at, updated_at) 
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) 
             ON CONFLICT (address_id) DO UPDATE SET address_primary=EXCLUDED.address_primary, updated_at=EXCLUDED.updated_at")
            .bind(a.address_id).bind(a.customer_id).bind(a.address_alias).bind(a.recipient_name).bind(a.mobile_number).bind(a.zip_code).bind(a.address_primary).bind(a.address_detail).bind(a.is_default).bind(a.shipping_memo).bind(a.created_at).bind(a.updated_at)
            .execute(&mut **t).await.map_err(|e| e.to_string())?;
        }
    );

    // SALES
    restore_table!("sales", Sales, "판매 내역 복구 중", s, t, {
        sqlx::query("INSERT INTO sales (sales_id, customer_id, status, order_date, product_name, specification, unit_price, quantity, total_amount, discount_rate, courier_name, tracking_number, memo, shipping_name, shipping_zip_code, shipping_address_primary, shipping_address_detail, shipping_mobile_number, shipping_date, paid_amount, payment_status, updated_at) 
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22) 
             ON CONFLICT (sales_id) DO UPDATE SET status=EXCLUDED.status, updated_at=EXCLUDED.updated_at")
            .bind(&s.sales_id).bind(&s.customer_id).bind(&s.status).bind(s.order_date).bind(&s.product_name).bind(&s.specification).bind(s.unit_price).bind(s.quantity).bind(s.total_amount).bind(s.discount_rate).bind(&s.courier_name).bind(&s.tracking_number).bind(&s.memo).bind(&s.shipping_name).bind(&s.shipping_zip_code).bind(&s.shipping_address_primary).bind(&s.shipping_address_detail).bind(&s.shipping_mobile_number).bind(s.shipping_date).bind(s.paid_amount).bind(&s.payment_status).bind(s.updated_at)
            .execute(&mut **t).await.map_err(|e| e.to_string())?;
    });

    // EVENTS
    restore_table!("events", Event, "행사 정보 복구 중", e, t, {
        sqlx::query("INSERT INTO event (event_id, event_name, organizer, manager_name, manager_contact, location_address, location_detail, start_date, end_date, memo, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT (event_id) DO UPDATE SET event_name=EXCLUDED.event_name, updated_at=EXCLUDED.updated_at")
            .bind(e.event_id).bind(e.event_name).bind(e.organizer).bind(e.manager_name).bind(e.manager_contact).bind(e.location_address).bind(e.location_detail).bind(e.start_date).bind(e.end_date).bind(e.memo).bind(e.created_at).bind(e.updated_at)
            .execute(&mut **t).await.map_err(|e| e.to_string())?;
    });

    // SCHEDULES
    restore_table!("schedules", Schedule, "일정 정보 복구 중", s, t, {
        sqlx::query("INSERT INTO schedules (schedule_id, title, description, start_time, end_time, status, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (schedule_id) DO UPDATE SET title=EXCLUDED.title, updated_at=EXCLUDED.updated_at")
            .bind(s.schedule_id).bind(s.title).bind(s.description).bind(s.start_time).bind(s.end_time).bind(s.status).bind(s.created_at).bind(s.updated_at)
            .execute(&mut **t).await.map_err(|e| e.to_string())?;
    });

    // COMPANY_INFO
    restore_table!(
        "company_info",
        CompanyInfo,
        "회사 정보 복구 중",
        c,
        t,
        {
            sqlx::query("INSERT INTO company_info (id, company_name, representative_name, phone_number, mobile_number, business_reg_number, registration_date, memo, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (id) DO UPDATE SET company_name=EXCLUDED.company_name, updated_at=EXCLUDED.updated_at")
            .bind(c.id).bind(c.company_name).bind(c.representative_name).bind(c.phone_number).bind(c.mobile_number).bind(c.business_reg_number).bind(c.registration_date).bind(c.memo).bind(c.created_at).bind(c.updated_at)
            .execute(&mut **t).await.map_err(|e| e.to_string())?;
        }
    );

    // EXPENSES
    restore_table!("expenses", Expense, "지출 내역 복구 중", e, t, {
        sqlx::query("INSERT INTO expenses (expense_id, expense_date, category, memo, amount, payment_method, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (expense_id) DO UPDATE SET amount=EXCLUDED.amount, updated_at=EXCLUDED.updated_at")
            .bind(e.expense_id).bind(e.expense_date).bind(e.category).bind(e.memo).bind(e.amount).bind(e.payment_method).bind(e.created_at).bind(e.updated_at)
            .execute(&mut **t).await.map_err(|e| e.to_string())?;
    });

    // PURCHASES
    restore_table!(
        "purchases",
        PurchaseBackup,
        "구매 내역 복구 중",
        p,
        t,
        {
            sqlx::query("INSERT INTO purchases (purchase_id, purchase_date, vendor_id, item_name, specification, quantity, unit_price, total_amount, payment_status, memo, inventory_synced, material_item_id, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) ON CONFLICT (purchase_id) DO UPDATE SET total_amount=EXCLUDED.total_amount, updated_at=EXCLUDED.updated_at")
            .bind(p.purchase_id).bind(p.purchase_date).bind(p.vendor_id).bind(p.item_name).bind(p.specification).bind(p.quantity).bind(p.unit_price).bind(p.total_amount).bind(p.payment_status).bind(p.memo).bind(p.inventory_synced).bind(p.material_item_id).bind(p.created_at).bind(p.updated_at)
            .execute(&mut **t).await.map_err(|e| e.to_string())?;
        }
    );

    // CONSULTATIONS
    restore_table!(
        "consultations",
        Consultation,
        "상담 내역 복구 중",
        c,
        t,
        {
            sqlx::query("INSERT INTO consultations (consult_id, customer_id, guest_name, contact, channel, counselor_name, category, title, content, answer, status, priority, consult_date, follow_up_date, created_at, updated_at, sentiment) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) ON CONFLICT (consult_id) DO UPDATE SET status=EXCLUDED.status, updated_at=EXCLUDED.updated_at")
            .bind(c.consult_id).bind(c.customer_id).bind(c.guest_name).bind(c.contact).bind(c.channel).bind(c.counselor_name).bind(c.category).bind(c.title).bind(c.content).bind(c.answer).bind(c.status).bind(c.priority).bind(c.consult_date).bind(c.follow_up_date).bind(c.created_at).bind(c.updated_at).bind(c.sentiment)
            .execute(&mut **t).await.map_err(|e| e.to_string())?;
        }
    );

    // CLAIMS
    restore_table!(
        "sales_claims",
        SalesClaim,
        "클레임 내역 복구 중",
        c,
        t,
        {
            sqlx::query("INSERT INTO sales_claims (claim_id, sales_id, customer_id, claim_type, claim_status, reason_category, quantity, refund_amount, is_inventory_recovered, memo, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT (claim_id) DO UPDATE SET claim_status=EXCLUDED.claim_status, updated_at=EXCLUDED.updated_at")
            .bind(c.claim_id).bind(c.sales_id).bind(c.customer_id).bind(c.claim_type).bind(c.claim_status).bind(c.reason_category).bind(c.quantity).bind(c.refund_amount).bind(c.is_inventory_recovered).bind(c.memo).bind(c.created_at).bind(c.updated_at)
            .execute(&mut **t).await.map_err(|e| e.to_string())?;
        }
    );

    // INVENTORY
    restore_table!(
        "inventory_logs",
        InventoryLog,
        "재고 로그 복구 중",
        l,
        t,
        {
            sqlx::query("INSERT INTO inventory_logs (log_id, product_name, specification, change_type, change_quantity, current_stock, reference_id, memo, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (log_id) DO UPDATE SET current_stock=EXCLUDED.current_stock, updated_at=EXCLUDED.updated_at")
            .bind(l.log_id).bind(l.product_name).bind(l.specification).bind(l.change_type).bind(l.change_quantity).bind(l.current_stock).bind(l.reference_id).bind(l.memo).bind(l.created_at).bind(l.updated_at)
            .execute(&mut **t).await.map_err(|e| e.to_string())?;
        }
    );

    // DELETIONS
    if is_incremental {
        restore_table!("deletions", DeletionLog, "삭제 이력 반영 중", d, t, {
            let id_col = match d.table_name.as_str() {
                "sales" => "sales_id",
                "products" => "product_id",
                "customers" => "customer_id",
                _ => "id",
            };
            sqlx::query(&format!(
                "DELETE FROM {} WHERE {} = $1",
                d.table_name, id_col
            ))
            .bind(d.record_id)
            .execute(&mut **t)
            .await
            .ok();
        });
    }

    // Final Stage: Commit and Indexing
    println!("[Restore] All tables processed. Committing transaction and updating indexes...");
    emit_progress(
        total_bytes as i64,
        total_bytes as i64,
        "데이터 최종 승인 및 색인(Index) 최적화 중... (거의 다 되었습니다!)",
    );

    tx.commit().await.map_err(|e| {
        println!("[Restore] Commit failed: {}", e);
        e.to_string()
    })?;

    // Final progress to force 100% UI - No emit here as the return alert handles it
    // Moving emit to finally block or just relying on alert

    Ok(format!(
        "성공적으로 {}건의 데이터를 복구했습니다.",
        processed
    ))
}

#[tauri::command]
async fn reset_database(state: State<'_, DbPool>) -> Result<String, String> {
    // Truncate tables: sales, customers, event, products
    // Preserving: users, company_info, (and any internal postgres tables)
    // RESTART IDENTITY: Resets auto-increment sequences
    // CASCADE: Deletes any dependent rows (though our FKs usually restrict, this forces clean)

    // Expanded to include ALL transactional and operational data tables
    let sql = "TRUNCATE TABLE 
        sales, customers, event, products, 
        schedules, inventory_logs, consultations, 
        sales_claims, customer_ledger, customer_addresses,
        experience_programs, experience_reservations, 
        vendors, purchases, expenses, deletion_log
        RESTART IDENTITY CASCADE";

    sqlx::query(sql)
        .execute(&*state)
        .await
        .map_err(|e| format!("Failed to reset database: {}", e))?;

    Ok("데이터 초기화가 완료되었습니다.\n모든 운영 데이터가 삭제되고 사용자/업체 정보만 유지됩니다.".to_string())
}

#[tauri::command]
async fn run_db_maintenance(state: State<'_, DbPool>) -> Result<String, String> {
    // Postgres optimization: VACUUM (ANALYZE)
    // Runs vacuum to reclaim storage and analyze to update statistics.
    sqlx::query("VACUUM ANALYZE")
        .execute(&*state)
        .await
        .map_err(|e| format!("VACUUM failed: {}", e))?;

    Ok("DB 건강검진 및 최적화가 완료되었습니다.\n(공간 정리 및 통계 갱신)".to_string())
}

#[tauri::command]
async fn get_experience_programs(
    state: State<'_, DbPool>,
) -> Result<Vec<ExperienceProgram>, String> {
    sqlx::query_as::<_, ExperienceProgram>(
        "SELECT * FROM experience_programs ORDER BY program_name",
    )
    .fetch_all(&*state)
    .await
    .map_err(|e: sqlx::Error| e.to_string())
}

#[tauri::command]
async fn create_experience_program(
    state: State<'_, DbPool>,
    program_name: String,
    description: Option<String>,
    duration_min: i32,
    max_capacity: i32,
    price_per_person: i32,
    is_active: bool,
) -> Result<i32, String> {
    DB_MODIFIED.store(true, Ordering::Relaxed);
    let id: i32 = sqlx::query_scalar(
        "INSERT INTO experience_programs (program_name, description, duration_min, max_capacity, price_per_person, is_active) 
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING program_id"
    )
    .bind(program_name)
    .bind(description)
    .bind(duration_min)
    .bind(max_capacity)
    .bind(price_per_person)
    .bind(is_active)
    .fetch_one(&*state)
    .await
    .map_err(|e: sqlx::Error| e.to_string())?;

    Ok(id)
}

#[tauri::command]
async fn update_experience_program(
    state: State<'_, DbPool>,
    program_id: i32,
    program_name: String,
    description: Option<String>,
    duration_min: i32,
    max_capacity: i32,
    price_per_person: i32,
    is_active: bool,
) -> Result<(), String> {
    DB_MODIFIED.store(true, Ordering::Relaxed);
    sqlx::query(
        "UPDATE experience_programs SET 
         program_name = $1, description = $2, duration_min = $3, 
         max_capacity = $4, price_per_person = $5, is_active = $6
         WHERE program_id = $7",
    )
    .bind(program_name)
    .bind(description)
    .bind(duration_min)
    .bind(max_capacity)
    .bind(price_per_person)
    .bind(is_active)
    .bind(program_id)
    .execute(&*state)
    .await
    .map_err(|e: sqlx::Error| e.to_string())?;

    Ok(())
}

#[tauri::command]
async fn delete_experience_program(
    state: State<'_, DbPool>,
    program_id: i32,
) -> Result<(), String> {
    DB_MODIFIED.store(true, Ordering::Relaxed);
    sqlx::query("DELETE FROM experience_programs WHERE program_id = $1")
        .bind(program_id)
        .execute(&*state)
        .await
        .map_err(|e: sqlx::Error| e.to_string())?;
    Ok(())
}

#[derive(Debug, serde::Serialize, sqlx::FromRow)]
pub struct ExpMonthlyTrend {
    pub month: String,
    pub count: i64,
    pub revenue: i64,
}

#[derive(Debug, serde::Serialize, sqlx::FromRow)]
pub struct ExpProgramPopularity {
    pub program_name: String,
    pub count: i64,
}

#[derive(Debug, serde::Serialize)]
pub struct ExperienceDashboardStats {
    pub monthly_trend: Vec<ExpMonthlyTrend>,
    pub program_popularity: Vec<ExpProgramPopularity>,
}

#[tauri::command]
async fn get_experience_dashboard_stats(
    state: State<'_, DbPool>,
) -> Result<ExperienceDashboardStats, String> {
    // 1. Monthly Trend (Last 6 months)
    let trend_sql = r#"
        WITH RECURSIVE months AS (
            SELECT TO_CHAR(CURRENT_DATE - (i || ' month')::interval, 'YYYY-MM') as month
            FROM generate_series(0, 5) i
        )
        SELECT 
            m.month,
            COALESCE(COUNT(r.reservation_id), 0) as count,
            COALESCE(SUM(r.total_amount), 0) as revenue
        FROM months m
        LEFT JOIN experience_reservations r 
            ON TO_CHAR(r.reservation_date, 'YYYY-MM') = m.month
            AND r.status != '예약취소'
        GROUP BY m.month
        ORDER BY m.month ASC
    "#;

    let monthly_trend = sqlx::query_as::<_, ExpMonthlyTrend>(trend_sql)
        .fetch_all(&*state)
        .await
        .map_err(|e| e.to_string())?;

    // 2. Program Popularity (Top 5)
    let pop_sql = r#"
        SELECT 
            p.program_name,
            COUNT(r.reservation_id) as count
        FROM experience_programs p
        LEFT JOIN experience_reservations r 
            ON p.program_id = r.program_id 
            AND r.status != '예약취소'
        GROUP BY p.program_id, p.program_name
        ORDER BY count DESC
        LIMIT 5
    "#;

    let program_popularity = sqlx::query_as::<_, ExpProgramPopularity>(pop_sql)
        .fetch_all(&*state)
        .await
        .map_err(|e| e.to_string())?;

    Ok(ExperienceDashboardStats {
        monthly_trend,
        program_popularity,
    })
}

#[tauri::command]
async fn get_ten_year_sales_stats(
    state: State<'_, DbPool>,
) -> Result<Vec<TenYearSalesStats>, String> {
    let sql = r#"
        WITH RECURSIVE years AS (
            SELECT CAST(TO_CHAR(CURRENT_DATE, 'YYYY') AS INTEGER) - i AS year
            FROM generate_series(0, 9) i
        )
        SELECT 
            y.year::TEXT as year,
            COALESCE(COUNT(s.sales_id), 0) as record_count,
            COALESCE(SUM(s.quantity), 0) as total_quantity,
            COALESCE(SUM(s.total_amount), 0) as total_amount
        FROM years y
        LEFT JOIN sales s ON TO_CHAR(s.order_date, 'YYYY') = y.year::TEXT
        GROUP BY y.year
        ORDER BY y.year ASC
    "#;

    let stats = sqlx::query_as::<_, TenYearSalesStats>(sql)
        .fetch_all(&*state)
        .await
        .map_err(|e: sqlx::Error| e.to_string())?;

    Ok(stats)
}

#[tauri::command]
async fn get_monthly_sales_by_cohort(
    pool: State<'_, DbPool>,
    year: String,
) -> Result<Vec<MonthlyCohortStats>, String> {
    if year.len() != 4 {
        return Err("Invalid year format".to_string());
    }

    let sql = r#"
        WITH RECURSIVE months(m) AS (
            SELECT 1 UNION ALL SELECT m + 1 FROM months WHERE m < 12
        ),
        target_months AS (
            SELECT TO_CHAR(TO_DATE($1 || '-' || m, 'YYYY-MM'), 'YYYY-MM') as yyyymm 
            FROM months
        )
        SELECT 
            tm.yyyymm,
            COALESCE(COUNT(s.sales_id), 0) as record_count,
            COALESCE(SUM(s.quantity), 0) as total_quantity,
            COALESCE(SUM(s.total_amount), 0) as total_amount
        FROM target_months tm
        LEFT JOIN sales s ON TO_CHAR(s.order_date, 'YYYY-MM') = tm.yyyymm
        GROUP BY tm.yyyymm
        ORDER BY tm.yyyymm ASC
    "#;

    let stats = sqlx::query_as::<_, MonthlyCohortStats>(sql)
        .bind(year)
        .fetch_all(&*pool)
        .await
        .map_err(|e: sqlx::Error| e.to_string())?;

    Ok(stats)
}

#[tauri::command]
async fn get_daily_sales_stats_by_month(
    pool: State<'_, DbPool>,
    year_month: String, // "2024-01"
) -> Result<Vec<MonthlyCohortStats>, String> {
    if year_month.len() != 7 {
        return Err("Invalid year_month format (Expected YYYY-MM)".to_string());
    }

    let sql = r#"
        WITH days AS (
            SELECT generate_series(
                ($1 || '-01')::date,
                (($1 || '-01')::date + interval '1 month' - interval '1 day')::date,
                '1 day'::interval
            )::date as d
        )
        SELECT 
            d::text as yyyymm,
            COALESCE(COUNT(s.sales_id), 0) as record_count,
            COALESCE(SUM(s.quantity), 0) as total_quantity,
            COALESCE(SUM(s.total_amount), 0) as total_amount
        FROM days
        LEFT JOIN sales s ON s.order_date = d AND s.status != '취소'
        GROUP BY d
        ORDER BY d ASC
    "#;

    let stats = sqlx::query_as::<_, MonthlyCohortStats>(sql)
        .bind(year_month)
        .fetch_all(&*pool)
        .await
        .map_err(|e: sqlx::Error| e.to_string())?;

    Ok(stats)
}

#[tauri::command]
async fn get_experience_reservations(
    state: State<'_, DbPool>,
    start_date: Option<String>,
    end_date: Option<String>,
) -> Result<Vec<ExperienceReservation>, String> {
    let mut sql = String::from(
        "SELECT r.*, p.program_name 
         FROM experience_reservations r
         LEFT JOIN experience_programs p ON r.program_id = p.program_id
         WHERE 1=1",
    );

    if start_date.is_some() && end_date.is_some() {
        sql.push_str(" AND r.reservation_date >= $1::date AND r.reservation_date <= $2::date");
    }

    sql.push_str(" ORDER BY r.reservation_date ASC, r.reservation_time ASC");

    let query = sqlx::query_as::<_, ExperienceReservation>(&sql);

    let query = if let (Some(start), Some(end)) = (start_date, end_date) {
        query.bind(start).bind(end)
    } else {
        query
    };

    query
        .fetch_all(&*state)
        .await
        .map_err(|e: sqlx::Error| e.to_string())
}

#[tauri::command]
async fn create_experience_reservation(
    state: State<'_, DbPool>,
    program_id: i32,
    customer_id: Option<String>,
    guest_name: String,
    guest_contact: String,
    reservation_date: String,
    reservation_time: String,
    participant_count: i32,
    total_amount: i32,
    status: String,
    payment_status: String,
    memo: Option<String>,
) -> Result<i32, String> {
    let date = NaiveDate::parse_from_str(&reservation_date, "%Y-%m-%d")
        .map_err(|e| format!("Invalid date: {}", e))?;
    let time = NaiveTime::parse_from_str(&reservation_time, "%H:%M")
        .map_err(|e| format!("Invalid time: {}", e))?;

    let id: i32 = sqlx::query_scalar(
        "INSERT INTO experience_reservations (
            program_id, customer_id, guest_name, guest_contact, 
            reservation_date, reservation_time, participant_count, 
            total_amount, status, payment_status, memo
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING reservation_id",
    )
    .bind(program_id)
    .bind(customer_id)
    .bind(&guest_name)
    .bind(guest_contact)
    .bind(date)
    .bind(time)
    .bind(participant_count)
    .bind(total_amount)
    .bind(&status)
    .bind(payment_status)
    .bind(&memo)
    .fetch_one(&*state)
    .await
    .map_err(|e: sqlx::Error| e.to_string())?;

    // Auto-create Schedule if Confirmed
    if status == "예약완료" {
        // Fetch Program Info
        let (program_name, duration_min): (String, i32) = sqlx::query_as(
            "SELECT program_name, duration_min FROM experience_programs WHERE program_id = $1",
        )
        .bind(program_id)
        .fetch_one(&*state)
        .await
        .map_err(|e| format!("Failed to fetch program info for schedule: {}", e))?;

        let start_dt = chrono::NaiveDateTime::new(date, time);
        let end_dt = start_dt + chrono::Duration::minutes(duration_min as i64);
        let title = format!("{}({})", program_name, guest_name);

        sqlx::query(
            "INSERT INTO schedules (title, description, start_time, end_time, status, related_type, related_id) VALUES ($1, $2, $3, $4, 'Planned', 'EXPERIENCE', $5)"
        )
        .bind(title)
        .bind(&memo)
        .bind(start_dt)
        .bind(end_dt)
        .bind(id)
        .execute(&*state)
        .await
        .map_err(|e: sqlx::Error| format!("Failed to auto-create schedule: {}", e))?;
    }

    Ok(id)
}

#[tauri::command]
async fn update_experience_reservation(
    state: State<'_, DbPool>,
    reservation_id: i32,
    program_id: i32,
    customer_id: Option<String>,
    guest_name: String,
    guest_contact: String,
    reservation_date: String,
    reservation_time: String,
    participant_count: i32,
    total_amount: i32,
    status: String,
    payment_status: String,
    memo: Option<String>,
) -> Result<(), String> {
    let date = NaiveDate::parse_from_str(&reservation_date, "%Y-%m-%d")
        .map_err(|e| format!("Invalid date: {}", e))?;
    let time = NaiveTime::parse_from_str(&reservation_time, "%H:%M")
        .map_err(|e| format!("Invalid time: {}", e))?;

    // 1. Remove associated schedule (using related_id is more robust)
    sqlx::query("DELETE FROM schedules WHERE related_type = 'EXPERIENCE' AND related_id = $1")
        .bind(reservation_id)
        .execute(&*state)
        .await
        .ok();

    sqlx::query(
        "UPDATE experience_reservations SET 
         program_id = $1, customer_id = $2, guest_name = $3, guest_contact = $4, 
         reservation_date = $5, reservation_time = $6, participant_count = $7, 
         total_amount = $8, status = $9, payment_status = $10, memo = $11
         WHERE reservation_id = $12",
    )
    .bind(program_id)
    .bind(customer_id)
    .bind(&guest_name)
    .bind(guest_contact)
    .bind(date)
    .bind(time)
    .bind(participant_count)
    .bind(total_amount)
    .bind(&status)
    .bind(payment_status)
    .bind(&memo)
    .bind(reservation_id)
    .execute(&*state)
    .await
    .map_err(|e: sqlx::Error| e.to_string())?;

    // Auto-create Schedule if Confirmed or Completed
    if status == "예약완료" || status == "체험완료" {
        // Fetch Program Info
        let (program_name, duration_min): (String, i32) = sqlx::query_as(
            "SELECT program_name, duration_min FROM experience_programs WHERE program_id = $1",
        )
        .bind(program_id)
        .fetch_one(&*state)
        .await
        .map_err(|e| format!("Failed to fetch program info for schedule: {}", e))?;

        let start_dt = chrono::NaiveDateTime::new(date, time);
        let end_dt = start_dt + chrono::Duration::minutes(duration_min as i64);
        let title = format!("{}({})", program_name, guest_name);

        let schedule_status = if status == "체험완료" {
            "Completed"
        } else {
            "Planned"
        };

        sqlx::query(
            "INSERT INTO schedules (title, description, start_time, end_time, status, related_type, related_id) 
             VALUES ($1, $2, $3, $4, $5, 'EXPERIENCE', $6)"
        )
        .bind(title)
        .bind(&memo)
        .bind(start_dt)
        .bind(end_dt)
        .bind(schedule_status)
        .bind(reservation_id)
        .execute(&*state)
        .await
        .map_err(|e: sqlx::Error| format!("Failed to auto-create schedule: {}", e))?;
    }

    Ok(())
}

#[tauri::command]
async fn delete_experience_reservation(
    state: State<'_, DbPool>,
    reservation_id: i32,
) -> Result<(), String> {
    // 1. Try to delete associated schedule first
    sqlx::query("DELETE FROM schedules WHERE related_type = 'EXPERIENCE' AND related_id = $1")
        .bind(reservation_id)
        .execute(&*state)
        .await
        .ok();

    // 2. Delete Reservation
    sqlx::query("DELETE FROM experience_reservations WHERE reservation_id = $1")
        .bind(reservation_id)
        .execute(&*state)
        .await
        .map_err(|e: sqlx::Error| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn update_experience_status(
    state: State<'_, DbPool>,
    reservation_id: i32,
    status: String,
    append_memo: Option<String>,
) -> Result<(), String> {
    DB_MODIFIED.store(true, Ordering::Relaxed);
    sqlx::query(
        "UPDATE experience_reservations 
         SET status = $1, 
             memo = CASE 
                 WHEN $3 IS NOT NULL AND LENGTH($3) > 0 THEN 
                    CASE WHEN memo IS NULL OR LENGTH(memo) = 0 THEN $3 
                    ELSE memo || '\n' || $3 END
                 ELSE memo 
             END
         WHERE reservation_id = $2",
    )
    .bind(&status)
    .bind(reservation_id)
    .bind(append_memo)
    .execute(&*state)
    .await
    .map_err(|e: sqlx::Error| e.to_string())?;

    // Auto-create Schedule if Confirmed
    if status == "예약완료" {
        // Clean up any existing schedule for this reservation first to avoid duplicates
        let _ = sqlx::query(
            "DELETE FROM schedules WHERE related_type = 'EXPERIENCE' AND related_id = $1",
        )
        .bind(reservation_id)
        .execute(&*state)
        .await;

        // Fetch Reservation & Program Info joined
        let (program_name, duration_min, guest_name, r_date, r_time, r_memo): (String, i32, String, NaiveDate, NaiveTime, Option<String>) = sqlx::query_as(
            "SELECT p.program_name, p.duration_min, r.guest_name, r.reservation_date, r.reservation_time, r.memo 
             FROM experience_reservations r
             JOIN experience_programs p ON r.program_id = p.program_id
             WHERE r.reservation_id = $1"
        )
        .bind(reservation_id)
        .fetch_one(&*state)
        .await
        .map_err(|e: sqlx::Error| format!("Failed to fetch reservation info for schedule: {}", e))?;

        let start_dt = chrono::NaiveDateTime::new(r_date, r_time);
        let end_dt = start_dt + chrono::Duration::minutes(duration_min as i64);
        let title = format!("{}({})", program_name, guest_name);

        sqlx::query(
            "INSERT INTO schedules (title, description, start_time, end_time, status, related_type, related_id) 
             VALUES ($1, $2, $3, $4, 'Planned', 'EXPERIENCE', $5)"
        )
        .bind(title)
        .bind(r_memo)
        .bind(start_dt)
        .bind(end_dt)
        .bind(reservation_id)
        .execute(&*state)
        .await
        .map_err(|e: sqlx::Error| format!("Failed to auto-create schedule: {}", e))?;
    } else if status == "예약취소" || status == "예약대기" {
        // Auto-delete Schedule
        let _ = sqlx::query(
            "DELETE FROM schedules WHERE related_type = 'EXPERIENCE' AND related_id = $1",
        )
        .bind(reservation_id)
        .execute(&*state)
        .await;
    } else if status == "체험완료" {
        // Auto-complete Schedule
        sqlx::query(
            "UPDATE schedules SET status = 'Completed' WHERE related_type = 'EXPERIENCE' AND related_id = $1",
        )
        .bind(reservation_id)
        .execute(&*state)
        .await
        .map_err(|e: sqlx::Error| format!("Failed to auto-complete schedule: {}", e))?;
    } else {
        // If status changed to something else (e.g. Unconfirmed), we should probably delete the schedule too if it exists?
        // Let's assume '예약취소' or '예약대기' covers removal.
        // But if we revert from '예약완료' to '미확정', we should also remove schedule.
        // For now, only '예약취소' and '예약대기' explicitly remove it based on user request logic.
        // To be safe, let's try to remove schedule if status is NOT '예약완료' and NOT '체험완료'?
        // No, stick to explicit requested logic.
    }
    Ok(())
}

#[tauri::command]
async fn update_experience_payment_status(
    state: State<'_, DbPool>,
    reservation_id: i32,
    payment_status: String,
) -> Result<(), String> {
    DB_MODIFIED.store(true, Ordering::Relaxed);
    sqlx::query("UPDATE experience_reservations SET payment_status = $1 WHERE reservation_id = $2")
        .bind(payment_status)
        .bind(reservation_id)
        .execute(&*state)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn get_product_10yr_sales_stats(
    state: State<'_, DbPool>,
    product_name: String,
) -> Result<Vec<TenYearSalesStats>, String> {
    let sql = r#"
        WITH recursive years AS (
            SELECT CAST(TO_CHAR(CURRENT_DATE, 'YYYY') AS INTEGER) - i AS year
            FROM generate_series(0, 9) i
        )
        SELECT 
            y.year::TEXT as year,
            COALESCE(COUNT(s.sales_id), 0) as record_count,
            COALESCE(SUM(s.quantity), 0) as total_quantity,
            COALESCE(SUM(s.total_amount), 0) as total_amount
        FROM years y
        LEFT JOIN sales s ON 
            s.product_name = $1
            AND s.customer_id IS NOT NULL 
            AND LENGTH(s.customer_id) >= 4 
            AND SUBSTRING(s.customer_id, 1, 4) = y.year::TEXT
            AND s.status != '취소'
        GROUP BY y.year
        ORDER BY y.year ASC
    "#;

    let stats = sqlx::query_as::<_, TenYearSalesStats>(sql)
        .bind(product_name)
        .fetch_all(&*state)
        .await
        .map_err(|e| e.to_string())?;

    Ok(stats)
}

#[derive(Debug, serde::Serialize, sqlx::FromRow)]
pub struct ProductMonthlyStat {
    pub month: i32,
    pub record_count: i64,
    pub total_quantity: i64,
    pub total_amount: i64,
}

#[tauri::command]
async fn get_product_monthly_analysis(
    state: State<'_, DbPool>,
    product_name: String,
    year: i32,
) -> Result<Vec<ProductMonthlyStat>, String> {
    let sql = r#"
        SELECT 
            EXTRACT(MONTH FROM order_date)::integer as month,
            COUNT(*) as record_count,
            COALESCE(SUM(quantity), 0)::bigint as total_quantity,
            COALESCE(SUM(total_amount), 0)::bigint as total_amount
        FROM sales
        WHERE product_name = $1 
          AND EXTRACT(YEAR FROM order_date)::integer = $2
          AND status != '취소'
        GROUP BY month
        ORDER BY month ASC
    "#;

    let rows = sqlx::query_as::<_, ProductMonthlyStat>(sql)
        .bind(product_name)
        .bind(year)
        .fetch_all(&*state)
        .await
        .map_err(|e| e.to_string())?;

    Ok(rows)
}

#[tauri::command]
async fn get_product_sales_stats(
    pool: State<'_, DbPool>,
    year: Option<String>,
) -> Result<Vec<ProductSalesStats>, String> {
    let year_filter = if let Some(ref y) = year {
        if y != "전체조회" {
            format!("AND TO_CHAR(order_date, 'YYYY') = '{}'", y)
        } else {
            "".to_string()
        }
    } else {
        "".to_string()
    };

    let sql = format!(
        r#"
        SELECT 
            CASE 
                WHEN p.product_name IS NOT NULL THEN p.product_name 
                ELSE s.product_name || ' (단종상품)' 
            END as product_name,
            COALESCE(s.record_count, 0) as record_count,
            COALESCE(s.total_quantity, 0) as total_quantity,
            COALESCE(s.total_amount, 0) as total_amount
        FROM (SELECT * FROM products WHERE item_type IS NULL OR item_type = 'product') p
        FULL OUTER JOIN (
            SELECT 
                product_name,
                COUNT(*) as record_count,
                SUM(quantity) as total_quantity,
                SUM(total_amount) as total_amount
            FROM sales
            WHERE status != '취소'
            {}
            GROUP BY product_name
        ) s ON p.product_name = s.product_name
        ORDER BY total_amount DESC, product_name ASC
        "#,
        year_filter
    );

    let query = sqlx::query_as::<_, ProductSalesStats>(&sql)
        .fetch_all(&*pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(query)
}

#[tauri::command]
async fn get_schedules(
    state: State<'_, DbPool>,
    start_date: String,
    end_date: String,
) -> Result<Vec<Schedule>, String> {
    sqlx::query_as::<_, Schedule>(
        "SELECT * FROM schedules 
         WHERE start_time <= $2::timestamp AND end_time >= $1::timestamp
         ORDER BY start_time ASC",
    )
    .bind(start_date)
    .bind(end_date)
    .fetch_all(&*state)
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
async fn create_schedule(
    state: State<'_, DbPool>,
    title: String,
    description: Option<String>,
    start_time: String,
    end_time: String,
    status: Option<String>,
) -> Result<i32, String> {
    DB_MODIFIED.store(true, Ordering::Relaxed);
    let id: i32 = sqlx::query_scalar(
        "INSERT INTO schedules (title, description, start_time, end_time, status) 
         VALUES ($1, $2, $3::timestamp, $4::timestamp, $5) 
         RETURNING schedule_id",
    )
    .bind(title)
    .bind(description)
    .bind(start_time)
    .bind(end_time)
    .bind(status)
    .fetch_one(&*state)
    .await
    .map_err(|e| e.to_string())?;
    Ok(id)
}

#[tauri::command]
async fn update_schedule(
    state: State<'_, DbPool>,
    schedule_id: i32,
    title: String,
    description: Option<String>,
    start_time: String,
    end_time: String,
    status: Option<String>,
) -> Result<(), String> {
    DB_MODIFIED.store(true, Ordering::Relaxed);
    sqlx::query(
        "UPDATE schedules SET 
         title = $1, description = $2, start_time = $3::timestamp, 
         end_time = $4::timestamp, status = $5
         WHERE schedule_id = $6",
    )
    .bind(title)
    .bind(description)
    .bind(start_time)
    .bind(end_time)
    .bind(status)
    .bind(schedule_id)
    .execute(&*state)
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn delete_schedule(state: State<'_, DbPool>, schedule_id: i32) -> Result<(), String> {
    DB_MODIFIED.store(true, Ordering::Relaxed);
    sqlx::query("DELETE FROM schedules WHERE schedule_id = $1")
        .bind(schedule_id)
        .execute(&*state)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

// SPECIAL SALES BATCH SAVE STRUCTS AND COMMAND

#[derive(serde::Deserialize)]
pub struct SpecialEventInput {
    pub event_id: Option<String>,
    pub event_name: String,
    pub organizer: Option<String>,
    pub manager_name: Option<String>,
    pub manager_contact: Option<String>,
    pub location_address: Option<String>,
    pub memo: Option<String>,
    pub start_date: Option<String>,
    pub end_date: Option<String>,
}

#[derive(serde::Deserialize)]
pub struct SpecialSaleInput {
    pub sales_id: Option<String>,
    pub order_date: String,
    pub product_name: String,
    pub specification: Option<String>,
    pub quantity: i32,
    pub unit_price: i32,
    pub discount_rate: Option<i32>,
    pub total_amount: Option<i32>,
    pub memo: Option<String>,
}

#[tauri::command]
async fn save_special_sales_batch(
    state: State<'_, DbPool>,
    event: SpecialEventInput,
    sales: Vec<SpecialSaleInput>,
    deleted_sales_ids: Vec<String>,
) -> Result<String, String> {
    let mut tx = state
        .begin()
        .await
        .map_err(|e: sqlx::Error| e.to_string())?;

    // 1. Resolve Event ID (Create or Update)
    let event_id = if let Some(eid) = &event.event_id {
        if eid.trim().is_empty() {
            // Logic for New Event (Same as create_event)
            let now = Utc::now();
            let date_str = now.format("%Y%m%d").to_string();
            let last_record: Option<(String,)> = sqlx::query_as(
                "SELECT event_id FROM event WHERE event_id LIKE $1 ORDER BY event_id DESC LIMIT 1",
            )
            .bind(format!("{}%", date_str))
            .fetch_optional(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;

            let next_val = match last_record {
                Some((last_id,)) => {
                    let parts: Vec<&str> = last_id.split('-').collect();
                    if let Some(suffix) = parts.last() {
                        suffix.parse::<i32>().unwrap_or(10000) + 1
                    } else {
                        10001
                    }
                }
                None => 10001,
            };
            let new_eid = format!("{}-{}", date_str, next_val);

            // Insert New Event
            let start_date_parsed = match &event.start_date {
                Some(s) if !s.is_empty() => {
                    Some(NaiveDate::parse_from_str(s, "%Y-%m-%d").unwrap_or_default())
                }
                _ => None,
            };
            let end_date_parsed = match &event.end_date {
                Some(s) if !s.is_empty() => {
                    Some(NaiveDate::parse_from_str(s, "%Y-%m-%d").unwrap_or_default())
                }
                _ => None,
            };

            sqlx::query(
                "INSERT INTO event (
                    event_id, event_name, organizer, manager_name, manager_contact,
                    location_address, start_date, end_date, memo
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
            )
            .bind(&new_eid)
            .bind(&event.event_name)
            .bind(&event.organizer)
            .bind(&event.manager_name)
            .bind(&event.manager_contact)
            .bind(&event.location_address)
            .bind(start_date_parsed)
            .bind(end_date_parsed)
            .bind(&event.memo)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;

            new_eid
        } else {
            // Update Existing Event
            let start_date_parsed = match &event.start_date {
                Some(s) if !s.is_empty() => {
                    Some(NaiveDate::parse_from_str(s, "%Y-%m-%d").unwrap_or_default())
                }
                _ => None,
            };
            let end_date_parsed = match &event.end_date {
                Some(s) if !s.is_empty() => {
                    Some(NaiveDate::parse_from_str(s, "%Y-%m-%d").unwrap_or_default())
                }
                _ => None,
            };

            sqlx::query(
                "UPDATE event SET 
                 event_name=$1, organizer=$2, manager_name=$3, manager_contact=$4, 
                 location_address=$5, start_date=$6, end_date=$7, memo=$8 
                 WHERE event_id=$9",
            )
            .bind(&event.event_name)
            .bind(&event.organizer)
            .bind(&event.manager_name)
            .bind(&event.manager_contact)
            .bind(&event.location_address)
            .bind(start_date_parsed)
            .bind(end_date_parsed)
            .bind(&event.memo)
            .bind(eid)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;

            eid.clone()
        }
    } else {
        // Same new logic if None
        let now = Utc::now();
        let date_str = now.format("%Y%m%d").to_string();
        let last_record: Option<(String,)> = sqlx::query_as(
            "SELECT event_id FROM event WHERE event_id LIKE $1 ORDER BY event_id DESC LIMIT 1",
        )
        .bind(format!("{}%", date_str))
        .fetch_optional(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

        let next_val = match last_record {
            Some((last_id,)) => {
                let parts: Vec<&str> = last_id.split('-').collect();
                if let Some(suffix) = parts.last() {
                    suffix.parse::<i32>().unwrap_or(10000) + 1
                } else {
                    10001
                }
            }
            None => 10001,
        };
        let new_eid = format!("{}-{}", date_str, next_val);

        // Insert New Event
        let start_date_parsed = match &event.start_date {
            Some(s) if !s.is_empty() => {
                Some(NaiveDate::parse_from_str(s, "%Y-%m-%d").unwrap_or_default())
            }
            _ => None,
        };
        let end_date_parsed = match &event.end_date {
            Some(s) if !s.is_empty() => {
                Some(NaiveDate::parse_from_str(s, "%Y-%m-%d").unwrap_or_default())
            }
            _ => None,
        };

        sqlx::query(
            "INSERT INTO event (
                 event_id, event_name, organizer, manager_name, manager_contact,
                 location_address, start_date, end_date, memo
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
        )
        .bind(&new_eid)
        .bind(&event.event_name)
        .bind(&event.organizer)
        .bind(&event.manager_name)
        .bind(&event.manager_contact)
        .bind(&event.location_address)
        .bind(start_date_parsed)
        .bind(end_date_parsed)
        .bind(&event.memo)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

        new_eid
    };

    // 2. Handle Deletions
    for del_id in deleted_sales_ids {
        // Delete sale
        sqlx::query("DELETE FROM sales WHERE sales_id = $1")
            .bind(del_id)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
    }

    // 3. Handle Upserts
    // Pre-calculate next Sales ID sequence for today
    let today_naive = Utc::now().date_naive();
    let today_str = today_naive.format("%Y%m%d").to_string();
    let sl_prefix = format!("{}-", today_str);
    let sl_like = format!("{}%", sl_prefix);

    let last_sale_rec: Option<(String,)> = sqlx::query_as(
        "SELECT sales_id FROM sales WHERE sales_id LIKE $1 ORDER BY sales_id DESC LIMIT 1",
    )
    .bind(&sl_like)
    .fetch_optional(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    let mut next_seq = match last_sale_rec {
        Some((lid,)) => {
            let parts: Vec<&str> = lid.split('-').collect();
            if let Some(num_str) = parts.last() {
                num_str.parse::<i32>().unwrap_or(0) + 1
            } else {
                1
            }
        }
        None => 1,
    };

    for sale in sales {
        let sale_date = NaiveDate::parse_from_str(&sale.order_date, "%Y-%m-%d")
            .unwrap_or_else(|_| Utc::now().date_naive());
        let total = sale
            .total_amount
            .unwrap_or_else(|| sale.quantity * sale.unit_price);
        let discount = sale.discount_rate.unwrap_or(0);

        if let Some(sid) = &sale.sales_id {
            if !sid.is_empty() {
                // Update Sale Record
                // We use '현장판매완료' status to distinguish from '배송완료'
                sqlx::query("UPDATE sales SET order_date=$1, product_name=$2, specification=$3, quantity=$4, unit_price=$5, total_amount=$6, discount_rate=$7, memo=$8, status='현장판매완료', shipping_date=$9, customer_id=$10 WHERE sales_id=$11")
                    .bind(sale_date)
                    .bind(&sale.product_name)
                    .bind(&sale.specification)
                    .bind(sale.quantity)
                    .bind(sale.unit_price)
                    .bind(total)
                    .bind(discount)
                    .bind(&sale.memo)
                    .bind(today_naive)
                    .bind(&event_id) // Link to Event ID
                    .bind(sid)
                    .execute(&mut *tx)
                    .await
                    .map_err(|e| e.to_string())?;
                continue;
            }
        }

        // Insert Path
        let new_sid = format!("{}{:05}", sl_prefix, next_seq);
        next_seq += 1;

        sqlx::query("INSERT INTO sales (sales_id, customer_id, order_date, product_name, specification, quantity, unit_price, total_amount, discount_rate, memo, status, shipping_date) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, '현장판매완료', $11)")
        .bind(&new_sid)
        .bind(&event_id) // Link to Event ID
        .bind(sale_date)
        .bind(&sale.product_name)
        .bind(&sale.specification)
        .bind(sale.quantity)
        .bind(sale.unit_price)
        .bind(total)
        .bind(discount)
        .bind(&sale.memo)
        .bind(today_naive) // shipping_date = today for spot sales
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }

    tx.commit().await.map_err(|e| e.to_string())?;

    Ok(event_id)
}

#[tauri::command]
async fn get_ltv_analysis(state: State<'_, DbPool>) -> Result<Vec<LtvCustomer>, String> {
    // Postgres version
    let sql = r#"
        SELECT 
            c.customer_id,
            c.customer_name,
            c.membership_level,
            c.join_date,
            CAST(COALESCE(SUM(s.total_amount), 0) AS BIGINT) as total_spent,
            COUNT(s.sales_id) as total_orders,
            CAST(GREATEST(0.5, (CURRENT_DATE - c.join_date) / 365.25) AS FLOAT8) as years_active,
            (CAST(COALESCE(SUM(s.total_amount), 0) AS FLOAT8) / GREATEST(0.5, (CURRENT_DATE - c.join_date) / 365.25)) as ltv_score
        FROM customers c
        JOIN sales s ON c.customer_id = s.customer_id
        WHERE s.status != '취소'
        GROUP BY c.customer_id, c.customer_name, c.membership_level, c.join_date
        ORDER BY ltv_score DESC
        LIMIT 100
    "#;

    let ltv_data = sqlx::query_as::<_, LtvCustomer>(sql)
        .fetch_all(&*state)
        .await
        .map_err(|e: sqlx::Error| e.to_string())?;

    Ok(ltv_data)
}

#[tauri::command]
async fn get_product_associations(
    state: State<'_, DbPool>,
) -> Result<Vec<ProductAssociation>, String> {
    // Optimized: Limit analysis to last 12 months for better performance and relevance
    let total_bundles: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) 
         FROM (
             SELECT DISTINCT customer_id, order_date 
             FROM sales 
             WHERE customer_id IS NOT NULL 
             AND order_date >= (CURRENT_DATE - INTERVAL '12 months')
             AND status != '취소'
         ) as t",
    )
    .fetch_one(&*state)
    .await
    .map_err(|e| e.to_string())?;

    if total_bundles == 0 {
        return Ok(vec![]);
    }

    let sql = r#"
        WITH SalesBundles AS (
            SELECT customer_id, order_date, product_name
            FROM sales
            WHERE customer_id IS NOT NULL
            AND order_date >= (CURRENT_DATE - INTERVAL '12 months')
            AND status != '취소'
            GROUP BY customer_id, order_date, product_name
        )
        SELECT 
            a.product_name as product_a,
            b.product_name as product_b,
            COUNT(*) as pair_count,
            (CAST(COUNT(*) AS FLOAT8) / $1 * 100.0) as support_percent
        FROM SalesBundles a
        JOIN SalesBundles b ON a.customer_id = b.customer_id AND a.order_date = b.order_date
        WHERE a.product_name < b.product_name
        GROUP BY a.product_name, b.product_name
        HAVING COUNT(*) >= 2
        ORDER BY pair_count DESC, support_percent DESC
        LIMIT 50
    "#;

    let associations = sqlx::query_as::<_, ProductAssociation>(sql)
        .bind(total_bundles)
        .fetch_all(&*state)
        .await
        .map_err(|e: sqlx::Error| e.to_string())?;

    Ok(associations)
}

// BriefingData struct removed to fix unused code warning

#[tauri::command]
async fn get_morning_briefing(
    app: tauri::AppHandle,
    state: State<'_, DbPool>,
) -> Result<String, String> {
    let api_key = get_gemini_api_key(&app).ok_or("Gemini API 키가 설정되지 않았습니다.")?;

    // 1. Gather Data
    let today = Local::now().date_naive();
    let yesterday = today - chrono::Duration::days(1);

    // 1.1 Yesterday Sales (Postgres: Coalesce returns BigInt/Numeric)
    let y_stats: (Option<i64>, Option<i64>) = sqlx::query_as(
        "SELECT CAST(COALESCE(SUM(total_amount), 0) AS BIGINT), COUNT(*) FROM sales WHERE order_date = $1 AND status != '취소'"
    )
    .bind(yesterday)
    .fetch_one(&*state)
    .await
    .unwrap_or((Some(0), Some(0)));

    // 1.2 Today's Schedules & Reservations
    let sched_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM schedules WHERE start_time >= $1 AND start_time < ($1 + INTERVAL '1 day')"
    )
    .bind(today)
    .fetch_one(&*state)
    .await
    .unwrap_or(0);

    // Postgres: TO_CHAR for time formatting
    let reservations: Vec<(String, String)> = sqlx::query_as(
        "SELECT guest_name, TO_CHAR(reservation_time, 'HH24:MI') as time_str FROM experience_reservations WHERE reservation_date = $1 AND status != '취소' ORDER BY reservation_time"
    )
    .bind(today)
    .fetch_all(&*state)
    .await
    .unwrap_or_default();

    let reservation_strs: Vec<String> = reservations
        .iter()
        .map(|(n, t)| format!("{} ({})", n, t))
        .collect();

    // 1.3 Pending Shipments
    let pending_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM sales WHERE status = '결제완료' OR status = '주문접수'",
    )
    .fetch_one(&*state)
    .await
    .unwrap_or(0);

    // 1.4 Low Stock
    let low_stocks: Vec<String> =
        sqlx::query_scalar("SELECT product_name FROM products WHERE stock_quantity < 30")
            .fetch_all(&*state)
            .await
            .unwrap_or_default();

    // 1.5 Company Info
    let company_name: String = sqlx::query_scalar("SELECT company_name FROM company_info LIMIT 1")
        .fetch_one(&*state)
        .await
        .unwrap_or("버섯농장".to_string());

    // 2. Construct Prompt
    let prompt = format!(
        "Role: You are an intelligent and warm AI secretary for '{}'. \
        Current Date: {} ({})\n\
        \n\
        [Business Context]\n\
        - Yesterday's ({}) Result: {} Sales / {} KRW\n\
        - Today's Schedule Count: {}\n\
        - Today's Experience Reservations: {:?}\n\
        - Pending Shipments to Process: {} orders\n\
        - Low Stock Alerts: {:?}\n\
        \n\
        [Task]\n\
        Write a 'Morning Briefing' HTML content (use clean structure, no full <html> body, just inner content).\n\
        Use friendly, energetic, and professional Korean (polite '해요' style).\n\
        \n\
        Structure:\n\
        1. 🌤️ Greeting: Mention date/day and a warm opening.\n\
        2. 📉 Yesterday Recap: Briefly summarize yesterday's performance.\n\
        3. 📅 Today's Focus: Highlight reservations and schedules. If busy, encourage them. If quiet, suggest marketing.\n\
        4. ⚠️ Alerts: Mention pending shipments and low stock items clearly.\n\
        5. 💡 AI One-Liner Tip: A short business or motivation tip based on the situation.\n\
        \n\
        Output ONLY the HTML string (e.g., <div class='briefing'>...</div>). Do not use markdown code blocks.",
        company_name,
        today.format("%Y-%m-%d"),
        today.format("%A"),
        yesterday.format("%Y-%m-%d"),
        y_stats.1.unwrap_or(0),
        y_stats.0.unwrap_or(0),
        sched_count,
        reservation_strs,
        pending_count,
        low_stocks
    );

    // 3. Call AI
    call_gemini_ai_internal(&api_key, &prompt).await
}

#[tauri::command]
async fn analyze_online_sentiment(
    app: tauri::AppHandle,
    mentions: Vec<OnlineMentionInput>,
) -> Result<SentimentAnalysisResult, String> {
    let api_key = get_gemini_api_key(&app).ok_or("Gemini API Key가 설정되지 않았습니다.")?;

    if mentions.is_empty() {
        return Err("분석할 데이터가 없습니다.".to_string());
    }

    // Limit to top 20 to avoid token limits
    let mentions_subset = mentions.iter().take(20).collect::<Vec<_>>();

    // Prepare prompt with data
    let mut inputs_text = String::new();
    for (i, m) in mentions_subset.iter().enumerate() {
        // Truncate text if too long
        let text_sample: String = m.text.chars().take(200).collect();
        inputs_text.push_str(&format!("{}. [{}] {} \n", i + 1, m.source, text_sample));
    }

    let prompt = format!(
        "Analyze the following list of online mentions for a company. \
        The mentions are from Korean social media/blogs. \
        \n\nData:\n{}\n\n \
        Perform the following tasks:\n \
        1. Calculate an overall sentiment score (0-100, where 100 is best).\n \
        2. Determine a verdict (e.g., '매우 긍정', '긍정', '중립', '부정', '매우 부정').\n \
        3. Write a brief summary of the public opinion in Korean.\n \
        4. Extract top 5 keywords with their sentiment type (pos/neg/neu) and weight (1-10).\n \
        5. Analyze each mention individually: provide a score (0-100) and label (pos/neg/neu).\n \
        \n \
        Output ONLY valid JSON with the following structure:\n \
        {{\n \
            \"total_score\": 85,\n \
            \"verdict\": \"매우 긍정\",\n \
            \"summary\": \"...\",\n \
            \"keywords\": [ {{ \"text\": \"배송\", \"weight\": 8, \"sentiment_type\": \"pos\" }} ],\n \
            \"analyzed_mentions\": [ {{ \"original_text\": \"...\", \"sentiment_score\": 90, \"sentiment_label\": \"pos\" }} ]\n \
        }}",
        inputs_text
    );

    let ai_response = call_gemini_ai_internal(&api_key, &prompt).await?;

    // Parse JSON
    let parsed: serde_json::Value = serde_json::from_str(&ai_response)
        .map_err(|e| format!("Failed to parse AI response: {}", e))?;

    // Map to struct
    let total_score = parsed["total_score"].as_i64().unwrap_or(50) as i32;
    let verdict = parsed["verdict"]
        .as_str()
        .unwrap_or("분석 실패")
        .to_string();
    let summary = parsed["summary"].as_str().unwrap_or("").to_string();

    let mut keywords = Vec::new();
    if let Some(arr) = parsed["keywords"].as_array() {
        for k in arr {
            keywords.push(KeywordItem {
                text: k["text"].as_str().unwrap_or("").to_string(),
                weight: k["weight"].as_i64().unwrap_or(5) as i32,
                sentiment_type: k["sentiment_type"].as_str().unwrap_or("neu").to_string(),
            });
        }
    }

    let mut analyzed_mentions = Vec::new();
    if let Some(arr) = parsed["analyzed_mentions"].as_array() {
        for m in arr {
            analyzed_mentions.push(AnalyzedMention {
                original_text: m["original_text"].as_str().unwrap_or("").to_string(),
                sentiment_score: m["sentiment_score"].as_i64().unwrap_or(50) as i32,
                sentiment_label: m["sentiment_label"].as_str().unwrap_or("neu").to_string(),
            });
        }
    }

    Ok(SentimentAnalysisResult {
        total_score,
        verdict,
        summary,
        keywords,
        analyzed_mentions,
    })
}

#[tauri::command]
async fn get_churn_risk_customers(
    state: State<'_, DbPool>,
    days_threshold: i32,
    min_orders: i32,
) -> Result<Vec<ChurnRiskCustomer>, String> {
    // Postgres version
    let sql = r#"
        SELECT 
            c.customer_id,
            c.customer_name,
            c.mobile_number,
            MAX(s.order_date) as last_order_date,
            COUNT(s.sales_id) as total_orders,
            CAST(COALESCE(SUM(s.total_amount), 0) AS BIGINT) as total_amount,
            CAST((CURRENT_DATE - MAX(s.order_date)) AS BIGINT) as days_since_last_order,
            CASE 
                WHEN (CURRENT_DATE - MAX(s.order_date)) > 365 THEN 100
                WHEN (CURRENT_DATE - MAX(s.order_date)) > 180 THEN 80
                WHEN (CURRENT_DATE - MAX(s.order_date)) > 90 THEN 50
                ELSE 20
            END as risk_score
        FROM customers c
        JOIN sales s ON c.customer_id = s.customer_id
        WHERE s.status != '취소'
        GROUP BY c.customer_id, c.customer_name, c.mobile_number
        HAVING (CURRENT_DATE - MAX(s.order_date)) >= $1 AND COUNT(s.sales_id) >= $2
        ORDER BY days_since_last_order DESC, total_amount DESC
        LIMIT 200
    "#;

    let customers = sqlx::query_as::<_, ChurnRiskCustomer>(sql)
        .bind(days_threshold)
        .bind(min_orders)
        .fetch_all(&*state)
        .await
        .map_err(|e: sqlx::Error| e.to_string())?;

    Ok(customers)
}

#[derive(serde::Serialize, serde::Deserialize, FromRow)]
pub struct ForecastDataPoint {
    pub date: String,
    pub count: f64,
}

#[derive(serde::Serialize, serde::Deserialize)]
pub struct DemandForecastResult {
    #[serde(default)]
    pub history: Vec<ForecastDataPoint>,
    pub forecast: Vec<ForecastDataPoint>,
    pub expected_total_revenue: i64,
    pub growth_rate: f64,
    pub stock_tip: String,
    pub ai_analysis: String,
}

#[tauri::command]
async fn get_ai_demand_forecast(
    app: tauri::AppHandle,
    state: State<'_, DbPool>,
    product_name: Option<String>,
    forecast_days: i32,
) -> Result<DemandForecastResult, String> {
    let api_key = get_gemini_api_key(&app).ok_or("Gemini API 키가 설정되지 않았습니다.")?;

    // 1. Fetch History (Last 365 Days)
    let sql = if product_name.is_some() {
        "SELECT order_date::text as date, CAST(SUM(quantity) AS DOUBLE PRECISION) as count \
         FROM sales WHERE product_name = $1 AND order_date >= CURRENT_DATE - INTERVAL '365 days' \
         AND status != '취소' \
         GROUP BY order_date ORDER BY order_date ASC"
    } else {
        "SELECT order_date::text as date, CAST(SUM(quantity) AS DOUBLE PRECISION) as count \
         FROM sales WHERE order_date >= CURRENT_DATE - INTERVAL '365 days' \
         AND status != '취소' \
         GROUP BY order_date ORDER BY order_date ASC"
    };

    let query = sqlx::query_as::<_, ForecastDataPoint>(sql);
    let history: Vec<ForecastDataPoint> = if let Some(ref name) = product_name {
        query
            .bind(name)
            .fetch_all(&*state)
            .await
            .map_err(|e| e.to_string())?
    } else {
        query.fetch_all(&*state).await.map_err(|e| e.to_string())?
    };

    if history.is_empty() {
        return Err("분석할 판매 데이터가 부족합니다.".to_string());
    }

    // 2. Prepare Prompt for AI (Send last 60 data points for context)
    let mut history_text = String::new();
    for h in history.iter().rev().take(60).rev() {
        history_text.push_str(&format!("{},{}\n", h.date, h.count));
    }

    let prompt = format!(
        "Role: Expert Supply Chain Analyst for a Mushroom Farm.\n\
         Product: {}\n\
         Date: {}\n\
         Historical Sales (Date,Quantity):\n\
         {}\n\n\
         Task: Predict sales for the next {} days. Consider seasonality and trends.\n\
         Output JSON format exactly (No other text):\n\
         {{\n\
           \"forecast\": [ {{\"date\": \"YYYY-MM-DD\", \"count\": 0.0}}, ... ],\n\
           \"expected_total_revenue\": 1000000,\n\
           \"growth_rate\": 5.2,\n\
           \"stock_tip\": \"One sentence stock advice in Korean.\",\n\
           \"ai_analysis\": \"Brief analysis in Korean.\"\n\
         }}",
        product_name.unwrap_or_else(|| "All Products".to_string()),
        Utc::now().format("%Y-%m-%d"),
        history_text,
        forecast_days
    );

    // 3. Call AI
    let ai_response = call_gemini_ai_internal(&api_key, &prompt).await?;

    // 4. Parse & Return
    let mut result: DemandForecastResult =
        serde_json::from_str(&ai_response).map_err(|e| format!("AI 응답 파싱 실패: {}", e))?;

    result.history = history;

    Ok(result)
}

#[derive(Debug, serde::Serialize)]
pub struct RepurchaseAnalysisResult {
    pub candidates: Vec<db::RepurchaseCandidate>,
    pub ai_advice: String,
}

#[tauri::command]
async fn get_ai_repurchase_analysis(
    app: tauri::AppHandle,
    state: State<'_, DbPool>,
) -> Result<RepurchaseAnalysisResult, String> {
    // 1. Fetch raw sales data for multi-order customers
    let sql = r#"
        WITH customer_stats AS (
            SELECT customer_id, COUNT(*) as order_count 
            FROM sales 
            WHERE customer_id IS NOT NULL AND status != '취소'
            GROUP BY customer_id
            HAVING COUNT(*) >= 2
        )
        SELECT s.customer_id, COALESCE(c.customer_name, '탈퇴 고객'), c.mobile_number, s.order_date, s.product_name
        FROM sales s
        JOIN customer_stats cs ON s.customer_id = cs.customer_id
        LEFT JOIN customers c ON s.customer_id = c.customer_id
        WHERE s.status != '취소'
        ORDER BY s.customer_id, s.order_date ASC
    "#;

    let rows: Vec<(String, String, Option<String>, NaiveDate, String)> = sqlx::query_as(sql)
        .fetch_all(&*state)
        .await
        .map_err(|e| e.to_string())?;

    if rows.is_empty() {
        return Ok(RepurchaseAnalysisResult {
            candidates: Vec::new(),
            ai_advice: "충분한 구매 데이터가 쌓이면 AI가 구매 주기를 분석해 드릴게요! 😉"
                .to_string(),
        });
    }

    // 2. Group and calculate avg interval
    let mut customer_data: HashMap<String, (String, Option<String>, Vec<NaiveDate>, String)> =
        HashMap::new();

    for (cid, cname, mobile, odate, pname) in rows {
        let entry = customer_data
            .entry(cid)
            .or_insert_with(|| (cname, mobile, Vec::new(), String::new()));
        entry.2.push(odate);
        entry.3 = pname;
    }

    let today = Local::now().date_naive();
    let mut candidates = Vec::new();

    for (cid, (cname, mobile, dates, last_product)) in customer_data {
        if dates.len() < 2 {
            continue;
        }

        let mut total_days = 0;
        for i in 1..dates.len() {
            total_days += (dates[i] - dates[i - 1]).num_days();
        }
        let avg_interval = (total_days as f64 / (dates.len() - 1) as f64) as i32;

        let last_date = dates.last().unwrap();
        let next_date = *last_date + chrono::Duration::days(avg_interval as i64);
        let days_remaining = (next_date - today).num_days() as i32;

        if (-30..=90).contains(&days_remaining) {
            candidates.push(db::RepurchaseCandidate {
                customer_id: cid,
                customer_name: cname,
                mobile_number: mobile,
                last_order_date: Some(*last_date),
                avg_interval_days: avg_interval,
                predicted_days_remaining: days_remaining,
                last_product: Some(last_product),
                purchase_count: dates.len() as i64,
            });
        }
    }

    // Sort by most urgent (lowest days_remaining)
    candidates.sort_by_key(|c| c.predicted_days_remaining);
    let display_candidates = candidates.into_iter().take(50).collect::<Vec<_>>();

    // 3. AI Advice
    let mut ai_advice = String::new();
    if !display_candidates.is_empty() {
        if let Some(api_key) = get_gemini_api_key(&app) {
            let mut context = String::from("Next purchase expected candidates:\n");
            for c in display_candidates.iter().take(10) {
                // Send top 10 for AI context
                context.push_str(&format!(
                    "- {}: Last bought {} (interval: {} days, due in: {} days, total: {} purchases)\n",
                    c.customer_name,
                    c.last_product.as_ref().unwrap_or(&"".to_string()),
                    c.avg_interval_days,
                    c.predicted_days_remaining,
                    c.purchase_count
                ));
            }

            let prompt = format!(
                "{}\nBased on these customers, write a very short (2 sentences) professional marketing strategy advice in Korean for the mushroom farm owner. \
                Focus on high-value repeat customers and timely outreach. Keep it sophisticated and insightful.", 
                context
             );

            if let Ok(ai_res) = call_gemini_ai_internal(&api_key, &prompt).await {
                ai_advice = ai_res;
            }
        }
    }

    if ai_advice.is_empty() {
        if display_candidates.is_empty() {
            ai_advice = "분석 대상 기간 내에 재구매가 예상되는 고객이 보이지 않습니다. 더 많은 판매 데이터가 쌓이면 정밀한 예측이 가능해집니다.".to_string();
        } else {
            ai_advice = format!("{}님을 포함한 {}명의 우수 고객들이 재구매 시점에 도달했습니다. 맞춤형 혜택이나 안부 인사를 통해 구매 전환을 유도해 보세요.", 
                display_candidates[0].customer_name, display_candidates.len());
        }
    }

    Ok(RepurchaseAnalysisResult {
        candidates: display_candidates,
        ai_advice,
    })
}

#[tauri::command]
async fn get_upcoming_anniversaries(state: State<'_, DbPool>) -> Result<Vec<db::Customer>, String> {
    let today = Local::now().date_naive();
    let mut target_dates = Vec::new();
    for i in 0..=3 {
        let d = today + chrono::Duration::days(i);
        target_dates.push(d.format("%m-%d").to_string());
    }

    let sql = r#"
        SELECT * FROM customers
        WHERE anniversary_date IS NOT NULL
          AND to_char(anniversary_date, 'MM-DD') = ANY($1)
        ORDER BY to_char(anniversary_date, 'MM-DD') ASC
    "#;

    let rows = sqlx::query_as::<_, db::Customer>(sql)
        .bind(&target_dates)
        .fetch_all(&*state)
        .await
        .map_err(|e| e.to_string())?;

    Ok(rows)
}

#[derive(serde::Serialize)]
pub struct WeatherAdviceResult {
    pub weather_desc: String,
    pub temperature: f64,
    pub marketing_advice: String,
}

#[tauri::command]
async fn get_weather_marketing_advice(
    app: tauri::AppHandle,
    state: State<'_, DbPool>,
) -> Result<WeatherAdviceResult, String> {
    let api_key = get_gemini_api_key(&app).ok_or("Gemini API 키가 필요합니다.")?;

    // 1. Fetch Weather (Gangneung: Lat 37.75, Lon 128.87)
    // Using Open-Meteo (No API key required for basic usage)
    let weather_url = "https://api.open-meteo.com/v1/forecast?latitude=37.7512&longitude=128.8761&current=temperature_2m,relative_humidity_2m,weather_code&daily=temperature_2m_max,temperature_2m_min&timezone=Asia%2FSeoul&forecast_days=3";

    let client = reqwest::Client::new();
    let res = client
        .get(weather_url)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let weather_json: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;

    let current_temp = weather_json["current"]["temperature_2m"]
        .as_f64()
        .unwrap_or(0.0);
    let weather_code = weather_json["current"]["weather_code"]
        .as_i64()
        .unwrap_or(0);
    let tomorrow_min = weather_json["daily"]["temperature_2m_min"][1]
        .as_f64()
        .unwrap_or(0.0);
    let tomorrow_max = weather_json["daily"]["temperature_2m_max"][1]
        .as_f64()
        .unwrap_or(0.0);

    // Weather code mapping (simplified)
    let weather_desc = match weather_code {
        0 => "맑음",
        1..=3 => "구름 조금",
        45 | 48 => "안개",
        51..=67 => "비/이슬비",
        71..=77 => "눈",
        80..=82 => "소나기",
        _ => "흐림",
    };

    // 2. Fetch some products for context
    let products: Vec<(String,)> = sqlx::query_as("SELECT product_name FROM products LIMIT 5")
        .fetch_all(&*state)
        .await
        .unwrap_or_default();
    let product_names = products
        .iter()
        .map(|p| p.0.clone())
        .collect::<Vec<_>>()
        .join(", ");

    // 3. AI Prompt
    let prompt = format!(
        "Role: Smart Marketing Consultant for a Mushroom Farm in Gangneung.\n\
         Current Weather: {} ({}°C)\n\
         Tomorrow Forecast: Min {}°C / Max {}°C\n\
         Available Products: {}\n\n\
         Task: Based on this weather, suggest a creative marketing strategy or a specific product recommendation in Korean. \
         Example: '내일부터 기온이 급감하니 따뜻한 버섯 전골 세트를 주력으로 홍보해보세요.' \
         Keep it short (2-3 sentences), warm, and professional.",
        weather_desc, current_temp, tomorrow_min, tomorrow_max, product_names
    );

    let marketing_advice = call_gemini_ai_internal(&api_key, &prompt)
        .await
        .unwrap_or_else(|_| {
            format!(
                "기온이 {}도인 날씨입니다. 따뜻한 버섯 요리를 추천해보는 건 어떨까요?",
                current_temp
            )
        });

    Ok(WeatherAdviceResult {
        weather_desc: weather_desc.to_string(),
        temperature: current_temp,
        marketing_advice,
    })
}

#[tauri::command]
async fn create_consultation(
    state: State<'_, DbPool>,
    customer_id: Option<String>,
    guest_name: String,
    contact: String,
    channel: String,
    counselor_name: String,
    category: String,
    title: String,
    content: String,
    priority: String,
) -> Result<i32, String> {
    // Basic Sentiment Analysis Rule-based
    let sentiment = if content.contains("화남")
        || content.contains("불만")
        || content.contains("반품")
        || content.contains("환불")
        || content.contains("실망")
        || title.contains("반품")
        || title.contains("불만")
    {
        "부정적"
    } else if content.contains("감사")
        || content.contains("좋아요")
        || content.contains("만족")
        || content.contains("최고")
        || content.contains("맛있")
    {
        "긍정적"
    } else {
        "중립"
    };

    let consult_id: (i32,) = sqlx::query_as(
        "INSERT INTO consultations (customer_id, guest_name, contact, channel, counselor_name, category, title, content, priority, sentiment) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING consult_id"
    )
    .bind(customer_id)
    .bind(guest_name)
    .bind(contact)
    .bind(channel)
    .bind(counselor_name)
    .bind(category)
    .bind(title)
    .bind(content)
    .bind(priority)
    .bind(sentiment)
    .fetch_one(&*state)
    .await
    .map_err(|e| e.to_string())?;

    Ok(consult_id.0)
}

#[tauri::command]
async fn get_consultations(
    state: State<'_, DbPool>,
    start_date: Option<String>,
    end_date: Option<String>,
) -> Result<Vec<db::Consultation>, String> {
    // Basic search - non-dynamic for simplicity in Postgres
    let rows = if let (Some(s), Some(e)) = (start_date, end_date) {
        let sd = NaiveDate::parse_from_str(&s, "%Y-%m-%d").unwrap_or_default();
        let ed = NaiveDate::parse_from_str(&e, "%Y-%m-%d").unwrap_or_default();
        sqlx::query_as::<_, db::Consultation>("SELECT * FROM consultations WHERE consult_date BETWEEN $1 AND $2 ORDER BY consult_date DESC, consult_id DESC")
            .bind(sd).bind(ed).fetch_all(&*state).await
    } else {
        sqlx::query_as::<_, db::Consultation>("SELECT * FROM consultations ORDER BY consult_date DESC, consult_id DESC LIMIT 200")
            .fetch_all(&*state).await
    }.map_err(|e| e.to_string())?;

    Ok(rows)
}

#[tauri::command]
async fn update_consultation(
    state: State<'_, DbPool>,
    consult_id: i32,
    answer: Option<String>,
    status: String,
    priority: String,
    follow_up_date: Option<String>,
) -> Result<(), String> {
    let f_date = follow_up_date.and_then(|s| NaiveDate::parse_from_str(&s, "%Y-%m-%d").ok());
    use std::sync::atomic::Ordering;
    DB_MODIFIED.store(true, Ordering::Relaxed);

    sqlx::query("UPDATE consultations SET answer=$1, status=$2, priority=$3, follow_up_date=$4 WHERE consult_id=$5")
        .bind(answer)
        .bind(status)
        .bind(priority)
        .bind(f_date)
        .bind(consult_id)
        .execute(&*state)
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
async fn delete_consultation(state: State<'_, DbPool>, consult_id: i32) -> Result<(), String> {
    sqlx::query("DELETE FROM consultations WHERE consult_id=$1")
        .bind(consult_id)
        .execute(&*state)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}
#[tauri::command]
async fn get_claim_customer_count(state: State<'_, DbPool>) -> Result<i64, String> {
    // Count distinct customers (members & guests) who have claims in the last 90 days
    let count: i64 = sqlx::query_scalar(
        "SELECT COUNT(DISTINCT COALESCE(s.customer_id, s.shipping_mobile_number)) 
         FROM sales_claims sc
         JOIN sales s ON sc.sales_id = s.sales_id
         WHERE sc.created_at >= CURRENT_DATE - INTERVAL '90 days'",
    )
    .fetch_one(&*state)
    .await
    .unwrap_or(0);

    Ok(count)
}

#[derive(serde::Serialize, FromRow)]
struct ClaimTarget {
    id: String,
    name: String,
    mobile: String,
    claim_type: String,
    reason: String,
    date: String,
    is_member: bool,
}

#[derive(serde::Serialize, sqlx::FromRow)]
pub struct SpecialCareCustomer {
    pub id: String,
    pub name: String,
    pub mobile: String,
    pub claim_count: i64,
    pub total_orders: i64,
    pub claim_ratio: f64,
    pub major_reason: Option<String>,
    pub last_claim_date: Option<String>,
    pub is_member: bool,
    pub outstanding_amount: Option<i32>,
}

#[tauri::command]
async fn get_claim_targets(
    state: State<'_, DbPool>,
    days: i32,
) -> Result<Vec<ClaimTarget>, String> {
    // We use DISTINCT ON to get only the latest claim for each customer contact during the period
    let sql = r#"
        SELECT 
            COALESCE(s.customer_id, 'GUEST-' || s.shipping_mobile_number) as id,
            COALESCE(c.customer_name, s.shipping_name) as name,
            COALESCE(c.mobile_number, s.shipping_mobile_number) as mobile,
            sc.claim_type,
            sc.reason_category as reason,
            to_char(sc.created_at, 'YYYY-MM-DD') as date,
            (s.customer_id IS NOT NULL) as is_member
        FROM (
            SELECT DISTINCT ON (COALESCE(s2.customer_id, s2.shipping_mobile_number))
                sc2.*
            FROM sales_claims sc2
            JOIN sales s2 ON sc2.sales_id = s2.sales_id
            WHERE sc2.created_at >= CURRENT_DATE - ($1 * INTERVAL '1 day')
            ORDER BY COALESCE(s2.customer_id, s2.shipping_mobile_number), sc2.created_at DESC
        ) sc
        JOIN sales s ON sc.sales_id = s.sales_id
        LEFT JOIN customers c ON s.customer_id = c.customer_id
        ORDER BY sc.created_at DESC
    "#;

    let rows = sqlx::query_as::<_, ClaimTarget>(sql)
        .bind(days)
        .fetch_all(&*state)
        .await
        .map_err(|e| e.to_string())?;

    Ok(rows)
}

#[tauri::command]
async fn get_special_care_customers(
    state: State<'_, DbPool>,
) -> Result<Vec<SpecialCareCustomer>, String> {
    // Strategy:
    // 1. Calculate Claim Stats per Customer (Count, Last Date)
    // 2. Identify Major Reason per Customer (using Window Function)
    // 3. Calculate Total Orders per Customer
    // 4. Join all and filter

    let sql = r#"
        WITH customer_base AS (
            -- Normalize Customer ID (Member vs Guest)
            SELECT 
                COALESCE(s.customer_id, 'GUEST-' || s.shipping_mobile_number) as id,
                COALESCE(c.customer_name, s.shipping_name) as name,
                COALESCE(c.mobile_number, s.shipping_mobile_number) as mobile,
                (s.customer_id IS NOT NULL) as is_member,
                -- New: Include current balance for members (0 for guests)
                COALESCE(c.current_balance, 0) as outstanding_balance
            FROM sales s
            LEFT JOIN customers c ON s.customer_id = c.customer_id
            GROUP BY 
                COALESCE(s.customer_id, 'GUEST-' || s.shipping_mobile_number),
                COALESCE(c.customer_name, s.shipping_name),
                COALESCE(c.mobile_number, s.shipping_mobile_number),
                (s.customer_id IS NOT NULL),
                c.current_balance
        ),
        claim_stats AS (
            SELECT 
                COALESCE(s.customer_id, 'GUEST-' || s.shipping_mobile_number) as id,
                COUNT(sc.claim_id) as claim_count,
                MAX(sc.created_at) as last_claim_ts
            FROM sales_claims sc
            JOIN sales s ON sc.sales_id = s.sales_id
            GROUP BY COALESCE(s.customer_id, 'GUEST-' || s.shipping_mobile_number)
        ),
        major_reasons AS (
            SELECT DISTINCT ON (id)
                id,
                reason_category as major_reason
            FROM (
                SELECT 
                    COALESCE(s.customer_id, 'GUEST-' || s.shipping_mobile_number) as id,
                    sc.reason_category,
                    COUNT(*) as reason_count
                FROM sales_claims sc
                JOIN sales s ON sc.sales_id = s.sales_id
                GROUP BY COALESCE(s.customer_id, 'GUEST-' || s.shipping_mobile_number), sc.reason_category
                ORDER BY id, reason_count DESC
            ) sub
        ),
        order_stats AS (
            SELECT 
                COALESCE(customer_id, 'GUEST-' || shipping_mobile_number) as id,
                COUNT(*) as total_orders
            FROM sales
            GROUP BY id
        )
        SELECT 
            cb.id,
            cb.name,
            cb.mobile,
            COALESCE(cs.claim_count, 0) as claim_count,
            COALESCE(os.total_orders, 0) as total_orders,
            CASE 
                WHEN COALESCE(os.total_orders, 0) > 0 THEN (COALESCE(cs.claim_count, 0)::float / os.total_orders::float) * 100.0
                ELSE 0 
            END as claim_ratio,
            mr.major_reason,
            to_char(cs.last_claim_ts, 'YYYY-MM-DD') as last_claim_date,
            cb.is_member,
            cb.outstanding_balance as outstanding_amount
        FROM customer_base cb
        JOIN claim_stats cs ON cb.id = cs.id
        LEFT JOIN order_stats os ON cb.id = os.id
        LEFT JOIN major_reasons mr ON cb.id = mr.id
        WHERE cs.claim_count > 0 OR cb.outstanding_balance > 0 -- Show if they have claims OR money owed
        ORDER BY cs.claim_count DESC NULLS LAST, cb.outstanding_balance DESC NULLS LAST
        LIMIT 100
    "#;

    let rows = sqlx::query_as::<_, SpecialCareCustomer>(sql)
        .fetch_all(&*state)
        .await
        .map_err(|e| e.to_string())?;

    Ok(rows)
}

#[tauri::command]
async fn create_sales_claim(
    state: State<'_, DbPool>,
    sales_id: String,
    customer_id: Option<String>,
    claim_type: String, // '취소', '반품', '교환'
    reason_category: String,
    quantity: i32,
    memo: Option<String>,
) -> Result<i32, String> {
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
    .fetch_one(&*state)
    .await
    .map_err(|e| e.to_string())?;

    Ok(row.0)
}

#[tauri::command]
async fn get_sales_claims(
    state: State<'_, DbPool>,
    start_date: Option<String>,
    end_date: Option<String>,
) -> Result<Vec<SalesClaim>, String> {
    let sql = "SELECT c.*, cu.customer_name 
               FROM sales_claims c 
               LEFT JOIN customers cu ON c.customer_id = cu.customer_id ";

    let rows = if let (Some(s), Some(e)) = (start_date, end_date) {
        let sd = NaiveDate::parse_from_str(&s, "%Y-%m-%d").unwrap_or_default();
        let ed = NaiveDate::parse_from_str(&e, "%Y-%m-%d").unwrap_or_default();
        let query = format!(
            "{} WHERE c.created_at::date BETWEEN $1 AND $2 ORDER BY c.created_at DESC",
            sql
        );
        sqlx::query_as::<_, SalesClaim>(&query)
            .bind(sd)
            .bind(ed)
            .fetch_all(&*state)
            .await
    } else {
        let query = format!("{} ORDER BY c.created_at DESC LIMIT 100", sql);
        sqlx::query_as::<_, SalesClaim>(&query)
            .fetch_all(&*state)
            .await
    }
    .map_err(|e| e.to_string())?;

    Ok(rows)
}

#[tauri::command]
async fn process_sales_claim(
    state: State<'_, DbPool>,
    claim_id: i32,
    claim_status: String, // '완료', '거절'
    is_inventory_recovered: bool,
    refund_amount: i32,
) -> Result<(), String> {
    use std::sync::atomic::Ordering;
    DB_MODIFIED.store(true, Ordering::Relaxed);

    let mut tx = state.begin().await.map_err(|e| e.to_string())?;

    // 1. Get Claim Info
    let claim: SalesClaim = sqlx::query_as("SELECT * FROM sales_claims WHERE claim_id = $1")
        .bind(claim_id)
        .fetch_one(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    // 2. Update Claim Status
    sqlx::query("UPDATE sales_claims SET claim_status = $1, is_inventory_recovered = $2, refund_amount = $3 WHERE claim_id = $4")
        .bind(&claim_status)
        .bind(is_inventory_recovered)
        .bind(refund_amount)
        .bind(claim_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    // 3. If Completion, update sales status
    if claim_status == "완료" {
        let new_sales_status = match claim.claim_type.as_str() {
            "취소" => "취소",
            "반품" => "반품완료",
            "교환" => "교환완료",
            _ => "완료",
        };

        // Update Sales Status - Trigger handles inventory if status is '취소' or '반품완료'
        sqlx::query("UPDATE sales SET status = $1 WHERE sales_id = $2")
            .bind(new_sales_status)
            .bind(&claim.sales_id)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
    }

    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn delete_sales_claim(state: State<'_, DbPool>, claim_id: i32) -> Result<(), String> {
    DB_MODIFIED.store(true, Ordering::Relaxed);
    let mut tx = state.begin().await.map_err(|e| e.to_string())?;

    // 1. Get info to check if restoration is needed
    let claim: SalesClaim = sqlx::query_as("SELECT * FROM sales_claims WHERE claim_id = $1")
        .bind(claim_id)
        .fetch_one(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    // 2. If it was completed, restore sale status
    if claim.claim_status == "완료" {
        let restored_status = match claim.claim_type.as_str() {
            "취소" => "접수",
            "반품" | "교환" => "배송완료",
            _ => "배송완료",
        };
        sqlx::query("UPDATE sales SET status = $1 WHERE sales_id = $2")
            .bind(restored_status)
            .bind(&claim.sales_id)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
    }

    // 3. Delete
    sqlx::query("DELETE FROM sales_claims WHERE claim_id = $1")
        .bind(claim_id)
        .execute(&mut *tx)
        .await
        .map_err(|e: sqlx::Error| e.to_string())?;

    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn update_sales_claim(
    state: State<'_, DbPool>,
    claim_id: i32,
    reason_category: String,
    quantity: i32,
    memo: Option<String>,
) -> Result<(), String> {
    DB_MODIFIED.store(true, Ordering::Relaxed);
    sqlx::query("UPDATE sales_claims SET reason_category = $1, quantity = $2, memo = $3 WHERE claim_id = $4")
        .bind(reason_category)
        .bind(quantity)
        .bind(memo)
        .bind(claim_id)
        .execute(&*state)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn get_consultation_ai_advisor(
    app: tauri::AppHandle,
    state: State<'_, DbPool>,
    customer_id: Option<String>,
    category: String,
    title: String,
    content: String,
) -> Result<ConsultationAiAdvice, String> {
    let api_key = get_gemini_api_key(&app).ok_or("Gemini API 키가 필요합니다.")?;

    // 1. Fetch Customer Context if available
    let mut context = format!(
        "Inquiry Category: {}\nTitle: {}\nContent: {}\n\n",
        category, title, content
    );

    if let Some(cid) = customer_id {
        let customer: Option<Customer> =
            sqlx::query_as("SELECT * FROM customers WHERE customer_id = $1")
                .bind(&cid)
                .fetch_optional(&*state)
                .await
                .map_err(|e| e.to_string())?;

        if let Some(c) = customer {
            context.push_str(&format!(
                "Customer: {} (Level: {})\n",
                c.customer_name,
                c.membership_level.unwrap_or_default()
            ));
            context.push_str(&format!("Notes: {}\n", c.memo.unwrap_or_default()));
        }

        // Fetch recent sales for context
        let sales: Vec<Sales> = sqlx::query_as("SELECT * FROM sales WHERE customer_id = $1 AND status != '취소' ORDER BY order_date DESC LIMIT 5")
            .bind(&cid)
            .fetch_all(&*state)
            .await
            .map_err(|e| e.to_string())?;

        if !sales.is_empty() {
            context.push_str("Recent Purchases:\n");
            for s in sales {
                let date_str = s
                    .order_date
                    .map(|d| d.to_string())
                    .unwrap_or_else(|| "Unknown".to_string());
                context.push_str(&format!(
                    "- {}: {} ({})\n",
                    date_str, s.product_name, s.quantity
                ));
            }
        }
    }

    // 2. Prepare AI Prompt
    let prompt = format!(
        "Role: Professional Customer Excellence Advisor for a Premium Mushroom Farm.\n\
         Context:\n{}\n\
         Task: Provide professional guidance for this inquiry.\n\
         Output JSON exactly (no other text):\n\
         {{\n\
           \"analysis\": \"Analysis of customer intent or problem in Korean.\",\n\
           \"strategy\": \"Communication strategy to handle this specifically in Korean.\",\n\
           \"recommended_answer\": \"Polite, high-quality draft answer in Korean.\",\n\
           \"caution_points\": \"Things to watch out for to prevent complaints in Korean.\"\n\
         }}",
        context
    );

    // 3. Call AI
    let result_json = call_gemini_ai_internal(&api_key, &prompt).await?;

    // 4. Parse JSON
    // The response might be wrapped in ```json ... ```
    let cleaned_json = if result_json.trim().starts_with("```") {
        let lines: Vec<&str> = result_json.trim().lines().collect();
        if lines.len() > 2 {
            lines[1..lines.len() - 1].join("\n")
        } else {
            result_json
        }
    } else {
        result_json
    };

    serde_json::from_str(cleaned_json.trim()).map_err(|e| {
        format!(
            "AI 응답 파싱 실패: {}\nOriginal response: {}",
            e, cleaned_json
        )
    })
}
#[tauri::command]
async fn test_gemini_connection(key: String) -> Result<String, String> {
    let prompt = "Hello! Please reply with exactly 'OK' to confirm connectivity.";
    call_gemini_ai_internal(&key, prompt).await
}
#[tauri::command]
async fn get_profit_margin_analysis(
    state: State<'_, DbPool>,
    year: i32,
) -> Result<Vec<ProfitAnalysisResult>, String> {
    let sql = r#"
        SELECT 
            s.product_name,
            COUNT(*) as record_count,
            CAST(SUM(s.quantity) AS BIGINT) as total_quantity,
            CAST(SUM(s.total_amount) AS BIGINT) as total_revenue,
            CAST(COALESCE(p.cost_price, 0) AS BIGINT) as unit_cost,
            CAST(SUM(s.quantity * COALESCE(p.cost_price, 0)) AS BIGINT) as total_cost,
            CAST(SUM(s.total_amount) - SUM(s.quantity * COALESCE(p.cost_price, 0)) AS BIGINT) as net_profit,
            CASE 
                WHEN SUM(s.total_amount) > 0 THEN 
                    (CAST(SUM(s.total_amount) - SUM(s.quantity * COALESCE(p.cost_price, 0)) AS DOUBLE PRECISION) / CAST(SUM(s.total_amount) AS DOUBLE PRECISION)) * 100.0
                ELSE 0.0
            END as margin_rate
        FROM sales s
        LEFT JOIN products p ON s.product_name = p.product_name
        WHERE EXTRACT(YEAR FROM s.order_date) = $1 AND s.status != '취소'
        GROUP BY s.product_name, p.cost_price
        ORDER BY net_profit DESC
    "#;

    sqlx::query_as::<_, ProfitAnalysisResult>(sql)
        .bind(year)
        .fetch_all(&*state)
        .await
        .map_err(|e| e.to_string())
}

#[derive(serde::Serialize)]
struct SmsResult {
    success: bool,
    message_id: Option<String>,
    error: Option<String>,
}

#[tauri::command]
async fn send_sms_simulation(
    app: tauri::AppHandle,
    _state: State<'_, DbPool>,
    mode: String,            // "sms" or "kakao"
    recipients: Vec<String>, // List of mobile numbers
    content: String,
    template_code: Option<String>, // Required for Kakao
) -> Result<SmsResult, String> {
    // 1. Get SMS Config
    let config = get_sms_config_for_ui(app.clone()).await?;

    // 2. Check Prerequisites
    if let Some(cfg) = config {
        if cfg.api_key.trim().is_empty() {
            return Ok(SmsResult {
                success: false,
                message_id: None,
                error: Some(
                    "API Key가 설정되지 않았습니다. 설정 > 외부 서비스 연동에서 키를 입력해주세요."
                        .to_string(),
                ),
            });
        }
        if cfg.sender_number.trim().is_empty() {
            return Ok(SmsResult {
                success: false,
                message_id: None,
                error: Some("발신번호가 설정되지 않았습니다.".to_string()),
            });
        }

        // 3. Provider Specific Logic (Simulation for now, but ready for logic hook)
        let provider = cfg.provider.unwrap_or_else(|| "unknown".to_string());

        // Log simulation
        println!(">>> Sending {} via Provider: {}", mode, provider);
        println!(">>> Sender: {}", cfg.sender_number);
        println!(">>> Recipients: {} persons", recipients.len());
        println!(">>> Content: {}", content);
        if let Some(code) = &template_code {
            println!(">>> Template Code: {}", code);
        }

        // 4. (Optional) Insert into DB log in future
        // TODO: Create a 'message_logs' table to record history

        // 5. Success Simulation
        Ok(SmsResult {
            success: true,
            message_id: Some(format!("{}-{}-{}", provider, mode, Utc::now().timestamp())),
            error: None,
        })
    } else {
        Ok(SmsResult {
            success: false,
            message_id: None,
            error: Some("SMS 설정 정보를 찾을 수 없습니다.".to_string()),
        })
    }
}

#[tauri::command]
async fn get_consultation_briefing(
    app: tauri::AppHandle,
    state: State<'_, DbPool>,
    customer_id: String,
) -> Result<String, String> {
    let api_key = get_gemini_api_key(&app).ok_or("Gemini API 키가 필요합니다.")?;

    let customer: Option<Customer> =
        sqlx::query_as("SELECT * FROM customers WHERE customer_id = $1")
            .bind(&customer_id)
            .fetch_optional(&*state)
            .await
            .map_err(|e| e.to_string())?;

    let c = customer.ok_or("고객 정보를 찾을 수 없습니다.")?;

    let history: Vec<db::Consultation> = sqlx::query_as(
        "SELECT * FROM consultations WHERE customer_id = $1 ORDER BY consult_date DESC LIMIT 30",
    )
    .bind(&customer_id)
    .fetch_all(&*state)
    .await
    .map_err(|e| e.to_string())?;

    if history.is_empty() {
        return Ok("이전 상담 내역이 없는 신규 고객입니다.".to_string());
    }

    let mut context_str = format!(
        "고객명: {} ({})\n상담 내역:\n",
        c.customer_name,
        c.membership_level.unwrap_or_default()
    );
    for h in history {
        context_str.push_str(&format!(
            "- [{} / {}] 제목: {} | 내용: {} | 답변: {}\n",
            h.consult_date,
            h.category,
            h.title,
            h.content,
            h.answer.unwrap_or_default()
        ));
    }

    let prompt = format!(
        "당신은 스마트 농장의 전문 상담 관리자입니다. 아래의 고객 상담 이력을 바탕으로, 상담원이 전화를 걸기 전 읽어야 할 '핵심 브리핑'을 3줄 내외로 요약해 주세요. 이 고객의 성향, 과거 주요 문의, 주의사항을 포함해야 합니다. 한국어로 정중하게 작성하세요.\n\n\
        {}\n\n\
        **브리핑:**",
        context_str
    );

    call_gemini_ai_internal(&api_key, &prompt).await
}

#[tauri::command]
async fn get_pending_consultations_summary(
    app: tauri::AppHandle,
    state: State<'_, DbPool>,
) -> Result<String, String> {
    let api_key = get_gemini_api_key(&app).ok_or("Gemini API 키가 설정되지 않았습니다.")?;

    let pending: Vec<db::Consultation> = sqlx::query_as(
        "SELECT * FROM consultations WHERE status != '완료' ORDER BY consult_date DESC LIMIT 50",
    )
    .fetch_all(&*state)
    .await
    .map_err(|e| e.to_string())?;

    if pending.is_empty() {
        return Ok("현재 처리 대기 중인 상담이 없습니다. 평화로운 하루입니다! 😊".to_string());
    }

    let mut context = String::new();
    for p in pending {
        context.push_str(&format!(
            "- [{} / {}] 우선순위: {} | 제목: {} | 내용: {}\n",
            p.consult_date, p.category, p.priority, p.title, p.content
        ));
    }

    let prompt = format!(
        "당신은 스마트 농장의 고객 관리 전략가입니다. 아래의 '처리 대기 중인 상담 리스트'를 보고 사장님을 위한 1분 요약 브리핑을 작성해 주세요.\n\n\
        [대기 리스트]\n\
        {}\n\n\
        [작성 지침]\n\
        1. 현재 가장 시급한 상담 테마가 무엇인지(예: 배송 지연, 상품 불만 등) 파악하여 상단에 명시하세요.\n\
        2. 전체적인 상담 감정 상태가 어떤지 요약하세요.\n\
        3. 사장님이 오늘 가장 먼저 챙겨야 할 핵심 액션 플랜을 1~2개 제안하세요.\n\
        4. HTML 형식으로 깔끔하게 작성하세요 (div, p, ul, li, span 등 사용, 💡 이모지 활용).\n\
        5. 정중하고 활기찬 한국어를 사용하세요.",
        context
    );

    call_gemini_ai_internal(&api_key, &prompt).await
}

#[tauri::command]
async fn get_ai_consultation_advice(
    app: tauri::AppHandle,
    category: String,
    content: String,
    priority: String,
) -> Result<String, String> {
    let api_key = get_gemini_api_key(&app).ok_or("Gemini API 키가 필요합니다.")?;

    let prompt = format!(
        "당신은 스마트 농장의 고객 만족 전문가입니다. 아래의 상담 내용에 대해 어떻게 대응하면 좋을지 전문적인 조언을 3~4문장으로 작성해 주세요.\n\n\
        - 상담 유형: {}\n\
        - 우선순위: {}\n\
        - 상담 내용: {}\n\n\
        상담원이 고객에게 전할 실질적인 멘트나 해결 가이드를 포함해 주세요. 말투는 정중하고 신뢰감 있어야 합니다.",
        category, priority, content
    );

    call_gemini_ai_internal(&api_key, &prompt).await
}

// --- Financial Management Commands (Vendors, Purchases, Expenses) ---

#[tauri::command]
async fn get_vendor_list(state: State<'_, DbPool>) -> Result<Vec<Vendor>, String> {
    sqlx::query_as::<_, Vendor>("SELECT * FROM vendors ORDER BY vendor_name ASC")
        .fetch_all(&*state)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn save_vendor(state: State<'_, DbPool>, vendor: Vendor) -> Result<i32, String> {
    if let Some(id) = vendor.vendor_id {
        sqlx::query(
            "UPDATE vendors SET vendor_name=$1, business_number=$2, representative=$3, mobile_number=$4, 
             email=$5, address=$6, main_items=$7, memo=$8, is_active=$9 WHERE vendor_id=$10"
        )
        .bind(&vendor.vendor_name)
        .bind(&vendor.business_number)
        .bind(&vendor.representative)
        .bind(&vendor.mobile_number)
        .bind(&vendor.email)
        .bind(&vendor.address)
        .bind(&vendor.main_items)
        .bind(&vendor.memo)
        .bind(vendor.is_active.unwrap_or(true))
        .bind(id)
        .execute(&*state)
        .await
        .map_err(|e| e.to_string())?;
        Ok(id)
    } else {
        let row: (i32,) = sqlx::query_as(
            "INSERT INTO vendors (vendor_name, business_number, representative, mobile_number, email, address, main_items, memo) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING vendor_id"
        )
        .bind(&vendor.vendor_name)
        .bind(&vendor.business_number)
        .bind(&vendor.representative)
        .bind(&vendor.mobile_number)
        .bind(&vendor.email)
        .bind(&vendor.address)
        .bind(&vendor.main_items)
        .bind(&vendor.memo)
        .fetch_one(&*state)
        .await
        .map_err(|e| e.to_string())?;
        Ok(row.0)
    }
}

#[tauri::command]
async fn delete_vendor(state: State<'_, DbPool>, id: i32) -> Result<(), String> {
    // 1. Check if there are any purchases linked to this vendor
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM purchases WHERE vendor_id = $1")
        .bind(id)
        .fetch_one(&*state)
        .await
        .map_err(|e| e.to_string())?;

    if count > 0 {
        return Err("이 공급처는 이미 매입 내역이 등록되어 있어 삭제할 수 없습니다.\n과거 기록 보존을 위해 이름을 '(중지) 익스프레스'와 같이 수정하여 관리하시거나, 관련 매입 내역을 먼저 삭제해야 합니다.".to_string());
    }

    // 2. No dependencies, proceed with deletion
    sqlx::query("DELETE FROM vendors WHERE vendor_id=$1")
        .bind(id)
        .execute(&*state)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn get_purchase_list(
    state: State<'_, DbPool>,
    start_date: Option<String>,
    end_date: Option<String>,
    vendor_id: Option<i32>,
) -> Result<Vec<Purchase>, String> {
    let sql = "SELECT p.*, v.vendor_name FROM purchases p 
         LEFT JOIN vendors v ON p.vendor_id = v.vendor_id 
         WHERE ($1 IS NULL OR purchase_date >= $1)
         AND ($2 IS NULL OR purchase_date <= $2)
         AND ($3 IS NULL OR p.vendor_id = $3)
         ORDER BY purchase_date DESC, purchase_id DESC";

    let sd = start_date.and_then(|s| NaiveDate::parse_from_str(&s, "%Y-%m-%d").ok());
    let ed = end_date.and_then(|s| NaiveDate::parse_from_str(&s, "%Y-%m-%d").ok());

    sqlx::query_as::<_, Purchase>(sql)
        .bind(sd)
        .bind(ed)
        .bind(vendor_id)
        .fetch_all(&*state)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn save_purchase(
    state: State<'_, DbPool>,
    purchase: Purchase,
    inventory_sync_data: Option<Vec<InventorySyncItem>>,
) -> Result<i32, String> {
    DB_MODIFIED.store(true, Ordering::Relaxed);

    let mut tx = state
        .begin()
        .await
        .map_err(|e: sqlx::Error| e.to_string())?;

    let purchase_id: i32;

    if let Some(id) = purchase.purchase_id {
        sqlx::query(
            "UPDATE purchases SET vendor_id=$1, purchase_date=$2, item_name=$3, specification=$4, 
             quantity=$5, unit_price=$6, total_amount=$7, payment_status=$8, memo=$9, inventory_synced=$10, material_item_id=$11 
             WHERE purchase_id=$12",
        )
        .bind(purchase.vendor_id)
        .bind(purchase.purchase_date)
        .bind(&purchase.item_name)
        .bind(&purchase.specification)
        .bind(purchase.quantity)
        .bind(purchase.unit_price)
        .bind(purchase.total_amount)
        .bind(&purchase.payment_status)
        .bind(&purchase.memo)
        .bind(purchase.inventory_synced.unwrap_or(false))
        .bind(purchase.material_item_id)
        .bind(id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
        purchase_id = id;
    } else {
        let row: (i32,) = sqlx::query_as(
            "INSERT INTO purchases (vendor_id, purchase_date, item_name, specification, quantity, unit_price, total_amount, payment_status, memo, inventory_synced, material_item_id) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING purchase_id"
        )
        .bind(purchase.vendor_id)
        .bind(purchase.purchase_date)
        .bind(&purchase.item_name)
        .bind(&purchase.specification)
        .bind(purchase.quantity)
        .bind(purchase.unit_price)
        .bind(purchase.total_amount)
        .bind(&purchase.payment_status)
        .bind(&purchase.memo)
        .bind(purchase.inventory_synced.unwrap_or(false))
        .bind(purchase.material_item_id)
        .fetch_one(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
        purchase_id = row.0;
    }

    // 1. Process Material Buy (Increase purchased item stock)
    if let Some(m_id) = purchase.material_item_id {
        // Fetch Material Info
        let m_prod: (String, Option<String>, i32) = sqlx::query_as(
            "SELECT product_name, specification, stock_quantity FROM products WHERE product_id = $1"
        )
        .bind(m_id)
        .fetch_one(&mut *tx)
        .await
        .map_err(|e| format!("Material lookup failed: {}", e))?;

        let new_m_stock = m_prod.2 + purchase.quantity;

        // Update Material Stock
        sqlx::query("UPDATE products SET stock_quantity = $1 WHERE product_id = $2")
            .bind(new_m_stock)
            .bind(m_id)
            .execute(&mut *tx)
            .await
            .map_err(|e| format!("Material stock update failed: {}", e))?;

        // Log Material In
        sqlx::query(
            "INSERT INTO inventory_logs (product_name, specification, change_type, change_quantity, current_stock, reference_id, memo)
             VALUES ($1, $2, $3, $4, $5, $6, $7)"
        )
        .bind(&m_prod.0)
        .bind(&m_prod.1)
        .bind("입고")
        .bind(purchase.quantity)
        .bind(new_m_stock)
        .bind(purchase_id.to_string())
        .bind(format!("매입 직입고 (#{}): {}", purchase_id, purchase.item_name))
        .execute(&mut *tx)
        .await
        .map_err(|e| format!("Material stock log failed: {}", e))?;

        // 2. Process Instant Conversion (Decrease Material, Increase Products)
        if let Some(sync_items) = inventory_sync_data {
            let mut current_m_stock = new_m_stock;

            for item in sync_items {
                // Fetch Product Info
                let product: (String, Option<String>, i32) = sqlx::query_as(
                    "SELECT product_name, specification, stock_quantity FROM products WHERE product_id = $1"
                )
                .bind(item.product_id)
                .fetch_one(&mut *tx)
                .await
                .map_err(|e| format!("Product lookup failed: {}", e))?;

                // Product Stock Increase
                let new_p_stock = product.2 + item.quantity;
                sqlx::query("UPDATE products SET stock_quantity = $1 WHERE product_id = $2")
                    .bind(new_p_stock)
                    .bind(item.product_id)
                    .execute(&mut *tx)
                    .await
                    .map_err(|e| format!("Product stock update failed: {}", e))?;

                // Material Stock Decrease
                current_m_stock -= item.quantity;
                sqlx::query("UPDATE products SET stock_quantity = $1 WHERE product_id = $2")
                    .bind(current_m_stock)
                    .bind(m_id)
                    .execute(&mut *tx)
                    .await
                    .map_err(|e| format!("Material reduction failed: {}", e))?;

                // Log Product In
                sqlx::query(
                    "INSERT INTO inventory_logs (product_name, specification, change_type, change_quantity, current_stock, reference_id, memo)
                    VALUES ($1, $2, $3, $4, $5, $6, $7)"
                )
                .bind(&product.0)
                .bind(&product.1)
                .bind("입고")
                .bind(item.quantity)
                .bind(new_p_stock)
                .bind(purchase_id.to_string())
                .bind(format!("매입 전환 생산 (#{}): {} 자재 사용", purchase_id, m_prod.0))
                .execute(&mut *tx)
                .await
                .map_err(|e| format!("Product stock log failed: {}", e))?;

                // Log Material Out (Conversion)
                sqlx::query(
                    "INSERT INTO inventory_logs (product_name, specification, change_type, change_quantity, current_stock, reference_id, memo)
                    VALUES ($1, $2, $3, $4, $5, $6, $7)"
                )
                .bind(&m_prod.0)
                .bind(&m_prod.1)
                .bind("출고")
                .bind(-item.quantity)
                .bind(current_m_stock)
                .bind(purchase_id.to_string())
                .bind(format!("생산 전환 소모 (#{}): {} 상품 제작", purchase_id, product.0))
                .execute(&mut *tx)
                .await
                .map_err(|e| format!("Material reduction log failed: {}", e))?;
            }
        }
    }

    tx.commit().await.map_err(|e| e.to_string())?;

    Ok(purchase_id)
}

#[tauri::command]
async fn delete_purchase(state: State<'_, DbPool>, id: i32) -> Result<(), String> {
    sqlx::query("DELETE FROM purchases WHERE purchase_id=$1")
        .bind(id)
        .execute(&*state)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn get_expense_list(
    state: State<'_, DbPool>,
    start_date: Option<String>,
    end_date: Option<String>,
    category: Option<String>,
) -> Result<Vec<Expense>, String> {
    let mut sql = String::from("SELECT * FROM expenses WHERE 1=1 ");
    if start_date.is_some() {
        sql.push_str("AND expense_date >= $1 ");
    }
    if end_date.is_some() {
        sql.push_str("AND expense_date <= $2 ");
    }
    if category.is_some() {
        sql.push_str("AND category = $3 ");
    }
    sql.push_str("ORDER BY expense_date DESC, expense_id DESC");

    let sd = start_date.and_then(|s| NaiveDate::parse_from_str(&s, "%Y-%m-%d").ok());
    let ed = end_date.and_then(|s| NaiveDate::parse_from_str(&s, "%Y-%m-%d").ok());

    sqlx::query_as::<_, Expense>(&sql)
        .bind(sd)
        .bind(ed)
        .bind(category)
        .fetch_all(&*state)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn save_expense(state: State<'_, DbPool>, expense: Expense) -> Result<i32, String> {
    if let Some(id) = expense.expense_id {
        sqlx::query(
            "UPDATE expenses SET expense_date=$1, category=$2, amount=$3, payment_method=$4, memo=$5 
             WHERE expense_id=$6"
        )
        .bind(expense.expense_date)
        .bind(&expense.category)
        .bind(expense.amount)
        .bind(&expense.payment_method)
        .bind(&expense.memo)
        .bind(id)
        .execute(&*state)
        .await
        .map_err(|e| e.to_string())?;
        Ok(id)
    } else {
        let row: (i32,) = sqlx::query_as(
            "INSERT INTO expenses (expense_date, category, amount, payment_method, memo) 
             VALUES ($1, $2, $3, $4, $5) RETURNING expense_id",
        )
        .bind(expense.expense_date)
        .bind(&expense.category)
        .bind(expense.amount)
        .bind(&expense.payment_method)
        .bind(&expense.memo)
        .fetch_one(&*state)
        .await
        .map_err(|e| e.to_string())?;
        Ok(row.0)
    }
}

#[tauri::command]
async fn delete_expense(state: State<'_, DbPool>, id: i32) -> Result<(), String> {
    sqlx::query("DELETE FROM expenses WHERE expense_id=$1")
        .bind(id)
        .execute(&*state)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}
#[derive(Debug, serde::Serialize, sqlx::FromRow)]
pub struct MonthlyPlReport {
    pub month: String,
    pub revenue: i64,
    pub cost: i64,
    pub profit: i64,
    pub profit_margin: f64,
}

#[derive(Debug, serde::Serialize, sqlx::FromRow)]
pub struct CostBreakdownStats {
    pub category: String,
    pub amount: i64,
    pub percentage: f64,
}

#[derive(Debug, serde::Serialize, sqlx::FromRow)]
pub struct VendorPurchaseStats {
    pub vendor_name: String,
    pub total_amount: i64,
    pub purchase_count: i64,
}

#[tauri::command]
async fn get_monthly_pl_report(
    state: State<'_, DbPool>,
    year: i32,
) -> Result<Vec<MonthlyPlReport>, String> {
    // Join them all together roughly.
    // Since sqlx doesn't support easy full outer join of 3 unrelated subqueries easily without complex COALESCE,
    // we will use a generated series of months for the year to drive the join.
    let sql = r#"
        WITH months AS (
            SELECT TO_CHAR(DATE_TRUNC('month', (DATE ($1 || '-01-01') + (n || ' months')::interval)), 'YYYY-MM') as ym
            FROM generate_series(0, 11) n
        ),
        rev AS (
            SELECT TO_CHAR(order_date, 'YYYY-MM') as m, SUM(total_amount) as val
            FROM sales 
            WHERE EXTRACT(YEAR FROM order_date) = $1::int AND status NOT IN ('취소', '반품완료')
            GROUP BY 1
        ),
        pur AS (
            SELECT TO_CHAR(purchase_date, 'YYYY-MM') as m, SUM(total_amount) as val
            FROM purchases
            WHERE EXTRACT(YEAR FROM purchase_date) = $1::int
            GROUP BY 1
        ),
        exp AS (
            SELECT TO_CHAR(expense_date, 'YYYY-MM') as m, SUM(amount) as val
            FROM expenses
            WHERE EXTRACT(YEAR FROM expense_date) = $1::int
            GROUP BY 1
        )
        SELECT 
            months.ym as month,
            COALESCE(rev.val, 0) as revenue,
            (COALESCE(pur.val, 0) + COALESCE(exp.val, 0)) as cost,
            (COALESCE(rev.val, 0) - (COALESCE(pur.val, 0) + COALESCE(exp.val, 0))) as profit,
            CASE 
                WHEN COALESCE(rev.val, 0) > 0 THEN 
                    ROUND(((COALESCE(rev.val, 0) - (COALESCE(pur.val, 0) + COALESCE(exp.val, 0)))::numeric / COALESCE(rev.val, 0)::numeric * 100.0), 1)::float8
                ELSE 0.0
            END as profit_margin
        FROM months
        LEFT JOIN rev ON months.ym = rev.m
        LEFT JOIN pur ON months.ym = pur.m
        LEFT JOIN exp ON months.ym = exp.m
        ORDER BY months.ym
    "#;

    let rows = sqlx::query_as::<_, MonthlyPlReport>(sql)
        .bind(year.to_string()) // Postgres string concat needs string year for date construction, or convert logic
        .fetch_all(&*state)
        .await
        .map_err(|e| e.to_string())?;

    Ok(rows)
}

#[tauri::command]
async fn get_cost_breakdown_stats(
    state: State<'_, DbPool>,
    year: i32,
) -> Result<Vec<CostBreakdownStats>, String> {
    // Union Purchases (as '원자재/물품대') and Expenses (by category)
    let sql = r#"
        WITH combined_cost AS (
            SELECT '원자재/물품대' as cat, total_amount as amt FROM purchases WHERE EXTRACT(YEAR FROM purchase_date) = $1
            UNION ALL
            SELECT category as cat, amount as amt FROM expenses WHERE EXTRACT(YEAR FROM expense_date) = $1
        ),
        total AS (
            SELECT SUM(amt) as total_amt FROM combined_cost
        )
        SELECT 
            cat as category,
            SUM(amt) as amount,
            CASE 
                WHEN (SELECT total_amt FROM total) > 0 THEN 
                    ROUND((SUM(amt)::numeric / (SELECT total_amt FROM total)::numeric * 100.0), 1)::float8
                ELSE 0.0
            END as percentage
        FROM combined_cost
        GROUP BY cat
        ORDER BY amount DESC
    "#;

    sqlx::query_as::<_, CostBreakdownStats>(sql)
        .bind(year as f64) // EXTRACT returns float
        .fetch_all(&*state)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_vendor_purchase_ranking(
    state: State<'_, DbPool>,
    year: i32,
) -> Result<Vec<VendorPurchaseStats>, String> {
    let sql = r#"
        SELECT 
            v.vendor_name,
            COALESCE(SUM(p.total_amount), 0) as total_amount,
            COUNT(p.purchase_id) as purchase_count
        FROM purchases p
        JOIN vendors v ON p.vendor_id = v.vendor_id
        WHERE EXTRACT(YEAR FROM p.purchase_date) = $1
        GROUP BY v.vendor_name
        ORDER BY total_amount DESC
        LIMIT 10
    "#;

    sqlx::query_as::<_, VendorPurchaseStats>(sql)
        .bind(year as f64)
        .fetch_all(&*state)
        .await
        .map_err(|e| e.to_string())
}

// ============ Authentication Commands ============

#[derive(Debug, serde::Serialize, serde::Deserialize)]
pub struct LoginResponse {
    pub success: bool,
    pub message: String,
    pub user_id: Option<i32>,
    pub username: Option<String>,
    pub role: Option<String>,
}

#[tauri::command]
async fn verify_admin_password(state: State<'_, DbPool>, password: String) -> Result<bool, String> {
    let user_result = sqlx::query_as::<_, User>(
        "SELECT id, username, password_hash, role, created_at, updated_at FROM users WHERE username = 'admin'",
    )
    .fetch_optional(&*state)
    .await
    .map_err(|e| e.to_string())?;

    match user_result {
        Some(user) => {
            if let Some(hash) = &user.password_hash {
                match verify(&password, hash) {
                    Ok(is_valid) => Ok(is_valid),
                    Err(_) => Err("Password verification error".to_string()),
                }
            } else {
                Err("Admin user has no password set".to_string())
            }
        }
        None => Err("Admin user not found".to_string()),
    }
}

#[tauri::command]
async fn login(
    state: State<'_, DbPool>,
    username: String,
    password: String,
) -> Result<LoginResponse, String> {
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
    .await
    .map_err(|e| e.to_string())?;

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

#[tauri::command]
async fn change_password(
    state: State<'_, DbPool>,
    username: String,
    old_password: String,
    new_password: String,
) -> Result<String, String> {
    // Validate inputs
    if username.trim().is_empty()
        || old_password.trim().is_empty()
        || new_password.trim().is_empty()
    {
        return Err("모든 필드를 입력해주세요.".to_string());
    }

    if new_password.len() < 4 {
        return Err("새 비밀번호는 최소 4자 이상이어야 합니다.".to_string());
    }

    // Query user from database
    let user_result = sqlx::query_as::<_, User>(
        "SELECT id, username, password_hash, role, created_at FROM users WHERE username = $1",
    )
    .bind(&username)
    .fetch_optional(&*state)
    .await
    .map_err(|e| e.to_string())?;

    match user_result {
        Some(user) => {
            // Verify old password
            if let Some(password_hash) = &user.password_hash {
                match verify(&old_password, password_hash) {
                    Ok(is_valid) => {
                        if !is_valid {
                            return Err("현재 비밀번호가 올바르지 않습니다.".to_string());
                        }
                    }
                    Err(_) => return Err("비밀번호 확인 중 오류가 발생했습니다.".to_string()),
                }
            } else {
                return Err("사용자 정보가 올바르지 않습니다.".to_string());
            }

            // Hash new password
            let new_password_hash = hash(&new_password, DEFAULT_COST)
                .map_err(|e| format!("비밀번호 해시 생성 실패: {}", e))?;

            // Update password in database
            DB_MODIFIED.store(true, Ordering::Relaxed);
            sqlx::query("UPDATE users SET password_hash = $1 WHERE username = $2")
                .bind(&new_password_hash)
                .bind(&username)
                .execute(&*state)
                .await
                .map_err(|e| e.to_string())?;

            Ok("비밀번호가 성공적으로 변경되었습니다.".to_string())
        }
        None => Err("존재하지 않는 사용자입니다.".to_string()),
    }
}

#[tauri::command]
async fn get_all_users(state: State<'_, DbPool>) -> Result<Vec<User>, String> {
    let users = sqlx::query_as::<_, User>(
        "SELECT id, username, password_hash, role, created_at, updated_at FROM users ORDER BY created_at DESC",
    )
    .fetch_all(&*state)
    .await
    .map_err(|e| e.to_string())?;

    Ok(users)
}

#[tauri::command]
async fn create_user(
    state: State<'_, DbPool>,
    username: String,
    password: Option<String>,
    role: String,
) -> Result<(), String> {
    if username.trim().is_empty() {
        return Err("아이디를 입력해주세요.".to_string());
    }

    let password_hash = if let Some(pwd) = password {
        if pwd.trim().is_empty() {
            None
        } else {
            Some(hash(&pwd, DEFAULT_COST).map_err(|e| e.to_string())?)
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
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
async fn update_user(
    state: State<'_, DbPool>,
    id: i32,
    username: String,
    password: Option<String>,
    role: String,
) -> Result<(), String> {
    let password_hash = if let Some(pwd) = password {
        if pwd.trim().is_empty() {
            None
        } else {
            Some(hash(&pwd, DEFAULT_COST).map_err(|e| e.to_string())?)
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
            .await
            .map_err(|e| e.to_string())?;
    } else {
        sqlx::query("UPDATE users SET username = $1, role = $2 WHERE id = $3")
            .bind(username)
            .bind(role)
            .bind(id)
            .execute(&*state)
            .await
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[tauri::command]
async fn delete_user(state: State<'_, DbPool>, id: i32) -> Result<(), String> {
    let username: (String,) = sqlx::query_as("SELECT username FROM users WHERE id = $1")
        .bind(id)
        .fetch_one(&*state)
        .await
        .map_err(|e| e.to_string())?;

    if username.0 == "admin" {
        return Err("관리자 계정은 삭제할 수 없습니다.".to_string());
    }

    DB_MODIFIED.store(true, Ordering::Relaxed);
    sqlx::query("DELETE FROM users WHERE id = $1")
        .bind(id)
        .execute(&*state)
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
async fn get_company_info(state: State<'_, DbPool>) -> Result<Option<CompanyInfo>, String> {
    let row = sqlx::query_as::<_, CompanyInfo>("SELECT * FROM company_info LIMIT 1")
        .fetch_optional(&*state)
        .await
        .map_err(|e| e.to_string())?;

    Ok(row)
}

#[tauri::command]
async fn save_company_info(
    state: State<'_, DbPool>,
    company_name: String,
    representative_name: Option<String>,
    phone_number: Option<String>,
    mobile_number: Option<String>,
    business_reg_number: Option<String>,
    registration_date: Option<String>,
    memo: Option<String>,
) -> Result<(), String> {
    let reg_date = registration_date.and_then(|s| {
        chrono::NaiveDate::parse_from_str(&s, "%Y-%m-%d")
            .ok()
            .and_then(|d| d.and_hms_opt(0, 0, 0))
    });

    DB_MODIFIED.store(true, Ordering::Relaxed);

    let count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM company_info")
        .fetch_one(&*state)
        .await
        .map_err(|e| e.to_string())?;

    if count.0 > 0 {
        sqlx::query(
            "UPDATE company_info SET 
                company_name = $1, 
                representative_name = $2, 
                phone_number = $3, 
                mobile_number = $4, 
                business_reg_number = $5, 
                registration_date = $6, 
                memo = $7,
                updated_at = CURRENT_TIMESTAMP",
        )
        .bind(company_name)
        .bind(representative_name)
        .bind(phone_number)
        .bind(mobile_number)
        .bind(business_reg_number)
        .bind(reg_date)
        .bind(memo)
        .execute(&*state)
        .await
        .map_err(|e| e.to_string())?;
    } else {
        sqlx::query(
            "INSERT INTO company_info (company_name, representative_name, phone_number, mobile_number, business_reg_number, registration_date, memo)
             VALUES ($1, $2, $3, $4, $5, $6, $7)"
        )
        .bind(company_name)
        .bind(representative_name)
        .bind(phone_number)
        .bind(mobile_number)
        .bind(business_reg_number)
        .bind(reg_date)
        .bind(memo)
        .execute(&*state)
        .await
        .map_err(|e| e.to_string())?;
    }

    Ok(())
}

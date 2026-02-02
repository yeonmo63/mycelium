use crate::db::{init_pool, CompanyInfo, User};
use crate::DB_MODIFIED;
use bcrypt::{hash, verify, DEFAULT_COST};
use serde_json::{json, Value};
use std::fs;
use std::sync::atomic::Ordering;
use std::sync::Mutex;
use tauri::{command, AppHandle, Manager, State};

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
pub async fn get_gemini_api_key_for_ui(app: AppHandle) -> Result<String, String> {
    Ok(get_gemini_api_key(&app).unwrap_or_default())
}

#[command]
pub async fn save_gemini_api_key(app: AppHandle, key: String) -> Result<(), String> {
    let config_dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    let config_path = config_dir.join("config.json");

    let mut config_data = if config_path.exists() {
        let content = fs::read_to_string(&config_path).map_err(|e| e.to_string())?;
        serde_json::from_str::<Value>(&content).unwrap_or(json!({}))
    } else {
        json!({})
    };

    config_data["gemini_api_key"] = Value::String(key);

    let config_str = serde_json::to_string_pretty(&config_data).map_err(|e| e.to_string())?;
    fs::write(&config_path, config_str).map_err(|e| e.to_string())?;

    // Also update current process env to take effect immediately
    std::env::set_var(
        "GEMINI_API_KEY",
        &config_data["gemini_api_key"].as_str().unwrap_or(""),
    );

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
) -> Result<(), String> {
    let config_dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    let config_path = config_dir.join("config.json");

    let mut config_data = if config_path.exists() {
        let content = fs::read_to_string(&config_path).map_err(|e| e.to_string())?;
        serde_json::from_str::<Value>(&content).unwrap_or(json!({}))
    } else {
        json!({})
    };

    config_data["naver_client_id"] = Value::String(client_id);
    config_data["naver_client_secret"] = Value::String(client_secret);

    let config_str = serde_json::to_string_pretty(&config_data).map_err(|e| e.to_string())?;
    fs::write(&config_path, config_str).map_err(|e| e.to_string())?;

    Ok(())
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
pub async fn get_message_templates(app: AppHandle) -> Result<Value, String> {
    let config_dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    let template_path = config_dir.join("templates.json");

    if template_path.exists() {
        let content = fs::read_to_string(&template_path).map_err(|e| e.to_string())?;
        Ok(serde_json::from_str::<Value>(&content).unwrap_or_else(|_| get_default_templates()))
    } else {
        Ok(get_default_templates())
    }
}

#[command]
pub async fn save_message_templates(app: AppHandle, templates: Value) -> Result<(), String> {
    let config_dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    if !config_dir.exists() {
        fs::create_dir_all(&config_dir).map_err(|e| e.to_string())?;
    }
    let template_path = config_dir.join("templates.json");

    let content = serde_json::to_string_pretty(&templates).map_err(|e| e.to_string())?;
    fs::write(&template_path, content).map_err(|e| e.to_string())?;

    Ok(())
}

#[command]
pub async fn reset_message_templates(app: AppHandle) -> Result<Value, String> {
    let config_dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    let template_path = config_dir.join("templates.json");

    if template_path.exists() {
        let _ = fs::remove_file(&template_path);
    }

    Ok(get_default_templates())
}

#[command]
pub async fn save_external_backup_path(app: AppHandle, path: String) -> Result<(), String> {
    let config_dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    let config_path = config_dir.join("config.json");

    let mut config_data = if config_path.exists() {
        let content = fs::read_to_string(&config_path).map_err(|e| e.to_string())?;
        serde_json::from_str::<Value>(&content).unwrap_or(json!({}))
    } else {
        json!({})
    };

    config_data["external_backup_path"] = Value::String(path);

    let config_str = serde_json::to_string_pretty(&config_data).map_err(|e| e.to_string())?;
    fs::write(&config_path, config_str).map_err(|e| e.to_string())?;

    Ok(())
}

#[command]
pub async fn get_external_backup_path(app: AppHandle) -> Result<String, String> {
    let config_dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    let config_path = config_dir.join("config.json");

    if config_path.exists() {
        let content = fs::read_to_string(&config_path).map_err(|e| e.to_string())?;
        let json: Value = serde_json::from_str(&content).unwrap_or(json!({}));
        if let Some(path) = json.get("external_backup_path").and_then(|v| v.as_str()) {
            return Ok(path.to_string());
        }
    }
    Ok("".to_string())
}

#[command]
pub async fn get_naver_client_id_for_ui(app: AppHandle) -> Result<String, String> {
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
) -> Result<(), String> {
    let config_dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    let config_path = config_dir.join("config.json");

    let mut config_data = if config_path.exists() {
        let content = fs::read_to_string(&config_path).map_err(|e| e.to_string())?;
        serde_json::from_str::<Value>(&content).unwrap_or(json!({}))
    } else {
        json!({})
    };

    config_data["sms_api_key"] = Value::String(api_key);
    config_data["sms_sender_number"] = Value::String(sender_number);
    config_data["sms_provider"] = Value::String(provider);

    let config_str = serde_json::to_string_pretty(&config_data).map_err(|e| e.to_string())?;
    fs::write(&config_path, config_str).map_err(|e| e.to_string())?;

    Ok(())
}

#[command]
pub async fn get_sms_config_for_ui(app: AppHandle) -> Result<Option<SmsConfig>, String> {
    let config_dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    let config_path = config_dir.join("config.json");

    if !config_path.exists() {
        return Ok(None);
    }

    let content = fs::read_to_string(&config_path).map_err(|e| e.to_string())?;
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
    use sqlx::Connection;
    use std::str::FromStr;
    let opts = sqlx::postgres::PgConnectOptions::from_str(&maintenance_url)
        .map_err(|e: sqlx::Error| format!("Invalid connection URL: {}", e))?;
    // .log_statements(log::LevelFilter::Debug); // Need log crate if wanted

    let mut conn = sqlx::postgres::PgConnection::connect_with(&opts)
        .await
        .map_err(|e: sqlx::Error| {
            format!(
                "Failed to connect to PostgreSQL. Check credentials. Error: {}",
                e
            )
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
                return Err(format!("Failed to create database '{}': {}", db_name, e));
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
        .map_err(|e: tauri::Error| e.to_string())?;

    if !config_dir.exists() {
        fs::create_dir_all(&config_dir)
            .map_err(|e| format!("Failed to create config dir: {}", e))?;
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
    let config_str =
        serde_json::to_string_pretty(&config_data).map_err(|e: serde_json::Error| e.to_string())?;

    fs::write(&config_path, config_str)
        .map_err(|e| format!("Failed to write config file: {}", e))?;

    // 5. Initialize Schema
    let pool = init_pool(&final_db_url)
        .await
        .map_err(|e| format!("Failed to connect to new database: {}", e))?;
    crate::db::init_database(&pool)
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

#[command]
pub async fn get_company_info(
    state: State<'_, crate::db::DbPool>,
) -> Result<Option<CompanyInfo>, String> {
    let pool = state.inner();
    let row = sqlx::query_as::<_, CompanyInfo>("SELECT * FROM company_info LIMIT 1")
        .fetch_optional(pool)
        .await
        .map_err(|e| e.to_string())?;
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
) -> Result<(), String> {
    let reg_date = registration_date.and_then(|s| {
        chrono::NaiveDate::parse_from_str(&s, "%Y-%m-%d")
            .ok()
            .and_then(|d| d.and_hms_opt(0, 0, 0))
    });

    let pool = state.inner();

    // Check if exists
    let exists = sqlx::query("SELECT 1 FROM company_info LIMIT 1")
        .fetch_optional(pool)
        .await
        .map_err(|e| e.to_string())?;

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
        .await
        .map_err(|e| e.to_string())?;
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
        .await
        .map_err(|e| e.to_string())?;
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
) -> Result<bool, String> {
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

#[command]
pub async fn login(
    state: State<'_, crate::db::DbPool>,
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

#[command]
pub async fn change_password(
    state: State<'_, crate::db::DbPool>,
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

#[command]
pub async fn get_all_users(state: State<'_, crate::db::DbPool>) -> Result<Vec<User>, String> {
    let users = sqlx::query_as::<_, User>(
        "SELECT id, username, password_hash, role, created_at, updated_at FROM users ORDER BY created_at DESC",
    )
    .fetch_all(&*state)
    .await
    .map_err(|e| e.to_string())?;

    Ok(users)
}

#[command]
pub async fn create_user(
    state: State<'_, crate::db::DbPool>,
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

#[command]
pub async fn update_user(
    state: State<'_, crate::db::DbPool>,
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

#[command]
pub async fn delete_user(state: State<'_, crate::db::DbPool>, id: i32) -> Result<(), String> {
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

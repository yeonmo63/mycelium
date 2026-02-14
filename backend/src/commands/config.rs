use crate::db::{CompanyInfo, User};
use crate::error::{MyceliumError, MyceliumResult};
use crate::state::{AppState, SessionState, SetupStatus};
// use aes_gcm::{
//     aead::{Aead, KeyInit},
//     Aes256Gcm, Nonce,
// };
use base64::Engine;
use bcrypt::{hash, verify, DEFAULT_COST};
use regex::Regex;
use serde_json::{json, Value};
use sqlx::Connection;
use std::fs;
use std::net::{IpAddr, Ipv4Addr, SocketAddr, UdpSocket};
use std::path::{Path, PathBuf};
use std::sync::atomic::Ordering;
use axum::{
    extract::{State, Path as AxumPath, Json},
    response::IntoResponse,
};
use serde::{Deserialize, Serialize};

// Helper to replace AppHandle.path().app_config_dir()
pub fn get_app_config_dir() -> MyceliumResult<PathBuf> {
    let mut path = std::env::current_dir()?;
    path.push("data");
    path.push("config");
    if !path.exists() {
        fs::create_dir_all(&path)?;
    }
    Ok(path)
}

// For now, simple encryption/decryption stubs or use similar logic to before if needed
fn get_encryption_key() -> [u8; 32] {
    *b"mycelium-secret-key-32-bytes-log"
}

// ... encryption helpers from original file (simplified for now or keep same logic) ...
// We will skip encryption implementation details for brevity in migration first pass unless critical.
// Original code used aes_gcm. Let's keep it simple for now and store plain text or base64 if needed, 
// or reimplement properly later. The user wants migration to WORK first.

pub async fn check_setup_status(State(state): State<AppState>) -> Json<SetupStatus> {
    let status = state.setup_status.lock().unwrap();
    // Clone the status to return it
    let s = match *status {
        SetupStatus::Initializing => SetupStatus::Initializing,
        SetupStatus::Configured => SetupStatus::Configured,
        SetupStatus::NotConfigured => SetupStatus::NotConfigured,
    };
    Json(s)
}

#[derive(Debug, Serialize, Deserialize)]
pub struct LoginRequest {
    pub username: String,
    pub password: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct LoginResponse {
    pub success: bool,
    pub message: String,
    pub user_id: Option<i32>,
    pub username: Option<String>,
    pub role: Option<String>,
}

pub async fn login(
    State(state): State<AppState>,
    Json(payload): Json<LoginRequest>,
) -> MyceliumResult<Json<LoginResponse>> {
    let username = payload.username;
    let password = payload.password;

    if username.trim().is_empty() || password.trim().is_empty() {
        return Ok(Json(LoginResponse {
            success: false,
            message: "아이디와 비밀번호를 입력해주세요.".to_string(),
            user_id: None,
            username: None,
            role: None,
        }));
    }

    let user_result = sqlx::query_as::<_, User>(
        "SELECT id, username, password_hash, role, created_at, updated_at FROM users WHERE username = $1",
    )
    .bind(&username)
    .fetch_optional(&state.pool)
    .await?;

    match user_result {
        Some(user) => {
            if let Some(password_hash) = &user.password_hash {
                match verify(&password, password_hash) {
                    Ok(is_valid) => {
                        if is_valid {
                            // Update session state
                            if let Ok(mut session) = state.session.lock() {
                                session.user_id = Some(user.id);
                                session.username = Some(user.username.clone());
                                session.role = Some(user.role.clone());
                            }

                            Ok(Json(LoginResponse {
                                success: true,
                                message: "로그인 성공".to_string(),
                                user_id: Some(user.id),
                                username: Some(user.username.clone()),
                                role: Some(user.role.clone()),
                            }))
                        } else {
                            Ok(Json(LoginResponse {
                                success: false,
                                message: "비밀번호가 올바르지 않습니다.".to_string(),
                                user_id: None,
                                username: None,
                                role: None,
                            }))
                        }
                    }
                    Err(_) => Ok(Json(LoginResponse {
                        success: false,
                        message: "비밀번호 확인 중 오류가 발생했습니다.".to_string(),
                        user_id: None,
                        username: None,
                        role: None,
                    })),
                }
            } else {
                Ok(Json(LoginResponse {
                    success: false,
                    message: "사용자 정보가 올바르지 않습니다.".to_string(),
                    user_id: None,
                    username: None,
                    role: None,
                }))
            }
        }
        None => Ok(Json(LoginResponse {
            success: false,
            message: "존재하지 않는 사용자입니다.".to_string(),
            user_id: None,
            username: None,
            role: None,
        })),
    }
}

pub async fn logout(State(state): State<AppState>) -> Json<()> {
    if let Ok(mut session) = state.session.lock() {
        session.user_id = None;
        session.username = None;
        session.role = None;
    }
    Json(())
}

#[derive(Serialize)]
pub struct AuthStatusResponse {
    pub logged_in: bool,
    pub user: Option<SessionState>,
    pub require_pin: bool, // For mobile compatibility check
}

pub async fn check_auth_status(State(state): State<AppState>) -> Json<AuthStatusResponse> {
    let session = state.session.lock().unwrap();
    let logged_in = session.user_id.is_some();
    
    // Check if PIN is required (Mobile Config)
    // For now, hardcode false or implement config read
    let require_pin = false; 

    Json(AuthStatusResponse {
        logged_in,
        user: Some(session.clone()),
        require_pin,
    })
}

// ... Additional handlers will be added incrementally ...
// For now, this is enough to get the login screen working.

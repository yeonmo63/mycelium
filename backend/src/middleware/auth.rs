use crate::state::SessionState;
use axum::{
    extract::Request,
    http::{header, StatusCode},
    middleware::Next,
    response::Response,
};
use jsonwebtoken::{decode, DecodingKey, Validation};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Claims {
    pub sub: String,
    pub user_id: Option<i32>,
    pub username: Option<String>,
    pub role: Option<String>,
    pub ui_mode: Option<String>,
    pub sid: Option<String>, // Session ID for database tracking
    pub exp: usize,
}

impl Claims {
    pub fn into_session_state(self) -> SessionState {
        SessionState {
            user_id: self.user_id,
            username: self.username,
            role: self.role.clone(),
            ui_mode: self.ui_mode,
        }
    }

    pub fn is_admin(&self) -> bool {
        self.role.as_deref() == Some("admin")
    }
}

pub fn get_jwt_secret() -> Vec<u8> {
    std::env::var("JWT_SECRET")
        .unwrap_or_else(|_| {
            tracing::warn!("JWT_SECRET not set, using insecure default!");
            "insecure-development-secret-key-replace-me-immediately".to_string()
        })
        .into_bytes()
}

pub async fn auth_middleware(mut request: Request, next: Next) -> Result<Response, StatusCode> {
    let path = request.uri().path();
    let public_routes = vec![
        "/api/auth/status",
        "/api/setup/system",
        "/api/auth/login",
        "/api/auth/check",
        "/api/auth/verify",
        "/api/ping",
        "/api/system/check-update",
        "/api/auth/company",
    ];

    if !path.starts_with("/api/") || public_routes.contains(&path) {
        return Ok(next.run(request).await);
    }

    // 1. Extract the Authorization header
    let auth_header = request.headers().get(header::AUTHORIZATION);

    let auth_header = match auth_header {
        Some(header) => header.to_str().map_err(|_| StatusCode::UNAUTHORIZED)?,
        None => {
            // No token provided. We will allow the request to proceed but without Claims in extension.
            // Some routes might allow anonymous access or check auth themselves.
            // If we want tight security, we can return UNAUTHORIZED here.
            // However, it's safer to attach Claims if present and let handlers decide,
            // OR enforce it for all routes EXCEPT login/signup.
            // The standard way is to enforce it in middleware for a specific Router.
            return Err(StatusCode::UNAUTHORIZED);
        }
    };

    if !auth_header.starts_with("Bearer ") {
        return Err(StatusCode::UNAUTHORIZED);
    }

    let token = &auth_header["Bearer ".len()..];

    // 2. Validate the token
    let token_data = decode::<Claims>(
        token,
        &DecodingKey::from_secret(&get_jwt_secret()),
        &Validation::default(),
    )
    .map_err(|_| StatusCode::UNAUTHORIZED)?;

    // 3. Attach the claims to the request extensions
    request.extensions_mut().insert(token_data.claims);

    Ok(next.run(request).await)
}

pub async fn optional_auth_middleware(
    mut request: Request,
    next: Next,
) -> Result<Response, StatusCode> {
    let auth_header = request.headers().get(header::AUTHORIZATION);

    if let Some(header_val) = auth_header {
        if let Ok(auth_str) = header_val.to_str() {
            if auth_str.starts_with("Bearer ") {
                let token = &auth_str["Bearer ".len()..];
                if let Ok(token_data) = decode::<Claims>(
                    token,
                    &DecodingKey::from_secret(&get_jwt_secret()),
                    &Validation::default(),
                ) {
                    request.extensions_mut().insert(token_data.claims);
                }
            }
        }
    }

    Ok(next.run(request).await)
}

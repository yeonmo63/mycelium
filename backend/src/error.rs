#![allow(dead_code)]
use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde::{Serialize, Serializer};
use serde_json::json;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum MyceliumError {
    #[error("Database error: {0}")]
    Database(#[from] sqlx::Error),

    #[error("Authentication failed: {0}")]
    Auth(String),

    #[error("Validation error: {0}")]
    Validation(String),

    #[error("Internal error: {0}")]
    Internal(String),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Migration error: {0}")]
    Migration(#[from] sqlx::migrate::MigrateError),

    #[error("Bcrypt error: {0}")]
    Bcrypt(#[from] bcrypt::BcryptError),

    #[error("Analysis error: {0}")]
    Polars(#[from] polars::prelude::PolarsError),

    #[error("Network error: {0}")]
    Network(#[from] reqwest::Error),

    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),

    #[error("Base64 error: {0}")]
    Base64(#[from] base64::DecodeError),
}

// Custom Serialize implementation to make MyceliumError compatible with Tauri commands (or JSON response)
impl Serialize for MyceliumError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_str(self.to_string().as_ref())
    }
}

pub type MyceliumResult<T> = Result<T, MyceliumError>;

impl IntoResponse for MyceliumError {
    fn into_response(self) -> Response {
        let (status, error_message) = match self {
            MyceliumError::Database(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()),
            MyceliumError::Auth(msg) => (StatusCode::UNAUTHORIZED, msg),
            MyceliumError::Validation(msg) => (StatusCode::BAD_REQUEST, msg),
            MyceliumError::Internal(msg) => (StatusCode::INTERNAL_SERVER_ERROR, msg),
            MyceliumError::Io(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()),
            MyceliumError::Migration(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()),
            MyceliumError::Bcrypt(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()),
            MyceliumError::Network(e) => (StatusCode::BAD_GATEWAY, e.to_string()),
            _ => (StatusCode::INTERNAL_SERVER_ERROR, self.to_string()),
        };

        let body = Json(json!({
            "error": error_message,
        }));

        (status, body).into_response()
    }
}

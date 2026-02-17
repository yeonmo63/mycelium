use crate::db::DbPool;
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};

#[derive(Clone)]
pub struct AppState {
    pub pool: DbPool,
    pub setup_status: Arc<Mutex<SetupStatus>>,
    pub session: Arc<Mutex<SessionState>>, // Global session for single-user desktop-like usage
}

impl axum::extract::FromRef<AppState> for DbPool {
    fn from_ref(state: &AppState) -> Self {
        state.pool.clone()
    }
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub enum SetupStatus {
    Initializing,
    Configured,
    NotConfigured,
}

#[derive(Clone, Default, Debug, Serialize, Deserialize)]
pub struct SessionState {
    pub user_id: Option<i32>,
    pub username: Option<String>,
    pub role: Option<String>,
    pub ui_mode: Option<String>,
}

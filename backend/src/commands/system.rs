use crate::error::MyceliumResult;
use axum::Json;
use reqwest::header::{ACCEPT, USER_AGENT};
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize)]
pub struct UpdateCheckResponse {
    pub current_version: String,
    pub latest_version: String,
    pub update_available: bool,
    pub release_url: String,
    pub release_notes: String,
}

#[derive(Deserialize)]
struct GithubRelease {
    tag_name: String,
    html_url: String,
    body: String,
}

const CURRENT_VERSION: &str = env!("CARGO_PKG_VERSION");
const GITHUB_REPO: &str = "yeonmo63/mycelium";

pub async fn check_for_updates() -> MyceliumResult<Json<UpdateCheckResponse>> {
    let client = reqwest::Client::new();
    let url = format!(
        "https://api.github.com/repos/{}/releases/latest",
        GITHUB_REPO
    );

    let latest_version = match client
        .get(url)
        .header(USER_AGENT, "Mycelium-App")
        .header(ACCEPT, "application/vnd.github.v3+json")
        .send()
        .await
    {
        Ok(res) => {
            if res.status().is_success() {
                let release: GithubRelease = res.json().await.unwrap_or(GithubRelease {
                    tag_name: CURRENT_VERSION.to_string(),
                    html_url: "".to_string(),
                    body: "".to_string(),
                });

                let tag = release.tag_name.trim_start_matches('v');
                Some((tag.to_string(), release.html_url, release.body))
            } else {
                None
            }
        }
        Err(_) => None,
    };

    let (latest, url, notes) = latest_version
        .unwrap_or_else(|| (CURRENT_VERSION.to_string(), "".to_string(), "".to_string()));

    // Simple version comparison (can be improved with semver crate)
    let update_available = latest != CURRENT_VERSION;

    Ok(Json(UpdateCheckResponse {
        current_version: CURRENT_VERSION.to_string(),
        latest_version: latest,
        update_available,
        release_url: url,
        release_notes: notes,
    }))
}

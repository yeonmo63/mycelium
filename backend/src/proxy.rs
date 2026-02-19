use serde_json;
use std::env;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;

static CADDY_CHILD: Mutex<Option<Child>> = Mutex::new(Option::None);

/// Starts the Caddy reverse proxy using the Tailscale domain.
pub fn start_caddy() {
    // 1. Try to load from mobile_config.json first (user's UI setting)
    let config_path = dirs::config_dir()
        .map(|p| p.join("com.mycelium").join("mobile_config.json"))
        .unwrap_or_else(|| PathBuf::from("./data/config/mobile_config.json"));

    let mut tailscale_domain = String::new();

    if config_path.exists() {
        if let Ok(content) = std::fs::read_to_string(&config_path) {
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                if let Some(domain) = json["domain_name"].as_str() {
                    tailscale_domain = domain.to_string();
                }
            }
        }
    }

    // 2. Fallback to .env if not in config file
    if tailscale_domain.is_empty() {
        tailscale_domain = env::var("TAILSCALE_DOMAIN").unwrap_or_default();
    }

    if tailscale_domain.is_empty() {
        println!("⚠️  Tailscale domain not found. Skipping Caddy HTTPS proxy.");
        return;
    }

    println!(
        "🚀 Starting Caddy Reverse Proxy for Tailscale: {}...",
        tailscale_domain
    );

    // Get the path to caddy.exe and Caddyfile relative to the executable or CWD
    let mut caddy_path = PathBuf::from("./resources/bin/caddy.exe");
    let mut caddyfile_path = PathBuf::from("./resources/Caddyfile");

    // If not found in CWD, try relative to the executable path
    if !caddy_path.exists() {
        if let Ok(exe_path) = env::current_exe() {
            if let Some(exe_dir) = exe_path.parent() {
                let rel_caddy = exe_dir.join("resources").join("bin").join("caddy.exe");
                let rel_caddyfile = exe_dir.join("resources").join("Caddyfile");
                if rel_caddy.exists() {
                    caddy_path = rel_caddy;
                    caddyfile_path = rel_caddyfile;
                }
            }
        }
    }

    if !caddy_path.exists() {
        println!(
            "❌ Caddy executable not found at {:?}. Please ensure it is in the resources/bin folder.",
            caddy_path
        );
        return;
    }

    let child = Command::new(caddy_path)
        .arg("run")
        .arg("--config")
        .arg(caddyfile_path)
        .arg("--adapter")
        .arg("caddyfile")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn();

    match child {
        Ok(c) => {
            let mut guard = CADDY_CHILD.lock().unwrap();
            *guard = Some(c);
            println!("✨ Caddy is now running in the background.");
        }
        Err(e) => {
            eprintln!("❌ Failed to spawn Caddy process: {}", e);
        }
    }
}

/// Stops the Caddy process if it is running.
pub fn stop_caddy() {
    let mut guard = CADDY_CHILD.lock().unwrap();
    if let Some(mut child) = guard.take() {
        println!("🛑 Stopping Caddy...");
        let _ = child.kill();
    }
}

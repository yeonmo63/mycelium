use std::fs;
use std::net::TcpStream;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Manager};
use tauri_plugin_shell::process::CommandChild;
use tauri_plugin_shell::ShellExt;

/// Embedded DB State to hold the child process
pub struct EmbeddedDbState {
    pub child_process: Mutex<Option<CommandChild>>,
}

/// Get the path where DB data will be stored
fn get_db_data_path(app: &AppHandle) -> PathBuf {
    app.path().app_data_dir().unwrap().join("embedded_pg_data")
}

/// Normalize path for Windows to avoid \\?\ prefix which confuses Postgres
fn normalize_path(path: PathBuf) -> String {
    let s = path.to_string_lossy().to_string();
    if s.starts_with(r"\\?\") {
        s[4..].to_string()
    } else {
        s
    }
}

/// Find the bin directory containing postgres.exe and initdb.exe
fn find_bin_dir(app: &AppHandle) -> PathBuf {
    // 1. Try absolute project path (Dev mode)
    let project_bin = PathBuf::from(r"D:\workspace\rust\mycelium\src-tauri\resources\bin");
    if project_bin.exists() && project_bin.join("postgres.exe").exists() {
        return project_bin;
    }

    // 2. Try resource directory (Production)
    if let Ok(res_dir) = app.path().resource_dir() {
        let p = res_dir.join("resources").join("bin");
        if p.exists() && p.join("postgres.exe").exists() {
            return p;
        }
    }

    app.path()
        .resource_dir()
        .unwrap_or_default()
        .join("resources")
        .join("bin")
}

/// Find the share directory containing postgres.bki, etc.
fn find_share_dir(app: &AppHandle) -> PathBuf {
    // 1. Try absolute project path (Dev mode)
    let project_share = PathBuf::from(r"D:\workspace\rust\mycelium\src-tauri\resources\share");
    if project_share.exists() {
        return project_share;
    }

    // 2. Try resource directory (Production)
    if let Ok(res_dir) = app.path().resource_dir() {
        let p = res_dir.join("resources").join("share");
        if p.exists() {
            return p;
        }
    }

    app.path()
        .resource_dir()
        .unwrap_or_default()
        .join("resources")
        .join("share")
}

/// Initialize DB if the data directory doesn't exist or is incomplete
pub async fn init_db_if_needed(app: &AppHandle) -> Result<(), String> {
    let data_path = get_db_data_path(app);
    let config_file = data_path.join("postgresql.conf");

    if !config_file.exists() {
        println!(
            "EmbeddedDB: First run or incomplete initialization detected. Creating database..."
        );

        // Clean up partial data if it exists
        if data_path.exists() {
            let _ = fs::remove_dir_all(&data_path);
        }

        fs::create_dir_all(&data_path).map_err(|e| e.to_string())?;

        let bin_dir = find_bin_dir(app);
        let share_dir = find_share_dir(app);
        let initdb_exe = bin_dir.join("initdb.exe");

        if !initdb_exe.exists() {
            return Err(format!("EmbeddedDB: initdb.exe not found at {:?}. Please ensure binaries are in src-tauri/bin.", initdb_exe));
        }

        println!(
            "EmbeddedDB: Running initdb with share at {:?}...",
            share_dir
        );

        let sidecar = app
            .shell()
            .command(normalize_path(initdb_exe))
            .args([
                "-D",
                &normalize_path(data_path.clone()),
                "-E",
                "UTF8",
                "--no-locale",
                "-U",
                "postgres",
                "--auth=trust",
                "-L", // Library (share) directory explicitly
                &normalize_path(share_dir),
            ])
            .current_dir(normalize_path(bin_dir));

        let output = sidecar
            .output()
            .await
            .map_err(|e| format!("Failed to execute initdb: {}", e))?;

        if !output.status.success() {
            let err_msg = String::from_utf8_lossy(&output.stderr);
            let out_msg = String::from_utf8_lossy(&output.stdout);
            println!("EmbeddedDB: initdb FAILED!");
            println!("--- initdb STDOUT ---\n{}\n---", out_msg);
            println!("--- initdb STDERR ---\n{}\n---", err_msg);

            let _ = fs::remove_dir_all(&data_path);
            return Err(format!("initdb failed. Check logs above."));
        }
        println!("EmbeddedDB: Initialization successful.");
    } else {
        println!("EmbeddedDB: Existing database found at {:?}.", data_path);
    }
    Ok(())
}

/// Start the PostgreSQL process as a sidecar
pub async fn start_db(app: &AppHandle) -> Result<CommandChild, String> {
    let data_path = get_db_data_path(app);

    println!("EmbeddedDB: Starting PostgreSQL engine on port 5433...");

    let bin_dir = find_bin_dir(app);
    let postgres_exe = bin_dir.join("postgres.exe");

    if !postgres_exe.exists() {
        return Err(format!("EmbeddedDB: postgres.exe not found. Looked at {:?}. Please ensure binaries are in src-tauri/bin.", bin_dir));
    }

    let bin_dir_str = normalize_path(bin_dir.clone());
    let data_path_str = normalize_path(data_path);

    // Postgres check: Ensure sibling 'lib' exists (even if empty) to satisfy sanity checks
    if let Some(parent) = bin_dir.parent() {
        let lib_dir = parent.join("lib");
        if !lib_dir.exists() {
            let _ = fs::create_dir_all(&lib_dir);
        }
    }

    let sidecar = app
        .shell()
        .command(normalize_path(postgres_exe))
        .args([
            "-D",
            &data_path_str,
            "-p",
            "5433",
            "-h",
            "127.0.0.1",
            "-c",
            "ssl=off",
            "-c",
            "max_connections=100",
            "-c",
            "shared_buffers=128MB",
        ])
        .current_dir(&bin_dir_str)
        .env("PGDATA", &data_path_str) // Add PGDATA explicitly
        .env(
            "PATH",
            format!(
                "{};{}",
                &bin_dir_str,
                std::env::var("PATH").unwrap_or_default()
            ),
        );

    let (mut rx, child) = sidecar
        .spawn()
        .map_err(|e| format!("Failed to spawn postgres: {}", e))?;

    // Spawn a task to monitor stderr/stdout events
    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            use tauri_plugin_shell::process::CommandEvent;
            match event {
                CommandEvent::Stdout(line) => {
                    println!("Postgres-Out: {}", String::from_utf8_lossy(&line).trim());
                }
                CommandEvent::Stderr(line) => {
                    eprintln!("Postgres-Err: {}", String::from_utf8_lossy(&line).trim());
                }
                CommandEvent::Error(err) => {
                    eprintln!("Postgres-Internal-Error: {}", err);
                }
                CommandEvent::Terminated(payload) => {
                    println!("Postgres-Process-Terminated: code {:?}", payload.code);
                }
                _ => {}
            }
        }
    });

    // Wait until the port is ready
    let mut attempts = 0;
    let target_addr: std::net::SocketAddr = "127.0.0.1:5433".parse().unwrap();

    while attempts < 30 {
        // Support slow disks/init
        if TcpStream::connect_timeout(&target_addr, Duration::from_millis(500)).is_ok() {
            println!("EmbeddedDB: Port 5433 is open. Waiting 1s for engine stability...");
            tokio::time::sleep(Duration::from_secs(1)).await;
            return Ok(child);
        }

        attempts += 1;
        tokio::time::sleep(Duration::from_millis(1000)).await;

        if (attempts % 5) == 0 {
            println!("EmbeddedDB: Waiting for database... (attempt {})", attempts);
        }
    }

    // If we timed out, try to kill the child
    let _ = child.kill();
    Err("EmbeddedDB: Timeout waiting for database to start. Check Postgres-Err logs above.".into())
}

/// Stop the DB process
pub fn stop_db(state: &EmbeddedDbState) {
    if let Ok(mut child_lock) = state.child_process.lock() {
        if let Some(child) = child_lock.take() {
            println!("EmbeddedDB: Stopping engine...");
            let _ = child.kill();
        }
    }
}

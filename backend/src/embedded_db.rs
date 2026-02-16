use std::fs;
use std::net::TcpStream;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::Duration;

/// Embedded DB State to hold the child process
pub struct EmbeddedDbState {
    pub child_process: Mutex<Option<Child>>,
}

/// Get the path where DB data will be stored
/// Using user's AppData/Roaming/com.mycelium/embedded_pg_data
fn get_db_data_path() -> PathBuf {
    match crate::commands::config::get_app_config_dir() {
        Ok(dir) => dir.join("embedded_pg_data"),
        Err(_) => PathBuf::from("data").join("embedded_pg_data"), // Fallback
    }
}

/// Find the resources directory
/// Tries to find 'resources' folder relative to the executable
fn find_resources_dir() -> PathBuf {
    // 1. Try relative to executable (Production/Release)
    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            let res_dir = exe_dir.join("resources");
            if res_dir.exists() {
                return res_dir;
            }
        }
    }

    // 2. Try current working directory (Dev)
    let cwd = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    let res_dir = cwd.join("resources");
    if res_dir.exists() {
        return res_dir;
    }

    // 3. Fallback for specific dev structure if needed
    cwd.join("src-tauri").join("resources")
}

/// Find the bin directory containing postgres.exe and initdb.exe
fn find_bin_dir() -> PathBuf {
    find_resources_dir().join("bin")
}

/// Find the share directory
fn find_share_dir() -> PathBuf {
    find_resources_dir().join("share")
}

/// Initialize DB if the data directory doesn't exist or is incomplete
pub async fn init_db_if_needed() -> Result<(), String> {
    let data_path = get_db_data_path();
    let config_file = data_path.join("postgresql.conf");

    if !config_file.exists() {
        println!("EmbeddedDB: First run or incomplete initialization detected. Creating database at {:?}...", data_path);

        // Clean up partial data if it exists
        if data_path.exists() {
            let _ = fs::remove_dir_all(&data_path);
        }

        fs::create_dir_all(&data_path).map_err(|e| e.to_string())?;

        let bin_dir = find_bin_dir();
        let share_dir = find_share_dir();

        let initdb_exe = if cfg!(windows) {
            bin_dir.join("initdb.exe")
        } else {
            bin_dir.join("initdb")
        };

        if !initdb_exe.exists() {
            return Err(format!("EmbeddedDB: initdb executable not found at {:?}. Please ensure 'resources/bin' is deployed.", initdb_exe));
        }

        println!("EmbeddedDB: Running initdb...");

        // Run initdb
        let output = Command::new(&initdb_exe)
            .arg("-D")
            .arg(&data_path)
            .arg("-E")
            .arg("UTF8")
            .arg("--no-locale")
            .arg("-U")
            .arg("postgres")
            .arg("--auth=trust")
            //.arg("-L").arg(&share_dir) // Explicit share dir sometimes helps
            .current_dir(&bin_dir) // Set CWD to bin for DLL loading
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output()
            .map_err(|e| format!("Failed to execute initdb: {}", e))?;

        if !output.status.success() {
            let err_msg = String::from_utf8_lossy(&output.stderr);
            let out_msg = String::from_utf8_lossy(&output.stdout);
            println!("EmbeddedDB: initdb FAILED!");
            println!("--- initdb STDOUT ---\n{}\n---", out_msg);
            println!("--- initdb STDERR ---\n{}\n---", err_msg);

            let _ = fs::remove_dir_all(&data_path);
            return Err(format!("initdb failed: {}", err_msg));
        }
        println!("EmbeddedDB: Initialization successful.");
    } else {
        println!("EmbeddedDB: Existing database found at {:?}.", data_path);
    }
    Ok(())
}

/// Start the PostgreSQL process
pub async fn start_db() -> Result<Child, String> {
    let data_path = get_db_data_path();

    println!("EmbeddedDB: Starting PostgreSQL engine on port 5433...");

    let bin_dir = find_bin_dir();
    let postgres_exe = if cfg!(windows) {
        bin_dir.join("postgres.exe")
    } else {
        bin_dir.join("postgres")
    };

    if !postgres_exe.exists() {
        return Err(format!(
            "EmbeddedDB: postgres executable not found at {:?}.",
            postgres_exe
        ));
    }

    // Ensure lib dir exists (sanity check)
    if let Some(parent) = bin_dir.parent() {
        let lib_dir = parent.join("lib");
        if !lib_dir.exists() {
            let _ = fs::create_dir_all(&lib_dir);
        }
    }

    // Set up command
    let mut cmd = Command::new(&postgres_exe);
    cmd.arg("-D")
        .arg(&data_path)
        .arg("-p")
        .arg("5433") // Embedded DB Port
        .arg("-h")
        .arg("127.0.0.1") // Localhost only
        .arg("-c")
        .arg("ssl=off")
        .arg("-c")
        .arg("max_connections=100")
        .arg("-c")
        .arg("shared_buffers=128MB")
        .arg("-c")
        .arg("work_mem=16MB")
        .arg("-c")
        .arg("effective_cache_size=256MB")
        .arg("-c")
        .arg("random_page_cost=1.1");

    // Important: Set CWD to bin dir so it finds DLLs on Windows
    cmd.current_dir(&bin_dir);

    // Add bin dir to PATH for good measure
    if let Ok(path_env) = std::env::var("PATH") {
        let new_path = format!("{};{}", bin_dir.to_string_lossy(), path_env);
        cmd.env("PATH", new_path);
    }

    // Redirect output so we can see logs if needed (or silence them)
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());

    let child = cmd
        .spawn()
        .map_err(|e| format!("Failed to spawn postgres: {}", e))?;

    // Wait until the port is ready
    let mut attempts = 0;
    let target_addr: std::net::SocketAddr = "127.0.0.1:5433".parse().unwrap();

    while attempts < 30 {
        if TcpStream::connect_timeout(&target_addr, Duration::from_millis(500)).is_ok() {
            println!("EmbeddedDB: Port 5433 is open. Engine ready.");
            // Give it a split second more to be fully ready for queries
            tokio::time::sleep(Duration::from_millis(500)).await;
            return Ok(child);
        }

        attempts += 1;
        tokio::time::sleep(Duration::from_millis(1000)).await;

        if (attempts % 5) == 0 {
            println!("EmbeddedDB: Waiting for database... (attempt {})", attempts);
        }
    }

    // If we timed out, try to kill? No, let the caller decide or return error.
    // Usually child persists if not killed.
    Err("EmbeddedDB: Timeout waiting for database to start.".into())
}

/// Stop the DB process
pub fn stop_db(state: &EmbeddedDbState) {
    if let Ok(mut child_lock) = state.child_process.lock() {
        if let Some(mut child) = child_lock.take() {
            println!("EmbeddedDB: Stopping engine...");
            // Try graceful shutdown first? Signal?
            // For embedded, killing is often acceptable if clean shutdown is complex.
            // But 'postgres' handles SIGTERM/SIGINT well. On Windows, kill() is abrupt.
            let _ = child.kill();
            let _ = child.wait(); // Clean up zombie
        }
    }
}

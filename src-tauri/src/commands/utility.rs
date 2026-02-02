use crate::db::DbPool;
use crate::DB_MODIFIED;
use std::sync::atomic::Ordering;
use tauri::{command, State};

#[derive(sqlx::FromRow)]
struct ColumnName {
    column_name: String,
}

#[command]
pub async fn debug_db_schema(
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

#[command]
pub async fn init_db_schema(state: State<'_, DbPool>) -> Result<(), String> {
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

#[command]
pub async fn open_external_url(url: String) -> Result<(), String> {
    if let Err(e) = open::that(&url) {
        return Err(format!("Failed to open URL: {}", e));
    }
    Ok(())
}

#[command]
pub async fn restart_app(app: tauri::AppHandle) {
    app.restart();
}

#[command]
pub async fn save_qr_image(app: tauri::AppHandle, base64_image: String) -> Result<String, String> {
    use base64::Engine;
    use std::io::Write;
    use tauri::Manager;

    // Decode Base64
    let base64_str = base64_image
        .split(',')
        .last()
        .ok_or("Invalid base64 format")?;
    let image_data = base64::engine::general_purpose::STANDARD
        .decode(base64_str)
        .map_err(|e| format!("Base64 decode failed: {}", e))?;

    // Save Path
    let app_dir = app
        .path()
        .app_data_dir()
        .map_err(|_| "Failed to get app dir")?;
    if !app_dir.exists() {
        std::fs::create_dir_all(&app_dir).map_err(|e| e.to_string())?;
    }
    let file_path = app_dir.join(format!("qr_{}.png", chrono::Utc::now().timestamp()));

    let mut file = std::fs::File::create(&file_path).map_err(|e| e.to_string())?;
    file.write_all(&image_data).map_err(|e| e.to_string())?;

    Ok(file_path.to_string_lossy().into_owned())
}

#[command]
pub async fn generate_qr_code(_data: String) -> Result<String, String> {
    // We can implement QR logic if needed, or rely on frontend lib
    // Stub for now or strictly backend-generated QR
    Ok("QR Code Logic Placeholder".to_string())
}

#[command]
pub fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

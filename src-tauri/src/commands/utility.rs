#![allow(non_snake_case)]
use crate::db::DbPool;
use crate::error::{MyceliumError, MyceliumResult};
use crate::DB_MODIFIED;
use std::sync::atomic::Ordering;
use tauri::{command, Manager, State};

#[derive(sqlx::FromRow)]
struct ColumnName {
    column_name: String,
}

#[command]
pub async fn debug_db_schema(
    state: State<'_, DbPool>,
    table_name: String,
) -> MyceliumResult<Vec<String>> {
    let rows: Vec<ColumnName> =
        sqlx::query_as("SELECT column_name FROM information_schema.columns WHERE table_name = $1")
            .bind(table_name)
            .fetch_all(&*state)
            .await?;

    Ok(rows.into_iter().map(|r| r.column_name).collect())
}

#[command]
pub async fn init_db_schema(state: State<'_, DbPool>) -> MyceliumResult<()> {
    DB_MODIFIED.store(true, Ordering::Relaxed);

    // 1. Products Table
    sqlx::query("ALTER TABLE products ADD COLUMN IF NOT EXISTS stock_quantity INTEGER DEFAULT 0")
        .execute(&*state)
        .await?;
    sqlx::query("ALTER TABLE products ADD COLUMN IF NOT EXISTS safety_stock INTEGER DEFAULT 10")
        .execute(&*state)
        .await?;
    sqlx::query("ALTER TABLE products ADD COLUMN IF NOT EXISTS material_id INTEGER REFERENCES products(product_id)")
        .execute(&*state).await?;
    sqlx::query("ALTER TABLE products ADD COLUMN IF NOT EXISTS material_ratio FLOAT DEFAULT 1.0")
        .execute(&*state)
        .await?;
    sqlx::query("ALTER TABLE products ADD COLUMN IF NOT EXISTS category VARCHAR(50)")
        .execute(&*state)
        .await?;
    sqlx::query("ALTER TABLE products ADD COLUMN IF NOT EXISTS tax_exempt_value INTEGER DEFAULT 0")
        .execute(&*state)
        .await?;
    sqlx::query(
        "ALTER TABLE products ADD COLUMN IF NOT EXISTS tax_type VARCHAR(20) DEFAULT '면세'",
    )
    .execute(&*state)
    .await?;

    // 2. Purchases Table
    sqlx::query(
        "ALTER TABLE purchases ADD COLUMN IF NOT EXISTS inventory_synced BOOLEAN DEFAULT FALSE",
    )
    .execute(&*state)
    .await?;
    sqlx::query("ALTER TABLE purchases ADD COLUMN IF NOT EXISTS material_item_id INTEGER REFERENCES products(product_id)")
        .execute(&*state).await?;

    // 3. Harvest Records Table
    sqlx::query("ALTER TABLE harvest_records ADD COLUMN IF NOT EXISTS lot_number VARCHAR(100)")
        .execute(&*state)
        .await?;
    sqlx::query("ALTER TABLE harvest_records ADD COLUMN IF NOT EXISTS package_count INTEGER")
        .execute(&*state)
        .await?;
    sqlx::query(
        "ALTER TABLE harvest_records ADD COLUMN IF NOT EXISTS weight_per_package NUMERIC(10, 2)",
    )
    .execute(&*state)
    .await?;
    sqlx::query("ALTER TABLE harvest_records ADD COLUMN IF NOT EXISTS package_unit VARCHAR(50)")
        .execute(&*state)
        .await?;

    Ok(())
}

#[command]
pub async fn open_external_url(url: String) -> MyceliumResult<()> {
    open::that(&url).map_err(|e| MyceliumError::Internal(format!("Failed to open URL: {}", e)))?;
    Ok(())
}

#[command]
pub async fn restart_app(app: tauri::AppHandle) {
    app.restart();
}

#[command]
pub async fn save_qr_image(app: tauri::AppHandle, base64_image: String) -> MyceliumResult<String> {
    use base64::Engine;
    use std::io::Write;

    // Decode Base64
    let base64_str = base64_image
        .split(',')
        .last()
        .ok_or_else(|| MyceliumError::Validation("Invalid base64 format".to_string()))?;
    let image_data = base64::engine::general_purpose::STANDARD.decode(base64_str)?;

    // Save Path
    let app_dir = app
        .path()
        .app_data_dir()
        .map_err(|_| MyceliumError::Internal("Failed to get app dir".to_string()))?;
    if !app_dir.exists() {
        std::fs::create_dir_all(&app_dir)?;
    }
    let file_path = app_dir.join(format!("qr_{}.png", chrono::Utc::now().timestamp()));

    let mut file = std::fs::File::create(&file_path)?;
    file.write_all(&image_data)?;

    Ok(file_path.to_string_lossy().into_owned())
}

#[command]
pub async fn generate_qr_code(_data: String) -> MyceliumResult<String> {
    // We can implement QR logic if needed, or rely on frontend lib
    // Stub for now or strictly backend-generated QR
    Ok("QR Code Logic Placeholder".to_string())
}

#[command]
pub fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

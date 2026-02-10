use chrono::{NaiveDate, NaiveDateTime};

// Helper Structs
#[derive(Debug, serde::Serialize, serde::Deserialize)]
pub struct AutoBackupItem {
    pub name: String,
    pub path: String,
    pub created_at: String,
    pub timestamp: i64,
    pub backup_type: String, // "자동" or "일일"
}

// DB Location Information
#[derive(Debug, serde::Serialize)]
pub struct DbLocationInfo {
    pub is_local: bool,
    pub is_db_server: bool,
    pub can_backup: bool,
    pub db_host: String,
    pub message: String,
}

#[derive(Debug, serde::Serialize, serde::Deserialize, sqlx::FromRow)]
pub struct DeletionLog {
    pub log_id: i32,
    pub table_name: String,
    pub record_id: String,
    pub deleted_info: Option<String>,
    pub deleted_by: Option<String>,
    pub deleted_at: Option<NaiveDateTime>,
}

#[derive(Debug, serde::Serialize, serde::Deserialize, sqlx::FromRow)]
pub struct PurchaseBackup {
    pub purchase_id: Option<i32>,
    pub vendor_id: Option<i32>,
    pub purchase_date: Option<NaiveDate>,
    pub item_name: String,
    pub specification: Option<String>,
    pub quantity: i32,
    pub unit_price: i32,
    pub total_amount: i32,
    pub payment_status: Option<String>,
    pub memo: Option<String>,
    pub inventory_synced: Option<bool>,
    pub material_item_id: Option<i32>,
    pub created_at: Option<NaiveDateTime>,
    pub updated_at: Option<NaiveDateTime>,
}

#[derive(Debug, serde::Serialize, serde::Deserialize, sqlx::FromRow)]
pub struct ExperienceReservationBackup {
    pub reservation_id: i32,
    pub program_id: i32,
    pub customer_id: Option<String>,
    pub guest_name: String,
    pub guest_contact: String,
    pub reservation_date: NaiveDate,
    pub reservation_time: chrono::NaiveTime,
    pub participant_count: i32,
    pub total_amount: i32,
    pub status: String,
    pub payment_status: String,
    pub memo: Option<String>,
    pub created_at: Option<NaiveDateTime>,
    pub updated_at: Option<NaiveDateTime>,
}

#[derive(Debug, serde::Serialize, serde::Deserialize, sqlx::FromRow)]
pub struct SalesClaimBackup {
    pub claim_id: i32,
    pub sales_id: String,
    pub customer_id: Option<String>,
    pub claim_type: String,
    pub claim_status: String,
    pub reason_category: String,
    pub quantity: i32,
    pub refund_amount: i32,
    pub is_inventory_recovered: bool,
    pub memo: Option<String>,
    pub created_at: Option<chrono::NaiveDateTime>,
    pub updated_at: Option<chrono::NaiveDateTime>,
}

#[derive(Debug, serde::Serialize, serde::Deserialize, sqlx::FromRow)]
pub struct ProductBomBackup {
    pub id: i32,
    pub product_id: i32,
    pub material_id: i32,
    pub ratio: f64,
    pub created_at: Option<chrono::NaiveDateTime>,
}

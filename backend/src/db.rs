#![allow(dead_code)]
use bcrypt;
use chrono::{DateTime, NaiveDate, NaiveDateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::postgres::{PgConnectOptions, PgPoolOptions, PgSslMode};
use sqlx::{FromRow, Pool, Postgres};
use std::str::FromStr;

use crate::error::{MyceliumError, MyceliumResult};

pub type DbPool = Pool<Postgres>;

pub async fn init_pool_with_options(opts: PgConnectOptions) -> MyceliumResult<DbPool> {
    // connect_lazy_with returns the pool immediately. It does not validate connection.
    Ok(PgPoolOptions::new()
        .max_connections(20)
        .acquire_timeout(std::time::Duration::from_secs(30))
        .idle_timeout(std::time::Duration::from_secs(120))
        .max_lifetime(std::time::Duration::from_secs(300))
        .connect_lazy_with(opts))
}

pub async fn init_pool(database_url: &str) -> MyceliumResult<DbPool> {
    let opts = PgConnectOptions::from_str(database_url)
        .map_err(|e| MyceliumError::Internal(format!("Invalid DB URL: {}", e)))?
        .ssl_mode(PgSslMode::Disable);

    init_pool_with_options(opts).await
}

pub async fn init_database(pool: &DbPool) -> MyceliumResult<()> {
    eprintln!("DB: Quick start...");

    // 1. Clear any stale advisory locks
    let _ = sqlx::query("SELECT pg_advisory_unlock_all()")
        .execute(pool)
        .await;

    // 2. Standard Migrations - Run directly without wrapper to move fast
    sqlx::migrate!("./migrations").run(pool).await?;

    // 3. Seeds
    let _ = ensure_seeds(pool).await;
    eprintln!("System: Database ready.");

    Ok(())
}

async fn ensure_seeds(pool: &DbPool) -> MyceliumResult<()> {
    let admin_username = std::env::var("ADMIN_USER").unwrap_or_else(|_| "admin".to_string());

    // Check and insert admin
    let admin_exists: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM users WHERE username = $1")
        .bind(&admin_username)
        .fetch_one(pool)
        .await
        .unwrap_or((0,));
    if admin_exists.0 == 0 {
        if let Ok(hash) = bcrypt::hash("admin", bcrypt::DEFAULT_COST) {
            let _ = sqlx::query("INSERT INTO users (username, password_hash, role) VALUES ($1, $2, 'admin') ON CONFLICT DO NOTHING").bind(&admin_username).bind(hash).execute(pool).await;
        }
    }

    // Check and insert company
    let company_exists: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM company_info")
        .fetch_one(pool)
        .await
        .unwrap_or((0,));
    if company_exists.0 == 0 {
        let _ = sqlx::query(
            "INSERT INTO company_info (company_name) VALUES ($1) ON CONFLICT DO NOTHING",
        )
        .bind("Mycelium Smart Farm")
        .execute(pool)
        .await;
    }
    Ok(())
}

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct Sales {
    pub sales_id: String,
    pub customer_id: Option<String>,
    #[sqlx(default)]
    pub customer_name: Option<String>,
    #[sqlx(default)]
    pub customer_mobile: Option<String>,
    #[sqlx(default)]
    pub customer_address: Option<String>,
    pub status: String,
    // handling potential nulls with Option
    pub order_date: Option<NaiveDate>,
    pub product_name: String,
    pub specification: Option<String>,
    pub unit_price: i32,
    pub quantity: i32,
    pub total_amount: i32,
    #[sqlx(default)]
    pub discount_rate: Option<i32>,
    #[sqlx(default)]
    pub courier_name: Option<String>,
    #[sqlx(default)]
    pub tracking_number: Option<String>,
    #[sqlx(default)]
    pub memo: Option<String>,

    #[sqlx(default)]
    pub shipping_name: Option<String>,
    #[sqlx(default)]
    pub shipping_zip_code: Option<String>,
    #[sqlx(default)]
    pub shipping_address_primary: Option<String>,
    #[sqlx(default)]
    pub shipping_address_detail: Option<String>,
    #[sqlx(default)]
    pub shipping_mobile_number: Option<String>,
    #[sqlx(default)]
    pub shipping_date: Option<NaiveDate>,
    #[sqlx(default)]
    pub paid_amount: Option<i32>,
    #[sqlx(default)]
    pub payment_status: Option<String>,
    #[sqlx(default)]
    pub updated_at: Option<NaiveDateTime>,
    #[sqlx(default)]
    pub product_code: Option<String>,
    #[sqlx(default)]
    pub product_id: Option<i32>,
    #[sqlx(default)]
    pub supply_value: Option<i32>,
    #[sqlx(default)]
    pub vat_amount: Option<i32>,
    #[sqlx(default)]
    pub tax_type: Option<String>,
    #[sqlx(default)]
    pub tax_exempt_value: Option<i32>,
}

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct CustomerLedger {
    pub ledger_id: i32,
    pub customer_id: String,
    pub transaction_date: NaiveDate,
    pub transaction_type: String,
    pub amount: i32,
    pub description: Option<String>,
    pub reference_id: Option<String>,
    pub created_at: Option<chrono::NaiveDateTime>,
    pub updated_at: Option<chrono::NaiveDateTime>,
}

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct CustomerLedgerEntry {
    pub ledger_id: i32,
    pub customer_id: String,
    pub transaction_date: String, // Transformed to String manually in query or struct
    pub transaction_type: String,
    pub amount: i32,
    pub description: Option<String>,
    pub reference_id: Option<String>,
    pub running_balance: i64,
}

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct Customer {
    pub customer_id: String,
    pub customer_name: String,
    pub mobile_number: String,
    pub membership_level: Option<String>,
    pub phone_number: Option<String>,
    pub email: Option<String>,
    pub zip_code: Option<String>,
    pub address_primary: Option<String>,
    pub address_detail: Option<String>,

    // CRM Fields
    #[sqlx(default)]
    pub anniversary_date: Option<NaiveDate>,
    #[sqlx(default)]
    pub anniversary_type: Option<String>,
    #[sqlx(default)]
    pub marketing_consent: Option<bool>,
    #[sqlx(default)]
    pub acquisition_channel: Option<String>,

    // Preferences
    #[sqlx(default)]
    pub pref_product_type: Option<String>,
    #[sqlx(default)]
    pub pref_package_type: Option<String>,
    #[sqlx(default)]
    pub family_type: Option<String>,
    #[sqlx(default)]
    pub health_concern: Option<String>,
    #[sqlx(default)]
    pub sub_interest: Option<bool>,
    #[sqlx(default)]
    pub purchase_cycle: Option<String>,

    #[sqlx(default)]
    pub memo: Option<String>,
    #[sqlx(default)]
    pub current_balance: Option<i32>,
    #[sqlx(default)]
    pub join_date: Option<NaiveDate>,
    #[sqlx(default)]
    pub status: Option<String>,
    #[sqlx(default)]
    pub created_at: Option<NaiveDateTime>,
    #[sqlx(default)]
    pub updated_at: Option<NaiveDateTime>,
}

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct CustomerAddress {
    pub address_id: i32,
    pub customer_id: String,
    pub address_alias: String,
    pub recipient_name: String,
    pub mobile_number: String,
    pub zip_code: Option<String>,
    pub address_primary: String,
    pub address_detail: Option<String>,
    pub is_default: bool,
    pub shipping_memo: Option<String>,
    pub created_at: Option<NaiveDateTime>,
    #[sqlx(default)]
    pub updated_at: Option<NaiveDateTime>,
}

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct CustomerLog {
    pub log_id: i32,
    pub customer_id: String,
    pub field_name: String,
    pub old_value: Option<String>,
    pub new_value: Option<String>,
    pub changed_at: Option<NaiveDateTime>,
    pub changed_by: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct Schedule {
    pub schedule_id: i32,
    pub title: String,
    pub description: Option<String>,
    pub start_time: NaiveDateTime,
    pub end_time: NaiveDateTime,
    pub status: Option<String>,
    pub created_at: Option<NaiveDateTime>,
    #[sqlx(default)]
    pub updated_at: Option<NaiveDateTime>,
    pub related_type: Option<String>, // 'EXPERIENCE', etc.
    pub related_id: Option<i32>,      // reservation_id
}

#[derive(Debug, Serialize, Deserialize, FromRow, Default)]
pub struct DashboardStats {
    pub total_sales_amount: Option<i64>, // Sum can be null if no rows
    pub total_orders: Option<i64>,
    pub total_customers: Option<i64>,
    pub total_customers_all_time: Option<i64>,
    pub normal_customers_count: Option<i64>,  // Added
    pub dormant_customers_count: Option<i64>, // Added
    pub pending_orders: Option<i64>,
    pub today_schedule_count: Option<i64>,
    pub experience_reservation_count: Option<i64>, // Renamed for "Reservation Status"
    pub low_stock_count: Option<i64>,
    pub pending_consultation_count: Option<i64>,
}

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct InventoryAlert {
    pub product_id: i32,
    pub product_name: String,
    pub specification: Option<String>,
    pub stock_quantity: i32,
    pub safety_stock: i32,
    pub daily_avg_consumption: f64,
    pub days_remaining: i32,
    pub item_type: String,
}

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct TenYearSalesStats {
    pub year: String,
    pub record_count: i64,
    pub total_quantity: i64,
    pub total_amount: i64,
}

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct MonthlyCohortStats {
    pub yyyymm: String, // e.g., "202401"
    pub record_count: i64,
    pub total_quantity: i64,
    pub total_amount: i64,
}

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct ProductSalesStats {
    pub product_id: Option<i32>,
    pub product_name: String,
    pub record_count: i64,
    pub total_quantity: i64,
    pub total_amount: i64,
}

#[derive(Debug, Serialize, serde::Deserialize, FromRow)]
pub struct Product {
    pub product_id: Option<i32>,
    pub product_name: String,
    pub specification: Option<String>,
    pub unit_price: i32,
    #[sqlx(default)]
    pub stock_quantity: Option<i32>,
    #[sqlx(default)]
    pub safety_stock: Option<i32>,
    #[sqlx(default)]
    pub cost_price: Option<i32>,
    #[sqlx(default)]
    pub material_id: Option<i32>,
    #[sqlx(default)]
    pub material_ratio: Option<f64>,
    #[sqlx(default)]
    pub aux_material_id: Option<i32>,
    #[sqlx(default)]
    pub aux_material_ratio: Option<f64>,
    #[sqlx(default)]
    pub item_type: Option<String>,
    #[sqlx(default)]
    pub updated_at: Option<NaiveDateTime>,
    #[sqlx(default)]
    pub product_code: Option<String>,
    #[sqlx(default)]
    pub status: Option<String>, // '판매중', '단종상품'
    #[sqlx(default)]
    pub category: Option<String>,
    #[sqlx(default)]
    pub tax_type: Option<String>,
    #[sqlx(default)]
    pub tax_exempt_value: Option<i32>,
}

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct Event {
    pub event_id: String,
    pub event_name: String,
    pub organizer: Option<String>,
    pub manager_name: Option<String>,
    pub manager_contact: Option<String>,
    pub location_address: Option<String>,
    pub location_detail: Option<String>,
    pub start_date: Option<NaiveDate>,
    pub end_date: Option<NaiveDate>,
    pub memo: Option<String>,
    pub created_at: Option<NaiveDateTime>,
    #[sqlx(default)]
    pub updated_at: Option<NaiveDateTime>,
}

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct User {
    pub id: i32,
    pub username: String,
    pub password_hash: Option<String>,
    pub role: String,
    pub created_at: Option<NaiveDateTime>,
    #[sqlx(default)]
    pub updated_at: Option<NaiveDateTime>,
}

#[derive(Debug, Serialize, Deserialize, FromRow, Default)]
pub struct CompanyInfo {
    pub id: i32,
    pub company_name: String,
    pub representative_name: Option<String>,
    pub address: Option<String>,
    pub business_type: Option<String>,
    pub item: Option<String>,
    pub phone_number: Option<String>,
    pub mobile_number: Option<String>,
    pub business_reg_number: Option<String>,
    pub registration_date: Option<NaiveDateTime>,
    pub memo: Option<String>,
    #[sqlx(default)]
    pub certification_info: Option<serde_json::Value>,
    pub created_at: Option<NaiveDateTime>,
    #[sqlx(default)]
    pub updated_at: Option<NaiveDateTime>,
}

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct ExperienceProgram {
    pub program_id: i32,
    pub program_name: String,
    pub description: Option<String>,
    pub duration_min: i32,
    pub max_capacity: i32,
    pub price_per_person: i32,
    pub is_active: Option<bool>,
    pub created_at: Option<NaiveDateTime>,
    #[sqlx(default)]
    pub updated_at: Option<NaiveDateTime>,
}

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct ExperienceReservation {
    pub reservation_id: i32,
    pub program_id: i32,
    pub program_name: Option<String>, // Joined from experience_programs
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
    #[sqlx(default)]
    pub updated_at: Option<NaiveDateTime>,
}

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct ChurnRiskCustomer {
    pub customer_id: String,
    pub customer_name: String,
    pub mobile_number: String,
    pub last_order_date: Option<NaiveDate>,
    pub total_orders: i64,
    pub total_amount: i64,
    pub days_since_last_order: i64,
    pub risk_score: i32,
}

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct LtvCustomer {
    pub customer_id: String,
    pub customer_name: String,
    pub membership_level: Option<String>,
    pub join_date: Option<NaiveDate>,
    pub total_spent: i64,
    pub total_orders: i64,
    pub years_active: f64,
    pub ltv_score: f64,
}

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct BestCustomer {
    pub customer_id: String,
    pub customer_name: String,
    pub mobile_number: Option<String>,
    pub membership_level: Option<String>,
    pub address_primary: Option<String>,
    pub address_detail: Option<String>,
    pub total_orders: i64,
    pub total_qty: i64,
    pub total_amount: i64,
}

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct ProductAssociation {
    pub product_a: String,
    pub product_b: String,
    pub pair_count: i64,
    pub support_percent: f64,
}

#[derive(Debug, serde::Serialize, serde::Deserialize)]
pub struct StrategyItem {
    pub title: String,
    pub description: String,
    pub impact: String,
}

#[derive(Debug, serde::Serialize, serde::Deserialize)]
pub struct AiMarketingProposal {
    pub product_a: String,
    pub product_b: String,
    pub confidence_score: f64,
    pub lift_score: f64,
    pub top_membership: String,
    pub top_region: String,
    pub trend_status: String,
    pub strategies: Vec<StrategyItem>,
    pub ad_copies: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct CustomerLifecycle {
    pub customer_id: String,
    pub customer_name: String,
    pub mobile_number: String,
    pub membership_level: Option<String>,
    pub last_order_date: Option<NaiveDate>,
    pub total_orders: i64,
    pub total_amount: i64,
    pub days_since_last_order: i64,
    pub rfm_segment: String, // e.g. "Champions", "At Risk"
    pub recency: i32,        // 1-5
    pub frequency: i32,      // 1-5
    pub monetary: i32,       // 1-5
}

#[derive(Debug, FromRow)]
pub struct RawRfmData {
    pub customer_id: String,
    pub customer_name: String,
    pub mobile_number: String,
    pub membership_level: Option<String>,
    pub last_order_date: Option<NaiveDate>,
    pub total_orders: i64,
    pub total_amount: i64,
}

#[derive(Debug, Serialize, serde::Deserialize)]
pub struct OnlineMentionInput {
    pub source: String,
    pub text: String,
    pub date: String,
    pub link: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct KeywordItem {
    pub text: String,
    pub weight: i32,
    pub sentiment_type: String, // "pos", "neg", "neu"
}

#[derive(Debug, Serialize)]
pub struct AnalyzedMention {
    pub original_text: String, // Truncated or full
    pub sentiment_score: i32,
    pub sentiment_label: String, // "pos", "neg", "neu"
}

#[derive(Debug, Serialize)]
pub struct SentimentAnalysisResult {
    pub total_score: i32,
    pub verdict: String,
    pub summary: String,
    pub keywords: Vec<KeywordItem>,
    pub analyzed_mentions: Vec<AnalyzedMention>,
}

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct RepurchaseCandidate {
    pub customer_id: String,
    pub customer_name: String,
    pub mobile_number: Option<String>,
    pub last_order_date: Option<NaiveDate>,
    pub avg_interval_days: i32,
    pub predicted_days_remaining: i32,
    pub last_product: Option<String>,
    pub purchase_count: i64,
}

#[derive(Debug, serde::Serialize, serde::Deserialize, sqlx::FromRow)]
pub struct Consultation {
    pub consult_id: i32,
    pub customer_id: Option<String>,
    pub guest_name: String,
    pub contact: String,
    pub channel: String, // '전화', '문자', '방문', '기타'
    pub counselor_name: String,
    pub category: String,
    pub title: String,
    pub content: String,
    pub answer: Option<String>,
    pub status: String,
    pub priority: String,
    pub consult_date: NaiveDate,
    pub follow_up_date: Option<NaiveDate>,
    pub created_at: Option<chrono::NaiveDateTime>,
    #[sqlx(default)]
    pub updated_at: Option<chrono::NaiveDateTime>,
    pub sentiment: Option<String>,
}

#[derive(Debug, serde::Serialize, serde::Deserialize, sqlx::FromRow)]
pub struct SalesClaim {
    pub claim_id: i32,
    pub sales_id: String,
    pub customer_id: Option<String>,
    pub claim_type: String,      // '취소', '반품', '교환'
    pub claim_status: String,    // '접수', '처리중', '완료', '거부'
    pub reason_category: String, // '단순변심', '배송파손', '품질불만', '오배송'
    pub quantity: i32,
    pub refund_amount: i32,
    pub is_inventory_recovered: bool,
    pub memo: Option<String>,
    pub created_at: Option<chrono::NaiveDateTime>,
    #[sqlx(default)]
    pub updated_at: Option<chrono::NaiveDateTime>,
    #[sqlx(default)]
    pub customer_name: Option<String>,
}

#[derive(Debug, serde::Serialize, serde::Deserialize, FromRow)]
pub struct Vendor {
    pub vendor_id: Option<i32>,
    pub vendor_name: String,
    pub business_number: Option<String>,
    pub representative: Option<String>,
    pub mobile_number: Option<String>,
    pub email: Option<String>,
    pub address: Option<String>,
    pub main_items: Option<String>,
    pub memo: Option<String>,
    pub is_active: Option<bool>,
    pub created_at: Option<NaiveDateTime>,
    #[sqlx(default)]
    pub updated_at: Option<NaiveDateTime>,
}

#[derive(Debug, serde::Serialize, serde::Deserialize, FromRow)]
pub struct Purchase {
    pub purchase_id: Option<i32>,
    pub vendor_id: Option<i32>,
    pub vendor_name: Option<String>, // Joined for display
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
    #[sqlx(default)]
    pub updated_at: Option<NaiveDateTime>,
}

#[derive(Debug, serde::Serialize, serde::Deserialize)]
pub struct InventorySyncItem {
    pub product_id: i32,
    pub quantity: i32,
}

#[derive(Debug, serde::Serialize, serde::Deserialize, FromRow)]
pub struct Expense {
    pub expense_id: Option<i32>,
    pub expense_date: Option<NaiveDate>,
    pub category: String,
    pub amount: i32,
    pub payment_method: Option<String>,
    pub memo: Option<String>,
    pub created_at: Option<NaiveDateTime>,
    pub updated_at: Option<NaiveDateTime>,
}

#[derive(Debug, serde::Serialize, serde::Deserialize)]
pub struct ConsultationAiAdvice {
    pub analysis: String,
    pub strategy: String,
    pub recommended_answer: String,
    pub caution_points: String,
}

#[derive(Debug, serde::Serialize, serde::Deserialize, FromRow)]
pub struct SmsLog {
    pub log_id: i32,
    pub recipient_name: String,
    pub mobile_number: String,
    pub content: String,
    pub status: String, // '성공', '실패'
    pub sent_at: Option<chrono::NaiveDateTime>,
}
#[derive(Debug, serde::Serialize, serde::Deserialize, sqlx::FromRow)]
pub struct ProfitAnalysisResult {
    pub product_name: String,
    pub record_count: i64,
    pub total_quantity: i64,
    pub total_revenue: i64,
    pub unit_cost: i64,
    pub total_cost: i64,
    pub net_profit: i64,
    pub margin_rate: f64,
}

#[derive(Debug, serde::Serialize, serde::Deserialize, sqlx::FromRow)]
pub struct ProductPriceHistory {
    pub history_id: i32,
    pub product_id: i32,
    pub old_price: i32,
    pub new_price: i32,
    pub reason: Option<String>,
    pub changed_at: chrono::NaiveDateTime,
}

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct InventoryLog {
    pub log_id: i32,
    pub product_id: Option<i32>,
    pub product_name: String,
    pub specification: Option<String>,
    pub product_code: Option<String>,
    pub change_type: String,
    pub change_quantity: i32,
    pub current_stock: i32,
    pub reference_id: Option<String>,
    pub memo: Option<String>,
    pub created_at: Option<chrono::NaiveDateTime>,
    #[sqlx(default)]
    pub updated_at: Option<chrono::NaiveDateTime>,
}

#[derive(Debug, serde::Serialize, serde::Deserialize)]
pub struct ProductHistoryItem {
    pub history_type: String, // '생성', '수정', '가격변경', '상태변경', '재고'
    pub date: String,
    pub title: String,
    pub description: String,
    pub old_value: Option<String>,
    pub new_value: Option<String>,
    pub change_amount: i32,
}

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct ProductBom {
    pub id: i32,
    pub product_id: i32,
    pub material_id: i32,
    pub ratio: f64,
}

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct ProductBomJoin {
    pub id: i32,
    pub product_id: i32,
    pub material_id: i32,
    pub ratio: f64,
    pub product_name: String, // Joined material name
    pub specification: Option<String>,
    pub stock_quantity: i32, // Current stock of material
    pub item_type: Option<String>,
}
#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct ProductionSpace {
    pub space_id: i32,
    pub space_name: String,
    pub space_type: Option<String>,
    pub location_info: Option<String>,
    pub area_size: Option<rust_decimal::Decimal>,
    pub area_unit: Option<String>,
    pub is_active: bool,
    pub memo: Option<String>,
    pub created_at: Option<DateTime<Utc>>,
    pub updated_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct ProductionBatch {
    pub batch_id: i32,
    pub batch_code: String,
    pub product_id: Option<i32>,
    pub space_id: Option<i32>,
    pub start_date: NaiveDate,
    pub end_date: Option<NaiveDate>,
    pub expected_harvest_date: Option<NaiveDate>,
    pub status: Option<String>,
    pub initial_quantity: Option<rust_decimal::Decimal>,
    pub unit: Option<String>,
    pub created_at: Option<DateTime<Utc>>,
    pub updated_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct FarmingLog {
    pub log_id: i32,
    pub batch_id: Option<i32>,
    pub space_id: Option<i32>,
    pub log_date: NaiveDate,
    pub worker_name: Option<String>,
    pub work_type: String,
    pub work_content: String,
    pub input_materials: Option<serde_json::Value>,
    pub env_data: Option<serde_json::Value>,
    pub photos: Option<serde_json::Value>,
    pub created_at: Option<DateTime<Utc>>,
    pub updated_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct HarvestRecord {
    pub harvest_id: i32,
    pub batch_id: Option<i32>,
    pub harvest_date: NaiveDate,
    pub quantity: rust_decimal::Decimal,
    #[sqlx(default)]
    pub defective_quantity: Option<rust_decimal::Decimal>,
    #[sqlx(default)]
    pub loss_quantity: Option<rust_decimal::Decimal>,
    pub unit: String,
    pub grade: Option<String>,
    pub traceability_code: Option<String>,
    #[sqlx(default)]
    pub lot_number: Option<String>,
    #[sqlx(default)]
    pub package_count: Option<i32>,
    #[sqlx(default)]
    pub weight_per_package: Option<rust_decimal::Decimal>,
    #[sqlx(default)]
    pub package_unit: Option<String>,
    pub memo: Option<String>,
    pub created_at: Option<DateTime<Utc>>,
    #[sqlx(default)]
    pub updated_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct Sensor {
    pub sensor_id: i32,
    pub sensor_name: String,
    pub space_id: Option<i32>,
    pub device_type: String,
    pub connection_info: Option<String>,
    pub is_active: bool,
    pub created_at: Option<DateTime<Utc>>,
    pub updated_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct SensorReadingRecord {
    pub reading_id: i32,
    pub sensor_id: i32,
    pub temperature: Option<rust_decimal::Decimal>,
    pub humidity: Option<rust_decimal::Decimal>,
    pub co2: Option<rust_decimal::Decimal>,
    pub recorded_at: Option<DateTime<Utc>>,
}

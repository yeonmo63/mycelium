use bcrypt;
use chrono::{NaiveDate, NaiveDateTime};
use serde::{Deserialize, Serialize};
use sqlx::postgres::PgPoolOptions;
use sqlx::{FromRow, Pool, Postgres};

pub type DbPool = Pool<Postgres>;

pub async fn init_pool(database_url: &str) -> Result<DbPool, sqlx::Error> {
    PgPoolOptions::new()
        .max_connections(20) // Optimized for 5+ clients (20 * 5 = 100 max)
        .acquire_timeout(std::time::Duration::from_secs(30))
        .idle_timeout(std::time::Duration::from_secs(120)) // Keep idle conns longer
        .max_lifetime(std::time::Duration::from_secs(300)) // Rotate connections every 5m
        .connect(database_url)
        .await
}

pub async fn init_database(pool: &DbPool) -> Result<(), String> {
    // 0. Combined Migration & Schema Query
    // We combine indices and table alterations into fewer blocks to reduce RTT.

    let base_setup = r#"
        -- Standard Indexes
        CREATE INDEX IF NOT EXISTS idx_sales_fts ON sales USING GIN (to_tsvector('simple', product_name || ' ' || COALESCE(shipping_name, '') || ' ' || COALESCE(memo, '')));
        CREATE INDEX IF NOT EXISTS idx_customers_fts ON customers USING GIN (to_tsvector('simple', customer_name || ' ' || mobile_number || ' ' || COALESCE(memo, '')));
        CREATE INDEX IF NOT EXISTS idx_sales_order_date ON sales (order_date);
        CREATE INDEX IF NOT EXISTS idx_sales_customer_id ON sales (customer_id);
        CREATE INDEX IF NOT EXISTS idx_sales_status ON sales (status);
        CREATE INDEX IF NOT EXISTS idx_sales_product_name ON sales (product_name);
        CREATE INDEX IF NOT EXISTS idx_products_product_name ON products (product_name);
        CREATE INDEX IF NOT EXISTS idx_inventory_logs_product_name ON inventory_logs (product_name);

        -- Column Migrations with DO blocks for safety
        DO $$ 
        BEGIN 
            -- rename 'name' to 'customer_name' if exists
            IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='customers' AND column_name='name') THEN
                ALTER TABLE customers RENAME COLUMN name TO customer_name;
            END IF;
            
            -- Products Table
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='safety_stock') THEN ALTER TABLE products ADD COLUMN safety_stock INTEGER DEFAULT 10; END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='cost_price') THEN ALTER TABLE products ADD COLUMN cost_price INTEGER DEFAULT 0; END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='item_type') THEN ALTER TABLE products ADD COLUMN item_type VARCHAR(20) DEFAULT 'product'; END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='material_id') THEN ALTER TABLE products ADD COLUMN material_id INTEGER; END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='material_ratio') THEN ALTER TABLE products ADD COLUMN material_ratio FLOAT DEFAULT 1.0; END IF;

            -- Sales Table
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='sales' AND column_name='discount_rate') THEN ALTER TABLE sales ADD COLUMN discount_rate INTEGER DEFAULT 0; END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='sales' AND column_name='paid_amount') THEN ALTER TABLE sales ADD COLUMN paid_amount INTEGER DEFAULT 0; END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='sales' AND column_name='payment_status') THEN ALTER TABLE sales ADD COLUMN payment_status VARCHAR(20) DEFAULT '입금완료'; END IF;
            
            -- Customers Table
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='customers' AND column_name='current_balance') THEN ALTER TABLE customers ADD COLUMN current_balance INTEGER DEFAULT 0; END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='customers' AND column_name='email') THEN ALTER TABLE customers ADD COLUMN email VARCHAR(100); END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='customers' AND column_name='anniversary_date') THEN ALTER TABLE customers ADD COLUMN anniversary_date DATE; END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='customers' AND column_name='anniversary_type') THEN ALTER TABLE customers ADD COLUMN anniversary_type VARCHAR(50); END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='customers' AND column_name='marketing_consent') THEN ALTER TABLE customers ADD COLUMN marketing_consent BOOLEAN DEFAULT FALSE; END IF;

            -- Company Info
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='company_info' AND column_name='address') THEN ALTER TABLE company_info ADD COLUMN address VARCHAR(255); END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='company_info' AND column_name='business_type') THEN ALTER TABLE company_info ADD COLUMN business_type VARCHAR(100); END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='company_info' AND column_name='item') THEN ALTER TABLE company_info ADD COLUMN item VARCHAR(100); END IF;
            
            -- Schedules
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='schedules' AND column_name='related_type') THEN ALTER TABLE schedules ADD COLUMN related_type VARCHAR(20); END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='schedules' AND column_name='related_id') THEN ALTER TABLE schedules ADD COLUMN related_id INTEGER; END IF;

            -- Consultations
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='consultations' AND column_name='sentiment') THEN ALTER TABLE consultations ADD COLUMN sentiment VARCHAR(20); END IF;
            
            -- Purchases
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='purchases' AND column_name='inventory_synced') THEN ALTER TABLE purchases ADD COLUMN inventory_synced BOOLEAN DEFAULT FALSE; END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='purchases' AND column_name='material_item_id') THEN ALTER TABLE purchases ADD COLUMN material_item_id INTEGER; END IF;
        END $$;
    "#;

    // Execute setup block
    let _ = sqlx::raw_sql(base_setup).execute(pool).await;

    // 1. Check if tables exist before running full schema
    let table_exists: (bool,) = sqlx::query_as(
        "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'users')",
    )
    .fetch_one(pool)
    .await
    .unwrap_or((false,));

    if !table_exists.0 {
        let schema = include_str!("schema.sql");
        let _ = sqlx::raw_sql(schema).execute(pool).await;
    }

    // 2. Initial Seeds
    let user_count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM users")
        .fetch_one(pool)
        .await
        .map_err(|e: sqlx::Error| format!("Failed to check users count: {}", e))?;

    if user_count.0 == 0 {
        let admin_username = std::env::var("ADMIN_USER").unwrap_or_else(|_| "admin".to_string());
        let admin_password = std::env::var("ADMIN_PASS").unwrap_or_else(|_| "admin".to_string());
        let password_hash =
            bcrypt::hash(&admin_password, bcrypt::DEFAULT_COST).map_err(|e| e.to_string())?;
        sqlx::query("INSERT INTO users (username, password_hash, role) VALUES ($1, $2, $3)")
            .bind(admin_username)
            .bind(password_hash)
            .bind("admin")
            .execute(pool)
            .await
            .map_err(|e| e.to_string())?;
    }

    let company_count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM company_info")
        .fetch_one(pool)
        .await
        .map_err(|e| e.to_string())?;

    if company_count.0 == 0 {
        sqlx::query("INSERT INTO company_info (company_name) VALUES ($1)")
            .bind("(주)대관령송암버섯")
            .execute(pool)
            .await
            .map_err(|e| e.to_string())?;
    }

    // 4. Stock Management Trigger
    let trigger_sql = r#"
        CREATE OR REPLACE FUNCTION manage_product_stock() RETURNS TRIGGER AS $$
        DECLARE
            v_final_stock INTEGER;
        BEGIN
            IF (TG_OP = 'INSERT') THEN
                IF (NEW.status NOT IN ('취소', '반품', '반품완료')) THEN
                    UPDATE products SET stock_quantity = stock_quantity - NEW.quantity
                    WHERE product_name = NEW.product_name AND specification IS NOT DISTINCT FROM NEW.specification
                    RETURNING stock_quantity INTO v_final_stock;
                    INSERT INTO inventory_logs (product_name, specification, change_type, change_quantity, current_stock, reference_id, memo)
                    VALUES (NEW.product_name, NEW.specification, '출고', -NEW.quantity, COALESCE(v_final_stock, 0), NEW.sales_id, '판매 등록');
                END IF;
                RETURN NEW;
            ELSIF (TG_OP = 'DELETE') THEN
                IF (OLD.status NOT IN ('취소', '반품', '반품완료')) THEN
                    UPDATE products SET stock_quantity = stock_quantity + OLD.quantity
                    WHERE product_name = OLD.product_name AND specification IS NOT DISTINCT FROM OLD.specification
                    RETURNING stock_quantity INTO v_final_stock;
                    INSERT INTO inventory_logs (product_name, specification, change_type, change_quantity, current_stock, reference_id, memo)
                    VALUES (OLD.product_name, OLD.specification, '취소반품', OLD.quantity, COALESCE(v_final_stock, 0), OLD.sales_id, '판매 삭제(복구)');
                END IF;
                RETURN OLD;
            ELSIF (TG_OP = 'UPDATE') THEN
                IF (OLD.status NOT IN ('취소', '반품', '반품완료') AND NEW.status IN ('취소', '반품', '반품완료')) THEN
                    UPDATE products SET stock_quantity = stock_quantity + OLD.quantity
                    WHERE product_name = OLD.product_name AND specification IS NOT DISTINCT FROM OLD.specification
                    RETURNING stock_quantity INTO v_final_stock;
                    INSERT INTO inventory_logs (product_name, specification, change_type, change_quantity, current_stock, reference_id, memo)
                    VALUES (OLD.product_name, OLD.specification, '취소반품', OLD.quantity, COALESCE(v_final_stock, 0), OLD.sales_id, '상태 변경(취소/반품)');
                ELSIF (OLD.status IN ('취소', '반품', '반품완료') AND NEW.status NOT IN ('취소', '반품', '반품완료')) THEN
                    UPDATE products SET stock_quantity = stock_quantity - NEW.quantity
                    WHERE product_name = NEW.product_name AND specification IS NOT DISTINCT FROM NEW.specification
                    RETURNING stock_quantity INTO v_final_stock;
                    INSERT INTO inventory_logs (product_name, specification, change_type, change_quantity, current_stock, reference_id, memo)
                    VALUES (NEW.product_name, NEW.specification, '출고', -NEW.quantity, COALESCE(v_final_stock, 0), NEW.sales_id, '상태 변경(정상전환)');
                ELSIF (OLD.status NOT IN ('취소', '반품', '반품완료') AND NEW.status NOT IN ('취소', '반품', '반품완료')) THEN
                    IF (OLD.product_name = NEW.product_name AND OLD.specification IS NOT DISTINCT FROM NEW.specification) THEN
                        IF (OLD.quantity <> NEW.quantity) THEN
                            UPDATE products SET stock_quantity = stock_quantity + (OLD.quantity - NEW.quantity)
                            WHERE product_name = NEW.product_name AND specification IS NOT DISTINCT FROM NEW.specification
                            RETURNING stock_quantity INTO v_final_stock;
                            INSERT INTO inventory_logs (product_name, specification, change_type, change_quantity, current_stock, reference_id, memo)
                            VALUES (NEW.product_name, NEW.specification, '조정', (OLD.quantity - NEW.quantity), COALESCE(v_final_stock, 0), NEW.sales_id, '수량 수정');
                        END IF;
                    ELSE
                        UPDATE products SET stock_quantity = stock_quantity + OLD.quantity
                        WHERE product_name = OLD.product_name AND specification IS NOT DISTINCT FROM OLD.specification;
                        UPDATE products SET stock_quantity = stock_quantity - NEW.quantity
                        WHERE product_name = NEW.product_name AND specification IS NOT DISTINCT FROM NEW.specification
                        RETURNING stock_quantity INTO v_final_stock;
                        INSERT INTO inventory_logs (product_name, specification, change_type, change_quantity, current_stock, reference_id, memo)
                        VALUES (NEW.product_name, NEW.specification, '출고', -NEW.quantity, COALESCE(v_final_stock, 0), NEW.sales_id, '상품 변경(교체)');
                    END IF;
                END IF;
                RETURN NEW;
            END IF;
            RETURN NULL;
        END;
        $$ LANGUAGE plpgsql;

        DROP TRIGGER IF EXISTS trg_manage_stock ON sales;
        CREATE TRIGGER trg_manage_stock AFTER INSERT OR UPDATE OR DELETE ON sales FOR EACH ROW EXECUTE FUNCTION manage_product_stock();
    "#;
    let _ = sqlx::raw_sql(trigger_sql).execute(pool).await;

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
    pub discount_rate: Option<i32>,
    pub courier_name: Option<String>,
    pub tracking_number: Option<String>,
    pub memo: Option<String>,

    pub shipping_name: Option<String>,
    pub shipping_zip_code: Option<String>,
    pub shipping_address_primary: Option<String>,
    pub shipping_address_detail: Option<String>,
    pub shipping_mobile_number: Option<String>,
    pub shipping_date: Option<NaiveDate>,
    pub paid_amount: Option<i32>,
    pub payment_status: Option<String>,
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
    pub anniversary_date: Option<NaiveDate>,
    pub anniversary_type: Option<String>,
    pub marketing_consent: Option<bool>,
    pub acquisition_channel: Option<String>,

    // Preferences
    pub pref_product_type: Option<String>,
    pub pref_package_type: Option<String>,
    pub family_type: Option<String>,
    pub health_concern: Option<String>,
    pub sub_interest: Option<bool>,
    pub purchase_cycle: Option<String>,

    pub memo: Option<String>,
    pub current_balance: Option<i32>,
    pub join_date: Option<NaiveDate>,
    pub created_at: Option<NaiveDateTime>,
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
    pub related_type: Option<String>, // 'EXPERIENCE', etc.
    pub related_id: Option<i32>,      // reservation_id
}

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct DashboardStats {
    pub total_sales_amount: Option<i64>, // Sum can be null if no rows
    pub total_orders: Option<i64>,
    pub total_customers: Option<i64>,
    pub total_customers_all_time: Option<i64>,
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
    pub stock_quantity: Option<i32>,
    pub safety_stock: Option<i32>,
    pub cost_price: Option<i32>,
    pub material_id: Option<i32>,
    pub material_ratio: Option<f64>,
    pub item_type: Option<String>,
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
}

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct User {
    pub id: i32,
    pub username: String,
    pub password_hash: Option<String>,
    pub role: String,
    pub created_at: Option<NaiveDateTime>,
}

#[derive(Debug, Serialize, Deserialize, FromRow)]
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
    pub created_at: Option<NaiveDateTime>,
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

use crate::commands::backup::models::{
    DeletionLog, ExperienceReservationBackup, ProductBomBackup, PurchaseBackup, SalesClaimBackup,
};
use crate::commands::backup::status::{get_last_backup_at, update_last_backup_at};

use crate::commands::preset::CustomPreset;
use crate::db::{
    CompanyInfo, Consultation, Customer, CustomerAddress, CustomerLedger, CustomerLog, DbPool,
    Event, Expense, ExperienceProgram, FarmingLog, HarvestRecord, InventoryLog, Product,
    ProductPriceHistory, ProductionBatch, ProductionSpace, Sales, Schedule, Sensor,
    SensorReadingRecord, User, Vendor,
};
use crate::error::{MyceliumError, MyceliumResult};
use crate::BACKUP_CANCELLED;
use flate2::read::GzDecoder;
use flate2::write::GzEncoder;
use flate2::Compression;
use futures_util::StreamExt;
use std::fs::File;
use std::io::{BufRead, BufWriter, Read, Write};
use std::sync::atomic::Ordering;
// Using global stubs
use crate::stubs::{AppHandle, Emitter, State as TauriState, check_admin};


pub async fn restore_database_sql(
    app: AppHandle,
    state: TauriState<'_, DbPool>,
    path: String,
) -> MyceliumResult<String> {
    // config_check_admin(&app)?;
    let sql = std::fs::read_to_string(&path)
        .map_err(|e| MyceliumError::Internal(format!("Failed to read SQL file: {}", e)))?;

    let mut conn = state.acquire().await?;
    sqlx::query(&sql).execute(&mut *conn).await?;

    Ok("복구가 완료되었습니다. 서비스를 다시 시작해 주세요.".to_string())
}


pub async fn backup_database(
    app: AppHandle,
    state: TauriState<'_, DbPool>,
    path: String,
    is_incremental: bool,
    use_compression: bool,
) -> MyceliumResult<String> {
    // config_check_admin(&app)?;
    let since = if is_incremental {
        get_last_backup_at(&app)
    } else {
        None
    };

    let result =
        backup_database_internal(Some(app.clone()), &*state, path, since, use_compression).await?;

    // Update last backup time on success
    let _ = update_last_backup_at(&app, chrono::Local::now().naive_local());

    Ok(result)
}

pub async fn backup_database_internal(
    app: Option<crate::stubs::AppHandle>,
    pool: &DbPool,
    path: String,
    since: Option<chrono::NaiveDateTime>,
    use_compression: bool,
) -> MyceliumResult<String> {
    let emit_progress = |processed: i64, total: i64, message: &str| {
        if let Some(ref handle) = app {
            let progress = if total > 0 {
                ((processed as f64 / total as f64) * 100.0) as i32
            } else {
                0
            };
            let _ = handle.emit(
                "backup-progress",
                serde_json::json!({
                    "progress": progress,
                    "message": message,
                    "processed": processed,
                    "total": total
                }),
            );
        }
    };

    BACKUP_CANCELLED.store(false, Ordering::Relaxed);
    emit_progress(0, 1, "데이터 개수 확인 중...");

    // Count records actually needing backup
    let count_query = |table: &str, time_col: Option<&str>| {
        let col = time_col.unwrap_or("updated_at");
        if let Some(s) = since {
            format!(
                "SELECT COUNT(*) FROM {} WHERE {} > '{}'",
                table,
                col,
                s.format("%Y-%m-%d %H:%M:%S")
            )
        } else {
            format!("SELECT COUNT(*) FROM {}", table)
        }
    };

    let count_users: (i64,) = sqlx::query_as(&count_query("users", None))
        .fetch_one(pool)
        .await?;
    let count_products: (i64,) = sqlx::query_as(&count_query("products", None))
        .fetch_one(pool)
        .await?;
    let count_customers: (i64,) = sqlx::query_as(&count_query("customers", None))
        .fetch_one(pool)
        .await?;
    let count_addresses: (i64,) = sqlx::query_as(&count_query("customer_addresses", None))
        .fetch_one(pool)
        .await?;
    let count_sales: (i64,) = sqlx::query_as(&count_query("sales", None))
        .fetch_one(pool)
        .await?;
    let count_events: (i64,) = sqlx::query_as(&count_query("event", None))
        .fetch_one(pool)
        .await?;
    let count_schedules: (i64,) = sqlx::query_as(&count_query("schedules", None))
        .fetch_one(pool)
        .await?;
    let count_company: (i64,) = sqlx::query_as(&count_query("company_info", None))
        .fetch_one(pool)
        .await?;
    let count_expenses: (i64,) = sqlx::query_as(&count_query("expenses", None))
        .fetch_one(pool)
        .await?;
    let count_purchases: (i64,) = sqlx::query_as(&count_query("purchases", None))
        .fetch_one(pool)
        .await?;
    let count_consultations: (i64,) = sqlx::query_as(&count_query("consultations", None))
        .fetch_one(pool)
        .await?;
    let count_claims: (i64,) = sqlx::query_as(&count_query("sales_claims", None))
        .fetch_one(pool)
        .await?;
    let count_bom: (i64,) = sqlx::query_as(&count_query("product_bom", Some("created_at")))
        .fetch_one(pool)
        .await?;
    let count_inventory: (i64,) =
        sqlx::query_as(&count_query("inventory_logs", Some("created_at")))
            .fetch_one(pool)
            .await?;
    let count_ledger: (i64,) = sqlx::query_as(&count_query("customer_ledger", None))
        .fetch_one(pool)
        .await?;
    let count_customer_logs: (i64,) = sqlx::query_as(&if let Some(s) = since {
        format!(
            "SELECT COUNT(*) FROM customer_logs WHERE changed_at > '{}'",
            s.format("%Y-%m-%d %H:%M:%S")
        )
    } else {
        "SELECT COUNT(*) FROM customer_logs".to_string()
    })
    .fetch_one(pool)
    .await?;
    let count_vendors: (i64,) = sqlx::query_as(&count_query("vendors", None))
        .fetch_one(pool)
        .await?;
    let count_exp_programs: (i64,) = sqlx::query_as(&count_query("experience_programs", None))
        .fetch_one(pool)
        .await?;
    let count_exp_reservations: (i64,) =
        sqlx::query_as(&count_query("experience_reservations", None))
            .fetch_one(pool)
            .await?;
    let count_price_history: (i64,) = sqlx::query_as(&if let Some(s) = since {
        format!(
            "SELECT COUNT(*) FROM product_price_history WHERE changed_at > '{}'",
            s.format("%Y-%m-%d %H:%M:%S")
        )
    } else {
        "SELECT COUNT(*) FROM product_price_history".to_string()
    })
    .fetch_one(pool)
    .await?;
    let count_deletions: (i64,) = if let Some(s) = since {
        sqlx::query_as(&format!(
            "SELECT COUNT(*) FROM deletion_log WHERE deleted_at > '{}'",
            s.format("%Y-%m-%d %H:%M:%S")
        ))
        .fetch_one(pool)
        .await?
    } else {
        sqlx::query_as("SELECT COUNT(*) FROM deletion_log")
            .fetch_one(pool)
            .await?
    };
    let count_prod_spaces: (i64,) = sqlx::query_as(&count_query("production_spaces", None))
        .fetch_one(pool)
        .await?;
    let count_prod_batches: (i64,) = sqlx::query_as(&count_query("production_batches", None))
        .fetch_one(pool)
        .await?;
    let count_farming_logs: (i64,) = sqlx::query_as(&count_query("farming_logs", None))
        .fetch_one(pool)
        .await?;
    let count_harvest: (i64,) = sqlx::query_as(&count_query("harvest_records", None))
        .fetch_one(pool)
        .await?;
    let count_custom_presets: (i64,) =
        sqlx::query_as(&count_query("custom_presets", Some("created_at")))
            .fetch_one(pool)
            .await?;
    let count_sensors: (i64,) = sqlx::query_as(&count_query("sensors", None))
        .fetch_one(pool)
        .await?;
    let count_sensor_readings: (i64,) =
        sqlx::query_as(&count_query("sensor_readings", Some("recorded_at")))
            .fetch_one(pool)
            .await?;

    let total_records = count_users.0
        + count_products.0
        + count_customers.0
        + count_addresses.0
        + count_sales.0
        + count_events.0
        + count_schedules.0
        + count_company.0
        + count_expenses.0
        + count_purchases.0
        + count_consultations.0
        + count_claims.0
        + count_bom.0
        + count_inventory.0
        + count_ledger.0
        + count_customer_logs.0
        + count_vendors.0
        + count_exp_programs.0
        + count_exp_reservations.0
        + count_price_history.0
        + count_deletions.0
        + count_prod_spaces.0
        + count_prod_batches.0
        + count_farming_logs.0
        + count_harvest.0
        + count_custom_presets.0
        + count_sensors.0
        + count_sensor_readings.0;

    if total_records == 0 {
        return Ok("백업할 데이터가 없습니다.".to_string());
    }

    let file = File::create(&path)
        .map_err(|e| MyceliumError::Internal(format!("Failed to create backup file: {}", e)))?;
    let mut writer: Box<dyn Write + Send> = if use_compression {
        Box::new(GzEncoder::new(BufWriter::new(file), Compression::default()))
    } else {
        Box::new(BufWriter::new(file))
    };

    let mut processed_offset = 0;

    // Helper macro/function for fetching and writing
    macro_rules! backup_table {
        ($table:expr, $model:ty, $time_col:expr, $msg:expr) => {
            if !BACKUP_CANCELLED.load(Ordering::Relaxed) {
                let count_fn = count_query($table, $time_col);
                let count: (i64,) = sqlx::query_as(&count_fn).fetch_one(pool).await?;
                if count.0 > 0 {
                    emit_progress(processed_offset, total_records, $msg);
                    let q_str = count_fn.replace("SELECT COUNT(*)", "SELECT *");
                    let mut stream = sqlx::query_as::<_, $model>(&q_str).fetch(pool);
                    while let Some(row) = stream.next().await {
                        if BACKUP_CANCELLED.load(Ordering::Relaxed) { break; }
                        let json = serde_json::json!({ "table": $table, "data": row? });
                        writeln!(writer, "{}", json)?;
                        processed_offset += 1;
                        if processed_offset % 100 == 0 { emit_progress(processed_offset, total_records, $msg); }
                    }
                }
            }
        };
    }

    backup_table!("users", User, None, "사용자 정보 백업 중...");
    backup_table!("company_info", CompanyInfo, None, "회사 정보 백업 중...");
    backup_table!("vendors", Vendor, None, "거래처 정보 백업 중...");
    backup_table!("products", Product, None, "품목 정보 백업 중...");
    backup_table!(
        "product_bom",
        ProductBomBackup,
        Some("created_at"),
        "BOM 정보 백업 중..."
    );
    backup_table!(
        "product_price_history",
        ProductPriceHistory,
        Some("changed_at"),
        "단가 이력 백업 중..."
    );
    backup_table!("customers", Customer, None, "고객 정보 백업 중...");
    backup_table!(
        "customer_addresses",
        CustomerAddress,
        None,
        "고객 주소 백업 중..."
    );
    backup_table!(
        "customer_logs",
        CustomerLog,
        Some("changed_at"),
        "고객 로그 백업 중..."
    );
    backup_table!(
        "customer_ledger",
        CustomerLedger,
        None,
        "장부 정보 백업 중..."
    );
    backup_table!("sales", Sales, None, "판매 기록 백업 중...");
    backup_table!(
        "sales_claims",
        SalesClaimBackup,
        None,
        "클레임 기록 백업 중..."
    );
    backup_table!(
        "inventory_logs",
        InventoryLog,
        Some("created_at"),
        "재고 로그 백업 중..."
    );
    backup_table!("purchases", PurchaseBackup, None, "매입 기록 백업 중...");
    backup_table!("expenses", Expense, None, "지출 기록 백업 중...");
    backup_table!("consultations", Consultation, None, "상담 기록 백업 중...");
    backup_table!("event", Event, None, "행사 정보 백업 중...");
    backup_table!("schedules", Schedule, None, "일정 정보 백업 중...");
    backup_table!(
        "experience_programs",
        ExperienceProgram,
        None,
        "체험 프로그램 백업 중..."
    );
    backup_table!(
        "experience_reservations",
        ExperienceReservationBackup,
        None,
        "체험 예약 백업 중..."
    );
    backup_table!(
        "production_spaces",
        ProductionSpace,
        None,
        "물리 공간 백업 중..."
    );
    backup_table!(
        "production_batches",
        ProductionBatch,
        None,
        "생산 배치 백업 중..."
    );
    backup_table!("farming_logs", FarmingLog, None, "영농 일지 백업 중...");
    backup_table!(
        "harvest_records",
        HarvestRecord,
        None,
        "수확 기록 백업 중..."
    );
    backup_table!(
        "sensor_readings",
        SensorReadingRecord,
        Some("recorded_at"),
        "센서 데이터 백업 중..."
    );
    backup_table!("sensors", Sensor, None, "IoT 장비 정보 백업 중...");
    backup_table!(
        "deletion_log",
        DeletionLog,
        Some("deleted_at"),
        "삭제 로그 백업 중..."
    );
    backup_table!(
        "custom_presets",
        CustomPreset,
        Some("created_at"),
        "커스텀 프리셋 백업 중..."
    );

    writer.flush()?;

    if BACKUP_CANCELLED.load(Ordering::Relaxed) {
        let _ = std::fs::remove_file(&path);
        return Err(MyceliumError::Internal(
            "사용자에 의해 취소되었습니다.".to_string(),
        ));
    }

    emit_progress(total_records, total_records, "백업 완료");
    Ok(format!("{}개의 데이터를 백업했습니다.", total_records))
}


pub async fn restore_database(
    app: AppHandle,
    state: TauriState<'_, DbPool>,
    path: String,
) -> MyceliumResult<String> {
    // config_check_admin(&app)?;
    let pool = &*state;
    let file = File::open(&path)
        .map_err(|e| MyceliumError::Internal(format!("Failed to open backup file: {}", e)))?;

    BACKUP_CANCELLED.store(false, Ordering::Relaxed);

    let emit_progress = |progress: i32, message: &str| {
        let _ = app.emit(
            "restore-progress",
            serde_json::json!({
                "progress": progress,
                "message": message
            }),
        );
    };

    // 1. Calculate Total Bytes for Progress
    let total_bytes: u64 = file
        .metadata()
        .map_err(|e: std::io::Error| MyceliumError::Internal(e.to_string()))?
        .len();
    emit_progress(0, "파일을 읽는 중...");

    use std::sync::atomic::AtomicU64;
    use std::sync::Arc;
    let byte_count = Arc::new(AtomicU64::new(0));

    struct CountingReader<R: Read> {
        inner: R,
        count: Arc<AtomicU64>,
    }
    impl<R: Read> Read for CountingReader<R> {
        fn read(&mut self, buf: &mut [u8]) -> std::io::Result<usize> {
            let res = self.inner.read(buf)?;
            self.count.fetch_add(res as u64, Ordering::Relaxed);
            Ok(res)
        }
    }

    let file_for_size = File::open(&path).map_err(|e| MyceliumError::Internal(e.to_string()))?;
    let underlying_counter = CountingReader {
        inner: file_for_size,
        count: byte_count.clone(),
    };
    let mut line_reader: Box<dyn BufRead + Send> = if path.ends_with(".gz") {
        Box::new(std::io::BufReader::new(GzDecoder::new(underlying_counter)))
    } else {
        Box::new(std::io::BufReader::new(underlying_counter))
    };

    let mut tx = pool.begin().await?;
    let mut total_restored = 0;
    let mut line = String::new();
    while line_reader.read_line(&mut line)? > 0 {
        if BACKUP_CANCELLED.load(Ordering::Relaxed) {
            break;
        }

        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&line) {
            let table = json["table"].as_str().unwrap_or_default();
            let data = &json["data"];

            match table {
                "users" => {
                    let d: User = serde_json::from_value(data.clone())?;
                    sqlx::query("INSERT INTO users (id, username, password_hash, role, created_at, updated_at) 
                                 VALUES ($1, $2, $3, $4, $5, $6) 
                                 ON CONFLICT (id) DO UPDATE SET username=$2, password_hash=$3, role=$4, updated_at=$6")
                        .bind(d.id).bind(&d.username).bind(&d.password_hash).bind(&d.role).bind(d.created_at).bind(d.updated_at)
                        .execute(&mut *tx).await?;
                }
                "company_info" => {
                    let d: CompanyInfo = serde_json::from_value(data.clone())?;
                    sqlx::query("INSERT INTO company_info (id, company_name, representative_name, address, business_type, item, phone_number, mobile_number, business_reg_number, registration_date, memo, certification_info, created_at, updated_at) 
                                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) 
                                 ON CONFLICT (id) DO UPDATE SET company_name=$2, representative_name=$3, address=$4, business_type=$5, item=$6, phone_number=$7, mobile_number=$8, business_reg_number=$9, registration_date=$10, memo=$11, certification_info=$12, updated_at=$14")
                        .bind(d.id).bind(&d.company_name).bind(&d.representative_name).bind(&d.address).bind(&d.business_type).bind(&d.item).bind(&d.phone_number).bind(&d.mobile_number).bind(&d.business_reg_number).bind(d.registration_date).bind(&d.memo).bind(&d.certification_info).bind(d.created_at).bind(d.updated_at)
                        .execute(&mut *tx).await?;
                }
                "vendors" => {
                    let d: Vendor = serde_json::from_value(data.clone())?;
                    sqlx::query("INSERT INTO vendors (vendor_id, vendor_name, business_number, representative, mobile_number, email, address, main_items, memo, is_active, created_at, updated_at) 
                                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) 
                                 ON CONFLICT (vendor_id) DO UPDATE SET vendor_name=$2, business_number=$3, representative=$4, mobile_number=$5, email=$6, address=$7, main_items=$8, memo=$9, is_active=$10, updated_at=$12")
                        .bind(d.vendor_id).bind(&d.vendor_name).bind(&d.business_number).bind(&d.representative).bind(&d.mobile_number).bind(&d.email).bind(&d.address).bind(&d.main_items).bind(&d.memo).bind(d.is_active).bind(d.created_at).bind(d.updated_at)
                        .execute(&mut *tx).await?;
                }
                "products" => {
                    let d: Product = serde_json::from_value(data.clone())?;
                    sqlx::query("INSERT INTO products (product_id, product_name, specification, unit_price, stock_quantity, safety_stock, cost_price, material_id, material_ratio, item_type, updated_at, product_code, status, category, tax_type, tax_exempt_value) 
                                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16) 
                                 ON CONFLICT (product_id) DO UPDATE SET product_name=$2, specification=$3, unit_price=$4, stock_quantity=$5, safety_stock=$6, cost_price=$7, material_id=$8, material_ratio=$9, item_type=$10, updated_at=$11, product_code=$12, status=$13, category=$14, tax_type=$15, tax_exempt_value=$16")
                        .bind(d.product_id).bind(&d.product_name).bind(&d.specification).bind(d.unit_price).bind(d.stock_quantity).bind(d.safety_stock).bind(d.cost_price).bind(d.material_id).bind(d.material_ratio).bind(&d.item_type).bind(d.updated_at).bind(&d.product_code).bind(&d.status).bind(&d.category).bind(&d.tax_type).bind(d.tax_exempt_value)
                        .execute(&mut *tx).await?;
                }
                "product_bom" => {
                    let d: ProductBomBackup = serde_json::from_value(data.clone())?;
                    sqlx::query("INSERT INTO product_bom (id, product_id, material_id, ratio, created_at) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING")
                        .bind(d.id).bind(d.product_id).bind(d.material_id).bind(d.ratio).bind(d.created_at)
                        .execute(&mut *tx).await?;
                }
                "product_price_history" => {
                    let d: ProductPriceHistory = serde_json::from_value(data.clone())?;
                    sqlx::query("INSERT INTO product_price_history (history_id, product_id, old_price, new_price, reason, changed_at) 
                                 VALUES ($1, $2, $3, $4, $5, $6) 
                                 ON CONFLICT (history_id) DO NOTHING")
                        .bind(d.history_id).bind(d.product_id).bind(d.old_price).bind(d.new_price).bind(&d.reason).bind(d.changed_at)
                        .execute(&mut *tx).await?;
                }
                "customers" => {
                    let d: Customer = serde_json::from_value(data.clone())?;
                    sqlx::query("INSERT INTO customers (customer_id, customer_name, mobile_number, membership_level, phone_number, email, zip_code, address_primary, address_detail, anniversary_date, anniversary_type, marketing_consent, acquisition_channel, pref_product_type, pref_package_type, family_type, health_concern, sub_interest, purchase_cycle, memo, current_balance, join_date, status, created_at, updated_at) 
                                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25) 
                                 ON CONFLICT (customer_id) DO UPDATE SET customer_name=$2, mobile_number=$3, membership_level=$4, phone_number=$5, email=$6, zip_code=$7, address_primary=$8, address_detail=$9, anniversary_date=$10, anniversary_type=$11, marketing_consent=$12, acquisition_channel=$13, pref_product_type=$14, pref_package_type=$15, family_type=$16, health_concern=$17, sub_interest=$18, purchase_cycle=$19, memo=$20, current_balance=$21, join_date=$22, status=$23, updated_at=$25")
                        .bind(&d.customer_id).bind(&d.customer_name).bind(&d.mobile_number).bind(&d.membership_level).bind(&d.phone_number).bind(&d.email).bind(&d.zip_code).bind(&d.address_primary).bind(&d.address_detail).bind(d.anniversary_date).bind(&d.anniversary_type).bind(d.marketing_consent).bind(&d.acquisition_channel).bind(&d.pref_product_type).bind(&d.pref_package_type).bind(&d.family_type).bind(&d.health_concern).bind(d.sub_interest).bind(&d.purchase_cycle).bind(&d.memo).bind(d.current_balance).bind(d.join_date).bind(&d.status).bind(d.created_at).bind(d.updated_at)
                        .execute(&mut *tx).await?;
                }
                "customer_addresses" => {
                    let d: CustomerAddress = serde_json::from_value(data.clone())?;
                    sqlx::query("INSERT INTO customer_addresses (address_id, customer_id, address_alias, recipient_name, mobile_number, zip_code, address_primary, address_detail, is_default, shipping_memo, created_at, updated_at) 
                                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) 
                                 ON CONFLICT (address_id) DO UPDATE SET address_alias=$3, recipient_name=$4, mobile_number=$5, zip_code=$6, address_primary=$7, address_detail=$8, is_default=$9, shipping_memo=$10, updated_at=$12")
                        .bind(d.address_id).bind(&d.customer_id).bind(&d.address_alias).bind(&d.recipient_name).bind(&d.mobile_number).bind(&d.zip_code).bind(&d.address_primary).bind(&d.address_detail).bind(d.is_default).bind(&d.shipping_memo).bind(d.created_at).bind(d.updated_at)
                        .execute(&mut *tx).await?;
                }
                "sales" => {
                    let d: Sales = serde_json::from_value(data.clone())?;
                    sqlx::query("INSERT INTO sales (sales_id, customer_id, status, order_date, product_name, specification, unit_price, quantity, total_amount, discount_rate, courier_name, tracking_number, memo, shipping_name, shipping_zip_code, shipping_address_primary, shipping_address_detail, shipping_mobile_number, shipping_date, paid_amount, payment_status, updated_at, product_code, product_id, supply_value, vat_amount, tax_type, tax_exempt_value) 
                                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28) 
                                 ON CONFLICT (sales_id) DO UPDATE SET status=$3, order_date=$4, product_name=$5, specification=$6, unit_price=$7, quantity=$8, total_amount=$9, discount_rate=$10, courier_name=$11, tracking_number=$12, memo=$13, shipping_name=$14, shipping_zip_code=$15, shipping_address_primary=$16, shipping_address_detail=$17, shipping_mobile_number=$18, shipping_date=$19, paid_amount=$20, payment_status=$21, updated_at=$22, product_code=$23, product_id=$24, supply_value=$25, vat_amount=$26, tax_type=$27, tax_exempt_value=$28")
                        .bind(&d.sales_id).bind(&d.customer_id).bind(&d.status).bind(d.order_date).bind(&d.product_name).bind(&d.specification).bind(d.unit_price).bind(d.quantity).bind(d.total_amount).bind(d.discount_rate).bind(&d.courier_name).bind(&d.tracking_number).bind(&d.memo).bind(&d.shipping_name).bind(&d.shipping_zip_code).bind(&d.shipping_address_primary).bind(&d.shipping_address_detail).bind(&d.shipping_mobile_number).bind(d.shipping_date).bind(d.paid_amount).bind(&d.payment_status).bind(d.updated_at).bind(&d.product_code).bind(d.product_id).bind(d.supply_value).bind(d.vat_amount).bind(&d.tax_type).bind(d.tax_exempt_value)
                        .execute(&mut *tx).await?;
                }
                "inventory_logs" => {
                    let d: InventoryLog = serde_json::from_value(data.clone())?;
                    sqlx::query("INSERT INTO inventory_logs (log_id, product_id, product_name, specification, product_code, change_type, change_quantity, current_stock, reference_id, memo, created_at, updated_at) 
                                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) 
                                 ON CONFLICT (log_id) DO NOTHING")
                        .bind(d.log_id).bind(d.product_id).bind(&d.product_name).bind(&d.specification).bind(&d.product_code).bind(&d.change_type).bind(d.change_quantity).bind(d.current_stock).bind(&d.reference_id).bind(&d.memo).bind(d.created_at).bind(d.updated_at)
                        .execute(&mut *tx).await?;
                }
                "purchases" => {
                    let d: PurchaseBackup = serde_json::from_value(data.clone())?;
                    sqlx::query("INSERT INTO purchases (purchase_id, vendor_id, purchase_date, item_name, specification, quantity, unit_price, total_amount, payment_status, memo, inventory_synced, material_item_id, created_at, updated_at) 
                                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) 
                                 ON CONFLICT (purchase_id) DO UPDATE SET vendor_id=$2, purchase_date=$3, item_name=$4, specification=$5, quantity=$6, unit_price=$7, total_amount=$8, payment_status=$9, memo=$10, inventory_synced=$11, material_item_id=$12, updated_at=$14")
                        .bind(d.purchase_id).bind(d.vendor_id).bind(d.purchase_date).bind(&d.item_name).bind(&d.specification).bind(d.quantity).bind(d.unit_price).bind(d.total_amount).bind(&d.payment_status).bind(&d.memo).bind(d.inventory_synced).bind(d.material_item_id).bind(d.created_at).bind(d.updated_at)
                        .execute(&mut *tx).await?;
                }
                "expenses" => {
                    let d: Expense = serde_json::from_value(data.clone())?;
                    sqlx::query("INSERT INTO expenses (expense_id, expense_date, category, amount, payment_method, memo, created_at, updated_at) 
                                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
                                 ON CONFLICT (expense_id) DO UPDATE SET expense_date=$2, category=$3, amount=$4, payment_method=$5, memo=$6, updated_at=$8")
                        .bind(d.expense_id).bind(d.expense_date).bind(&d.category).bind(d.amount).bind(&d.payment_method).bind(&d.memo).bind(d.created_at).bind(d.updated_at)
                        .execute(&mut *tx).await?;
                }
                "farming_logs" => {
                    let d: FarmingLog = serde_json::from_value(data.clone())?;
                    sqlx::query("INSERT INTO farming_logs (log_id, batch_id, space_id, log_date, worker_name, work_type, work_content, input_materials, env_data, photos, created_at, updated_at) 
                                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) 
                                 ON CONFLICT (log_id) DO UPDATE SET batch_id=$2, space_id=$3, log_date=$4, worker_name=$5, work_type=$6, work_content=$7, input_materials=$8, env_data=$9, photos=$10, updated_at=$12")
                        .bind(d.log_id).bind(d.batch_id).bind(d.space_id).bind(d.log_date).bind(&d.worker_name).bind(&d.work_type).bind(&d.work_content).bind(&d.input_materials).bind(&d.env_data).bind(&d.photos).bind(d.created_at).bind(d.updated_at)
                        .execute(&mut *tx).await?;
                }
                "production_batches" => {
                    let d: ProductionBatch = serde_json::from_value(data.clone())?;
                    sqlx::query("INSERT INTO production_batches (batch_id, batch_code, product_id, space_id, start_date, end_date, expected_harvest_date, status, initial_quantity, unit, created_at, updated_at) 
                                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) 
                                 ON CONFLICT (batch_id) DO UPDATE SET batch_code=$2, product_id=$3, space_id=$4, start_date=$5, end_date=$6, expected_harvest_date=$7, status=$8, initial_quantity=$9, unit=$10, updated_at=$12")
                        .bind(d.batch_id).bind(&d.batch_code).bind(d.product_id).bind(d.space_id).bind(d.start_date).bind(d.end_date).bind(d.expected_harvest_date).bind(&d.status).bind(d.initial_quantity).bind(&d.unit).bind(d.created_at).bind(d.updated_at)
                        .execute(&mut *tx).await?;
                }
                "harvest_records" => {
                    let d: HarvestRecord = serde_json::from_value(data.clone())?;
                    sqlx::query("INSERT INTO harvest_records (harvest_id, batch_id, harvest_date, quantity, unit, grade, traceability_code, lot_number, package_count, weight_per_package, package_unit, memo, created_at, updated_at, defective_quantity, loss_quantity) 
                                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16) 
                                 ON CONFLICT (harvest_id) DO UPDATE SET batch_id=$2, harvest_date=$3, quantity=$4, unit=$5, grade=$6, traceability_code=$7, lot_number=$8, package_count=$9, weight_per_package=$10, package_unit=$11, memo=$12, updated_at=$14, defective_quantity=$15, loss_quantity=$16")
                        .bind(d.harvest_id).bind(d.batch_id).bind(d.harvest_date).bind(d.quantity).bind(&d.unit).bind(&d.grade).bind(&d.traceability_code).bind(&d.lot_number).bind(d.package_count).bind(d.weight_per_package).bind(&d.package_unit).bind(&d.memo).bind(d.created_at).bind(d.updated_at).bind(d.defective_quantity).bind(d.loss_quantity)
                        .execute(&mut *tx).await?;
                }
                "deletion_log" => {
                    let d: DeletionLog = serde_json::from_value(data.clone())?;
                    sqlx::query("INSERT INTO deletion_log (log_id, table_name, record_id, deleted_info, deleted_by, deleted_at) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (log_id) DO NOTHING")
                        .bind(d.log_id).bind(&d.table_name).bind(&d.record_id).bind(&d.deleted_info).bind(&d.deleted_by).bind(d.deleted_at)
                        .execute(&mut *tx).await?;
                }
                "custom_presets" => {
                    let d: CustomPreset = serde_json::from_value(data.clone())?;
                    sqlx::query("INSERT INTO custom_presets (preset_id, name, description, preset_data, created_at) 
                                 VALUES ($1, $2, $3, $4, $5) 
                                 ON CONFLICT (preset_id) DO UPDATE SET name=$2, description=$3, preset_data=$4")
                        .bind(d.preset_id).bind(&d.name).bind(&d.description).bind(&d.preset_data).bind(d.created_at)
                        .execute(&mut *tx).await?;
                }
                "production_spaces" => {
                    let d: ProductionSpace = serde_json::from_value(data.clone())?;
                    sqlx::query("INSERT INTO production_spaces (space_id, space_name, space_type, is_active, updated_at) 
                                 VALUES ($1, $2, $3, $4, $5) 
                                 ON CONFLICT (space_id) DO UPDATE SET space_name=$2, space_type=$3, is_active=$4, updated_at=$5")
                        .bind(d.space_id).bind(&d.space_name).bind(&d.space_type).bind(d.is_active).bind(d.updated_at)
                        .execute(&mut *tx).await?;
                }
                "experience_programs" => {
                    let d: ExperienceProgram = serde_json::from_value(data.clone())?;
                    sqlx::query("INSERT INTO experience_programs (program_id, program_name, description, duration_min, max_capacity, price_per_person, is_active, created_at, updated_at) 
                                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) 
                                 ON CONFLICT (program_id) DO UPDATE SET program_name=$2, description=$3, duration_min=$4, max_capacity=$5, price_per_person=$6, is_active=$7, updated_at=$9")
                        .bind(d.program_id).bind(&d.program_name).bind(&d.description).bind(d.duration_min).bind(d.max_capacity).bind(d.price_per_person).bind(d.is_active).bind(d.created_at).bind(d.updated_at)
                        .execute(&mut *tx).await?;
                }
                "experience_reservations" => {
                    let d: ExperienceReservationBackup = serde_json::from_value(data.clone())?;
                    sqlx::query("INSERT INTO experience_reservations (reservation_id, program_id, customer_id, guest_name, guest_contact, reservation_date, reservation_time, participant_count, total_amount, status, payment_status, memo, created_at, updated_at) 
                                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) 
                                 ON CONFLICT (reservation_id) DO UPDATE SET program_id=$2, customer_id=$3, guest_name=$4, guest_contact=$5, reservation_date=$6, reservation_time=$7, participant_count=$8, total_amount=$9, status=$10, payment_status=$11, memo=$12, updated_at=$14")
                        .bind(d.reservation_id).bind(d.program_id).bind(&d.customer_id).bind(&d.guest_name).bind(&d.guest_contact).bind(d.reservation_date).bind(d.reservation_time).bind(d.participant_count).bind(d.total_amount).bind(&d.status).bind(&d.payment_status).bind(&d.memo).bind(d.created_at).bind(d.updated_at)
                        .execute(&mut *tx).await?;
                }
                "consultations" => {
                    let d: Consultation = serde_json::from_value(data.clone())?;
                    sqlx::query("INSERT INTO consultations (consult_id, customer_id, guest_name, contact, channel, counselor_name, category, title, content, answer, status, priority, sentiment, consult_date, follow_up_date, created_at, updated_at) 
                                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17) 
                                 ON CONFLICT (consult_id) DO UPDATE SET customer_id=$2, guest_name=$3, contact=$4, channel=$5, counselor_name=$6, category=$7, title=$8, content=$9, answer=$10, status=$11, priority=$12, sentiment=$13, consult_date=$14, follow_up_date=$15, updated_at=$17")
                        .bind(d.consult_id).bind(&d.customer_id).bind(&d.guest_name).bind(&d.contact).bind(&d.channel).bind(&d.counselor_name).bind(&d.category).bind(&d.title).bind(&d.content).bind(&d.answer).bind(&d.status).bind(&d.priority).bind(&d.sentiment).bind(d.consult_date).bind(d.follow_up_date).bind(d.created_at).bind(d.updated_at)
                        .execute(&mut *tx).await?;
                }
                "event" => {
                    let d: Event = serde_json::from_value(data.clone())?;
                    sqlx::query("INSERT INTO event (event_id, event_name, organizer, manager_name, manager_contact, location_address, location_detail, start_date, end_date, memo, created_at, updated_at) 
                                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) 
                                 ON CONFLICT (event_id) DO UPDATE SET event_name=$2, organizer=$3, manager_name=$4, manager_contact=$5, location_address=$6, location_detail=$7, start_date=$8, end_date=$9, memo=$10, updated_at=$12")
                        .bind(&d.event_id).bind(&d.event_name).bind(&d.organizer).bind(&d.manager_name).bind(&d.manager_contact).bind(&d.location_address).bind(&d.location_detail).bind(d.start_date).bind(d.end_date).bind(&d.memo).bind(d.created_at).bind(d.updated_at)
                        .execute(&mut *tx).await?;
                }
                "schedules" => {
                    let d: Schedule = serde_json::from_value(data.clone())?;
                    sqlx::query("INSERT INTO schedules (schedule_id, title, description, start_time, end_time, status, related_type, related_id, created_at, updated_at) 
                                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) 
                                 ON CONFLICT (schedule_id) DO UPDATE SET title=$2, description=$3, start_time=$4, end_time=$5, status=$6, related_type=$7, related_id=$8, updated_at=$10")
                        .bind(d.schedule_id).bind(&d.title).bind(&d.description).bind(d.start_time).bind(d.end_time).bind(&d.status).bind(&d.related_type).bind(d.related_id).bind(d.created_at).bind(d.updated_at)
                        .execute(&mut *tx).await?;
                }
                "sensors" => {
                    let d: Sensor = serde_json::from_value(data.clone())?;
                    sqlx::query("INSERT INTO sensors (sensor_id, sensor_name, space_id, device_type, connection_info, is_active, created_at, updated_at) 
                                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
                                 ON CONFLICT (sensor_id) DO UPDATE SET sensor_name=$2, space_id=$3, device_type=$4, connection_info=$5, is_active=$6, updated_at=$8")
                        .bind(d.sensor_id).bind(&d.sensor_name).bind(d.space_id).bind(&d.device_type).bind(&d.connection_info).bind(d.is_active).bind(d.created_at).bind(d.updated_at)
                        .execute(&mut *tx).await?;
                }
                "sensor_readings" => {
                    let d: SensorReadingRecord = serde_json::from_value(data.clone())?;
                    sqlx::query("INSERT INTO sensor_readings (reading_id, sensor_id, temperature, humidity, co2, recorded_at) 
                                 VALUES ($1, $2, $3, $4, $5, $6) 
                                 ON CONFLICT (reading_id) DO NOTHING")
                        .bind(d.reading_id).bind(d.sensor_id).bind(d.temperature).bind(d.humidity).bind(d.co2).bind(d.recorded_at)
                        .execute(&mut *tx).await?;
                }
                _ => {} // Other tables skip for now
            }

            total_restored += 1;
            if total_restored % 50 == 0 {
                let progress = ((byte_count.load(Ordering::Relaxed) as f64 / total_bytes as f64)
                    * 100.0) as i32;
                emit_progress(
                    progress,
                    &format!("{}개의 데이터 복구 중...", total_restored),
                );
            }
        }
        line.clear();
    }

    if BACKUP_CANCELLED.load(Ordering::Relaxed) {
        let _ = tx.rollback().await;
        return Err(MyceliumError::Internal(
            "사용자에 의해 취소되었습니다.".to_string(),
        ));
    }

    tx.commit().await?;
    emit_progress(100, "복구 완료");
    Ok(format!(
        "{}개의 데이터를 복구했습니다. 서비스를 다시 시작해 주세요.",
        total_restored
    ))
}

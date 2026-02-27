#[cfg(test)]
mod tests {
    use crate::commands::production::batch::save_production_batch;
    use crate::commands::production::harvest::{get_harvest_records, save_harvest_record};
    use crate::commands::sales::order::create_sale_internal;
    use crate::db::{self, DbPool, HarvestRecord, ProductionBatch};
    use crate::error::MyceliumResult;
    use rust_decimal::Decimal;

    async fn setup_test_db() -> DbPool {
        dotenvy::dotenv().ok();
        let database_url = std::env::var("DATABASE_URL").expect("DATABASE_URL must be set");
        let pool = db::init_pool(&database_url)
            .await
            .expect("Failed to create pool");

        // Run migrations to ensure triggers are updated
        db::init_database(&pool)
            .await
            .expect("Failed to run migrations");

        pool
    }

    #[tokio::test]
    async fn test_create_sale_integration() {
        let pool = setup_test_db().await;

        let product_name = "테스트 품목 (Integration Test)".to_string();
        let order_date = "2023-11-01".to_string();

        let result: MyceliumResult<String> = create_sale_internal(
            &pool,
            None,
            product_name.clone(),
            Some("테스트 규격".to_string()),
            10,
            1000,
            10000,
            order_date,
            Some("테스트 메모".to_string()),
            Some("접수".to_string()),
            None,
            None,
            None,
            None,
            None,
            None,
            None,
        )
        .await;

        assert!(
            result.is_ok(),
            "create_sale_internal failed: {:?}",
            result.err()
        );
        let sale_id = result.unwrap();

        let row: (String, String) =
            sqlx::query_as("SELECT product_name, status FROM sales WHERE sales_id = $1")
                .bind(&sale_id)
                .fetch_one(&pool)
                .await
                .expect("Failed to fetch created sale");

        assert_eq!(row.0, product_name);
        assert_eq!(row.1, "접수");

        let _ = sqlx::query("DELETE FROM sales WHERE sales_id = $1")
            .bind(&sale_id)
            .execute(&pool)
            .await;
    }

    #[tokio::test]
    async fn test_get_harvest_records_integration() {
        let pool = setup_test_db().await;

        let result = get_harvest_records(crate::stubs::State::from(&pool), None).await;

        assert!(
            result.is_ok(),
            "get_harvest_records failed: {:?}",
            result.err()
        );
        let records = result.unwrap();
        println!("Found {} harvest records", records.len());
    }

    #[tokio::test]
    async fn test_delete_sale_integration() {
        let pool = setup_test_db().await;

        // 1. Create a sale to delete
        let product_name = "테스트 품목 (Delete Test)".to_string();
        let order_date = "2023-11-02".to_string();

        let create_res: MyceliumResult<String> = create_sale_internal(
            &pool,
            None,
            product_name.clone(),
            None,
            5,
            5000,
            25000,
            order_date,
            None,
            Some("접수".to_string()),
            None,
            None,
            None,
            None,
            None,
            None,
            None,
        )
        .await;

        assert!(create_res.is_ok());
        let sale_id = create_res.unwrap();

        // 2. Delete the sale
        let delete_res = crate::commands::sales::order::delete_sale(&pool, sale_id.clone()).await;

        assert!(
            delete_res.is_ok(),
            "delete_sale failed: {:?}",
            delete_res.err()
        );

        // 3. Verify it's gone
        let check_res = sqlx::query("SELECT sales_id FROM sales WHERE sales_id = $1")
            .bind(&sale_id)
            .fetch_optional(&pool)
            .await;

        assert!(check_res.is_ok());
        assert!(
            check_res.unwrap().is_none(),
            "Sale still exists after deletion"
        );
    }

    #[tokio::test]
    async fn test_update_sale_status_integration() {
        let pool = setup_test_db().await;

        // 1. Create sale
        let product_name = "상태 업데이트 테스트".to_string();
        let sale_id = create_sale_internal(
            &pool,
            None,
            product_name,
            None,
            1,
            1000,
            1000,
            "2023-11-03".to_string(),
            None,
            Some("접수".to_string()),
            None,
            None,
            None,
            None,
            None,
            None,
            None,
        )
        .await
        .unwrap();

        // 2. Update status
        let res = crate::commands::sales::order::update_sale_status(
            &pool,
            sale_id.clone(),
            "입금완료".to_string(),
        )
        .await;
        assert!(res.is_ok());

        // 3. Verify
        let status: String = sqlx::query_scalar("SELECT status FROM sales WHERE sales_id = $1")
            .bind(&sale_id)
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(status, "입금완료");

        // Cleanup
        let _ = sqlx::query("DELETE FROM sales WHERE sales_id = $1")
            .bind(&sale_id)
            .execute(&pool)
            .await;
    }

    #[tokio::test]
    async fn test_ledger_flow_integration() {
        let pool = setup_test_db().await;

        // 1. Create a customer
        let customer_name = "원장 테스트 고객".to_string();
        let customer_id_str = "TEST-LEDGER-01".to_string();
        sqlx::query("INSERT INTO customers (customer_id, customer_name, mobile_number, current_balance) VALUES ($1, $2, '010-0000-9999', 0)")
            .bind(&customer_id_str)
            .bind(&customer_name)
            .execute(&pool)
            .await.unwrap();
        let customer_id = customer_id_str;

        // 2. Add ledger entry (Sales)
        let _ = crate::commands::ledger::create_ledger_entry(
            &pool,
            customer_id.clone(),
            "2023-11-03".to_string(),
            "매출".to_string(),
            10000,
            Some("테스트 매출".to_string()),
        )
        .await
        .unwrap();

        // 3. Verify balance
        let balance: i32 =
            sqlx::query_scalar("SELECT current_balance FROM customers WHERE customer_id = $1")
                .bind(&customer_id)
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(balance, 10000);

        // 4. Add ledger entry (Deposit)
        let _ = crate::commands::ledger::create_ledger_entry(
            &pool,
            customer_id.clone(),
            "2023-11-03".to_string(),
            "입금".to_string(),
            -5000,
            Some("테스트 입금".to_string()),
        )
        .await
        .unwrap();

        // 5. Verify balance again
        let balance2: i32 =
            sqlx::query_scalar("SELECT current_balance FROM customers WHERE customer_id = $1")
                .bind(&customer_id)
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(balance2, 5000);

        // Cleanup
        let _ = sqlx::query("DELETE FROM customer_ledger WHERE customer_id = $1")
            .bind(&customer_id)
            .execute(&pool)
            .await;
        let _ = sqlx::query("DELETE FROM customers WHERE customer_id = $1")
            .bind(&customer_id)
            .execute(&pool)
            .await;
    }

    #[tokio::test]
    async fn test_stock_bom_recovery_integration() {
        let pool = setup_test_db().await;

        let trig_names: Vec<(String, String)> = sqlx::query_as(
            "SELECT trigger_schema, trigger_name FROM information_schema.triggers WHERE event_object_table = 'sales'",
        )
        .fetch_all(&pool)
        .await
        .unwrap();
        for t in &trig_names {
            println!("TRIGGER: {}.{}", t.0, t.1);
        }
        println!("TRIGGER COUNT ON sales: {}", trig_names.len());

        let main_pid: i32 = sqlx::query_scalar("INSERT INTO products (product_name, specification, stock_quantity, item_type) VALUES ('BOM Main Test', 'Test Spec', 100, 'product') RETURNING product_id").fetch_one(&pool).await.unwrap();
        let mat_pid: i32 = sqlx::query_scalar("INSERT INTO products (product_name, specification, stock_quantity, item_type) VALUES ('BOM Material Test', 'Test Spec', 100, 'material') RETURNING product_id").fetch_one(&pool).await.unwrap();
        println!("PIDs: Main={}, Material={}", main_pid, mat_pid);

        // 2. Setup BOM: 1 Main needs 2.5 units of Material
        sqlx::query(
            "INSERT INTO product_bom (product_id, material_id, ratio) VALUES ($1, $2, 2.5)",
        )
        .bind(main_pid)
        .bind(mat_pid)
        .execute(&pool)
        .await
        .unwrap();

        // 3. Create a sale for 4 units
        let sale_id = create_sale_internal(
            &pool,
            None,
            "BOM Main Test".to_string(),
            Some("Test Spec".to_string()),
            4,
            1000,
            4000,
            "2023-11-04".to_string(),
            None,
            Some("접수".to_string()),
            None,
            None,
            None,
            None,
            None,
            None,
            None,
        )
        .await
        .unwrap();

        // 4. Check stocks:
        let s1: i32 =
            sqlx::query_scalar("SELECT stock_quantity FROM products WHERE product_id = $1")
                .bind(main_pid)
                .fetch_one(&pool)
                .await
                .unwrap();
        let s2: i32 =
            sqlx::query_scalar("SELECT stock_quantity FROM products WHERE product_id = $1")
                .bind(mat_pid)
                .fetch_one(&pool)
                .await
                .unwrap();

        let logs: Vec<(String, i32, String, Option<i32>)> =
            sqlx::query_as("SELECT product_name, change_quantity, change_type, current_stock FROM inventory_logs WHERE reference_id = $1")
                .bind(&sale_id)
                .fetch_all(&pool)
                .await
                .unwrap();
        for l in &logs {
            println!(
                "LOG: {} | qty: {} | type: {} | stock: {:?}",
                l.0, l.1, l.2, l.3
            );
        }

        println!(
            "AFTER INSERT: Main={}, Material={}, Logs={}",
            s1,
            s2,
            logs.len()
        );
        assert_eq!(s1, 96, "Main product stock mismatch after insert");
        assert_eq!(s2, 90, "Material product stock mismatch after insert");

        // 5. Delete sale
        crate::commands::sales::order::delete_sale(&pool, sale_id)
            .await
            .unwrap();

        // 6. Check stocks again: everything restored
        let r1: i32 =
            sqlx::query_scalar("SELECT stock_quantity FROM products WHERE product_id = $1")
                .bind(main_pid)
                .fetch_one(&pool)
                .await
                .unwrap();
        let r2: i32 =
            sqlx::query_scalar("SELECT stock_quantity FROM products WHERE product_id = $1")
                .bind(mat_pid)
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(r1, 100, "Main product stock mismatch after delete");
        assert_eq!(r2, 100, "Material product stock mismatch after delete");

        // Cleanup
        let _ = sqlx::query("DELETE FROM product_bom WHERE product_id = $1")
            .bind(main_pid)
            .execute(&pool)
            .await;
        let _ = sqlx::query("DELETE FROM products WHERE product_id IN ($1, $2)")
            .bind(main_pid)
            .bind(mat_pid)
            .execute(&pool)
            .await;
    }

    #[tokio::test]
    async fn test_deletion_log_automation_integration() {
        let pool = setup_test_db().await;

        // 1. Create a dummy sale
        let sale_id = format!(
            "S-DEL-LOG-{}",
            uuid::Uuid::new_v4().to_string()[..8].to_uppercase()
        );
        sqlx::query("INSERT INTO sales (sales_id, product_name, quantity, unit_price, total_amount, order_date) VALUES ($1, 'Delete Log Test', 1, 1000, 1000, CURRENT_DATE)")
            .bind(&sale_id)
            .execute(&pool)
            .await.unwrap();

        // 2. Delete the sale within a transaction with user context
        let mut tx = pool.begin().await.unwrap();
        db::set_db_user_context(&mut *tx, "TestUser").await.unwrap();
        sqlx::query("DELETE FROM sales WHERE sales_id = $1")
            .bind(&sale_id)
            .execute(&mut *tx)
            .await
            .unwrap();
        tx.commit().await.unwrap();

        // 3. Verify entry in deletion_log
        let log: Option<(String, String, Option<String>)> = sqlx::query_as("SELECT table_name, record_id, deleted_by FROM deletion_log WHERE table_name = 'sales' AND record_id = $1")
            .bind(&sale_id)
            .fetch_optional(&pool)
            .await.unwrap();

        assert!(
            log.is_some(),
            "Deletion log entry missing for sales_id: {}",
            sale_id
        );
        let (table_name, record_id, deleted_by) = log.unwrap();
        assert_eq!(table_name, "sales");
        assert_eq!(record_id, sale_id);
        assert_eq!(deleted_by.as_deref(), Some("TestUser"));

        println!(
            "SUCCESS: Deletion log correctly recorded for sales_id={} with user=TestUser",
            sale_id
        );
    }

    #[tokio::test]
    async fn test_customer_soft_delete_logging_integration() {
        let pool = setup_test_db().await;

        // 1. Create a dummy customer
        let customer_id = format!(
            "C-LOG-{}",
            uuid::Uuid::new_v4().to_string()[..8].to_uppercase()
        );
        sqlx::query("INSERT INTO customers (customer_id, customer_name, mobile_number, status) VALUES ($1, 'Soft Delete Test', '010-0000-0000', '정상')")
            .bind(&customer_id)
            .execute(&pool)
            .await.unwrap();

        // 2. Perform Soft Delete within a transaction with user context
        let mut tx = pool.begin().await.unwrap();
        db::set_db_user_context(&mut *tx, "AuditUser")
            .await
            .unwrap();
        sqlx::query("UPDATE customers SET status = '말소' WHERE customer_id = $1")
            .bind(&customer_id)
            .execute(&mut *tx)
            .await
            .unwrap();
        tx.commit().await.unwrap();

        // 3. Verify entry in BOTH customer_logs AND deletion_log
        // Case A: customer_logs
        let log: Option<(String, String, String, Option<String>)> = sqlx::query_as("SELECT field_name, old_value, new_value, changed_by FROM customer_logs WHERE customer_id = $1 AND field_name = 'status'")
            .bind(&customer_id)
            .fetch_optional(&pool)
            .await.unwrap();

        assert!(
            log.is_some(),
            "Customer log entry missing for status change"
        );
        let (field, old_v, new_v, changed_by) = log.unwrap();
        assert_eq!(field, "status");
        assert_eq!(old_v, "정상");
        assert_eq!(new_v, "말소");
        assert_eq!(changed_by.as_deref(), Some("AuditUser"));

        // Case B: deletion_log (Trigger should also record it here for unified audit)
        let del_log: Option<(String, Option<String>)> = sqlx::query_as("SELECT table_name, deleted_by FROM deletion_log WHERE table_name = 'customers' AND record_id = $1")
            .bind(&customer_id)
            .fetch_optional(&pool)
            .await.unwrap();

        assert!(
            del_log.is_some(),
            "Deletion log entry missing for soft deleted customer"
        );
        let (tbl, del_by) = del_log.unwrap();
        assert_eq!(tbl, "customers");
        assert_eq!(del_by.as_deref(), Some("AuditUser"));

        println!("SUCCESS: Soft delete correctly logged in both customer_logs and deletion_log with user=AuditUser");
    }

    #[tokio::test]
    async fn test_harvest_and_stock_update_integration() {
        let pool = setup_test_db().await;

        // 1. Setup - Create a test product
        // Product name must match what the harvest logic expects
        let u_str = uuid::Uuid::new_v4().to_string();
        let product_name = format!("Harvest Test Product - {}", &u_str[..8]);
        let product_id: (i32,) = sqlx::query_as("INSERT INTO products (product_name, specification, unit_price, stock_quantity, iteM_type) VALUES ($1, 'Test Spec', 1000, 0, 'product') RETURNING product_id")
            .bind(&product_name)
            .fetch_one(&pool)
            .await.unwrap();
        let p_id = product_id.0;

        // 2. Setup - Create a production batch
        let b_uuid = uuid::Uuid::new_v4().to_string();
        let batch_code = format!("BATCH-{}", &b_uuid[..8]);
        let batch = ProductionBatch {
            batch_id: 0,
            batch_code: batch_code.clone(),
            product_id: Some(p_id),
            space_id: None,
            start_date: chrono::Local::now().date_naive(), // Not Option
            end_date: None,
            expected_harvest_date: None,
            status: Some("running".to_string()),
            initial_quantity: Some(Decimal::from(100)),
            unit: Some("kg".to_string()),
            created_at: None,
            updated_at: None,
        };
        save_production_batch(crate::stubs::State::from(&pool), batch)
            .await
            .expect("Failed to create production batch");

        // Fetch the generated batch_id
        let db_batch: (i32,) =
            sqlx::query_as("SELECT batch_id FROM production_batches WHERE batch_code = $1")
                .bind(&batch_code)
                .fetch_one(&pool)
                .await
                .unwrap();
        let b_id = db_batch.0;

        // 3. Record a Harvest
        let harvest_qty = Decimal::from(50);
        let record = HarvestRecord {
            harvest_id: 0,
            batch_id: Some(b_id), // Now Option
            harvest_date: chrono::Local::now().date_naive(),
            quantity: harvest_qty,
            defective_quantity: Some(Decimal::from(5)),
            loss_quantity: Some(Decimal::from(2)),
            unit: "kg".to_string(),
            grade: Some("First Class".to_string()),
            traceability_code: Some("TR_001".to_string()),
            lot_number: Some("LOT_001".to_string()), // Added
            package_count: None,
            weight_per_package: None,
            package_unit: None,
            memo: Some("Test Harvest".to_string()),
            created_at: None,
            updated_at: None,
        };

        // Use a transaction scope if needed, but save_harvest_record starts its own
        save_harvest_record(crate::stubs::State::from(&pool), record, Some(true))
            .await
            .expect("Failed to record harvest");

        // 4. Verify Results
        // Verify Stock Increase
        let stock_row: (i32,) =
            sqlx::query_as("SELECT stock_quantity FROM products WHERE product_id = $1")
                .bind(p_id)
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(
            stock_row.0, 50,
            "Product stock should have increased by harvested quantity"
        );

        // Verify Inventory Log
        let log_row: (String, i32) = sqlx::query_as("SELECT change_type, change_quantity FROM inventory_logs WHERE product_id = $1 AND memo LIKE '%수확%'")
            .bind(p_id)
            .fetch_one(&pool).await.unwrap();
        assert_eq!(log_row.0, "입고");
        assert_eq!(log_row.1, 50);

        // Verify Batch Status Update
        let batch_status: (String,) =
            sqlx::query_as("SELECT status FROM production_batches WHERE batch_id = $1")
                .bind(b_id)
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(
            batch_status.0, "completed",
            "Batch status should be updated to 'completed'"
        );

        println!("SUCCESS: Production harvest flow verified. Stock increased and batch completed.");
    }
}

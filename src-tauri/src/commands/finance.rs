use crate::db::{
    DbPool, Expense, ProductSalesStats, ProfitAnalysisResult, Purchase, TenYearSalesStats, Vendor,
};
use crate::DB_MODIFIED;
use chrono::NaiveDate;
use serde::Deserialize;
use std::sync::atomic::Ordering;
use tauri::{command, State};

#[derive(Debug, Deserialize)]
#[allow(non_snake_case)]
pub struct PurchaseInput {
    pub purchase_id: Option<i32>,
    pub vendor_id: Option<i32>,
    pub purchase_date: Option<String>,
    pub item_name: String,
    pub specification: Option<String>,
    pub quantity: i32,
    pub unit_price: i32,
    pub total_amount: i32,
    pub payment_status: Option<String>,
    pub memo: Option<String>,
    pub inventory_synced: Option<bool>,
    pub material_item_id: Option<i32>,
}

#[derive(Debug, Deserialize)]
pub struct SyncItem {
    pub product_id: i32,
    pub quantity: i32,
}

#[command]
pub async fn get_vendor_list(state: State<'_, DbPool>) -> Result<Vec<Vendor>, String> {
    sqlx::query_as::<_, Vendor>("SELECT * FROM vendors ORDER BY vendor_name")
        .fetch_all(&*state)
        .await
        .map_err(|e| e.to_string())
}

#[derive(Debug, Deserialize)]
pub struct VendorInput {
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
}

#[command]
pub async fn save_vendor(state: State<'_, DbPool>, vendor: VendorInput) -> Result<(), String> {
    DB_MODIFIED.store(true, Ordering::Relaxed);
    if let Some(id) = vendor.vendor_id {
        sqlx::query(
            "UPDATE vendors SET vendor_name=$1, business_number=$2, representative=$3, mobile_number=$4, email=$5, address=$6, main_items=$7, memo=$8, is_active=$9 WHERE vendor_id=$10"
        )
        .bind(vendor.vendor_name).bind(vendor.business_number).bind(vendor.representative).bind(vendor.mobile_number).bind(vendor.email).bind(vendor.address).bind(vendor.main_items).bind(vendor.memo).bind(vendor.is_active).bind(id)
        .execute(&*state).await.map_err(|e| e.to_string())?;
    } else {
        sqlx::query(
            "INSERT INTO vendors (vendor_name, business_number, representative, mobile_number, email, address, main_items, memo, is_active) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)"
        )
        .bind(vendor.vendor_name).bind(vendor.business_number).bind(vendor.representative).bind(vendor.mobile_number).bind(vendor.email).bind(vendor.address).bind(vendor.main_items).bind(vendor.memo).bind(vendor.is_active.unwrap_or(true))
        .execute(&*state).await.map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[command]
pub async fn delete_vendor(state: State<'_, DbPool>, vendor_id: i32) -> Result<(), String> {
    DB_MODIFIED.store(true, Ordering::Relaxed);
    sqlx::query("DELETE FROM vendors WHERE vendor_id = $1")
        .bind(vendor_id)
        .execute(&*state)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[command]
pub async fn get_purchase_list(state: State<'_, DbPool>) -> Result<Vec<Purchase>, String> {
    sqlx::query_as::<_, Purchase>(
        "SELECT p.*, v.vendor_name FROM purchases p LEFT JOIN vendors v ON p.vendor_id = v.vendor_id ORDER BY p.purchase_date DESC"
    )
    .fetch_all(&*state)
    .await
    .map_err(|e| e.to_string())
}

#[command]
pub async fn save_purchase(
    state: State<'_, DbPool>,
    purchase: PurchaseInput,
    inventory_sync_data: Option<Vec<SyncItem>>,
) -> Result<(), String> {
    DB_MODIFIED.store(true, Ordering::Relaxed);
    let mut tx = state.begin().await.map_err(|e| e.to_string())?;

    let p_date = purchase
        .purchase_date
        .and_then(|d| NaiveDate::parse_from_str(&d, "%Y-%m-%d").ok());

    if let Some(id) = purchase.purchase_id {
        sqlx::query(
            "UPDATE purchases SET vendor_id=$1, purchase_date=$2, item_name=$3, specification=$4, quantity=$5, unit_price=$6, total_amount=$7, payment_status=$8, memo=$9, inventory_synced=$10, material_item_id=$11 WHERE purchase_id=$12"
        )
        .bind(purchase.vendor_id).bind(p_date).bind(&purchase.item_name).bind(&purchase.specification).bind(purchase.quantity).bind(purchase.unit_price).bind(purchase.total_amount).bind(&purchase.payment_status).bind(&purchase.memo).bind(purchase.inventory_synced).bind(purchase.material_item_id).bind(id)
        .execute(&mut *tx).await.map_err(|e| e.to_string())?;
    } else {
        sqlx::query(
            "INSERT INTO purchases (vendor_id, purchase_date, item_name, specification, quantity, unit_price, total_amount, payment_status, memo, inventory_synced, material_item_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)"
        )
        .bind(purchase.vendor_id).bind(p_date).bind(&purchase.item_name).bind(&purchase.specification).bind(purchase.quantity).bind(purchase.unit_price).bind(purchase.total_amount).bind(&purchase.payment_status).bind(&purchase.memo).bind(purchase.inventory_synced).bind(purchase.material_item_id)
        .execute(&mut *tx).await.map_err(|e| e.to_string())?;
    }

    // Handle Inventory Sync
    if let Some(items) = inventory_sync_data {
        for item in items {
            sqlx::query(
                "UPDATE products SET stock_quantity = stock_quantity + $1 WHERE product_id = $2",
            )
            .bind(item.quantity)
            .bind(item.product_id)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;

            // Log entry
            sqlx::query("INSERT INTO inventory_logs (product_id, product_name, specification, product_code, change_type, change_quantity, current_stock, memo) 
                         VALUES ($1, (SELECT product_name FROM products WHERE product_id = $1), (SELECT specification FROM products WHERE product_id = $1), (SELECT product_code FROM products WHERE product_id = $1), '입고', $2, (SELECT stock_quantity FROM products WHERE product_id = $1), $3)")
                .bind(item.product_id)
                .bind(item.quantity)
                .bind(format!("매입 연동 입고: {}", purchase.item_name))
                .execute(&mut *tx)
                .await
                .map_err(|e| e.to_string())?;
        }
    }

    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(())
}

#[command]
pub async fn delete_purchase(state: State<'_, DbPool>, purchase_id: i32) -> Result<(), String> {
    DB_MODIFIED.store(true, Ordering::Relaxed);
    sqlx::query("DELETE FROM purchases WHERE purchase_id = $1")
        .bind(purchase_id)
        .execute(&*state)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[command]
pub async fn get_expense_list(state: State<'_, DbPool>) -> Result<Vec<Expense>, String> {
    sqlx::query_as::<_, Expense>("SELECT * FROM expenses ORDER BY expense_date DESC")
        .fetch_all(&*state)
        .await
        .map_err(|e| e.to_string())
}

#[derive(Debug, Deserialize)]
pub struct ExpenseInput {
    pub expense_id: Option<i32>,
    pub expense_date: Option<String>,
    pub category: String,
    pub amount: i32,
    pub payment_method: Option<String>,
    pub memo: Option<String>,
}

#[command]
pub async fn save_expense(state: State<'_, DbPool>, expense: ExpenseInput) -> Result<(), String> {
    DB_MODIFIED.store(true, Ordering::Relaxed);
    let e_date = expense
        .expense_date
        .and_then(|d| NaiveDate::parse_from_str(&d, "%Y-%m-%d").ok());

    if let Some(id) = expense.expense_id {
        sqlx::query(
            "UPDATE expenses SET expense_date=$1, category=$2, amount=$3, payment_method=$4, memo=$5 WHERE expense_id=$6"
        )
        .bind(e_date).bind(expense.category).bind(expense.amount).bind(expense.payment_method).bind(expense.memo).bind(id)
        .execute(&*state).await.map_err(|e| e.to_string())?;
    } else {
        sqlx::query(
            "INSERT INTO expenses (expense_date, category, amount, payment_method, memo) VALUES ($1,$2,$3,$4,$5)"
        )
        .bind(e_date).bind(expense.category).bind(expense.amount).bind(expense.payment_method).bind(expense.memo)
        .execute(&*state).await.map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[command]
pub async fn delete_expense(state: State<'_, DbPool>, expense_id: i32) -> Result<(), String> {
    DB_MODIFIED.store(true, Ordering::Relaxed);
    sqlx::query("DELETE FROM expenses WHERE expense_id = $1")
        .bind(expense_id)
        .execute(&*state)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[derive(Debug, serde::Serialize)]
pub struct MonthlyPL {
    pub month: String,
    pub revenue: i64,
    pub cost: i64,
    pub profit: i64,
}

#[command]
pub async fn get_monthly_pl_report(
    state: State<'_, DbPool>,
    year: i32,
) -> Result<Vec<MonthlyPL>, String> {
    let sales_sql = r#"
        SELECT TO_CHAR(order_date, 'MM')::integer as month, SUM(total_amount)::bigint as amount
        FROM sales WHERE EXTRACT(YEAR FROM order_date) = $1 AND status != '취소' GROUP BY month
    "#;
    let purchase_sql = r#"
        SELECT TO_CHAR(purchase_date, 'MM')::integer as month, SUM(total_amount)::bigint as amount
        FROM purchases WHERE EXTRACT(YEAR FROM purchase_date) = $1 GROUP BY month
    "#;
    let expense_sql = r#"
        SELECT TO_CHAR(expense_date, 'MM')::integer as month, SUM(amount)::bigint as amount
        FROM expenses WHERE EXTRACT(YEAR FROM expense_date) = $1 GROUP BY month
    "#;

    let sales: Vec<(i32, i64)> = sqlx::query_as(sales_sql)
        .bind(year)
        .fetch_all(&*state)
        .await
        .unwrap_or_default();
    let purchases: Vec<(i32, i64)> = sqlx::query_as(purchase_sql)
        .bind(year)
        .fetch_all(&*state)
        .await
        .unwrap_or_default();
    let expenses: Vec<(i32, i64)> = sqlx::query_as(expense_sql)
        .bind(year)
        .fetch_all(&*state)
        .await
        .unwrap_or_default();

    let mut report = Vec::new();
    for m in 1..=12 {
        let revenue = sales
            .iter()
            .find(|(month, _)| *month == m)
            .map(|(_, amt)| *amt)
            .unwrap_or(0);
        let purchase_amt = purchases
            .iter()
            .find(|(month, _)| *month == m)
            .map(|(_, amt)| *amt)
            .unwrap_or(0);
        let expense_amt = expenses
            .iter()
            .find(|(month, _)| *month == m)
            .map(|(_, amt)| *amt)
            .unwrap_or(0);

        let cost = purchase_amt + expense_amt;
        let profit = revenue - cost;

        report.push(MonthlyPL {
            month: format!("{}-{:02}", year, m),
            revenue,
            cost,
            profit,
        });
    }

    Ok(report)
}

#[derive(Debug, serde::Serialize)]
pub struct CostBreakdownItem {
    pub category: String,
    pub amount: i64,
    pub percentage: f64,
}

#[command]
pub async fn get_cost_breakdown_stats(
    state: State<'_, DbPool>,
    year: i32,
) -> Result<Vec<CostBreakdownItem>, String> {
    // 1. Get Top 5 Purchases by Item Name
    let purchase_cat: Vec<(String, i64)> = sqlx::query_as("SELECT item_name, SUM(total_amount)::bigint FROM purchases WHERE EXTRACT(YEAR FROM purchase_date) = $1 GROUP BY item_name ORDER BY 2 DESC LIMIT 5")
        .bind(year)
        .fetch_all(&*state).await.unwrap_or_default();

    // 2. Get Top 5 Expenses by Category
    let expense_cat: Vec<(String, i64)> = sqlx::query_as("SELECT category, SUM(amount)::bigint FROM expenses WHERE EXTRACT(YEAR FROM expense_date) = $1 GROUP BY category ORDER BY 2 DESC LIMIT 5")
        .bind(year)
        .fetch_all(&*state).await.unwrap_or_default();

    // 3. Merge and Calculate Percentage
    let mut all_items = Vec::new();
    let mut total_amount: i64 = 0;

    for (name, amt) in purchase_cat {
        all_items.push((name, amt));
        total_amount += amt;
    }
    for (cat, amt) in expense_cat {
        all_items.push((cat, amt));
        total_amount += amt;
    }

    // Sort by amount desc
    all_items.sort_by(|a, b| b.1.cmp(&a.1));

    let mut result = Vec::new();
    for (name, amt) in all_items {
        if total_amount > 0 {
            result.push(CostBreakdownItem {
                category: name,
                amount: amt,
                percentage: ((amt as f64 / total_amount as f64) * 100.0 * 10.0).round() / 10.0,
            });
        }
    }

    Ok(result)
}

#[derive(Debug, serde::Serialize, sqlx::FromRow)]
pub struct VendorRankItem {
    pub vendor_name: String,
    pub total_amount: i64,
    pub purchase_count: i64,
}

#[command]
pub async fn get_vendor_purchase_ranking(
    state: State<'_, DbPool>,
    year: i32, // Added year param to match frontend call
) -> Result<Vec<VendorRankItem>, String> {
    let sql = r#"
        SELECT v.vendor_name, SUM(p.total_amount)::bigint as total_amount, COUNT(p.purchase_id) as purchase_count
        FROM purchases p 
        JOIN vendors v ON p.vendor_id = v.vendor_id 
        WHERE EXTRACT(YEAR FROM p.purchase_date) = $1
        GROUP BY v.vendor_name 
        ORDER BY total_amount DESC 
        LIMIT 10
    "#;

    let ranking = sqlx::query_as::<_, VendorRankItem>(sql)
        .bind(year)
        .fetch_all(&*state)
        .await
        .unwrap_or_default();

    Ok(ranking)
}

#[command]
pub async fn get_profit_margin_analysis(
    state: State<'_, DbPool>,
    year: i32,
) -> Result<Vec<ProfitAnalysisResult>, String> {
    let sql = r#"
        SELECT 
            s.product_name,
            COUNT(*) as record_count,
            CAST(SUM(s.quantity) AS BIGINT) as total_quantity,
            CAST(SUM(s.total_amount) AS BIGINT) as total_revenue,
            CAST(COALESCE(MAX(p.cost_price), 0) AS BIGINT) as unit_cost,
            CAST(SUM(s.quantity * COALESCE(p.cost_price, 0)) AS BIGINT) as total_cost,
            CAST(SUM(s.total_amount) - SUM(s.quantity * COALESCE(p.cost_price, 0)) AS BIGINT) as net_profit,
            CASE 
                WHEN SUM(s.total_amount) > 0 THEN 
                    (CAST(SUM(s.total_amount) - SUM(s.quantity * COALESCE(p.cost_price, 0)) AS DOUBLE PRECISION) / CAST(SUM(s.total_amount) AS DOUBLE PRECISION)) * 100.0
                ELSE 0.0
            END as margin_rate
        FROM sales s
        LEFT JOIN products p ON s.product_name = p.product_name
        WHERE EXTRACT(YEAR FROM s.order_date) = $1
          AND s.status != '취소'
        GROUP BY s.product_name
        ORDER BY net_profit DESC
    "#;

    let analysis = sqlx::query_as::<_, ProfitAnalysisResult>(sql)
        .bind(year)
        .fetch_all(&*state)
        .await
        .map_err(|e| e.to_string())?;

    Ok(analysis)
}

#[derive(Debug, serde::Serialize, sqlx::FromRow)]
pub struct MembershipSalesStats {
    pub membership_level: Option<String>,
    pub customer_count: i64,
    pub total_amount: i64,
}

#[command]
pub async fn get_membership_sales_analysis(
    state: State<'_, DbPool>,
) -> Result<Vec<MembershipSalesStats>, String> {
    let sql = r#"
        SELECT c.membership_level, COUNT(DISTINCT s.customer_id) as customer_count, SUM(s.total_amount)::bigint as total_amount
        FROM sales s JOIN customers c ON s.customer_id = c.customer_id
        WHERE s.status != '취소' GROUP BY c.membership_level ORDER BY total_amount DESC
    "#;
    let analysis = sqlx::query_as::<_, MembershipSalesStats>(sql)
        .fetch_all(&*state)
        .await
        .unwrap_or_default();
    Ok(analysis)
}

#[command]
pub async fn get_product_sales_stats(
    pool: State<'_, DbPool>,
    year: Option<String>,
) -> Result<Vec<ProductSalesStats>, String> {
    let year_filter = if let Some(ref y) = year {
        if y != "전체조회" {
            format!("AND TO_CHAR(order_date, 'YYYY') = '{}'", y)
        } else {
            "".to_string()
        }
    } else {
        "".to_string()
    };

    let sql = format!(
        r#"
        SELECT p.product_id, p.product_name, COALESCE(s.record_count, 0) as record_count, COALESCE(s.total_quantity, 0) as total_quantity, COALESCE(s.total_amount, 0) as total_amount
        FROM (SELECT * FROM products WHERE item_type = 'product') p
        INNER JOIN (
            SELECT product_name, COUNT(*) as record_count, SUM(quantity) as total_quantity, SUM(total_amount) as total_amount
            FROM sales WHERE status != '취소' {} GROUP BY product_name
        ) s ON p.product_name = s.product_name ORDER BY total_amount DESC
        "#,
        year_filter
    );

    sqlx::query_as::<_, ProductSalesStats>(&sql)
        .fetch_all(&*pool)
        .await
        .map_err(|e| e.to_string())
}

#[derive(Debug, serde::Serialize, sqlx::FromRow)]
pub struct ProductMonthlyStat {
    pub month: i32,
    pub record_count: i64,
    pub total_quantity: i64,
    pub total_amount: i64,
}

#[command]
pub async fn get_product_monthly_analysis(
    state: State<'_, DbPool>,
    product_name: String,
    year: i32,
) -> Result<Vec<ProductMonthlyStat>, String> {
    let sql = r#"
        SELECT EXTRACT(MONTH FROM order_date)::integer as month, COUNT(*) as record_count, COALESCE(SUM(quantity), 0)::bigint as total_quantity, COALESCE(SUM(total_amount), 0)::bigint as total_amount
        FROM sales WHERE product_name = $1 AND EXTRACT(YEAR FROM order_date)::integer = $2 AND status != '취소' GROUP BY month ORDER BY month ASC
    "#;
    sqlx::query_as::<_, ProductMonthlyStat>(sql)
        .bind(product_name)
        .bind(year)
        .fetch_all(&*state)
        .await
        .map_err(|e| e.to_string())
}

#[command]
pub async fn get_product_10yr_sales_stats(
    state: State<'_, DbPool>,
    product_name: String,
) -> Result<Vec<TenYearSalesStats>, String> {
    let sql = r#"
        WITH recursive years AS (
            SELECT CAST(TO_CHAR(CURRENT_DATE, 'YYYY') AS INTEGER) - i AS year
            FROM generate_series(0, 9) i
        )
        SELECT y.year::TEXT as year, COALESCE(COUNT(s.sales_id), 0) as record_count, COALESCE(SUM(s.quantity), 0) as total_quantity, COALESCE(SUM(s.total_amount), 0) as total_amount
        FROM years y LEFT JOIN sales s ON s.product_name = $1 AND EXTRACT(YEAR FROM s.order_date)::integer = y.year AND s.status != '취소' GROUP BY y.year ORDER BY y.year ASC
    "#;
    sqlx::query_as::<_, TenYearSalesStats>(sql)
        .bind(product_name)
        .fetch_all(&*state)
        .await
        .map_err(|e| e.to_string())
}

use crate::db::{
    ChurnRiskCustomer, CustomerLifecycle, DbPool, LtvCustomer, ProductAssociation, RawRfmData,
};
use crate::error::MyceliumError;
use crate::error::MyceliumResult;
use crate::stubs::{check_admin, command, Manager, State};
use crate::DB_MODIFIED;
use axum::{extract::State as AxumState, Json};
use std::fs;
use std::sync::atomic::Ordering;

#[derive(Debug, serde::Serialize, sqlx::FromRow)]
pub struct SpecialCareCustomer {
    pub name: String,
    pub mobile: String,
    pub is_member: bool,
    pub total_orders: i64,
    pub claim_count: i64,
    pub claim_ratio: f64,
    pub major_reason: Option<String>,
    pub last_claim_date: Option<String>,
}

pub async fn get_ltv_analysis(
    state: State<'_, DbPool>,
    limit: i64,
) -> MyceliumResult<Vec<LtvCustomer>> {
    let sql = r#"
        SELECT 
            c.customer_id, c.customer_name, c.membership_level, c.join_date,
            SUM(s.total_amount) as total_spent,
            COUNT(s.sales_id) as total_orders,
            GREATEST(EXTRACT(YEAR FROM age(CURRENT_DATE, c.join_date)) + (EXTRACT(MONTH FROM age(CURRENT_DATE, c.join_date))/12.0), 0.1) as years_active,
            CASE 
                WHEN (EXTRACT(YEAR FROM age(CURRENT_DATE, c.join_date)) + (EXTRACT(MONTH FROM age(CURRENT_DATE, c.join_date))/12.0)) > 0 
                THEN SUM(s.total_amount) / GREATEST((EXTRACT(YEAR FROM age(CURRENT_DATE, c.join_date)) + (EXTRACT(MONTH FROM age(CURRENT_DATE, c.join_date))/12.0)), 0.1)
                ELSE SUM(s.total_amount)
            END as ltv_score
        FROM customers c
        JOIN sales s ON c.customer_id = s.customer_id
        WHERE s.status != '취소'
        GROUP BY c.customer_id, c.customer_name, c.membership_level, c.join_date
        ORDER BY ltv_score DESC
        LIMIT $1
    "#;

    Ok(sqlx::query_as::<_, LtvCustomer>(sql)
        .bind(limit)
        .fetch_all(&*state)
        .await?)
}

pub async fn get_churn_risk_customers(
    state: State<'_, DbPool>,
    days_threshold: i32,
) -> MyceliumResult<Vec<ChurnRiskCustomer>> {
    let sql = r#"
        SELECT 
            c.customer_id, c.customer_name, c.mobile_number,
            MAX(s.order_date) as last_order_date,
            COUNT(s.sales_id) as total_orders,
            SUM(s.total_amount) as total_amount,
            EXTRACT(DAY FROM (CURRENT_DATE - MAX(s.order_date)))::bigint as days_since_last_order,
            CASE 
                WHEN EXTRACT(DAY FROM (CURRENT_DATE - MAX(s.order_date))) > $1 * 2 THEN 100
                WHEN EXTRACT(DAY FROM (CURRENT_DATE - MAX(s.order_date))) > $1 THEN 70
                ELSE 40
            END as risk_score
        FROM customers c
        JOIN sales s ON c.customer_id = s.customer_id
        WHERE s.status != '취소'
        GROUP BY c.customer_id
        HAVING MAX(s.order_date) < CURRENT_DATE - ($1 || ' days')::interval
        ORDER BY risk_score DESC, days_since_last_order DESC
        LIMIT 50
    "#;

    Ok(sqlx::query_as::<_, ChurnRiskCustomer>(sql)
        .bind(days_threshold)
        .fetch_all(&*state)
        .await?)
}

pub async fn get_rfm_analysis(state: State<'_, DbPool>) -> MyceliumResult<Vec<CustomerLifecycle>> {
    let raw_data = sqlx::query_as::<_, RawRfmData>(
        r#"
        SELECT 
            c.customer_id, c.customer_name, c.mobile_number, c.membership_level,
            MAX(s.order_date) as last_order_date,
            COUNT(s.sales_id) as total_orders,
            SUM(s.total_amount) as total_amount
        FROM customers c
        JOIN sales s ON c.customer_id = s.customer_id
        WHERE s.status != '취소'
        GROUP BY c.customer_id
        "#,
    )
    .fetch_all(&*state)
    .await?;

    if raw_data.is_empty() {
        return Ok(vec![]);
    }

    // RFM Scoring Logic (Simple version for MVP)
    let mut results = Vec::new();
    for d in raw_data {
        let recency = match d.last_order_date {
            Some(date) => {
                let diff = (chrono::Local::now().date_naive() - date).num_days();
                if diff < 30 {
                    5
                } else if diff < 90 {
                    4
                } else if diff < 180 {
                    3
                } else if diff < 365 {
                    2
                } else {
                    1
                }
            }
            None => 1,
        };

        let frequency = if d.total_orders > 20 {
            5
        } else if d.total_orders > 10 {
            4
        } else if d.total_orders > 5 {
            3
        } else if d.total_orders > 2 {
            2
        } else {
            1
        };
        let monetary = if d.total_amount > 2000000 {
            5
        } else if d.total_amount > 1000000 {
            4
        } else if d.total_amount > 500000 {
            3
        } else if d.total_amount > 100000 {
            2
        } else {
            1
        };

        let segment = match (recency, frequency) {
            (5, 5) | (5, 4) | (4, 5) => "최우수고객 (Champions)",
            (5, 2) | (4, 2) | (3, 3) => "잠재고객 (Promising)",
            (2, 5) | (2, 4) | (1, 5) | (1, 4) => "이탈위험 (At Risk)",
            (1, 1) | (1, 2) | (2, 1) => "휴면고객 (Hibernating)",
            _ => "일반고객 (Need Attention)",
        };

        results.push(CustomerLifecycle {
            customer_id: d.customer_id,
            customer_name: d.customer_name,
            mobile_number: d.mobile_number,
            membership_level: d.membership_level,
            last_order_date: d.last_order_date,
            total_orders: d.total_orders,
            total_amount: d.total_amount,
            days_since_last_order: d
                .last_order_date
                .map(|date| (chrono::Local::now().date_naive() - date).num_days())
                .unwrap_or(999),
            rfm_segment: segment.to_string(),
            recency,
            frequency,
            monetary,
        });
    }

    Ok(results)
}

pub async fn update_customer_level(
    state: State<'_, DbPool>,
    customer_id: String,
    level: String,
) -> MyceliumResult<()> {
    DB_MODIFIED.store(true, Ordering::Relaxed);
    sqlx::query("UPDATE customers SET membership_level = $1 WHERE customer_id = $2")
        .bind(level)
        .bind(customer_id)
        .execute(&*state)
        .await?;
    Ok(())
}

pub async fn get_claim_customer_count(state: State<'_, DbPool>) -> MyceliumResult<i64> {
    let count: (i64,) = sqlx::query_as("SELECT COUNT(DISTINCT customer_id) FROM sales_claims")
        .fetch_one(&*state)
        .await?;
    Ok(count.0)
}

pub async fn get_claim_targets(state: State<'_, DbPool>) -> MyceliumResult<Vec<serde_json::Value>> {
    let list = sqlx::query_as::<_, (String, String, i64, i32)>(
        r#"
        SELECT c.customer_name, c.mobile_number, COUNT(sc.claim_id) as claim_count, SUM(sc.refund_amount)::integer as total_refund
        FROM sales_claims sc JOIN customers c ON sc.customer_id = c.customer_id
        GROUP BY c.customer_name, c.mobile_number ORDER BY claim_count DESC LIMIT 10
    "#,
    )
    .fetch_all(&*state)
    .await?;

    Ok(list
        .into_iter()
        .map(|(n, m, c, r)| serde_json::json!({"name": n, "mobile": m, "count": c, "refund": r}))
        .collect())
}

pub async fn get_special_care_customers(
    state: State<'_, DbPool>,
) -> MyceliumResult<Vec<serde_json::Value>> {
    let list = sqlx::query_as::<_, (String, String, i32)>(
        r#"
        SELECT c.customer_name, c.mobile_number, c.current_balance
        FROM customers c WHERE c.current_balance < 0 ORDER BY c.current_balance ASC LIMIT 10
    "#,
    )
    .fetch_all(&*state)
    .await?;

    Ok(list
        .into_iter()
        .map(|(n, m, b)| serde_json::json!({"name": n, "mobile": m, "balance": b}))
        .collect())
}

pub async fn get_special_care_customers_axum(
    AxumState(state): AxumState<crate::state::AppState>,
) -> MyceliumResult<Json<Vec<SpecialCareCustomer>>> {
    let sql = r#"
        WITH CustomerStats AS (
            SELECT 
                c.customer_id,
                c.customer_name,
                c.mobile_number,
                true as is_member,
                (SELECT COUNT(*) FROM sales s WHERE s.customer_id = c.customer_id) as total_orders
            FROM customers c
        ),
        ClaimStats AS (
            SELECT 
                sc.customer_id,
                COUNT(sc.claim_id) as claim_count,
                MAX(sc.created_at::text) as last_claim_date,
                (
                    SELECT reason_category 
                    FROM sales_claims sc2 
                    WHERE sc2.customer_id = sc.customer_id
                    GROUP BY reason_category 
                    ORDER BY COUNT(*) DESC 
                    LIMIT 1
                ) as major_reason
            FROM sales_claims sc
            WHERE sc.customer_id IS NOT NULL
            GROUP BY sc.customer_id
        )
        SELECT 
            cs.customer_name as name,
            cs.mobile_number as mobile,
            cs.is_member,
            cs.total_orders,
            COALESCE(cls.claim_count, 0) as claim_count,
            CASE 
                WHEN cs.total_orders > 0 THEN (COALESCE(cls.claim_count, 0)::float / cs.total_orders::float) * 100.0
                ELSE 0.0
            END as claim_ratio,
            cls.major_reason,
            cls.last_claim_date
        FROM CustomerStats cs
        JOIN ClaimStats cls ON cs.customer_id = cls.customer_id
        WHERE COALESCE(cls.claim_count, 0) > 0
        ORDER BY claim_ratio DESC
        LIMIT 100
    "#;

    let customers = sqlx::query_as::<_, SpecialCareCustomer>(sql)
        .fetch_all(&state.pool)
        .await?;

    Ok(Json(customers))
}

pub async fn send_sms_simulation(
    app: crate::stubs::AppHandle,
    mode: String,
    recipients: Vec<String>,
    content: String,
    _template_code: Option<String>,
) -> MyceliumResult<serde_json::Value> {
    // 1. Check Config for real sending
    let config_dir = app
        .path()
        .app_config_dir()
        .map_err(|e| MyceliumError::Internal(e.to_string()))?;
    let config_path = config_dir.join("config.json");

    let api_key = if config_path.exists() {
        let cfg_content = fs::read_to_string(&config_path).unwrap_or_default();
        let json: serde_json::Value =
            serde_json::from_str::<serde_json::Value>(&cfg_content).unwrap_or_default();
        json.get("sms_api_key")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string()
    } else {
        String::new()
    };

    if !api_key.is_empty() {
        // Real Sending Logic (Aligo Example)
        let sender = if config_path.exists() {
            let cfg_content = fs::read_to_string(&config_path).unwrap_or_default();
            let json: serde_json::Value = serde_json::from_str(&cfg_content).unwrap_or_default();
            json.get("sms_sender_number")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string()
        } else {
            String::new()
        };

        let client = reqwest::Client::new();
        let receiver_str = recipients.join(",");

        let params = [
            ("key", api_key.as_str()),
            ("user_id", "mycelium_admin"), // Default or from config
            ("sender", sender.as_str()),
            ("receiver", receiver_str.as_str()),
            ("msg", content.as_str()),
            ("msg_type", if content.len() > 80 { "LMS" } else { "SMS" }),
        ];

        let res = client
            .post("https://sslsms.aligo.in/send/")
            .form(&params)
            .send()
            .await;

        match res {
            Ok(resp) => {
                let status = resp.status();
                let text = resp.text().await.unwrap_or_default();
                if status.is_success() {
                    return Ok(serde_json::json!({
                        "success": true,
                        "raw_response": text,
                        "count": recipients.len(),
                        "message": format!("Real {} sent to {} recipients via Aligo", mode, recipients.len())
                    }));
                } else {
                    return Err(MyceliumError::Internal(format!("SMS API Error: {}", text)));
                }
            }
            Err(e) => return Err(MyceliumError::Internal(format!("Network Error: {}", e))),
        }
    }

    // Fallback to Simulation if no API key
    let count = recipients.len() * 10;
    Ok(serde_json::json!({
        "success": true,
        "count": count,
        "mode": "SIMULATION",
        "message_id": format!("SMS-{}-{}", mode, uuid::Uuid::new_v4().to_string()[..8].to_uppercase()),
        "message": format!("Simulated sending {} to {:?} (Content: {}...)", mode, recipients, &content.chars().take(10).collect::<String>())
    }))
}

pub async fn get_repurchase_candidates(
    state: State<'_, DbPool>,
) -> MyceliumResult<Vec<crate::db::RepurchaseCandidate>> {
    let sql = r#"
        WITH stats AS (
            SELECT customer_id, product_id, product_name, specification, COUNT(*) as p_count, MAX(order_date) as last_date,
                   CAST(AVG(next_order_date - order_date) AS INTEGER) as avg_interval
            FROM (
                SELECT customer_id, product_id, product_name, specification, order_date,
                       LEAD(order_date) OVER(PARTITION BY customer_id, product_id, product_name, specification ORDER BY order_date) as next_order_date
                FROM sales WHERE status != '취소'
            ) t WHERE next_order_date IS NOT NULL GROUP BY customer_id, product_id, product_name, specification
        )
        SELECT s.customer_id, c.customer_name, c.mobile_number, s.last_date as last_order_date,
               s.avg_interval as avg_interval_days,
               (s.avg_interval - (CURRENT_DATE - s.last_date))::integer as predicted_days_remaining,
               s.product_name || COALESCE(' (' || s.specification || ')', '') as last_product, s.p_count as purchase_count
        FROM stats s JOIN customers c ON s.customer_id = c.customer_id
        WHERE s.avg_interval > 0 AND (s.avg_interval - (CURRENT_DATE - s.last_date)) BETWEEN -5 AND 10
        ORDER BY predicted_days_remaining ASC
    "#;

    Ok(sqlx::query_as::<_, crate::db::RepurchaseCandidate>(sql)
        .fetch_all(&*state)
        .await?)
}

pub async fn get_product_associations(
    state: State<'_, DbPool>,
) -> MyceliumResult<Vec<ProductAssociation>> {
    let total_bundles: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM (SELECT DISTINCT customer_id, order_date FROM sales WHERE customer_id IS NOT NULL AND order_date >= (CURRENT_DATE - INTERVAL '12 months') AND status != '취소') as t",
    )
    .fetch_one(&*state)
    .await?;

    if total_bundles == 0 {
        return Ok(vec![]);
    }

    let sql = r#"
        WITH SalesBundles AS (
            SELECT customer_id, order_date, product_name FROM sales WHERE customer_id IS NOT NULL AND order_date >= (CURRENT_DATE - INTERVAL '12 months') AND status != '취소' GROUP BY customer_id, order_date, product_name
        )
        SELECT a.product_name as product_a, b.product_name as product_b, COUNT(*) as pair_count, (CAST(COUNT(*) AS FLOAT8) / $1 * 100.0) as support_percent
        FROM SalesBundles a JOIN SalesBundles b ON a.customer_id = b.customer_id AND a.order_date = b.order_date
        WHERE a.product_name < b.product_name GROUP BY a.product_name, b.product_name HAVING COUNT(*) >= 2 ORDER BY pair_count DESC, support_percent DESC LIMIT 50
    "#;

    Ok(sqlx::query_as::<_, ProductAssociation>(sql)
        .bind(total_bundles)
        .fetch_all(&*state)
        .await?)
}

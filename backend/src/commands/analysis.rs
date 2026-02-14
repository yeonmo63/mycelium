#![allow(non_snake_case)]
use crate::db::DbPool;
use crate::error::{MyceliumError, MyceliumResult};
use chrono::NaiveDate;
use polars::prelude::*;
use tauri::{command, State};

#[command]
pub async fn sales_polars_analysis_v4(
    state: State<'_, DbPool>,
    year: i32,
) -> MyceliumResult<serde_json::Value> {
    // 1. Fetch Data
    // customer_id included
    let rows: Vec<(Option<NaiveDate>, String, i32, i32, Option<String>)> = sqlx::query_as(
        "SELECT order_date, product_name, quantity, total_amount, customer_id FROM sales WHERE EXTRACT(YEAR FROM order_date)::integer = $1 AND status != '취소'",
    )
    .bind(year)
    .fetch_all(&*state)
    .await?;

    if rows.is_empty() {
        return Ok(serde_json::json!({
            "monthly": [],
            "products": [],
            "weekly": [],
            "customer_stats": {
                "distribution": [],
                "repurchase_rate": 0.0,
                "total_customers": 0,
                "repeat_customers": 0
            },
            "summary": { "count": 0, "total": 0 }
        }));
    }

    // 2. Prepare Data
    let mut dates = Vec::with_capacity(rows.len());
    let mut names = Vec::with_capacity(rows.len());
    let mut qtys = Vec::with_capacity(rows.len());
    let mut totals = Vec::with_capacity(rows.len());
    let mut customer_ids = Vec::with_capacity(rows.len());

    for (d, n, q, t, c) in rows {
        dates.push(d);
        names.push(n);
        qtys.push(q);
        totals.push(t);
        customer_ids.push(c);
    }

    let df = df!(
        "order_date" => dates,
        "product_name" => names,
        "quantity" => qtys,
        "total_amount" => totals,
        "customer_id" => customer_ids,
    )?
    .lazy()
    .with_column(col("total_amount").cast(DataType::Int64))
    .collect()?;

    // 3. Analytics
    let total_sum: i64 = df.column("total_amount")?.sum::<i64>()?;

    let monthly_df = df
        .clone()
        .lazy()
        .with_column(col("order_date").dt().month().alias("month"))
        .group_by([col("month")])
        .agg([
            len().alias("record_count"),
            col("quantity").sum().alias("total_quantity"),
            col("total_amount").sum().alias("total_amount"),
        ])
        .sort(["month"], SortMultipleOptions::default())
        .collect()?;

    let product_df = df
        .clone()
        .lazy()
        .group_by([col("product_name")])
        .agg([
            len().alias("record_count"),
            col("quantity").sum().alias("total_quantity"),
            col("total_amount").sum().alias("total_amount"),
        ])
        .sort(
            ["total_amount"],
            SortMultipleOptions {
                descending: vec![true],
                ..Default::default()
            },
        )
        .limit(10)
        .collect()?;

    let weekly_df = df
        .clone()
        .lazy()
        .with_column(col("order_date").dt().weekday().alias("weekday"))
        .group_by([col("weekday")])
        .agg([
            len().alias("record_count"),
            col("quantity").sum().alias("total_quantity"),
            col("total_amount").sum().alias("total_amount"),
        ])
        .sort(["weekday"], SortMultipleOptions::default())
        .collect()?;

    // 4. Transform to JSON
    let mut monthly_list = Vec::new();
    let m_months = monthly_df.column("month")?.i8()?;
    let m_counts = monthly_df.column("record_count")?.u32()?;
    let m_qtys = monthly_df.column("total_quantity")?.i32()?;
    let m_totals = monthly_df.column("total_amount")?.i64()?;

    for i in 0..monthly_df.height() {
        monthly_list.push(serde_json::json!({
            "month": m_months.get(i),
            "record_count": m_counts.get(i),
            "total_quantity": m_qtys.get(i),
            "total_amount": m_totals.get(i),
        }));
    }

    let p_names = product_df.column("product_name")?.str()?;
    let p_counts = product_df.column("record_count")?.u32()?;
    let p_qtys = product_df.column("total_quantity")?.i32()?;
    let p_totals = product_df.column("total_amount")?.i64()?;

    let mut product_list = Vec::new();
    for i in 0..product_df.height() {
        product_list.push(serde_json::json!({
            "product_name": p_names.get(i),
            "record_count": p_counts.get(i),
            "total_quantity": p_qtys.get(i),
            "total_amount": p_totals.get(i),
        }));
    }

    let w_days = weekly_df.column("weekday")?.i8()?;
    let w_counts = weekly_df.column("record_count")?.u32()?;
    let w_qtys = weekly_df.column("total_quantity")?.i32()?;
    let w_totals = weekly_df.column("total_amount")?.i64()?;

    let mut weekly_list = Vec::new();
    for i in 0..weekly_df.height() {
        weekly_list.push(serde_json::json!({
            "weekday": w_days.get(i),
            "record_count": w_counts.get(i),
            "total_quantity": w_qtys.get(i),
            "total_amount": w_totals.get(i),
        }));
    }

    Ok(serde_json::json!({
        "monthly": monthly_list,
        "products": product_list,
        "weekly": weekly_list,
        "summary": {
            "count": df.height(),
            "total": total_sum
        }
    }))
}

#[command]
pub async fn get_all_time_customer_analysis(
    state: State<'_, DbPool>,
    year: i32,
) -> MyceliumResult<serde_json::Value> {
    // 1. Fetch Sales Data with Customer ID for Specific Year
    let rows: Vec<(Option<NaiveDate>, Option<String>)> = sqlx::query_as(
        "SELECT order_date, customer_id FROM sales 
         WHERE customer_id IS NOT NULL AND EXTRACT(YEAR FROM order_date)::integer = $1 AND status IN ('배송완료', '완료')",
    )
    .bind(year)
    .fetch_all(&*state)
    .await?;

    if rows.is_empty() {
        return Ok(serde_json::json!({
            "distribution": [],
            "repurchase_rate": 0.0,
            "total_customers": 0,
            "repeat_customers": 0,
            "cycle_stats": {
                "within_1m": 0, "within_3m": 0, "within_6m": 0, "within_1y": 0, "over_1y": 0, "one_time": 0
            }
        }));
    }

    // 2. Prepare Data for Polars
    let mut dates = Vec::with_capacity(rows.len());
    let mut customer_ids = Vec::with_capacity(rows.len());

    for (d, c) in rows {
        dates.push(d);
        customer_ids.push(c);
    }

    let df = df!(
        "order_date" => dates,
        "customer_id" => customer_ids,
    )?
    .lazy()
    .collect()?;

    // 3. Analytics
    // Frequency: Count unique purchasing days per customer
    let customer_stats_val = df
        .clone()
        .lazy()
        .unique(None, UniqueKeepStrategy::Any) // Deduplicate same-day purchases by same customer
        .group_by([col("customer_id")])
        .agg([
            len().alias("frequency"),
            col("order_date")
                .sort(SortOptions::default())
                .alias("dates"),
        ])
        .collect()?;

    // Frequency Distribution Data
    let distribution_df = customer_stats_val
        .clone()
        .lazy()
        .group_by([col("frequency")])
        .agg([len().alias("customer_count")])
        .sort(["frequency"], SortMultipleOptions::default())
        .collect()?;

    // Cycle Analysis
    let s_dates = customer_stats_val.column("dates")?.list()?;

    // Cycle Counts
    let mut cycle_counts = [0; 6]; // 1~30, 31~90, 91~180, 181~365, 365+, OneTime

    for i in 0..s_dates.len() {
        let series_opt = s_dates.get_as_series(i);
        let series = match series_opt {
            Some(s) => s,
            None => {
                cycle_counts[5] += 1;
                continue;
            }
        };

        if series.len() < 2 {
            cycle_counts[5] += 1;
            continue;
        }

        let date_series = series.cast(&DataType::Int32)?;
        let date_ca = date_series.i32()?;

        let mut sum_diff = 0;
        let mut count_diff = 0;

        let date_vec: Vec<Option<i32>> = date_ca.into_iter().collect();

        for k in 0..date_vec.len() - 1 {
            if let (Some(d1), Some(d2)) = (date_vec[k], date_vec[k + 1]) {
                let diff = d2 - d1;
                if diff > 0 {
                    sum_diff += diff;
                    count_diff += 1;
                }
            }
        }

        if count_diff > 0 {
            let avg_days = sum_diff as f64 / count_diff as f64;

            if avg_days <= 30.0 {
                cycle_counts[0] += 1;
            } else if avg_days <= 90.0 {
                cycle_counts[1] += 1;
            } else if avg_days <= 180.0 {
                cycle_counts[2] += 1;
            } else if avg_days <= 365.0 {
                cycle_counts[3] += 1;
            } else {
                cycle_counts[4] += 1;
            }
        } else {
            cycle_counts[5] += 1;
        }
    }

    // Calculate rates
    let total_unique_customers = customer_stats_val.height();
    let one_time = cycle_counts[5];
    let repeat_customers = total_unique_customers as i64 - one_time;

    let repurchase_rate = if total_unique_customers > 0 {
        (repeat_customers as f64 / total_unique_customers as f64) * 100.0
    } else {
        0.0
    };

    // 4. Transform to JSON
    let c_freq = distribution_df.column("frequency")?.u32()?;
    let c_counts = distribution_df.column("customer_count")?.u32()?;

    let mut customer_dist_list = Vec::new();
    for i in 0..distribution_df.height() {
        customer_dist_list.push(serde_json::json!({
            "frequency": c_freq.get(i),
            "count": c_counts.get(i)
        }));
    }

    Ok(serde_json::json!({
        "distribution": customer_dist_list,
        "repurchase_rate": repurchase_rate,
        "total_customers": total_unique_customers,
        "repeat_customers": repeat_customers,
        "cycle_stats": {
            "within_1m": cycle_counts[0],
            "within_3m": cycle_counts[1],
            "within_6m": cycle_counts[2],
            "within_1y": cycle_counts[3],
            "over_1y": cycle_counts[4],
            "one_time": cycle_counts[5]
        }
    }))
}

#[command]
pub async fn get_sales_by_region_analysis(
    state: State<'_, DbPool>,
    year: i32,
) -> MyceliumResult<serde_json::Value> {
    // 1. Fetch Data (Filtered by product type)
    let rows: Vec<(Option<String>, i32, i32)> = sqlx::query_as(
        "SELECT c.address_primary, s.quantity, s.total_amount 
         FROM sales s 
         JOIN customers c ON s.customer_id = c.customer_id
         JOIN products p ON s.product_id = p.product_id
         WHERE EXTRACT(YEAR FROM s.order_date)::integer = $1 
           AND s.status != '취소'
           AND p.item_type = 'product'",
    )
    .bind(year)
    .fetch_all(&*state)
    .await?;

    if rows.is_empty() {
        return Ok(serde_json::json!([]));
    }

    // 2. Prepare Data
    let mut regions = Vec::with_capacity(rows.len());
    let mut qtys = Vec::with_capacity(rows.len());
    let mut totals = Vec::with_capacity(rows.len());

    for (addr, q, t) in rows {
        let region = match addr {
            Some(a) => {
                let first_token = a.split_whitespace().next().unwrap_or("미분류").to_string();
                if first_token.starts_with("서울") {
                    "서울특별시".to_string()
                } else if first_token.starts_with("경기") {
                    "경기도".to_string()
                } else if first_token.starts_with("강원") {
                    "강원특별자치도".to_string()
                } else if first_token.starts_with("인천") {
                    "인천광역시".to_string()
                } else if first_token.starts_with("부산") {
                    "부산광역시".to_string()
                } else if first_token.starts_with("대구") {
                    "대구광역시".to_string()
                } else if first_token.starts_with("광주") {
                    "광주광역시".to_string()
                } else if first_token.starts_with("대전") {
                    "대전광역시".to_string()
                } else if first_token.starts_with("울산") {
                    "울산광역시".to_string()
                } else if first_token.starts_with("제주") {
                    "제주특별자치도".to_string()
                } else if first_token.starts_with("세종") {
                    "세종특별자치시".to_string()
                } else if first_token.starts_with("충") && first_token.contains("북") {
                    "충청북도".to_string()
                } else if first_token.starts_with("충") && first_token.contains("남") {
                    "충청남도".to_string()
                } else if first_token.starts_with("전") && first_token.contains("북") {
                    "전북특별자치도".to_string()
                } else if first_token.starts_with("전") && first_token.contains("남") {
                    "전라남도".to_string()
                } else if first_token.starts_with("경") && first_token.contains("북") {
                    "경상북도".to_string()
                } else if first_token.starts_with("경") && first_token.contains("남") {
                    "경상남도".to_string()
                } else {
                    "기타".to_string()
                }
            }
            None => "미분류".to_string(),
        };
        regions.push(region);
        qtys.push(q);
        totals.push(t);
    }

    // 3. Polars Aggregation
    let df = df!(
        "region" => regions,
        "quantity" => qtys,
        "total_amount" => totals,
    )?
    .lazy()
    .with_column(col("total_amount").cast(DataType::Int64))
    .with_column(col("quantity").cast(DataType::Int64))
    .group_by([col("region")])
    .agg([
        len().alias("order_count"),
        col("quantity").sum().alias("total_quantity"),
        col("total_amount").sum().alias("total_amount"),
    ])
    .sort(
        ["total_amount"],
        SortMultipleOptions {
            descending: vec![true],
            ..Default::default()
        },
    )
    .collect()?;

    // 4. Output
    let r_vals = df.column("region")?.str()?;
    let q_vals = df.column("total_quantity")?.i64()?;
    let t_vals = df.column("total_amount")?.i64()?;

    let mut result_list = Vec::new();
    for i in 0..df.height() {
        result_list.push(serde_json::json!({
            "region": r_vals.get(i),
            "total_quantity": q_vals.get(i),
            "total_amount": t_vals.get(i)
        }));
    }

    Ok(serde_json::json!(result_list))
}

#[command]
pub async fn get_order_value_distribution(
    state: State<'_, DbPool>,
    year: i32,
) -> MyceliumResult<serde_json::Value> {
    // 1. Fetch raw daily aggregate per customer for specific year
    let rows: Vec<(i64,)> = sqlx::query_as(
        "SELECT CAST(SUM(total_amount) AS BIGINT) as daily_total 
         FROM sales 
         WHERE EXTRACT(YEAR FROM order_date)::integer = $1 AND status IN ('배송완료', '완료')
         GROUP BY customer_id, order_date",
    )
    .bind(year)
    .fetch_all(&*state)
    .await?;

    if rows.is_empty() {
        return Ok(serde_json::json!([]));
    }

    // 2. Bucketing Logic
    let mut distribution = vec![
        ("1만원 미만", 0),
        ("1~3만원", 0),
        ("3~5만원", 0),
        ("5~10만원", 0),
        ("10~20만원", 0),
        ("20~30만원", 0),
        ("30~50만원", 0),
        ("50만원 이상", 0),
    ];

    for (amt,) in rows {
        let idx = if amt < 10000 {
            0
        } else if amt < 30000 {
            1
        } else if amt < 50000 {
            2
        } else if amt < 100000 {
            3
        } else if amt < 200000 {
            4
        } else if amt < 300000 {
            5
        } else if amt < 500000 {
            6
        } else {
            7
        };
        distribution[idx].1 += 1;
    }

    // Convert to JSON
    let result: Vec<serde_json::Value> = distribution
        .into_iter()
        .map(|(range, count)| {
            serde_json::json!({
                "range": range,
                "count": count
            })
        })
        .collect();

    Ok(serde_json::json!(result))
}

#[command]
pub async fn get_sales_period_analysis(
    state: State<'_, DbPool>,
    start_date: String,
    end_date: String,
) -> MyceliumResult<serde_json::Value> {
    // 1. Extract Month-Day from input dates
    let start = NaiveDate::parse_from_str(&start_date, "%Y-%m-%d")
        .map_err(|e| MyceliumError::Validation(e.to_string()))?;
    let end = NaiveDate::parse_from_str(&end_date, "%Y-%m-%d")
        .map_err(|e| MyceliumError::Validation(e.to_string()))?;

    let start_md = start.format("%m-%d").to_string();
    let end_md = end.format("%m-%d").to_string();
    let base_year = start.format("%Y").to_string();

    // 2. Fetch Data for the last 10 years for the same MM-DD range
    // Handling year-wrap (though rare for holidays like Chuseok/Seollal)
    let query = if start_md <= end_md {
        format!(
            "SELECT EXTRACT(YEAR FROM order_date)::int as year, 
                    SUM(quantity)::int as qty, 
                    SUM(total_amount)::bigint as amount, 
                    COUNT(*)::int as count 
             FROM sales 
             WHERE TO_CHAR(order_date, 'MM-DD') BETWEEN '{}' AND '{}' AND status != '취소'
             GROUP BY year 
             ORDER BY year DESC 
             LIMIT 15",
            start_md, end_md
        )
    } else {
        format!(
            "SELECT EXTRACT(YEAR FROM order_date)::int as year, 
                    SUM(quantity)::int as qty, 
                    SUM(total_amount)::bigint as amount, 
                    COUNT(*)::int as count 
             FROM sales 
             WHERE (TO_CHAR(order_date, 'MM-DD') >= '{}' OR TO_CHAR(order_date, 'MM-DD') <= '{}') AND status != '취소'
             GROUP BY year 
             ORDER BY year DESC 
             LIMIT 15",
            start_md, end_md
        )
    };

    let rows: Vec<(i32, i32, i64, i32)> = sqlx::query_as(&query).fetch_all(&*state).await?;

    if rows.is_empty() {
        return Ok(serde_json::json!([]));
    }

    // 3. Transform to JSON
    let mut result = Vec::new();
    for (year, qty, amount, count) in rows {
        result.push(serde_json::json!({
            "year": format!("{}년", year),
            "count": count,
            "quantity": qty,
            "amount": amount,
            "is_base": year.to_string() == base_year
        }));
    }

    Ok(serde_json::json!(result))
}

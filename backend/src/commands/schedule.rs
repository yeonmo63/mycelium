#![allow(non_snake_case)]
use crate::db::{DbPool, Schedule};
use crate::error::MyceliumResult;
use crate::DB_MODIFIED;
use chrono::NaiveDate;
use std::sync::atomic::Ordering;
use tauri::{command, State};

#[command]
pub async fn get_schedules(
    state: State<'_, DbPool>,
    start_date: String,
    end_date: String,
) -> MyceliumResult<Vec<Schedule>> {
    Ok(sqlx::query_as::<_, Schedule>(
        "SELECT * FROM schedules 
         WHERE start_time <= $2::timestamp AND end_time >= $1::timestamp
         ORDER BY start_time ASC",
    )
    .bind(start_date)
    .bind(end_date)
    .fetch_all(&*state)
    .await?)
}

#[command]
pub async fn create_schedule(
    state: State<'_, DbPool>,
    title: String,
    description: Option<String>,
    start_time: String,
    end_time: String,
    status: Option<String>,
) -> MyceliumResult<i32> {
    DB_MODIFIED.store(true, Ordering::Relaxed);
    let id: i32 = sqlx::query_scalar(
        "INSERT INTO schedules (title, description, start_time, end_time, status) 
         VALUES ($1, $2, $3::timestamp, $4::timestamp, $5) 
         RETURNING schedule_id",
    )
    .bind(title)
    .bind(description)
    .bind(start_time)
    .bind(end_time)
    .bind(status)
    .fetch_one(&*state)
    .await?;
    Ok(id)
}

#[command]
pub async fn update_schedule(
    state: State<'_, DbPool>,
    schedule_id: i32,
    title: String,
    description: Option<String>,
    start_time: String,
    end_time: String,
    status: Option<String>,
) -> MyceliumResult<()> {
    DB_MODIFIED.store(true, Ordering::Relaxed);
    sqlx::query(
        "UPDATE schedules SET 
         title = $1, description = $2, start_time = $3::timestamp, 
         end_time = $4::timestamp, status = $5
         WHERE schedule_id = $6",
    )
    .bind(title)
    .bind(description)
    .bind(start_time)
    .bind(end_time)
    .bind(status)
    .bind(schedule_id)
    .execute(&*state)
    .await?;
    Ok(())
}

#[command]
pub async fn delete_schedule(state: State<'_, DbPool>, schedule_id: i32) -> MyceliumResult<()> {
    DB_MODIFIED.store(true, Ordering::Relaxed);
    sqlx::query("DELETE FROM schedules WHERE schedule_id = $1")
        .bind(schedule_id)
        .execute(&*state)
        .await?;
    Ok(())
}

#[command]
pub async fn get_upcoming_anniversaries(
    state: State<'_, DbPool>,
    days: i32,
) -> MyceliumResult<Vec<serde_json::Value>> {
    let sql = r#"
        SELECT customer_name, anniversary_date, anniversary_type, mobile_number
        FROM customers
        WHERE anniversary_date IS NOT NULL
        AND (
            TO_CHAR(anniversary_date, 'MM-DD') BETWEEN TO_CHAR(CURRENT_DATE, 'MM-DD') AND TO_CHAR(CURRENT_DATE + ($1 || ' days')::interval, 'MM-DD')
            OR
            (TO_CHAR(CURRENT_DATE + ($1 || ' days')::interval, 'MM-DD') < TO_CHAR(CURRENT_DATE, 'MM-DD') 
             AND (TO_CHAR(anniversary_date, 'MM-DD') >= TO_CHAR(CURRENT_DATE, 'MM-DD') OR TO_CHAR(anniversary_date, 'MM-DD') <= TO_CHAR(CURRENT_DATE + ($1 || ' days')::interval, 'MM-DD')))
        )
        ORDER BY TO_CHAR(anniversary_date, 'MM-DD') ASC
    "#;

    let rows: Vec<(String, NaiveDate, Option<String>, String)> =
        sqlx::query_as(sql).bind(days).fetch_all(&*state).await?;

    Ok(rows
        .into_iter()
        .map(|(n, d, t, m)| {
            serde_json::json!({
                "name": n,
                "date": d.to_string(),
                "type": t.unwrap_or_else(|| "기타".to_string()),
                "mobile": m
            })
        })
        .collect())
}

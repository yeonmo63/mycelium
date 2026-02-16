#![allow(non_snake_case)]
use crate::db::{DbPool, Schedule};
use crate::error::MyceliumResult;
use crate::state::AppState;
use crate::stubs::{check_admin, command, State};
use crate::DB_MODIFIED;
use axum::{extract::Query, extract::State as AxumState, Json};
use chrono::NaiveDate;
use std::sync::atomic::Ordering;

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

pub async fn delete_schedule(state: State<'_, DbPool>, schedule_id: i32) -> MyceliumResult<()> {
    DB_MODIFIED.store(true, Ordering::Relaxed);
    sqlx::query("DELETE FROM schedules WHERE schedule_id = $1")
        .bind(schedule_id)
        .execute(&*state)
        .await?;
    Ok(())
}

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

// ============================================
// Axum Handlers
// ============================================

#[derive(serde::Deserialize)]
pub struct ScheduleQuery {
    #[serde(alias = "startDate")]
    pub start_date: Option<String>,
    #[serde(alias = "endDate")]
    pub end_date: Option<String>,
}

#[derive(serde::Deserialize)]
pub struct CreateSchedulePayload {
    pub title: String,
    pub description: Option<String>,
    #[serde(alias = "startTime")]
    pub start_time: String,
    #[serde(alias = "endTime")]
    pub end_time: String,
    pub status: Option<String>,
}

#[derive(serde::Deserialize)]
pub struct UpdateSchedulePayload {
    pub schedule_id: i32,
    pub title: String,
    pub description: Option<String>,
    #[serde(alias = "startTime")]
    pub start_time: String,
    #[serde(alias = "endTime")]
    pub end_time: String,
    pub status: Option<String>,
}

#[derive(serde::Deserialize)]
pub struct DeleteSchedulePayload {
    pub schedule_id: i32,
}

pub async fn get_schedules_axum(
    AxumState(state): AxumState<AppState>,
    Query(params): Query<ScheduleQuery>,
) -> MyceliumResult<Json<Vec<Schedule>>> {
    let start = params.start_date.unwrap_or_default();
    let end = params.end_date.unwrap_or_default();

    let res = sqlx::query_as::<_, Schedule>(
        "SELECT * FROM schedules 
         WHERE start_time <= $2::timestamp AND end_time >= $1::timestamp
         ORDER BY start_time ASC",
    )
    .bind(&start)
    .bind(&end)
    .fetch_all(&state.pool)
    .await?;

    Ok(Json(res))
}

pub async fn create_schedule_axum(
    AxumState(state): AxumState<AppState>,
    Json(payload): Json<CreateSchedulePayload>,
) -> MyceliumResult<Json<i32>> {
    DB_MODIFIED.store(true, Ordering::Relaxed);
    let id: i32 = sqlx::query_scalar(
        "INSERT INTO schedules (title, description, start_time, end_time, status) 
         VALUES ($1, $2, $3::timestamp, $4::timestamp, $5) 
         RETURNING schedule_id",
    )
    .bind(&payload.title)
    .bind(&payload.description)
    .bind(&payload.start_time)
    .bind(&payload.end_time)
    .bind(&payload.status)
    .fetch_one(&state.pool)
    .await?;

    Ok(Json(id))
}

pub async fn update_schedule_axum(
    AxumState(state): AxumState<AppState>,
    Json(payload): Json<UpdateSchedulePayload>,
) -> MyceliumResult<Json<bool>> {
    DB_MODIFIED.store(true, Ordering::Relaxed);
    sqlx::query(
        "UPDATE schedules SET 
         title = $1, description = $2, start_time = $3::timestamp, 
         end_time = $4::timestamp, status = $5
         WHERE schedule_id = $6",
    )
    .bind(&payload.title)
    .bind(&payload.description)
    .bind(&payload.start_time)
    .bind(&payload.end_time)
    .bind(&payload.status)
    .bind(payload.schedule_id)
    .execute(&state.pool)
    .await?;

    Ok(Json(true))
}

pub async fn delete_schedule_axum(
    AxumState(state): AxumState<AppState>,
    Json(payload): Json<DeleteSchedulePayload>,
) -> MyceliumResult<Json<bool>> {
    DB_MODIFIED.store(true, Ordering::Relaxed);
    sqlx::query("DELETE FROM schedules WHERE schedule_id = $1")
        .bind(payload.schedule_id)
        .execute(&state.pool)
        .await?;

    Ok(Json(true))
}

#[derive(serde::Deserialize)]
pub struct UpcomingAnniversaryQuery {
    pub days: Option<i32>,
}

pub async fn get_upcoming_anniversaries_axum(
    AxumState(state): AxumState<AppState>,
    Query(params): Query<UpcomingAnniversaryQuery>,
) -> MyceliumResult<Json<Vec<serde_json::Value>>> {
    let days = params.days.unwrap_or(7);
    let res = get_upcoming_anniversaries(crate::stubs::State::from(&state.pool), days).await?;
    Ok(Json(res))
}

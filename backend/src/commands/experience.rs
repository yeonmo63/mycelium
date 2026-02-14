#![allow(non_snake_case)]
use crate::db::{DbPool, ExperienceProgram, ExperienceReservation};
use crate::error::{MyceliumError, MyceliumResult};
use crate::DB_MODIFIED;
use chrono::{NaiveDate, NaiveDateTime, NaiveTime};
use sqlx::FromRow;
use std::sync::atomic::Ordering;
use tauri::{command, State};

#[derive(Debug, serde::Serialize, FromRow)]
pub struct ExpMonthlyTrend {
    pub month: String,
    pub count: i64,
    pub revenue: i64,
}

#[derive(Debug, serde::Serialize, FromRow)]
pub struct ExpProgramPopularity {
    pub program_name: String,
    pub count: i64,
}

#[derive(Debug, serde::Serialize)]
pub struct ExperienceDashboardStats {
    pub monthly_trend: Vec<ExpMonthlyTrend>,
    pub program_popularity: Vec<ExpProgramPopularity>,
}

#[command(rename_all = "snake_case")]
pub async fn get_experience_programs(
    state: State<'_, DbPool>,
) -> MyceliumResult<Vec<ExperienceProgram>> {
    Ok(sqlx::query_as::<_, ExperienceProgram>(
        "SELECT * FROM experience_programs ORDER BY program_name",
    )
    .fetch_all(&*state)
    .await?)
}

#[command(rename_all = "snake_case")]
pub async fn create_experience_program(
    state: State<'_, DbPool>,
    program_name: String,
    description: Option<String>,
    duration_min: i32,
    max_capacity: i32,
    price_per_person: i32,
    is_active: bool,
) -> MyceliumResult<i32> {
    DB_MODIFIED.store(true, Ordering::Relaxed);
    let row: (i32,) = sqlx::query_as(
        "INSERT INTO experience_programs (program_name, description, duration_min, max_capacity, price_per_person, is_active) 
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING program_id",
    )
    .bind(program_name)
    .bind(description)
    .bind(duration_min)
    .bind(max_capacity)
    .bind(price_per_person)
    .bind(is_active)
    .fetch_one(&*state)
    .await?;

    Ok(row.0)
}

#[command(rename_all = "snake_case")]
pub async fn update_experience_program(
    state: State<'_, DbPool>,
    program_id: i32,
    program_name: String,
    description: Option<String>,
    duration_min: i32,
    max_capacity: i32,
    price_per_person: i32,
    is_active: bool,
) -> MyceliumResult<()> {
    DB_MODIFIED.store(true, Ordering::Relaxed);
    sqlx::query(
        "UPDATE experience_programs SET program_name=$1, description=$2, duration_min=$3, max_capacity=$4, price_per_person=$5, is_active=$6 WHERE program_id=$7",
    )
    .bind(program_name)
    .bind(description)
    .bind(duration_min)
    .bind(max_capacity)
    .bind(price_per_person)
    .bind(is_active)
    .bind(program_id)
    .execute(&*state)
    .await?;

    Ok(())
}

#[command(rename_all = "snake_case")]
pub async fn delete_experience_program(
    state: State<'_, DbPool>,
    program_id: i32,
) -> MyceliumResult<()> {
    DB_MODIFIED.store(true, Ordering::Relaxed);
    sqlx::query("DELETE FROM experience_programs WHERE program_id = $1")
        .bind(program_id)
        .execute(&*state)
        .await?;
    Ok(())
}

#[command(rename_all = "snake_case")]
pub async fn get_experience_reservations(
    state: State<'_, DbPool>,
    start_date: Option<String>,
    end_date: Option<String>,
) -> MyceliumResult<Vec<ExperienceReservation>> {
    let mut sql = String::from(
        "SELECT r.*, p.program_name 
         FROM experience_reservations r
         LEFT JOIN experience_programs p ON r.program_id = p.program_id
         WHERE 1=1",
    );

    if start_date.is_some() && end_date.is_some() {
        sql.push_str(" AND r.reservation_date >= $1::date AND r.reservation_date <= $2::date");
    }

    sql.push_str(" ORDER BY r.reservation_date ASC, r.reservation_time ASC");

    let query = sqlx::query_as::<_, ExperienceReservation>(&sql);

    let query = if let (Some(start), Some(end)) = (start_date, end_date) {
        query.bind(start).bind(end)
    } else {
        query
    };

    Ok(query.fetch_all(&*state).await?)
}

#[command(rename_all = "snake_case")]
pub async fn create_experience_reservation(
    state: State<'_, DbPool>,
    program_id: i32,
    customer_id: Option<String>,
    guest_name: String,
    guest_contact: String,
    reservation_date: String,
    reservation_time: String,
    participant_count: i32,
    total_amount: i32,
    status: String,
    payment_status: String,
    memo: Option<String>,
) -> MyceliumResult<i32> {
    DB_MODIFIED.store(true, Ordering::Relaxed);
    let mut tx = state.begin().await?;

    let date_parsed = NaiveDate::parse_from_str(&reservation_date, "%Y-%m-%d")
        .map_err(|e| MyceliumError::Validation(format!("Invalid date: {}", e)))?;
    let time_parsed = NaiveTime::parse_from_str(&reservation_time, "%H:%M")
        .map_err(|e| MyceliumError::Validation(format!("Invalid time: {}", e)))?;

    let row: (i32,) = sqlx::query_as(
        "INSERT INTO experience_reservations (program_id, customer_id, guest_name, guest_contact, reservation_date, reservation_time, participant_count, total_amount, status, payment_status, memo) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING reservation_id",
    )
    .bind(program_id)
    .bind(customer_id)
    .bind(&guest_name)
    .bind(guest_contact)
    .bind(date_parsed)
    .bind(time_parsed)
    .bind(participant_count)
    .bind(total_amount)
    .bind(&status)
    .bind(&payment_status)
    .bind(&memo)
    .fetch_one(&mut *tx)
    .await?;

    let r_id = row.0;

    // Auto-create Schedule
    if status == "예약완료" {
        // Fetch Program duration
        let prog: (String, i32) = sqlx::query_as(
            "SELECT program_name, duration_min FROM experience_programs WHERE program_id = $1",
        )
        .bind(program_id)
        .fetch_one(&mut *tx)
        .await?;

        let start_dt = NaiveDateTime::new(date_parsed, time_parsed);
        let end_dt = start_dt + chrono::Duration::minutes(prog.1 as i64);

        sqlx::query(
            "INSERT INTO schedules (title, description, start_time, end_time, status, related_type, related_id) VALUES ($1, $2, $3, $4, 'Planned', 'EXPERIENCE', $5)"
        )
        .bind(format!("[체험] {}", prog.0))
        .bind(format!("{}명 ({})", participant_count, guest_name))
        .bind(start_dt)
        .bind(end_dt)
        .bind(r_id)
        .execute(&mut *tx)
        .await?;
    }

    tx.commit().await?;
    Ok(r_id)
}

#[command(rename_all = "snake_case")]
pub async fn update_experience_reservation(
    state: State<'_, DbPool>,
    reservation_id: i32,
    program_id: i32,
    customer_id: Option<String>,
    guest_name: String,
    guest_contact: String,
    reservation_date: String,
    reservation_time: String,
    participant_count: i32,
    total_amount: i32,
    status: String,
    payment_status: String,
    memo: Option<String>,
) -> MyceliumResult<()> {
    DB_MODIFIED.store(true, Ordering::Relaxed);
    let mut tx = state.begin().await?;

    let date_parsed = NaiveDate::parse_from_str(&reservation_date, "%Y-%m-%d")
        .map_err(|e| MyceliumError::Validation(format!("Invalid date: {}", e)))?;
    let time_parsed = NaiveTime::parse_from_str(&reservation_time, "%H:%M")
        .map_err(|e| MyceliumError::Validation(format!("Invalid time: {}", e)))?;

    // 1. Remove associated schedule
    let _ =
        sqlx::query("DELETE FROM schedules WHERE related_type = 'EXPERIENCE' AND related_id = $1")
            .bind(reservation_id)
            .execute(&mut *tx)
            .await;

    sqlx::query(
        "UPDATE experience_reservations SET program_id=$1, customer_id=$2, guest_name=$3, guest_contact=$4, 
         reservation_date=$5, reservation_time=$6, participant_count=$7, total_amount=$8, status=$9, payment_status=$10, memo=$11 
         WHERE reservation_id=$12",
    )
    .bind(program_id)
    .bind(customer_id)
    .bind(&guest_name)
    .bind(guest_contact)
    .bind(date_parsed)
    .bind(time_parsed)
    .bind(participant_count)
    .bind(total_amount)
    .bind(&status)
    .bind(&payment_status)
    .bind(&memo)
    .bind(reservation_id)
    .execute(&mut *tx)
    .await?;

    // Auto-create Schedule if Confirmed or Completed
    if status == "예약완료" || status == "체험완료" {
        // Fetch Program Info
        let (program_name, duration_min): (String, i32) = sqlx::query_as(
            "SELECT program_name, duration_min FROM experience_programs WHERE program_id = $1",
        )
        .bind(program_id)
        .fetch_one(&mut *tx)
        .await?;

        let start_dt = NaiveDateTime::new(date_parsed, time_parsed);
        let end_dt = start_dt + chrono::Duration::minutes(duration_min as i64);
        let title = format!("{}({})", program_name, guest_name);
        let schedule_status = if status == "체험완료" {
            "Completed"
        } else {
            "Planned"
        };

        sqlx::query(
            "INSERT INTO schedules (title, description, start_time, end_time, status, related_type, related_id) VALUES ($1, $2, $3, $4, $5, 'EXPERIENCE', $6)"
        )
        .bind(title)
        .bind(&memo)
        .bind(start_dt)
        .bind(end_dt)
        .bind(schedule_status)
        .bind(reservation_id)
        .execute(&mut *tx)
        .await?;
    }

    tx.commit().await?;
    Ok(())
}

#[command(rename_all = "snake_case")]
pub async fn delete_experience_reservation(
    state: State<'_, DbPool>,
    reservation_id: i32,
) -> MyceliumResult<()> {
    DB_MODIFIED.store(true, Ordering::Relaxed);
    let mut tx = state.begin().await?;

    // Delete Schedule
    let _ =
        sqlx::query("DELETE FROM schedules WHERE related_type = 'EXPERIENCE' AND related_id = $1")
            .bind(reservation_id)
            .execute(&mut *tx)
            .await;

    sqlx::query("DELETE FROM experience_reservations WHERE reservation_id = $1")
        .bind(reservation_id)
        .execute(&mut *tx)
        .await?;

    tx.commit().await?;
    Ok(())
}

#[command(rename_all = "snake_case")]
pub async fn update_experience_status(
    state: State<'_, DbPool>,
    reservation_id: i32,
    status: String,
    append_memo: Option<String>,
) -> MyceliumResult<()> {
    DB_MODIFIED.store(true, Ordering::Relaxed);
    let mut tx = state.begin().await?;

    sqlx::query(
        "UPDATE experience_reservations 
         SET status = $1, 
         memo = CASE 
             WHEN $3 IS NOT NULL AND LENGTH($3) > 0 THEN 
                CASE WHEN memo IS NULL OR LENGTH(memo) = 0 THEN $3 
                ELSE memo || '\n' || $3 END
             ELSE memo 
         END
         WHERE reservation_id = $2",
    )
    .bind(&status)
    .bind(reservation_id)
    .bind(append_memo)
    .execute(&mut *tx)
    .await?;

    // Schedule Logic
    if status == "예약완료" {
        // Delete existing
        let _ = sqlx::query(
            "DELETE FROM schedules WHERE related_type = 'EXPERIENCE' AND related_id = $1",
        )
        .bind(reservation_id)
        .execute(&mut *tx)
        .await;

        // Fetch Info
        let (program_name, duration_min, guest_name, r_date, r_time, r_memo): (String, i32, String, NaiveDate, NaiveTime, Option<String>) = sqlx::query_as(
            "SELECT p.program_name, p.duration_min, r.guest_name, r.reservation_date, r.reservation_time, r.memo 
             FROM experience_reservations r
             JOIN experience_programs p ON r.program_id = p.program_id
             WHERE r.reservation_id = $1"
        )
        .bind(reservation_id)
        .fetch_one(&mut *tx)
        .await?;

        let start_dt = NaiveDateTime::new(r_date, r_time);
        let end_dt = start_dt + chrono::Duration::minutes(duration_min as i64);
        let title = format!("{}({})", program_name, guest_name);

        sqlx::query(
            "INSERT INTO schedules (title, description, start_time, end_time, status, related_type, related_id) 
             VALUES ($1, $2, $3, $4, 'Planned', 'EXPERIENCE', $5)"
        )
        .bind(title)
        .bind(r_memo)
        .bind(start_dt)
        .bind(end_dt)
        .bind(reservation_id)
        .execute(&mut *tx)
        .await?;
    } else if status == "예약취소" || status == "예약대기" {
        let _ = sqlx::query(
            "DELETE FROM schedules WHERE related_type = 'EXPERIENCE' AND related_id = $1",
        )
        .bind(reservation_id)
        .execute(&mut *tx)
        .await;
    } else if status == "체험완료" {
        let _ = sqlx::query("UPDATE schedules SET status = 'Completed' WHERE related_type = 'EXPERIENCE' AND related_id = $1")
            .bind(reservation_id)
            .execute(&mut *tx)
            .await;
    }

    tx.commit().await?;
    Ok(())
}

#[command(rename_all = "snake_case")]
pub async fn update_experience_payment_status(
    state: State<'_, DbPool>,
    reservation_id: i32,
    payment_status: String,
) -> MyceliumResult<()> {
    DB_MODIFIED.store(true, Ordering::Relaxed);
    sqlx::query("UPDATE experience_reservations SET payment_status = $1 WHERE reservation_id = $2")
        .bind(payment_status)
        .bind(reservation_id)
        .execute(&*state)
        .await?;
    Ok(())
}

#[command(rename_all = "snake_case")]
pub async fn get_experience_dashboard_stats(
    state: State<'_, DbPool>,
) -> MyceliumResult<ExperienceDashboardStats> {
    // 1. Monthly Trend (Last 6 months)
    let trend_sql = r#"
        WITH RECURSIVE months AS (
            SELECT TO_CHAR(CURRENT_DATE - (i || ' month')::interval, 'YYYY-MM') as month
            FROM generate_series(0, 5) i
        )
        SELECT 
            m.month,
            COALESCE(COUNT(r.reservation_id), 0) as count,
            COALESCE(SUM(r.total_amount), 0) as revenue
        FROM months m
        LEFT JOIN experience_reservations r 
            ON TO_CHAR(r.reservation_date, 'YYYY-MM') = m.month
            AND r.status != '예약취소'
        GROUP BY m.month
        ORDER BY m.month ASC
    "#;

    let monthly_trend = sqlx::query_as::<_, ExpMonthlyTrend>(trend_sql)
        .fetch_all(&*state)
        .await?;

    // 2. Program Popularity (Top 5)
    let pop_sql = r#"
        SELECT 
            p.program_name,
            COUNT(r.reservation_id) as count
        FROM experience_programs p
        LEFT JOIN experience_reservations r 
            ON p.program_id = r.program_id 
            AND r.status != '예약취소'
        GROUP BY p.program_id, p.program_name
        ORDER BY count DESC
        LIMIT 5
    "#;

    let program_popularity = sqlx::query_as::<_, ExpProgramPopularity>(pop_sql)
        .fetch_all(&*state)
        .await?;

    Ok(ExperienceDashboardStats {
        monthly_trend,
        program_popularity,
    })
}

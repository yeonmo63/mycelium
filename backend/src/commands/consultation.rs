#![allow(non_snake_case)]
use crate::db::{Consultation, DbPool};
use crate::error::{MyceliumError, MyceliumResult};
use crate::stubs::{check_admin, command, State};
use crate::DB_MODIFIED;
use chrono::NaiveDate;
use std::sync::atomic::Ordering;

use axum::{
    extract::{Query, State as AxumState},
    Json,
};
use serde::Deserialize;

pub async fn create_consultation(
    state: State<'_, DbPool>,
    customer_id: Option<String>,
    guest_name: String,
    contact: String,
    channel: String,
    counselor_name: String,
    category: String,
    title: String,
    content: String,
    priority: String,
) -> MyceliumResult<i32> {
    create_consultation_internal(
        &state,
        customer_id,
        guest_name,
        contact,
        channel,
        counselor_name,
        category,
        title,
        content,
        priority,
    )
    .await
}

pub async fn create_consultation_internal(
    pool: &DbPool,
    customer_id: Option<String>,
    guest_name: String,
    contact: String,
    channel: String,
    counselor_name: String,
    category: String,
    title: String,
    content: String,
    priority: String,
) -> MyceliumResult<i32> {
    // Basic Sentiment Analysis Rule-based
    let sentiment = if content.contains("화남")
        || content.contains("불만")
        || content.contains("반품")
        || content.contains("환불")
        || content.contains("실망")
        || title.contains("반품")
        || title.contains("불만")
    {
        "부정적"
    } else if content.contains("감사")
        || content.contains("좋아요")
        || content.contains("만족")
        || content.contains("최고")
        || content.contains("맛있")
    {
        "긍정적"
    } else {
        "중립"
    };

    let consult_id: (i32,) = sqlx::query_as(
        "INSERT INTO consultations (customer_id, guest_name, contact, channel, counselor_name, category, title, content, priority, sentiment) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING consult_id"
    )
    .bind(customer_id)
    .bind(guest_name)
    .bind(contact)
    .bind(channel)
    .bind(counselor_name)
    .bind(category)
    .bind(title)
    .bind(content)
    .bind(priority)
    .bind(sentiment)
    .fetch_one(pool)
    .await?;

    Ok(consult_id.0)
}

pub async fn get_consultations(
    state: State<'_, DbPool>,
    start_date: Option<String>,
    end_date: Option<String>,
) -> MyceliumResult<Vec<Consultation>> {
    // Basic search - non-dynamic for simplicity in Postgres
    let rows = if let (Some(s), Some(e)) = (start_date, end_date) {
        let sd = NaiveDate::parse_from_str(&s, "%Y-%m-%d")
            .map_err(|e| MyceliumError::Validation(format!("Invalid start date: {}", e)))?;
        let ed = NaiveDate::parse_from_str(&e, "%Y-%m-%d")
            .map_err(|e| MyceliumError::Validation(format!("Invalid end date: {}", e)))?;
        sqlx::query_as::<_, Consultation>("SELECT * FROM consultations WHERE consult_date BETWEEN $1 AND $2 ORDER BY consult_date DESC, consult_id DESC")
            .bind(sd).bind(ed).fetch_all(&*state).await?
    } else {
        sqlx::query_as::<_, Consultation>(
            "SELECT * FROM consultations ORDER BY consult_date DESC, consult_id DESC LIMIT 200",
        )
        .fetch_all(&*state)
        .await?
    };

    Ok(rows)
}

pub async fn update_consultation(
    state: State<'_, DbPool>,
    consult_id: i32,
    answer: Option<String>,
    status: String,
    priority: String,
    follow_up_date: Option<String>,
) -> MyceliumResult<()> {
    let f_date =
        if let Some(s) = follow_up_date {
            if s.is_empty() {
                None
            } else {
                Some(NaiveDate::parse_from_str(&s, "%Y-%m-%d").map_err(|e| {
                    MyceliumError::Validation(format!("Invalid follow-up date: {}", e))
                })?)
            }
        } else {
            None
        };
    DB_MODIFIED.store(true, Ordering::Relaxed);

    sqlx::query("UPDATE consultations SET answer=$1, status=$2, priority=$3, follow_up_date=$4 WHERE consult_id=$5")
        .bind(answer)
        .bind(status)
        .bind(priority)
        .bind(f_date)
        .bind(consult_id)
        .execute(&*state)
        .await?;

    Ok(())
}

pub async fn delete_consultation(state: State<'_, DbPool>, consult_id: i32) -> MyceliumResult<()> {
    sqlx::query("DELETE FROM consultations WHERE consult_id=$1")
        .bind(consult_id)
        .execute(&*state)
        .await?;
    Ok(())
}

#[derive(serde::Serialize, sqlx::FromRow)]
pub struct PendingConsultation {
    pub consult_id: i32,
    pub title: String,
    pub date: String,
    pub customer: String,
    pub priority: String,
}

pub async fn get_top_pending_consultations(
    state: State<'_, DbPool>,
) -> MyceliumResult<Vec<PendingConsultation>> {
    let sql = r#"
        SELECT 
            consult_id,
            title,
            to_char(consult_date, 'YYYY-MM-DD') as date,
            guest_name as customer,
            priority
        FROM consultations
        WHERE status IN ('접수', '처리중')
        ORDER BY 
            CASE priority 
                WHEN '긴급' THEN 1 
                WHEN '높음' THEN 2 
                WHEN '보통' THEN 3 
                ELSE 4 
            END ASC,
            consult_date ASC
        LIMIT 5
    "#;

    Ok(sqlx::query_as::<_, PendingConsultation>(sql)
        .fetch_all(&*state)
        .await?)
}

// --- Axum Handlers ---

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConsultDateQuery {
    pub start_date: Option<String>,
    pub end_date: Option<String>,
}

pub async fn get_consultations_axum(
    AxumState(state): AxumState<crate::state::AppState>,
    Query(params): Query<ConsultDateQuery>,
) -> MyceliumResult<Json<Vec<Consultation>>> {
    let rows = if let (Some(s), Some(e)) = (params.start_date, params.end_date) {
        let sd = NaiveDate::parse_from_str(&s, "%Y-%m-%d")
            .map_err(|e| MyceliumError::Validation(format!("Invalid start date: {}", e)))?;
        let ed = NaiveDate::parse_from_str(&e, "%Y-%m-%d")
            .map_err(|e| MyceliumError::Validation(format!("Invalid end date: {}", e)))?;
        sqlx::query_as::<_, Consultation>("SELECT * FROM consultations WHERE consult_date BETWEEN $1 AND $2 ORDER BY consult_date DESC, consult_id DESC")
            .bind(sd).bind(ed).fetch_all(&state.pool).await?
    } else {
        sqlx::query_as::<_, Consultation>(
            "SELECT * FROM consultations ORDER BY consult_date DESC, consult_id DESC LIMIT 200",
        )
        .fetch_all(&state.pool)
        .await?
    };

    Ok(Json(rows))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateConsultInput {
    pub customer_id: Option<String>,
    pub guest_name: String,
    pub contact: String,
    pub channel: String,
    pub counselor_name: String,
    pub category: String,
    pub title: String,
    pub content: String,
    pub priority: String,
}

pub async fn create_consultation_axum(
    AxumState(state): AxumState<crate::state::AppState>,
    Json(input): Json<CreateConsultInput>,
) -> MyceliumResult<Json<serde_json::Value>> {
    let id = create_consultation_internal(
        &state.pool,
        input.customer_id,
        input.guest_name,
        input.contact,
        input.channel,
        input.counselor_name,
        input.category,
        input.title,
        input.content,
        input.priority,
    )
    .await?;
    Ok(Json(serde_json::json!({ "consult_id": id })))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateConsultInput {
    pub consult_id: i32,
    pub answer: Option<String>,
    pub status: String,
    pub priority: String,
    pub follow_up_date: Option<String>,
}

pub async fn update_consultation_axum(
    AxumState(state): AxumState<crate::state::AppState>,
    Json(input): Json<UpdateConsultInput>,
) -> MyceliumResult<Json<()>> {
    let f_date =
        if let Some(s) = input.follow_up_date {
            if s.is_empty() {
                None
            } else {
                Some(NaiveDate::parse_from_str(&s, "%Y-%m-%d").map_err(|e| {
                    MyceliumError::Validation(format!("Invalid follow-up date: {}", e))
                })?)
            }
        } else {
            None
        };
    DB_MODIFIED.store(true, Ordering::Relaxed);

    sqlx::query("UPDATE consultations SET answer=$1, status=$2, priority=$3, follow_up_date=$4 WHERE consult_id=$5")
        .bind(input.answer)
        .bind(input.status)
        .bind(input.priority)
        .bind(f_date)
        .bind(input.consult_id)
        .execute(&state.pool)
        .await?;

    Ok(Json(()))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteConsultQuery {
    #[serde(alias = "consultId", alias = "consult_id")]
    pub consult_id: i32,
}

pub async fn delete_consultation_axum(
    AxumState(state): AxumState<crate::state::AppState>,
    Query(params): Query<DeleteConsultQuery>,
) -> MyceliumResult<Json<()>> {
    DB_MODIFIED.store(true, Ordering::Relaxed);
    sqlx::query("DELETE FROM consultations WHERE consult_id=$1")
        .bind(params.consult_id)
        .execute(&state.pool)
        .await?;
    Ok(Json(()))
}

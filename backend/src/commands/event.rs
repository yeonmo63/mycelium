#![allow(non_snake_case)]
use crate::db::{DbPool, Event};
use crate::error::{MyceliumError, MyceliumResult};
use crate::stubs::{check_admin, command, State};
use crate::DB_MODIFIED;
use axum::{
    extract::{Query, State as AxumState},
    Json,
};
use chrono::{Local, NaiveDate};
use serde::{Deserialize, Serialize};
use std::sync::atomic::Ordering;

#[derive(Deserialize)]
pub struct EventSearchQuery {
    pub query: Option<String>,
}

#[derive(Deserialize, Serialize)]
pub struct EventInput {
    pub event_id: Option<String>,
    pub event_name: String,
    pub organizer: Option<String>,
    pub manager_name: Option<String>,
    pub manager_contact: Option<String>,
    pub location_address: Option<String>,
    pub location_detail: Option<String>,
    pub start_date: Option<String>,
    pub end_date: Option<String>,
    pub memo: Option<String>,
}

#[derive(Deserialize)]
pub struct EventDeleteInput {
    pub event_id: String,
}

pub async fn get_last_event(state: State<'_, DbPool>) -> MyceliumResult<Option<Event>> {
    Ok(
        sqlx::query_as::<_, Event>("SELECT * FROM event ORDER BY created_at DESC LIMIT 1")
            .fetch_optional(&*state)
            .await?,
    )
}

pub async fn create_event(
    state: State<'_, DbPool>,
    event_name: String,
    organizer: Option<String>,
    manager_name: Option<String>,
    manager_contact: Option<String>,
    location_address: Option<String>,
    location_detail: Option<String>,
    start_date: Option<String>,
    end_date: Option<String>,
    memo: Option<String>,
) -> MyceliumResult<String> {
    // Generate ID: YYYYMMDD-1XXXX (Global Sequence)
    let now = Local::now();
    let date_str = now.format("%Y%m%d").to_string(); // YYYYMMDD

    // Find the last ID for THIS date to reset daily (using 1XXXX range for events)
    let last_record: Option<(String,)> = sqlx::query_as(
        "SELECT event_id FROM event WHERE event_id LIKE $1 ORDER BY event_id DESC LIMIT 1",
    )
    .bind(format!("{}%", date_str))
    .fetch_optional(&*state)
    .await?;

    let next_val = match last_record {
        Some((last_id,)) => {
            // last_id example: "20240520-10001"
            let parts: Vec<&str> = last_id.split('-').collect();
            if let Some(suffix) = parts.last() {
                suffix.parse::<i32>().unwrap_or(10000) + 1
            } else {
                10001
            }
        }
        None => 10001,
    };

    let event_id = format!("{}-{}", date_str, next_val);

    // Date parsing
    let start_date_parsed = match start_date {
        Some(s) if !s.is_empty() => Some(
            NaiveDate::parse_from_str(&s, "%Y-%m-%d")
                .map_err(|e| MyceliumError::Validation(format!("Invalid start date: {}", e)))?,
        ),
        _ => None,
    };
    let end_date_parsed = match end_date {
        Some(s) if !s.is_empty() => Some(
            NaiveDate::parse_from_str(&s, "%Y-%m-%d")
                .map_err(|e| MyceliumError::Validation(format!("Invalid end date: {}", e)))?,
        ),
        _ => None,
    };

    sqlx::query(
        "INSERT INTO event (
            event_id, event_name, organizer, manager_name, manager_contact,
            location_address, location_detail, start_date, end_date, memo
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)",
    )
    .bind(&event_id)
    .bind(event_name)
    .bind(organizer)
    .bind(manager_name)
    .bind(manager_contact)
    .bind(location_address)
    .bind(location_detail)
    .bind(start_date_parsed)
    .bind(end_date_parsed)
    .bind(memo)
    .execute(&*state)
    .await?;

    Ok(event_id)
}

pub async fn search_events_by_name_internal(
    pool: &DbPool,
    name: String,
) -> MyceliumResult<Vec<Event>> {
    Ok(sqlx::query_as::<_, Event>(
        "SELECT * FROM event WHERE event_name ILIKE $1 ORDER BY start_date DESC",
    )
    .bind(format!("%{}%", name))
    .fetch_all(pool)
    .await?)
}

pub async fn search_events_by_name(
    state: State<'_, DbPool>,
    name: String,
) -> MyceliumResult<Vec<Event>> {
    search_events_by_name_internal(&*state, name).await
}

pub async fn update_event(
    state: State<'_, DbPool>,
    event_id: String,
    event_name: String,
    organizer: Option<String>,
    manager_name: Option<String>,
    manager_contact: Option<String>,
    location_address: Option<String>,
    location_detail: Option<String>,
    start_date: Option<String>,
    end_date: Option<String>,
    memo: Option<String>,
) -> MyceliumResult<()> {
    DB_MODIFIED.store(true, Ordering::Relaxed);
    // Date parsing
    let start_date_parsed = match start_date {
        Some(s) if !s.is_empty() => Some(
            NaiveDate::parse_from_str(&s, "%Y-%m-%d")
                .map_err(|e| MyceliumError::Validation(format!("Invalid start date: {}", e)))?,
        ),
        _ => None,
    };
    let end_date_parsed = match end_date {
        Some(s) if !s.is_empty() => Some(
            NaiveDate::parse_from_str(&s, "%Y-%m-%d")
                .map_err(|e| MyceliumError::Validation(format!("Invalid end date: {}", e)))?,
        ),
        _ => None,
    };

    sqlx::query(
        "UPDATE event SET 
        event_name = $1, 
        organizer = $2, 
        manager_name = $3, 
        manager_contact = $4, 
        location_address = $5, 
        location_detail = $6, 
        start_date = $7, 
        end_date = $8, 
        memo = $9
        WHERE event_id = $10",
    )
    .bind(event_name)
    .bind(organizer)
    .bind(manager_name)
    .bind(manager_contact)
    .bind(location_address)
    .bind(location_detail)
    .bind(start_date_parsed)
    .bind(end_date_parsed)
    .bind(memo)
    .bind(event_id)
    .execute(&*state)
    .await?;

    Ok(())
}

pub async fn get_all_events(state: State<'_, DbPool>) -> MyceliumResult<Vec<Event>> {
    Ok(
        sqlx::query_as::<_, Event>("SELECT * FROM event ORDER BY start_date DESC")
            .fetch_all(&*state)
            .await?,
    )
}

pub async fn delete_event(state: State<'_, DbPool>, event_id: String) -> MyceliumResult<()> {
    DB_MODIFIED.store(true, Ordering::Relaxed);
    sqlx::query("DELETE FROM event WHERE event_id = $1")
        .bind(event_id)
        .execute(&*state)
        .await?;
    Ok(())
}

// Axum Handlers

pub async fn get_all_events_axum(
    AxumState(state): AxumState<crate::state::AppState>,
    Query(params): Query<EventSearchQuery>,
) -> MyceliumResult<Json<Vec<Event>>> {
    if let Some(q) = params.query {
        let events = search_events_by_name_internal(&state.pool, q).await?;
        Ok(Json(events))
    } else {
        let events = sqlx::query_as::<_, Event>("SELECT * FROM event ORDER BY start_date DESC")
            .fetch_all(&state.pool)
            .await?;
        Ok(Json(events))
    }
}

pub async fn create_event_axum(
    AxumState(state): AxumState<crate::state::AppState>,
    Json(input): Json<EventInput>,
) -> MyceliumResult<Json<String>> {
    // Reuse the create_event logic but we need to adapt it since create_event takes State wrapper.
    // Instead of refactoring create_event to take &DbPool (which would be cleaner but touches existing code),
    // let's just duplicate the logic slightly or extract the internal logic.
    // Actually, create_event logic is a bit complex with ID generation. Let's extract it.

    // START OF DUPLICATED/ADAPTED LOGIC FROM create_event
    let now = Local::now();
    let date_str = now.format("%Y%m%d").to_string();

    let last_record: Option<(String,)> = sqlx::query_as(
        "SELECT event_id FROM event WHERE event_id LIKE $1 ORDER BY event_id DESC LIMIT 1",
    )
    .bind(format!("{}%", date_str))
    .fetch_optional(&state.pool)
    .await?;

    let next_val = match last_record {
        Some((last_id,)) => {
            let parts: Vec<&str> = last_id.split('-').collect();
            if let Some(suffix) = parts.last() {
                suffix.parse::<i32>().unwrap_or(10000) + 1
            } else {
                10001
            }
        }
        None => 10001,
    };

    let event_id = format!("{}-{}", date_str, next_val);

    let start_date_parsed = match input.start_date {
        Some(s) if !s.is_empty() => Some(
            NaiveDate::parse_from_str(&s, "%Y-%m-%d")
                .map_err(|e| MyceliumError::Validation(format!("Invalid start date: {}", e)))?,
        ),
        _ => None,
    };
    let end_date_parsed = match input.end_date {
        Some(s) if !s.is_empty() => Some(
            NaiveDate::parse_from_str(&s, "%Y-%m-%d")
                .map_err(|e| MyceliumError::Validation(format!("Invalid end date: {}", e)))?,
        ),
        _ => None,
    };

    sqlx::query(
        "INSERT INTO event (
            event_id, event_name, organizer, manager_name, manager_contact,
            location_address, location_detail, start_date, end_date, memo
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)",
    )
    .bind(&event_id)
    .bind(input.event_name)
    .bind(input.organizer)
    .bind(input.manager_name)
    .bind(input.manager_contact)
    .bind(input.location_address)
    .bind(input.location_detail)
    .bind(start_date_parsed)
    .bind(end_date_parsed)
    .bind(input.memo)
    .execute(&state.pool)
    .await?;

    Ok(Json(event_id))
}

pub async fn update_event_axum(
    AxumState(state): AxumState<crate::state::AppState>,
    Json(input): Json<EventInput>,
) -> MyceliumResult<Json<()>> {
    let event_id = input.event_id.ok_or(MyceliumError::Validation(
        "Event ID is required for update".into(),
    ))?;

    let start_date_parsed = match input.start_date {
        Some(s) if !s.is_empty() => Some(
            NaiveDate::parse_from_str(&s, "%Y-%m-%d")
                .map_err(|e| MyceliumError::Validation(format!("Invalid start date: {}", e)))?,
        ),
        _ => None,
    };
    let end_date_parsed = match input.end_date {
        Some(s) if !s.is_empty() => Some(
            NaiveDate::parse_from_str(&s, "%Y-%m-%d")
                .map_err(|e| MyceliumError::Validation(format!("Invalid end date: {}", e)))?,
        ),
        _ => None,
    };

    sqlx::query(
        "UPDATE event SET 
        event_name = $1, 
        organizer = $2, 
        manager_name = $3, 
        manager_contact = $4, 
        location_address = $5, 
        location_detail = $6, 
        start_date = $7, 
        end_date = $8, 
        memo = $9
        WHERE event_id = $10",
    )
    .bind(input.event_name)
    .bind(input.organizer)
    .bind(input.manager_name)
    .bind(input.manager_contact)
    .bind(input.location_address)
    .bind(input.location_detail)
    .bind(start_date_parsed)
    .bind(end_date_parsed)
    .bind(input.memo)
    .bind(event_id)
    .execute(&state.pool)
    .await?;

    Ok(Json(()))
}

pub async fn delete_event_axum(
    AxumState(state): AxumState<crate::state::AppState>,
    Json(input): Json<EventDeleteInput>,
) -> MyceliumResult<Json<()>> {
    sqlx::query("DELETE FROM event WHERE event_id = $1")
        .bind(input.event_id)
        .execute(&state.pool)
        .await?;
    Ok(Json(()))
}

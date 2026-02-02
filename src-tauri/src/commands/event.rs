use crate::db::{DbPool, Event};
use crate::DB_MODIFIED;
use chrono::{NaiveDate, Utc};
use std::sync::atomic::Ordering;
use tauri::{command, State};

#[command]
pub async fn get_last_event(state: State<'_, DbPool>) -> Result<Option<Event>, String> {
    let event = sqlx::query_as::<_, Event>("SELECT * FROM event ORDER BY created_at DESC LIMIT 1")
        .fetch_optional(&*state)
        .await
        .map_err(|e: sqlx::Error| e.to_string())?;
    Ok(event)
}

#[command]
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
) -> Result<String, String> {
    // Generate ID: YYYYMMDD-1XXXX (Global Sequence)
    let now = Utc::now();
    let date_str = now.format("%Y%m%d").to_string(); // YYYYMMDD

    // Find the last ID for THIS date to reset daily (using 1XXXX range for events)
    let last_record: Option<(String,)> = sqlx::query_as(
        "SELECT event_id FROM event WHERE event_id LIKE $1 ORDER BY event_id DESC LIMIT 1",
    )
    .bind(format!("{}%", date_str))
    .fetch_optional(&*state)
    .await
    .map_err(|e: sqlx::Error| e.to_string())?;

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
                .map_err(|e| format!("Invalid start date: {}", e))?,
        ),
        _ => None,
    };
    let end_date_parsed = match end_date {
        Some(s) if !s.is_empty() => Some(
            NaiveDate::parse_from_str(&s, "%Y-%m-%d")
                .map_err(|e| format!("Invalid end date: {}", e))?,
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
    .await
    .map_err(|e: sqlx::Error| e.to_string())?;

    Ok(event_id)
}

#[command]
pub async fn search_events_by_name(
    state: State<'_, DbPool>,
    name: String,
) -> Result<Vec<Event>, String> {
    sqlx::query_as::<_, Event>(
        "SELECT * FROM event WHERE event_name ILIKE $1 ORDER BY start_date DESC",
    )
    .bind(format!("%{}%", name))
    .fetch_all(&*state)
    .await
    .map_err(|e: sqlx::Error| e.to_string())
}

#[command]
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
) -> Result<(), String> {
    DB_MODIFIED.store(true, Ordering::Relaxed);
    // Date parsing
    let start_date_parsed = match start_date {
        Some(s) if !s.is_empty() => Some(
            NaiveDate::parse_from_str(&s, "%Y-%m-%d")
                .map_err(|e| format!("Invalid start date: {}", e))?,
        ),
        _ => None,
    };
    let end_date_parsed = match end_date {
        Some(s) if !s.is_empty() => Some(
            NaiveDate::parse_from_str(&s, "%Y-%m-%d")
                .map_err(|e| format!("Invalid end date: {}", e))?,
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
    .await
    .map_err(|e: sqlx::Error| e.to_string())?;

    Ok(())
}

#[command]
pub async fn get_all_events(state: State<'_, DbPool>) -> Result<Vec<Event>, String> {
    sqlx::query_as::<_, Event>("SELECT * FROM event ORDER BY start_date DESC")
        .fetch_all(&*state)
        .await
        .map_err(|e: sqlx::Error| e.to_string())
}

#[command]
pub async fn delete_event(state: State<'_, DbPool>, event_id: String) -> Result<(), String> {
    DB_MODIFIED.store(true, Ordering::Relaxed);
    sqlx::query("DELETE FROM event WHERE event_id = $1")
        .bind(event_id)
        .execute(&*state)
        .await
        .map_err(|e: sqlx::Error| e.to_string())?;
    Ok(())
}

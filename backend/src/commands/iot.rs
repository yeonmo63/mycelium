use crate::db::DbPool;
use crate::error::MyceliumResult;
use crate::state::AppState;
use crate::stubs::{check_admin, command, State};
use axum::extract::{Json, Query, State as AxumState};
use chrono::{Local, Timelike};
use rand::Rng;
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, Row};

#[derive(Serialize, Deserialize, FromRow)]
pub struct Sensor {
    pub sensor_id: i32,
    pub sensor_name: String,
    pub space_id: Option<i32>,
    pub device_type: String, // 'wifi', 'usb', 'virtual'
    pub connection_info: Option<String>,
    pub is_active: bool,
}

#[derive(Serialize)]
pub struct SensorReading {
    pub sensor_id: i32,
    pub temperature: f64,
    pub humidity: f64,
    pub co2: f64,
    pub recorded_at: String,
}

pub async fn get_sensors(state: State<'_, DbPool>) -> MyceliumResult<Vec<Sensor>> {
    let pool = &*state;
    let sensors = sqlx::query_as::<_, Sensor>("SELECT sensor_id, sensor_name, space_id, device_type, connection_info, is_active FROM sensors WHERE is_active = TRUE")
        .fetch_all(pool)
        .await?;
    Ok(sensors)
}

pub async fn get_latest_readings(
    state: State<'_, DbPool>,
    sensor_ids: Vec<i32>,
) -> MyceliumResult<Vec<SensorReading>> {
    let pool = &*state;
    let mut readings = Vec::new();

    for id in sensor_ids {
        let record: Option<sqlx::postgres::PgRow> = sqlx::query(
            "SELECT temperature, humidity, co2, recorded_at 
             FROM sensor_readings 
             WHERE sensor_id = $1 
             ORDER BY recorded_at DESC LIMIT 1",
        )
        .bind(id)
        .fetch_optional(pool)
        .await?;

        if let Some(r) = record {
            let temp: rust_decimal::Decimal = r.get(0);
            let humid: rust_decimal::Decimal = r.get(1);
            let co2: rust_decimal::Decimal = r.get(2);
            let recorded_at: chrono::DateTime<chrono::Utc> = r.get(3);

            readings.push(SensorReading {
                sensor_id: id,
                temperature: temp.to_string().parse().unwrap_or(0.0),
                humidity: humid.to_string().parse().unwrap_or(0.0),
                co2: co2.to_string().parse().unwrap_or(0.0),
                recorded_at: recorded_at
                    .with_timezone(&Local)
                    .format("%H:%M:%S")
                    .to_string(),
            });
        } else {
            let virtual_data = get_virtual_simulation_data();
            readings.push(SensorReading {
                sensor_id: id,
                temperature: virtual_data.temperature,
                humidity: virtual_data.humidity,
                co2: virtual_data.co2,
                recorded_at: virtual_data.last_updated,
            });
        }
    }

    Ok(readings)
}

#[derive(Serialize)]
pub struct VirtualSensorData {
    pub temperature: f64,
    pub humidity: f64,
    pub co2: f64,
    pub last_updated: String,
}

fn get_virtual_simulation_data() -> VirtualSensorData {
    let now = Local::now();
    let hour = now.hour();
    let mut rng = rand::rng();

    let base_temp = if (8..18).contains(&hour) {
        24.0 + (hour as f64 - 12.0).abs() * -0.5
    } else {
        18.0 + (rng.random_range(-10..10) as f64 / 10.0)
    };
    let temperature = base_temp + (rng.random_range(-5..5) as f64 / 10.0);
    let humidity = 60.0 + (rng.random_range(-100..100) as f64 / 10.0);
    let base_co2 = if (8..18).contains(&hour) {
        450.0 + (rng.random_range(0..200) as f64)
    } else {
        800.0 + (rng.random_range(0..400) as f64)
    };

    VirtualSensorData {
        temperature: (temperature * 10.0).round() / 10.0,
        humidity: (humidity * 10.0).round() / 10.0,
        co2: (base_co2 * 10.0).round() / 10.0,
        last_updated: now.format("%H:%M:%S").to_string(),
    }
}

pub async fn get_virtual_sensor_data() -> MyceliumResult<VirtualSensorData> {
    Ok(get_virtual_simulation_data())
}

pub async fn record_simulated_readings(pool: &DbPool) -> MyceliumResult<()> {
    // 1. Get all active 'virtual' sensors
    let sensors: Vec<Sensor> = sqlx::query_as(
        "SELECT sensor_id, sensor_name, space_id, device_type, connection_info, is_active FROM sensors WHERE device_type = 'virtual' AND is_active = TRUE"
    )
    .fetch_all(pool)
    .await?;

    if sensors.is_empty() {
        // If no virtual sensor exists, create a default one for simulation
        let _ = sqlx::query(
            "INSERT INTO sensors (sensor_name, device_type, is_active) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING"
        )
        .bind("가상 센서 (Hub)")
        .bind("virtual")
        .bind(true)
        .execute(pool)
        .await;
        return Ok(());
    }

    for sensor in sensors {
        let data = get_virtual_simulation_data();
        let t = rust_decimal::Decimal::from_f64_retain(data.temperature).unwrap_or_default();
        let h = rust_decimal::Decimal::from_f64_retain(data.humidity).unwrap_or_default();
        let c = rust_decimal::Decimal::from_f64_retain(data.co2).unwrap_or_default();

        sqlx::query(
            "INSERT INTO sensor_readings (sensor_id, temperature, humidity, co2) VALUES ($1, $2, $3, $4)"
        )
        .bind(sensor.sensor_id)
        .bind(t)
        .bind(h)
        .bind(c)
        .execute(pool)
        .await?;
    }

    Ok(())
}

pub async fn push_sensor_data(
    state: State<'_, DbPool>,
    sensor_id: i32,
    temp: f64,
    humid: f64,
    co2: f64,
) -> MyceliumResult<()> {
    let pool = &*state;

    let t = rust_decimal::Decimal::from_f64_retain(temp).unwrap_or_default();
    let h = rust_decimal::Decimal::from_f64_retain(humid).unwrap_or_default();
    let c = rust_decimal::Decimal::from_f64_retain(co2).unwrap_or_default();

    sqlx::query(
        "INSERT INTO sensor_readings (sensor_id, temperature, humidity, co2) VALUES ($1, $2, $3, $4)"
    )
    .bind(sensor_id)
    .bind(t)
    .bind(h)
    .bind(c)
    .execute(pool)
    .await?;

    Ok(())
}

pub async fn save_sensor(state: State<'_, DbPool>, sensor: Sensor) -> MyceliumResult<()> {
    let pool = &*state;
    if sensor.sensor_id > 0 {
        sqlx::query(
            "UPDATE sensors SET sensor_name = $1, space_id = $2, device_type = $3, connection_info = $4, is_active = $5, updated_at = CURRENT_TIMESTAMP WHERE sensor_id = $6"
        )
        .bind(&sensor.sensor_name)
        .bind(sensor.space_id)
        .bind(&sensor.device_type)
        .bind(&sensor.connection_info)
        .bind(sensor.is_active)
        .bind(sensor.sensor_id)
        .execute(pool)
        .await?;
    } else {
        sqlx::query(
            "INSERT INTO sensors (sensor_name, space_id, device_type, connection_info, is_active) VALUES ($1, $2, $3, $4, $5)"
        )
        .bind(&sensor.sensor_name)
        .bind(sensor.space_id)
        .bind(&sensor.device_type)
        .bind(&sensor.connection_info)
        .bind(sensor.is_active)
        .execute(pool)
        .await?;
    }
    Ok(())
}

pub async fn delete_sensor(state: State<'_, DbPool>, sensor_id: i32) -> MyceliumResult<()> {
    let pool = &*state;
    sqlx::query("UPDATE sensors SET is_active = FALSE WHERE sensor_id = $1")
        .bind(sensor_id)
        .execute(pool)
        .await?;
    Ok(())
}

// Axum Handlers & Payloads

#[derive(Deserialize)]
pub struct SaveSensorPayload {
    pub sensor: Sensor,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteSensorPayload {
    pub sensor_id: i32,
}

pub async fn get_sensors_axum(
    AxumState(state): AxumState<AppState>,
) -> MyceliumResult<Json<Vec<Sensor>>> {
    let sensors = sqlx::query_as::<_, Sensor>("SELECT sensor_id, sensor_name, space_id, device_type, connection_info, is_active FROM sensors WHERE is_active = TRUE")
        .fetch_all(&state.pool)
        .await?;
    Ok(Json(sensors))
}

pub async fn save_sensor_axum(
    AxumState(state): AxumState<AppState>,
    Json(payload): Json<SaveSensorPayload>,
) -> MyceliumResult<Json<()>> {
    let sensor = payload.sensor;
    if sensor.sensor_id > 0 {
        sqlx::query(
            "UPDATE sensors SET sensor_name = $1, space_id = $2, device_type = $3, connection_info = $4, is_active = $5, updated_at = CURRENT_TIMESTAMP WHERE sensor_id = $6"
        )
        .bind(&sensor.sensor_name)
        .bind(sensor.space_id)
        .bind(&sensor.device_type)
        .bind(&sensor.connection_info)
        .bind(sensor.is_active)
        .bind(sensor.sensor_id)
        .execute(&state.pool)
        .await?;
    } else {
        sqlx::query(
            "INSERT INTO sensors (sensor_name, space_id, device_type, connection_info, is_active) VALUES ($1, $2, $3, $4, $5)"
        )
        .bind(&sensor.sensor_name)
        .bind(sensor.space_id)
        .bind(&sensor.device_type)
        .bind(&sensor.connection_info)
        .bind(sensor.is_active)
        .execute(&state.pool)
        .await?;
    }
    Ok(Json(()))
}

pub async fn delete_sensor_axum(
    AxumState(state): AxumState<AppState>,
    Json(payload): Json<DeleteSensorPayload>,
) -> MyceliumResult<Json<()>> {
    sqlx::query("UPDATE sensors SET is_active = FALSE WHERE sensor_id = $1")
        .bind(payload.sensor_id)
        .execute(&state.pool)
        .await?;
    Ok(Json(()))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LatestReadingsQuery {
    pub sensor_ids: String, // Comma separated IDs
}

pub async fn get_latest_readings_axum(
    AxumState(state): AxumState<AppState>,
    Query(params): Query<LatestReadingsQuery>,
) -> MyceliumResult<Json<Vec<SensorReading>>> {
    let ids: Vec<i32> = params
        .sensor_ids
        .split(',')
        .filter_map(|s| s.parse().ok())
        .collect();

    let readings = get_latest_readings(crate::stubs::State::from(&state.pool), ids).await?;
    Ok(Json(readings))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PushSensorDataPayload {
    pub sensor_id: i32,
    pub temp: f64,
    pub humid: f64,
    pub co2: f64,
}

pub async fn push_sensor_data_axum(
    AxumState(state): AxumState<AppState>,
    Json(payload): Json<PushSensorDataPayload>,
) -> MyceliumResult<Json<()>> {
    push_sensor_data(
        crate::stubs::State::from(&state.pool),
        payload.sensor_id,
        payload.temp,
        payload.humid,
        payload.co2,
    )
    .await?;
    Ok(Json(()))
}

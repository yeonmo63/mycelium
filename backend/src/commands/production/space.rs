use crate::db::{DbPool, ProductionSpace};
use crate::error::MyceliumResult;
use crate::state::AppState;
use crate::stubs::State;
use axum::extract::{Json, State as AxumState};
use sqlx::{query, query_as};

pub async fn get_production_spaces(
    state: State<'_, DbPool>,
) -> MyceliumResult<Vec<ProductionSpace>> {
    let pool = &*state;
    let spaces =
        query_as::<_, ProductionSpace>("SELECT * FROM production_spaces ORDER BY space_id ASC")
            .fetch_all(pool)
            .await?;
    Ok(spaces)
}

pub async fn save_production_space(
    state: State<'_, DbPool>,
    space: ProductionSpace,
) -> MyceliumResult<()> {
    let pool = &*state;
    if space.space_id > 0 {
        query(
            "UPDATE production_spaces SET space_name = $1, space_type = $2, location_info = $3, area_size = $4, area_unit = $5, is_active = $6, memo = $7, updated_at = CURRENT_TIMESTAMP WHERE space_id = $8"
        )
        .bind(&space.space_name)
        .bind(&space.space_type)
        .bind(&space.location_info)
        .bind(&space.area_size)
        .bind(&space.area_unit)
        .bind(space.is_active)
        .bind(&space.memo)
        .bind(space.space_id)
        .execute(pool)
        .await?;
    } else {
        query(
            "INSERT INTO production_spaces (space_name, space_type, location_info, area_size, area_unit, is_active, memo) VALUES ($1, $2, $3, $4, $5, $6, $7)"
        )
        .bind(&space.space_name)
        .bind(&space.space_type)
        .bind(&space.location_info)
        .bind(&space.area_size)
        .bind(&space.area_unit)
        .bind(space.is_active)
        .bind(&space.memo)
        .execute(pool)
        .await?;
    }
    Ok(())
}

pub async fn delete_production_space(
    state: State<'_, DbPool>,
    space_id: i32,
) -> MyceliumResult<()> {
    let pool = &*state;
    query("DELETE FROM production_spaces WHERE space_id = $1")
        .bind(space_id)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn get_production_spaces_axum(
    AxumState(state): AxumState<AppState>,
) -> MyceliumResult<Json<Vec<ProductionSpace>>> {
    let spaces =
        query_as::<_, ProductionSpace>("SELECT * FROM production_spaces ORDER BY space_id ASC")
            .fetch_all(&state.pool)
            .await?;
    Ok(Json(spaces))
}

pub async fn save_production_space_axum(
    AxumState(state): AxumState<AppState>,
    Json(space): Json<ProductionSpace>,
) -> MyceliumResult<Json<()>> {
    let pool = &state.pool;
    if space.space_id > 0 {
        query(
            "UPDATE production_spaces SET space_name = $1, space_type = $2, location_info = $3, area_size = $4, area_unit = $5, is_active = $6, memo = $7, updated_at = CURRENT_TIMESTAMP WHERE space_id = $8"
        )
        .bind(&space.space_name)
        .bind(&space.space_type)
        .bind(&space.location_info)
        .bind(&space.area_size)
        .bind(&space.area_unit)
        .bind(space.is_active)
        .bind(&space.memo)
        .bind(space.space_id)
        .execute(pool)
        .await?;
    } else {
        query(
            "INSERT INTO production_spaces (space_name, space_type, location_info, area_size, area_unit, is_active, memo) VALUES ($1, $2, $3, $4, $5, $6, $7)"
        )
        .bind(&space.space_name)
        .bind(&space.space_type)
        .bind(&space.location_info)
        .bind(&space.area_size)
        .bind(&space.area_unit)
        .bind(space.is_active)
        .bind(&space.memo)
        .execute(pool)
        .await?;
    }
    Ok(Json(()))
}

pub async fn delete_production_space_axum(
    AxumState(state): AxumState<AppState>,
    axum::extract::Path(space_id): axum::extract::Path<i32>,
) -> MyceliumResult<Json<()>> {
    let pool = &state.pool;
    query("DELETE FROM production_spaces WHERE space_id = $1")
        .bind(space_id)
        .execute(pool)
        .await?;
    Ok(Json(()))
}

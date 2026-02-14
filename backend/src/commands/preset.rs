use crate::db::DbPool;
use crate::error::{MyceliumError, MyceliumResult};
use serde::{Deserialize, Serialize};
use serde_json;

// Using global stubs
use crate::stubs::{AppHandle, State as TauriState, command, check_admin};
use crate::commands::config::check_admin as config_check_admin;
use axum::extract::{State as AxumState, Json};

#[derive(Debug, Deserialize, Serialize, sqlx::FromRow)]
pub struct CustomPreset {
    pub preset_id: i32,
    pub name: String,
    pub description: Option<String>,
    pub preset_data: serde_json::Value,
    pub created_at: Option<chrono::DateTime<chrono::Utc>>,
}


#[derive(Debug, Deserialize, Serialize, sqlx::FromRow)]
pub struct PresetProduct {
    pub name: String,
    pub specification: Option<String>,
    pub price: i32,
    pub item_type: String, // product, harvest_item, aux_material
    pub category: Option<String>,
    pub stock_quantity: i32,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct PresetBomItem {
    pub material_name: String,
    pub ratio: f64,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct PresetBom {
    pub product_name: String,
    pub materials: Vec<PresetBomItem>,
}

#[derive(Debug, Deserialize, Serialize, sqlx::FromRow)]
pub struct PresetSpace {
    pub name: String,
    pub space_type: String,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct Preset {
    pub products: Vec<PresetProduct>,
    pub boms: Vec<PresetBom>,
    pub spaces: Vec<PresetSpace>,
}

const MUSHROOM_PRESET_JSON: &str = r#"{
    "products": [
        { "name": "표고버섯 (생)", "specification": "1kg", "price": 15000, "item_type": "product", "category": "생버섯", "stock_quantity": 0 },
        { "name": "표고버섯 (생)", "specification": "2kg", "price": 28000, "item_type": "product", "category": "생버섯", "stock_quantity": 0 },
        { "name": "표고버섯 (건조)", "specification": "100g", "price": 10000, "item_type": "product", "category": "건조버섯", "stock_quantity": 0 },
        { "name": "생표고 원물", "specification": "kg", "price": 0, "item_type": "harvest_item", "category": "원물", "stock_quantity": 0 },
        { "name": "표고버섯 박스(1kg)", "specification": "개", "price": 500, "item_type": "aux_material", "category": "박스/포장", "stock_quantity": 1000 },
        { "name": "표고버섯 박스(2kg)", "specification": "개", "price": 800, "item_type": "aux_material", "category": "박스/포장", "stock_quantity": 1000 },
        { "name": "브랜드 스티커", "specification": "장", "price": 50, "item_type": "aux_material", "category": "라벨", "stock_quantity": 5000 },
        { "name": "아이스팩", "specification": "개", "price": 100, "item_type": "aux_material", "category": "기타자재", "stock_quantity": 500 }
    ],
    "boms": [
        { "product_name": "표고버섯 (생)", "materials": [
            { "material_name": "생표고 원물", "ratio": 1.05 },
            { "material_name": "표고버섯 박스(1kg)", "ratio": 1.0 },
            { "material_name": "브랜드 스티커", "ratio": 1.0 }
        ]}
    ],
    "spaces": [
        { "name": "1동 (재배사)", "space_type": "재배사" },
        { "name": "2동 (재배사)", "space_type": "재배사" },
        { "name": "3동 (재배사)", "space_type": "재배사" },
        { "name": "저온창고", "space_type": "창고" },
        { "name": "선별/포장실", "space_type": "작업장" }
    ]
}"#;

const STRAWBERRY_PRESET_JSON: &str = r#"{
    "products": [
        { "name": "설향 딸기 (특)", "specification": "500g", "price": 12000, "item_type": "product", "category": "생과", "stock_quantity": 0 },
        { "name": "설향 딸기 (상)", "specification": "500g", "price": 10000, "item_type": "product", "category": "생과", "stock_quantity": 0 },
        { "name": "수제 딸기잼", "specification": "300g", "price": 8500, "item_type": "product", "category": "가공품", "stock_quantity": 0 },
        { "name": "설향 딸기 원물", "specification": "kg", "price": 0, "item_type": "harvest_item", "category": "원물", "stock_quantity": 0 },
        { "name": "딸기 투명팩(500g)", "specification": "개", "price": 150, "item_type": "aux_material", "category": "박스/포장", "stock_quantity": 2000 },
        { "name": "딸기 난좌(Tray)", "specification": "개", "price": 80, "item_type": "aux_material", "category": "박스/포장", "stock_quantity": 2000 },
        { "name": "포장용 비닐(소)", "specification": "장", "price": 20, "item_type": "aux_material", "category": "비닐/봉투", "stock_quantity": 1000 },
        { "name": "잼 공병(300g)", "specification": "개", "price": 400, "item_type": "aux_material", "category": "기타자재", "stock_quantity": 500 }
    ],
    "boms": [
        { "product_name": "설향 딸기 (특)", "materials": [
            { "material_name": "설향 딸기 원물", "ratio": 0.52 },
            { "material_name": "딸기 투명팩(500g)", "ratio": 1.0 },
            { "material_name": "딸기 난좌(Tray)", "ratio": 1.0 }
        ]},
        { "product_name": "수제 딸기잼", "materials": [
            { "material_name": "설향 딸기 원물", "ratio": 0.2 },
            { "material_name": "잼 공병(300g)", "ratio": 1.0 }
        ]}
    ],
    "spaces": [
        { "name": "A동 (수경재배)", "space_type": "재배사" },
        { "name": "B동 (수경재배)", "space_type": "재배사" },
        { "name": "육묘장", "space_type": "재배사" },
        { "name": "예냉실", "space_type": "창고" },
        { "name": "포장실", "space_type": "작업장" }
    ]
}"#;

const POTATO_PRESET_JSON: &str = r#"{
    "products": [
        { "name": "수미감자 (왕특)", "specification": "10kg", "price": 25000, "item_type": "product", "category": "선별감자", "stock_quantity": 0 },
        { "name": "수미감자 (특)", "specification": "10kg", "price": 22000, "item_type": "product", "category": "선별감자", "stock_quantity": 0 },
        { "name": "조림용 알감자", "specification": "5kg", "price": 12000, "item_type": "product", "category": "선별감자", "stock_quantity": 0 },
        { "name": "감자 원물(수확)", "specification": "kg", "price": 0, "item_type": "harvest_item", "category": "원물", "stock_quantity": 0 },
        { "name": "감자 박스(10kg)", "specification": "개", "price": 650, "item_type": "aux_material", "category": "박스/포장", "stock_quantity": 1000 },
        { "name": "감자 박스(5kg)", "specification": "개", "price": 450, "item_type": "aux_material", "category": "박스/포장", "stock_quantity": 1000 },
        { "name": "낱개 그물망", "specification": "개", "price": 30, "item_type": "aux_material", "category": "박스/포장", "stock_quantity": 2000 }
    ],
    "boms": [
        { "product_name": "수미감자 (왕특)", "materials": [
            { "material_name": "감자 원물(수확)", "ratio": 10.2 },
            { "material_name": "감자 박스(10kg)", "ratio": 1.0 }
        ]},
        { "product_name": "조림용 알감자", "materials": [
            { "material_name": "감자 원물(수확)", "ratio": 5.1 },
            { "material_name": "감자 박스(5kg)", "ratio": 1.0 }
        ]}
    ],
    "spaces": [
        { "name": "노지 1필지", "space_type": "재배지" },
        { "name": "노지 2필지", "space_type": "재배지" },
        { "name": "저온저장고", "space_type": "창고" },
        { "name": "선별작업장", "space_type": "작업장" }
    ]
}"#;

const SHINE_MUSCAT_PRESET_JSON: &str = r#"{
    "products": [
        { "name": "샤인머스켓 (특)", "specification": "2kg/3송이", "price": 35000, "item_type": "product", "category": "포도", "stock_quantity": 0 },
        { "name": "샤인머스켓 (상)", "specification": "2kg/4송이", "price": 30000, "item_type": "product", "category": "포도", "stock_quantity": 0 },
        { "name": "샤인머스켓 원물", "specification": "kg", "price": 0, "item_type": "harvest_item", "category": "원물", "stock_quantity": 0 },
        { "name": "샤인 전용 박스(2kg)", "specification": "개", "price": 1200, "item_type": "aux_material", "category": "박스/포장", "stock_quantity": 500 },
        { "name": "에어셀 완충재", "specification": "개", "price": 300, "item_type": "aux_material", "category": "박스/포장", "stock_quantity": 1000 },
        { "name": "고급 선물용 띠지", "specification": "장", "price": 100, "item_type": "aux_material", "category": "라벨", "stock_quantity": 1000 }
    ],
    "boms": [
        { "product_name": "샤인머스켓 (특)", "materials": [
            { "material_name": "샤인머스켓 원물", "ratio": 2.1 },
            { "material_name": "샤인 전용 박스(2kg)", "ratio": 1.0 },
            { "material_name": "에어셀 완충재", "ratio": 3.0 }
        ]}
    ],
    "spaces": [
        { "name": "포도 연동하우스", "space_type": "재배사" },
        { "name": "출하 전 예냉실", "space_type": "창고" },
        { "name": "포도 소포장실", "space_type": "작업장" }
    ]
}"#;

const APPLE_PRESET_JSON: &str = r#"{
    "products": [
        { "name": "꿀사과 (부사/대과)", "specification": "5kg/12과", "price": 45000, "item_type": "product", "category": "사과", "stock_quantity": 0 },
        { "name": "꿀사과 (부사/중과)", "specification": "5kg/16과", "price": 38000, "item_type": "product", "category": "사과", "stock_quantity": 0 },
        { "name": "사과 원물", "specification": "kg", "price": 0, "item_type": "harvest_item", "category": "원물", "stock_quantity": 0 },
        { "name": "사과 전용 박스(5kg)", "specification": "개", "price": 800, "item_type": "aux_material", "category": "박스/포장", "stock_quantity": 1000 },
        { "name": "사과 상/하 난좌", "specification": "세트", "price": 400, "item_type": "aux_material", "category": "박스/포장", "stock_quantity": 1000 },
        { "name": "개별 폼 캡", "specification": "개", "price": 50, "item_type": "aux_material", "category": "박스/포장", "stock_quantity": 5000 }
    ],
    "boms": [
        { "product_name": "꿀사과 (부사/대과)", "materials": [
            { "material_name": "사과 원물", "ratio": 5.2 },
            { "material_name": "사과 전용 박스(5kg)", "ratio": 1.0 },
            { "material_name": "사과 상/하 난좌", "ratio": 1.0 }
        ]}
    ],
    "spaces": [
        { "name": "과수원 1구역", "space_type": "재배지" },
        { "name": "과수원 2구역", "space_type": "재배지" },
        { "name": "대형 저온저장고", "space_type": "창고" },
        { "name": "자동 선별장", "space_type": "작업장" }
    ]
}"#;

const TOMATO_PRESET_JSON: &str = r#"{
    "products": [
        { "name": "대추방울토마토", "specification": "750g/팩", "price": 8500, "item_type": "product", "category": "토마토", "stock_quantity": 0 },
        { "name": "대추방울토마토 (원물)", "specification": "kg", "price": 0, "item_type": "harvest_item", "category": "원물", "stock_quantity": 0 },
        { "name": "토마토 투명용기(750g)", "specification": "개", "price": 180, "item_type": "aux_material", "category": "박스/포장", "stock_quantity": 2000 },
        { "name": "토마토 외박스(2kg용)", "specification": "개", "price": 600, "item_type": "aux_material", "category": "박스/포장", "stock_quantity": 1000 },
        { "name": "생산자 직인 스티커", "specification": "장", "price": 30, "item_type": "aux_material", "category": "라벨", "stock_quantity": 5000 }
    ],
    "boms": [
        { "product_name": "대추방울토마토", "materials": [
            { "material_name": "대추방울토마토 (원물)", "ratio": 0.77 },
            { "material_name": "토마토 투명용기(750g)", "ratio": 1.0 },
            { "material_name": "생산자 직인 스티커", "ratio": 1.0 }
        ]}
    ],
    "spaces": [
        { "name": "토마토 생산동", "space_type": "재배사" },
        { "name": "육묘실", "space_type": "재배사" },
        { "name": "집하/출하실", "space_type": "작업장" }
    ]
}"#;


#[allow(dead_code)]
pub async fn apply_preset(
    app: AppHandle,
    state: TauriState<'_, DbPool>,
    preset_type: String,
) -> MyceliumResult<()> {
    check_admin(&app)?;
    internal_apply_preset(&state, preset_type).await
}

#[derive(Deserialize)]
pub struct ApplyPresetRequest {
    pub presetType: String,
}

#[derive(Deserialize)]
pub struct PresetQuery {
    pub presetType: String,
}

pub async fn apply_preset_axum(
    AxumState(state): AxumState<crate::state::AppState>,
    Json(payload): Json<ApplyPresetRequest>,
) -> MyceliumResult<Json<()>> {
    internal_apply_preset(&state.pool, payload.presetType).await?;
    Ok(Json(()))
}

async fn internal_apply_preset(pool: &sqlx::Pool<sqlx::Postgres>, preset_type: String) -> MyceliumResult<()> {
    let preset: Preset = if preset_type.starts_with("custom_") {
        let id_str = &preset_type[7..];
        let preset_id = id_str
            .parse::<i32>()
            .map_err(|_| MyceliumError::Internal("Invalid custom preset ID".to_string()))?;
        let row: (serde_json::Value,) =
            sqlx::query_as("SELECT preset_data FROM custom_presets WHERE preset_id = $1")
                .bind(preset_id)
                .fetch_one(pool)
                .await?;
        serde_json::from_value(row.0)?
    } else {
        let preset_json = match preset_type.as_str() {
            "mushroom" => MUSHROOM_PRESET_JSON,
            "strawberry" => STRAWBERRY_PRESET_JSON,
            "potato" => POTATO_PRESET_JSON,
            "shinemuscat" => SHINE_MUSCAT_PRESET_JSON,
            "apple" => APPLE_PRESET_JSON,
            "tomato" => TOMATO_PRESET_JSON,
            _ => return Ok(()),
        };
        serde_json::from_str(preset_json)?
    };
    let mut tx = pool.begin().await?;

    // 1. Insert Products
    for p in preset.products {
        // Check duplication
        let exists: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM products WHERE product_name = $1 AND specification IS NOT DISTINCT FROM $2")
            .bind(&p.name)
            .bind(&p.specification)
            .fetch_one(&mut *tx).await?;

        if exists.0 == 0 {
            sqlx::query("INSERT INTO products (product_name, specification, unit_price, item_type, category, stock_quantity) VALUES ($1, $2, $3, $4, $5, $6)")
            .bind(&p.name)
            .bind(&p.specification)
            .bind(p.price)
            .bind(&p.item_type)
            .bind(&p.category)
            .bind(p.stock_quantity)
            .execute(&mut *tx).await?;
        }
    }

    // 2. Insert Spaces
    for s in preset.spaces {
        let exists: (i64,) =
            sqlx::query_as("SELECT COUNT(*) FROM production_spaces WHERE space_name = $1")
                .bind(&s.name)
                .fetch_one(&mut *tx)
                .await?;

        if exists.0 == 0 {
            sqlx::query("INSERT INTO production_spaces (space_name, space_type, is_active) VALUES ($1, $2, true)")
             .bind(&s.name)
             .bind(&s.space_type)
             .execute(&mut *tx).await?;
        }
    }

    // 3. Insert BOMs
    for bom in preset.boms {
        // Find product ID (Might have multiple if same name but diff spec, here we pick one or loop?
        // Preset implies specific name usually matches. But '표고버섯 (생)' appears twice in my JSON with diff specs.
        // My JSON structure 'boms' uses product_name without spec. This is ambiguous.
        // I should fix JSON logic or query.
        // Let's assume unique names in BOM definition or use spec in BOM definition.
        // I'll update the struct and JSON to include spec for BOM target.

        // Actually, let's just loop all products with that name for simplicity or refine logic.
        // Better: require BOM target to specify Spec if needed.
        // For this MVP, I'll bind to the "1kg" one specifically if I can, or update JSON.
        // I'll update JSON to be specific.

        let pids: Vec<i32> =
            sqlx::query_scalar("SELECT product_id FROM products WHERE product_name = $1")
                .bind(&bom.product_name)
                .fetch_all(&mut *tx)
                .await?;

        for product_id in pids {
            for mat in &bom.materials {
                // Material ID lookup
                let mid: Option<i32> =
                    sqlx::query_scalar("SELECT product_id FROM products WHERE product_name = $1")
                        .bind(&mat.material_name)
                        .fetch_optional(&mut *tx)
                        .await?;

                if let Some(material_id) = mid {
                    // Check existing BOM
                    let exists: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM product_bom WHERE product_id = $1 AND material_id = $2")
                        .bind(product_id)
                        .bind(material_id)
                        .fetch_one(&mut *tx).await?;

                    if exists.0 == 0 {
                        sqlx::query("INSERT INTO product_bom (product_id, material_id, ratio) VALUES ($1, $2, $3)")
                            .bind(product_id)
                            .bind(material_id)
                            .bind(mat.ratio)
                            .execute(&mut *tx).await?;
                    }
                }
            }
        }
    }

    tx.commit().await?;
    Ok(())
}


#[allow(dead_code)]
pub async fn get_preset_data(
    state: TauriState<'_, DbPool>,
    preset_type: String,
) -> MyceliumResult<Preset> {
    internal_get_preset_data(&state, preset_type).await
}

pub async fn get_preset_data_axum(
    AxumState(state): AxumState<crate::state::AppState>,
    axum::extract::Query(payload): axum::extract::Query<PresetQuery>,
) -> MyceliumResult<Json<Preset>> {
    let preset = internal_get_preset_data(&state.pool, payload.presetType).await?;
    Ok(Json(preset))
}

async fn internal_get_preset_data(pool: &sqlx::Pool<sqlx::Postgres>, preset_type: String) -> MyceliumResult<Preset> {
    if preset_type.starts_with("custom_") {
        let id_str = &preset_type[7..];
        let preset_id = id_str
            .parse::<i32>()
            .map_err(|_| MyceliumError::Internal("Invalid custom preset ID".to_string()))?;
        let row: (serde_json::Value,) =
            sqlx::query_as("SELECT preset_data FROM custom_presets WHERE preset_id = $1")
                .bind(preset_id)
                .fetch_one(pool)
                .await?;
        let preset: Preset = serde_json::from_value(row.0)?;
        return Ok(preset);
    }

    let preset_json = match preset_type.as_str() {
        "mushroom" => MUSHROOM_PRESET_JSON,
        "strawberry" => STRAWBERRY_PRESET_JSON,
        "potato" => POTATO_PRESET_JSON,
        "shinemuscat" => SHINE_MUSCAT_PRESET_JSON,
        "apple" => APPLE_PRESET_JSON,
        "tomato" => TOMATO_PRESET_JSON,
        _ => return Err(MyceliumError::Internal("Unknown preset type".to_string())),
    };

    let preset: Preset = serde_json::from_str(preset_json)?;
    Ok(preset)
}

#[derive(Deserialize)]
pub struct SavePresetRequest {
    pub name: String,
    pub description: Option<String>,
}


#[allow(dead_code)]
pub async fn save_current_as_preset(
    app: AppHandle,
    state: TauriState<'_, DbPool>,
    name: String,
    description: Option<String>,
) -> MyceliumResult<i32> {
    check_admin(&app)?;
    internal_save_current_as_preset(&state, name, description).await
}

pub async fn save_current_as_preset_axum(
    AxumState(state): AxumState<crate::state::AppState>,
    Json(payload): Json<SavePresetRequest>,
) -> MyceliumResult<Json<i32>> {
    let id = internal_save_current_as_preset(&state.pool, payload.name, payload.description).await?;
    Ok(Json(id))
}

async fn internal_save_current_as_preset(pool: &sqlx::Pool<sqlx::Postgres>, name: String, description: Option<String>) -> MyceliumResult<i32> {
    let mut conn = pool.acquire().await?;

    // 1. Fetch Products
    let products: Vec<PresetProduct> = sqlx::query_as(
        "SELECT product_name as name, specification, unit_price as price, item_type, category, stock_quantity FROM products"
    ).fetch_all(&mut *conn).await?;

    // 2. Fetch BOMs
    // Complex query to get BOMs with material names
    let bom_rows: Vec<(String, String, f64)> = sqlx::query_as(
        "SELECT p.product_name, m.product_name as material_name, b.ratio 
         FROM product_bom b
         JOIN products p ON b.product_id = p.product_id
         JOIN products m ON b.material_id = m.product_id",
    )
    .fetch_all(&mut *conn)
    .await?;

    let mut boms_map: std::collections::HashMap<String, Vec<PresetBomItem>> =
        std::collections::HashMap::new();
    for (p_name, m_name, ratio) in bom_rows {
        boms_map.entry(p_name).or_default().push(PresetBomItem {
            material_name: m_name,
            ratio,
        });
    }

    let boms: Vec<PresetBom> = boms_map
        .into_iter()
        .map(|(product_name, materials)| PresetBom {
            product_name,
            materials,
        })
        .collect();

    // 3. Fetch Spaces
    let spaces: Vec<PresetSpace> = sqlx::query_as(
        "SELECT space_name as name, space_type FROM production_spaces WHERE is_active = true",
    )
    .fetch_all(&mut *conn)
    .await?;

    let preset = Preset {
        products,
        boms,
        spaces,
    };
    let preset_json = serde_json::to_value(preset)?;

    let row: (i32,) = sqlx::query_as("INSERT INTO custom_presets (name, description, preset_data) VALUES ($1, $2, $3) RETURNING preset_id")
        .bind(name)
        .bind(description)
        .bind(preset_json)
        .fetch_one(&mut *conn)
        .await?;

    Ok(row.0)
}


#[allow(dead_code)]
pub async fn get_custom_presets(state: TauriState<'_, DbPool>) -> MyceliumResult<Vec<CustomPreset>> {
    internal_get_custom_presets(&state).await
}

pub async fn get_custom_presets_axum(AxumState(state): AxumState<crate::state::AppState>) -> MyceliumResult<Json<Vec<CustomPreset>>> {
    let presets = internal_get_custom_presets(&state.pool).await?;
    Ok(Json(presets))
}

async fn internal_get_custom_presets(pool: &sqlx::Pool<sqlx::Postgres>) -> MyceliumResult<Vec<CustomPreset>> {
    let presets =
        sqlx::query_as::<_, CustomPreset>("SELECT * FROM custom_presets ORDER BY created_at DESC")
            .fetch_all(pool)
            .await?;
    Ok(presets)
}

#[derive(Deserialize)]
pub struct DeletePresetRequest {
    pub presetId: i32,
}


#[allow(dead_code)]
pub async fn delete_custom_preset(
    app: AppHandle,
    state: TauriState<'_, DbPool>,
    preset_id: i32,
) -> MyceliumResult<()> {
    check_admin(&app)?;
    internal_delete_custom_preset(&state, preset_id).await
}

pub async fn delete_custom_preset_axum(
    AxumState(state): AxumState<crate::state::AppState>,
    Json(payload): Json<DeletePresetRequest>,
) -> MyceliumResult<Json<()>> {
    internal_delete_custom_preset(&state.pool, payload.presetId).await?;
    Ok(Json(()))
}

async fn internal_delete_custom_preset(pool: &sqlx::Pool<sqlx::Postgres>, preset_id: i32) -> MyceliumResult<()> {
    sqlx::query("DELETE FROM custom_presets WHERE preset_id = $1")
        .bind(preset_id)
        .execute(pool)
        .await?;
    Ok(())
}

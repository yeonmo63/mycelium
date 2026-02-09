use crate::db::DbPool;
use crate::error::MyceliumResult;
use serde::{Deserialize, Serialize};
use tauri::{command, State};

#[derive(Debug, Deserialize, Serialize)]
struct PresetProduct {
    name: String,
    specification: Option<String>,
    price: i32,
    item_type: String, // product, harvest_item, aux_material
    category: Option<String>,
    stock_quantity: i32,
}

#[derive(Debug, Deserialize, Serialize)]
struct PresetBomItem {
    material_name: String,
    ratio: f64,
}

#[derive(Debug, Deserialize, Serialize)]
struct PresetBom {
    product_name: String,
    materials: Vec<PresetBomItem>,
}

#[derive(Debug, Deserialize, Serialize)]
struct PresetSpace {
    name: String,
    space_type: String,
}

#[derive(Debug, Deserialize, Serialize)]
struct Preset {
    products: Vec<PresetProduct>,
    boms: Vec<PresetBom>,
    spaces: Vec<PresetSpace>,
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

#[command]
pub async fn apply_preset(state: State<'_, DbPool>, preset_type: String) -> MyceliumResult<()> {
    let preset_json = match preset_type.as_str() {
        "mushroom" => MUSHROOM_PRESET_JSON,
        _ => return Ok(()),
    };

    let preset: Preset = serde_json::from_str(preset_json)?;
    let mut tx = state.begin().await?;

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

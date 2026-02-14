use crate::error::MyceliumResult;
use chrono::NaiveDate;

pub async fn calculate_bom_tax_distribution(
    pool: &sqlx::PgPool,
    product_id: i32,
    total_amount: i32,
) -> MyceliumResult<Option<(i32, i32, i32)>> {
    let rows: Vec<(f64, String, i32)> = sqlx::query_as(
        r#"
        SELECT b.ratio, p.tax_type, p.unit_price
        FROM product_bom b
        JOIN products p ON b.material_id = p.product_id
        WHERE b.product_id = $1
        "#,
    )
    .bind(product_id)
    .fetch_all(pool)
    .await?;

    if rows.is_empty() {
        return Ok(None);
    }

    let mut total_bom_value = 0.0;
    let mut taxable_bom_value = 0.0;

    for (ratio, tax_type, unit_price) in rows {
        let val = ratio * (unit_price as f64);
        total_bom_value += val;
        if tax_type == "과세" {
            taxable_bom_value += val;
        }
    }

    if total_bom_value <= 0.0 {
        return Ok(None);
    }

    let taxable_portion_ratio = taxable_bom_value / total_bom_value;
    let total_f = total_amount as f64;
    let taxable_total = total_f * taxable_portion_ratio;

    let vat = (taxable_total / 1.1 * 0.1).round() as i32;
    let taxable_supply = (taxable_total - vat as f64).round() as i32;
    let exempt_amount = total_amount - vat - taxable_supply;

    Ok(Some((taxable_supply, vat, exempt_amount)))
}

pub fn parse_date_safe(date_str: &str) -> Option<NaiveDate> {
    if date_str.trim().is_empty() {
        return None;
    }
    NaiveDate::parse_from_str(date_str, "%Y-%m-%d")
        .or_else(|_| NaiveDate::parse_from_str(date_str, "%Y%m%d"))
        .ok()
}

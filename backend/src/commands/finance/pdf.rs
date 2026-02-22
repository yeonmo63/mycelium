use crate::commands::sales::query::get_tax_report_v2;
use crate::db::{CompanyInfo, DbPool};
use crate::error::{MyceliumError, MyceliumResult};
// use chrono::NaiveDate;
use crate::stubs::State;
use printpdf::*;
use std::fs::File;
use std::io::BufWriter;

pub async fn generate_finance_report_pdf(
    state: State<'_, DbPool>,
    save_path: String,
    start_date: String,
    end_date: String,
) -> MyceliumResult<()> {
    let pool = (*state).clone();

    // 1. Fetch Data
    let company_info = sqlx::query_as::<_, CompanyInfo>("SELECT * FROM company_info LIMIT 1")
        .fetch_optional(&pool)
        .await?
        .unwrap_or_default();

    let report_items = get_tax_report_v2(state, start_date.clone(), end_date.clone()).await?;

    // 2. Calculations
    let mut sales_supply = 0;
    let mut sales_vat = 0;
    let mut sales_exempt = 0;
    let mut purchase_supply = 0;
    let mut purchase_vat = 0;
    let mut expense_supply = 0;
    let mut expense_vat = 0;

    for item in &report_items {
        if item.direction == "매출" {
            sales_supply += item.supply_value;
            sales_vat += item.vat_amount;
            sales_exempt += item.tax_exempt_value;
        } else {
            if item.category == "재료매입" {
                purchase_supply += item.supply_value;
                purchase_vat += item.vat_amount;
            } else {
                expense_supply += item.supply_value;
                expense_vat += item.vat_amount;
            }
        }
    }

    let total_sales = sales_supply + sales_vat + sales_exempt;
    let total_purchases = purchase_supply + purchase_vat;
    let total_expenses = expense_supply + expense_vat;

    // 3. Generate PDF (spawn blocking)
    tokio::task::spawn_blocking(move || {
        let (doc, page1, layer1) =
            PdfDocument::new("Finance Report", Mm(210.0), Mm(297.0), "Layer 1");

        let font_path = std::path::Path::new("C:\\Windows\\Fonts\\malgun.ttf");
        let font = doc
            .add_external_font(
                File::open(font_path).map_err(|e| MyceliumError::Internal(e.to_string()))?,
            )
            .map_err(|e| MyceliumError::Internal(e.to_string()))?;

        let mut current_layer = doc.get_page(page1).get_layer(layer1);
        let mut current_y: f32 = 270.0;
        let margin_x: f32 = 15.0;
        let content_w: f32 = 180.0;

        // Helpers
        let draw_text = |layer: &PdfLayerReference, x: f32, y: f32, size: f32, txt: &str| {
            layer.begin_text_section();
            layer.set_font(&font, size);
            layer.set_text_cursor(Mm(x), Mm(y));
            layer.write_text(txt, &font);
            layer.end_text_section();
        };

        let draw_line = |layer: &PdfLayerReference, x1: f32, y1: f32, x2: f32, y2: f32| {
            let line = Line::from_iter(vec![
                (Point::new(Mm(x1), Mm(y1)), false),
                (Point::new(Mm(x2), Mm(y2)), false),
            ]);
            layer.add_line(line);
        };

        let format_currency = |amt: i64| {
            let s = amt.to_string();
            let mut result = String::new();
            for (i, c) in s.chars().rev().enumerate() {
                if i > 0 && i % 3 == 0 {
                    result.push(',');
                }
                result.push(c);
            }
            result.chars().rev().collect::<String>()
        };

        // --- TITLE ---
        draw_text(
            &current_layer,
            margin_x,
            current_y,
            20.0,
            "재무 및 세무 집계 리포트",
        );
        current_y -= 8.0;
        draw_text(
            &current_layer,
            margin_x,
            current_y,
            10.0,
            &format!("기간: {} ~ {}", start_date, end_date),
        );
        current_y -= 15.0;

        // --- COMPANY INFO ---
        let cy = current_y - 5.0;
        draw_text(
            &current_layer,
            margin_x + 5.0,
            cy,
            10.0,
            &format!("상호명: {}", company_info.company_name),
        );
        draw_text(
            &current_layer,
            margin_x + 90.0,
            cy,
            10.0,
            &format!(
                "대표자: {}",
                company_info.representative_name.as_deref().unwrap_or("-")
            ),
        );
        let cy2 = current_y - 12.0;
        draw_text(
            &current_layer,
            margin_x + 5.0,
            cy2,
            10.0,
            &format!(
                "사업자번호: {}",
                company_info.business_reg_number.as_deref().unwrap_or("-")
            ),
        );
        current_y -= 30.0;

        // --- SUMMARY SECTION ---
        draw_text(
            &current_layer,
            margin_x,
            current_y,
            12.0,
            "[1. 부가세 및 손익 요약]",
        );
        current_y -= 6.0;
        draw_line(
            &current_layer,
            margin_x,
            current_y,
            margin_x + content_w,
            current_y,
        );
        current_y -= 8.0;

        let items = vec![
            ("총 매출액 (VAT포함)", total_sales),
            ("  - 과세 매출 공급가액", sales_supply),
            ("  - 매출 부가세 (A)", sales_vat),
            ("  - 면세 매출액", sales_exempt),
            (
                "총 매입/지출 합계 (VAT포함)",
                total_purchases + total_expenses,
            ),
            ("  - 매입/지출 공급가액", purchase_supply + expense_supply),
            ("  - 매입 부가세 (B)", purchase_vat + expense_vat),
            (
                "납부/환급 예상 부가세 (A-B)",
                sales_vat - (purchase_vat + expense_vat),
            ),
            (
                "영업 이익 (매출 - 매입 - 지출)",
                total_sales - total_purchases - total_expenses,
            ),
        ];

        for (label, val) in items {
            draw_text(&current_layer, margin_x + 5.0, current_y, 10.0, label);
            let val_str = format!("{} 원", format_currency(val));
            let offset = 170.0 - (val_str.len() as f32 * 2.1);
            draw_text(&current_layer, offset, current_y, 10.0, &val_str);
            current_y -= 7.0;
        }
        current_y -= 10.0;

        // --- DETAILS TABLE ---
        draw_text(
            &current_layer,
            margin_x,
            current_y,
            12.0,
            "[2. 상세 내역 (최근 50건)]",
        );
        current_y -= 5.0;

        let sub_headers = vec!["구분", "일자", "항목/내용", "공급가", "부가세", "합계"];
        let sub_widths = vec![15.0, 20.0, 70.0, 25.0, 25.0, 25.0];
        let mut cx = margin_x;
        for (i, h) in sub_headers.iter().enumerate() {
            draw_text(&current_layer, cx, current_y, 9.0, h);
            cx += sub_widths[i];
        }
        current_y -= 3.0;
        draw_line(
            &current_layer,
            margin_x,
            current_y,
            margin_x + content_w,
            current_y,
        );
        current_y -= 5.0;

        for item in report_items.iter().take(50) {
            if current_y < 20.0 {
                let (p2, l2) = doc.add_page(Mm(210.0), Mm(297.0), "Details Page");
                current_layer = doc.get_page(p2).get_layer(l2);
                current_y = 270.0;
            }
            let mut cx = margin_x;
            draw_text(&current_layer, cx, current_y, 8.0, &item.direction);
            cx += sub_widths[0];
            draw_text(
                &current_layer,
                cx,
                current_y,
                8.0,
                &item
                    .date
                    .map(|d| d.format("%m-%d").to_string())
                    .unwrap_or_default(),
            );
            cx += sub_widths[1];
            let name_trunc = if item.name.chars().count() > 20 {
                item.name.chars().take(19).collect::<String>() + ".."
            } else {
                item.name.clone()
            };
            draw_text(&current_layer, cx, current_y, 8.0, &name_trunc);
            cx += sub_widths[2];
            draw_text(
                &current_layer,
                cx,
                current_y,
                8.0,
                &format_currency(item.supply_value),
            );
            cx += sub_widths[3];
            draw_text(
                &current_layer,
                cx,
                current_y,
                8.0,
                &format_currency(item.vat_amount),
            );
            cx += sub_widths[4];
            draw_text(
                &current_layer,
                cx,
                current_y,
                8.0,
                &format_currency(item.total_amount),
            );
            current_y -= 5.0;
        }

        // --- FOOTER ---
        draw_text(
            &current_layer,
            margin_x,
            10.0,
            8.0,
            &format!(
                "출력일시: {} | Mycelium Agri-Commerce OS",
                chrono::Local::now().format("%Y-%m-%d %H:%M:%S")
            ),
        );

        let file = File::create(save_path).map_err(|e| MyceliumError::Internal(e.to_string()))?;
        doc.save(&mut BufWriter::new(file))
            .map_err(|e| MyceliumError::Internal(e.to_string()))?;
        Ok::<(), MyceliumError>(())
    })
    .await
    .map_err(|e| MyceliumError::Internal(e.to_string()))??;

    Ok(())
}

use crate::db::{DbPool, FarmingLog};
use crate::error::{MyceliumError, MyceliumResult};
use chrono::NaiveDate;
use printpdf::path::{PaintMode, WindingOrder};
use printpdf::*;
use std::fs::File;
use std::io::BufWriter;
use std::path::PathBuf;
use tauri::{command, Manager, State};

#[command]
pub async fn generate_production_pdf(
    state: State<'_, DbPool>,
    app: tauri::AppHandle,
    save_path: String,
    start_date: String,
    end_date: String,
    include_attachments: bool,
    include_approval: bool,
    report_type: String,
) -> MyceliumResult<()> {
    let pool = state.inner().clone();

    // 1. Fetch Data
    let company_info = sqlx::query_as::<_, crate::db::CompanyInfo>(
        "SELECT id, company_name, representative_name, address, business_type, item, 
             phone_number, mobile_number, business_reg_number, registration_date, memo, 
             certification_info, created_at, updated_at 
             FROM company_info LIMIT 1",
    )
    .fetch_optional(&pool)
    .await?
    .unwrap_or_default();

    let start_naive = NaiveDate::parse_from_str(&start_date, "%Y-%m-%d")
        .map_err(|e| MyceliumError::Internal(format!("Invalid start date: {}", e)))?;
    let end_naive = NaiveDate::parse_from_str(&end_date, "%Y-%m-%d")
        .map_err(|e| MyceliumError::Internal(format!("Invalid end date: {}", e)))?;

    let all_logs = sqlx::query_as::<_, FarmingLog>(
        "SELECT * FROM farming_logs WHERE log_date BETWEEN $1 AND $2 ORDER BY log_date ASC",
    )
    .bind(start_naive)
    .bind(end_naive)
    .fetch_all(&pool)
    .await?;

    let allowed_categories: Option<Vec<&str>> = match report_type.as_str() {
        "chemical" => Some(vec!["pesticide", "fertilize"]),
        "sanitation" => Some(vec!["clean", "inspect", "water"]),
        "harvest" => Some(vec!["harvest", "process"]),
        "education" => Some(vec!["education"]),
        _ => None,
    };

    let raw_logs: Vec<FarmingLog> = if let Some(cats) = allowed_categories {
        all_logs
            .into_iter()
            .filter(|l| cats.contains(&l.work_type.as_str()))
            .collect()
    } else {
        all_logs
    };

    let main_title = match report_type.as_str() {
        "chemical" => "농약 살포 및 시비 기록부",
        "sanitation" => "위생 관리 및 시설 점검표",
        "harvest" => "수확 및 출하 관리 대장",
        "education" => "교육 훈련 및 인력 관리 일지",
        _ => "통합 영농 및 작업 기록장",
    };

    let media_dir: std::path::PathBuf = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("media"))
        .join("media");

    let work_types = std::collections::HashMap::from([
        ("plant", "식재/종균접종"),
        ("water", "관수/영양제"),
        ("fertilize", "비료/시비"),
        ("pesticide", "방제/약제"),
        ("harvest", "수확/채취"),
        ("process", "가공/포장"),
        ("clean", "청소/소독"),
        ("inspect", "점검/예찰"),
        ("education", "교육/훈련"),
    ]);

    // Pre-calculate photo mapping for speed
    let mut photo_map = std::collections::HashMap::new();
    let mut global_photo_idx = 1;
    for log in &raw_logs {
        if let Some(arr) = log.photos.as_ref().and_then(|v| v.as_array()) {
            for p in arr {
                if let Some(path) = p.get("path").and_then(|v| v.as_str()) {
                    if !photo_map.contains_key(path) {
                        photo_map.insert(path.to_string(), global_photo_idx);
                        global_photo_idx += 1;
                    }
                }
            }
        }
    }

    tokio::task::spawn_blocking(move || {
        // --- CONSTANTS (A4 mm) ---
        let page_w = Mm(210.0);
        let page_h = Mm(297.0);
        let margin_x: f32 = 10.0;
        let content_w: f32 = 190.0;

        let (doc, page1, layer1) = PdfDocument::new("GAP Log", page_w, page_h, "Layer 1");

        let font_path = std::path::Path::new("C:\\Windows\\Fonts\\malgun.ttf");
        let font = doc
            .add_external_font(
                File::open(font_path)
                    .map_err(|e| MyceliumError::Internal(format!("Font error: {}", e)))?,
            )
            .map_err(|e| MyceliumError::Internal(format!("Font load error: {}", e)))?;

        // Helpers
        let draw_text = |layer: &PdfLayerReference, x: f32, y: f32, size: f32, txt: &str| {
            layer.begin_text_section();
            layer.set_font(&font, size);
            layer.set_text_cursor(Mm(x), Mm(y));
            layer.write_text(txt, &font);
            layer.end_text_section();
        };

        let draw_text_centered = |layer: &PdfLayerReference,
                                  col_start: f32,
                                  col_width: f32,
                                  y: f32,
                                  size: f32,
                                  txt: &str| {
            let mut total_width_mm: f32 = 0.0;
            for c in txt.chars() {
                if c.is_ascii() {
                    total_width_mm += size * 0.5 * 0.3527;
                } else {
                    total_width_mm += size * 1.0 * 0.3527;
                }
            }
            let x = col_start + (col_width - total_width_mm) / 2.0;
            layer.begin_text_section();
            layer.set_font(&font, size);
            layer.set_text_cursor(Mm(x.max(col_start)), Mm(y));
            layer.write_text(txt, &font);
            layer.end_text_section();
        };

        let draw_rect = |layer: &PdfLayerReference, x: f32, y: f32, w: f32, h: f32| {
            let pts = vec![
                (Point::new(Mm(x), Mm(y)), false),
                (Point::new(Mm(x + w), Mm(y)), false),
                (Point::new(Mm(x + w), Mm(y + h)), false),
                (Point::new(Mm(x), Mm(y + h)), false),
            ];
            let polygon = Polygon {
                rings: vec![pts],
                mode: PaintMode::Stroke,
                winding_order: WindingOrder::NonZero,
            };
            layer.add_polygon(polygon);
        };

        let draw_line = |layer: &PdfLayerReference, x1: f32, y1: f32, x2: f32, y2: f32| {
            let line = Line::from_iter(
                std::iter::once((Point::new(Mm(x1), Mm(y1)), false))
                    .chain(std::iter::once((Point::new(Mm(x2), Mm(y2)), false))),
            );
            layer.add_line(line);
        };

        let mut current_layer = doc.get_page(page1).get_layer(layer1);
        let mut current_y: f32 = 262.0;

        // 1. HEADER
        draw_text(&current_layer, margin_x, current_y, 20.0, main_title);
        draw_text(&current_layer, margin_x + 0.2, current_y, 20.0, main_title);
        let period_txt = format!("기록 기간: {} ~ {}", start_date, end_date);
        draw_text(
            &current_layer,
            margin_x,
            current_y - 10.0,
            10.0,
            &period_txt,
        );

        if include_approval {
            let app_w: f32 = 68.0;
            let app_h: f32 = 24.0;
            let app_x = margin_x + content_w - app_w;
            let app_y = current_y - 14.0;
            current_layer.set_outline_thickness(2.0);
            draw_rect(&current_layer, app_x, app_y, app_w, app_h);
            current_layer.set_outline_thickness(0.5);
            let v1 = app_x + 8.0;
            let v2 = v1 + 20.0;
            let v3 = v2 + 20.0;
            draw_line(&current_layer, v1, app_y, v1, app_y + app_h);
            draw_line(&current_layer, v2, app_y, v2, app_y + app_h);
            draw_line(&current_layer, v3, app_y, v3, app_y + app_h);
            let h_label = app_y + app_h - 6.0;
            draw_line(&current_layer, v1, h_label, app_x + app_w, h_label);
            draw_text_centered(&current_layer, app_x, 8.0, app_y + 9.0, 8.0, "결재");
            draw_text_centered(&current_layer, v1, 20.0, h_label + 2.0, 8.0, "담당");
            draw_text_centered(&current_layer, v2, 20.0, h_label + 2.0, 8.0, "검토");
            draw_text_centered(&current_layer, v3, 20.0, h_label + 2.0, 8.0, "승인");
            current_y = app_y - 10.0;
        } else {
            current_y -= 14.0;
        }

        // 2. COMPANY INFO
        let box_h: f32 = 28.0;
        let box_top = current_y;
        let box_bot = box_top - box_h;
        current_layer.set_outline_thickness(2.0);
        draw_rect(&current_layer, margin_x, box_bot, content_w, box_h);
        current_layer.set_outline_thickness(0.5);
        let mid_y = box_top - (box_h / 2.0);
        draw_line(&current_layer, margin_x, mid_y, margin_x + content_w, mid_y);
        let x1 = margin_x + (content_w * 0.15);
        let x2 = margin_x + (content_w * 0.50);
        let x3 = margin_x + (content_w * 0.65);
        for x in [x1, x2, x3] {
            draw_line(&current_layer, x, box_bot, x, box_top);
        }

        let c_name = if company_info.company_name.trim().is_empty() {
            "-"
        } else {
            &company_info.company_name
        };
        let r_name = company_info.representative_name.as_deref().unwrap_or("-");
        let gap_num = company_info
            .certification_info
            .as_ref()
            .and_then(|c| c.get("gap"))
            .and_then(|v| v.as_str())
            .unwrap_or("-");
        let haccp_num = company_info
            .certification_info
            .as_ref()
            .and_then(|c| c.get("haccp"))
            .and_then(|v| v.as_str())
            .unwrap_or("-");

        let ty1 = mid_y + 5.0;
        let ty2 = box_bot + 5.0;
        let ts: f32 = 10.0;
        let col1_w = content_w * 0.15;
        let col3_w = content_w * 0.15;
        draw_text_centered(&current_layer, margin_x, col1_w, ty1, ts, "농 장 명");
        draw_text(&current_layer, x1 + 3.0, ty1, ts, c_name);
        draw_text_centered(&current_layer, x2, col3_w, ty1, ts, "대 표 자");
        draw_text(&current_layer, x3 + 3.0, ty1, ts, r_name);
        draw_text_centered(&current_layer, margin_x, col1_w, ty2, ts, "GAP 번호");
        draw_text(&current_layer, x1 + 3.0, ty2, ts, gap_num);
        draw_text_centered(&current_layer, x2, col3_w, ty2, ts, "HACCP");
        draw_text(&current_layer, x3 + 3.0, ty2, ts, haccp_num);

        current_y = box_bot - 10.0;

        // 3. TABLE HEADERS
        let header_h: f32 = 12.0;
        let h_top = current_y;
        let h_bot = h_top - header_h;
        current_layer.set_outline_thickness(2.0);
        current_layer.set_outline_color(Color::Rgb(Rgb::new(0.0, 0.0, 0.0, None)));
        draw_rect(&current_layer, margin_x, h_bot, content_w, header_h);

        let cols: Vec<f32> = vec![0.12, 0.12, 0.35, 0.18, 0.12, 0.11];
        let mut col_x = Vec::new();
        let mut cx = margin_x;
        for r in &cols {
            col_x.push(cx);
            cx += content_w * r;
        }

        let headers = vec![
            "일자",
            "구분",
            "주요 작업 내용",
            "투입 자재",
            "환경",
            "작업자",
        ];
        let hty = h_bot + 4.5;

        for (i, txt) in headers.iter().enumerate() {
            if i > 0 {
                current_layer.set_outline_thickness(0.5);
                draw_line(&current_layer, col_x[i], h_bot, col_x[i], h_top);
            }
            let col_w = if i < cols.len() - 1 {
                col_x[i + 1] - col_x[i]
            } else {
                margin_x + content_w - col_x[i]
            };
            draw_text_centered(&current_layer, col_x[i], col_w, hty, 9.0, txt);
        }

        current_y = h_bot;

        // 4. LOG ROWS
        let row_h: f32 = 22.0;

        for log in raw_logs {
            if current_y < 35.0 {
                let (page, layer) = doc.add_page(page_w, page_h, "Report Continued");
                current_layer = doc.get_page(page).get_layer(layer);
                current_y = 262.0;

                current_layer.set_outline_thickness(2.0);
                draw_rect(
                    &current_layer,
                    margin_x,
                    current_y - header_h,
                    content_w,
                    header_h,
                );
                for (i, txt) in headers.iter().enumerate() {
                    let col_w = if i < cols.len() - 1 {
                        col_x[i + 1] - col_x[i]
                    } else {
                        margin_x + content_w - col_x[i]
                    };
                    draw_text_centered(
                        &current_layer,
                        col_x[i],
                        col_w,
                        current_y - header_h + 4.5,
                        9.0,
                        txt,
                    );
                    if i > 0 {
                        current_layer.set_outline_thickness(0.5);
                        draw_line(
                            &current_layer,
                            col_x[i],
                            current_y - header_h,
                            col_x[i],
                            current_y,
                        );
                    }
                }
                current_y -= header_h;
            }

            let top = current_y;
            let bot = top - row_h;

            current_layer.set_outline_thickness(2.0);
            draw_line(&current_layer, margin_x, bot, margin_x, top);
            draw_line(
                &current_layer,
                margin_x + content_w,
                bot,
                margin_x + content_w,
                top,
            );

            current_layer.set_outline_thickness(0.5);
            draw_line(&current_layer, margin_x, bot, margin_x + content_w, bot);

            let d_s = log.log_date.format("%m-%d").to_string();
            let wt = work_types
                .get(log.work_type.as_str())
                .cloned()
                .unwrap_or(&log.work_type)
                .to_string();

            let mut content = log.work_content.clone();
            let mut photo_refs = Vec::new();
            if let Some(arr) = log.photos.as_ref().and_then(|v| v.as_array()) {
                for p in arr {
                    if let Some(path) = p.get("path").and_then(|v| v.as_str()) {
                        if let Some(idx) = photo_map.get(path) {
                            photo_refs.push(idx.to_string());
                        }
                    }
                }
            }
            if !photo_refs.is_empty() {
                content.push_str(&format!(" (증 {})", photo_refs.join(", ")));
            }

            let mut mats_lines = Vec::new();
            if let Some(arr) = log.input_materials.as_ref().and_then(|v| v.as_array()) {
                for m in arr {
                    let name = m.get("name").and_then(|v| v.as_str()).unwrap_or("-");
                    let qty = m.get("quantity").and_then(|v| v.as_str()).unwrap_or("");
                    let unit = m.get("unit").and_then(|v| v.as_str()).unwrap_or("");
                    mats_lines.push(format!("{} {}{}", name, qty, unit));
                }
            }
            let mats = if mats_lines.is_empty() {
                "-".to_string()
            } else {
                mats_lines.join(", ")
            };

            let mut env_lines = Vec::new();
            if let Some(ed) = log.env_data.as_ref() {
                if let Some(t) = ed.get("temp").and_then(|v| v.as_f64()) {
                    env_lines.push(format!("{:.1}C", t));
                }
                if let Some(h) = ed.get("humidity").and_then(|v| v.as_f64()) {
                    env_lines.push(format!("{:.0}%", h));
                }
                if let Some(c) = ed.get("co2").and_then(|v| v.as_f64()) {
                    env_lines.push(format!("{:.0}ppm", c));
                }
            }
            let env = if env_lines.is_empty() {
                "-".to_string()
            } else {
                env_lines.join("/")
            };

            let worker = if log.worker_name.as_deref().unwrap_or("-").trim() == "시스템자동" {
                r_name.to_string()
            } else {
                log.worker_name.as_deref().unwrap_or("-").to_string()
            };

            let items = vec![d_s, wt, content, mats, env, worker];
            let rty = bot + 9.5;

            for (i, txt) in items.iter().enumerate() {
                if i > 0 {
                    draw_line(&current_layer, col_x[i], bot, col_x[i], top);
                }
                let col_w = if i < cols.len() - 1 {
                    col_x[i + 1] - col_x[i]
                } else {
                    margin_x + content_w - col_x[i]
                };

                if i == 0 || i == 1 || i == 5 {
                    draw_text_centered(&current_layer, col_x[i], col_w, rty, 8.5, txt);
                } else if i == 2 {
                    let max_chars_per_line = 24;
                    let chars: Vec<char> = txt.chars().collect();
                    let mut lines = Vec::new();
                    for chunk in chars.chunks(max_chars_per_line) {
                        lines.push(chunk.iter().collect::<String>());
                    }
                    let mut current_line_y = if lines.len() <= 1 { rty } else { top - 6.0 };
                    for line in lines.iter().take(4) {
                        draw_text(&current_layer, col_x[i] + 2.0, current_line_y, 8.0, line);
                        current_line_y -= 4.5;
                    }
                } else {
                    draw_text(&current_layer, col_x[i] + 2.0, rty, 7.5, txt);
                }
            }
            current_y = bot;
        }

        // 5. ATTACHMENTS
        if include_attachments && !photo_map.is_empty() {
            let (page, layer) = doc.add_page(page_w, page_h, "Photos Continued");
            let mut photo_layer = doc.get_page(page).get_layer(layer);
            let mut py: f32 = 272.0;

            draw_text_centered(
                &photo_layer,
                margin_x,
                content_w,
                py,
                18.0,
                "작업 증빙 자료",
            );
            draw_text_centered(
                &photo_layer,
                margin_x + 0.2,
                content_w,
                py,
                18.0,
                "작업 증빙 자료",
            );
            py -= 15.0;

            let cell_w: f32 = 90.0;
            let cell_h: f32 = 85.0;
            let gap: f32 = 10.0;

            let mut sorted_photos: Vec<_> = photo_map.iter().collect();
            sorted_photos.sort_by_key(|&(_, idx)| idx);

            for chunk in sorted_photos.chunks(2) {
                if py < cell_h + 20.0 {
                    let (npage, nlayer) = doc.add_page(page_w, page_h, "Photos Continued");
                    photo_layer = doc.get_page(npage).get_layer(nlayer);
                    py = 272.0;
                }
                let row_bot = py - cell_h;
                for (sub_idx, (path, &global_idx)) in chunk.iter().enumerate() {
                    let gx = margin_x + (sub_idx as f32 * (cell_w + gap));
                    photo_layer.set_outline_thickness(0.5);
                    draw_rect(&photo_layer, gx, row_bot, cell_w, cell_h);
                    let label = format!("증 {} [현장 기록]", global_idx);
                    draw_text(&photo_layer, gx + 2.0, row_bot + 2.0, 9.0, &label);

                    let img_path = media_dir.join(path);
                    if img_path.exists() {
                        if let Ok(img) = image_crate::open(&img_path) {
                            let scaled = if img.width() > 1024 || img.height() > 768 {
                                img.resize(1024, 768, image_crate::imageops::FilterType::Triangle)
                            } else {
                                img
                            };
                            let pdf_img = Image::from_dynamic_image(&scaled);
                            let mm_w = (scaled.width() as f32 / 300.0) * 25.4;
                            let mm_h = (scaled.height() as f32 / 300.0) * 25.4;
                            let scale = (86.0 / mm_w).min(70.0 / mm_h);
                            let transform = ImageTransform {
                                translate_x: Some(Mm(gx + 2.0)),
                                translate_y: Some(Mm(row_bot + 12.0)),
                                scale_x: Some(scale),
                                scale_y: Some(scale),
                                ..Default::default()
                            };
                            pdf_img.add_to_layer(photo_layer.clone(), transform);
                        }
                    }
                }
                py = row_bot - 8.0;
            }
        }

        let file = File::create(save_path).map_err(|e| MyceliumError::Internal(e.to_string()))?;
        doc.save(&mut BufWriter::new(file))
            .map_err(|e| MyceliumError::Internal(e.to_string()))?;
        Ok::<(), MyceliumError>(())
    })
    .await
    .map_err(|e| MyceliumError::Internal(e.to_string()))??;

    Ok(())
}

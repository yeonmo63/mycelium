#![allow(non_snake_case)]
use crate::commands::config::get_gemini_api_key;
use crate::commands::config::get_naver_keys;
use crate::db::{Customer, DbPool};
use crate::error::{MyceliumError, MyceliumResult};
use serde::{Deserialize, Serialize};
use tauri::{command, AppHandle, State};

#[derive(Debug, Serialize, Deserialize)]
pub struct NaverSearchResult {
    pub items: Vec<NaverItem>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct NaverItem {
    pub title: String,
    pub link: String,
    pub description: String,
    pub bloggername: Option<String>,
    pub postdate: String,
}

#[command]
pub async fn fetch_naver_search(app: AppHandle, query: String) -> MyceliumResult<Vec<NaverItem>> {
    let (client_id, client_secret) = get_naver_keys(&app);

    let url = format!(
        "https://openapi.naver.com/v1/search/blog.json?query={}&display=10&sort=sim",
        urlencoding::encode(&query)
    );

    let client = reqwest::Client::new();
    let res = client
        .get(&url)
        .header("X-Naver-Client-Id", client_id)
        .header("X-Naver-Client-Secret", client_secret)
        .send()
        .await?;

    if !res.status().is_success() {
        return Err(MyceliumError::Internal(format!(
            "Naver API Error: {}",
            res.status()
        )));
    }

    let search_result: NaverSearchResult = res.json().await?;

    Ok(search_result.items)
}

#[command]
pub async fn call_gemini_ai(app: AppHandle, prompt: String) -> MyceliumResult<String> {
    let api_key = get_gemini_api_key(&app).ok_or_else(|| {
        MyceliumError::Internal("Gemini API 키가 설정되지 않았습니다.".to_string())
    })?;
    call_gemini_ai_internal(&api_key, &prompt).await
}

pub async fn call_gemini_ai_internal(api_key: &str, prompt: &str) -> MyceliumResult<String> {
    let clean_key = api_key.trim().trim_matches(|c: char| c == '"' || c == '\'');
    let client = reqwest::Client::new();

    // 1. Dynamic Model Discovery
    let mut models_to_try = Vec::new();

    // Try to fetch available models
    let list_url = format!(
        "https://generativelanguage.googleapis.com/v1beta/models?key={}",
        clean_key
    );

    if let Ok(resp) = client.get(&list_url).send().await {
        if resp.status().is_success() {
            if let Ok(json) = resp.json::<serde_json::Value>().await {
                if let Some(models) = json["models"].as_array() {
                    for model in models {
                        if let Some(name) = model["name"].as_str() {
                            let supported = model["supportedGenerationMethods"]
                                .as_array()
                                .map(|methods| {
                                    methods
                                        .iter()
                                        .any(|m| m.as_str() == Some("generateContent"))
                                })
                                .unwrap_or(false);

                            if supported && name.contains("gemini") {
                                let short_name = name.trim_start_matches("models/");
                                models_to_try.push(("v1beta".to_string(), short_name.to_string()));
                            }
                        }
                    }
                }
            }
        }
    }

    // 2. Fallback / Priority Sorting
    if models_to_try.is_empty() {
        models_to_try = vec![
            ("v1".to_string(), "gemini-1.5-flash".to_string()),
            ("v1beta".to_string(), "gemini-1.5-flash".to_string()),
            ("v1".to_string(), "gemini-1.5-flash-8b".to_string()),
            ("v1beta".to_string(), "gemini-1.5-pro-latest".to_string()),
        ];
    } else {
        models_to_try.sort_by(|a, b| {
            let a_score = if a.1.contains("flash") {
                2
            } else if a.1.contains("pro") {
                1
            } else {
                0
            };
            let b_score = if b.1.contains("flash") {
                2
            } else if b.1.contains("pro") {
                1
            } else {
                0
            };
            b_score.cmp(&a_score)
        });
    }

    let mut errors = Vec::new();

    for (version, model) in models_to_try {
        let url = format!(
            "https://generativelanguage.googleapis.com/{}/models/{}:generateContent?key={}",
            version, model, clean_key
        );

        let body = serde_json::json!({
            "contents": [{ "parts": [{ "text": prompt }] }]
        });

        let resp = match client.post(&url).json(&body).send().await {
            Ok(r) => r,
            Err(e) => {
                errors.push(format!("Network Error ({}): {}", model, e));
                continue;
            }
        };

        if resp.status().is_success() {
            let json: serde_json::Value = resp.json().await.unwrap_or_default();
            if let Some(content) = json["candidates"][0]["content"]["parts"][0]["text"].as_str() {
                let cleaned = content
                    .trim()
                    .trim_start_matches("```json")
                    .trim_start_matches("```")
                    .trim_end_matches("```")
                    .trim();
                return Ok(cleaned.to_string());
            } else {
                errors.push(format!("Empty response from {}", model));
            }
        } else {
            let status = resp.status();
            let error_text = resp.text().await.unwrap_or_default();

            if status == reqwest::StatusCode::TOO_MANY_REQUESTS {
                return Err(MyceliumError::Internal("AI_QUOTA_EXCEEDED: Gemini AI 사용 한도를 초과했습니다.\n\n일일 무료 한도가 소진되었거나, 분당 요청 제한에 도달했습니다. 잠시 후 다시 시도하거나, API 키 설정에서 유료 플랜으로 업그레이드하세요.".to_string()));
            }

            if status == reqwest::StatusCode::FORBIDDEN {
                if error_text.contains("quota")
                    || error_text.contains("limit")
                    || error_text.contains("exceeded")
                {
                    return Err(MyceliumError::Internal("AI_QUOTA_EXCEEDED: Gemini AI 할당량이 초과되었습니다.\n\nAPI 키의 사용 한도가 소진되었습니다. Google AI Studio에서 사용량을 확인하거나, 새로운 API 키를 발급받으세요.".to_string()));
                }
            }

            errors.push(format!(
                "API Error ({}): {} - {}",
                model, status, error_text
            ));

            if status == reqwest::StatusCode::TOO_MANY_REQUESTS {
                break;
            }
        }
    }

    Err(MyceliumError::Internal(format!(
        "AI 모델 연결 실패:\n{}",
        errors.join("\n")
    )))
}

#[derive(Serialize, Deserialize, Debug)]
pub struct ParsedBusinessCard {
    pub name: Option<String>,
    pub mobile: Option<String>,
    pub phone: Option<String>,
    pub email: Option<String>,
    pub company: Option<String>,
    pub job_title: Option<String>,
    pub address: Option<String>,
    pub memo: Option<String>,
}

pub async fn call_gemini_vision_ai(
    api_key: &str,
    prompt: &str,
    image_base64: &str,
    mime_type: &str,
) -> MyceliumResult<String> {
    let clean_key = api_key.trim().trim_matches(|c: char| c == '"' || c == '\'');
    let client = reqwest::Client::new();

    let mut models_to_try = Vec::new();
    let list_url = format!(
        "https://generativelanguage.googleapis.com/v1beta/models?key={}",
        clean_key
    );

    if let Ok(resp) = client.get(&list_url).send().await {
        if resp.status().is_success() {
            if let Ok(json) = resp.json::<serde_json::Value>().await {
                if let Some(models) = json["models"].as_array() {
                    for model in models {
                        if let Some(name) = model["name"].as_str() {
                            let supported = model["supportedGenerationMethods"]
                                .as_array()
                                .map(|methods| {
                                    methods
                                        .iter()
                                        .any(|m| m.as_str() == Some("generateContent"))
                                })
                                .unwrap_or(false);

                            if supported && name.contains("gemini") {
                                let short_name = name.trim_start_matches("models/");
                                if short_name.contains("flash") || short_name.contains("pro") {
                                    models_to_try
                                        .push(("v1beta".to_string(), short_name.to_string()));
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    if models_to_try.is_empty() {
        models_to_try = vec![
            ("v1".to_string(), "gemini-1.5-flash".to_string()),
            ("v1beta".to_string(), "gemini-1.5-flash".to_string()),
            ("v1".to_string(), "gemini-1.5-flash-8b".to_string()),
            ("v1beta".to_string(), "gemini-1.5-pro-latest".to_string()),
        ];
    } else {
        models_to_try.sort_by(|a, b| {
            let get_score = |m: &str| {
                if m.contains("1.5-flash") && !m.contains("8b") {
                    10
                } else if m.contains("1.5-flash-8b") {
                    8
                } else if m.contains("2.0-flash") && !m.contains("exp") {
                    7
                } else if m.contains("pro") {
                    5
                } else if m.contains("exp") {
                    1
                } else {
                    3
                }
            };
            get_score(&b.1).cmp(&get_score(&a.1))
        });
    }

    let mut errors = Vec::new();

    for (version, model) in models_to_try {
        let url = format!(
            "https://generativelanguage.googleapis.com/{}/models/{}:generateContent?key={}",
            version, model, clean_key
        );

        let body = serde_json::json!({
            "contents": [{
                "parts": [
                    { "text": prompt },
                    {
                        "inline_data": {
                            "mime_type": mime_type,
                            "data": image_base64
                        }
                    }
                ]
            }]
        });

        let resp = match client.post(&url).json(&body).send().await {
            Ok(r) => r,
            Err(e) => {
                errors.push(format!("Network Error ({}): {}", model, e));
                continue;
            }
        };

        if resp.status().is_success() {
            let json: serde_json::Value = resp.json().await?;
            if let Some(content) = json["candidates"][0]["content"]["parts"][0]["text"].as_str() {
                let cleaned = content
                    .trim()
                    .trim_start_matches("```json")
                    .trim_start_matches("```")
                    .trim_end_matches("```")
                    .trim();
                return Ok(cleaned.to_string());
            } else {
                errors.push(format!("Empty response from {}", model));
            }
        } else {
            let status = resp.status();
            let error_text = resp.text().await.unwrap_or_default();
            errors.push(format!(
                "API Error ({}): {} - {}",
                model, status, error_text
            ));
            continue;
        }
    }

    Err(MyceliumError::Internal(format!(
        "AI 연결 실패:\n{}",
        errors.join("\n")
    )))
}

#[command]
pub async fn parse_business_card_ai(
    app: AppHandle,
    image_base64: String,
    mime_type: String,
) -> MyceliumResult<ParsedBusinessCard> {
    let api_key = get_gemini_api_key(&app).ok_or_else(|| {
        MyceliumError::Internal("Gemini API 키가 설정되지 않았습니다.".to_string())
    })?;

    let prompt = "
    Analyze this business card image.
    Extract: name, mobile (010-xxxx-xxxx format), phone, email, company, job_title, address.
    Put everything else useful in 'memo'.
    Return JSON only with keys: name, mobile, phone, email, company, job_title, address, memo.
    Use null for missing fields.
    ";

    let json_str = call_gemini_vision_ai(&api_key, prompt, &image_base64, &mime_type).await?;

    let result: ParsedBusinessCard = serde_json::from_str(&json_str)?;

    Ok(result)
}

#[command]
pub async fn test_gemini_connection(_app: AppHandle) -> MyceliumResult<String> {
    Ok("Connection OK".to_string())
}

#[command]
pub async fn get_ai_behavior_strategy(
    _state: State<'_, DbPool>,
    _customer_id: Option<String>,
) -> MyceliumResult<String> {
    Ok("Behavior Strategy Stub".to_string())
}

#[command]
pub async fn analyze_online_sentiment(_state: State<'_, DbPool>) -> MyceliumResult<String> {
    Ok("Sentiment Analysis Stub".to_string())
}

#[command]
pub async fn get_morning_briefing(
    app: AppHandle,
    state: State<'_, DbPool>,
) -> MyceliumResult<String> {
    let api_key = get_gemini_api_key(&app).ok_or_else(|| {
        MyceliumError::Internal("Gemini API 키가 설정되지 않았습니다.".to_string())
    })?;

    let today = chrono::Local::now().date_naive();
    let yesterday = today - chrono::Duration::days(1);

    // 1. Fetch Stats
    let stats: (Option<i64>, Option<i64>, Option<i64>, Option<i64>) = sqlx::query_as(
        r#"
        SELECT 
            (SELECT CAST(SUM(total_amount) AS BIGINT) FROM sales WHERE order_date = $1 AND status != '취소') as yesterday_sales,
            (SELECT COUNT(*) FROM sales WHERE order_date = $1 AND status != '취소') as yesterday_orders,
            (SELECT COUNT(*) FROM products WHERE stock_quantity <= safety_stock) as low_stock_count,
            (SELECT COUNT(*) FROM experience_reservations WHERE reservation_date = $2 AND status != '취소') as today_experiences
        "#,
    )
    .bind(yesterday)
    .bind(today)
    .fetch_one(&*state)
    .await?;

    // 2. Fetch Pending Consultations
    let pending_consults: (i64,) =
        sqlx::query_as("SELECT COUNT(*) FROM consultations WHERE status IN ('접수', '처리중')")
            .fetch_one(&*state)
            .await?;

    let context = format!(
        "날짜: {}\n어제( {} ) 실적: 매출 {}원, 주문 {}건\n현재 재고 부족 품목: {}건\n오늘({} ) 예정된 체험: {}건\n미처리 고객 상담: {}건",
        today,
        yesterday,
        stats.0.unwrap_or(0).to_string(),
        stats.1.unwrap_or(0).to_string(),
        stats.2.unwrap_or(0).to_string(),
        today,
        stats.3.unwrap_or(0).to_string(),
        pending_consults.0
    );

    let prompt = format!(
        "당신은 스마트 농장 'Mycelium'의 운영 비서입니다. 아래의 오늘의 핵심 운영 데이터를 보고, 사장님이 기분 좋게 하루를 시작할 수 있도록 긍정적이고 전략적인 '일일 브리핑'을 5줄 이내로 작성해 주세요.\n\n\
        {}\n\n\
        [작성 지침]\n\
        1. 첫 문장은 날씨나 요일에 어울리는 따뜻한 인사로 시작하세요.\n\
        2. 어제의 실적을 가볍게 칭찬하고, 오늘 가장 먼저 확인해야 할 사항(재고나 예약 등)을 콕 집어주세요.\n\
        3. 활기차고 신뢰감 있는 한국어로 작성하세요.\n\
        4. HTML 태그를 사용하지 말고 순수 텍스트로만 작성하세요 (프론트엔드에서 처리함).",
        context
    );

    call_gemini_ai_internal(&api_key, &prompt).await
}

#[command]
pub async fn get_ai_repurchase_analysis(_state: State<'_, DbPool>) -> MyceliumResult<String> {
    Ok("Repurchase Analysis Stub".to_string())
}

#[command]
pub async fn get_weather_marketing_advice(_state: State<'_, DbPool>) -> MyceliumResult<String> {
    Ok("Weather Advice Stub".to_string())
}

#[command]
pub async fn get_consultation_briefing(
    app: AppHandle,
    state: State<'_, DbPool>,
    customer_id: String,
) -> MyceliumResult<String> {
    let api_key = get_gemini_api_key(&app)
        .ok_or_else(|| MyceliumError::Internal("Gemini API 키가 필요합니다.".to_string()))?;

    let customer: Option<Customer> =
        sqlx::query_as("SELECT * FROM customers WHERE customer_id = $1")
            .bind(&customer_id)
            .fetch_optional(&*state)
            .await?;

    let c = customer
        .ok_or_else(|| MyceliumError::Validation("고객 정보를 찾을 수 없습니다.".to_string()))?;

    let history: Vec<crate::db::Consultation> = sqlx::query_as(
        "SELECT * FROM consultations WHERE customer_id = $1 ORDER BY consult_date DESC LIMIT 30",
    )
    .bind(&customer_id)
    .fetch_all(&*state)
    .await?;

    if history.is_empty() {
        return Ok("이전 상담 내역이 없는 신규 고객입니다.".to_string());
    }

    let mut context_str = format!(
        "고객명: {} ({})\n상담 내역:\n",
        c.customer_name,
        c.membership_level.unwrap_or_default()
    );
    for h in history {
        context_str.push_str(&format!(
            "- [{} / {}] 제목: {} | 내용: {} | 답변: {}\n",
            h.consult_date,
            h.category,
            h.title,
            h.content,
            h.answer.unwrap_or_default()
        ));
    }

    let prompt = format!(
        "당신은 스마트 농장의 전문 상담 관리자입니다. 아래의 고객 상담 이력을 바탕으로, 상담원이 전화를 걸기 전 읽어야 할 '핵심 브리핑'을 3줄 내외로 요약해 주세요. 이 고객의 성향, 과거 주요 문의, 주의사항을 포함해야 합니다. 한국어로 정중하게 작성하세요.\n\n\
        {}\n\n\
        **브리핑:**",
        context_str
    );

    call_gemini_ai_internal(&api_key, &prompt).await
}

#[command]
pub async fn get_pending_consultations_summary(
    app: AppHandle,
    state: State<'_, DbPool>,
) -> MyceliumResult<String> {
    let api_key = get_gemini_api_key(&app).ok_or_else(|| {
        MyceliumError::Internal("Gemini API 키가 설정되지 않았습니다.".to_string())
    })?;

    let pending: Vec<crate::db::Consultation> = sqlx::query_as(
        "SELECT * FROM consultations WHERE status != '완료' ORDER BY consult_date DESC LIMIT 50",
    )
    .fetch_all(&*state)
    .await?;

    if pending.is_empty() {
        return Ok("현재 처리 대기 중인 상담이 없습니다. 평화로운 하루입니다! 😊".to_string());
    }

    let mut context = String::new();
    for p in pending {
        context.push_str(&format!(
            "- [{} / {}] 우선순위: {} | 제목: {} | 내용: {}\n",
            p.consult_date, p.category, p.priority, p.title, p.content
        ));
    }

    let prompt = format!(
        "당신은 스마트 농장의 고객 관리 전략가입니다. 아래의 '처리 대기 중인 상담 리스트'를 보고 사장님을 위한 1분 요약 브리핑을 작성해 주세요.\n\n\
        [대기 리스트]\n\
        {}\n\n\
        [작성 지침]\n\
        1. 현재 가장 시급한 상담 테마가 무엇인지(예: 배송 지연, 상품 불만 등) 파악하여 상단에 명시하세요.\n\
        2. 전체적인 상담 감정 상태가 어떤지 요약하세요.\n\
        3. 사장님이 오늘 가장 먼저 챙겨야 할 핵심 액션 플랜을 1~2개 제안하세요.\n\
        4. HTML 형식으로 깔끔하게 작성하세요 (div, p, ul, li, span 등 사용, 💡 이모지 활용).\n\
        5. 정중하고 활기찬 한국어를 사용하세요.",
        context
    );

    call_gemini_ai_internal(&api_key, &prompt).await
}

#[command]
pub async fn get_ai_marketing_proposal(_state: State<'_, DbPool>) -> MyceliumResult<String> {
    Ok("AI Marketing Proposal Stub".to_string())
}

#[command]
pub async fn get_ai_detailed_plan(
    _state: State<'_, DbPool>,
    _plan_type: String,
) -> MyceliumResult<String> {
    Ok("AI Detailed Plan Stub".to_string())
}

#[command]
pub async fn get_consultation_ai_advisor(
    _state: State<'_, DbPool>,
    _consultation_id: i32,
) -> MyceliumResult<String> {
    Ok("Consultation Advisor Stub".to_string())
}

#[command]
pub async fn get_ai_consultation_advice(
    _state: State<'_, DbPool>,
    _consultation_id: i32,
) -> MyceliumResult<String> {
    Ok("Consultation Advice Stub".to_string())
}

#[command]
pub async fn get_ai_demand_forecast(_state: State<'_, DbPool>) -> MyceliumResult<String> {
    Ok("Demand Forecast Stub".to_string())
}

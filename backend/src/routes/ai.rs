use crate::commands;
use crate::state::AppState;
use axum::{
    routing::{get, post},
    Router,
};

pub fn router() -> Router<AppState> {
    Router::new()
        .route(
            "/api/crm/ai/briefing",
            get(commands::ai::get_consultation_briefing_axum),
        )
        .route(
            "/api/crm/ai/summary",
            get(commands::ai::get_pending_consultations_summary_axum),
        )
        .route(
            "/api/crm/ai/advisor",
            post(commands::ai::get_consultation_ai_advisor_axum),
        )
        .route(
            "/api/ai/business-card",
            post(commands::ai::parse_business_card_ai_axum),
        )
        .route("/api/ai/gemini", post(commands::ai::call_gemini_ai_axum))
        .route(
            "/api/ai/forecast",
            post(commands::ai::get_ai_demand_forecast_axum),
        )
        .route(
            "/api/ai/marketing-proposal",
            post(commands::ai::get_ai_marketing_proposal_axum),
        )
        .route(
            "/api/ai/detailed-plan",
            post(commands::ai::get_ai_detailed_plan_axum),
        )
        .route(
            "/api/ai/behavior",
            get(commands::ai::get_ai_behavior_strategy_axum),
        )
        .route(
            "/api/ai/repurchase",
            get(commands::ai::get_ai_repurchase_analysis_axum),
        )
        .route(
            "/api/ai/naver-search",
            post(commands::ai::fetch_naver_search_axum),
        )
        .route(
            "/api/ai/online-sentiment",
            post(commands::ai::analyze_online_sentiment_axum),
        )
        .route(
            "/api/ai/weather-advice",
            get(commands::ai::get_weather_marketing_advice_axum),
        )
}

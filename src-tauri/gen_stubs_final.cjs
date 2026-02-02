const fs = require('fs');
const filePath = 'src-tauri/src/lib.rs';
const content = fs.readFileSync(filePath, 'utf8');
const lines = content.split(/\r?\n/);

// We want to delete my previously added stubs.
// They started after save_company_info which ended at 7578.
// Actually, let's just find where my stubs start.
let startIndex = lines.findIndex(l => l.includes('pub fn restart_app'));
if (startIndex === -1) startIndex = lines.length;

const keptLines = lines.slice(0, startIndex);

const stubs = `
#[tauri::command]
pub fn restart_app(app: tauri::AppHandle) {
    app.restart();
}

#[tauri::command]
pub async fn get_ai_marketing_proposal(state: tauri::State<'_, DbPool>) -> Result<String, String> {
    Ok("AI Marketing Proposal Stub".to_string())
}

#[tauri::command]
pub async fn get_ai_detailed_plan(state: tauri::State<'_, DbPool>, plan_type: String) -> Result<String, String> {
    Ok("AI Detailed Plan Stub".to_string())
}

#[tauri::command]
pub async fn analyze_online_sentiment(state: tauri::State<'_, DbPool>) -> Result<String, String> {
    Ok("Sentiment Analysis Stub".to_string())
}

#[tauri::command]
pub async fn get_morning_briefing(app: tauri::AppHandle, state: tauri::State<'_, DbPool>) -> Result<String, String> {
    Ok("Morning Briefing Stub".to_string())
}

#[tauri::command]
pub async fn get_ai_behavior_strategy(state: tauri::State<'_, DbPool>, customer_id: String) -> Result<String, String> {
    Ok("Behavior Strategy Stub".to_string())
}

#[tauri::command]
pub async fn get_ai_repurchase_analysis(state: tauri::State<'_, DbPool>) -> Result<String, String> {
    Ok("Repurchase Analysis Stub".to_string())
}

#[tauri::command]
pub async fn get_weather_marketing_advice(state: tauri::State<'_, DbPool>) -> Result<String, String> {
    Ok("Weather Advice Stub".to_string())
}

#[tauri::command]
pub async fn get_consultation_ai_advisor(state: tauri::State<'_, DbPool>, consultation_id: i32) -> Result<String, String> {
    Ok("Consultation Advisor Stub".to_string())
}

#[tauri::command]
pub async fn get_ai_consultation_advice(state: tauri::State<'_, DbPool>, consultation_id: i32) -> Result<String, String> {
    Ok("Consultation Advice Stub".to_string())
}

#[tauri::command]
pub async fn get_ai_demand_forecast(state: tauri::State<'_, DbPool>) -> Result<String, String> {
    Ok("Demand Forecast Stub".to_string())
}

#[tauri::command]
pub async fn login_user(state: tauri::State<'_, DbPool>, username: String, password: String) -> Result<LoginResponse, String> {
    login(state, username, password).await
}

#[tauri::command]
pub async fn get_user_list(state: tauri::State<'_, DbPool>) -> Result<Vec<User>, String> {
    get_all_users(state).await
}

#[tauri::command]
pub async fn search_dormant_customers(state: tauri::State<'_, DbPool>) -> Result<Vec<Customer>, String> {
    Ok(vec![])
}

#[tauri::command]
pub async fn check_duplicate_customer(state: tauri::State<'_, DbPool>, name: String, mobile: String) -> Result<bool, String> {
    Ok(false)
}

#[tauri::command]
pub async fn search_best_customers(state: tauri::State<'_, DbPool>, limit: i32) -> Result<Vec<Customer>, String> {
    Ok(vec![])
}

#[tauri::command]
pub async fn update_customer_membership_batch(state: tauri::State<'_, DbPool>, ids: Vec<String>, level: String) -> Result<(), String> {
    Ok(())
}

#[tauri::command]
pub async fn get_sales_by_customer_id(state: tauri::State<'_, DbPool>, customer_id: String) -> Result<Vec<Sales>, String> {
    Ok(vec![])
}

#[tauri::command]
pub async fn save_general_sales_batch(state: tauri::State<'_, DbPool>, entries: Vec<serde_json::Value>) -> Result<(), String> {
    Ok(())
}

#[tauri::command]
pub async fn get_membership_sales_analysis(state: tauri::State<'_, DbPool>, year: i32) -> Result<serde_json::Value, String> {
    Ok(serde_json::json!([]))
}
`;

fs.writeFileSync(filePath, keptLines.join('\n') + stubs);
console.log("Stubs refilled and duplicates removed.");

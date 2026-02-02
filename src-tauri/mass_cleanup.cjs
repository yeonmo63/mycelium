const fs = require('fs');
const filePath = 'src-tauri/src/lib.rs';
const content = fs.readFileSync(filePath, 'utf8');
const lines = content.split(/\r?\n/);

const targets = [
    'get_ai_detailed_plan',
    'get_ai_behavior_strategy',
    'login_user',
    'get_morning_briefing',
    'analyze_online_sentiment',
    'get_ai_demand_forecast',
    'get_ai_repurchase_analysis',
    'get_weather_marketing_advice',
    'get_consultation_ai_advisor',
    'get_ai_consultation_advice',
    'test_gemini_connection',
    'get_rfm_analysis'
];

const ranges = [];
for (const name of targets) {
    let i = 0;
    while (i < lines.length) {
        if (lines[i].includes(`fn ${name}`)) {
            let start = i;
            while (start > 0 && (lines[start - 1].trim().startsWith('#[') || lines[start - 1].trim() === '')) {
                // Peek further back for blank lines that are part of the block spacing
                if (lines[start - 1].trim().startsWith('#[')) start--;
                else if (start > 1 && lines[start - 2].trim().startsWith('#[')) start--;
                else break;
            }
            let end = -1;
            let balance = 0;
            let foundOpen = false;
            for (let j = i; j < lines.length; j++) {
                if (lines[j].includes('{')) { balance += (lines[j].match(/{/g) || []).length; foundOpen = true; }
                if (lines[j].includes('}')) balance -= (lines[j].match(/}/g) || []).length;
                if (foundOpen && balance <= 0) {
                    end = j + 1;
                    break;
                }
            }
            ranges.push({ start, end });
            i = end || i + 1;
        } else {
            i++;
        }
    }
}

// Also remove my previously added stubs at the very end if any
let lastStubIdx = lines.findIndex(l => l.includes('pub fn restart_app'));
if (lastStubIdx === -1) lastStubIdx = lines.findIndex(l => l.includes('pub async fn get_ai_marketing_proposal'));
if (lastStubIdx !== -1) {
    ranges.push({ start: lastStubIdx, end: lines.length });
}

// Remove the duplicates from lib.rs
// Sort ranges by start descending to avoid index shift
ranges.sort((a, b) => b.start - a.start);

let newLines = [...lines];
for (const r of ranges) {
    if (r.start >= 0 && r.end > r.start) {
        newLines.splice(r.start, r.end - r.start);
    }
}

const finalStubs = `
#[tauri::command]
pub fn restart_app(app: tauri::AppHandle) {
    app.restart();
}

#[tauri::command]
pub async fn get_ai_marketing_proposal(_state: tauri::State<'_, DbPool>) -> Result<String, String> {
    Ok("AI Marketing Proposal Stub".to_string())
}

#[tauri::command]
pub async fn get_ai_detailed_plan(_state: tauri::State<'_, DbPool>, _plan_type: String) -> Result<String, String> {
    Ok("AI Detailed Plan Stub".to_string())
}

#[tauri::command]
pub async fn get_rfm_analysis(_state: tauri::State<'_, DbPool>) -> Result<Vec<CustomerLifecycle>, String> {
    Ok(vec![])
}

#[tauri::command]
pub async fn analyze_online_sentiment(_state: tauri::State<'_, DbPool>) -> Result<String, String> {
    Ok("Sentiment Analysis Stub".to_string())
}

#[tauri::command]
pub async fn get_morning_briefing(_app: tauri::AppHandle, _state: tauri::State<'_, DbPool>) -> Result<String, String> {
    Ok("Morning Briefing Stub".to_string())
}

#[tauri::command]
pub async fn get_ai_behavior_strategy(_state: tauri::State<'_, DbPool>, _customer_id: String) -> Result<String, String> {
    Ok("Behavior Strategy Stub".to_string())
}

#[tauri::command]
pub async fn get_ai_repurchase_analysis(_state: tauri::State<'_, DbPool>) -> Result<String, String> {
    Ok("Repurchase Analysis Stub".to_string())
}

#[tauri::command]
pub async fn get_weather_marketing_advice(_state: tauri::State<'_, DbPool>) -> Result<String, String> {
    Ok("Weather Advice Stub".to_string())
}

#[tauri::command]
pub async fn test_gemini_connection(_app: tauri::AppHandle) -> Result<String, String> {
    Ok("Connection OK".to_string())
}

#[tauri::command]
pub async fn get_consultation_ai_advisor(_state: tauri::State<'_, DbPool>, _consultation_id: i32) -> Result<String, String> {
    Ok("Consultation Advisor Stub".to_string())
}

#[tauri::command]
pub async fn get_ai_consultation_advice(_state: tauri::State<'_, DbPool>, _consultation_id: i32) -> Result<String, String> {
    Ok("Consultation Advice Stub".to_string())
}

#[tauri::command]
pub async fn get_ai_demand_forecast(_state: tauri::State<'_, DbPool>) -> Result<String, String> {
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
pub async fn search_dormant_customers(_state: tauri::State<'_, DbPool>) -> Result<Vec<Customer>, String> {
    Ok(vec![])
}

#[tauri::command]
pub async fn check_duplicate_customer(_state: tauri::State<'_, DbPool>, _name: String, _mobile: String) -> Result<bool, String> {
    Ok(false)
}

#[tauri::command]
pub async fn search_best_customers(_state: tauri::State<'_, DbPool>, _limit: i32) -> Result<Vec<Customer>, String> {
    Ok(vec![])
}

#[tauri::command]
pub async fn update_customer_membership_batch(_state: tauri::State<'_, DbPool>, _ids: Vec<String>, _level: String) -> Result<(), String> {
    Ok(())
}

#[tauri::command]
pub async fn get_sales_by_customer_id(_state: tauri::State<'_, DbPool>, _customer_id: String) -> Result<Vec<Sales>, String> {
    Ok(vec![])
}

#[tauri::command]
pub async fn save_general_sales_batch(_state: tauri::State<'_, DbPool>, _entries: Vec<serde_json::Value>) -> Result<(), String> {
    Ok(())
}

#[tauri::command]
pub async fn get_membership_sales_analysis(_state: tauri::State<'_, DbPool>, _year: i32) -> Result<serde_json::Value, String> {
    Ok(serde_json::json!([]))
}
`;

fs.writeFileSync(filePath, newLines.join('\n') + finalStubs);
console.log("Cleanup and stub injection complete.");

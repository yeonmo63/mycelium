const fs = require('fs');
const content = fs.readFileSync('src-tauri/src/lib.rs', 'utf8');
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
    'test_gemini_connection'
];

const results = [];

for (const name of targets) {
    let i = 0;
    while (i < lines.length) {
        if (lines[i].includes(`fn ${name}`)) {
            // Find start (including attributes)
            let start = i;
            while (start > 0 && lines[start - 1].includes('#[')) {
                start--;
            }
            // Find end (matching brace)
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
            results.push({ name, start: start + 1, end });
            i = end || i + 1;
        } else {
            i++;
        }
    }
}

console.log(JSON.stringify(results, null, 2));

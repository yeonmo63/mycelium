const fs = require('fs');
const filePath = 'src-tauri/src/lib.rs';
const content = fs.readFileSync(filePath, 'utf8');
const lines = content.split(/\r?\n/);

// Find where save_company_info ends.
// It ends at a line with '}' after 'Ok(())'.
let splitIndex = -1;
for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].includes('fn save_company_info')) {
        // Find the matching '}'
        let balance = 0;
        let foundOpen = false;
        for (let j = i; j < lines.length; j++) {
            if (lines[j].includes('{')) { balance++; foundOpen = true; }
            if (lines[j].includes('}')) balance--;
            if (foundOpen && balance === 0) {
                splitIndex = j + 1;
                break;
            }
        }
        break;
    }
}

if (splitIndex !== -1) {
    const keptLines = lines.slice(0, splitIndex);
    const stubs = `
#[tauri::command]
pub fn restart_app(app: tauri::AppHandle) {
    app.restart();
}

#[tauri::command]
pub async fn get_ai_marketing_proposal(state: tauri::State<'_, DbPool>) -> Result<String, String> {
    Ok("AI Marketing Proposal Stub".to_string())
}
`;
    fs.writeFileSync(filePath, keptLines.join('\n') + stubs);
    console.log("Stubs reset cleanly.");
} else {
    console.log("Could not find save_company_info end.");
}

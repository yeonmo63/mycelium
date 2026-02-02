const fs = require('fs');
const filePath = 'src-tauri/src/lib.rs';
const content = fs.readFileSync(filePath, 'utf8');
const lines = content.split(/\r?\n/);

// Find where my stubs start. They all have 'pub fn' or 'pub async fn' and are at the end.
// Actually, I can just find based on the known starting stub 'pub fn restart_app'.
let startIndex = lines.findIndex(l => l.includes('pub fn restart_app'));
if (startIndex === -1) {
    // try the first one that was added
    startIndex = lines.findIndex(l => l.includes('async fn get_ai_marketing_proposal'));
}

if (startIndex !== -1) {
    const keptLines = lines.slice(0, startIndex);
    fs.writeFileSync(filePath, keptLines.join('\n'));
    console.log("Stubs removed.");
} else {
    console.log("No stubs found to remove.");
}

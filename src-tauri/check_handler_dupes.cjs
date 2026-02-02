const fs = require('fs');
const content = fs.readFileSync('src-tauri/src/lib.rs', 'utf8');
const match = content.match(/tauri::generate_handler!\[([\s\S]+?)\]/);
const commands = match[1].split(',').map(c => c.trim()).filter(c => c && !c.startsWith('//'));
const counts = {};
for (const cmd of commands) {
    counts[cmd] = (counts[cmd] || 0) + 1;
}
const dupes = Object.keys(counts).filter(k => counts[k] > 1);
console.log(dupes);

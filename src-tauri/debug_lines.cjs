const fs = require('fs');
const content = fs.readFileSync('src-tauri/src/lib.rs', 'utf8');
const lines = content.split(/\r?\n/);
const start = 7575;
const end = 7585;
for (let i = start - 1; i < Math.min(end, lines.length); i++) {
    console.log(`${i + 1}: [${lines[i]}]`);
}

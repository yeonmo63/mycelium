const fs = require('fs');
const content = fs.readFileSync('src-tauri/src/lib.rs', 'utf8');
const lines = content.split(/\r?\n/);
const counts = {};
const results = [];

for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(/fn\s+([a-zA-Z0-0_]+)\s*\(/);
    if (match) {
        const name = match[1];
        if (!counts[name]) counts[name] = [];
        counts[name].push(i + 1);
    }
}

for (const name in counts) {
    if (counts[name].length > 1) {
        results.push({ name, lines: counts[name] });
    }
}

console.log(JSON.stringify(results, null, 2));

const fs = require('fs');
const content = fs.readFileSync('src-tauri/src/lib.rs', 'utf8');
const lines = content.split(/\r?\n/);
const counts = {};
const results = [];

for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Match both 'fn name(' and 'pub fn name(' and 'pub async fn name('
    const match = line.match(/(?:pub\s+)?(?:async\s+)?fn\s+([a-zA-Z0-9_]+)\s*\(/);
    if (match) {
        const name = match[1];
        if (!counts[name]) counts[name] = [];
        counts[name].push({ line: i + 1, content: line });
    }
}

for (const name in counts) {
    if (counts[name].length > 1) {
        results.push({ name, occurrences: counts[name] });
    }
}

console.log(JSON.stringify(results, null, 2));

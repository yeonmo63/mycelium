const fs = require('fs');
const filePath = 'src-tauri/src/lib.rs';
const lines = fs.readFileSync(filePath, 'utf8').split('\n');

const start = 1433; // 1-based
const end = 1656;   // 1-based

console.log("--- Lines to be removed (Start) ---");
for (let i = start - 1; i < start + 5 && i < lines.length; i++) {
    console.log(`${i + 1}: ${lines[i]}`);
}
console.log("--- Lines to be removed (End) ---");
for (let i = end - 5; i < end && i < lines.length; i++) {
    console.log(`${i + 1}: ${lines[i]}`);
}

const kept = [];
for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1;
    if (lineNum >= start && lineNum <= end) {
        continue;
    }
    kept.push(lines[i]);
}

// Only write if we see expected content
const firstLine = lines[start - 1].trim();
if (firstLine.startsWith('if old.safety_stock')) {
    fs.writeFileSync(filePath, kept.join('\n'));
    console.log("Cleaned up lib.rs");
} else {
    console.log("Content mismatch, not writing.");
}

const fs = require('fs');
const path = require('path');

const filePath = path.join('src-tauri', 'src', 'lib.rs');

// Ranges are 1-based, inclusive
const ranges = [
    [710, 725],
    [1387, 1471],
    [1479, 2343],
    [2533, 2589]
];

try {
    const data = fs.readFileSync(filePath, 'utf8');
    const lines = data.split(/\r?\n/);
    const linesToKeep = [];

    // 0-indexed line number
    for (let i = 0; i < lines.length; i++) {
        const lineNum = i + 1;
        let keep = true;
        for (const [start, end] of ranges) {
            if (lineNum >= start && lineNum <= end) {
                keep = false;
                break;
            }
        }
        if (keep) {
            linesToKeep.push(lines[i]);
        }
    }

    // Join with original line ending (crlf or lf)
    // We'll use \n for simplicity, Rust handles it.
    // Or preserve original?
    // Let's use \n
    fs.writeFileSync(filePath, linesToKeep.join('\n'));
    console.log("Lines removed successfully.");
} catch (err) {
    console.error(err);
    process.exit(1);
}

const fs = require('fs');
try {
    const data = fs.readFileSync('src-tauri/src/lib.rs', 'utf8');
    const lines = data.split('\n');
    lines.forEach((line, index) => {
        if (line.includes('fn get_dashboard_stats')) {
            console.log(`${index + 1}: ${line.trim()}`);
        }
    });
} catch (err) {
    console.error(err);
}

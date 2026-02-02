const fs = require('fs');
const filePath = process.argv[3] || 'src-tauri/src/lib.rs';
const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
const search = process.argv[2];
for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(search)) {
        console.log(`${i + 1}: ${lines[i]}`);
    }
}

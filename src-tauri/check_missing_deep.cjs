const fs = require('fs');
const path = require('path');

function getFiles(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(file => {
        file = path.resolve(dir, file);
        const stat = fs.statSync(file);
        if (stat && stat.isDirectory()) {
            results = results.concat(getFiles(file));
        } else if (file.endsWith('.rs')) {
            results.push(file);
        }
    });
    return results;
}

const allFiles = getFiles('src-tauri/src');
const allContent = allFiles.map(f => fs.readFileSync(f, 'utf8')).join('\n');

const libContent = fs.readFileSync('src-tauri/src/lib.rs', 'utf8');
const handlerMatch = libContent.match(/tauri::generate_handler!\[([\s\S]+?)\]/);
const commands = handlerMatch[1].split(',').map(c => c.trim()).filter(c => c && !c.startsWith('//'));

const missing = [];
for (const cmd of commands) {
    const regex = new RegExp(`fn\\s+${cmd}\\s*\\(?`);
    if (!regex.test(allContent)) {
        missing.push(cmd);
    }
}

console.log("Missing commands:", missing);

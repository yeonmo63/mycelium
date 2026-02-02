const fs = require('fs');
const filePath = 'src-tauri/src/lib.rs';
const content = fs.readFileSync(filePath, 'utf8');
const lines = content.split(/\r?\n/);

// Find where my stubs start. They are at the end.
// The end of save_company_info is before the stubs.
let splitIndex = -1;
for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].includes('fn save_company_info')) {
        let balance = 0;
        let foundOpen = false;
        for (let j = i; j < lines.length; j++) {
            if (lines[j].includes('{')) { balance += (lines[j].match(/{/g) || []).length; foundOpen = true; }
            if (lines[j].includes('}')) balance -= (lines[j].match(/}/g) || []).length;
            if (foundOpen && balance <= 0) {
                splitIndex = j + 1;
                break;
            }
        }
        break;
    }
}

if (splitIndex !== -1) {
    const finalLines = lines.slice(0, splitIndex);
    fs.writeFileSync(filePath, finalLines.join('\n') + '\n');
    console.log("Stubs removed from lib.rs");
} else {
    console.log("Could not find save_company_info end.");
}

const fs = require('fs');

const libPath = 'src-tauri/src/lib.rs';
const productPath = 'src-tauri/src/commands/product.rs';
const customerPath = 'src-tauri/src/commands/customer.rs';

const libContent = fs.readFileSync(libPath, 'utf8');
const productContent = fs.readFileSync(productPath, 'utf8');
const customerContent = fs.readFileSync(customerPath, 'utf8');

const allContent = libContent + productContent + customerContent;

// Extract commands from lib.rs handler
const handlerMatch = libContent.match(/tauri::generate_handler!\[([\s\S]+?)\]/);
if (!handlerMatch) {
    console.log("Could not find generate_handler!");
    process.exit(1);
}

const commands = handlerMatch[1].split(',').map(c => c.trim()).filter(c => c && !c.startsWith('//'));

const missing = [];
for (const cmd of commands) {
    // Check for fn cmd( or fn __cmd__cmd( or pub fn cmd(
    const regex = new RegExp(`fn\\s+${cmd}\\s*\\(?`);
    if (!regex.test(allContent)) {
        missing.push(cmd);
    }
}

console.log("Missing commands:", missing);

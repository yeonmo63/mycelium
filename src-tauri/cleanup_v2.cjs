const fs = require('fs');
const filePath = 'src-tauri/src/lib.rs';
const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);

const funcsToRemove = [
    "update_product_stock",
    "convert_stock",
    "adjust_product_stock",
    "get_inventory_logs",
    "get_product_list",
    "get_discontinued_product_names",
    "consolidate_products",
    "create_product",
    "update_product", // It was partially deleted but maybe exists fully elsewhere?
    "discontinue_product", // Maybe exists fully?
    "delete_product", // Maybe exists fully?
    "hard_delete_product", // Maybe exists fully?
    "get_product_price_history",
    "get_product_history",
    "get_inventory_forecast_alerts",
    "get_top_profit_products",
    "get_top3_products_by_qty",
    "get_product_monthly_analysis",
    "get_product_10yr_sales_stats",
    "get_product_sales_stats",
    "get_product_associations"
];

const rangesToRemove = [];

for (const func of funcsToRemove) {
    // Search for function definition
    let found = false;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.includes(`fn ${func}(`)) {
            // Found start
            let start = i;
            // Backtrack for attributes
            while (start > 0) {
                const prev = lines[start - 1].trim();
                if (prev.startsWith('#[') || prev.startsWith('///')) {
                    start--;
                } else if (prev === '') {
                    // maybe include one empty line
                    start--;
                    break;
                } else {
                    break;
                }
            }

            // Find end
            let end = i;
            let braceCount = 0;
            let foundOpen = false;
            for (let j = i; j < lines.length; j++) {
                if (lines[j].includes('{')) {
                    const matches = lines[j].match(/{/g);
                    if (matches) braceCount += matches.length;
                    foundOpen = true;
                }
                if (lines[j].includes('}')) {
                    const matches = lines[j].match(/}/g);
                    if (matches) braceCount -= matches.length;
                }

                if (foundOpen && braceCount === 0) {
                    end = j;
                    break;
                }
            }

            console.log(`Found ${func} at ${start + 1}-${end + 1}`);
            rangesToRemove.push({ start, end });
            // Do not break here because there might be multiple (like the duplicates error we saw)
            // But usually we only want to remove all occurrences to be safe?
            // Yes, remove ALL occurrences.
        }
    }
}

// Merge ranges or just simple filter
const keptLines = [];
for (let i = 0; i < lines.length; i++) {
    let remove = false;
    for (const r of rangesToRemove) {
        if (i >= r.start && i <= r.end) {
            remove = true;
            break;
        }
    }
    if (!remove) {
        keptLines.push(lines[i]);
    }
}

fs.writeFileSync(filePath, keptLines.join('\n'));
console.log("Cleanup complete.");

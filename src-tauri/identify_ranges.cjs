const fs = require('fs');

const funcsToRemove = [
    "get_product_list",
    "get_discontinued_product_names",
    "consolidate_products",
    "get_user_list",
    "create_product",
    "update_product",
    "discontinue_product",
    "delete_product",
    "hard_delete_product",
    "get_product_price_history",
    "get_product_history",
    "update_product_stock",
    "convert_stock",
    "adjust_product_stock",
    "get_inventory_logs",
    "get_inventory_forecast_alerts",
    "get_top_profit_products",
    "get_top3_products_by_qty",
    "get_product_monthly_analysis",
    "get_product_10yr_sales_stats",
    "get_product_sales_stats",
    "get_product_associations"
];

const file = 'src-tauri/src/lib.rs';
const content = fs.readFileSync(file, 'utf8');
const lines = content.split('\n');

const ranges = [];

funcsToRemove.forEach(func => {
    // Regex to find "async fn func_name" or "fn func_name"
    // And we also want to capture the preceding #[tauri::command]

    // We iterate to find the line.
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.includes(`fn ${func}(`)) {
            // Found function definition.
            let start = i;

            // Look backward for attributes like #[tauri::command] or docs
            // Simple heuristic: if line above is #[tauri::command] or starts with # or ///
            let check = i - 1;
            while (check >= 0) {
                const l = lines[check].trim();
                if (l === '#[tauri::command]' || l.startsWith('///') || l.startsWith('#[')) {
                    start = check;
                    check--;
                } else if (l === '') {
                    // Include one empty line before?
                    // If multiple empty lines, maybe just takes one.
                    // Let's stop if empty.
                    break;
                } else {
                    break;
                }
            }

            // Find end of function
            // Simple brace counting
            let end = i;
            let braceCount = 0;
            let foundOpen = false;

            for (let j = i; j < lines.length; j++) {
                const l = lines[j];
                for (let char of l) {
                    if (char === '{') {
                        braceCount++;
                        foundOpen = true;
                    }
                    if (char === '}') {
                        braceCount--;
                    }
                }

                if (foundOpen && braceCount === 0) {
                    end = j;
                    break;
                }
            }

            console.log(`${func}: ${start + 1} - ${end + 1}`);
            ranges.push({ start: start + 1, end: end + 1 });
            break; // Move to next function
        }
    }
});
